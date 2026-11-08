process.on('uncaughtException', (error) => {
  console.error(error.name + ': ' + error.message);
  process.exitCode = 1;
});
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({
  stdin: {
    contents:
      "export * from './src/shared-world-sky.js';export {STAR_CHART_DEFAULTS} from './src/star-chart-settings.js';export * as THREE from 'three';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const {
  createSharedWorldSky,
  readWorldSkySettings,
  applyWorldSkySettings,
  STAR_CHART_DEFAULTS,
  THREE,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);
globalThis.document = {
  getElementById: () => ({}),
  createElement: () => ({
    width: 1,
    height: 1,
    getContext: () => ({ fillText() {}, measureText: (s) => ({ width: [...s].length * 16 }) }),
  }),
};
const releases = [],
  requests = [],
  draws = [];
const manager = {
  enabled: true,
  setSource(value) {
    this.source = value;
  },
  setEnabled(value) {
    this.enabled = value;
  },
  update(id, view, enabled) {
    requests.push({ id, view, enabled });
    return [];
  },
  ready: () => [],
  status: () => ({ ready: 0 }),
  release: (id) => releases.push(id),
};
const sharedTexture = new THREE.Texture();
let textureDisposals = 0,
  geometryDisposals = 0,
  saves = 0;
sharedTexture.addEventListener('dispose', () => textureDisposals++);
const geometry = new THREE.BufferGeometry();
geometry.addEventListener('dispose', () => geometryDisposals++);
const env = {
  settings: {
    ...STAR_CHART_DEFAULTS,
    stars: true,
    milky: true,
    starBrightness: 1,
    starChartEnabled: true,
    skyDetail: true,
    skyDetailSource: 'dss',
    exposure: 'cinematic',
  },
  quality: 'high',
  stars: {
    geometry,
    material: new THREE.ShaderMaterial({
      uniforms: { brightness: { value: 1 }, pixelRatio: { value: 1 }, high: { value: 1 } },
    }),
  },
  milky: {
    geometry,
    material: new THREE.ShaderMaterial({
      uniforms: {
        skyMap: { value: sharedTexture },
        textured: { value: 1 },
        brightness: { value: 1 },
      },
    }),
  },
  galaxyTexture: sharedTexture,
  skyDetail: manager,
  constellationArt: manager,
  save() {
    saves++;
  },
};
const renderer = {
  getPixelRatio: () => 2,
  render: (scene, camera) => draws.push({ scene, camera }),
};
const sky = createSharedWorldSky({ environment: env, renderer, id: 'test-world' });
const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 1e6);
camera.up.set(0, 0, 1);
camera.lookAt(1, 0, 0);
const time = Date.parse('2026-11-08T00:00:00Z');
const status = sky.update(camera, time, 1200, 800);
assert.equal(sky.chart.env.skyOnly, true);
assert.equal(
  sky.chart.uniforms.earthDisc.value.w,
  2,
  'centered sky labels must not be hidden inside a fictitious Earth'
);
assert(sky.chart.stats.visible > 0, 'full shared chart must produce actual labels');
assert(
  sky.chart.lines.geometry.attributes.position.count > 0,
  'all current-culture lines exist without a selected formation'
);
assert.equal(sky.scene.children[0].geometry, geometry, 'star data is borrowed');
assert.equal(sky.scene.children[1].material.uniforms.skyMap.value, sharedTexture);
assert.equal(sky.camera.aspect, 1.5);
assert.equal(status.view.fovY, 65);
sky.render();
assert.equal(draws.length, 4, 'stars, detail, art and full chart use common sky pipeline');
applyWorldSkySettings(env, { culture: 'chinese', chart: false });
assert.equal(readWorldSkySettings(env).chart, false);
assert.equal(env.settings.starChartEnabled, false);
applyWorldSkySettings(env, { lines: true, artBrightness: 1.4 });
assert.equal(env.settings.starChartEnabled, true);
assert.equal(env.settings.chineseArtBrightness, 1.4);
sky.update(camera, time + 1000, 1200, 800);
assert.equal(sky.chart.culture, 'chinese');
assert(sky.chart.stats.asterisms > 300);
camera.fov = 0.006;
sky.update(camera, time + 2000, 1200, 800, { wideField: true });
assert(
  Math.abs(requests.at(-2).view.fovY - 0.006) < 1e-10 ||
    Math.abs(requests.at(-1).view.fovY - 0.006) < 1e-10
);
assert.equal(requests.at(-1).view.wideField, true);
sky.update(camera, time + 3000, 1200, 800, { showChart: false, showArt: false, showDetail: false });
assert.equal(requests.at(-1).enabled, false, 'inactive imagery consumer releases demand');
sky.dispose();
sky.dispose();
assert.deepEqual(releases.sort(), ['test-world-art', 'test-world-detail']);
assert.equal(textureDisposals, 0);
assert.equal(geometryDisposals, 0);
assert.equal(saves, 2);
console.log(
  'Shared world sky: real chart labels and all-culture lines, master settings, DSS close zoom, shared assets and consumer-only disposal passed.'
);
