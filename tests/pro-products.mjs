import assert from 'node:assert/strict';
import { archivedReference } from '../scripts/pro-reference.mjs';
import { defaultMission, runMission, validateMission, DAY, STEP } from '../src/pro/mission.js';
import { compareOrbit, rtnDisplacement } from '../src/pro/orbit-comparison.js';
import { parseOem, sampleOem, writeOem } from '../src/pro/oem.js';
import { writeEngineeringCsv } from '../src/pro/products.js';

const near = (a, b, tolerance) => assert(Math.abs(a - b) <= tolerance, `${a} vs ${b}`);
const base = defaultMission();
const legacy = structuredClone(base);
delete legacy.trajectory;
delete legacy.forces;
assert.deepEqual(validateMission(legacy), base);
assert.throws(() => validateMission({ ...base, epochUtc: '2016-12-31T04:00:00Z' }), /leapDay/);
assert.equal(
  validateMission({ ...base, epochUtc: '2026-10-19T01:03:45.1Z' }).epochUtc,
  '2026-10-19T01:03:45.100Z'
);

// Include radial velocity: transverse is perpendicular to R, not parallel to velocity.
const ref = [7000, 0, 0, 1, 7.5, 0];
const predicted = [7000.01, -0.02, 0.03, 1, 7.501, 0];
for (const [i, value] of rtnDisplacement(predicted, ref).entries())
  near(value, [10, -20, 30][i], 1e-7);
assert.deepEqual(rtnDisplacement([7000, 0, 0.1], [7000, 0, 0, 0, -7.5, 0]), [0, 0, -100]);
assert.throws(() => rtnDisplacement(predicted, [7000, 0, 0, 1, 0, 0]), /oemFrameDegenerate/);

const epoch = Date.parse(base.epochUtc);
const stamp = (sec) => new Date(epoch + sec * 1000).toISOString();
const refState = (sec) => [7000, sec * 7.5, 0, 0, 7.5, 0];
const segment = (times) =>
  [
    'META_START',
    'OBJECT_NAME = TEST',
    'OBJECT_ID = TEST',
    'CENTER_NAME = EARTH',
    'REF_FRAME = EME2000',
    'TIME_SYSTEM = UTC',
    'START_TIME = ' + stamp(times[0]),
    'STOP_TIME = ' + stamp(times.at(-1)),
    'INTERPOLATION = LINEAR',
    'INTERPOLATION_DEGREE = 1',
    'META_STOP',
    ...times.map((sec) => stamp(sec) + ' ' + refState(sec).join(' ')),
  ].join('\n');
const pieces = [
  'CCSDS_OEM_VERS = 2.0',
  'CREATION_DATE = ' + stamp(0),
  'ORIGINATOR = TEST',
  segment([0, 2.5, 5]),
  segment([12.5, 15, 20]),
].join('\n');
const partial = parseOem(pieces);
const orbit = [0, 5, 10, 15, 20].map((t) => {
  const x = refState(t);
  x[2] = 0.012;
  return x;
});
const metrics = compareOrbit(orbit, 5, epoch, partial, 'partial');
assert.deepEqual(metrics.intervals, [
  [0, 5],
  [12.5, 20],
]);
assert.equal(metrics.count, 4);
assert.equal(metrics.native.count, 6);
assert.equal(metrics.series[2], null);
near(metrics.rmsM, 12, 1e-10);
near(metrics.native.rmsM, 12, 1e-10);
assert.deepEqual(metrics.peakRtnM, [0, 0, 12]);
assert.deepEqual(metrics.peakReferenceKm, refState(0).slice(0, 3));
const short = { ...base, trajectory: { mode: 'oemInitial', name: 'partial.oem', oemText: pieces } };
const restricted = runMission(short, 10);
assert.deepEqual(restricted.orbit[0], refState(0));
assert.equal(restricted.orbitComparison.count, 2);
assert.equal(restricted.orbitComparison.series[3], null);
assert.throws(
  () => runMission({ ...short, trajectory: { ...short.trajectory, mode: 'oemReplay' } }),
  /oemReplayCoverage/
);
assert.throws(() => runMission({ ...short, epochUtc: '2026-11-23T00:00:06Z' }), /oemStartCoverage/);
assert.throws(
  () =>
    runMission({
      ...short,
      epochUtc: '2026-11-25T00:00:00Z',
      trajectory: { ...short.trajectory, mode: 'elements' },
    }),
  /oemNoOverlap/
);

