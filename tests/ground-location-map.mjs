import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({
  stdin: {
    contents: `
      export * from './src/ground-location-map.js';
      export * from './src/ground-site-map-projection.js';
      export * from './src/ground-site-map-imagery.js';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const module = { exports: {} };
new Function('module', 'exports', bundle.outputFiles[0].text)(module, module.exports);
const {
  locationMapFrame,
  projectLocation,
  locationMapScale,
  locationMapImageRects,
  mountGroundLocationMap,
} = module.exports;
const beijing = locationMapFrame({ latitude: 39.9, longitude: 116.4 }, 80, 240, 160);
assert.deepEqual(projectLocation(beijing, 39.9, 116.4), { x: 120, y: 80 });
assert(projectLocation(beijing, 40, 116.4).y < 80, 'north is upwards');
assert(projectLocation(beijing, 39.9, 116.5).x > 120, 'east is rightwards');
const scale = locationMapScale(beijing);
assert(scale.pixels > 0 && scale.pixels <= 58);
assert.equal(scale.kilometres / beijing.kmPerPixel, scale.pixels);
const seam = locationMapFrame({ latitude: 0, longitude: 179.9 }, 80);
assert(projectLocation(seam, 0, -179.9).x > 120, 'nearby point across the date line stays east');
const world = locationMapImageRects(seam, [-180, -90, 180, 90]);
assert.equal(world.length, 2, 'base map wraps without a blank date-line strip');
assert(Math.abs(world.reduce((n, r) => n + r.target[2], 0) - 240) < 1e-8);
for (const r of world)
  assert(r.source.every(Number.isFinite) && r.source.every((n) => n >= 0 && n <= 1));
const f = locationMapFrame({ latitude: 0, longitude: 0 }, 222.3901604670658, 200, 200);
const rect = locationMapImageRects(f, [-0.5, 0, 0.5, 0.5])[0];
assert(rect.target[1] < 100, 'north half of satellite tile draws above observer');
assert.equal(rect.source[1], 0, 'north-up decoded satellite pixels need no vertical flip');
for (const latitude of [-90, -89.99, 89.99, 90]) {
  const frame = locationMapFrame({ latitude, longitude: 180 }, 12000);
  assert(Object.values(frame).every(Number.isFinite));
  assert(Object.values(projectLocation(frame, latitude, -180)).every(Number.isFinite));
  assert(
    locationMapImageRects(frame, [-180, -90, 180, 90]).every((r) => r.target.every(Number.isFinite))
  );
}
assert.deepEqual(locationMapImageRects(beijing, [-120, 0, -110, 10]), []);
console.log(
  'Location map: north-up projection, observer tracking, date-line imagery wrap, tile orientation, scale and finite polar overview passed'
);

const {
  sitePickerFrame,
  locationAtPixel,
  anchoredSitePickerFrame,
  planSiteMapTiles,
  createSiteMapImagery,
} = module.exports;
for (const site of [
  { latitude: 39.9, longitude: 116.4 },
  { latitude: 0, longitude: 179.997 },
  { latitude: -78, longitude: -179.998 },
]) {
  const current = sitePickerFrame(site, 0.04, 860, 520);
  const from = { x: 778, y: 205 },
    to = { x: 320, y: 338 };
  const anchor = locationAtPixel(current, from);
  for (const scale of [0.04, 0.0097, 0.08, 0.00001]) {
    const after = anchoredSitePickerFrame(current, anchor, to, scale);
    const pixel = projectLocation(after, anchor.latitude, anchor.longitude);
    assert(
      Math.abs(pixel.x - to.x) < 1e-6 && Math.abs(pixel.y - to.y) < 1e-6,
      'panning and continuous zoom preserve the anchor at every ground scale'
    );
  }
}
for (const latitude of [-90, 90]) {
  const tight = sitePickerFrame({ latitude, longitude: -180 }, 1e-8, 320, 480);
  assert.equal(tight.verticalKmPerPixel, 0.0005);
  assert(tight.north <= 90 + 1e-12 && tight.south >= -90 - 1e-12);
  assert(Number.isFinite(projectLocation(tight, latitude, 180).x));
  const world = sitePickerFrame({ latitude, longitude: 179 }, 1e6, 320, 480);
  assert.equal(world.longitudeSpan, 360);
  assert(world.north >= 90 && world.south <= -90);
}
const tiled = {
  detail: { columns: 48, rows: 24, slots: [], tiles: {} },
  uniforms: { dayMap: { value: { image: { width: 1024 } } } },
  cityTerrain: { enabled: true, cities: new Map(), entries: new Map(), disabled: new Set() },
};
for (let x = 0; x < 48; x++)
  for (let y = 0; y < 24; y++) tiled.detail.tiles[x + '-' + y] = '/day/' + x + '-' + y;
const city = {
  id: 'local',
  bounds: [116.2, 39.8, 116.6, 40.1],
  builtin: true,
  maxLevel: 3,
  tiles: {},
};
for (let z = 0; z <= 3; z++)
  for (let x = 0; x < 2 ** z; x++)
    for (let y = 0; y < 2 ** z; y++) {
      const key = z + '/' + x + '/' + y;
      city.tiles[key] = '/local/' + key;
    }
tiled.cityTerrain.cities.set(city.id, city);
tiled.cityTerrain.cities.set('cached', { ...city, id: 'cached', builtin: false, streaming: true });
tiled.cityTerrain.cities.set('distant', {
  ...city,
  id: 'distant',
  bounds: [-122.5, 47.5, -122.2, 47.7],
});
const near = sitePickerFrame({ latitude: 39.9, longitude: 116.4 }, 0.01, 800, 500);
const planned = planSiteMapTiles(tiled, near, 2);
assert(planned.filter((entry) => entry.day).length <= 4);
assert(planned.filter((entry) => !entry.day).length <= 12);
assert(planned.some((entry) => entry.day));
assert(planned.some((entry) => entry.cityId === 'local' && entry.z === 3));
assert(planned.every((entry) => locationMapImageRects(near, entry.bounds).length > 0));
assert(
  planned.filter((entry) => entry.cityId === 'cached').every((entry) => !entry.url),
  'saved or streamed tiles can only be read from the local cache'
);
const one = planned.find((entry) => entry.cityId === 'local');
const dayCell = planned.find((entry) => entry.day).id.slice(4);
tiled.cityTerrain.entries.set(one.id, one);
tiled.detail.slots = [{ key: dayCell, texture: { image: {} } }];
assert(
  !planSiteMapTiles(tiled, near, 2).some(
    (entry) => entry.id === one.id || entry.id === 'day/' + dayCell
  )
);
tiled.cityTerrain.disabled.add('local');
assert(!planSiteMapTiles(tiled, near, 2).some((entry) => entry.cityId === 'local'));
const dateLine = sitePickerFrame({ latitude: 0.1, longitude: 179.999 }, 0.1, 800, 500);
const seamTiles = planSiteMapTiles(tiled, dateLine);
assert(
  seamTiles.some((entry) => entry.id.startsWith('day/0-')) &&
    seamTiles.some((entry) => entry.id.startsWith('day/47-')),
  'both sides of the date line are present in a bounded detail plan'
);

// A canceled bitmap decode can finish after close and even after a new picker
// has opened. It must be released and cannot publish pixels to the new site.
tiled.detail.slots = [];
tiled.cityTerrain.disabled.clear();
const originalFetch = globalThis.fetch,
  originalDecode = globalThis.createImageBitmap;
const pending = [],
  closed = [],
  redraws = [];
globalThis.fetch = async (url) => ({ ok: true, blob: async () => new Blob([url]) });
globalThis.createImageBitmap = (blob) =>
  new Promise((resolve) =>
    pending.push(async () => {
      const url = await blob.text();
      resolve({ url, close: () => closed.push(url) });
    })
  );
const flush = () => new Promise((resolve) => setImmediate(resolve));
try {
  const imagery = createSiteMapImagery(tiled, () => redraws.push(true));
  imagery.update(dateLine, 1);
  await flush();
  assert.equal(pending.length, 1, 'one image decode in flight');
  imagery.close();
  imagery.update(near, 1);
  await pending.shift()();
  await flush();
  assert.equal(closed.length, 1);
  assert.equal(redraws.length, 0, 'late decode discarded');
  assert.equal(pending.length, 1, 'new viewport starts once old decoder finishes');
  imagery.close();
  await pending.shift()();
  await flush();
  assert.equal(redraws.length, 0);
  imagery.dispose();
} finally {
  globalThis.fetch = originalFetch;
  if (originalDecode) globalThis.createImageBitmap = originalDecode;
  else delete globalThis.createImageBitmap;
}
console.log(
  'Site picker: date-line and polar zoom anchoring, visible tile budgets, shared resident imagery, disk-only reads and cancel/reopen races passed'
);

// Turning at a fixed site should never decode the whole day map when newly
// resident detail tiles repaint. A new site or a new day source needs a crop.
{
  const base = { width: 8192, height: 4096 };
  const environment = { uniforms: { dayMap: { value: { image: base } } } };
  const doc = globalThis.document;
  const crops = [];
  globalThis.document = {createElement: () => ({
    getContext: () => ({setTransform(){}, drawImage(source){crops.push(source);}})
  })};
  try {
    const imagery = createSiteMapImagery(environment, () => {});
    const context = {canvas:{width:480,height:320},fillRect(){},drawImage(){}};
    const frame = locationMapFrame({latitude:39.9,longitude:116.4},80,240,160);
    imagery.draw(context, frame, false);
    imagery.draw(context, frame, false);
    assert.deepEqual(crops,[base]);
    imagery.draw(context,locationMapFrame({latitude:40,longitude:116.4},80,240,160),false);
    assert.equal(crops.length,2);
    environment.uniforms.dayMap.value.image = {...base};
    imagery.draw(context,frame,false);
    assert.equal(crops.length,3);
    imagery.dispose();
  } finally {if (doc) globalThis.document=doc; else delete globalThis.document;}
}

// The app styles bare header/section globally (80px absolute toolbar,
// section padding, last-child border removal, immersive-header hiding).
// The minimap must not create any of those host-owned structural elements.
const originalDocument = globalThis.document;
let mountedRoot;
function fakeElement(tag) {
  const attributes = new Map(),
    children = new Map();
  return {
    tagName: tag.toUpperCase(),
    attributes,
    innerHTML: '',
    hidden: false,
    setAttribute(key, value) {
      attributes.set(key, value);
    },
    getAttribute(key) {
      return attributes.get(key);
    },
    getContext() {
      return {};
    },
    remove() {
      this.removed = true;
    },
    querySelector(selector) {
      if (!children.has(selector))
        children.set(selector, fakeElement(selector === 'canvas' ? 'canvas' : 'div'));
      return children.get(selector);
    },
  };
}
try {
  globalThis.document = { createElement: fakeElement };
  const map = module.exports.mountGroundLocationMap({
    host: {
      append(node) {
        mountedRoot = node;
      },
    },
    environment: {},
  });
  assert.equal(
    mountedRoot.tagName,
    'DIV',
    'map root avoids section:last-child and section padding'
  );
  assert.equal(mountedRoot.getAttribute('role'), 'region');
  assert(
    !/<(?:header|section|footer)\b/i.test(mountedRoot.innerHTML),
    'map controls avoid global header and immersive header selectors'
  );
  assert(mountedRoot.innerHTML.includes('class="ground-location-map-heading"'));
  assert(mountedRoot.innerHTML.includes('class="ground-location-map-caption"'));
  map.dispose();
  assert.equal(mountedRoot.removed, true);
} finally {
  globalThis.document = originalDocument;
}
console.log(
  'Location map host CSS isolation: component-owned div containers preserve controls and borders under global toolbar/section styles'
);
