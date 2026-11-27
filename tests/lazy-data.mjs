// 启动包之外按需加载的数据：共享加载、失败重试，以及加载前后各使用方的表现。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { lazyData } from '../src/lazy-data.js';
import { SkyDetail } from '../src/sky-detail.js';

const turn = () => new Promise((resolve) => setImmediate(resolve));
const errors = [];
const consoleError = console.error;
// Node 自身的警告也经由 console.error；这里只统计加载失败的报告。
console.error = (...args) =>
  String(args[0]).includes('加载失败') ? errors.push(args) : consoleError(...args);
try {
  // 并发调用共享同一次加载；失败不缓存，显式 load() 立即重试，
  // 后台 get() 失败后记录错误并在 retryMs 内不再自动请求。
  {
    let calls = 0,
      fail = true;
    const data = lazyData(
      async () => {
        calls++;
        if (fail) throw Error('offline');
        return { calls };
      },
      { label: '测试数据', retryMs: 40 }
    );
    const first = data.load();
    assert.equal(data.load(), first, 'concurrent callers share one pending load');
    await assert.rejects(first, /offline/);
    assert.equal(calls, 1);
    assert.equal(data.get(), null, 'a synchronous reader tolerates data that is not loaded yet');
    await turn();
    assert.equal(calls, 2, 'get() starts a background load');
    assert.equal(errors.length, 1, 'a failed background load is reported once');
    assert.match(errors[0][0], /测试数据加载失败/);
    assert.equal(data.get(), null);
    await turn();
    assert.equal(calls, 2, 'render-loop readers wait before retrying a failed load');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(data.get(), null);
    await turn();
    assert.equal(calls, 3, 'the background load is retried after the delay');
    fail = false;
    const loaded = await data.load();
    assert.deepEqual(loaded, { calls: 4 }, 'an explicit load retries after a failure');
    assert.equal(data.get(), loaded);
    assert.equal(await data.load(), loaded, 'a successful load is cached');
    assert.equal(calls, 4);
    errors.length = 0;
  }

  // 地理图集与使用方（与应用相同，经 esbuild 打包；非拆分包会内联动态 import）。
  {
    const { outputFiles } = await build({
      stdin: {
        contents: `export { Geography } from './src/geography.js';
          export { createCityFinder } from './src/xuntian-ground-target.js';
          export { geographyAtlas, loadGeographyAtlas } from './src/geography-atlas.js';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      logLevel: 'silent',
    });
    const geo = await import(
      'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
    );
    const location = { hidden: false, textContent: '' };
    const documentBefore = globalThis.document;
    globalThis.document = { getElementById: (id) => (id === 'minimapLocation' ? location : null) };
    try {
      const env = {
        earth: { add() {} },
        settings: { geographyEnabled: false, geoLocation: true },
        sim: { view: 'orbit', shadowCache: { records: [] } },
        starChart: { group: { visible: false } },
      };
      const geography = new geo.Geography(env),
        beijing = { latitude: 39.9, longitude: 116.4 };
      assert.deepEqual(geography.items, [], 'construction does not read the atlas');
      geography.update(beijing, null);
      await turn();
      assert.equal(geography.ready, false, 'labels switched off do not request the atlas');
      assert.equal(location.hidden, true);
      env.settings.geographyEnabled = true;
      // 每帧调用 update() 时图集尚未到达：标注和位置提示保持隐藏，不抛错。
      geography.update(beijing, null);
      geography.update(beijing, null);
      assert.equal(geography.group.visible, false);
      assert.equal(location.hidden, true);
      const finder = geo.createCityFinder(() => geography.places());
      assert.deepEqual(finder.search('北京', 'zh'), [], 'city search is empty before the atlas');
      assert.equal(finder.get('city:beijing', 'zh'), null);
      const pending = geo.loadGeographyAtlas();
      assert.equal(geo.loadGeographyAtlas(), pending, 'all atlas users share one load');
      const [items, atlas] = await Promise.all([geography.load(), pending]);
      assert.equal(geo.geographyAtlas(), atlas);
      assert.equal(items, geography.items);
      assert(geography.ready && items.length === atlas.labels.length && items.length > 1000);
      assert(items.every((p) => p.position && p.key === p.id));
      assert.equal(finder.search('北京', 'zh')[0].id, 'city:beijing', 'the finder re-indexes');
      assert.equal(finder.get('city:beijing', 'en').name, 'Beijing');
      geography.updateLocation(beijing, 1, 'zh', true);
      assert.equal(location.hidden, false);
      assert.match(location.textContent, /中国/);
      const later = new geo.Geography(env, { worldView: true });
      assert.equal(later.places().length, items.length, 'later globes use the loaded atlas');
    } finally {
      if (documentBefore) globalThis.document = documentBefore;
      else delete globalThis.document;
    }
  }

  // 哈勃档案：只在选择哈勃影像时加载；加载期间显示为加载中，完成后重新规划视图。
  {
    const memoryCache = () => {
      const records = new Map();
      return {
        get: async (key) => records.get(key) || null,
        put: async (key, blob) => records.set(key, blob) && true,
        clear: async () => records.clear() || true,
        dispose() {},
      };
    };
    const options = () => ({
      webbGallery: true,
      cache: memoryCache(),
      fetcher: async () => {
        throw Error('offline');
      },
      decode: async () => {
        throw Error('no decoder');
      },
    });
    const ra = (274.7197 * Math.PI) / 180,
      dec = (-13.8394 * Math.PI) / 180;
    const pillars = {
      forward: [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)],
      right: [-Math.sin(ra), Math.cos(ra), 0],
      up: [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)],
      fovY: 0.08,
      aspect: 1.6,
      pixelHeight: 600,
    };
    const manager = new SkyDetail({}, options());
    assert(!manager.providers.some((p) => p.source === 'hubble'), 'no Hubble data at startup');
    manager.setSource('dss');
    manager.update('main', pillars);
    assert.equal(manager.hubbleLoading, null, 'other sources never request the archive');
    manager.setSource('hubble');
    const loading = manager.hubbleLoading;
    assert(loading, 'choosing Hubble starts the archive load');
    assert.equal(manager.loadHubble(), loading, 'concurrent callers share one load');
    const waiting = manager.status('main');
    assert.equal(waiting.loading, true, 'the archive load counts as loading');
    assert.equal(waiting.fallback, null, 'a pending archive is not reported as unavailable');
    const archive = await loading;
    assert.equal(manager.hubbleArchive, archive);
    assert(archive.providers.length > 100 && archive.artworks.length >= 2500);
    assert(manager.providers.some((p) => p.id === 'hubble-heic1501a'));
    assert(manager.status('main').hasHubbleTiles, 'views planned earlier are replanned');
    assert.equal(await manager.loadHubble(), archive);
    manager.dispose();

    // 照片等待哈勃档案就绪，再请求其影像图块。
    const photo = new SkyDetail({}, options());
    photo.setSource('hubble');
    const prepared = await photo.prepare('photo-test', pillars, true, 2000);
    assert(prepared.hasHubbleTiles && prepared.requested > 0, 'a photo waits for the archive');
    photo.dispose();

    // 无哈勃图集的独立实例（如生日卡片背面）从不加载档案。
    const plain = new SkyDetail({}, { ...options(), webbGallery: false });
    plain.setSource('hubble');
    plain.update('main', pillars);
    assert.equal(plain.hubbleLoading, null);
    assert.equal(await plain.loadHubble(), null);
    plain.dispose();
  }
  assert.deepEqual(errors, [], 'successful loads report no errors');
} finally {
  console.error = consoleError;
}
console.log(
  'On-demand data: shared loads, retry after failure, geography and Hubble consumers before and after loading passed'
);
