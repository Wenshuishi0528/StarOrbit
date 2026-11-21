process.on('uncaughtException', (error) => {
  console.error(error.name + ': ' + error.message);
  process.exitCode = 1;
});
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({
  stdin: {
    contents:
      "export * from './src/shared-world-sky.js';export {createGroundSky} from './src/ground-world-sky.js';export {STAR_CHART_DEFAULTS} from './src/star-chart-settings.js';export * as THREE from 'three';",
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
  createGroundSky,
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
geometry.setAttribute('mag', new THREE.Float32BufferAttribute([-1.4, 0, 3, 3, 6.5, 8], 1));
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
const galaxy = sky.scene.children.find((item) => item.isMesh);
const points = sky.scene.children.find((item) => item.isPoints);
sky.update(camera, time + 2000, 1200, 800, {
  texturedGalaxy: false,
  catalogueOverlay: true,
  detailSelection: { source: 'hubble', artworkId: 'hubble-heic1501a', background: 'dss' },
});
assert.equal(
  sky.detail.group.parent,
  points.parent,
  'reference meshes render behind the live star overlay'
);
assert.notEqual(sky.detail.group.parent, sky.scene);
sky.update(camera, time, 500, 300, {
  brightness: 0,
  detailBrightness: 1.5,
  showDetail: true,
  catalogueOverlay: true,
  detailSelection: { source: 'dss' },
});
assert.equal(points.material.uniforms.brightness.value, 0);
assert.equal(sky.detail.uniforms.skyGain.value, 1.5);
assert.equal(requests.at(-1).enabled, true, 'daylight cannot release an explicit survey');
sky.update(camera, time, 500, 300, {
  catalogueOverlay: true,
  detailSelection: { source: 'hubble', artworkId: 'hubble-heic1501a', background: 'dss' },
  texturedGalaxy: false,
});
assert.equal(galaxy.material.uniforms.textured.value, 0);
assert.equal(points.visible, true);
assert.equal(requests.at(-1).enabled, true);
assert.equal(requests.at(-1).view.detailSelection.source, 'hubble');
assert.equal(manager.source, 'dss');
sky.update(camera, time + 2000, 1200, 800, {
  texturedGalaxy: false,
  showDetail: false,
  detailSelection: null,
});
assert.equal(sky.detail.group.parent, sky.detail.scene);
assert.equal(requests.at(-1).enabled, false);
assert.equal(manager.source, 'dss');
sky.update(camera, time + 3000, 1200, 800, { showChart: false, showArt: false, showDetail: false });
assert.equal(galaxy.material.uniforms.textured.value, 1);
assert.equal(requests.at(-1).enabled, false, 'inactive imagery consumer releases demand');
const baselineRange = { ...geometry.drawRange };
const limited = sky.update(camera, time, 1200, 800, { starMagnitudeLimit: 3 });
assert.equal(limited.starCount, 4);
assert.notEqual(points.geometry, geometry);
assert.equal(points.geometry.getAttribute('mag'), geometry.getAttribute('mag'));
assert.deepEqual(geometry.drawRange, baselineRange);
assert.equal(sky.update(camera, time, 1200, 800, { starMagnitudeLimit: 8 }).starCount, 6);
sky.update(camera, time, 1200, 800, {});
assert.equal(points.geometry, geometry);
sky.dispose();
sky.dispose();
assert.deepEqual(releases.sort(), ['test-world-art', 'test-world-detail']);
assert.equal(textureDisposals, 0);
assert.equal(geometryDisposals, 0);
assert.equal(saves, 2);

// The natural daylight view, enhanced finder and telescope all use the same
// Sun. Each consumer owns its star limit, signal gain and survey request.
Object.assign(renderer, {
  autoClear: true,
  clear() {},
  clearDepth() {},
  getClearAlpha: () => 1,
  getClearColor: (c) => c.set(0),
  setClearColor() {},
});
env.assets = { planets: {} };
env.settings.starChartEnabled = false;
const finder = createGroundSky({ environment: env, renderer });
const scope = createGroundSky({ environment: env, renderer, id: 'ground-scope' });
const site = { latitude: 39.9, longitude: 116.4, height: 52 };
const noon = Date.parse('2026-06-21T04:00:00Z');
const pose = { azimuth: 55, elevation: 30 };
const base = { stargazing: true, appearance: 'natural', fov: 60 };
function starMaterial(sky) {
  draws.length = 0;
  sky.render();
  return draws
    .flatMap(({ scene }) => scene.children)
    .find((o) => o.isPoints && o.material.uniforms?.high).material;
}
const natural = finder.update(site, noon, pose, base, 1000, 600);
assert(natural.sunAltitude > 50);
assert.equal(natural.night, 0);
assert.equal(starMaterial(finder).uniforms.brightness.value, 0);
const enhanced = finder.update(site, noon, pose, { ...base, finderEnhanced: true }, 1000, 600);
assert.equal(enhanced.night, natural.night);
assert.deepEqual(enhanced.sunDirection, natural.sunDirection);
assert.equal(starMaterial(finder).uniforms.brightness.value, 1);
const optics = {
  ...base,
  finderEnhanced: true,
  fov: 2,
  eyeCircleDiameter: 186,
  starMagnitudeLimit: 3,
  exposureEV: 1,
  apertureMm: 160,
  pixelRatio: 1.25,
  referenceSource: 'recent',
  referenceArtwork: 'jwst-test',
  referenceBackground: 'dss',
};
const magnified = scope.update(site, noon, { azimuth: 128, elevation: 17 }, optics, 240, 200);
assert.equal(magnified.starMagnitudeLimit, 3, 'a supplied optical cutoff is already compensated');
assert.equal(magnified.starCount, 4);
assert.equal(magnified.view.pixelHeight, 250);
assert.equal(magnified.view.aspect, 1.2);
assert.equal(starMaterial(scope).uniforms.brightness.value, 8);
assert.equal(starMaterial(scope).uniforms.pixelRatio.value, 1.25);
assert.equal(starMaterial(finder).uniforms.brightness.value, 1);
const scopeRequest = requests.findLast((request) => request.id === 'ground-scope-detail');
assert.equal(scopeRequest.enabled, true);
assert.deepEqual(scopeRequest.view.detailSelection, {
  source: 'recent',
  artworkId: 'jwst-test',
  background: 'dss',
});
assert.equal(requests.findLast((request) => request.id === 'ground-world-detail').enabled, false);
assert.equal(manager.source, 'dss');
for (const finderEnhanced of [false, true]) {
  for (const referenceSource of [null, 'dss']) {
    const status = scope.update(
      site,
      noon,
      pose,
      { ...optics, finderEnhanced, referenceSource },
      240,
      200
    );
    assert.equal(status.night, 0);
    assert.deepEqual(status.sunDirection, natural.sunDirection);
    assert.equal(starMaterial(scope).uniforms.brightness.value, finderEnhanced ? 8 : 0);
    const airDraw = draws.findIndex(({ scene }) =>
      scene.children.some((o) => o.material?.uniforms?.airVisibility)
    );
    const air = draws[airDraw].scene.children[0].material.uniforms;
    assert.equal(air.natural.value, finderEnhanced ? 0.1 : 1);
    const request = requests.findLast((entry) => entry.id === 'ground-scope-detail');
    assert.equal(request.enabled, !!referenceSource);
    if (referenceSource) {
      const archivalDraw = draws.findIndex(({ scene }) =>
        scene.children.some((o) => o.isPoints && o.material.uniforms?.high)
      );
      assert(
        archivalDraw > airDraw,
        'the historical image and catalogue overlay are drawn after the local sky colour'
      );
      assert.equal(request.view.detailSelection.source, 'dss');
    }
  }
}
scope.update(
  site,
  noon,
  pose,
  { ...optics, exposureGain: 0.5, apertureGain: 2, referenceSource: null },
  240,
  200
);
assert.equal(starMaterial(scope).uniforms.brightness.value, 1, 'precomputed gains apply once');
assert.equal(requests.findLast((request) => request.id === 'ground-scope-detail').enabled, false);
const narrow = scope.update(
  site,
  noon,
  pose,
  { ...base, finderEnhanced: true, eyeCircleDiameter: 186, apertureMm: 40 },
  240,
  200
);
assert(narrow.starMagnitudeLimit < 8);
env.settings.starChartEnabled = true;
const clean = scope.update(site, noon, pose, { ...optics, photoAnnotations: false }, 240, 200);
assert.equal(starMaterial(scope).uniforms.brightness.value, 8);
const cleanDrawCount = draws.length;
assert.equal(requests.findLast((item) => item.id === 'ground-scope-art').enabled, false);
assert.equal(requests.findLast((item) => item.id === 'ground-scope-detail').enabled, true);
const annotated = scope.update(site, noon, pose, optics, 240, 200);
starMaterial(scope);
assert.equal(draws.length, cleanDrawCount + 2, 'only the chart and art passes differ');
assert.equal(clean.starCount, annotated.starCount);
scope.dispose();
finder.dispose();
assert.deepEqual(releases.slice(2).sort(), [
  'ground-scope-art',
  'ground-scope-detail',
  'ground-world-art',
  'ground-world-detail',
]);
assert.equal(textureDisposals, 0);
assert.equal(geometryDisposals, 0);
console.log(
  'Shared world sky: real chart labels and all-culture lines, master settings, DSS close zoom, shared assets and consumer-only disposal passed.'
);
