import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { birthdaySkyMoment, birthdaySkyFrame } from '../src/birthday-sky-frame.js';
import { solarApparent } from '../src/solar-system.js';
import { GeoVector } from 'astronomy-engine';
import { unit, cross } from '../src/orbit.js';

assert.deepEqual(birthdaySkyMoment({ date: '2004-11-09' }), {
  date: '2004-11-09',
  epoch: Date.parse('2004-11-09T12:00:00Z'),
  localTime: '20:00',
  utcOffset: 8,
  timeAssumed: true,
});
assert.equal(
  birthdaySkyMoment({ date: '2004-11-09', time: '01:15', utcOffset: 8 }).epoch,
  Date.parse('2004-11-08T17:15:00Z')
);
assert.equal(
  birthdaySkyMoment({ date: '2024-02-29', time: '23:45', utcOffset: -3.5 }).epoch,
  Date.parse('2024-03-01T03:15:00Z')
);
for (const options of [
  { date: '2100-02-29' },
  { date: '1900-12-31' },
  { date: '2024-01-01', time: '25:00' },
  { date: '2024-01-01', utcOffset: 8.2 },
])
  assert.throws(() => birthdaySkyMoment(options));

const epoch = birthdaySkyMoment({ date: '2004-11-09' }).epoch;
const sun = GeoVector('Sun', new Date(epoch), false);
const forward = unit([sun.x, sun.y, sun.z]);
const right = unit(cross(forward, [0, 0, 1]));
const view = { forward, right, up: unit(cross(right, forward)), fovY: 80, aspect: 1.6 };
const chartSettings = { constellationArt: true, skyCulture: 'western' };
const frame = birthdaySkyFrame({
  date: '2004-11-09',
  view,
  culture: 'chinese',
  targetId: 'asterism:chinese:029',
  chartSettings,
});
assert.equal(frame.q.t, epoch);
assert.equal(frame.chartSettings.skyCulture, 'chinese');
assert.equal(chartSettings.skyCulture, 'western');
assert.deepEqual(frame.axes.forward, forward);
assert.notEqual(frame.axes.forward, forward);
assert.equal(frame.focusTargetId, 'asterism:chinese:029');
assert.deepEqual(frame.eyeKm, [0, 0, 0]);
const bodies = solarApparent(frame.q, frame.eyeKm);
const renderedSun = bodies.find((body) => body.id === 'Sun');
assert(
  renderedSun.direction.every((value, i) => Math.abs(value - forward[i]) < 1e-9),
  'the epoch reaches the actual EQJ solar ephemeris'
);
const later = birthdaySkyFrame({ date: '2004-11-10', view });
const moon = bodies.find((body) => body.id === 'Moon');
const laterMoon = solarApparent(later.q, later.eyeKm).find((body) => body.id === 'Moon');
assert(
  Math.hypot(...moon.direction.map((value, i) => value - laterMoon.direction[i])) > 0.1,
  'changing birthday changes the actual Moon, rather than just an inscription'
);
assert.deepEqual(later.axes, frame.axes, 'changing date must not move the selected stellar field');
assert.throws(() =>
  birthdaySkyFrame({ date: '2004-11-09', view: { ...view, forward: [0, 0, 0] } })
);

