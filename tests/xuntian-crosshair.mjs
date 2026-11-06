import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { EARTH_RADIUS, unit } from '../src/orbit.js';
import { geographicVector } from '../src/geography-math.js';
import { cameraAxes, lookDirection } from '../src/xuntian-pointing.js';
import { cityAnchor, createCityFinder, trackGround } from '../src/xuntian-ground-target.js';
import { solarApparent } from '../src/solar-system.js';
import { DEEP_SKY_OBJECTS } from '../src/deep-sky-catalog.js';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/xuntian-crosshair.js', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { identifyXuntianCrosshair: identify, crosshairTolerance: tolerance } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);
const catalog = JSON.parse(
  readFileSync(new URL('../assets/geography/atlas.json', import.meta.url))
).labels;
const stars = JSON.parse(readFileSync(new URL('../assets/stars.json', import.meta.url)));
const finder = createCityFinder(catalog),
  identity = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  D = Math.PI / 180;
const near = (a, b, e = 1e-8) => assert(Math.abs(a - b) < e, `${a} != ${b}`);
const q = { t: Date.UTC(2026, 10, 6), earthAxes: identity, position: [-EARTH_RADIUS - 405, 0, 0] };
const frame = (eyeKm, forward, extra = {}) => ({
  q,
  eyeKm,
  axes: cameraAxes(lookDirection(forward)),
  fovY: 8,
  language: 'zh',
  showStars: true,
  ...extra,
});
const city = finder.get('city:beijing', 'zh'),
  normal = geographicVector(city.longitude, city.latitude, 1),
  eye = normal.map((v) => v * (EARTH_RADIUS + 405));
const cityRay = trackGround(cityAnchor(city), eye, q).direction;
const ground = identify(frame(eye, cityRay), { cityFinder: finder });
assert.equal(ground.kind, 'earth');
near(ground.latitude, city.latitude);
near(ground.longitude, city.longitude);
near(ground.distanceKm, 405);
assert.equal(ground.city.id, 'city:beijing');
const raisedGround = { ...ground, distanceKm: 403, elevationMeters: 2000 };
assert.equal(identify(frame(eye, cityRay), { groundSurface: raisedGround }).elevationMeters, 2000);
assert.notEqual(identify(frame(eye, cityRay), { groundSurface: null }).kind, 'earth',
  'an explicit terrain miss must not be replaced by the old sphere');
assert.equal(identify(frame(eye, cityRay), {
  surface: { kind: 'station', distanceKm: 0.03 }, groundSurface: null,
}).kind, 'station');
near(ground.city.distanceKm, 0, 1e-6);
assert.equal(finder.nearest(city.latitude, city.longitude, 'fr').name, 'Pékin');
assert.equal(
  finder.nearest(0, -140),
  null,
  'an open-ocean ray must not be named after a distant city'
);
assert.equal(finder.nearest(NaN, 0), null);
assert.equal(finder.nearest(91, 0), null);
const across = createCityFinder([
  { kind: 'city', id: 'seam', lat: 0, lon: 179.9, en: 'Seam' },
  { kind: 'city', id: 'far', lat: 0, lon: 170, en: 'Far' },
]);
const seam = across.nearest(0, -179.95, 'en');
assert.equal(seam.id, 'city:seam');
near(seam.distanceKm, EARTH_RADIUS * 0.15 * D, 1e-7);
assert.equal(across.nearest(0, -179.95, 'en', { maxDistanceKm: 10 }), null);
const farEye = eye.map((x) => -x),
  farRay = trackGround(cityAnchor(city), farEye, q).direction;
const hiddenCity = identify(frame(farEye, farRay, { target: 'city:beijing' }), {
  cityFinder: finder,
});
assert.equal(hiddenCity.kind, 'earth');
assert.notEqual(
  hiddenCity.city?.id,
  'city:beijing',
  'selected hidden target must not replace actual foreground'
);
assert(Math.abs(hiddenCity.latitude - city.latitude) > 50);
const station = identify(frame(eye, cityRay), {
  surface: { kind: 'station', distanceKm: 0.03, moduleId: 'TH' },
});
assert.equal(station.kind, 'station');
assert.equal(station.moduleId, 'TH');
assert.equal(
  identify(frame(eye, cityRay), { surface: { kind: 'station', distanceKm: 1000 } }).kind,
  'earth'
);

const vega = stars.find((row) => row[0] === 91262),
  equatorial = (ra, dec) => [
    Math.cos(dec * D) * Math.cos(ra * D),
    Math.cos(dec * D) * Math.sin(ra * D),
    Math.sin(dec * D),
  ];
const starDirection = equatorial(vega[1], vega[2]),
  starEye = starDirection.map((v) => v * (EARTH_RADIUS + 405));
const exact = frame(starEye, starDirection),
  saved = JSON.stringify(exact),
  star = identify(exact, { limitMagnitude: 8 });
