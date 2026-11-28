const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
    page.on('pageerror', (err) => errors.push(err.message));
    const out = process.env.STARORBIT_TEST_OUTPUT;
    const shot = async (name) => {
      if (!out) return;
      fs.mkdirSync(out, { recursive: true });
      await page.screenshot({ path: path.join(out, name + '.png') });
    };
    await page.goto(url, {
      waitUntil: url.startsWith('file:') ? 'commit' : 'domcontentloaded',
      timeout: 180000,
    });
    await page.waitForFunction(() => window.viewer?.sim?.initialized, null, { timeout: 180000 });
    const click = (sel) => page.locator(sel).first().click();
    const object = page.locator('#skyObjectWindow');
    const gallery = page.locator('#skyImageGallery');
    const search = page.locator('#skyGallerySearch');
    const filter = page.locator('#skyGalleryFilter');
    const category = page.locator('#skyReferenceCategory');
    const card = (id) => gallery.locator('[data-entry="' + id + '"]');
    const lead = (host, id) => host.locator('[data-sky-reading="' + id + '"] .sky-reading-prose');
    const pointing = () =>
      page.evaluate(() => {
        const p = viewer.sim.xuntian.pointing;
        return { target: p.target, mode: p.mode, field: p.field };
      });
    if (await page.locator('#welcomeDialog').isVisible()) await click('#skipTour');
    await click('#languageZh');
    await page.evaluate(() => {
      viewer.sim.seek(Date.UTC(2026, 10, 5, 5, 44));
      viewer.sim.update(performance.now());
    });
    await click('#openXuntianMap');
    await page.locator('#xtSearch').fill('织女星');
    await click('#xtResults [data-target="hip:91262"]');
    await page.waitForFunction(() => viewer.sim.xuntian.result?.identification?.id === 'hip:91262');
    const start = await pointing();
    await page.locator('#xtCanvas').click({ button: 'right' });
    assert.equal(await object.locator('.sky-reading-heading').innerText(), '认识这个目标');
    const vega = await lead(object, 'hip:91262').innerText();
    await object.locator('.sky-reading-detail > summary').first().click();
    const detail = await object.locator('.sky-reading-detail p').first().innerText();
    assert.ok(detail.length > 15);
    await shot('finder-context');
    await click('#skyObjectWindow [data-sky-action="close"]');
    // Keep the image archive in flight while the user reads the independent directory.
    await page.evaluate(() => {
      const imagery = viewer.sim.environment.skyDetail;
      const load = imagery.loadHubble.bind(imagery);
      let resume;
      const gate = new Promise((resolve) => {
        resume = resolve;
      });
      imagery.loadHubble = () => gate.then(load);
      window.releaseReferenceTestArchive = () => {
        imagery.loadHubble = load;
        resume();
      };
    });
    await click('#xtSkyImageBrowse');
    assert.equal(await gallery.locator('h2').innerText(), '浏览星空影像与资料');
    await filter.selectOption('reference');
    await category.waitFor();
    await shot('reference-index');
    await search.fill('HIP 91262');
    await card('hip:91262').click();
    assert.equal(await lead(gallery, 'hip:91262').innerText(), vega);
    await gallery.locator('.sky-reading-detail > summary').click();
    assert.equal(await gallery.locator('.sky-reading-detail p').innerText(), detail);
    await gallery.locator('.sig-reference-related summary').click();
    await gallery.locator('[data-related-reference="asterism:chinese:304"]').click();
    await lead(gallery, 'asterism:chinese:304').waitFor();
    assert.match(await gallery.locator('h3').innerText(), /织女/);
    await gallery.locator('.sig-back').click();
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.relatedReference),
      'asterism:chinese:304'
    );
    await gallery.locator('.sig-back').click();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.entry), 'hip:91262');
    await search.fill('角宿');
    await card('group:jiao').waitFor();
    await card('asterism:chinese:009').waitFor();
    await category.selectOption('sky-group');
    assert.equal(await card('asterism:chinese:009').count(), 0);
    await card('group:jiao').click();
    await lead(gallery, 'jiao').waitFor();
    await gallery.locator('.sig-back').click();
    await category.selectOption('all');
    await search.fill('扶筐');
    await card('asterism:chinese:075').click();
    assert.match(await lead(gallery, 'asterism:chinese:075').innerText(), /蚕|桑/);
    await page.setViewportSize({ width: 390, height: 730 });
    const fits = await gallery
      .locator('.sig-scroll')
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    assert.equal(fits, true);
    await shot('reference-mobile');
    await page.setViewportSize({ width: 1360, height: 870 });
    await gallery.locator('.sig-back').click();
    await search.fill('NGC 224');
    await card('deep-sky:m31').waitFor();
    assert.equal(await gallery.locator('[data-entry]').count(), 1);
    await card('deep-sky:m31').click();
    const m31 = await lead(gallery, 'deep-sky:m31').innerText();
    await gallery.locator('.sig-back').click();
    await filter.selectOption('dss');
    await search.fill('M31');
    await card('dss:M31').click();
    const imageArticle = gallery.locator('[data-reference-link="deep-sky:m31"]');
    await imageArticle.focus();
    await page.evaluate(() => window.releaseReferenceTestArchive());
    await gallery.locator('.sig-related summary').waitFor();
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.referenceLink),
      'deep-sky:m31'
    );
    await gallery.locator('.sig-related summary').click();
    await gallery.locator('[data-related^="hubble:"]').first().waitFor();
    await imageArticle.click();
    assert.equal(await lead(gallery, 'deep-sky:m31').innerText(), m31);
    await gallery.locator('.sig-back').click();
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.referenceLink),
      'deep-sky:m31'
    );
    await page.keyboard.press('Escape');
    await gallery.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'xtSkyImageBrowse');
    for (const [language, word] of [
      ['En', 'Antlia'],
      ['Fr', 'Machine pneumatique'],
      ['Ru', 'Насос'],
    ]) {
      await click('#language' + language);
      await page.waitForFunction(
        (lang) => document.documentElement.lang === lang,
        language.toLowerCase()
      );
      await click('#xtSkyImageBrowse');
      await filter.selectOption('reference');
      await search.fill('Antlia');
      await card('constellation:Ant').click();
      assert.match(await gallery.locator('h3').innerText(), new RegExp(word, 'i'));
      const local = await lead(gallery, 'constellation:Ant').innerText();
      assert.ok(local.length > 40 && !/\p{Script=Han}/u.test(local));
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(await pointing(), start, 'reading preserves target, lock and zoom');
    await click('#languageZh');
    await page.locator('#xtSearch').fill('织女');
    await click('#xtResults [data-target="asterism:chinese:304"]');
    await page.waitForFunction(() => viewer.sim.environment.settings.skyCulture === 'chinese');
    await page.locator('#xtSearch').fill('HIP 91262');
    await click('#xtResults [data-target="hip:91262"]');
    await page.waitForFunction(() => viewer.sim.xuntian.result?.identification?.id === 'hip:91262');
    await page.locator('#xtCanvas').click({ button: 'right' });
    assert.equal(await lead(object, 'hip:91262').innerText(), vega);
    const candidates = object.locator('[data-sky-candidates]');
    const membership = await candidates
      .locator('option')
      .filter({ hasText: '所属星官 · 织女' })
      .textContent();
    await candidates.selectOption({ label: membership });
    assert.match(await lead(object, 'asterism:chinese:304').innerText(), /织女/);
    assert.equal(await object.locator('.sky-reading-heading').textContent(), '认识这个目标');
    assert.equal(await page.evaluate(() => viewer.sim.xuntian.pointing.target), 'hip:91262');
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        sameArticle: true,
        aliases: ['M31', 'NGC 224'],
        pointing: start,
        narrowWidth: 390,
        errors,
      })
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
