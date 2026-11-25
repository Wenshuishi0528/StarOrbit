// The Chinese sky culture loads on demand. Checks the shared loader (before
// load, concurrent callers, failure and retry), that the environment applies
// a chosen culture only after its catalogue and art have loaded, and that the
// Xuntian index merged after first use equals one built after loading.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const json = (path) => JSON.parse(fs.readFileSync(new URL(path, root)));
const work = new URL('output/tests/sky-culture-loading/', root);
fs.mkdirSync(work, { recursive: true });
const catalogue = json('assets/chinese-sky/catalog.json');
const art = json('assets/chinese-sky/art/manifest.json');
const errors = [];
console.error = (...args) => errors.push(args.join(' '));

async function bundle(name, contents, plugins = []) {
  const file = new URL(name, work);
  const d = JSON.stringify('');
  await build({
    stdin: { contents, resolveDir: root.pathname },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: file.pathname,
    logLevel: 'silent',
    plugins,
    define: {
      __GROUND_PATCH_WORKER__: d,
      __WEB_BUILD__: 'false',
      __TELEMETRY_WORKLET_SOURCE__: d,
      __CITY_TERRAIN_WORKER__: d,
      __ELEVATION_WORKER__: d,
      __VIIRS_TRIAL__: '{}',
    },
  });
  return file;
}

// 1. Loader: the catalogue is a separate request that may fail and be retried.
{
  const late = new URL('late-catalog.json', work);
  fs.rmSync(late, { force: true });
  const file = await bundle('loader.mjs', "export * from './src/sky-cultures.js';", [
    {
      name: 'late-catalogue',
      setup(b) {
        b.onResolve({ filter: /chinese-sky\/catalog\.json$/ }, () => ({
          path: late.href,
          external: true,
        }));
      },
    },
  ]);
  assert.match(
    fs.readFileSync(file, 'utf8'),
    /import\("file:[^"]+late-catalog\.json", \{ with: \{ type: "json" \} \}\)/
  );
  const api = await import(file.href);
  assert.equal(api.isSkyCultureLoaded('western'), true);
  assert.equal(api.isSkyCultureLoaded('chinese'), false);
  assert.equal(api.getSkyCulture('western').asterisms.length, 88);
  assert.equal(api.cultureStarName(32349, 'western', 'en'), 'Sirius');
  // Reading a culture that is not loaded is a programming error, never western.
  assert.throws(() => api.getSkyCulture('chinese'), /尚未加载/);
  assert.throws(() => api.cultureStarName(32349, 'chinese', 'zh'), /尚未加载/);
  assert.throws(() => api.cultureName('chinese', 'zh'), /尚未加载/);
  assert.throws(() => api.cultureGlyphText('chinese'), /尚未加载/);
  const loaded = [];
  api.onSkyCultureLoaded((id) => loaded.push(id));
  const first = api.ensureSkyCulture('chinese');
  assert.equal(api.ensureSkyCulture('chinese'), first, 'concurrent callers share one request');
  await assert.rejects(first);
  assert.equal(api.isSkyCultureLoaded('chinese'), false);
  assert.deepEqual(loaded, []);
  assert.ok(
    errors.some((line) => line.includes('chinese')),
    'a failed load is logged'
  );
  // A later use retries instead of keeping the failure.
  fs.writeFileSync(late, JSON.stringify(catalogue));
  const retry = api.ensureSkyCulture('chinese');
  assert.notEqual(retry, first);
  assert.equal(api.ensureSkyCulture('chinese'), retry);
  const culture = await retry;
  assert.deepEqual(loaded, ['chinese']);
  assert.equal(api.getSkyCulture('chinese'), culture);
  assert.equal(culture.asterisms.length, catalogue.asterisms.length);
  assert.equal(culture.constellations, culture.asterisms);
  assert.equal(api.cultureStarName(32349, 'chinese', 'zh'), '天狼');
  assert.equal(await api.ensureSkyCulture('chinese'), culture);
  assert.deepEqual(loaded, ['chinese'], 'listeners run once per culture');
}

