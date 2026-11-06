import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.DEM_ENGINE || 'chrome';
const browser = await (engine === 'webkit' ? webkit : chromium).launch(
  engine === 'webkit' ? {} : { channel: 'chrome' }
);
const worker = await build({
  entryPoints: ['src/earth-elevation-worker.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  write: false,
});
const harness = await build({
  entryPoints: ['tests/browser/earth-elevation-source.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'elevationCheck',
  write: false,
  define: { __ELEVATION_WORKER__: JSON.stringify(worker.outputFiles[0].text) },
});
// Independently sampled with Rasterio from OpenTopography's 2023_1 COGs,
// 2026-11-06. Values use pixel-centre bilinear interpolation in WGS84.
const cases = [
  { id: 'beijing-xishan', lon: 116.1727, lat: 39.993, height: 470.4069272459081 },
  { id: 'seattle', lon: -122.3321, lat: 47.6062, height: 58.111402142337795 },
  { id: 'mount-rainier', lon: -121.7603, lat: 46.8523, height: 4399.587189062179 },
  { id: 'everest', lon: 86.925, lat: 27.9881, height: 8720.44414062504 },
  // The coarse window must use the 451² COG overview with its own sample spacing.
  {
    id: 'beijing-overview',
    lon: 116.1727,
    lat: 39.993,
    halfSpan: 0.16,
    height: 454.5760498046875,
  },
  // Above 50° latitude, native longitude and latitude spacing can differ.
  { id: 'tromso', lon: 18.9553, lat: 69.6492, height: 14.268035888671875 },
];
try {
  const context = await browser.newContext(),
    page = await context.newPage(),
    network = [],
    errors = [];
  let phase = '',
    requestPromise,
    requestResolve,
    requestTimer;
  await page.exposeFunction('elevationPhase', (value) => {
    phase = value;
  });
  await page.exposeFunction('armElevationRequest', () => {
    phase = 'cancel';
    requestPromise = new Promise((resolve, reject) => {
      requestResolve = resolve;
      requestTimer = setTimeout(() => reject(Error('Terrain request not observed')), 15000);
    });
  });
  await page.exposeFunction('waitElevationRequest', () => requestPromise);
  await page.exposeFunction('advanceElevationClock', () => page.clock.fastForward(30001));
  context.on('request', (request) => {
    if (
      request.url().includes('opentopography.s3.sdsc.edu/raster/') &&
      request.headers().range &&
      requestResolve
    ) {
      clearTimeout(requestTimer);
      requestResolve();
      requestResolve = null;
    }
  });
  context.on('response', (response) => {
    if (response.url().includes('opentopography.s3.sdsc.edu/raster/'))
      network.push({
        phase,
        url: response.url(),
        status: response.status(),
        range: response.request().headers().range,
        headers: response.headers(),
      });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://127.0.0.1:8986/elevation-source.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Elevation source verification</title>',
    })
  );
  await page.goto('http://127.0.0.1:8986/elevation-source.html');
  await page.addScriptTag({ content: harness.outputFiles[0].text });
  const report = await page.evaluate((cases) => elevationCheck.checkElevationSamples(cases), cases);
  if (network.some((r) => r.phase === 'ocean-repeat'))
    throw Error('Missing ocean tile was fetched again after worker restart');
  await page.clock.install();
  report.lifecycle = await page.evaluate(() => elevationCheck.checkElevationCancellation());
  if (errors.length) throw Error(errors.join('\n'));
  for (const row of report.reports) {
    const ranges = network.filter((r) => r.phase === row.id);
    if (ranges.some((r) => r.status !== 206 || !r.headers['content-range']))
      throw Error('Invalid DEM range response');
    row.network = {
      ranges: ranges.length,
      bytes: ranges.reduce((a, r) => a + Number(r.headers['content-length'] || 0), 0),
    };
  }
  report.network = network;
  await mkdir('output/playwright', { recursive: true });
  await writeFile(
    `output/playwright/elevation-source-${engine}.json`,
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify({ ...report, network: undefined }, null, 2));
} finally {
  await browser.close();
}
