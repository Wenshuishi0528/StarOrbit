import assert from 'node:assert/strict';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import {PerspectiveCamera, Vector3} from 'three';

const bundle = new URL('../output/tests/preset-weather.mjs', import.meta.url);
await fs.mkdir(new URL('.', bundle), {recursive: true});
await build({entryPoints: ['src/weather.js'], bundle: true, platform: 'node', format: 'esm', outfile: bundle.pathname, logLevel: 'silent'});
const {Weather} = await import(bundle.href);
const values = new Map(), elements = new Map();
globalThis.localStorage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
globalThis.document = {getElementById(id) {
  if (!elements.has(id)) elements.set(id, {value: ''});
  return elements.get(id);
}};
document.getElementById('environmentPresets').value = '0';
document.getElementById('environmentPresetName').value = 'Saved view';
const camera = () => new PerspectiveCamera(38, 1, .1, 100000);
const controls = () => ({target: new Vector3(), stopMotion() {}, update() {}});
const weather = Object.create(Weather.prototype);
const sim = {
  missionId: 'tiangong', time: Date.parse('2026-10-28T00:00:00Z'), view: 'follow',
  orbits: {selected: 'none', records: {dfh1: 'other-mission-orbit'}, save() {}},
  missions: {state: {rotation: {}}, async switchTo() {}, syncUI() {}},
  spaceCamera: camera(), orbitControls: controls(),
  seek(value) { this.time = value; }, setView(value) { this.view = value; },
};
Object.assign(weather, {
  sim, items: [], active: {},
  settings: {
    cloud: 'builtin', aurora: 'local', cloudHistory: 'auto', auroraHistory: 'auto',
    seed: 'saved-seed', auroraStrength: 1.4, exposure: 1.15, volume: false, motion: true,
    limit: 200, autoClean: true, resourceChecks: {cloud: {checkedAt: 1}},
    cloudDownloadProvider: 'satcorps', adaptive: true,
  },
  env: {
    api: {camera: camera(), controls: controls(), renderer: {}, toast() {}},
    settings: {quality: 'standard', cloudNightVisible: true},
    phenomena: {settings: {}, restore() {}},
    save() {}, async setQuality() {}, async setSkyStyle() {},
  },
  renderPresets() {}, useOrbit(data) { sim.data = data; }, async apply() {},
});
weather.savePreset();
const saved = weather.presets()[0];
for (const key of ['limit', 'autoClean', 'resourceChecks', 'cloudDownloadProvider', 'adaptive']) {
  assert(!Object.hasOwn(saved.settings, key), key + ' must not be captured by a new preset');
}
assert.equal(saved.settings.orbitRecord, 'none');
assert.equal(saved.settings.seed, 'saved-seed');

// Old presets contain a complete weather-settings object. Loading one must keep
// newer global preferences and check history, while actually restoring the view.
Object.assign(saved.settings, {limit: 20, autoClean: true, adaptive: true, cloudDownloadProvider: 'satcorps', resourceChecks: {cloud: {checkedAt: 1}}, orbitRecords: {dfh1: 'stale'}});
localStorage.setItem('tiangong-environment-presets-v1', JSON.stringify([saved]));
const currentChecks = {cloud: {checkedAt: 200}};
Object.assign(weather.settings, {cloud: 'off', seed: 'changed', limit: 600, autoClean: false, adaptive: false, cloudDownloadProvider: 'github', resourceChecks: currentChecks});
sim.time += 60000;
await weather.loadPreset();
assert.equal(weather.settings.cloud, 'builtin');
assert.equal(weather.settings.seed, 'saved-seed');
assert.equal(sim.time, saved.time);
assert.equal(weather.settings.limit, 600);
assert.equal(weather.settings.autoClean, false);
assert.equal(weather.settings.adaptive, false);
assert.equal(weather.settings.cloudDownloadProvider, 'github');
assert.equal(weather.settings.resourceChecks, currentChecks);
assert.deepEqual(sim.orbits.records, {dfh1: 'other-mission-orbit'});
assert.equal(document.getElementById('cacheLimit').value, 600);
assert.equal(document.getElementById('autoCleanCache').checked, false);
assert.equal(JSON.parse(localStorage.getItem('tiangong-weather-settings-v1')).limit, 600);
assert.equal(sim.sceneBusy, false);
console.log('New and legacy presets restore visual state while preserving global cache, update and performance preferences.');
