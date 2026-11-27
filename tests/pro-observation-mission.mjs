import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { dot, earthAxes } from '../src/orbit.js';
import {
  defaultMission,
  initialOrbit,
  observationMission,
  runMission,
  replayAt,
  validateMission,
} from '../src/pro/mission.js';
import { parseOem, sampleOem, writeOem } from '../src/pro/oem.js';
import { writeEngineeringCsv, writeObservationCsv } from '../src/pro/products.js';

const near = (a, b, epsilon) => assert.ok(Math.abs(a - b) <= epsilon, `${a} vs ${b} (±${epsilon})`);
const input = observationMission(),
  result = runMission(input),
  [a, b] = result.plans;
assert.deepEqual(validateMission(input), input);
assert.equal(validateMission(defaultMission()).observation, undefined);
assert.throws(() => writeObservationCsv({}), /observationRequired/);
for (const change of [
  (o) => {
    o.target.latDeg = 91;
  },
  (o) => {
    o.station.name = '';
  },
  (o) => {
    o.seed = 0.7;
  },
  (o) => {
    o.exposureSec = o.cadenceSec + 1;
  },
  (o) => {
    o.downlinkMbps = 0;
  },
  (o) => {
    o.usefulKeep = NaN;
  },
  (o) => {
    o.strategies[0].delaySec = -1;
  },
  (o) => {
    o.strategies.pop();
  },
]) {
  const m = structuredClone(input);
  change(m.observation);
  assert.throws(() => validateMission(m), RangeError);
}
const access = result.observationAccess;
assert.deepEqual(
  [access.targetWindows.length, access.stationWindows.length, access.opportunities.length],
  [2, 3, 20]
);
assert.deepEqual(
  [a.observation.metrics.usefulDeliveredCount, b.observation.metrics.usefulDeliveredCount],
  [2, 8]
);
assert.deepEqual(
  a.observation.images.map((x) => x.useful),
  b.observation.images.map((x) => x.useful)
);
assert(b.metrics.minBatteryWh < 30 && a.metrics.minBatteryWh > 30);
assert(
  b.observation.images.some((x) => x.reason === 'noStationAfterReady') &&
    a.observation.images.some((x) => x.status === 'storageOverflow')
);
assert(a.observation.images.some((x) => x.transferSegments.length > 1));
const fine = runMission(input, 1);
for (const [i, plan] of result.plans.entries()) {
  const m = plan.observation.metrics;
  near(m.generatedMB, m.overflowMB + m.filterFreedMB + m.sentMB + m.finalStoredMB, 1e-7);
  near(plan.metrics.energyResidualWh, 0, 1e-8);
  near(plan.metrics.minBatteryWh, fine.plans[i].metrics.minBatteryWh, 0.001);
  near(plan.metrics.peakBoardC, fine.plans[i].metrics.peakBoardC, 0.01);
  for (const key of ['camera', 'processor', 'radio']) {
    const samples = plan.observationSamples[key + 'W'];
    assert.equal(samples.length, result.orbit.length);
    near((samples.reduce((v, w) => v + w, 0) * result.stepSeconds) / 3600, m[key + 'Wh'], 1e-9);
    assert.equal(samples.at(-1), 0);
  }
  const count = plan.observation.images.filter((x) => x.useful && x.deliveredSec !== null).length;
  assert.equal(count, m.usefulDeliveredCount);
  assert.equal(count, fine.plans[i].observation.metrics.usefulDeliveredCount);
  assert(
    plan.observationSamples.storedMB.every(
      (x) => x >= -1e-9 && x <= input.observation.storeMB + 1e-9
    )
  );
  assert.equal(plan.observationSamples.storedMB.at(-1), m.finalStoredMB);
}
// A grid point near a full-frame write or a compressed product can represent
// the opposite side of the jump. Downlink bytes leave continuously.
const firstImage = b.observation.images[0],
  storeAt = (t) => replayAt(result, 1, t, { exactOrbit: true }).observation.storedMB;
near(storeAt(firstImage.captureEndSec - 0.001), 0, 1e-10);
near(storeAt(firstImage.captureEndSec), 32, 1e-10);
near(storeAt(firstImage.processEndSec - 0.001), 32, 1e-10);
near(storeAt(firstImage.processEndSec), 11.2, 1e-10);
const firstTransmission = firstImage.transferSegments[0].startSec;
near(
  storeAt(firstTransmission) - storeAt(firstTransmission + 3.75),
  (3.75 * input.observation.downlinkMbps) / 8,
  1e-10
);
for (const run of result.plans) {
  const knots = run.observation.storageKnots;
  assert(
    knots.every(
      ([sec, stored, slope], i) => (i === 0 || sec > knots[i - 1][0]) && stored >= 0 && slope <= 0
    )
  );
  assert.deepEqual(knots.at(-1), [86400, run.observation.metrics.finalStoredMB, 0]);
}
const swapped = structuredClone(input);
swapped.observation.strategies.reverse();
const swappedRun = runMission(swapped);
assert.deepEqual(swappedRun.plans[0], b);
assert.deepEqual(swappedRun.plans[1], a);

