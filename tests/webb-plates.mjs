import assert from 'node:assert/strict';
import records from '../src/webb-gallery-data.json' with { type: 'json' };
import { WEBB_ARTWORKS, WEBB_PLATE_PROVIDERS } from '../src/webb-gallery.js';
import {
  createWebbPlate,
  webbPlateRay,
  webbPlateTile,
  webbPlateTiles,
  webbPlateGeometry,
  planWebbPlate,
  validSkyImageDimensions,
} from '../src/webb-plate.js';
import { planSkyDetailSelection } from '../src/sky-detail-plan.js';
import { SKY_IMAGE_FIELDS } from '../src/deep-sky-openngc.js';

assert.ok(WEBB_ARTWORKS.length >= 283);
assert.equal(new Set(WEBB_ARTWORKS.map((a) => a.id)).size, WEBB_ARTWORKS.length);
for (const art of WEBB_ARTWORKS) {
  assert.ok(
    art.id && art.title && art.credit && art.thumbnailUrl.startsWith('https://cdn.esawebb.org/')
  );
  assert.equal(Boolean(art.providerId), Boolean(art.center && art.fieldSizeArcmin));
}
for (const previewOnly of ['weic2307f', 'weic2421a', 'saturn1']) {
  assert.equal(WEBB_ARTWORKS.find((item) => item.id === previewOnly)?.providerId, null);
}
const sources = new Map(WEBB_PLATE_PROVIDERS.map((p) => [p.id, p]));
assert.ok(sources.size > 100);
for (const p of sources.values()) {
  assert.ok(p.fieldSizeArcmin.every((n) => n > 0) && p.maxOrder >= 0);
  const l = p.plate.levels.at(-1);
  assert.ok(webbPlateTile(p, p.maxOrder, l.cols * l.rows - 1).width > 0);
}
// Held-out astropy corners of the original 10K resampling, within 0.04 arcsec.
const carina = createWebbPlate(records.find((x) => x.id === 'weic2205a').plate);
for (const [i, [u, v]] of [
  [0, 1],
  [1, 1],
  [1, 0],
  [0, 0],
].entries()) {
  const [x, y, z] = webbPlateRay(carina, u, v);
  const coords = [
    ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
    (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
  ];
  for (const [axis, n] of coords.entries())
    assert.ok(Math.abs(n - SKY_IMAGE_FIELDS[0].footprint[i][axis]) < 0.00001);
}
const selected = sources.get('webb-pillarsofcreation_composite');
const all = webbPlateTiles(selected);
assert.equal(all.length, 1022);
assert.equal(new Set(all.map((t) => t.key)).size, all.length);
assert.ok(all.at(-1).url.endsWith('/TileGroup3/5-27-26.jpg'));
const raster = webbPlateGeometry(all[0]);
assert.equal(raster.positions.length, 12);
assert.deepEqual([...raster.uvs], [0, 0, 1, 0, 1, 1, 0, 1]);
assert.ok(validSkyImageDimensions(all[0], 223, 209));
assert.ok(!validSkyImageDimensions(all[0], 220, 209));
assert.ok(!validSkyImageDimensions(all[0], 512, 512));
const view = (p, fov = 0.01) => {
  const { raDeg, decDeg } = p.center;
  const a = (raDeg * Math.PI) / 180,
    d = (decDeg * Math.PI) / 180;
  return {
    forward: p.plate.direction,
    up: [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)],
    right: [-Math.sin(a), Math.cos(a), 0],
    fovY: fov,
    aspect: 1.5,
    pixelHeight: 600,
  };
};
assert.equal(planWebbPlate([selected], view(selected, 70)).length, 0);
const near = planSkyDetailSelection(WEBB_PLATE_PROVIDERS, view(selected), 'recent', selected.id);
assert.ok(
  near.tiles.length > 1 &&
    near.tiles.length <= 19 &&
    near.tiles.every((t) => t.provider === selected)
);
assert.equal(planSkyDetailSelection(WEBB_PLATE_PROVIDERS, view(selected), 'dss').tiles.length, 0);
const off = view(selected);
off.forward = off.forward.map((v) => -v);
assert.equal(planWebbPlate([selected], off, selected.id).length, 0);
assert.ok(near.tiles.at(-1).order >= 2);
console.log(
  'Webb: text index, independent WCS footprint, official pyramid, view budget, field and source selection passed.'
);