const example = archivedReference(),
  provider = parseOem(example);
const m = {
  ...base,
  epochUtc: new Date(provider.startMs).toISOString(),
  trajectory: { mode: 'oemInitial', name: 'css.oem', oemText: example },
};
const r = runMission(m);
assert.deepEqual(r.orbit[0], sampleOem(provider, provider.startMs));
const c = r.orbitComparison;
assert.equal(c.count, DAY / STEP + 1);
assert.equal(c.native.count, 361);
near(c.rmsM, 2196.5673, 0.05);
near(c.maxM, 3948.4564, 0.05);
assert.equal(c.maxSec, 55630);
near(Math.hypot(...c.peakRtnM), c.maxM, 1e-7);
assert.equal(r.trajectoryInfo.reference.originator, 'BACC');
const emitted = parseOem(writeOem(r));
assert.equal(emitted.originator, 'STARORBIT');
assert.equal(emitted.objectName, 'KJZ');
assert.equal(emitted.rowCount, 1441);
for (const t of [0, 21600, 86400]) {
  const state = sampleOem(emitted, provider.startMs + t * 1000);
  state.forEach((v, i) => near(v, r.orbit[t / STEP][i], 1e-10));
}
const replay = { ...m, trajectory: { ...m.trajectory, mode: 'oemReplay' } };
const direct = runMission(replay);
assert.equal(direct.orbitComparison, null);
assert.equal(direct.trajectoryInfo.appliedForces, null);
assert.equal(direct.trajectoryInfo.appliedGravity, null);
const replayWithForces = runMission({
  ...replay,
  gravity: 'twoBody',
  forces: { ...m.forces, drag: true, srp: true, thirdBody: true },
});
assert.deepEqual(direct.orbit, replayWithForces.orbit);
assert.deepEqual(direct.plans, replayWithForces.plans);
for (const t of [0, 5, 2130, 86400])
  assert.deepEqual(direct.orbit[t / STEP], sampleOem(provider, provider.startMs + t * 1000));
assert(Math.abs(direct.plans[0].metrics.energyResidualWh) < 1e-7);

const csv = writeEngineeringCsv(r).trimEnd().split('\r\n');
const headers = csv[0].split(',');
assert.equal(csv.length, 17282);
assert.equal(new Set(headers).size, headers.length);
for (const idx of [0, c.maxSec / STEP, DAY / STEP]) {
  const cells = csv[idx + 1].split(',');
  assert.equal(cells.length, headers.length);
  assert.equal(cells[0], new Date(provider.startMs + idx * STEP * 1000).toISOString());
  near(Number(cells[headers.indexOf('b_board_degC')]), r.plans[1].boardC[idx], 1e-12);
  near(Number(cells[headers.indexOf('x_km')]), r.orbit[idx][0], 1e-12);
  assert.deepEqual(cells.slice(-3).map(Number), c.series[idx]);
}
const partialCsv = writeEngineeringCsv(restricted).split('\r\n');
assert(partialCsv[2].endsWith(',,,'));
console.log(
  JSON.stringify(
    {
      fiveSecondRmsM: c.rmsM,
      nativeKnots: c.native.count,
      nativeRmsM: c.native.rmsM,
      peakM: c.maxM,
      peakUtc: new Date(provider.startMs + c.maxSec * 1000).toISOString(),
      peakRtnM: c.peakRtnM,
      csvDataRows: csv.length - 1,
    },
    null,
    2
  )
);
