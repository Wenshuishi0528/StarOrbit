import * as THREE from 'three';
import { StarChart } from './star-chart.js';
import { SkyDetailLayer } from './sky-detail-layer.js';
import { ConstellationArtLayer } from './constellation-art-layer.js';
import {
  skyCultureArtOptions,
  skyCultureArtEnabled,
  syncStarChartControls,
} from './star-chart-settings.js';
import { resolveSkyDetailSource } from './sky-detail-plan.js';
import { t, onLanguageChange } from './i18n.js';
import { earthAxes, sunPosition } from './orbit.js';

export function readWorldSkySettings(environment) {
  const s = environment.settings;
  return {
    chart: s.starChartEnabled,
    culture: s.skyCulture,
    lines: s.constellationLines,
    names: s.starLabels || s.constellationNames,
    art: s.constellationArt,
    symbols: s.chineseSymbolArt,
    symbolOpacity: s.chineseSymbolOpacity,
    boundaries: s.constellationBoundaries,
    deepSky: s.deepSkyObjects,
    grid: s.equatorialGrid,
    ecliptic: s.eclipticLine,
    source: resolveSkyDetailSource(s),
    artBrightness: s.skyCulture === 'chinese' ? s.chineseArtBrightness : s.westernArtBrightness,
    starBrightness: s.starBrightness,
    density: s.starLabelDensity,
  };
}
export function applyWorldSkySettings(environment, patch) {
  const s = environment.settings;
  const fields = {
    chart: 'starChartEnabled',
    culture: 'skyCulture',
    lines: 'constellationLines',
    art: 'constellationArt',
    symbols: 'chineseSymbolArt',
    symbolOpacity: 'chineseSymbolOpacity',
    boundaries: 'constellationBoundaries',
    deepSky: 'deepSkyObjects',
    grid: 'equatorialGrid',
    ecliptic: 'eclipticLine',
    source: 'skyDetailSource',
    starBrightness: 'starBrightness',
    density: 'starLabelDensity',
  };
  for (const [key, field] of Object.entries(fields))
    if (patch[key] !== undefined) s[field] = patch[key];
  if (patch.names !== undefined) s.starLabels = s.constellationNames = patch.names;
  if (patch.artBrightness !== undefined)
    s[s.skyCulture === 'chinese' ? 'chineseArtBrightness' : 'westernArtBrightness'] =
      patch.artBrightness;
  if (patch.source !== undefined) s.skyDetail = patch.source !== 'galaxy';
  if (patch.chart === undefined) s.starChartEnabled = true;
  syncStarChartControls(s);
  environment.skyDetailControls?.update?.();
  environment.save?.();
}

// Reuse the main star chart, atlas renderer and bounded resource managers.
// Only view geometry/material uniforms belong to this consumer. Physical Earth,
// planets and terrain are drawn afterwards by the caller, so no geocentric mask
// is applied to this centered sky pass.
export function createSharedWorldSky({ environment, renderer, id = 'world-sky' }) {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(65, 1, 0.1, 3000);
  const chartScene = new THREE.Scene();
  const stars = new THREE.Points(environment.stars.geometry, environment.stars.material.clone());
  stars.frustumCulled = false;
  stars.renderOrder = 2;
  scene.add(stars);
  const galaxy = new THREE.Mesh(environment.milky.geometry, environment.milky.material.clone());
  galaxy.renderOrder = 0;
  scene.add(galaxy);
  // ShaderMaterial.clone clones sampler textures; replace borrowed samplers and
  // release the clone, without touching the actual shared texture owner.
  const clonedMap = galaxy.material.uniforms.skyMap.value;
  if (clonedMap && clonedMap !== environment.galaxyTexture) clonedMap.dispose();
  galaxy.material.uniforms.skyMap.value = environment.galaxyTexture || null;
  const stage = { clientWidth: 1, clientHeight: 1 };
  const adapter = {
    backdrop: chartScene,
    settings: {},
    skyOnly: true,
    quality: environment.quality,
    api: { stage, camera },
    moon: { mesh: { position: new THREE.Vector3(), visible: false } },
    sim: { view: 'world', current: null, shadowCache: { records: [] } },
  };
  const chart = new StarChart(adapter);
  const detail = new SkyDetailLayer(environment.skyDetail, id + '-detail');
  const art = environment.constellationArt
    ? new ConstellationArtLayer(environment.constellationArt, id + '-art', false, 4)
    : null;
  let disposed = false,
    lastTime = NaN,
    showChart = true,
    showArt = true,
    showDetail = true;
  const axis = new THREE.Vector3();
  return {
    scene,
    camera,
    chart,
    detail,
    art,
    update(input, time, width, height, options = {}) {
      camera.quaternion.copy(input.quaternion);
      camera.fov = input.fov;
      camera.zoom = input.zoom || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      stage.clientWidth = width;
      stage.clientHeight = height;
      if (time !== lastTime) {
        adapter.sim.current = {
          t: time,
          position: [0, 0, 0],
          earthAxes: earthAxes(time),
          sun: sunPosition(time),
        };
        lastTime = time;
      }
      const brightness = options.brightness ?? environment.settings.starBrightness ?? 1;
      const s = {
        ...environment.settings,
        ...options.settings,
        starBrightness: brightness,
        solarSystemLabels: false,
      };
      adapter.settings = s;
      adapter.skyCultureFocus = options.focusTargetId || null;
      const view = {
        right: axis.set(1, 0, 0).applyQuaternion(camera.quaternion).toArray(),
        up: axis.set(0, 1, 0).applyQuaternion(camera.quaternion).toArray(),
        forward: axis.set(0, 0, -1).applyQuaternion(camera.quaternion).toArray(),
        fovY: (2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) / camera.zoom) * 180) / Math.PI,
        aspect: camera.aspect,
        pixelHeight: height * renderer.getPixelRatio(),
        wideField: options.wideField === true,
      };
      stars.visible = options.showStars !== false && s.stars !== false;
      stars.material.uniforms.brightness.value = brightness;
      stars.material.uniforms.pixelRatio.value = renderer.getPixelRatio();
      stars.material.uniforms.high.value = s.exposure === 'cinematic' ? 1 : 0;
      galaxy.visible = options.showGalaxy !== false && s.milky !== false;
      galaxy.material.uniforms.skyMap.value = environment.galaxyTexture || null;
      galaxy.material.uniforms.textured.value = environment.galaxyTexture ? 1 : 0;
      galaxy.material.uniforms.brightness.value = brightness;
      showChart = options.showChart !== false;
      if (showChart) chart.update(camera);
      showArt = options.showArt !== false;
      art?.update(
        view,
        showArt &&
          s.stars !== false &&
          brightness > 0 &&
          s.starChartEnabled &&
          skyCultureArtEnabled(s),
        {
          ...skyCultureArtOptions(s),
          focusTargetId: options.focusTargetId || null,
        }
      );
      showDetail = options.showDetail !== false;
      // One manager/source for every observer. Leaving a mode releases only its
      // demand; it never shuts down or disposes the shared cache.
      environment.skyDetail.setSource(resolveSkyDetailSource(s));
      if (showDetail && s.skyDetail !== false && !environment.skyDetail.enabled)
        environment.skyDetail.setEnabled(true);
      detail.update(
        view,
        showDetail && s.skyDetail !== false && s.stars !== false && brightness > 0,
        {
          skyGain: brightness,
        }
      );
      return { view, labels: chart.shown, detail: environment.skyDetail.status(id + '-detail') };
    },
    render() {
      if (disposed) return;
      renderer.render(scene, camera);
      if (showDetail) renderer.render(detail.scene, camera);
      if (showArt && art) renderer.render(art.scene, camera);
      if (showChart) renderer.render(chartScene, camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      detail.dispose();
      art?.dispose();
      stars.material.dispose();
      galaxy.material.dispose();
      const geometries = new Set(),
        materials = new Set();
      chartScene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) materials.add(o.material);
      });
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      chart.texture?.dispose();
      chartScene.clear();
      scene.clear();
    },
  };
}

