import assert from 'node:assert/strict';
import {installSidebar} from '../src/sidebar.js';

function mount(saved) {
  let persisted = saved;
  globalThis.localStorage = {getItem: () => persisted, setItem: (_, value) => { persisted = value; }};
  const elements = new Map([['expandSettings', {}], ['collapseSettings', {}]]);
  const sections = ['mission', 'orbit', 'environment', 'sharing'].map(key => {
    const button = {getAttribute: () => 'settings-' + key, setAttribute() {}, addEventListener(_, fn) { this.click = fn; }};
    elements.set('settings-' + key, {});
    return {dataset: {settingsModule: key}, querySelector: () => button};
  });
  globalThis.document = {querySelectorAll: () => sections, getElementById: id => elements.get(id)};
  installSidebar();
  return {elements, saved: () => persisted};
}
let page = mount(null);
assert.equal(page.elements.get('settings-mission').hidden, false);
assert.equal(page.elements.get('settings-orbit').hidden, false);
assert.equal(page.elements.get('settings-environment').hidden, true);
assert.equal(page.elements.get('settings-sharing').hidden, true);
page = mount(JSON.stringify({mission: false, environment: true}));
assert.equal(page.elements.get('settings-mission').hidden, true);
assert.equal(page.elements.get('settings-environment').hidden, false);
page.elements.get('collapseSettings').onclick();
page = mount(page.saved());
for (const key of ['mission', 'orbit', 'environment', 'sharing']) assert.equal(page.elements.get('settings-' + key).hidden, true);
page.elements.get('expandSettings').onclick();
page = mount(page.saved());
for (const key of ['mission', 'orbit', 'environment', 'sharing']) assert.equal(page.elements.get('settings-' + key).hidden, false);
console.log('Sidebar defaults, existing choices and bulk controls persist across reloads.');
