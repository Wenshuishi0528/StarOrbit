import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createObservationRun } from '../src/pro/observation-run.js';

const base = {
  seed: 123,
  usefulFraction: 1,
  usefulKeep: 1,
  otherKeep: 0,
  rawMB: 10,
  storeMB: 25,
  downlinkMbps: 8,
  cameraW: 4,
  processorW: 3,
  radioW: 6,
  processingSec: 6,
  outputFraction: 0.25,
};
const windows = (rows) => rows.map(([startSec, endSec]) => ({ startSec, endSec }));
function access(ops, stations) {
  return {
    opportunities: windows(ops).map((row, i) => ({ ...row, id: i + 1, windowIndex: 0 })),
    stationWindows: windows(stations),
  };
}
const raw = { mode: 'raw', delaySec: 1 },
  filter = { mode: 'filter', delaySec: 1 };
const always = [[0, Infinity, Infinity, true]];
function close(value, target, eps = 2e-9) {
  assert(Math.abs(value - target) <= eps, `${value} differs from ${target}`);
}
// Split a coarse exterior integration step only for actual events/power changes.
function drive(settings, contacts, strategy, duration, step = 5, power = always) {
  const model = createObservationRun(settings, contacts, strategy);
  let t = 0;
  for (let grid = 0; grid < duration; grid += step) {
    const gridEnd = Math.min(duration, grid + step);
    while (t < gridEnd) {
      const supply = power.find(([start, end]) => start <= t && t < end);
      assert(supply, `missing supply at ${t}`);
      const segment = model.next(t, Math.min(supply[1], gridEnd), supply[2], supply[3]);
      assert(segment.endSec > t);
      close(segment.activeW, segment.cameraW + segment.processorW + segment.radioW);
      assert(segment.activeW <= supply[2] + 1e-10);
      model.advance(segment);
      assert(model.storedMB >= -1e-10 && model.storedMB <= settings.storeMB + 1e-10);
      t = segment.endSec;
    }
  }
  const result = model.finish(t);
  assert.equal(model.finish(t), result);
  const { metrics: m, images } = result;
  close(m.balanceErrorMB, 0);
  close(
    m.finalStoredMB,
    images.reduce((v, im) => v + im.remainingMB, 0)
  );
  close(
    m.sentMB,
    images.reduce((v, im) => v + im.sentMB, 0)
  );
  assert.equal(m.deliveredCount, images.filter((i) => i.deliveredSec !== null).length);
  for (const im of images) {
    close(
      im.sentMB,
      im.transferSegments.reduce((v, s) => v + s.sentMB, 0)
    );
    for (const seg of im.transferSegments) {
      const win = contacts.stationWindows[seg.stationWindowIndex];
      assert(seg.startSec >= win.startSec && seg.endSec <= win.endSec && seg.endSec > seg.startSec);
    }
  }
  return result;
}

// Three raw 10 MB images at 1 MB/s. Image 1 resumes in three contacts; the
// third image enters a 24 MB peak, and 14, 20 and 26 s delivery latencies follow.
const direct = access(
  [
    [0, 2],
    [4, 6],
    [8, 10],
  ],
  [
    [3, 6],
    [7, 13],
    [15, 40],
  ]
);
for (const dt of [0.5, 1, 2, 5, 10]) {
  const { metrics: m, images } = drive(base, direct, raw, 40, dt);
  assert.deepEqual(
    images.map((i) => i.deliveredSec),
    [16, 26, 36]
  );
  assert.deepEqual(
    images[0].transferSegments.map((s) => [s.startSec, s.endSec, s.sentMB, s.stationWindowIndex]),
    [
      [3, 6, 3, 0],
      [7, 13, 6, 1],
      [15, 16, 1, 2],
    ]
  );
  assert.equal(m.generatedMB, 30);
  assert.equal(m.sentMB, 30);
  assert.equal(m.peakStoredMB, 24);
  assert.equal(m.usefulDeliveredCount, 3);
  assert.equal(m.meanLatencySec, 20);
  assert.equal(m.maxLatencySec, 26);
  close(m.cameraWh, 24 / 3600);
  close(m.radioWh, 180 / 3600);
  assert.equal(m.processorWh, 0);
}

