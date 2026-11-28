import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLunarDetail, visibleLunarTiles } from '../src/lunar-detail.js';

function pointing(lon, lat, distance, tanY = 0.0001) {
  const c = Math.cos(lat),
    s = Math.sin(lat),
    x = Math.cos(lon),
    y = Math.sin(lon);
  return {
    eye: [x * c * distance, y * c * distance, s * distance],
    forward: [-x * c, -y * c, -s],
    right: [-y, x, 0],
    up: [-x * s, -y * s, c],
    tanY,
    tanX: 1.5 * tanY,
    height: 700,
  };
}
const front = pointing(0, 0, 220),
  seam = pointing(Math.PI, 0, 220);
assert.deepEqual(visibleLunarTiles(pointing(0, 0, 220, 0.01)), []);
assert.deepEqual(new Set(visibleLunarTiles(front)), new Set([239, 240, 271, 272]));
assert.deepEqual(new Set(visibleLunarTiles(seam)), new Set([224, 255, 256, 287]));
for (const sign of [-1, 1]) {
  const polar = visibleLunarTiles(pointing(0, (sign * Math.PI) / 2, 220));
  assert.equal(polar.length, 32);
  assert(polar.every((id) => Math.floor(id / 32) === (sign > 0 ? 0 : 15)));
}
assert.deepEqual(visibleLunarTiles({ ...front, forward: [1, 0, 0] }), []);
// Aim a telescope at an off-centre, northwestern crater rather than the
// apparent centre of the Moon. Its actual geographic tile must be resident.
const lon = (-20.08 * Math.PI) / 180,
  lat = (9.62 * Math.PI) / 180;
const surface = new THREE.Vector3(
  Math.cos(lon) * Math.cos(lat),
  Math.sin(lon) * Math.cos(lat),
  Math.sin(lat)
);
const look = surface.sub(new THREE.Vector3(...front.eye)).normalize();
const horizontal = look
  .clone()
  .cross(new THREE.Vector3(0, 0, 1))
  .normalize();
const cropped = visibleLunarTiles({
  ...front,
  forward: look.toArray(),
  right: horizontal.toArray(),
  up: horizontal.clone().cross(look).toArray(),
  tanY: 0.00005,
  tanX: 0.000075,
});
assert(cropped.includes(7 * 32 + 14));
assert(!cropped.includes(8 * 32 + 16));

const originalLoad = THREE.ImageLoader.prototype.loadAsync;
const originalDocument = globalThis.document,
  originalTimer = globalThis.setTimeout,
  originalNow = Date.now;
const calls = [],
  held = new Map(),
  pixel = 167;
let gate = true,
  failure = true,
  retry,
  clock = Date.now();
try {
  // Mark both dimensions and a pixel so dimension/gutter and byte uploads are checked.
  const image = { naturalWidth: 528, naturalHeight: 528 };
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        drawImage() {},
        getImageData(x, y, w, h) {
          return { data: new Uint8Array(w * h * 4).fill(pixel) };
        },
      }),
    }),
  };
  const source = { root: 'assets/moon/lroc-16k-hash' };
  THREE.ImageLoader.prototype.loadAsync = async (url) => {
    calls.push(url);
    if (gate) await new Promise((resolve) => held.set(url, resolve));
    if (url === '/bad' && failure) throw Error('offline');
    return image;
  };
  const first = createLunarDetail(source),
    second = createLunarDetail(source);
  first.update(pointing(0, 0, 220, 0.01));
  assert.equal(calls.length, 0);
  assert.equal(first.uniforms.lunarPages.value, null);
  first.update(front);
  second.update(front);
  assert.equal(calls.length, 4, 'two renderers share the four pending visible tile decodes');
  assert(calls.includes(source.root + '/7/15.jpg'));
  assert.equal(first.status.loaded, 0);
  assert(!first.uniforms.lunarDetailOn.value);
  let finished = false;
  const photo = first.ready().then(() => (finished = true));
  await Promise.resolve();
  assert(!finished, 'a close-up photo waits for the visible pages');
  gate = false;
  for (const resolve of held.values()) resolve();
  await Promise.all([photo, second.ready()]);
  assert.equal(first.status.loaded, 4);
  assert.equal(first.uniforms.lunarPages.value.image.data[0], pixel);
  assert.equal(first.uniforms.lunarPages.value.image.height, 528);
  assert(first.uniforms.lunarPages.value.image.data.length <= 35 * 1024 * 1024);
  assert.equal(first.uniforms.lunarPages.value.colorSpace, THREE.SRGBColorSpace);
  const pageTable = first.uniforms.lunarPageTable.value.image.data;
  assert.deepEqual([...pageTable.filter((v, i) => i % 4 === 0 && v)].sort(), [1, 2, 3, 4]);
  first.update(seam);
  await first.ready();
  assert.equal(pageTable[239 * 4], 0, 'panning drops the former geographic mapping');
  assert(pageTable[224 * 4]);
  first.update(null);
  assert.equal(first.uniforms.lunarPages.value, null);
  assert.equal(first.status.wanted, 0);
  first.dispose();
  second.dispose();

  // A failed tile falls back, and a clock-driven retry also works on a paused view.
  Date.now = () => clock;
  globalThis.setTimeout = (callback, ms, ...args) => {
    if (ms === 30000) {
      retry = callback;
      return null;
    }
    return originalTimer(callback, ms, ...args);
  };
  const files = Array.from({ length: 512 }, (_, i) => 'data:tile/' + i);
  files[239] = '/bad';
  const offline = createLunarDetail({ tiles: files });
  offline.update(front);
  await offline.ready();
  assert.equal(offline.status.loaded, 3);
  assert.equal(typeof retry, 'function');
  failure = false;
  clock += 30001;
  retry();
  await offline.ready();
  assert.equal(offline.status.loaded, 4);
  offline.dispose();

  const gone = createLunarDetail({ tiles: files });
  gate = true;
  held.clear();
  gone.update(front);
  const wait = gone.ready();
  gone.dispose();
  await wait;
  for (const resolve of held.values()) resolve();
  await new Promise((resolve) => originalTimer(resolve, 0));
  assert.equal(gone.uniforms.lunarPages.value, null, 'a late decode cannot recreate a closed view');
} finally {
  THREE.ImageLoader.prototype.loadAsync = originalLoad;
  globalThis.document = originalDocument;
  globalThis.setTimeout = originalTimer;
  Date.now = originalNow;
}
console.log(
  'Lunar detail: native close-up pages, fallback, north/south/longitude seam, frustum culling, bounded uploads, shared decodes, paused retry and disposal passed'
);
