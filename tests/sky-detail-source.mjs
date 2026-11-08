import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  normalizeSkyDetailSource,
  resolveSkyDetailSource,
  planSkyDetailSelection,
} from '../src/sky-detail-plan.js';

const manifest = JSON.parse(
  fs.readFileSync(new URL('../assets/sky-detail/manifest.json', import.meta.url))
);
const providers = manifest.providers.map((provider) => ({
  ...provider,
  tiles: provider.id === manifest.local.providerId ? manifest.local.tiles : undefined,
}));
const view = (ra = 0, dec = 0, fovY = 0.1) => {
  ra *= Math.PI / 180;
  dec *= Math.PI / 180;
  return {
    forward: [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)],
    right: [-Math.sin(ra), Math.cos(ra), 0],
    up: [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)],
    fovY,
    aspect: 1.6,
    pixelHeight: 2000,
  };
};
assert.equal(normalizeSkyDetailSource('unknown'), 'auto');
assert.equal(resolveSkyDetailSource({ skyDetail: false }), 'galaxy');
assert.equal(resolveSkyDetailSource({ skyDetail: false, skyDetailSource: 'panstarrs' }), 'galaxy');
assert.equal(resolveSkyDetailSource({ skyDetail: true, skyDetailSource: 'dss' }), 'dss');
const north = view(),
  recent = view(159.21303687393092, -58.62016558917656, 0.035);
for (const [source, providerId] of [
  ['dss', 'dss-color'],
  ['panstarrs', 'panstarrs'],
]) {
  const plan = planSkyDetailSelection(providers, north, source);
  assert.ok(plan.tiles.length > 0);
  assert.deepEqual(
    [...new Set(plan.tiles.map((tile) => tile.provider.id))],
    [providerId],
    'parents and children must use the selected survey'
  );
  assert.ok(new Set(plan.tiles.map((tile) => tile.order)).size > 1);
}
assert.equal(planSkyDetailSelection(providers, north, 'galaxy').tiles.length, 0);
assert.equal(planSkyDetailSelection(providers, north, 'recent').fallback, 'outside-coverage');
assert.equal(planSkyDetailSelection(providers, recent, 'panstarrs').fallback, 'outside-coverage');
assert.equal(
  planSkyDetailSelection(providers, recent, 'panstarrs').tiles.length,
  0,
  'PS1 outside coverage must not silently become DSS'
);
const selection = planSkyDetailSelection(providers, recent, 'recent');
assert.ok(selection.tiles.length > 0 && selection.tiles.every((tile) => tile.provider.tiles));
assert.ok(
  planSkyDetailSelection(providers, recent, 'dss').tiles.every(
    (tile) => tile.provider.id === 'dss-color'
  )
);
assert.equal(planSkyDetailSelection(providers, view(0, 0, 38), 'dss').fallback, 'wide');
const autoIds = new Set(
  planSkyDetailSelection(providers, north, 'auto').tiles.map((tile) => tile.provider.id)
);
assert.ok(
  autoIds.has('dss-color') && autoIds.has('panstarrs'),
  'automatic fallback remains available'
);

// Exercise real control handlers with a small DOM surface; no browser/JSON-import dependency.
const nodes = new Map(
  [
    'skyDetailEnabled',
    'skyDetailSource',
    'xtSkyDetailSource',
    'skyDetailStatus',
    'skyDetailCredits',
    'viewSkyDetail',
    'xtSkyDetailTarget',
  ].map((id) => [id, { value: '', checked: false, disabled: false, textContent: '' }])
);
let clock = 0,
  saves = 0,
  observed = 0;
