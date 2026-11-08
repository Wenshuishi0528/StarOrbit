import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { spacecraftLabelNames } from '../src/spacecraft-labels.js';

const instances = [
  { id: 'TH', type: 'TH', name: '天和核心舱', visible: true },
  { id: 'TH_WENTIAN', type: 'WT', name: '问天 · 节点左侧', visible: true },
  { id: 'TH_FORWARD', type: 'XT', name: '巡天 · 节点前端', visible: true },
  { id: 'freeXT', type: 'XT', name: '巡天 · 独立飞行', visible: true },
];
const detailed = {
  TH: '天和核心舱',
  TH_WENTIAN: '问天 · 节点左侧',
  TH_FORWARD: '巡天 · 节点前端',
  freeXT: '巡天望远镜',
};
const telescope = { TH: '中国空间站', freeXT: '巡天望远镜' };
assert.deepEqual(spacecraftLabelNames(instances), detailed);
assert.deepEqual(spacecraftLabelNames(instances, { cameraTarget: 'xuntian' }), telescope);
assert.deepEqual(spacecraftLabelNames(instances, { scopeActive: true }), telescope);
assert.deepEqual(spacecraftLabelNames(instances, { cameraTarget: 'module:TH' }), detailed);
assert.deepEqual(spacecraftLabelNames(instances, { cameraTarget: 'all' }), detailed);
assert.deepEqual(spacecraftLabelNames(instances, { cameraTarget: 'xuntian', enabled: false }), {});
assert.deepEqual(spacecraftLabelNames(instances, { scopeActive: true, enabled: false }), {});

// Stale focus/scope state cannot retain a removed or hidden telescope label.
const withoutTelescope = instances.filter((item) => item.id !== 'freeXT');
const expectedStation = { ...detailed };
delete expectedStation.freeXT;
assert.deepEqual(spacecraftLabelNames(withoutTelescope, { scopeActive: true }), expectedStation);
assert.deepEqual(
  spacecraftLabelNames(
    instances.map((item) => ({ ...item, visible: item.id !== 'freeXT' })),
    {
      cameraTarget: 'xuntian',
    }
  ),
  expectedStation
);
assert.deepEqual(spacecraftLabelNames([instances.at(-1)], { scopeActive: true }), {
  freeXT: '巡天望远镜',
});
assert.deepEqual(
  spacecraftLabelNames(instances, { scopeActive: true, translate: (key) => `en:${key}` }),
  { TH: 'en:中国空间站', freeXT: 'en:巡天望远镜' }
);

// Exercise the actual animation-loop integration with a numeric RAF timestamp.
// A parameter named `t` previously shadowed the translation function, crashing
// the first frame containing a free telescope before sim.render() was reached.
const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const tickStart = appSource.indexOf('function tick(');
const tickEnd = appSource.indexOf('\nrequestAnimationFrame(tick);', tickStart);
assert(tickStart >= 0 && tickEnd > tickStart);
const tickSource = appSource.slice(tickStart, tickEnd);
let renderCount = 0,
  labelsEnabled = true,
  updateWall,
  drawWall;
const tags = Object.fromEntries(
  instances.map(({ id }) => [
    id,
    {
      el: { textContent: '', style: {} },
      anchor: {
        clone: () => ({ applyMatrix4: () => ({ project: () => ({ x: 0, y: 0, z: 0 }) }) }),
      },
    },
  ])
);
const context = {
  requestAnimationFrame() {},
  document: { hidden: false },
  resize() {},
  last: 1000,
  sim: {
    initialized: true,
    cameraFocus: { selected: 'xuntian', update() {} },
    xuntian: {
      active: true,
      draw: (wall) => {
        drawWall = wall;
      },
    },
    update: (wall) => {
      updateWall = wall;
    },
    render: () => {
      renderCount++;
    },
  },
  playing: false,
  model: { visible: true },
  controls: { update() {} },
  updateModelClipping() {},
  ready: true,
  tags,
  types: Object.fromEntries(instances.map(({ id, type }) => [id, type])),
  groups: Object.fromEntries(
    instances.map(({ id, visible }) => [id, { visible, matrixWorld: {} }])
  ),
  instanceName: (id) => instances.find((item) => item.id === id).name,
  spacecraftLabelNames,
  $: () => ({ checked: labelsEnabled }),
  t: (key) => `en:${key}`,
  camera: {},
  stage: { clientWidth: 800, clientHeight: 600 },
};
runInNewContext(`${tickSource}\ntick(1234);`, context);
assert.equal(renderCount, 1, 'a numeric RAF timestamp must not interrupt rendering');
assert.equal(updateWall, 1234);
assert.equal(drawWall, 1234);
assert.equal(tags.freeXT.el.textContent, 'en:巡天望远镜');
assert.equal(tags.TH.el.textContent, 'en:中国空间站');
assert.equal(tags.TH_WENTIAN.el.style.display, 'none');
labelsEnabled = false;
runInNewContext(`${tickSource}\ntick(1250);`, context);
assert.equal(renderCount, 2);
assert(Object.values(tags).every(({ el }) => el.style.display === 'none'));
console.log(
  'Spacecraft labels: telescope/station grouping, module restoration, visibility and translations passed.'
);
