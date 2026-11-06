import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEEP_SKY_OBJECTS,
  DEEP_SKY_TYPES,
  DEEP_SKY_COORDINATES,
  deepSkyName,
  deepSkyTypeName,
  deepSkyRegionMatch,
} from '../src/deep-sky-catalog.js';
import { equatorial } from '../src/environment-math.js';

const byId = new Map(DEEP_SKY_OBJECTS.map((object) => [object.id, object]));
assert.equal(DEEP_SKY_OBJECTS.length, 12162);
assert.equal(byId.size, DEEP_SKY_OBJECTS.length);
assert.deepEqual(
  DEEP_SKY_OBJECTS.filter((object) => /^M\d+$/.test(object.id)).map((object) => object.id),
  Array.from({ length: 110 }, (_, i) => 'M' + (i + 1))
);
assert.equal(DEEP_SKY_OBJECTS.filter((object) => object.source === 'heasarc-messier').length, 109);
assert.equal(DEEP_SKY_OBJECTS.filter((object) => object.source === 'openngc').length, 12052);
assert.equal(DEEP_SKY_COORDINATES.frame, 'J2000');
assert.equal(DEEP_SKY_COORDINATES.raUnit, 'degree');
for (const object of DEEP_SKY_OBJECTS) {
  assert(Object.hasOwn(DEEP_SKY_TYPES, object.type), object.id + ' type');
  assert(object.name && object.englishName && object.aliases.length);
  assert(object.ra >= 0 && object.ra < 360 && object.dec >= -90 && object.dec <= 90);
  assert(object.direction.every(Number.isFinite));
  assert(Math.abs(Math.hypot(...object.direction) - 1) < 1e-12, object.id + ' unit direction');
  const [x, y, z] = object.direction;
  const ra = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
    dec = (Math.asin(z) * 180) / Math.PI;
  assert(
    Math.abs(ra - object.ra) < 1e-10 && Math.abs(dec - object.dec) < 1e-10,
    object.id + ' degree/hour or axis mismatch'
  );
  assert(object.mag === null || (Number.isFinite(object.mag) && object.mag > 0 && object.mag < 20));
  assert.equal(typeof object.magnitudeUncertain, 'boolean');
  assert(
    object.angularSizeArcmin === null ||
      (object.angularSizeArcmin.length === 2 &&
        object.angularSizeArcmin.every((n) => Number.isFinite(n) && n > 0 && n <= 1200))
  );
  if (object.angularSizeArcmin) assert(object.angularSizeArcmin[0] >= object.angularSizeArcmin[1]);
  assert(
    Object.isFrozen(object) && Object.isFrozen(object.direction) && Object.isFrozen(object.aliases)
  );
}
// Independent prominent-object anchors catch hours/degrees, signs and wrong
// Messier-to-NGC joins. HEASARC's older table positions are rounded; these are
// observing-chart tolerances, not claims of sub-arcsecond source astrometry.
for (const [id, ra, dec] of [
  ['M31', 10.685, 41.269],
  ['M42', 83.82, -5.39],
  ['M45', 56.87, 24.11],
  ['M104', 189.998, -11.623],
  ['M102', 226.623, 55.763],
]) {
  const object = byId.get(id);
  assert(
    Math.abs(object.ra - ra) < 0.2 && Math.abs(object.dec - dec) < 0.15,
    id + ' target location'
  );
}
assert.equal(byId.get('M1').type, 'supernova-remnant');
assert.equal(byId.get('M24').type, 'star-cloud');
assert.equal(byId.get('M40').type, 'double-star');
assert.equal(byId.get('M73').type, 'asterism');
assert.equal(byId.get('M73').mag, null, 'unknown magnitude must not become zero');
assert.equal(byId.get('M73').angularSizeArcmin, null, 'unknown size must not be invented');
assert.equal(byId.get('M17').magnitudeUncertain, true);
assert(byId.get('M102').aliases.includes('NGC 5866'));
assert(
  byId.get('M51').aliases.includes('NGC 5194') && byId.get('M51').aliases.includes('NGC 5195')
);
assert(byId.get('M76').aliases.includes('NGC 650') && byId.get('M76').aliases.includes('NGC 651'));
assert(byId.get('NGC104').dec < -70, 'southern-sky supplement must be present');
assert.equal(
  byId.get('NGC253').mag,
  null,
  'unverified supplement photometry is deliberately omitted'
);
assert.equal(deepSkyName(byId.get('M31'), 'zh'), '仙女座星系');
assert.equal(deepSkyName(byId.get('M31'), 'en'), 'Andromeda Galaxy');
assert.equal(deepSkyName(byId.get('M31'), 'fr'), 'Andromeda Galaxy');
assert.equal(deepSkyTypeName('planetary-nebula', 'zh'), '行星状星云');
assert.equal(deepSkyTypeName('double-star', 'ru'), 'Optical double star');
for (const [id, ra, dec] of [
  ['LMC', 80.89375, -69.756111],
  ['NGC292', 13.186583, -72.828611],
  ['NGC3324', 159.317542, -58.619556],
  ['B33', 85.245833, -2.458333],
]) {
  const object = byId.get(id);
  assert(
    Math.abs(object.ra - ra) < 0.000001 && Math.abs(object.dec - dec) < 0.000001,
    id + ' OpenNGC coordinate fixture'
  );
}
assert(byId.get('NGC292').aliases.includes('SMC'));
assert.equal(
  byId.get('NGC6334').type,
  'nebula',
  'NASA identifies the Cat’s Paw as an active star-forming region, not the upstream SNR misclassification'
);
assert(!byId.has('NGC2244'), 'duplicate NGC2244 belongs to NGC2239');
assert(byId.get('NGC2239').aliases.includes('NGC2244'));
assert(!byId.has('IC1'), 'an optical double star is not silently added to the deep-sky extension');

