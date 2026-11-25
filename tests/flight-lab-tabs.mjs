// Task-lab tabs load their module on first selection; the dialog shell and sim.flightLab API
// are ready at boot. Tab modules are stand-ins so the test checks only the lab's wiring.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = fileURLToPath(new URL('..', import.meta.url));
const english = JSON.parse(fs.readFileSync(path.join(repo, 'src/i18n-en.json'), 'utf8'));
const source = fs.readFileSync(path.join(repo, 'src/flight-lab.js'), 'utf8');
const tabModules = {
  pass: ['pass-panel', 'mountPassPanel'],
  docking: ['docking-panel', 'mountDockingPanel'],
  exposure: ['exposure-lab', 'mountExposureLab'],
  balcony: ['balcony-lab', 'mountBalconyLab'],
  survey: ['survey-lab', 'mountSurveyLab'],
  cosmic: ['cosmic-lab', 'mountCosmicLab'],
  lunar: ['lunar-lab', 'mountLunarLab'],
};
for (const [file] of [...Object.values(tabModules), ['observation-journal']])
  assert.doesNotMatch(source, new RegExp(`^import .*'\\./${file}\\.js'`, 'm'), file + ' is lazy');

const fakes = {
  ...Object.fromEntries(
    Object.entries(tabModules).map(([tab, [file, mount]]) => [
      file,
      `globalThis.labLog.loaded.push(${JSON.stringify(tab)});
export function ${mount}(container, sim, assets) { return globalThis.labLog.mount(${JSON.stringify(tab)}, container, sim, assets); }`,
    ])
  ),
  'observation-journal': `globalThis.labLog.loaded.push('journal');
export function mountObservationJournal(dialog, store, hooks) { return globalThis.labLog.journal(hooks); }`,
  'observation-store': 'export class ObservationStore { save() {} dispose() {} }',
  'xuntian-catalog': 'export const getXuntianTarget = () => null;',
  orbit: 'export const validTime = Number.isFinite; export const stateAt = () => ({});',
};
const fakeModules = {
  name: 'fake-lab-modules',
  setup(b) {
    const names = Object.keys(fakes).join('|');
    b.onResolve({ filter: new RegExp(`^\\./(${names})\\.js$`) }, (args) =>
      args.importer.endsWith('flight-lab.js')
        ? { path: args.path.slice(2, -3), namespace: 'fake' }
        : undefined
    );
    b.onLoad({ filter: /.*/, namespace: 'fake' }, (args) => ({
      contents: fakes[args.path],
      loader: 'js',
    }));
  },
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starorbit-lab-'));
const realError = console.error,
  errors = [];
try {
  fs.mkdirSync(path.join(dir, 'src'));
  const entryFile = path.join(dir, 'src', 'entry.js');
  fs.writeFileSync(
    entryFile,
    `export { installFlightLab } from ${JSON.stringify(path.join(repo, 'src/flight-lab.js'))};
export { setLanguage } from ${JSON.stringify(path.join(repo, 'src/i18n.js'))};`
  );
  const { metafile } = await build({
    entryPoints: [entryFile],
    absWorkingDir: repo,
    bundle: true,
    format: 'esm',
    splitting: true,
    outdir: path.join(dir, 'out'),
    outExtension: { '.js': '.mjs' },
    metafile: true,
    plugins: [fakeModules],
    logLevel: 'silent',
  });
  const outputs = metafile.outputs,
    entry = Object.keys(outputs).find((file) => outputs[file].entryPoint?.endsWith('entry.js')),
    chunkOf = (input) => Object.keys(outputs).find((file) => outputs[file].inputs[input]);
  for (const [file] of [...Object.values(tabModules), ['observation-journal']])
    assert.notEqual(chunkOf('fake:' + file), entry, file + ' is a separate chunk');
  const balconyChunk = path.resolve(repo, chunkOf('fake:balcony-lab'));

  // Minimal DOM: the lab dialog, its tab bar and panels.
  class FakeElement {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.id = '';
      this.className = '';
      this.children = [];
      this.text = '';
      this.attributes = {};
      this.dataset = {};
      this.listeners = {};
      this.hidden = false;
      this.open = false;
      this.isConnected = true;
      this.classList = { toggle() {} };
    }
    get textContent() {
      return this.text + this.children.map((child) => child.textContent).join('');
    }
    set textContent(value) {
      this.text = String(value);
      this.children = [];
    }
    set innerHTML(html) {
      this.textContent = '';
      const stack = [this];
      for (const [, close, tag, attrs] of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>/g)) {
        if (close) {
          stack.pop();
          continue;
        }
        const el = new FakeElement(tag);
        for (const [, key, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g))
          el.setAttribute(key, value);
        stack.at(-1).append(el);
        stack.push(el);
      }
    }
    append(...items) {
      for (const item of items) {
        item.parentElement = this;
        this.children.push(item);
      }
    }
    prepend(item) {
      item.parentElement = this;
      this.children.unshift(item);
    }
    insertBefore(item) {
      this.append(item);
    }
    replaceChildren(...items) {
      this.textContent = '';
      this.append(...items);
    }
    remove() {
      const siblings = this.parentElement?.children;
      if (siblings?.includes(this)) siblings.splice(siblings.indexOf(this), 1);
      this.isConnected = false;
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key === 'id') this.id = String(value);
      if (key === 'class') this.className = String(value);
    }
    getAttribute(key) {
      return this.attributes[key] ?? null;
    }
    removeAttribute(key) {
      delete this.attributes[key];
    }
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn);
    }
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
      for (const fn of this.listeners.close || []) fn();
    }
    focus() {}
    scrollIntoView() {}
    getClientRects() {
      return [];
    }
    descendants() {
      return this.children.flatMap((child) => [child, ...child.descendants()]);
    }
    matches(selector) {
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
      const data = /^\[data-([a-z-]+)(?:=([\w-]+))?\]$/.exec(selector);
      if (!data) return false;
      const key = data[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return data[2] === undefined ? key in this.dataset : this.dataset[key] === data[2];
    }
    querySelectorAll(selector) {
      return this.descendants().filter((el) => el.matches(selector));
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
  }
  const registry = new Map();
  const byId = (id) => {
    if (!registry.has(id)) {
      const el = new FakeElement('div');
      el.id = id;
      registry.set(id, el);
    }
    return registry.get(id);
  };
  byId('helpPanel').hidden = true;
  const hashListeners = new Set();
  globalThis.document = {
    documentElement: {},
    title: '',
    head: new FakeElement('head'),
    body: new FakeElement('body'),
    createElement: (tag) => new FakeElement(tag),
    getElementById: byId,
  };
  globalThis.location = { pathname: '/', search: '', hash: '' };
  globalThis.history = {
    replaceState(state, title, url) {
      location.hash = url.slice(url.indexOf('#'));
    },
  };
  globalThis.window = {
    addEventListener: (type, fn) => hashListeners.add(fn),
    removeEventListener: (type, fn) => hashListeners.delete(fn),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem() {} },
  });

  const calls = [],
    log = (...entry) => calls.push(entry.join(':')),
    count = (entry) => calls.filter((x) => x === entry).length;
  let journalHooks = null;
  globalThis.labLog = {
    loaded: [],
    mount(tab, container, sim, assets) {
      log(tab, 'mount');
      assert.equal(container.id, tab + 'Panel');
      assert.equal(sim, simulation);
      assert.equal(assets, labAssets);
      const panel = {
        tab,
        resume: () => log(tab, 'resume'),
        pause: () => log(tab, 'pause'),
        dispose: () => log(tab, 'dispose'),
        getObservationRecord: () => ({ record: { kind: tab } }),
        restoreObservationRecord: async () => log(tab, 'restore'),
        showLivePhotos: (field, record) => log(tab, 'photos', field, record),
        openPass: () => (log(tab, 'openPass'), 'pass-opened'),
        openGroundCapture: async () => (log(tab, 'capture'), true),
        selectTarget: async (id) => log(tab, 'target', id),
      };
      // Some real panels expose deactivate(); the lab prefers it over pause().
      if (['docking', 'cosmic', 'lunar'].includes(tab))
        panel.deactivate = () => log(tab, 'deactivate');
      return panel;
    },
    journal(hooks) {
      journalHooks = hooks;
      return {
        setTab: (tab) => log('journal', 'tab', tab),
        close() {},
        dispose: () => log('journal', 'dispose'),
      };
    },
  };
  const toasts = [];
  const simulation = {
    sceneBusy: false,
    missions: { busy: false },
    api: { toast: (...args) => toasts.push(args) },
    data: {},
    seek: (time) => log('sim', 'seek', time),
    update() {},
    setView: (view) => log('sim', 'view', view),
  };
  const labAssets = { templates: {}, meta: {} };
  console.error = (...args) => errors.push(args);
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  async function until(test, label) {
    for (let i = 0; i < 400; i++) {
      if (test()) return;
      await tick();
    }
    assert.fail('timed out: ' + label);
  }

  const { installFlightLab, setLanguage } = await import(pathToFileURL(path.resolve(repo, entry)));
  const lab = installFlightLab(simulation, labAssets);
  const dialog = document.body.children.find((el) => el.id === 'flightLab');
  const $ = (id) => dialog.querySelector('#' + id);
  const status = (tab) => $(tab + 'Panel').querySelector('[data-lab-status]');

  // Boot creates the shell, buttons, tab bar and store; no tab module is evaluated.
  assert.equal(simulation.flightLab, lab);
  assert(simulation.observations, 'sim.observations is ready at boot');
  assert.deepEqual(
    byId('toolbarActions').children.map((el) => el.id),
    ['openCosmicLab', 'openFlightLab']
  );
  assert.deepEqual(
    Object.keys(tabModules).map((tab) => $(tab + 'Tab').textContent),
    ['过境预报', '交会对接', '轨道长曝光', '阳台观测', '巡天拍摄计划', '宇宙探索馆', '月球观测']
  );
  await tick();
  assert.deepEqual(globalThis.labLog.loaded, []);
  assert.equal(lab.active, false);

  // First selection: the dialog opens at once with a loading note, then the module mounts.
  const opening = lab.open('docking');
  assert.equal(lab.active, true);
  assert.equal(lab.tab, 'docking');
  assert.equal($('dockingTab').getAttribute('aria-selected'), 'true');
  assert.equal($('dockingPanel').hidden, false);
  assert.equal(status('docking').textContent, '正在载入…');
  assert.equal(status('docking').getAttribute('role'), 'status');
  assert.equal(lab.panels.docking, undefined);
  const docking = await opening;
  assert.equal(docking.tab, 'docking');
  assert.equal(lab.panels.docking, docking);
  assert.equal(status('docking'), null, 'loading note removed');
  await until(() => journalHooks, 'observation journal');
  assert.deepEqual(globalThis.labLog.loaded.sort(), ['docking', 'journal']);
  assert.deepEqual(calls.splice(0).sort(), [
    'docking:mount',
    'docking:resume',
    'journal:tab:docking',
  ]);

  // Concurrent selections share one load and one mount.
  const [a, b] = await Promise.all([lab.open('pass'), lab.open('pass')]);
  assert.equal(a, b);
  assert.deepEqual(calls.splice(0), [
    'docking:deactivate',
    'journal:tab:pass',
    'pass:mount',
    'pass:resume',
  ]);

  // A tab chosen while another is still loading wins. Like before, a panel mounts only
  // while it is shown, so the stale tab waits (module cached) until it is selected.
  const toCosmic = lab.open('cosmic'),
    toLunar = lab.open('lunar');
  assert.equal(await toCosmic, undefined);
  const lunar = await toLunar;
  assert.equal(lab.tab, 'lunar');
  assert.equal(lunar.tab, 'lunar');
  assert.equal(lab.panels.cosmic, undefined);
  assert.equal(count('cosmic:mount'), 0);
  assert(globalThis.labLog.loaded.includes('cosmic'), 'stale module is still fetched');
  assert.deepEqual(calls.splice(0), [
    'pass:pause',
    'journal:tab:cosmic',
    'journal:tab:lunar',
    'lunar:mount',
    'lunar:resume',
  ]);
  const cosmic = await lab.open('cosmic');
  assert.equal(cosmic, lab.panels.cosmic);
  assert.deepEqual(calls.splice(0), [
    'lunar:deactivate',
    'journal:tab:cosmic',
    'cosmic:mount',
    'cosmic:resume',
  ]);
  assert.equal($('flightLabTitle').textContent, '宇宙探索馆');

  // Tab clicks update the #lab/ route once the module is ready.
  location.hash = '#lab/cosmic';
  await $('surveyTab').onclick();
  assert.equal(location.hash, '#lab/survey');
  assert.equal(count('survey:resume'), 1);
  calls.length = 0;

  // Closing while a tab loads does not mount it in the closed dialog.
  const toExposure = lab.open('exposure');
  lab.close();
  assert.equal(lab.active, false);
  assert.equal(await toExposure, undefined);
  assert.deepEqual(calls.splice(0), ['survey:pause', 'journal:tab:exposure']);

  // A failed download shows a readable error; selecting the tab again retries.
  fs.renameSync(balconyChunk, balconyChunk + '.offline');
  assert.equal(await lab.open('balcony'), undefined);
  assert.equal(status('balcony').getAttribute('role'), 'alert');
  assert.equal(status('balcony').textContent, '此页未能载入，请检查网络后重新选择标签重试。');
  assert.equal(errors.length, 1);
  assert.equal(await setLanguage('en'), true);
  assert.equal(
    status('balcony').textContent,
    english['此页未能载入，请检查网络后重新选择标签重试。']
  );
  assert.equal(await setLanguage('zh'), true);
  fs.renameSync(balconyChunk + '.offline', balconyChunk);
  const balcony = await lab.open('balcony');
  assert.equal(balcony.tab, 'balcony');
  assert.equal(status('balcony'), null);
  assert.deepEqual(calls.splice(0), ['journal:tab:balcony', 'balcony:mount', 'balcony:resume']);

  // Cross-module API keeps working (all now return promises).
  assert.equal(await lab.openBalcony({ observer: {} }), 'pass-opened');
  await lab.openSurveyPhotos({ fieldId: 'orion', recordId: 'r1' });
  assert.equal(location.hash, '#lab/survey');
  assert.equal(count('survey:photos:orion:r1'), 1);
  assert.equal(await lab.openGroundCapture({ missionId: 'tiangong', observer: {} }), true);
  assert.equal(location.hash, '#lab/exposure');
  assert.equal(count('exposure:mount'), 1, 'mounted on its next selection');
  assert.equal(count('exposure:resume'), 1);
  assert.equal(await lab.openGroundCapture({ missionId: 'shenzhou', observer: {} }), false);
  assert.deepEqual(journalHooks.getRecipe(), { record: { kind: 'exposure' } });
  await journalHooks.restore({ kind: 'balcony' }, {});
  assert.equal(lab.tab, 'balcony');
  assert.equal(count('balcony:restore'), 1);
  lab.previewPass(1234);
  assert.equal(lab.active, false);
  assert.deepEqual(calls.slice(-2), ['sim:seek:1234', 'sim:view:orbit']);
  simulation.sceneBusy = true;
  assert.equal(await lab.open('pass'), undefined);
  assert.equal(lab.active, false);
  simulation.sceneBusy = false;
  await byId('openLunarLab').onclick();
  assert.equal(lab.tab, 'lunar');
  lab.dispose();
  assert.equal(dialog.isConnected, false);
  assert.equal(hashListeners.size, 0);

  // A #lab/<tab>/<target> route opens the right tab at boot and selects the target.
  location.hash = '#lab/balcony/dfh1';
  calls.length = 0;
  const routed = installFlightLab(simulation, labAssets);
  assert.equal(routed.active, true);
  assert.equal(routed.tab, 'balcony');
  await until(() => count('balcony:target:dfh1'), 'balcony target');
  assert.deepEqual(
    calls.filter((x) => x.startsWith('balcony')),
    ['balcony:mount', 'balcony:resume', 'balcony:target:dfh1']
  );
  routed.dispose();
  assert.deepEqual(toasts, []);
} finally {
  console.error = realError;
  fs.rmSync(dir, { recursive: true, force: true });
}
assert.equal(errors.length, 1);
console.log(
  'Task-lab tabs mount on first selection; stale, concurrent, failed and routed opens passed'
);