// 2. Environment: the chosen culture is applied only once it can be drawn.
{
  const file = await bundle(
    'environment.mjs',
    "export { Environment } from './src/environment.js'; export * from './src/sky-cultures.js'; export { ConstellationArt } from './src/constellation-art.js'; export { STAR_CHART_DEFAULTS } from './src/star-chart-settings.js';"
  );
  const { Environment, ConstellationArt, STAR_CHART_DEFAULTS, isSkyCultureLoaded } = await import(
    file.href
  );
  const elements = new Map(),
    stored = new Map();
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: '' });
      return elements.get(id);
    },
  };
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  const storedCulture = () => JSON.parse(stored.get('tiangong-environment-v1')).skyCulture;
  const runtime = {
    version: art.version,
    artworks: art.artworks,
    images: art.images.map(({ imageId }) => ({ imageId, url: 'test://' + imageId })),
  };
  const environment = () =>
    Object.assign(Object.create(Environment.prototype), {
      settings: { ...STAR_CHART_DEFAULTS },
      sim: { dirty: false },
      assets: { chineseConstellationArt: runtime },
      constellationArt: new ConstellationArt({ images: [] }),
      chineseSkyArt: null,
      skyCultureTicket: 0,
      skyCulturePending: null,
    });
  const env = environment();
  assert.equal(env.skyCultureReady('western'), true);
  assert.equal(env.skyCultureReady('chinese'), false);
  assert.equal(isSkyCultureLoaded('chinese'), false);
  let applied = 0;
  const choice = env.selectSkyCulture('chinese', () => applied++);
  // The current culture stays visible; the choice is what gets stored.
  assert.equal(env.settings.skyCulture, 'western');
  assert.equal(env.skyCulturePending, 'chinese');
  assert.equal(applied, 0);
  env.save();
  assert.equal(storedCulture(), 'chinese');
  assert.equal(env.loadSkyCulture('chinese'), env.loadSkyCulture('chinese'));
  assert.equal(await choice, true);
  assert.equal(applied, 1);
  assert.equal(env.settings.skyCulture, 'chinese');
  assert.equal(env.skyCulturePending, null);
  assert.equal(env.sim.dirty, true);
  assert.equal(document.getElementById('skyCulture').value, 'chinese');
  assert.equal(storedCulture(), 'chinese');
  assert.equal(env.chineseSkyArt.images.length, art.images.length);
  assert.equal(env.chineseSkyArt.images[0].url, 'test://' + art.images[0].imageId);
  assert.ok(env.constellationArt.cultures.get('chinese').frames.length > 300);
  assert.equal(env.skyCultureReady('chinese'), true);
  // Ready cultures switch synchronously.
  env.selectSkyCulture('western');
  assert.equal(env.settings.skyCulture, 'western');
  env.selectSkyCulture('chinese');
  assert.equal(env.settings.skyCulture, 'chinese');

  // The latest request wins over one still loading.
  const quick = environment();
  const stale = quick.selectSkyCulture('chinese');
  quick.selectSkyCulture('western');
  assert.equal(quick.settings.skyCulture, 'western');
  assert.equal(quick.skyCulturePending, null);
  assert.equal(await stale, false);
  assert.equal(quick.settings.skyCulture, 'western');

  // A failed load keeps the current culture, reverts the menu and can be retried.
  const offline = environment();
  offline.loadSkyCulture = () => Promise.reject(Error('offline'));
  document.getElementById('skyCulture').value = 'chinese';
  const failed = offline.selectSkyCulture('chinese');
  assert.equal(offline.skyCulturePending, 'chinese');
  assert.equal(await failed, false);
  assert.equal(offline.settings.skyCulture, 'western');
  assert.equal(offline.skyCulturePending, null);
  assert.equal(document.getElementById('skyCulture').value, 'western');
  offline.save();
  assert.equal(storedCulture(), 'western');
  delete offline.loadSkyCulture;
  assert.equal(await offline.selectSkyCulture('chinese'), true);
  assert.equal(offline.settings.skyCulture, 'chinese');
}

// 3. Xuntian index: usable before the culture loads, and once merged it is
// identical to an index built after loading.
{
  const file = await bundle(
    'xuntian.mjs',
    "export * from './src/xuntian-catalog.js'; export { isSkyCultureLoaded } from './src/sky-cultures.js';"
  );
  const early = await import(file.href + '?used-before-load');
  const late = await import(file.href + '?loaded-first');
  const gaia = catalogue.otherStars[0];
  assert.equal(early.xuntianCatalogComplete(), false);
  // Physical stars are in the star index in every culture from the start.
  const direction = [
    Math.cos((gaia.dec * Math.PI) / 180) * Math.cos((gaia.ra * Math.PI) / 180),
    Math.cos((gaia.dec * Math.PI) / 180) * Math.sin((gaia.ra * Math.PI) / 180),
    Math.sin((gaia.dec * Math.PI) / 180),
  ];
  assert.ok(early.queryXuntianStars(direction, 0.01).some((star) => star.id === gaia.id));
  assert.equal(early.getXuntianTarget('hip:32349', 'en').name, 'Sirius');
  assert.equal(early.getXuntianTarget('hip:43', 'en').name, 'HIP 43');
  assert.equal(
    early.searchXuntianTargets('北斗', 'zh', 12).some((target) => target.type === 'asterism'),
    false
  );
  assert.throws(() => early.getXuntianTarget('hip:32349', 'zh', 'chinese'), /尚未加载/);
  // Using the index started the load; no caller had to await it.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(early.xuntianCatalogComplete(), true);
  assert.equal(early.getXuntianTarget('hip:43', 'en').name, 'Wang Liang Added IX');
  assert.equal(early.getXuntianTarget(gaia.id, 'en').name, gaia.en);
  await late.ensureXuntianCatalog();
  const ids = [
    'hip:32349',
    'hip:43',
    gaia.id,
    'asterism:chinese:039',
    'constellation:Ori',
    'deep-sky:m44',
    'deep-sky:m31',
  ];
  const queries = [
    '北斗',
    '天狼',
    'Sirius',
    '积尸',
    'M44',
    'Hairy Head',
    '昴',
    'Orion',
    '参',
    'Wang Liang',
  ];
  for (const culture of ['western', 'chinese'])
    for (const language of ['zh', 'en', 'ru', 'fr']) {
      for (const id of ids)
        assert.deepEqual(
          early.getXuntianTarget(id, language, culture),
          late.getXuntianTarget(id, language, culture),
          `${id} ${culture} ${language}`
        );
      for (const query of queries)
        assert.deepEqual(
          early.searchXuntianTargets(query, language, 12, culture),
          late.searchXuntianTargets(query, language, 12, culture),
          `${query} ${culture} ${language}`
        );
    }
  assert.ok(
    late
      .searchXuntianTargets('北斗', 'zh', 12)
      .some((target) => target.id === 'asterism:chinese:039')
  );
}

console.log(
  'Sky culture loading: shared retrying loader, no western fallback before load, environment applies the chosen culture only after catalogue and art load (latest wins, failure keeps the current culture), and the Xuntian index merged after first use equals a preloaded one.'
);
