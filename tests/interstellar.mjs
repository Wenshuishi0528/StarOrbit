import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
import {
  AU_LY,
  PC_LY,
  LY_KM,
  stellarPosition,
  apparentMagnitude,
  absoluteMagnitude,
  splitPosition,
  buildSpatialCatalog,
  arrivalPosition,
  stepTravel,
} from '../src/interstellar-math.js';
const stars = JSON.parse(fs.readFileSync('assets/stars.json'));
const distances = JSON.parse(fs.readFileSync('assets/stellar-distances/catalog.json'));
const catalog = buildSpatialCatalog(stars, distances.rows);
assert(catalog.count > 19000);
assert.equal(catalog.byId.size, catalog.count);
assert(catalog.bytes < 1_500_000, 'typed arrays remain under 1.5 MB');
const sirius = catalog.byId.get('hip:32349'),
  p = Array.from(catalog.positions.slice(sirius * 3, sirius * 3 + 3)),
  d = Math.hypot(...p);
assert(d > 8.5 && d < 8.7, 'Sirius Hipparcos distance ~8.6 ly');
assert(Math.abs(apparentMagnitude(catalog.photometry[sirius * 3], d) + 1.44) < 1e-6);
assert(Math.abs(apparentMagnitude(absoluteMagnitude(2, 100), 200) - 2 - 5 * Math.log10(2)) < 1e-10);
assert.equal(stellarPosition(2, 91, 10), null);
assert.equal(stellarPosition(2, 0, -10), null);
assert.deepEqual(stellarPosition(0, 0, 100), [10 * PC_LY, 0, 0]);
assert.equal(
  buildSpatialCatalog(
    [
      [1, 0, 0, 2, 0],
      [1, 0, 0, 2, 0],
      [2, 0, 0, 2, 0],
    ],
    [
      [1, 10, 1],
      [2, 10, 2],
    ]
  ).count,
  2
);
// Independent projection: translating sideways changes nearby stars more.
const observer = [0, 1, 0],
  close = stellarPosition(0, 0, 1000),
  far = stellarPosition(0, 0, 10);
assert(
  Math.abs(Math.atan2(close[1] - observer[1], close[0])) >
    Math.abs(Math.atan2(far[1] - observer[1], far[0])) * 90
);
const arrival = arrivalPosition([0, 0, 0], p, AU_LY * 2);
assert(Math.abs(Math.hypot(...arrival.map((v, i) => v - p[i])) / AU_LY - 2) < 1e-9);
for (const value of [d, 100, 1000]) {
  const star = [value, 0, 0],
    eye = [value - AU_LY, 0, 0];
  const a = splitPosition(star),
    b = splitPosition(eye);
  // Emulate float32 high/low subtraction used by the actual vertex shader.
  const delta = Math.fround(
    Math.fround(a.high[0] - b.high[0]) + Math.fround(Math.fround(a.low[0]) - Math.fround(b.low[0]))
  );
  assert(Math.abs(delta - AU_LY) * LY_KM < 500, 'sub-AU relative precision at 1000 ly');
}
function run(hz) {
  const p = [0, 0, 0],
    v = [0, 0, 0];
  for (let i = 0; i < hz * 2; i++) stepTravel(p, v, [1, 0, 0], 1 / hz, 2);
  return p[0];
}
assert(Math.abs(run(30) - run(120)) < 1e-10, 'frame-rate invariant acceleration');
const pos = [0, 0, 0],
  velocity = [50, 0, 0];
stepTravel(pos, velocity, [1, 0, 0], 0.1, 50, AU_LY);
assert(pos[0] < AU_LY * 0.061, 'nearby auto-brake limits stale fast velocity');
for (let i = 0; i < 200; i++) stepTravel(pos, velocity, [0, 0, 0], 0.1, 2);
assert(Math.hypot(...velocity) < 1e-15);
const bundled = await build({
  stdin: {
    contents: "export {interstellarCatalog} from './src/interstellar-catalog.js'",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { interstellarCatalog } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
);
let full;
try {
  full = interstellarCatalog();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
assert.strictEqual(full, interstellarCatalog());
const dipper = full.formations.find((f) => f.culture === 'chinese' && f.item.zh === '北斗');
assert(dipper && dipper.members.length === 7);
assert.equal(dipper.segments.length, dipper.total);
for (const f of full.formations)
  for (const pair of f.segments) for (const index of pair) assert(index > 0 && index < full.count);
console.log(
  JSON.stringify({
    stars: full.count - 1,
    bytes: full.bytes,
    formations: full.formations.filter((f) => f.members.length).length,
    dipperSegments: dipper.segments.length,
    checks:
      'distance, photometry, parallax, precision, frame-rate invariance, braking, catalogue joins and line endpoints passed',
  })
);

// Shared pilot semantics, short taps, emergency stop and lifecycle ownership.
const { createInterstellarInput } = await import('../src/interstellar-input.js');
const THREE = await import('three');
class Target extends EventTarget {}
const win = new Target(),
  doc = new Target(),
  canvas = new Target();
doc.defaultView = win;
doc.hidden = false;
canvas.ownerDocument = doc;
const attrs = new Map();
canvas.getAttribute = (k) => (attrs.has(k) ? attrs.get(k) : null);
canvas.setAttribute = (k, v) => attrs.set(k, v);
canvas.removeAttribute = (k) => attrs.delete(k);
canvas.hasPointerCapture = () => false;
canvas.setPointerCapture = () => {};
canvas.focus = () => {
  doc.activeElement = canvas;
};
canvas.blur = () => {
  doc.activeElement = null;
  canvas.dispatchEvent(new Event('blur'));
};
const fire = (target, type, fields = {}) => {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, fields);
  target.dispatchEvent(event);
};
const camera = new THREE.PerspectiveCamera();
let brakes = 0;
const input = createInterstellarInput({
  canvas,
  camera,
  onNavigate: (brake) => {
    if (brake) brakes++;
  },
});
canvas.focus();
fire(canvas, 'keydown', { code: 'KeyH' });
fire(win, 'keyup', { code: 'KeyH' });
assert.deepEqual(input.update(1 / 60), [0, 0, -1], 'short tap survives one frame');
assert.deepEqual(input.update(1 / 60), [0, 0, 0], 'tap never sticks');
fire(canvas, 'keydown', { code: 'KeyH' });
fire(canvas, 'keydown', { code: 'Space' });
assert.deepEqual(input.update(1 / 60), [0, 0, 0], 'space clears held thrust');
assert(brakes > 0);
fire(canvas, 'keydown', { code: 'KeyL' });
canvas.blur();
assert.deepEqual(input.update(1 / 60), [0, 0, 0]);
canvas.focus();
fire(canvas, 'keydown', { code: 'KeyW' });
input.update(1 / 60);
assert(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).y < 0, 'W pitches down');
input.dispose();
const q = camera.quaternion.clone();
fire(canvas, 'keydown', { code: 'KeyS' });
input.update(1 / 60);
assert(q.equals(camera.quaternion), 'disposed listeners do not act');
console.log(
  'Interstellar input: short taps, brake, focus, shared pitch convention and disposal passed'
);
