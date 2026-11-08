import assert from 'node:assert/strict';
import * as Astronomy from 'astronomy-engine';
import {
  planetaryObservation,
  planetaryFeatureState,
  planetarySurfaceDirection,
  planetaryCoordinates,
  planetaryMapUV,
  PLANETARY_MIN_TIME,
  PLANETARY_MAX_TIME,
} from '../src/planetary-observation-math.js';
import { solarWorldBodyAxes } from '../src/solar-world-math.js';
import { AU, dot, cross, norm, sub } from '../src/orbit.js';
const site = { latitude: 39.9, longitude: 116.4, height: 50 };
const near = (a, b, t, l) => assert.ok(Math.abs(a - b) < t, `${l}: ${a} vs ${b}`);
const difference = (a, b) => ((a - b + 540) % 360) - 180;
// NASA/JPL Horizons independently retrieved 2026-11-08; DE441/mar099, UTC,
// geocentric, quantities 13,14,15,17,20,24. Horizons planetodetic latitudes must
// be converted to planetocentric before comparison to our spherical map frame.
// https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND=499&EPHEM_TYPE=OBSERVER&CENTER=500%40399&START_TIME=2025-01-16&STOP_TIME=2025-01-17&STEP_SIZE=1%20d&QUANTITIES=13%2C14%2C15%2C17%2C20%2C24&CSV_FORMAT=YES
const ref = planetaryObservation({ time: Date.UTC(2025, 0, 16), site });
near(ref.earthDistanceKm / AU, 0.64358688181095, 0.00003, 'Horizons range AU');
near(ref.angularDiameterArcsec, 14.55173, 0.003, 'Horizons diameter arcsec');
near(difference(ref.centralMeridianWestDeg, 316.444487), 0, 0.04, 'Horizons west central meridian');
const centric = (lat) =>
  (Math.atan(Math.tan((lat * Math.PI) / 180) * (3376.2 / 3396.19) ** 2) * 180) / Math.PI;
near(ref.subEarth.latitude, centric(10.357539), 0.015, 'Horizons sub-Earth latitude');
near(difference(ref.subSolar.longitude, -317.547939), 0, 0.04, 'Horizons solar longitude');
near(ref.subSolar.latitude, centric(12.73991), 0.015, 'Horizons solar latitude');
near(ref.phaseAngleDeg, 2.5932, 0.01, 'Horizons phase angle');
assert.deepEqual(ref.axes, solarWorldBodyAxes('Mars', ref.emissionTimeMs));
assert.ok(ref.lightTimeSeconds > 300 && ref.lightTimeSeconds < 400);
// Longitude decreases at the observer as Mars rotates eastward.
const later = planetaryObservation({ time: ref.timeMs + 3600000, site });
assert.ok(difference(later.subObserver.longitude, ref.subObserver.longitude) < -14);
assert.ok(difference(later.subObserver.longitude, ref.subObserver.longitude) > -15);
for (const body of ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
  for (let month = 0; month < 12; month += 3) {
    const o = planetaryObservation({ body, time: Date.UTC(2026, month, 1), site });
    for (const v of [...o.axes, o.observerDirectionFixed, o.sunDirectionFixed, o.northUpFixed])
      near(norm(v), 1, 1e-12, 'unit');
    near(norm(sub(cross(o.axes[0], o.axes[1]), o.axes[2])), 0, 1e-12, 'right handed');
    near(dot(o.observerDirectionFixed, o.northUpFixed), 0, 1e-12, 'north perpendicular');
    assert.ok(o.illuminatedFraction >= 0 && o.illuminatedFraction <= 1);
    assert.ok(o.angularDiameterArcsec > 0 && o.distanceKm > o.radiusKm);
    assert.equal(planetaryFeatureState(o, o.subObserver).visible, true);
    assert.equal(
      planetaryFeatureState(o, {
        latitude: -o.subObserver.latitude,
        longitude: ((o.subObserver.longitude + 360) % 360) - 180,
      }).visible,
      false
    );
    if (o.subSolar)
      near(planetaryFeatureState(o, o.subSolar).solarAltitudeDeg, 90, 0.00001, 'local noon');
    const eq = Astronomy.Equator(
      body,
      new Date(o.timeMs),
      new Astronomy.Observer(site.latitude, site.longitude, site.height),
      true,
      true
    );
    const h = Astronomy.Horizon(
      new Date(o.timeMs),
      new Astronomy.Observer(site.latitude, site.longitude, site.height),
      eq.ra,
      eq.dec
    );
    near(o.geometricAltitudeDeg, h.altitude, 1e-10, 'horizon');
  }
}
assert.deepEqual(planetaryMapUV({ longitude: -180, latitude: 90 }), [0, 0]);
assert.deepEqual(planetaryMapUV({ longitude: 0, latitude: 0 }), [0.5, 0.5]);
assert.deepEqual(planetaryMapUV({ longitude: 180, latitude: -90 }), [1, 1]);
for (const location of [
  { longitude: -133.8, latitude: 18.65 },
  { longitude: 70, latitude: -42 },
  { longitude: 109.925, latitude: 25.066 },
]) {
  const round = planetaryCoordinates(planetarySurfaceDirection(location));
  near(round.longitude, location.longitude, 1e-10, 'map longitude');
  near(round.latitude, location.latitude, 1e-10, 'map latitude');
}
for (const time of [NaN, PLANETARY_MIN_TIME - 1, PLANETARY_MAX_TIME + 1])
  assert.throws(() => planetaryObservation({ time, site }), RangeError);
for (const invalid of [
  { latitude: 91, longitude: 0 },
  { latitude: 0, longitude: 181 },
  { latitude: 0, longitude: 0, height: Infinity },
])
  assert.throws(() => planetaryObservation({ time: ref.timeMs, site: invalid }), RangeError);
assert.throws(() => planetaryObservation({ body: 'Earth', time: ref.timeMs, site }), RangeError);
console.log(
  'planetary observation: Horizons comparison, phase, rotation, coordinates and units pass'
);