assert.equal(star.id, 'hip:91262');
assert.equal(star.name, '织女星');
assert.equal(star.kind, 'star');
assert.equal(JSON.stringify(exact), saved, 'identification must not mutate pointing');
assert.equal(identify({ ...exact, language: 'en' }, { limitMagnitude: 8 }).name, 'Vega');
assert.equal(
  identify(exact, { limitMagnitude: -1 }).kind,
  'sky',
  'stars below the actual exposure limit are not matches'
);
assert.equal(identify({ ...exact, showStars: false }, { limitMagnitude: 8 }).kind, 'sky');
assert.equal(
  identify(exact, { limitMagnitude: 8, blocked: () => true }).kind,
  'sky',
  'a nearby catalogue star hidden by station structure is not a match'
);
assert.equal(
  identify({ ...exact, fovY: 0.006 }, { limitMagnitude: 8 }).id,
  'hip:91262',
  'narrowest field retains exact stellar matches'
);
const offset = equatorial(vega[1] + 0.04, vega[2]);
assert.equal(identify(frame(starEye, offset), { limitMagnitude: 8 }).id, 'hip:91262');
assert.notEqual(
  identify(frame(starEye, offset, { fovY: 0.006 }), { limitMagnitude: 8 }).id,
  'hip:91262',
  'zoom must tighten the angular match'
);
assert(tolerance(2, 300) < tolerance(8, 300));
assert(tolerance(8, 600) < tolerance(8, 300));
near(tolerance(110, 100), 0.5);
assert.equal(tolerance(0, 300), 0);
const occulted = identify(
  frame(
    starEye.map((v) => -v),
    starDirection
  ),
  { limitMagnitude: 8 }
);
assert.equal(occulted.kind, 'earth');

for (const id of [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
]) {
  const geocentric = solarApparent(q, [0, 0, 0]).find((body) => body.id === id);
  const observer = geocentric.direction.map((v) => v * (EARTH_RADIUS + 405));
  const apparent = solarApparent(q, observer).find((body) => body.id === id);
  const result = identify(frame(observer, apparent.direction, { fovY: 0.006 }), {
    limitMagnitude: 12,
  });
  assert.equal(result.id, 'solar:' + id, id);
  assert.equal(result.withinDisc, true, id);
  if (id === 'Moon') {
    const side = unit([apparent.direction[1], -apparent.direction[0], 0]),
      angle = apparent.radiusRad * 0.8;
    const limb = apparent.direction.map((v, i) => v * Math.cos(angle) + side[i] * Math.sin(angle));
    assert.equal(
      identify(frame(observer, limb, { fovY: 0.006 })).id,
      'solar:Moon',
      'resolved disc must match away from its centre'
    );
  }
}
for (const id of ['M1', 'M13', 'M31', 'M40', 'M42', 'M45', 'M57', 'M73', 'NGC7000']) {
  const object = DEEP_SKY_OBJECTS.find((item) => item.id === id),
    observer = object.direction.map((v) => v * (EARTH_RADIUS + 405));
  const result = identify(frame(observer, object.direction, { fovY: 0.006 }));
  assert.equal(
    result.id,
    'deep-sky:' + id.toLowerCase(),
    id + ' centre should identify its catalogue object'
  );
  assert.equal(result.kind, 'deep-sky');
  assert.equal(result.identifier, id);
  assert.equal(result.name, object.name);
}
assert.equal(identify(null).kind, 'unavailable');
assert.equal(identify(frame([NaN, 0, 0], [1, 0, 0])).kind, 'unavailable');
const lmc = DEEP_SKY_OBJECTS.find((item) => item.id === 'LMC'),
  reportedDirection = equatorial(81.75, -69.69);
const reported = frame(
  reportedDirection.map((v) => v * (EARTH_RADIUS + 405)),
  reportedDirection,
  {
    fovY: 0.006,
    showStars: false,
    chartSettings: { deepSkyObjects: true, deepSkyScope: 'featured' },
  }
);
const region = identify(reported);
assert.equal(region.id, 'deep-sky:lmc');
assert.equal(region.withinRegion, true);
assert.equal(region.regionOnly, true);
assert(
  region.angularDistanceDeg > 0.3,
  'identification is an extended region, not a six-pixel center match'
);
assert.equal(identify({ ...reported, chartSettings: { deepSkyObjects: false } }).kind, 'sky');
assert.equal(
  identify({ ...reported, chartSettings: { deepSkyObjects: true, deepSkyScope: 'messier' } }).kind,
  'sky'
);
assert.equal(
  identify(reported, { blocked: () => true }).kind,
  'sky',
  'the actual visible region ray still respects foreground models'
);
assert.equal(identify({ ...reported, eyeKm: reported.eyeKm.map((v) => -v) }).kind, 'earth');
// Even if the catalogue center is behind a model, the visible region is not.
const centerBlocked = (d) => d.every((v, i) => Math.abs(v - lmc.direction[i]) < 1e-10);
assert.equal(identify(reported, { blocked: centerBlocked }).id, 'deep-sky:lmc');
const member = stars.find((s) => s[2] < -68 && s[2] > -71 && s[1] > 80 && s[1] < 84);
assert(member, 'independent HIP member fixture');
const memberDirection = equatorial(member[1], member[2]);
const stellar = identify(
  frame(
    memberDirection.map((v) => v * (EARTH_RADIUS + 405)),
    memberDirection,
    { fovY: 0.006, chartSettings: { deepSkyObjects: true, deepSkyScope: 'featured' } }
  )
);
assert.equal(stellar.kind, 'star');
assert.equal(stellar.id, 'hip:' + member[0]);
assert.equal(
  stellar.region?.id,
  'deep-sky:lmc',
  'actual stellar identification retains the enclosing galaxy as context'
);
const fieldObject = DEEP_SKY_OBJECTS.find((item) => item.id === 'JWST-CARINA-2022');
const imageHit = identify(
  frame(
    fieldObject.direction.map((v) => v * (EARTH_RADIUS + 405)),
    fieldObject.direction,
    { fovY: 0.006, showStars: false }
  )
);
assert.equal(imageHit.id, 'deep-sky:jwst-carina-2022');
assert.equal(imageHit.imageField, true);
assert.equal(imageHit.regionOnly, true);
console.log(
  'Crosshair identification: actual optical entrance, Earth/station occlusion, bounded nearby cities/date-line distance, exposure-aware HIP names, pixel/FOV tolerance, immutable pointing, solar bodies and deep-sky targets passed.'
);