const lmc = byId.get('LMC'),
  smc = byId.get('NGC292');
const screenshot = deepSkyRegionMatch(lmc, equatorial(81.75, -69.69));
assert(
  screenshot?.withinRegion && !screenshot.nearCenter,
  'the reported LMC view is a verified galaxy region, not its center'
);
function offset(object, bearing, distance) {
  const r = Math.PI / 180,
    ra = object.ra * r,
    dec = object.dec * r,
    angle = distance * r,
    p = bearing * r;
  const east = [-Math.sin(ra), Math.cos(ra), 0],
    north = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  return object.direction.map(
    (v, i) =>
      v * Math.cos(angle) + (north[i] * Math.cos(p) + east[i] * Math.sin(p)) * Math.sin(angle)
  );
}
assert(deepSkyRegionMatch(lmc, offset(lmc, 170, 4.8))?.withinRegion);
assert.equal(
  deepSkyRegionMatch(lmc, offset(lmc, 80, 4.8)),
  null,
  'position angle must not become a major-axis circle'
);
assert(deepSkyRegionMatch(smc, offset(smc, 45, 2))?.withinRegion);
assert.equal(deepSkyRegionMatch(smc, offset(smc, 135, 2)), null);
const noPa = byId.get('NGC1499');
assert.equal(noPa.positionAngleDeg, null);
assert.equal(
  deepSkyRegionMatch(noPa, offset(noPa, 0, 1)),
  null,
  'missing PA cannot justify an arbitrary elongated region'
);
const imageField = byId.get('JWST-CARINA-2022');
assert.equal(imageField.type, 'image-field');
assert.equal(imageField.parentId, 'NGC3324');
assert(deepSkyRegionMatch(imageField, imageField.direction)?.withinRegion);
for (const corner of imageField.footprintDirections)
  assert(
    deepSkyRegionMatch(imageField, corner)?.withinRegion,
    'WCS footprint includes its corners'
  );
assert.equal(
  deepSkyRegionMatch(imageField, equatorial(159.31, -58.62)),
  null,
  'the image’s bounding circle must not claim uncovered corners'
);
const manifest = JSON.parse(
  await readFile(new URL('../assets/sky-detail/manifest.json', import.meta.url))
);
const provider = manifest.providers.find((p) => p.id === imageField.providerId);
assert.equal(imageField.ra, provider.center.raDeg);
assert.equal(imageField.dec, provider.center.decDeg);
assert.equal(imageField.sourceUrl, provider.sourceUrl);
const files = [
  'deep-sky-catalog.js',
  'deep-sky-supplement.js',
  'deep-sky-openngc.js',
  'deep-sky-openngc-data.js',
];
const bytes = (
  await Promise.all(files.map((name) => readFile(new URL('../src/' + name, import.meta.url))))
).reduce((sum, file) => sum + file.length, 0);
assert(bytes < 750000, 'the complete catalogue must remain compact and contain no embedded images');
console.log(
  `Deep-sky catalogue: ${DEEP_SKY_OBJECTS.length} unique objects, all Messier, complete real NGC/IC types, LMC/SMC regions and verified JWST footprint; ${bytes} bytes passed.`
);
