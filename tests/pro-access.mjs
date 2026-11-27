import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAccess, siteInertialKm } from '../src/pro/access.js';
import { initialOrbit } from '../src/pro/mission.js';
import { createPropagator } from '../src/pro/orbit-propagation.js';
import { dot, earthAxes, norm, sub, sunPosition } from '../src/orbit.js';

const epoch = Date.UTC(2026, 10, 25),
  deg = Math.PI / 180,
  radius = 6378.137;
const site = { name: 'Equator', latDeg: 0, lonDeg: 0, heightM: 0 };
const observation = {
  target: site,
  station: site,
  maxOffNadirDeg: 38,
  minSunElevationDeg: -90,
  minStationElevationDeg: 12,
  settlingSec: 8,
  cadenceSec: 20,
  exposureSec: 3,
};
const close = (result, expected, tolerance) =>
  assert.ok(
    Math.abs(result - expected) <= tolerance,
    'received ' + result + ', expected ' + expected + ' within ' + tolerance
  );
close(norm(siteInertialKm(site, epoch)), radius, 1e-9);
close(
  norm(siteInertialKm({ ...site, latDeg: 90, heightM: 340 }, epoch)),
  6356.752314245 + 0.34,
  1e-8
);
const axis = earthAxes(epoch)[0];
for (const [i, v] of siteInertialKm(site, epoch).entries()) close(v, axis[i] * radius, 1e-9);

// Exactly known equatorial relative motion in the Earth-fixed frame. The orbit
// radius and angular rate set the analytical mask and pointing intersections.
const rate = 0.00113,
  alt = 550,
  rs = radius + alt,
  center = 741.345;
const state = (t, c = center) => [
  ...siteInertialKm(
    { ...site, lonDeg: (rate * (t - c)) / deg, heightM: alt * 1000 },
    epoch + t * 1000
  ),
  0,
  0,
  0,
];
function sampleArc(duration, step, callback, configuration = observation) {
  const rows = Array.from({ length: duration / step + 1 }, (_, i) => callback(i * step));
  return buildAccess(rows, step, epoch, configuration, callback);
}
function coneHalf(angleDeg) {
  const a = angleDeg * deg;
  return (Math.asin((rs / radius) * Math.sin(a)) - a) / rate;
}
const stationHalf = (Math.acos((radius / rs) * Math.cos(12 * deg)) - 12 * deg) / rate;
const nominal = sampleArc(1500, 10, state);
assert.equal(nominal.targetWindows.length, 1);
assert.equal(nominal.stationWindows.length, 1);
for (const [w, half] of [
  [nominal.targetWindows[0], coneHalf(38)],
  [nominal.stationWindows[0], stationHalf],
]) {
  close(w.startSec, center - half, 0.0011);
  close(w.endSec, center + half, 0.0011);
  close(w.peakSec, center, 0.0011);
  close(w.peakElevationDeg, 90, 0.00015);
}
for (const [i, o] of nominal.opportunities.entries()) {
  assert.equal(o.id, i + 1);
  assert.equal(o.windowIndex, 0);
  close(o.startSec, nominal.targetWindows[0].startSec + 8 + i * 20, 1e-12);
  assert.equal(o.endSec - o.startSec, 3);
  assert.ok(o.endSec <= nominal.targetWindows[0].endSec);
}

// The same equatorial pass crossing ±180° has the same geometric windows.
// Both longitude spellings must work for sites on the antimeridian.
const dateline = sampleArc(
  1500,
  10,
  (t) => {
    const lonDeg = ((360 + (rate * (t - center)) / deg) % 360) - 180;
    return [...siteInertialKm({ ...site, lonDeg, heightM: alt * 1000 }, epoch + t * 1000), 0, 0, 0];
  },
  { ...observation, target: { ...site, lonDeg: 180 }, station: { ...site, lonDeg: -180 } }
);
for (const key of ['targetWindows', 'stationWindows']) {
  assert.equal(dateline[key].length, 1);
  close(dateline[key][0].startSec, nominal[key][0].startSec, 0.001);
  close(dateline[key][0].endSec, nominal[key][0].endSec, 0.001);
}

