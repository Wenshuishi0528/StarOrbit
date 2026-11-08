import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({
  stdin: {
    contents:
      "export {locationMapFrame,projectLocation,locationMapScale,locationMapImageRects,mountGroundLocationMap} from './src/ground-location-map.js'",
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
