import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({
  stdin: {
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    contents: [
      'export * from "./src/sky-location-math.js"',
      'export * from "./src/sky-object-card.js"',
      'export * from "./src/celestial-crosshair.js"',
      'export { ensureSkyCulture } from "./src/sky-cultures.js"',
      'export { getXuntianTarget } from "./src/xuntian-catalog.js"',
      'export { equatorial } from "./src/environment-math.js"',
    ].join('\n'),
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const {
  rayInView,
  projectRay,
  skyAngles,
  localRegion,
  westernRegion,
  frameOutline,
  northUpBasis,
  ensureSkyCulture,
  celestialCard,
  objectTarget,
  identifyCelestialCrosshair,
  getXuntianTarget,
  equatorial,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);
const close = (a, b) => assert(Math.abs(a - b) < 1e-7);
const vega = getXuntianTarget('hip:91262');
assert.equal(westernRegion(vega.direction).id, 'Lyr');
for (const [ra, dec] of [
  [0, 0],
  [359.999, 89.99],
  [0.001, -89.99],
  [180, 0],
]) {
  const axes = northUpBasis(ra, dec),
    eye = { ...axes, fovY: 80, aspect: 1.65 };
  for (const p of [
    [0, 0],
    [0.8, -0.6],
    [-1, 1],
  ]) {
    const ray = rayInView(eye, ...p),
      xy = projectRay(eye, ray);
    close(p[0], xy[0]);
    close(p[1], xy[1]);
  }
  assert.ok(westernRegion(eye.forward)?.id);
  const footprint = frameOutline({ ...eye, width: 500, height: 300, circleDiameter: 200 });
  for (const ray of footprint) {
    const [x, y] = projectRay(eye, ray);
    close(Math.hypot(x * 250, y * 150), 100);
  }
}
const chinese = await ensureSkyCulture('chinese'),
  item = chinese.asterisms.find((g) => g.primaryMemberHips.length > 0);
const near = localRegion(equatorial(item.ra, item.dec), chinese);
assert.equal(near.id, item.id);
assert.equal(chinese.boundaries.length, 0);

const candidates = [];
const vegaHit = identifyCelestialCrosshair({
  direction: vega.direction,
  fovY: 4,
  displayHeight: 480,
  bodies: [],
  candidates,
});
assert.equal(vegaHit.id, vega.id);
assert(candidates.some((x) => x.id === vega.id));
for (const lang of ['zh', 'en', 'fr', 'ru']) {
  const card = celestialCard(vegaHit, vega.direction, 'western', lang);
  assert.match(card.link.url, /nasa\.gov/);
  assert(card.description.length > 12);
  assert(card.facts.length >= 3);
}
const foreground = [];
const disc = identifyCelestialCrosshair({
  direction: vega.direction,
  fovY: 8,
  displayHeight: 300,
  bodies: [{ id: 'Moon', direction: vega.direction, radiusRad: 0.01, distanceKm: 380000 }],
  candidates: foreground,
});
assert.equal(disc.kind, 'solar');
assert.equal(foreground.length, 1);
for (const k of ['terrain', 'earth', 'outside', 'station', 'rig', 'satellite', 'unavailable'])
  assert.equal(objectTarget({ kind: k }, vega.direction, 'western'), null);
const blocked = identifyCelestialCrosshair({
  direction: vega.direction,
  fovY: 4,
  displayHeight: 490,
  bodies: [],
  blocked: () => true,
});
assert.equal(blocked.kind, 'sky');
const m31 = getXuntianTarget('M31');
const hits = [];
const hit = identifyCelestialCrosshair({
  direction: m31.direction,
  fovY: 50,
  displayHeight: 380,
  bodies: [],
  candidates: hits,
});
assert.equal(hit.id, 'deep-sky:m31');
assert(new Set(hits.map((h) => h.id)).size > 1, 'overlapping catalogue objects selectable');
const galaxy = celestialCard(hit, m31.direction, 'western', 'fr');
assert(galaxy.description.length > 25);
const empty = objectTarget({ kind: 'sky' }, m31.direction, 'western');
assert.deepEqual(empty.direction, m31.direction);
close(skyAngles(equatorial(97.5, -23)).ra, 97.5);
console.log(
  'Sky tools: actual ray and field stop, polar/seam geometry, both cultures, foreground occlusion, alternatives and four-language cards passed.'
);
