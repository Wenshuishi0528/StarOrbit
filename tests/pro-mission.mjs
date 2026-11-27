import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  defaultMission,
  validateMission,
  runMission,
  replayAt,
  DAY,
  STEP,
} from '../src/pro/mission.js';

const base = defaultMission(),
  ref = JSON.parse(readFileSync(new URL('./reference/pro-orbit.json', import.meta.url)));
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
let maxPositionM = 0,
  maxVelocityMmS = 0;
for (const c of ref.cases) {
  const input = defaultMission();
  Object.assign(input.spacecraft, c.elements);
  const r = runMission(input);
  ref.timesSec.forEach((sec, i) => {
    const actual = r.orbit[sec / STEP],
      target = c.states[i];
    maxPositionM = Math.max(maxPositionM, 1000 * distance(actual.slice(0, 3), target.slice(0, 3)));
    maxVelocityMmS = Math.max(maxVelocityMmS, 1e6 * distance(actual.slice(3), target.slice(3)));
  });
}
assert(maxPositionM < 0.2 && maxVelocityMmS < 0.2);
const fine = runMission(base, 1),
  run = runMission(base);
const benchmark = defaultMission();
Object.assign(benchmark.spacecraft, { capacityWh: 1000, initialWh: 500 });
let electricalWh = 0,
  thermalC = 0;
runMission(benchmark).plans.forEach((p, i) => {
  const expected = ref.electrothermal[i];
  for (const metric of ['minBatteryWh', 'solarUsedWh'])
    electricalWh = Math.max(electricalWh, Math.abs(p.metrics[metric] - expected[metric]));
  electricalWh = Math.max(electricalWh, Math.abs(p.batteryWh.at(-1) - expected.finalWh));
  thermalC = Math.max(
    thermalC,
    Math.abs(p.metrics.peakBoardC - expected.peakBoardC),
    Math.abs(p.boardC.at(-1) - expected.finalBoardC)
  );
});
assert(electricalWh < 0.06 && thermalC < 0.12);
const deltaBattery = Math.max(
  ...run.plans.map((p, i) => Math.abs(p.metrics.minBatteryWh - fine.plans[i].metrics.minBatteryWh))
);
const deltaPeak = Math.max(
  ...run.plans.map((p, i) => Math.abs(p.metrics.peakBoardC - fine.plans[i].metrics.peakBoardC))
);
assert(deltaBattery < 0.04 && deltaPeak < 0.12);
for (const [i, p] of run.plans.entries()) {
  assert.equal(p.batteryWh.length, DAY / STEP + 1);
  assert(Math.abs(p.metrics.energyResidualWh) < 1e-7);
  assert(p.events.length && p.batteryWh.every((v) => v >= 0 && v <= base.spacecraft.capacityWh));
  for (const e of p.events) {
    const state = replayAt(run, i, e.startSec);
    assert.equal(state.timeSec, e.startSec);
    const violates = (st) =>
      e.kind === 'lowBattery'
        ? st.batteryWh < e.limit
        : e.kind === 'hotBoard'
          ? st.boardC > e.limit
          : st.boardC < e.limit;
    assert(violates(state));
    if (e.startSec > 0) assert(!violates(replayAt(run, i, e.startSec - STEP)));
    if (e.endSec !== null) assert(!violates(replayAt(run, i, e.endSec)));
  }
}
assert.equal(replayAt(run, 0, 1200).payloadOn, true);
assert.equal(replayAt(run, 0, 2100).payloadOn, false);
assert.equal(replayAt(run, 1, DAY).t, Date.parse(base.epochUtc) + DAY * 1000);
const swapped = defaultMission();
swapped.plans.reverse();
assert.deepEqual(runMission(swapped).plans, run.plans.toReversed());
const circular = defaultMission();
circular.gravity = 'twoBody';
const exact = runMission(circular),
  y = exact.orbit[0],
  radius = Math.hypot(...y.slice(0, 3)),
  n = Math.sqrt(398600.4418 / radius ** 3);
const endpoint = y
  .slice(0, 3)
  .map((v, i) => v * Math.cos(n * DAY) + (y[i + 3] * Math.sin(n * DAY)) / n);
assert(distance(exact.orbit.at(-1).slice(0, 3), endpoint) < 0.0002);
const idle = defaultMission();
Object.assign(idle.spacecraft, { initialWh: 60, busW: 0 });
idle.plans.forEach((p) => (p.windows = []));
for (const p of runMission(idle).plans) {
  assert(p.batteryWh.every((e) => e === 60));
  assert.equal(p.metrics.solarUsedWh, 0);
}
const drained = defaultMission();
Object.assign(drained.spacecraft, { initialWh: 0, busW: 150, initialC: 52 });
for (const p of runMission(drained).plans) {
  assert(p.metrics.unservedWh > 1000);
  assert(p.events.some((e) => e.kind === 'lowBattery' && e.startSec === 0 && e.endSec === null));
  assert(Math.abs(p.metrics.energyResidualWh) < 1e-7);
}
for (const change of [
  (m) => (m.schemaVersion = 2),
  (m) => (m.epochUtc = '2026-02-31T00:00:00Z'),
  (m) => (m.spacecraft.arrayM2 = NaN),
  (m) => (m.spacecraft.initialWh = 61),
  (m) => (m.spacecraft.perigeeKm = 1000),
  (m) => (m.spacecraft.coldC = 60),
  (m) => (m.plans[0].windows = [[30, 20]]),
  (m) =>
    (m.plans[0].windows = [
      [0, 60],
      [40, 65],
    ]),
  (m) => m.plans.pop(),
]) {
  const bad = defaultMission();
  change(bad);
  assert.throws(() => validateMission(bad));
}
console.log(
  JSON.stringify(
    {
      maxPositionM,
      maxVelocityMmS,
      independentElectricalWh: electricalWh,
      independentThermalC: thermalC,
      deltaBatteryWh: deltaBattery,
      deltaPeakC: deltaPeak,
      plans: run.plans.map((p) => ({ events: p.events.length, ...p.metrics })),
    },
    null,
    2
  )
);