// Recorder release at the same instant as exposure completion. Compression
// releases 9 MB before #3 is admitted. The earlier complete #2 overflows.
const filtered = access(
  [
    [0, 2],
    [3, 5],
    [7, 9],
  ],
  [[8, 30]]
);
for (const dt of [1, 2, 5, 10]) {
  const { metrics: m, images } = drive(
    { ...base, rawMB: 12, storeMB: 15 },
    filtered,
    filter,
    30,
    dt
  );
  assert.deepEqual(
    images.map((i) => i.status),
    ['delivered', 'storageOverflow', 'delivered']
  );
  assert.deepEqual(
    images.map((i) => i.deliveredSec),
    [12, null, 19]
  );
  assert.deepEqual(
    images.map((i) => i.processEndSec),
    [9, null, 16]
  );
  assert.equal(images[1].captureEndSec, 5);
  assert.equal(images[1].reason, 'storeFull');
  assert.equal(m.generatedMB, 36);
  assert.equal(m.overflowMB, 12);
  assert.equal(m.filterFreedMB, 18);
  assert.equal(m.peakStoredMB, 15);
  assert.equal(m.sentMB, 6);
  assert.equal(m.capturedCount, 3);
}
// Explicit classifier rejection frees raw data on processing completion.
const discarded = drive({ ...base, usefulKeep: 0 }, access([[0, 1]], [[0, 20]]), filter, 20);
assert.equal(discarded.images[0].status, 'filteredOut');
assert.equal(discarded.images[0].reason, 'filterRejected');
assert.equal(discarded.metrics.filterFreedMB, 10);
assert.equal(discarded.metrics.finalStoredMB, 0);
assert.equal(discarded.metrics.meanUsefulLatencySec, null);

// Analytic brownout: 1 work-second at half duty, then 3 at full duty. After
// processing, 2 MB arrive at half radio rate and the remaining 2 MB arrive in
// a later contact at full rate. Partial deliveries before the cutoff do not count.
const partialPower = [
  [0, 2, 10, true],
  [2, 4, 2, true],
  [4, 7, 0, false],
  [7, 10, 10, true],
  [10, 12, 4, true],
  [12, 20, 10, true],
];
const poweredSettings = {
  ...base,
  rawMB: 8,
  storeMB: 16,
  processorW: 4,
  radioW: 8,
  processingSec: 4,
  outputFraction: 0.5,
  downlinkMbps: 16,
};
const poweredContacts = access(
  [[0, 2]],
  [
    [8, 12],
    [15, 20],
  ]
);
for (const dt of [0.5, 1, 2, 5, 10]) {
  const {
    metrics: m,
    images: [im],
  } = drive(
    poweredSettings,
    poweredContacts,
    { mode: 'filter', delaySec: 0 },
    20,
    dt,
    partialPower
  );
  assert.equal(im.deliveredSec, 16);
  assert.equal(im.latencySec, 14);
  assert.deepEqual(im.processSegments, [
    { startSec: 2, endSec: 4, workSec: 1 },
    { startSec: 7, endSec: 10, workSec: 3 },
  ]);
  assert.deepEqual(
    im.transferSegments.map((s) => [s.startSec, s.endSec, s.sentMB]),
    [
      [10, 12, 2],
      [15, 16, 2],
    ]
  );
  close(m.cameraWh, 8 / 3600);
  close(m.processorWh, 16 / 3600);
  close(m.radioWh, 16 / 3600);
  close(m.unservedDeviceWh, 24 / 3600);
  close(m.processorLimitedSec, 5);
  close(m.radioLimitedSec, 2);
}
const incomplete = drive(
  poweredSettings,
  poweredContacts,
  { mode: 'filter', delaySec: 0 },
  12,
  5,
  partialPower
);
assert.equal(incomplete.images[0].remainingMB, 2);
assert.equal(incomplete.metrics.deliveredCount, 0);
assert.equal(incomplete.images[0].reason, 'radioPowerLimited');
assert.equal(incomplete.images[0].status, 'partialDownlink');

