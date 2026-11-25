import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dictionaries = Object.fromEntries(
  ['en', 'ru', 'fr'].map((lang) => [lang, JSON.parse(fs.readFileSync(`src/i18n-${lang}.json`))])
);
for (const lang of ['ru', 'fr']) {
  assert.deepEqual(Object.keys(dictionaries[lang]).sort(), Object.keys(dictionaries.en).sort());
  for (const [key, value] of Object.entries(dictionaries[lang])) {
    assert(value.trim());
    assert.deepEqual(
      (value.match(/\{\w+\}/g) || []).sort(),
      (key.match(/\{\w+\}/g) || []).sort(),
      key
    );
  }
}

// English stays in the startup bundle (static-text capture and fallback); Russian and
// French are fetched on first use, as in the split web build.
const source = fs.readFileSync('src/i18n.js', 'utf8');
assert.match(source, /^import english from '\.\/i18n-en\.json'/m);
assert.doesNotMatch(source, /^import .*i18n-(ru|fr)\.json/m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starorbit-i18n-'));
const realError = console.error,
  errors = [];
try {
  const { metafile } = await build({
    entryPoints: ['src/i18n.js'],
    bundle: true,
    format: 'esm',
    splitting: true,
    outdir: dir,
    outExtension: { '.js': '.mjs' },
    metafile: true,
    logLevel: 'silent',
  });
  const outputs = metafile.outputs,
    entry = Object.keys(outputs).find((file) => outputs[file].entryPoint === 'src/i18n.js'),
    chunkOf = (input) => Object.keys(outputs).find((file) => outputs[file].inputs[input]);
  assert(outputs[entry].inputs['src/i18n-en.json'], 'English stays in the entry chunk');
  for (const lang of ['ru', 'fr'])
    assert.notEqual(chunkOf(`src/i18n-${lang}.json`), entry, lang + ' is a separate chunk');
  const russianChunk = path.resolve(chunkOf('src/i18n-ru.json'));

  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        attributes: {},
        setAttribute(key, value) {
          this.attributes[key] = String(value);
        },
        removeAttribute(key) {
          delete this.attributes[key];
        },
        classList: { toggle() {} },
      });
    return elements.get(id);
  };
  globalThis.document = {
    documentElement: {},
    body: {},
    title: '',
    getElementById: element,
    createTreeWalker: () => ({ nextNode: () => false }),
    querySelectorAll: () => [],
  };
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  let stored = 'fr';
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => stored, setItem: (key, value) => (stored = value) },
  });
  console.error = (...args) => errors.push(args);
  const url = pathToFileURL(path.resolve(entry)).href;
  const i18n = await import(url);
  const forward = (lang) =>
    lang === 'zh'
      ? '前进 1 秒'
      : dictionaries[lang]['前进 {duration}'].replace('{duration}', dictionaries[lang]['1 秒']);
  let changes = 0;
  i18n.onLanguageChange(() => changes++);

  // A saved French choice is applied only after its dictionary arrives; boot awaits it.
  assert.equal(i18n.getLanguage(), 'zh');
  i18n.initLanguage();
  assert.equal(i18n.getLanguage(), 'zh', 'French is not applied before it loads');
  assert.equal(element('languageFr').attributes['aria-busy'], 'true');
  assert.equal(await i18n.languageReady(), true);
  assert.equal(i18n.getLanguage(), 'fr');
  assert.equal(document.documentElement.lang, 'fr');
  assert.equal(element('languageFr').attributes['aria-pressed'], 'true');
  assert.equal(element('languageFr').attributes['aria-busy'], undefined);
  assert.equal(changes, 1);
  assert.equal(i18n.t('前进 {duration}', { duration: '1 秒' }), forward('fr'));

  // A failed download keeps the current language and its saved choice.
  fs.renameSync(russianChunk, russianChunk + '.offline');
  assert.equal(await i18n.setLanguage('ru'), false);
  assert.equal(i18n.getLanguage(), 'fr');
  assert.equal(stored, 'fr');
  assert.equal(changes, 1);
  assert.equal(errors.length, 1, 'load failure is reported');
  assert.equal(element('languageRu').attributes['aria-busy'], undefined);
  fs.renameSync(russianChunk + '.offline', russianChunk);

  // The failure is not cached. A later click supersedes a pending download.
  const toRussian = i18n.setLanguage('ru');
  assert.equal(i18n.getLanguage(), 'fr', 'Russian waits for its dictionary');
  assert.equal(i18n.t('前进 {duration}', { duration: '1 秒' }), forward('fr'));
  const toChinese = i18n.setLanguage('zh');
  assert.equal(i18n.getLanguage(), 'zh', 'loaded languages switch at once');
  assert.equal(await toRussian, false, 'stale switch is ignored');
  assert.equal(await toChinese, true);
  assert.equal(i18n.getLanguage(), 'zh');
  assert.equal(stored, 'zh');
  assert.equal(changes, 2);
  // The superseded download still filled the cache, so Russian now switches synchronously.
  const cached = i18n.setLanguage('ru');
  assert.equal(i18n.getLanguage(), 'ru');
  assert.equal(await cached, true);

  // Two quick clicks on languages that are both still loading: the last one wins.
  stored = 'zh';
  const fresh = await import(url + '?fresh');
  assert.equal(fresh.getLanguage(), 'zh');
  const quick = [fresh.setLanguage('ru'), fresh.setLanguage('fr')];
  assert.equal(fresh.getLanguage(), 'zh');
  assert.deepEqual(await Promise.all(quick), [false, true]);
  assert.equal(fresh.getLanguage(), 'fr');
  assert.equal(stored, 'fr');

  for (const lang of ['en', 'fr', 'zh', 'ru']) {
    assert.equal(await i18n.setLanguage(lang), true);
    assert.equal(i18n.getLanguage(), lang);
    assert.equal(stored, lang);
    assert.equal(document.documentElement.lang, lang === 'zh' ? 'zh-CN' : lang);
    assert.equal(i18n.t('前进 {duration}', { duration: '1 秒' }), forward(lang));
    assert.equal(
      i18n.errorText('无效轨道记录 12'),
      lang === 'zh'
        ? '无效轨道记录 12'
        : dictionaries[lang]['无效轨道记录 {index}'].replace('{index}', '12')
    );
  }
  assert.equal(await i18n.setLanguage('de'), false);
  assert.equal(i18n.getLanguage(), 'ru');
} finally {
  console.error = realError;
  fs.rmSync(dir, { recursive: true, force: true });
}
assert.equal(errors.length, 1);
console.log(
  'Four-language persistence, on-demand ru/fr packs, stale switches, load failure, coverage and dynamic errors passed'
);