export function mountWorldSkyControls(host, environment, { onChange = () => {} } = {}) {
  const root = document.createElement('details');
  root.className = 'shared-world-sky-controls';
  const checks = [
    ['stars', '恒星'],
    ['milky', '银河'],
    ['starChartEnabled', '星图标注'],
    ['starLabels', '恒星名称'],
    ['catalogStarLabels', '无常用名恒星 · 星表标识'],
    ['constellationNames', '星座名称'],
    ['constellationLines', '星座连线'],
    ['constellationBoundaries', '星座边界'],
    ['deepSkyObjects', '深空天体'],
    ['equatorialGrid', '赤道坐标网'],
    ['eclipticLine', '黄道'],
    ['constellationArt', '星空插画'],
    ['chineseSymbolArt', '总览插画 · 四象、三垣'],
  ];
  root.innerHTML =
    '<summary data-key="星图与画面"></summary><label data-key="星空体系"></label><select data-setting="skyCulture"><option value="western" data-key="西方星座"></option><option value="chinese" data-key="中国星官"></option></select><label data-key="星空图源"></label><select data-setting="skyDetailSource"><option value="auto">Auto · DSS / Pan-STARRS</option><option value="galaxy" data-key="银河"></option><option value="dss">DSS2 Color</option><option value="panstarrs">Pan-STARRS</option><option value="recent" data-key="近期巡天影像"></option></select>' +
    checks
      .map(
        ([key, label]) =>
          `<label><input type="checkbox" data-setting="${key}"> <span data-key="${label}"></span></label>`
      )
      .join('') +
    '<label data-key="深空天体范围"></label><select data-setting="deepSkyScope"><option value="featured" data-key="精选"></option><option value="messier">Messier</option><option value="all" data-key="全部"></option></select><label data-key="星空亮度"></label><input type="range" data-setting="starBrightness" min="0" max="2.5" step=".05"><label data-key="标注密度"></label><input type="range" data-setting="starLabelDensity" min="0" max="1" step=".01"><label data-key="西方插画亮度"></label><input type="range" data-setting="westernArtBrightness" min="0" max="2" step=".05"><label data-key="中国插画亮度"></label><input type="range" data-setting="chineseArtBrightness" min="0" max="2" step=".05"><label data-key="总览插画透明度"></label><input type="range" data-setting="chineseSymbolOpacity" min="0" max="1" step=".02">';
  host.append(root);
  function refresh() {
    for (const el of root.querySelectorAll('[data-setting]')) {
      const value = environment.settings[el.dataset.setting];
      if (el.type === 'checkbox') el.checked = !!value;
      else if (document.activeElement !== el) el.value = value;
    }
  }
  function translate() {
    root.querySelectorAll('[data-key]').forEach((el) => (el.textContent = t(el.dataset.key)));
  }
  root.addEventListener('change', (event) => {
    const el = event.target,
      key = el.dataset.setting;
    if (!key) return;
    environment.settings[key] =
      el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    if (key === 'skyDetailSource') environment.settings.skyDetail = el.value !== 'galaxy';
    if (key !== 'starChartEnabled') environment.settings.starChartEnabled = true;
    syncStarChartControls(environment.settings);
    environment.skyDetailControls?.update?.();
    environment.save?.();
    onChange();
    refresh();
  });
  const off = onLanguageChange(translate);
  translate();
  refresh();
  return {
    root,
    refresh,
    dispose() {
      off();
      root.remove();
    },
  };
}