// Losing power during an exposure must invalidate the image, even when the
// battery subsequently recovers above its limit before the next 5 s sample.
const pulse = structuredClone(input);
const pos = initialOrbit(pulse.spacecraft).slice(0, 3);
const fixed = earthAxes(Date.parse(pulse.epochUtc)).map((axis) => dot(pos, axis));
Object.assign(pulse.observation.target, {
  latDeg: (Math.atan2(fixed[2], Math.hypot(fixed[0], fixed[1])) * 180) / Math.PI,
  lonDeg: (Math.atan2(fixed[1], fixed[0]) * 180) / Math.PI,
  heightM: 0,
});
Object.assign(pulse.spacecraft, {
  busW: 0,
  capacityWh: 1,
  initialWh: 0.006,
  reserveWh: 0.004,
  chargeEff: 1,
  dischargeEff: 1,
});
Object.assign(pulse.observation, {
  minSunElevationDeg: -90,
  settlingSec: 1,
  exposureSec: 3,
  cadenceSec: 600,
  cameraW: 200,
});
const short = runMission(pulse),
  p = short.plans[0],
  image = p.observation.images[0],
  event = p.events.find((e) => e.kind === 'lowBattery');
assert(p.batteryWh[0] > 0.004 && p.batteryWh[1] > 0.004);
assert.equal(p.metrics.minBatteryWh, 0);
assert(
  event.startSec > 1 &&
    event.endSec < 5 &&
    image.captureStopSec > event.startSec &&
    image.captureStopSec < event.endSec
);
assert.equal(image.status, 'capturePower');
assert.equal(image.sentMB, 0);
for (const t of [event.startSec, event.endSec])
  near(replayAt(short, 0, t, { exactOrbit: true }).batteryWh, 0.004, 1e-11);
near(replayAt(short, 0, image.captureStopSec, { exactOrbit: true }).batteryWh, 0, 1e-12);
const independentAvailable = short.plans[0].batteryKnots[0][1] - pulse.spacecraft.initialWh;
near((image.captureStopSec - 1) * (200 / 3600 - independentAvailable), p.batteryKnots[0][1], 1e-10);

const oem = writeOem(result),
  reference = parseOem(oem);
const replay = runMission({
  ...input,
  trajectory: { mode: 'oemReplay', name: 'loopback.oem', oemText: oem },
});
assert.equal(replay.observationAccess.opportunities.length, 20);
const at = replay.observationAccess.opportunities[0].startSec;
const state = replayAt(replay, 0, at, { exactOrbit: true });
assert.equal(state.timeSec, at);
assert.equal(state.sampleSec, Math.round(at / 5) * 5);
assert.deepEqual(state.env.position, sampleOem(reference, state.t).slice(0, 3));
near(state.timeSec, access.opportunities[0].startSec, 0.002);

const rows = writeObservationCsv(result)
  .trimEnd()
  .split('\r\n')
  .map((s) => s.split(','));
const header = rows.shift(),
  col = (name) => header.indexOf(name);
assert(rows.every((row) => row.length === header.length));
assert.equal(rows.filter((row) => row[col('stage')] === 'disposition').length, 40);
assert.equal(rows.filter((row) => row[col('stage')] === 'delivered').length, 10);
for (const plan of ['A', 'B']) {
  const transferred = rows
    .filter((row) => row[0] === plan && row[col('stage')] === 'downlink')
    .reduce((v, row) => v + Number(row[col('transferred_MB')]), 0);
  near(transferred, result.plans[plan === 'A' ? 0 : 1].observation.metrics.sentMB, 1e-10);
}
const csv = writeEngineeringCsv(result).trimEnd().split('\r\n');
const index = csv[0].split(',').indexOf('b_processor_active_W');
assert(index >= 0 && csv.length === 17282);
const k = b.observationSamples.processorW.findIndex((w) => w > 0);
near(Number(csv[k + 1].split(',')[index]), b.observationSamples.processorW[k], 1e-10);
const temporary = mkdtempSync(join(tmpdir(), 'starorbit-lake-'));
try {
  const missionPath = join(temporary, 'example.json'),
    productPath = join(temporary, 'images.csv');
  const cli = (...args) =>
    execFileSync(process.execPath, ['scripts/pro-mission.mjs', ...args], { stdio: 'pipe' });
  cli('--example-lake', missionPath);
  assert.deepEqual(JSON.parse(readFileSync(missionPath)), input);
  cli(missionPath, productPath, '--images');
  assert.equal(readFileSync(productPath, 'utf8'), writeObservationCsv(result));
  const previous = readFileSync(productPath);
  writeFileSync(missionPath, JSON.stringify(defaultMission()));
  assert.throws(() => cli(missionPath, productPath, '--images'));
  assert.deepEqual(readFileSync(productPath), previous);
} finally {
  rmSync(join(temporary, 'example.json'), { force: true });
  rmSync(join(temporary, 'images.csv'), { force: true });
  rmdirSync(temporary);
}
console.log(
  '24 h paired observations, sub-grid battery loss and recovery, authoritative OEM replay, CLI/CSV products and 1 s convergence passed.'
);
