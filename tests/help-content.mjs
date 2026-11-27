// Help manuals load per language on first use; the welcome dialog and guided tour still work.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = fileURLToPath(new URL('..', import.meta.url));
const english = JSON.parse(fs.readFileSync(path.join(repo, 'src/i18n-en.json'), 'utf8'));
const russian = JSON.parse(fs.readFileSync(path.join(repo, 'src/i18n-ru.json'), 'utf8'));
const source = fs.readFileSync(path.join(repo, 'src/help-content.js'), 'utf8');
assert.doesNotMatch(source, /^import .*manual-/m, 'manuals are not in the startup bundle');
assert.doesNotMatch(
  fs.readFileSync(path.join(repo, 'src/help.js'), 'utf8'),
  /getHelpContent/,
  'help.js uses the on-demand API'
);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starorbit-help-'));
const realError = console.error,
  errors = [];
try {
  fs.mkdirSync(path.join(dir, 'src'));
  const entryFile = path.join(dir, 'src', 'entry.js');
  fs.writeFileSync(
    entryFile,
    [
      `export { installHelp } from ${JSON.stringify(path.join(repo, 'src/help.js'))};`,
      `export * from ${JSON.stringify(path.join(repo, 'src/help-content.js'))};`,
      `export { setLanguage, getLanguage } from ${JSON.stringify(path.join(repo, 'src/i18n.js'))};`,
    ].join('\n')
  );
  const stubExamples = {
    name: 'stub-help-examples',
    setup(b) {
      b.onResolve({ filter: /help-examples\.js$/ }, () => ({
        path: 'examples',
        namespace: 'stub',
      }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents:
          'export const runHelpExample = async () => {}, restoreHelpExample = async () => {}, hasHelpExample = () => false;',
        loader: 'js',
      }));
    },
  };
  const { metafile } = await build({
    entryPoints: [entryFile],
    absWorkingDir: repo,
    bundle: true,
    format: 'esm',
    splitting: true,
    outdir: path.join(dir, 'out'),
    outExtension: { '.js': '.mjs' },
    metafile: true,
    plugins: [stubExamples],
    logLevel: 'silent',
  });
  const outputs = metafile.outputs,
    entry = Object.keys(outputs).find((file) => outputs[file].entryPoint?.endsWith('entry.js')),
    chunkOf = (input) => Object.keys(outputs).find((file) => outputs[file].inputs[input]);
  assert(outputs[entry].inputs['src/help-content/tours.json'], 'tour text stays eager');
  for (const lang of ['zh', 'en', 'fr', 'ru'])
    assert.notEqual(chunkOf(`src/help-content/manual-${lang}.json`), entry, lang + ' manual chunk');
  const manualChunk = (lang) => path.resolve(repo, chunkOf(`src/help-content/manual-${lang}.json`));
  const url = pathToFileURL(path.resolve(repo, entry)).href;
  // Replace Node's own localStorage before the bundle reads the saved language.
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
    },
  });
  console.error = (...args) => errors.push(args);

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  async function until(test, label) {
    for (let i = 0; i < 400; i++) {
      if (test()) return;
      await tick();
    }
    assert.fail('timed out: ' + label);
  }

  // help-content API: tour pages are synchronous, manuals load once per language.
  {
    const content = await import(url + '?content');
    const tours = content.helpTourPages('en');
    assert.equal(tours.length, 13);
    assert(tours.every((page) => page.title && page.text));
    assert.equal(content.helpTourPages('de')[0].title, content.helpTourPages('zh')[0].title);
    assert.equal(content.loadedHelpContent('en'), null);
    const first = content.loadHelpContent('en'),
      second = content.loadHelpContent('en');
    assert.equal(first, second, 'concurrent callers share one load');
    const en = await first;
    assert(en.manualChapters.length > 5);
    assert.equal(en.tourPages.length, 13);
    assert.equal(content.loadedHelpContent('en'), en);
    assert.equal(await content.loadHelpContent('en'), en);
    assert.equal(content.loadedHelpContent('fr'), null, 'other languages stay unloaded');
    const ids = (manual) => manual.manualChapters.flatMap((c) => c.sections.map((s) => s.id));
    assert.deepEqual(ids(await content.loadHelpContent('zh')), ids(en), 'stable section IDs');
    assert.equal(await content.loadHelpContent('de'), content.loadedHelpContent('zh'));
    // A failed download is not cached.
    const frenchChunk = manualChunk('fr');
    fs.renameSync(frenchChunk, frenchChunk + '.offline');
    await assert.rejects(content.loadHelpContent('fr'));
    assert.equal(content.loadedHelpContent('fr'), null);
    fs.renameSync(frenchChunk + '.offline', frenchChunk);
    assert((await content.loadHelpContent('fr')).manualChapters.length > 5);
  }

  // Minimal DOM for the help panel.
  const elements = new Map();
  class FakeElement {
    constructor(tag = 'div', id = '') {
      this.tagName = tag.toUpperCase();
      this.id = id;
      this.children = [];
      this.text = '';
      this.attributes = {};
      this.dataset = {};
      this.style = {};
      this.hidden = false;
      this.open = false;
      this.listeners = {};
      this.scrollTop = 0;
      this.isConnected = true;
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        toggle: (name, force = !classes.has(name)) =>
          force ? classes.add(name) : classes.delete(name),
        contains: (name) => classes.has(name),
      };
    }
    get textContent() {
      return this.text + this.children.map((child) => child.textContent).join('');
    }
    set textContent(value) {
      this.text = String(value);
      this.children = [];
    }
    set innerHTML(value) {
      this.textContent = String(value).replace(/<[^>]+>/g, '');
    }
    get content() {
      return { textContent: this.textContent };
    }
    append(...items) {
      for (const item of items) {
        const child = typeof item === 'string' ? { textContent: item } : item;
        child.parentElement = this;
        this.children.push(child);
      }
    }
    before() {}
    replaceChildren(...items) {
      this.textContent = '';
      this.append(...items);
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
    }
    getAttribute(key) {
      return this.attributes[key] ?? null;
    }
    removeAttribute(key) {
      delete this.attributes[key];
    }
    hasAttribute(key) {
      return Object.hasOwn(this.attributes, key);
    }
    toggleAttribute(key, force = !this.hasAttribute(key)) {
      if (force) this.attributes[key] = '';
      else delete this.attributes[key];
    }
    focus() {
      document.activeElement = this;
    }
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn);
    }
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
    descendants() {
      return this.children
        .filter((child) => child instanceof FakeElement)
        .flatMap((child) => [child, ...child.descendants()]);
    }
    querySelectorAll(selector) {
      const tag = /^[a-z]+$/.test(selector) && selector.toUpperCase();
      return tag ? this.descendants().filter((el) => el.tagName === tag) : [];
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
    getClientRects() {
      return [];
    }
    closest() {
      return null;
    }
  }
  const byId = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement('div', id));
    return elements.get(id);
  };
  globalThis.document = {
    documentElement: {},
    body: new FakeElement('body'),
    title: '',
    activeElement: null,
    getElementById: byId,
    createElement: (tag) => new FakeElement(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  globalThis.window = { addEventListener() {} };
  globalThis.ResizeObserver = globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  Object.assign(globalThis, { innerWidth: 1280, innerHeight: 800 });

  const help = await import(url);
  const panel = byId('helpPanel'),
    contents = byId('helpContents'),
    welcome = byId('welcomeDialog');
  const findButton = (label) =>
    contents.querySelectorAll('button').find((el) => el.textContent === label);
  help.installHelp({ settings: { autoplay: false }, audio: { paused: true }, dock: {} });
  assert(welcome.open, 'first visit shows the welcome dialog');
  await tick();
  assert.equal(help.loadedHelpContent('zh'), null, 'no manual is loaded at startup');

  // Welcome → guided tour loads the manual first, then shows the first tour page.
  byId('startTour').onclick();
  assert.equal(welcome.open, false);
  assert.equal(panel.hidden, false);
  assert.equal(panel.dataset.helpView, 'loading');
  assert.equal(contents.textContent, '正在载入…');
  await until(() => panel.dataset.helpView === 'tour', 'tour');
  const tours = help.helpTourPages('zh');
  assert.equal(byId('helpTitle').textContent, '1. ' + tours[0].title);
  assert.equal(byId('tourActions').hidden, false);
  byId('tourNext').onclick();
  assert.equal(byId('helpTitle').textContent, '2. ' + tours[1].title);
  assert(help.loadedHelpContent('zh'));
  assert.equal(help.loadedHelpContent('en'), null);
  byId('closeHelp').onclick();
  assert.equal(panel.hidden, true);

  // Once loaded, opening is synchronous; manual search works.
  byId('helpToggle').onclick();
  assert.equal(panel.dataset.helpView, 'home');
  findButton('详细手册').onclick();
  assert.equal(panel.dataset.helpView, 'manualIndex');
  const search = contents.querySelector('input');
  search.value = '轨道';
  search.oninput();
  assert.match(contents.textContent, /找到 [1-9]\d* 个小节/);

  // Switching language while help is open keeps the view and loads the new manual.
  assert.equal(await help.setLanguage('en'), true);
  assert.equal(panel.dataset.helpView, 'manualIndex');
  await until(() => byId('helpTitle').textContent === english['手册目录'], 'English index');
  assert(help.loadedHelpContent('en'));
  assert.equal(panel.dataset.helpView, 'manualIndex');
  byId('closeHelp').onclick();

  // Language changes while help is closed load nothing; closing during a load discards it.
  assert.equal(await help.setLanguage('fr'), true);
  await tick();
  assert.equal(help.loadedHelpContent('fr'), null);
  byId('helpToggle').onclick();
  assert.equal(panel.dataset.helpView, 'loading');
  byId('closeHelp').onclick();
  await until(() => help.loadedHelpContent('fr'), 'French manual');
  await tick();
  assert.equal(panel.hidden, true);
  assert.equal(panel.dataset.helpView, 'loading', 'closed panel is not rendered');

  // An offline manual shows a readable error with retry; the retry loads it.
  const russianChunk = manualChunk('ru');
  fs.renameSync(russianChunk, russianChunk + '.offline');
  assert.equal(await help.setLanguage('ru'), true);
  byId('helpToggle').onclick();
  await until(() => contents.querySelector('button'), 'error state');
  assert.equal(contents.children[0].attributes.role, 'alert');
  assert.equal(contents.children[0].textContent, russian['帮助内容未能载入，请检查网络后重试。']);
  assert.equal(errors.length, 1, JSON.stringify(errors.map((e) => e.map(String))));
  fs.renameSync(russianChunk + '.offline', russianChunk);
  findButton(russian['重试']).onclick();
  await until(() => panel.dataset.helpView === 'home', 'Russian home');
  assert.equal(byId('helpTitle').textContent, russian['星轨使用帮助']);
  byId('closeHelp').onclick();
} finally {
  console.error = realError;
  fs.rmSync(dir, { recursive: true, force: true });
}
assert.equal(errors.length, 1);
console.log('Help manuals load per language on demand; welcome, tour, search and retry passed');
