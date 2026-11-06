// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright module.
// CITY_TEST_ENGINE=webkit also checks Safari's browser engine.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.CITY_TEST_ENGINE || 'chrome';
const browser = await (engine === 'webkit' ? webkit : chromium).launch(
  engine === 'webkit' ? {} : { channel: 'chrome' }
);
const worker = await build({
  entryPoints: ['src/city-terrain-worker.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  write: false,
});
const harness = await build({
  entryPoints: ['tests/browser/city-terrain-source.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'citySourceCheck',
  define: { __CITY_TERRAIN_WORKER__: JSON.stringify(worker.outputFiles[0].text) },
  write: false,
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const ranges = [];
  let phase = 'live';
  let rangePromise;
  let rangeResolve;
  let rangeTimer;
  const cancelledRequests = [];
  await page.exposeFunction('armCityRange', () => {
    rangePromise = new Promise((resolve, reject) => {
      rangeResolve = resolve;
      rangeTimer = setTimeout(() => reject(Error('No in-flight COG range observed')), 15000);
    });
  });
  await page.exposeFunction('waitCityRange', () => rangePromise);
  await page.exposeFunction('advanceCityIdleClock', () => page.clock.fastForward(30001));
  await page.exposeFunction('cityTileProgress', (result) =>
    console.log('TILE', JSON.stringify(result))
  );
  context.on('request', (request) => {
    if (
      request.url().includes('data.source.coop/earthgenome/earthindeximagery/') &&
      request.headers().range &&
      !request.headers().range.startsWith('bytes=0-') &&
      rangeResolve
    ) {
      clearTimeout(rangeTimer);
      rangeResolve();
      rangeResolve = null;
    }
  });
  context.on('requestfailed', (request) => {
    if (
      phase === 'lifecycle' &&
      request.url().includes('data.source.coop/earthgenome/earthindeximagery/')
    )
      cancelledRequests.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  context.on('response', (response) => {
    if (!response.url().includes('data.source.coop/earthgenome/earthindeximagery/')) return;
    const headers = response.headers();
    ranges.push({
      phase,
      url: response.url(),
      status: response.status(),
      range: response.request().headers().range,
      contentRange: headers['content-range'],
      length: headers['content-length'],
      cors: headers['access-control-allow-origin'],
    });
  });
  const url = `${process.env.CITY_TEST_URL || 'http://127.0.0.1:8986'}/city-source-harness.html`;
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><title>City terrain source check</title>',
    })
  );
  await page.goto(url);
  await page.addScriptTag({ content: harness.outputFiles[0].text });
  const fixtures = {
    retries: await page.evaluate(() => citySourceCheck.checkCityTerrainRetries()),
    rangeGuard: await page.evaluate(() => citySourceCheck.checkCityTerrainRangeGuard()),
  };
  await mkdir('output/playwright', { recursive: true });
  await writeFile(
    `output/playwright/city-retries-${engine}.json`,
    JSON.stringify(fixtures, null, 2)
  );
  if (process.env.CITY_TEST_FIXTURES_ONLY === '1') {
    if (errors.length) throw Error(errors.join('\n'));
    console.log(JSON.stringify(fixtures, null, 2));
  } else {
    const report = {
      ...(await page.evaluate(() => citySourceCheck.checkCityTerrainSource())),
      ...fixtures,
    };
    await writeFile(
      `output/playwright/city-source-${engine}.png`,
      Buffer.from(report.png.split(',')[1], 'base64')
    );
    delete report.png;
    const liveRanges = ranges.filter((r) => r.phase === 'live');
    if (process.env.CITY_TEST_ALL_TILES === '1') {
      phase = 'all-tiles';
      report.allTiles = await page.evaluate(
        (meta) => citySourceCheck.checkAllCityTerrainTiles(meta),
        report.meta
      );
    }
    phase = 'lifecycle';
    await page.clock.install();
    report.lifecycle = await page.evaluate(
      (meta) => citySourceCheck.checkCityTerrainLifecycle(meta),
      report.meta
    );
    if (!cancelledRequests.length) throw Error('In-flight network cancellation was not observed');
    report.lifecycle.cancelledRequests = cancelledRequests.length;
    if (errors.length) throw Error(errors.join('\n'));
    if (report.allTiles?.some((tile) => tile.error)) throw Error(JSON.stringify(report.allTiles));
    if (
      !liveRanges.length ||
      liveRanges.some((r) => r.status !== 206 || !r.range || !r.contentRange)
    ) {
      throw Error('COG was not retrieved exclusively through valid HTTP range responses');
    }
    report.network = {
      ranges: liveRanges.length,
      bytes: liveRanges.reduce((sum, r) => sum + Number(r.length || 0), 0),
      details: ranges,
    };
    await writeFile(
      `output/playwright/city-source-${engine}.json`,
      JSON.stringify(report, null, 2)
    );
    console.log(
      JSON.stringify({ ...report, network: { ...report.network, details: undefined } }, null, 2)
    );
  }
} finally {
  await browser.close();
}