// Exercise the real capture pipeline without a GPU. The sentinel environment
// deliberately has no terrestrial textures/model: skyOnly must never read them.
const { outputFiles } = await build({
  stdin: {
    contents: "export {createXuntianViewRenderer} from './src/xuntian-view-render.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { createXuntianViewRenderer } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const initialTarget = { main: true };
let renderTarget = initialTarget,
  alpha = 0.6,
  clearColor = 0x123456,
  mainClockSamples = 0;
const draws = [],
  preparations = [],
  releases = [];
const gpu = {
  capabilities: { maxTextureSize: 2048 },
  extensions: { has: () => false },
  getContext: () => ({ ALIASED_POINT_SIZE_RANGE: 0, getParameter: () => [1, 64] }),
  getRenderTarget: () => renderTarget,
  getActiveCubeFace: () => 0,
  getActiveMipmapLevel: () => 0,
  getClearColor: (color) => color.setHex(clearColor),
  getClearAlpha: () => alpha,
  setClearColor(color, value) {
    clearColor = typeof color === 'number' ? color : color.getHex();
    alpha = value;
  },
  setRenderTarget(value) {
    renderTarget = value;
  },
  autoClear: true,
  toneMappingExposure: 1,
  xr: { enabled: true },
  shadowMap: { autoUpdate: true, needsUpdate: true },
  properties: { get: () => ({}) },
  clear() {},
  render(scene) {
    for (const child of scene.children) {
      const uniforms = child.material?.uniforms;
      if (uniforms?.isSun?.value === 1) draws.push(uniforms.direction.value.toArray());
    }
  },
  readRenderTargetPixels(target, x, y, width, height, bytes) {
    bytes.fill(255);
  },
};
const imageCanvas = () => ({
  width: 0,
  height: 0,
  getBoundingClientRect: () => ({ width: 160, height: 100 }),
  getContext: () => ({
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {},
  }),
  toBlob(callback) {
    callback(new Blob(['PNG'], { type: 'image/png' }));
  },
});
const previousDocument = globalThis.document,
  previousWindow = globalThis.window;
globalThis.document = { createElement: imageCanvas };
globalThis.window = { devicePixelRatio: 1 };
const environment = {
  settings: {},
  assets: {},
  quality: 'standard',
  constellationArt: {
    update: () => [],
    status: () => ({ ready: 0 }),
    prepare(id, view, enabled) {
      preparations.push(enabled);
    },
    release(id) {
      releases.push(id);
    },
  },
};
const sceneState = { time: 'unchanged' };
let capture;
try {
  capture = createXuntianViewRenderer(
    { api: { renderer: gpu }, environment, current: sceneState },
    imageCanvas(),
    { skyOnly: true }
  );
  assert.equal(capture.groundPick([7000, 0, 0], view, frame.q), null);
  // Keep art loading enabled to exercise sky visibility at radius zero, while
  // the empty art manager makes caption painting unnecessary in this mock.
  const western = {
    ...frame,
    chartSettings: {
      ...frame.chartSettings,
      skyCulture: 'western',
      equatorialGrid: false,
      eclipticLine: false,
      starLabels: false,
      catalogStarLabels: false,
      solarSystemLabels: false,
      constellationNames: false,
      deepSkyObjects: false,
    },
    eyeKm: [7000, 0, 0],
    showStation: true,
  };
  await capture.capture(western, {
    width: 160,
    atShutter() {
      mainClockSamples++;
      throw Error('live clock');
    },
  });
  assert.equal(mainClockSamples, 0, 'a birthday capture cannot resample live time');
  assert(preparations.includes(true), 'zero geocentric radius must not reject the star field');
  assert(draws.length > 0, 'the actual solar render pass receives birthday positions');
  assert(
    Math.abs(draws[0][0]) < 1e-8 && Math.abs(draws[0][1]) < 1e-8,
    'the Sun at the independent birthday epoch is on the independently selected axis'
  );
  assert.deepEqual(sceneState, { time: 'unchanged' });
  assert.deepEqual(western.eyeKm, [7000, 0, 0], 'sky-only conversion cannot modify the caller');
  assert.equal(renderTarget, initialTarget);
  assert.equal(alpha, 0.6);
  assert.equal(clearColor, 0x123456);
  assert.equal(gpu.autoClear, true);
  assert.equal(gpu.xr.enabled, true);
  assert.deepEqual(gpu.shadowMap, { autoUpdate: true, needsUpdate: true });
} finally {
  capture?.dispose();
  globalThis.document = previousDocument;
  globalThis.window = previousWindow;
}
assert(releases.length >= 2, 'temporary annotation views must be released');
console.log(
  'Birthday sky: independent civil-time epoch, moving solar bodies, unchanged J2000 target, geocentric capture and shared renderer restoration passed.'
);
