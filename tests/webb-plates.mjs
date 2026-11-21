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