// ESA/Hubble heic1502a: a PHAT mosaic cannot be enumerated at full resolution
// just to show or save a telescope field of a few hundred native pixels.
const { buildImageArchive } = await import('../src/space-image-archive.js');
const { SkyOffline } = await import('../src/sky-offline.js');
const theta = (-123.5474801648934 * Math.PI) / 180;
const scale = 1.38979163624e-5;
const rawM31 = {
  id: 'heic1502a',
  title: 'Sharpest ever view of the Andromeda Galaxy',
  released: '2015-01-05',
  aliases: ['M 31'],
  credit: 'PHAT team',
  bands: 'F475W, F814W',
  plate: [
    69536,
    22230,
    69536,
    22230,
    11.1541387615,
    41.5927245494,
    34768,
    11115,
    -scale * Math.cos(theta),
    -scale * Math.sin(theta),
    -scale * Math.sin(theta),
    scale * Math.cos(theta),
    31663,
  ],
};
const {
  providers: [hubble],
  artworks: [mapped, preview],
} = buildImageArchive([rawM31, { ...rawM31, id: 'example', plate: null }], {
  source: 'hubble',
  prefix: 'hubble',
  site: 'https://esahubble.org',
  archive: 'https://cdn.esahubble.org/archives/images',
});
assert.equal(mapped.providerId, 'hubble-heic1502a');
assert.equal(preview.providerId, null);
assert.equal(hubble.maxOrder, 9);
const fixtureWebb = { ...hubble, id: 'webb-other', source: 'recent' };
const providers = [fixtureWebb, hubble];
const m31View = view(hubble, 0.006);
const hst = planSkyDetailSelection(providers, m31View, 'hubble', fixtureWebb.id);
assert(
  hst.tiles.length > 1 && hst.tiles.length <= 19 && hst.tiles.every((t) => t.provider === hubble)
);
assert.equal(Math.max(...hst.tiles.map((t) => t.order)), 9);
assert(
  planSkyDetailSelection(providers, m31View, 'recent', hubble.id).tiles.every(
    (t) => t.provider === fixtureWebb
  )
);
const offline = new SkyOffline({ providers }, null, { list: async () => [] });
const native = offline.planArtwork({ provider: hubble, fieldOnly: true, view: m31View });
assert.equal(native.order, 9);
assert(native.items.length < 100 && native.items.length >= hst.tiles.length);
const reduced = offline.planArtwork({ provider: hubble, view: m31View });
assert(reduced.order < hubble.maxOrder && reduced.items.length <= 1024);
assert.notEqual(native.id, reduced.id);
for (const plan of [native, reduced]) {
  const rebuilt = offline.planRecord(plan);
  assert.equal(rebuilt.id, plan.id);
  assert.deepEqual(
    rebuilt.items.map((t) => t.key),
    plan.items.map((t) => t.key)
  );
}
// Limit the planner to the actual resolution of a saved whole artwork when offline.
offline.fields = [{ ...reduced, complete: true }];
offline.failedSources.set(hubble.id, performance.now() + 60000);
const savedView = offline.providersForView(m31View);
const savedPlans = planSkyDetailSelection(savedView, m31View, 'hubble', hubble.id);
assert.equal(Math.max(...savedPlans.tiles.map((t) => t.order)), reduced.order);
const different = hubble.plate.direction.map((n) => -n);
assert.equal(
  planSkyDetailSelection(providers, { ...m31View, forward: different }, 'hubble', hubble.id).tiles
    .length,
  0
);
console.log(
  'Hubble source isolation, maximum native M31 tier, bounded footprint/whole artwork saving and offline replay passed.'
);

// The live M31 finder has a rotated, narrow footprint whose bounding box is
// 4 by 5 tiles. Keep the 13 intersecting tiles at full resolution.
const finderView = {
  ...m31View,
  aspect: 1.6,
  pixelHeight: 598,
  forward: [0.7337550704971818, 0.1446773384836204, 0.6638312769439022],
  up: [-0.6512916823834926, -0.1284177118120848, 0.7478823675893345],
  right: [0.19344932405608375, -0.9811102685336872, 0],
};
const finderTiles = planWebbPlate([hubble], finderView, hubble.id);
assert.equal(finderTiles.filter((t) => t.order === 9).length, 13);
assert.equal(
  planWebbPlate([hubble], { ...finderView, pixelHeight: 183 }, hubble.id).at(-1).order,
  8
);
