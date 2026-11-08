import assert from 'node:assert/strict';
import * as Astronomy from 'astronomy-engine';
import {
  lunarObservation,
  lunarFeatureState,
  lunarEvents,
  LUNAR_MIN_TIME,
  LUNAR_MAX_TIME,
} from '../src/lunar-math.js';
import { MOON_RADIUS } from '../src/moon-math.js';
import { dot, norm, cross, sub } from '../src/orbit.js';

const observer = { latitude: 39.9, longitude: 116.4, height: 50 };
const close = (actual, expected, tolerance, label) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual}, expected ${expected} ± ${tolerance}`
  );
const angleDifference = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// Independent NASA SVS 2026 reference samples (geocentric, not topocentric).
// https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005587/mooninfo_2026.json
// date, distance km, lit %, sub-Earth lon/lat, sub-Solar lon/lat.
const references = [
  ['2026-01-01T00:00Z', 361045, 91.4, -1.279, -6.556, 32.52, -1.346],
  ['2026-04-01T14:00Z', 391869, 99.69, 4.297, 3.146, 10.264, 0.911],
  ['2026-07-01T14:00Z', 402635, 97.65, -3.311, 3.761, -20.787, 1.272],
  ['2026-10-01T16:00Z', 369315, 71.2, -0.429, -6.47, -65.287, -1.0],
];
for (const [iso, distance, phase, earthLon, earthLat, solarLon, solarLat] of references) {
  const o = lunarObservation(new Date(iso), observer);
  close(o.earthDistanceKm, distance, 100, 'NASA distance');
  close(o.geocentricIlluminatedFraction * 100, phase, 0.04, 'NASA illuminated percent');
  close(o.subEarth.longitude, earthLon, 0.04, 'NASA sub-Earth longitude');
  close(o.subEarth.latitude, earthLat, 0.04, 'NASA sub-Earth latitude');
  close(o.subSolar.longitude, solarLon, 0.04, 'NASA sub-Solar longitude');
  close(o.subSolar.latitude, solarLat, 0.04, 'NASA sub-Solar latitude');
}

// Daily frame handedness, north-up, illumination and near/far hemisphere geometry.
for (let day = 0; day < 366; day += 3) {
  const o = lunarObservation(Date.UTC(2026, 0, 1) + day * 86400000, observer);
  for (const axis of [...o.axes, o.observerDirectionBody, o.sunDirectionBody, o.upDirectionBody])
    close(norm(axis), 1, 1e-12, 'unit vector');
  close(norm(sub(cross(o.axes[0], o.axes[1]), o.axes[2])), 0, 1e-12, 'right-handed frame');
  close(
    dot(o.upDirectionBody, o.observerDirectionBody),
    0,
    1e-12,
    'north-up perpendicular to sight'
  );
  assert.ok(o.angularDiameterDeg > 0.47 && o.angularDiameterDeg < 0.58);
  assert.ok(o.illuminatedFraction >= 0 && o.illuminatedFraction <= 1);
  assert.ok(Math.abs(o.subEarth.longitude) < 9 && Math.abs(o.subEarth.latitude) < 8);
  const facing = lunarFeatureState(o, o.subObserver);
  assert.equal(facing.visible, true);
  close(facing.emissionAngleDeg, 0, 0.000002, 'disk centre emission');
  const back = {
    longitude: ((o.subObserver.longitude + 360) % 360) - 180,
    latitude: -o.subObserver.latitude,
  };
  assert.equal(lunarFeatureState(o, back).visible, false);
  const solar = lunarFeatureState(o, o.subSolar);
  close(solar.solarAltitudeDeg, 90, 0.000002, 'sub-Solar noon');
}

// Actual ground location changes diurnal libration and apparent diameter, not body axes.
const first = lunarObservation(Date.UTC(2026, 0, 1), observer);
const opposite = lunarObservation(Date.UTC(2026, 0, 1), { latitude: -39.9, longitude: -63.6 });
assert.deepEqual(first.axes, opposite.axes);
assert.ok(norm(sub(first.observerDirectionBody, opposite.observerDirectionBody)) > 0.02);
assert.ok(Math.abs(first.distanceKm - opposite.distanceKm) > 1000);
assert.ok(Math.abs(first.subObserver.latitude - first.subEarth.latitude) > 0.5);
assert.deepEqual(lunarObservation(new Date(first.timeMs), observer), first);

// Finite-distance limb: the spherical tangent is arccos(R / distance), not 90°.
const synthetic = {
  observerPositionBodyKm: [10 * MOON_RADIUS, 0, 0],
  sunPositionBodyKm: [0, 1e8, 0],
};
const limb = (Math.acos(0.1) * 180) / Math.PI;
assert.equal(lunarFeatureState(synthetic, { longitude: limb - 0.01, latitude: 0 }).visible, true);
assert.equal(lunarFeatureState(synthetic, { longitude: limb + 0.01, latitude: 0 }).visible, false);
assert.equal(lunarFeatureState(synthetic, { longitude: 45, latitude: 0 }).sunlit, true);
assert.equal(lunarFeatureState(synthetic, { longitude: -45, latitude: 0 }).sunlit, false);

const events = lunarEvents(first.timeMs, observer);
assert.deepEqual(
  events.phases.map((p) => p.phase),
  [2, 3, 0, 1]
);
assert.equal(events.phases.length, 4);
for (let i = 0; i < events.phases.length; i++) {
  const p = events.phases[i];
  assert.ok(p.timeMs > (i ? events.phases[i - 1].timeMs : first.timeMs));
  assert.ok(p.timeMs <= first.timeMs + 35 * 86400000);
  assert.ok(angleDifference(Astronomy.MoonPhase(new Date(p.timeMs)), p.phase * 90) < 0.002);
}
// Check rise/set by independent bracketing of centre altitude around the upper-limb threshold.
for (const [timeMs, direction] of [
  [events.riseTimeMs, 1],
  [events.setTimeMs, -1],
]) {
  assert.ok(timeMs >= first.timeMs && timeMs <= events.endTimeMs);
  const before = lunarObservation(timeMs - 120000, observer).geometricAltitudeDeg;
  const after = lunarObservation(timeMs + 120000, observer).geometricAltitudeDeg;
  assert.ok(direction * (after - before) > 0.1);
  const at = lunarObservation(timeMs, observer);
  assert.ok(at.geometricAltitudeDeg < -0.5 && at.geometricAltitudeDeg > -1.2);
}
assert.ok(events.transitAltitudeDeg > 70);
const polar = lunarEvents(first.timeMs, { latitude: 90, longitude: 0 });
assert.equal(polar.riseTimeMs, null);
assert.equal(polar.setTimeMs, null);
assert.ok(Number.isFinite(polar.transitTimeMs));
const end = lunarEvents(LUNAR_MAX_TIME, observer);
assert.deepEqual(end.phases, []);
assert.equal(end.riseTimeMs, null);
assert.equal(end.setTimeMs, null);
assert.equal(end.transitTimeMs, null);
for (const height of [-500, 10000])
  assert.ok(
    Number.isFinite(lunarEvents(first.timeMs, { latitude: 0, longitude: 0, height }).riseTimeMs)
  );
assert.ok(Number.isFinite(lunarObservation(LUNAR_MIN_TIME, observer).distanceKm));
assert.ok(Number.isFinite(lunarObservation(LUNAR_MAX_TIME, observer).distanceKm));
for (const invalid of [
  NaN,
  Infinity,
  null,
  '2026-01-01',
  new Date('invalid'),
  LUNAR_MIN_TIME - 1,
  LUNAR_MAX_TIME + 1,
])
  assert.throws(() => lunarObservation(invalid, observer), RangeError);
for (const invalid of [
  { latitude: 91, longitude: 0 },
  { latitude: 0, longitude: 181 },
  { latitude: 0, longitude: 0, height: NaN },
  { latitude: 0, longitude: 0, height: 10001 },
])
  assert.throws(() => lunarObservation(first.timeMs, invalid), RangeError);
assert.throws(() => lunarEvents(first.timeMs, observer, { limitDays: 0 }), RangeError);
assert.throws(() => lunarFeatureState(first, { longitude: 0, latitude: 91 }), RangeError);
console.log(
  'Lunar math: NASA reference geometry, frame orientation, diurnal parallax, finite-distance limb, rise/set, phases and limits passed.'
);
