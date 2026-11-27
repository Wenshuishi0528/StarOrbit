import assert from 'node:assert/strict';
import { createSkyImageIndex, galleryEntry, panstarrsCovers } from '../src/sky-image-index.js';
import { makeThumbnailProjection } from '../src/sky-image-thumbnail.js';
import { hipsDirection } from '../src/sky-detail-math.js';
import { equatorial } from '../src/environment-math.js';

const work = {
  id: 'weic2205a',
  title: 'Cosmic Cliffs',
  titleZh: '宇宙悬崖',
  aliases: ['NGC 3324'],
  providerId: 'jwst-carina-2022',
  center: { raDeg: 159.213, decDeg: -58.62 },
  fieldSizeArcmin: [7.29, 4.22],
};
const pillars = {
  id: 'pillars',
  title: 'Pillars of Creation',
  aliases: ['NGC 6611', 'Eagle Nebula'],
  providerId: 'webb-pillars',
};
const search = createSkyImageIndex([work, pillars]);
assert.equal(search('', 'featured')[0].work, work);
assert.equal(search('NGC 224')[0].object.id, 'M31');
assert.equal(search('宇宙悬崖')[0].work, work);
assert.equal(search('m 31', 'dss')[0].object.id, 'M31');
assert.equal(search('', 'recent').length, 2);
assert.equal(search('', 'dss').length, 12161);
assert.ok(search('', 'panstarrs').length < search('', 'dss').length);
const association = search('NGC3324');
assert.equal(association[0].object.id, 'NGC3324');
assert.equal(association[1].work, work);
assert.equal(search.related(association[0].object)[0].work, work);
assert.equal(search.related(search('鹰状星云')[0].object)[0].work, pillars);
assert.deepEqual(search.related({ id: 'NGC332', aliases: [] }), []);
assert.notEqual(
  galleryEntry(association[0], 'dss').raDeg,
  galleryEntry(association[1], 'recent').raDeg
);
assert.equal(galleryEntry(association[1], 'recent', 'en').title, 'Cosmic Cliffs');
assert.equal(search('NGC 3324', 'panstarrs').length, 0);
assert.equal(panstarrsCovers(association[0].object), false);
const large = galleryEntry(search('M31', 'dss')[0], 'dss');
const small = galleryEntry(search('M51', 'panstarrs')[0], 'panstarrs');
assert.ok(large.fov > small.fov);
assert.equal(small.source, 'panstarrs');
const survey = { minOrder: 0, maxOrder: 9, tileSize: 512 };
for (const entry of [
  large,
  small,
  { ...large, raDeg: 359.99, decDeg: 89.9 },
  { ...small, decDeg: -89.99 },
]) {
  const { samples, width, height, order } = makeThumbnailProjection(entry, survey, 25, 17);
  assert.ok(samples.size > 0 && samples.size <= 6);
  const footprint = new Set();
  for (const [pixel, positions] of samples) {
    for (let i = 0; i < positions.length; i += 3) {
      const at = positions[i] / 4;
      assert.ok(!footprint.has(at));
      footprint.add(at);
      if (at === (width * height - 1) / 2) {
        const v = hipsDirection(order, pixel, positions[i + 1], positions[i + 2]);
        const target = equatorial(entry.raDeg, entry.decDeg);
        assert.ok(Math.hypot(...v.map((n, j) => n - target[j])) < 1e-9);
      }
    }
  }
  assert.equal(footprint.size, width * height);
}
console.log(
  'Sky image gallery: catalogue aliases, colour sources, artwork centres, target framing and HiPS thumbnail projection passed.'
);