const manager = {
  source: 'auto',
  enabled: true,
  providers: [],
  setSource(value) {
    this.source = value;
  },
  setEnabled(value) {
    this.enabled = value;
  },
  status() {
    return { source: this.source, enabled: this.enabled, sources: [], requested: 0 };
  },
};
const env = {
  settings: {
    skyDetail: true,
    skyDetailSource: 'auto',
    stars: true,
    milky: true,
    starBrightness: 1,
    exposure: 'cinematic',
    pointing: [1, 0, 0],
    focal: 5000,
  },
  skyDetail: manager,
  save() {
    saves++;
  },
  sim: {
    missionId: 'tiangong',
    xuntian: {
      observeSkyDetail() {
        observed++;
      },
    },
  },
};
const originalOptics = JSON.stringify({
  pointing: env.settings.pointing,
  focal: env.settings.focal,
});
const context = vm.createContext({
  document: { getElementById: (id) => nodes.get(id) || null },
  performance: { now: () => clock },
  normalizeSkyDetailSource,
  resolveSkyDetailSource,
  t: (key, params = {}) => key.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? ''),
  setText: (id, value) => {
    nodes.get(id).textContent = value;
  },
  getLanguage: () => 'zh',
  getXuntianTarget: () => null,
});
vm.runInContext(
  fs
    .readFileSync(new URL('../src/sky-detail-controls.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\n/gm, '')
    .replaceAll('export ', ''),
  context
);
const controls = vm.runInContext(
  '({mountSkyDetailControls, skyDetailCaptionLines, paintSkyDetailCaption, skyDetailCredits})',
  context
);
const mounted = controls.mountSkyDetailControls(env);
nodes.get('xtSkyDetailSource').value = 'dss';
nodes.get('xtSkyDetailSource').onchange();
assert.equal(nodes.get('skyDetailSource').value, 'dss');
assert.equal(manager.source, 'dss');
assert.equal(nodes.get('skyDetailEnabled').checked, true);
nodes.get('skyDetailSource').value = 'galaxy';
nodes.get('skyDetailSource').onchange();
assert.equal(nodes.get('xtSkyDetailSource').value, 'galaxy');
assert.equal(nodes.get('skyDetailEnabled').checked, false);
assert.equal(env.settings.skyDetail, false);
assert.equal(manager.enabled, false);
nodes.get('skyDetailEnabled').checked = true;
nodes.get('skyDetailEnabled').onchange();
assert.equal(nodes.get('xtSkyDetailSource').value, 'auto');
assert.equal(manager.enabled, true);
env.settings.stars = false;
clock += 600;
mounted.update();
assert.ok(
  ['skyDetailEnabled', 'skyDetailSource', 'xtSkyDetailSource'].every((id) => nodes.get(id).disabled)
);
assert.equal(env.settings.stars, false, 'selecting imagery must not alter the global star switch');
assert.equal(
  JSON.stringify({ pointing: env.settings.pointing, focal: env.settings.focal }),
  originalOptics
);
env.settings.stars = true;
clock += 600;
mounted.update();
nodes.get('xtSkyDetailTarget').onclick();
assert.equal(observed, 1);
assert.equal(manager.source, 'recent');
assert.ok(saves > 0);

// Export names the actual fallback and stacks above city captions; SDO has none.
const fallback = {
  source: 'panstarrs',
  active: true,
  skyVisible: true,
  sources: [],
  requested: 0,
  fallback: 'outside-coverage',
  complete: false,
};
const lines = controls.skyDetailCaptionLines(fallback);
assert.ok(lines.some((line) => line.startsWith('Rendered: original Milky Way')));
assert.ok(lines.some((line) => line.includes('does not cover')));
assert.equal(controls.skyDetailCaptionLines({ ...fallback, skyVisible: false }).length, 0);
assert.ok(controls.skyDetailCredits({ source: 'recent', sources: [] }).includes('红外'));
const rectangles = [];
const canvas = {
  width: 960,
  height: 600,
  getContext: () => ({
    save() {},
    restore() {},
    fillText() {},
    fillRect(...args) {
      rectangles.push(args);
    },
  }),
};
const height = controls.paintSkyDetailCaption(canvas, fallback, 60);
assert.ok(height > 0);
assert.equal(rectangles[0][1] + rectangles[0][3], 540);

const html = fs.readFileSync(new URL('../src/xuntian-scope.html', import.meta.url), 'utf8');
assert.ok(!/<input[^>]+id="xtSkyDetail"/.test(html));
assert.ok(/<select id="xtSkyDetailSource"/.test(html));
const info = html.slice(html.indexOf('<details id="xtSkyDetailInfo"'));
assert.ok(
  info.indexOf('id="xtSkyDetailTarget"') < info.indexOf('</details>'),
  'target action belongs inside source details'
);
console.log(
  'Sky imagery selection: same-source LOD, coverage fallback, shared controls, legacy master compatibility and honest stacked export credits passed'
);

// A birthday postcard opts into full-field DSS; ordinary finder policy stays unchanged.
const wideProviders = [{id:'dss-color',minOrder:0,maxOrder:9,format:'jpg'}];
const wideView = {forward:[1,0,0],right:[0,1,0],up:[0,0,1],fovY:65,aspect:1.6,pixelHeight:1500};
const widePlan = planSkyDetailSelection(wideProviders,{...wideView,wideField:true},'dss');
assert(widePlan.tiles.length>0 && widePlan.tiles.length<=36);
assert(widePlan.tiles.every(t=>t.provider.id==='dss-color'));
assert.equal(planSkyDetailSelection(wideProviders,wideView,'dss').fallback,'wide');
assert.equal(planSkyDetailSelection(wideProviders,{...wideView,wideField:true},'galaxy').tiles.length,0);