// Camera requires continuous full power. It has first claim on watts, followed by
// the contact-limited radio and the interruptible CPU when all three contend.
const priority = createObservationRun(
  { ...base, processingSec: 1, outputFraction: 1, rawMB: 6, processorW: 4 },
  access(
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    [[0, 30]]
  ),
  { mode: 'filter', delaySec: 0 }
);
let clock = 0;
while (clock < 2) {
  const offer = priority.next(clock, 2);
  priority.advance(offer);
  clock = offer.endSec;
}
const atTwo = priority.next(2, 3, 11);
assert.deepEqual([atTwo.cameraW, atTwo.radioW, atTwo.processorW], [4, 6, 1]);
priority.advance(atTwo, 2.25);
const noCamera = priority.next(2.25, 3, 3);
assert.deepEqual([noCamera.cameraW, noCamera.radioW, noCamera.processorW], [0, 3, 0]);
priority.advance(noCamera);
const aborted = priority.finish().images[2];
assert.equal(aborted.captureStartSec, 2);
assert.equal(aborted.captureStopSec, 2.25);
assert.equal(aborted.captureEndSec, null);
assert.equal(aborted.status, 'capturePower');
const noBus = drive(
  { ...base, cameraW: 0, processorW: 0, radioW: 0 },
  access([[0, 1]], [[0, 5]]),
  raw,
  5,
  1,
  [[0, 5, 0, false]]
);
assert.equal(noBus.metrics.capturedCount, 0);

// Cutoff conditions, no double-count at adjacent station boundaries, equality
// at the final contact vs a link that ends one microsecond too soon.
const decimal = { ...base, rawMB: 0.3, downlinkMbps: 0.8 };
const exact = drive(
  decimal,
  access(
    [[0, 1]],
    [
      [1, 2],
      [2, 4],
    ]
  ),
  { mode: 'raw', delaySec: 0 },
  4,
  0.2
);
close(exact.images[0].deliveredSec, 4, 1e-13);
assert.deepEqual(
  exact.images[0].transferSegments.map((s) => s.stationWindowIndex),
  [0, 1]
);
const short = drive(
  decimal,
  access([[0, 1]], [[1, 3.999999]]),
  { mode: 'raw', delaySec: 0 },
  4,
  0.2
);
assert.equal(short.metrics.deliveredCount, 0);
close(short.images[0].remainingMB, 1e-7, 1e-12);
const early = drive(
  base,
  access(
    [
      [1, 4],
      [8, 10],
    ],
    []
  ),
  raw,
  2
);
assert.deepEqual(
  early.images.map((i) => i.status),
  ['captureIncomplete', 'notReached']
);
assert.deepEqual(
  early.images.map((i) => i.reason),
  ['exposureAtCutoff', 'afterCutoff']
);
const wait = drive(base, access([[0, 2]], []), { mode: 'raw', delaySec: 4 }, 3);
assert.equal(wait.images[0].reason, 'delayAtCutoff');
assert.equal(wait.metrics.finalStoredMB, 10);
const noStation = drive(base, access([[1, 2]], [[0, 1]]), raw, 10);
assert.equal(noStation.images[0].reason, 'noStationAfterReady');
const empty = drive(base, access([], []), raw, 86400, 10);
assert.equal(empty.metrics.opportunityCount, 0);
assert.equal(empty.metrics.meanLatencySec, null);

// Independent watt-second battery with a 2 W platform. A 12 J initial battery
// is exhausted at 2 s by platform+camera, aborting image #1. At 20 s the 6 W
// array restores camera service. Verifies the quote/advance depletion split.
for (const dt of [1, 2, 5, 10]) {
  const model = createObservationRun(
    base,
    access(
      [
        [0, 4],
        [22, 24],
      ],
      []
    ),
    raw
  );
  let t = 0,
    joules = 12;
  while (t < 26) {
    const upper = Math.min(26, t + dt, t < 20 ? 20 : Infinity),
      pv = t < 20 ? 0 : 6,
      baseW = 2;
    const offer = model.next(
      t,
      upper,
      joules > 0 ? Infinity : Math.max(0, pv - baseW),
      joules > 0 || pv >= baseW
    );
    const deficit = baseW + offer.activeW - pv;
    let end = offer.endSec;
    if (deficit > 0 && joules > 0) end = Math.min(end, t + joules / deficit);
    joules = Math.max(0, joules - deficit * (end - t));
    model.advance(offer, end);
    t = end;
  }
  const { images, metrics: m } = model.finish();
  assert.equal(images[0].captureStopSec, 2);
  assert.equal(images[0].status, 'capturePower');
  assert.equal(images[1].captureEndSec, 24);
  assert.equal(m.generatedMB, 10);
  close(m.cameraWh, 16 / 3600);
}

