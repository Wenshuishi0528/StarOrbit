const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({
    channel: process.env.STARORBIT_TEST_BROWSER || 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  try {
    const url = process.env.STARORBIT_TEST_URL || 'http://127.0.0.1:8771/StarOrbit.html';
    const page = await browser.newPage({
      viewport: { width: 1360, height: 870 },
      offline: url.startsWith('file:'),
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const out = process.env.STARORBIT_TEST_OUTPUT;
    const shot = async (name) => {
      if (!out) return;
      fs.mkdirSync(out, { recursive: true });
      await page.screenshot({ path: path.join(out, name + '.png') });
    };
    const click = (sel) => page.locator(sel).first().click();
    async function expand(sel) {
      const details = page.locator(sel).first();
      await details.waitFor({ state: 'attached' });
      if (!(await details.evaluate((el) => el.open)))
        await details.locator(':scope > summary').click();
    }
    async function article(host, id, pattern) {
      const node = page.locator(host + ' [data-sky-reading="' + id + '"]').first();
      await node.waitFor();
      if (await node.evaluate((el) => el.tagName === 'DETAILS' && !el.open)) {
        await node.locator(':scope > summary').click();
      }
      const prose = node.locator('.sky-reading-prose');
      await prose.waitFor();
      const text = await prose.innerText();
      assert.match(text, pattern, id);
      assert.ok(text.length > 30, id);
      return text;
    }
    async function selectFinder(query, id) {
      await page.locator('#xtSearch').fill(query);
      await click('#xtResults [data-target="' + id + '"]');
    }
    await page.goto(url, {
      waitUntil: url.startsWith('file:') ? 'commit' : 'domcontentloaded',
      timeout: 180000,
    });
    await page.waitForFunction(() => window.viewer?.sim?.initialized, null, { timeout: 180000 });
    if (await page.locator('#welcomeDialog').isVisible()) await click('#skipTour');
    await click('#languageZh');
    await page.evaluate(() => {
      const sim = viewer.sim;
      sim.seek(Date.UTC(2026, 10, 5, 5, 44));
      sim.update(performance.now());
    });
    await click('#openXuntianMap');
    await selectFinder('织女星', 'hip:91262');
    await page.waitForFunction(() => viewer.sim.xuntian.result?.identification?.id === 'hip:91262');
    await page.locator('#xtCanvas').click({ button: 'right' });
    const vega = await article('#skyObjectWindow', 'hip:91262', /夏季大三角.*碎屑盘/);
    await expand('#skyObjectWindow [data-sky-about]');
    const urlSource = await page
      .locator('#skyObjectWindow [data-sky-about] a')
      .first()
      .getAttribute('href');
    assert.match(urlSource, /nasa\.gov/);
    await article('#skyObjectWindow', 'constellation:Lyr', /天琴/);
    await shot('vega-and-lyra');
    assert.equal(await page.evaluate(() => viewer.sim.xuntian.pointing.target), 'hip:91262');
    const initial = await page.evaluate(() => viewer.sim.xuntian.pointing.field);
    await click('#skyObjectWindow [data-sky-action="aim"]');
    const fixed = await page.evaluate(() => {
      const sim = viewer.sim,
        state = sim.xuntian.pointing;
      const first = [...state.axes.forward],
        time = sim.current.t,
        position = [...sim.current.position];
      sim.seek(time + 120000);
      sim.update(performance.now());
      return { initial: state.mode, first, time, position };
    });
    assert.equal(fixed.initial, 'sky-pin');
    await page.waitForFunction((t) => viewer.sim.current.t - t >= 119000, fixed.time);
    const drift = await page.evaluate(({ first, position }) => {
      const point = viewer.sim.xuntian.pointing;
      return {
        delta: Math.hypot(...point.axes.forward.map((v, i) => v - first[i])),
        opticalDelta: Math.hypot(
          ...viewer.sim.xuntian.optics.axes.forward.map((v, i) => v - first[i])
        ),
        orbitKm: Math.hypot(...viewer.sim.current.position.map((v, i) => v - position[i])),
        mode: point.mode,
        field: point.field,
        pinned: point.pinned,
      };
    }, fixed);
    assert.equal(drift.pinned, 'sky');
    assert.equal(drift.field, initial);
    assert.ok(drift.delta < 1e-7 && drift.opticalDelta < 1e-7);
    assert.ok(drift.orbitKm > 500);
    await click('#xtPin');
    assert.equal(await page.evaluate(() => viewer.sim.xuntian.pointing.mode), 'free');
    await selectFinder('Orion', 'constellation:Ori');
    await article('#xtTargetReading', 'constellation:Ori', /猎人.*腰带/);
    await expand('#xtTargetReading .sky-reading-observing');
    assert.match(await page.locator('#xtTargetReading .sky-reading-observing p').innerText(), /腰带.*M42/);
    for (const [button, lang, word] of [
      ['#languageEn', 'en', /belt/i],
      ['#languageFr', 'fr', /baudrier/i],
      ['#languageRu', 'ru', /пояс/i],
    ]) {
      await click(button);
      await page.waitForFunction(
        ([lang]) => document.documentElement.lang.toLowerCase().startsWith(lang),
        [lang]
      );
      await article('#xtTargetReading', 'constellation:Ori', word);
    }
    await click('#languageZh');
    await selectFinder('M1', 'deep-sky:m1');
    await article('#xtTargetReading', 'deep-sky:m1', /1054.*中子星/);
    await selectFinder('月球', 'solar:Moon');
    await article('#xtTargetReading', 'solar:Moon', /月/);
    await click('#xtClose');
    // Open the same disclosure controls a user would use to reach the sky settings.
    const layerToggle = page
      .locator('section[data-settings-module]')
      .filter({ has: page.locator('#skyCulture') })
      .locator('.settings-toggle');
    if ((await layerToggle.getAttribute('aria-expanded')) === 'false') await layerToggle.click();
    const parents = await page.locator('#skyCulture').evaluate((el) => {
      const a = [];
      for (let n = el.parentElement; n; n = n.parentElement)
        if (n.tagName === 'DETAILS' && !n.open)
          a.unshift(n.querySelector('summary').textContent.trim());
      return a;
    });
    for (const label of parents)
      await page.locator('summary').filter({ hasText: label }).first().click();
    await click('#westernSkyBrowse');
    const westernGallery = page.locator('#skyImageGallery');
    await westernGallery.locator('#skyConstellationFilter').waitFor();
    assert.equal(await westernGallery.locator('#skyReferenceCategory').inputValue(), 'constellation');
    assert.equal(await westernGallery.locator('#skyConstellationFilter').inputValue(), 'all');
    assert.match(await westernGallery.locator('.sig-reference-count').innerText(), /88/);
    await page.keyboard.press('Escape');
    await westernGallery.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(() => document.activeElement.id), 'westernSkyBrowse');
    await page.locator('#skyCulture').selectOption('chinese');
    await page.locator('#westernSkyBrowse').waitFor({ state: 'hidden' });
    await expand('#chineseSkyExplorer');
    await page.waitForFunction(() =>
      Array.from(document.querySelector('#chineseSkyObject').options).some(
        (o) => o.textContent === '北斗'
      )
    );
    const record = await page
      .locator('#chineseSkyObject')
      .evaluate((el) => Array.from(el.options).find((o) => o.textContent === '北斗')?.value);
    assert.ok(record);
    await article('#chineseSkyReading', record, /斗/);
    await article('#chineseGroupReading', 'ziwei', /垣/);
    await page.locator('#chineseSkyGroup').selectOption('jiao');
    await article('#chineseGroupReading', 'jiao', /角/);
    await article('#chineseSymbolReading', 'azuredragon', /龙/);
    await shot('chinese-sky-introductions');
    await page.locator('#skyCulture').selectOption('western');
    await click('.world-mode-entry > button');
    await click('[data-ground-deploy]');
    await page.waitForFunction(
      () => viewer.sim.worldExplorer?.ground?.telescope?.layout === 'dock'
    );
    await page.locator('#groundStarSearch').fill('M31');
    await click('[data-star-results] button');
    await article('[data-star-reading]', 'deep-sky:m31', /仙女座/);
    await click('.ground-scope-actions [data-sky-action="locator"]');
    const loc = page.locator('#skyLocationWindow [data-sky-reading]');
    await loc.locator('.sky-reading-prose').waitFor();
    const region = await loc.getAttribute('data-sky-reading');
    assert.match(region, /^constellation:/);
    await page.setViewportSize({ width: 390, height: 730 });
    const box = await loc.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 391, 'article fits narrow screen');
    await shot('ground-region-mobile');
    await page.setViewportSize({ width: 1360, height: 870 });
    await click('#skyLocationWindow [data-sky-action="close"]');
    await click('.world-bar [data-exit]');
    await click('.world-mode-entry button:nth-child(3)');
    await page.locator('.interstellar-panel').waitFor();
    await click('.interstellar-panel [data-shortcut="hip:91262"]');
    await article('.interstellar-panel [data-star-reading]', 'hip:91262', /碎屑盘/);
    await page.locator('.interstellar-panel [data-culture]').selectOption('western');
    await page.locator('.interstellar-panel [data-formation]').selectOption('constellation:Ori');
    await article('.interstellar-panel [data-formation-reading]', 'constellation:Ori', /腰带/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ vega, region, drift, errors }));
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