// A four-work integration fixture must never replace the distributable catalogue.
const { loadHubbleArchive } = await import('../src/hubble-gallery.js');
const { artworks: HUBBLE_ARTWORKS, providers: HUBBLE_PLATE_PROVIDERS } = await loadHubbleArchive();
assert(HUBBLE_ARTWORKS.length >= 2500);
assert.equal(new Set(HUBBLE_ARTWORKS.map((work) => work.id)).size, HUBBLE_ARTWORKS.length);
const providerIds = new Set(HUBBLE_PLATE_PROVIDERS.map((provider) => provider.id));
for (const artwork of HUBBLE_ARTWORKS) {
  assert(artwork.title && artwork.credit && artwork.released, artwork.id);
  assert.equal(artwork.sourceUrl, `https://esahubble.org/images/${artwork.id}/`);
  for (const link of [artwork.thumbnailUrl, artwork.previewUrl])
    assert.match(link, /^https:\/\/(?:cdn\.)?esahubble\.org\//);
  assert.equal(Boolean(artwork.providerId), !artwork.reason, artwork.id);
  if (artwork.providerId) assert(providerIds.has(artwork.providerId), artwork.id);
}
const archive = createSkyImageIndex(HUBBLE_ARTWORKS);
for (const [query, id] of [
  ['M31', 'heic1502a'],
  ['M51', 'heic0506a'],
  ['创生之柱', 'heic1501a'],
])
  assert(archive(query, 'hubble').some(({ work }) => work.id === id && work.providerId));
assert.equal(HUBBLE_ARTWORKS.find((work) => work.id === 'heic1410a').providerId, null);

const hstM31 = {
  id: 'hst-M31',
  source: 'hubble',
  title: 'A PHAT mosaic',
  aliases: ['NGC 0224'],
  providerId: 'hubble-hst-M31',
};
const hstPillars = {
  id: 'hst-pillars',
  source: 'hubble',
  title: 'Pillars of Creation — visible',
  aliases: ['Messier 16'],
  providerId: 'hubble-hst-pillars',
};
const combined = createSkyImageIndex([
  work,
  pillars,
  hstM31,
  hstPillars,
  { id: 'eagle-spire', source: 'hubble', title: 'Eagle Nebula spire', aliases: ['M16'] },
  { id: 'hst-x', source: 'hubble', title: 'M310 test', aliases: [] },
]);
const m31Preview = { ...hstM31, id: 'preview', providerId: null };
const m31Featured = { ...hstM31, id: 'featured', titleZh: '仙女座星系（拼接图）' };
const ranked = createSkyImageIndex([m31Preview, hstM31, m31Featured]);
const matches = ranked('M31');
assert.equal(matches[0].object.id, 'M31');
assert.deepEqual(
  matches.slice(1).map((row) => row.work),
  [m31Featured, hstM31, m31Preview]
);
assert.deepEqual(ranked.related(matches[0].object), matches.slice(1));
assert.equal(combined('M31', 'hubble').length, 1);
assert.equal(combined('仙女座星系', 'hubble')[0].work, hstM31);
assert.equal(combined('NGC224', 'hubble')[0].work, hstM31);
assert.deepEqual(
  combined('创生之柱', 'hubble').map((row) => row.work),
  [hstPillars]
);
assert.equal(combined('M16', 'hubble').length, 2);
assert.equal(combined('创生之柱', 'recent')[0].work, pillars);
assert.equal(galleryEntry(combined('鹰状星云', 'hubble')[0], 'all').source, 'hubble');
const { frameSkyArtwork, pointMainCameraAtSky, updateMainSkyPointing, restoreMainSkyLens } =
  await import('../src/sky-camera-pointing.js');
const { createWebbPlate, webbPlateRay } = await import('../src/webb-plate.js');
const { PerspectiveCamera, Vector3, EventDispatcher } = await import('three');
const plate = createWebbPlate([
  256, 128, 256, 128, 125, 8, 58, 100, -0.0005, 0.0004, 0.0004, 0.0005, 1,
]);
for (const aspect of [0.45, 1.6, 2.4]) {
  const fit = frameSkyArtwork({ plate }, plate.direction, aspect, 1);
  const camera = new PerspectiveCamera(38, aspect, 0.1, 4000);
  const controls = Object.assign(new EventDispatcher(), {
    target: new Vector3(),
    rotateSpeed: 1,
    panSpeed: 1,
    stopMotion() {},
    update() {
      camera.lookAt(this.target);
    },
  });
  camera.position.set(100, 100, 100);
  const sim = {
    view: 'follow',
    api: { camera, controls },
    current: {
      basis: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
  };
  pointMainCameraAtSky(sim, plate.direction, fit);
  const tangent = Math.tan((fit.fovY * Math.PI) / 360);
  for (const [u, v] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ]) {
    const ray = new Vector3(...webbPlateRay(plate, u, v));
    const depth = ray.dot(new Vector3(...fit.forward));
    assert(depth > 0);
    assert(Math.abs(ray.dot(new Vector3(...fit.up)) / depth) < tangent);
    assert(Math.abs(ray.dot(new Vector3(...fit.right)) / depth) < tangent * aspect);
  }
  sim.current.basis = [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 1],
  ];
  updateMainSkyPointing(sim);
  const actual = camera.getWorldDirection(new Vector3()).toArray();
  const dir = plate.direction;
  assert(Math.hypot(actual[0] - dir[1], actual[1] + dir[0], actual[2] - dir[2]) < 1e-10);
  controls.dispatchEvent({ type: 'start' });
  const target = controls.target.clone();
  sim.current.basis = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  updateMainSkyPointing(sim);
  assert(target.equals(controls.target));
  restoreMainSkyLens(sim);
  assert.equal(camera.fov, 38);
  assert.equal(controls.panSpeed, 1);
}
console.log(
  'Hubble and Webb catalogue associations, source routing, four-corner framing, inertial pointing and optics recovery passed.'
);