const shortObs = {
  ...observation,
  maxOffNadirDeg: 0.02,
  settlingSec: 0,
  exposureSec: 0.01,
  cadenceSec: 0.02,
};
for (const c of [0.3145, 15.391, 99.687]) {
  const q = sampleArc(100, 10, (t) => state(t, c), shortObs);
  assert.equal(q.targetWindows.length, 1);
  close(q.targetWindows[0].startSec, c - coneHalf(0.02), 0.0011);
  close(q.targetWindows[0].endSec, c + coneHalf(0.02), 0.0011);
  assert.equal(q.opportunities.length, 3);
}
// A contact wholly at an isolated geometric tangency has no exposure or contact interval.
const tangent = sampleArc(1500, 10, state, {
  ...observation,
  maxOffNadirDeg: 0,
  minStationElevationDeg: 90,
});
assert.equal(tangent.targetWindows.length, 0);
assert.equal(tangent.stationWindows.length, 0);
const limb = sampleArc(1500, 10, state, {
  ...observation,
  maxOffNadirDeg: 90,
  minStationElevationDeg: 0,
});
const horizonHalf = Math.acos(radius / rs) / rate;
close(limb.targetWindows[0].startSec, center - horizonHalf, 0.0011);
close(limb.targetWindows[0].endSec, center + horizonHalf, 0.0011);
assert.deepEqual(limb.targetWindows, limb.stationWindows);
const clipped = sampleArc(100, 10, (t) => state(t, 0));
assert.equal(clipped.targetWindows[0].startSec, 0);
assert.equal(clipped.stationWindows[0].endSec, 100);
const behind = (t) => [
  ...siteInertialKm({ ...site, lonDeg: 180, heightM: alt * 1000 }, epoch + t * 1000),
  0,
  0,
  0,
];
assert.deepEqual(sampleArc(120, 10, behind), {
  targetWindows: [],
  stationWindows: [],
  opportunities: [],
});
const noLight = sampleArc(1500, 10, state, { ...observation, minSunElevationDeg: 90 });
assert.deepEqual(noLight.targetWindows, []);
assert.deepEqual(noLight.stationWindows, nominal.stationWindows);
assert.deepEqual(sampleArc(0, 10, state), {
  targetWindows: [],
  stationWindows: [],
  opportunities: [],
});
assert.throws(() => sampleArc(100, 10, state, { ...observation, cadenceSec: 2 }), /observation/);
assert.throws(() => sampleArc(10, 5, () => [NaN, 2, 3, 0, 0, 0]), /observation/);

// Two close, discontinuous OEM boundaries enclose a visible arc between every
// coarse scan knot. A continuous positional join must preserve the settling clock.
const overhead = (t) => [
  ...siteInertialKm({ ...site, heightM: alt * 1000 }, epoch + t * 1000),
  0,
  0,
  0,
];
const jump = (t) => (t >= 17.25 && t < 17.625 ? overhead(t) : behind(t));
jump.segmentBreaksSec = [17.625, 17.25, 17.25];
const brief = sampleArc(50, 10, jump, {
  ...observation,
  exposureSec: 0.125,
  cadenceSec: 0.125,
  settlingSec: 0.025,
});
for (const w of [brief.targetWindows[0], brief.stationWindows[0]]) {
  assert.equal(w.startSec, 17.25);
  assert.equal(w.endSec, 17.625);
}
assert.equal(brief.opportunities.length, 2);
overhead.segmentBreaksSec = [19];
const continuous = sampleArc(50, 10, overhead);
assert.equal(continuous.targetWindows.length, 1);
assert.equal(continuous.targetWindows[0].endSec, 50);
assert.deepEqual(
  continuous.opportunities.map((o) => o.startSec),
  [8, 28]
);