// Independent Python reference with 33 images, six outages, eight contacts
// and separate seed streams for synthetic truth and filter decision.
const ref = JSON.parse(
  readFileSync(new URL('./reference/pro-observation-run.json', import.meta.url))
);
const external = { opportunities: ref.opportunities, stationWindows: windows(ref.stationWindows) };
const lengths = new Set();
const power = [];
let last = 0;
for (const [start, end] of ref.outages) {
  power.push([last, start, Infinity, true], [start, end, 0, false]);
  last = end;
}
power.push([last, ref.durationSec, Infinity, true]);
for (const c of ref.cases) {
  for (const dt of [0.25, 1, 2, 5, 10]) {
    const { images, metrics: m } = drive(
      ref.settings,
      external,
      c.strategy,
      ref.durationSec,
      dt,
      power
    );
    assert.equal(images.length, c.images.length);
    images.forEach((image, i) => {
      const expected = c.images[i];
      for (const [key, value] of Object.entries(expected))
        assert.equal(image[key], value, `${c.strategy.mode} #${i + 1} ${key}`);
      lengths.add(image.status);
    });
    assert.equal(m.peakStoredMB, c.peakStoredMB);
    [m.cameraWh, m.processorWh, m.radioWh].forEach((wh, i) => close(wh, c.energyWh[i]));
  }
}
assert(lengths.size >= 5);
// Fixed seed pairing is independent of strategy, power and available storage.
const drawn = (s, policy) =>
  drive(s, external, policy, ref.durationSec, 10).images.map((i) => [i.useful, i.filterKeep]);
assert.deepEqual(drawn(ref.settings, raw), drawn({ ...ref.settings, storeMB: 0.5 }, filter));
assert.notDeepEqual(
  drawn(ref.settings, raw),
  drawn({ ...ref.settings, seed: ref.settings.seed + 1 }, raw)
);

// Adjacent fractional-second exposures have two equivalent floating-point
// encodings at the boundary. All 50 scheduled full frames must be admitted.
const contiguous = Array.from({ length: 50 }, (_, i) => {
  const start = 123.456 + i * 10.1;
  return [start, start + 10.1];
});
const touching = drive({ ...base, rawMB: 0.01, storeMB: 1 }, access(contiguous, []), raw, 640);
assert.equal(touching.metrics.capturedCount, 50);
close(touching.metrics.cameraActiveSec, 505);

// Full 24 h at the configured cadence floor with extreme data throughput.
// Thousands of integration intervals merge into a bounded per-file trace.
const heavy = {
  ...base,
  seed: 42,
  usefulFraction: 0.7,
  usefulKeep: 0.93,
  otherKeep: 0.15,
  rawMB: 91373.1927461,
  storeMB: 10000000,
  downlinkMbps: 9761.3158,
  outputFraction: 0.457123,
  processingSec: 3.1,
};
const wholeDay = access(
  Array.from({ length: 8640 }, (_, i) => [10 * i, 10 * i + 0.7]),
  [[0, 86400]]
);
for (const strategy of [raw, filter]) {
  const run = createObservationRun(heavy, wholeDay, strategy);
  let t = 0;
  while (t < 86400) {
    const q = run.next(t, Math.min(86400, t + 1));
    run.advance(q);
    t = q.endSec;
  }
  const { images, metrics: m } = run.finish();
  assert.equal(m.capturedCount, 8640);
  assert(Math.abs(m.balanceErrorMB) < 0.000001, 'high-throughput storage balance within 1 byte');
  assert(images.every((i) => i.transferSegments.length <= 1 && i.processSegments.length <= 1));
}

assert.throws(
  () =>
    createObservationRun(
      base,
      access(
        [
          [0, 2],
          [1, 3],
        ],
        []
      ),
      raw
    ),
  /observationAccess/
);
console.log(
  'Observation execution passed analytic power, storage, cutoff, resumable downlink and 66 independent Python image traces at five step sizes.'
);