// Store an independent DOP853 orbit, IAU 2006/2000A Earth rotation, WGS84 geodetic
// and ERFA heliocentric Earth reference in a small fixture. The JS regression is offline.
const ref = JSON.parse(
  readFileSync(new URL('./reference/pro-access.json', import.meta.url), 'utf8')
);
function missionOrbit(step) {
  const propagator = createPropagator({ gravity: 'j2', epochMs: epoch });
  const orbit = [initialOrbit(ref.orbit)];
  for (let t = 0; t < 86400; t += step) {
    const mid = propagator.advance(orbit.at(-1), t, step / 2);
    orbit.push(propagator.advance(mid, t + step / 2, step / 2));
  }
  return orbit;
}
function errors(a, b) {
  let maxBoundarySec = 0,
    maxPeakSec = 0,
    maxElevationDeg = 0;
  for (const key of ['targetWindows', 'stationWindows']) {
    assert.equal(a[key].length, b[key].length);
    for (const [i, w] of a[key].entries()) {
      const refWin = b[key][i];
      maxBoundarySec = Math.max(
        maxBoundarySec,
        Math.abs(w.startSec - refWin.startSec),
        Math.abs(w.endSec - refWin.endSec)
      );
      maxPeakSec = Math.max(maxPeakSec, Math.abs(w.peakSec - refWin.peakSec));
      maxElevationDeg = Math.max(
        maxElevationDeg,
        Math.abs(w.peakElevationDeg - refWin.peakElevationDeg)
      );
    }
  }
  return { maxBoundarySec, maxPeakSec, maxElevationDeg };
}
const cases = [];
let step5Orbit;
for (const step of [2, 5, 10]) {
  const orbit = missionOrbit(step);
  const sampled = buildAccess(orbit, step, epoch, ref.observation);
  assert.equal(sampled.targetWindows.length, 2);
  assert.equal(sampled.stationWindows.length, 3);
  assert.equal(sampled.opportunities.length, ref.baseline.opportunityCount);
  const delta = errors(sampled, ref.baseline);
  assert.ok(
    delta.maxBoundarySec < 0.004 && delta.maxPeakSec < 0.006 && delta.maxElevationDeg < 0.0002,
    JSON.stringify(delta)
  );
  cases.push(sampled);
  if (step === 5) step5Orbit = orbit;
}
const limited = buildAccess(step5Orbit, 5, epoch, {
  ...ref.observation,
  minSunElevationDeg: ref.solarCutDeg,
});
const solarError = errors(limited, ref.solarLimited);
assert.equal(limited.opportunities.length, ref.solarLimited.opportunityCount);
assert.ok(
  solarError.maxBoundarySec < 0.1 &&
    solarError.maxPeakSec < 0.006 &&
    solarError.maxElevationDeg < 0.0002,
  JSON.stringify(solarError)
);

// The Sun rises above the selected mask 0.15 s before the spacecraft leaves its
// pointing cone. Both neighbouring 5 s samples fail the combined conditions.
const nearSet = cases[1].targetWindows[0].endSec - 0.15;
const utc = epoch + nearSet * 1000,
  loc = ref.observation.target;
const ground = siteInertialKm(loc, utc);
const up = sub(siteInertialKm({ ...loc, heightM: loc.heightM + 1000 }, utc), ground);
const ray = sub(sunPosition(utc), ground),
  solarLimit = Math.asin(dot(ray, up) / norm(up) / norm(ray)) / deg;
const sliver = buildAccess(step5Orbit, 5, epoch, {
  ...ref.observation,
  minSunElevationDeg: solarLimit,
});
assert.equal(sliver.targetWindows.length, 1);
close(sliver.targetWindows[0].startSec, nearSet, 0.002);
close(sliver.targetWindows[0].endSec - sliver.targetWindows[0].startSec, 0.15, 0.002);
assert.equal(sliver.opportunities.length, 0);
const convergence = errors(cases[0], cases[2]);
assert.ok(
  convergence.maxBoundarySec < 0.002 &&
    convergence.maxPeakSec < 0.002 &&
    convergence.maxElevationDeg < 0.00001,
  JSON.stringify(convergence)
);
console.log(
  JSON.stringify({
    reference: 'ERFA / SciPy DOP853',
    targetWindows: 2,
    stationWindows: 3,
    opportunities: 20,
    defaultStep5: errors(cases[1], ref.baseline),
    solarLimitedStep5: solarError,
    step2vs10: convergence,
  })
);
