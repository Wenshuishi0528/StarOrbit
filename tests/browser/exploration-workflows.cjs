// Run against the split local build with a fresh browser profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const output = path.resolve(process.env.STARORBIT_TEST_OUTPUT || 'output/verification-v170');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    channel: process.env.STARORBIT_TEST_BROWSER || 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1420, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = process.env.STARORBIT_TEST_URL || 'http://127.0.0.1:8771/StarOrbit.html';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.viewer?.sim?.floatingWindows, null, {
      timeout: 120000,
    });
    const shot = (name) =>
      page.screenshot({ path: path.join(output, name + '.png'), timeout: 30000 });
    await page.locator('#startTour').click();
    await page.locator('.help-mouse-guide').waitFor();
    assert.deepEqual(await page.locator('.help-mouse-guide strong').allTextContents(), [
      '左键',
      '中键 / 滚轮',
      '右键',
    ]);
    await page.locator('#closeHelp').click();
    await page.locator('#helpToggle').click();
    await page.locator('#helpQuestion').fill('请问赤经的 h 和 m 是什么意思');
    assert.match(await page.locator('.help-answer-card').first().innerText(), /97\.5°/);
    await page.locator('#helpQuestion').fill('怎么离站');
    assert.match(await page.locator('.help-answer-card').first().innerText(), /进入驾驶舱/);
    await page.locator('#helpQuestion').fill('xyznevermatched');
    assert(await page.locator('.help-question-results a').isVisible());
    await page.locator('#helpSpacecraftKeys').click();
    assert(
      await page.locator('#spacecraftKeyGuide').isVisible(),
      'Spacecraft keyboard opens from help'
    );
    const guide = page.locator('#spacecraftKeyGuide');
    await guide.getByRole('button', { name: /关闭/ }).first().click();
    await page.locator('#openXuntianMap').click();
    const scope = page.locator('#xuntianScope');
    await scope.waitFor();
    const sizing = scope.locator('.floating-size-button');
    const before = await scope.boundingBox();
    const initialOptical = await scope.locator('#xtCanvas').boundingBox();
    await sizing.click();
    const edge = page.locator('.floating-size-overlay [data-size-edge=w]');
    const bounds = await edge.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 - 135, bounds.y + bounds.height / 2, {
      steps: 5,
    });
    await page.mouse.up();
    const after = await scope.boundingBox();
    assert(after.width > before.width + 100, 'Dragging the left edge widens the finder');
    assert(
      Math.abs(before.x + before.width - after.x - after.width) < 3,
      'Opposite edge stays put'
    );
    await sizing.press('Escape');
    const optical = await scope.locator('#xtCanvas').boundingBox();
    assert(
      Math.abs(optical.width / optical.height - 1.6) < 0.03,
      'Finder keeps the optical aspect ratio'
    );
    assert(
      optical.width > initialOptical.width + 100,
      'Widening allocates the added space to the actual sky'
    );
    await sizing.click();
    const edge2 = await edge.boundingBox();
    await page.mouse.move(edge2.x + edge2.width / 2, edge2.y + edge2.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge2.x + edge2.width / 2 - 440, edge2.y + edge2.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await sizing.press('Escape');
    const large = await scope.boundingBox();
    const largeOptical = await scope.locator('#xtCanvas').boundingBox();
    const tools = await scope.locator('#xtInstrument').boundingBox();
    assert(
      tools.x >= largeOptical.x + largeOptical.width,
      'In a wide finder settings sit beside the sky'
    );
    assert(largeOptical.width > optical.width + 100);
    await page.waitForFunction(
      (w) => document.querySelector('#xtCanvas').width >= Math.floor(w) - 1,
      largeOptical.width
    );
    await scope.locator('#xtToolToggle').click();
    assert(!(await scope.locator('#xtInstrument').isVisible()));
    const focused = await scope.locator('#xtCanvas').boundingBox();
    assert(
      focused.width > largeOptical.width + 150,
      'Hiding settings gives their space to the optical image'
    );
    await scope.locator('#xtToolToggle').click();
    await shot('finder-width');
    const markerSettings = scope.locator('[data-marker-profile=xuntian]');
    await markerSettings.locator('summary').click();
    await markerSettings.locator('[data-marker-shape]').selectOption('dot');
    await markerSettings.locator('[data-marker-color]').fill('#ff6622');
    await markerSettings.locator('[data-marker-size]').fill('38');
    const glyph = scope.locator('.xt-reticle canvas');
    const centerPixel = await glyph.evaluate((el) => [
      ...el.getContext('2d').getImageData(Math.floor(el.width / 2), Math.floor(el.height / 2), 1, 1)
        .data,
    ]);
    assert.deepEqual(centerPixel, [255, 102, 34, 255], 'The live finder paints the chosen color');
    assert.equal(Math.round((await glyph.boundingBox()).width), 42);
    await markerSettings.locator('[data-marker-all]').click();
    const profiles = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('starorbit-aim-markers-v1'))
    );
    assert.deepEqual(profiles.ground, profiles.xuntian);
    assert.deepEqual(profiles.interstellar, profiles.xuntian);
    await markerSettings.locator('summary').click();
    const mainSource = await page.locator('#skyDetailSource').inputValue();
    await scope.locator('#xtSkyDetailSource').selectOption('hubble');
    await scope.locator('#xtWebbBackground').selectOption('blank');
    assert.equal(await page.locator('#skyDetailSource').inputValue(), mainSource);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.viewer?.sim?.floatingWindows, null, {
      timeout: 120000,
    });
    if (!(await scope.isVisible())) await page.locator('#openXuntianMap').click();
    await page.waitForFunction(
      (width) =>
        Math.abs(document.getElementById('xuntianScope').getBoundingClientRect().width - width) < 3,
      large.width
    );
    assert.equal(await scope.locator('#xtSkyDetailSource').inputValue(), 'hubble');
    assert.equal(await scope.locator('#xtWebbBackground').inputValue(), 'blank');
    assert.equal(await page.locator('#skyDetailSource').inputValue(), mainSource);
    assert.equal(await markerSettings.locator('[data-marker-size]').inputValue(), '38');
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForFunction(() => {
      const rect = document.getElementById('xuntianScope').getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth + 1;
    });
    await sizing.click();
    await page
      .locator('.floating-size-presets')
      .getByRole('button', { name: '紧凑', exact: true })
      .click();
    await page
      .locator('.floating-size-presets')
      .getByRole('button', { name: '复位', exact: true })
      .click();
    await page
      .locator('.floating-size-presets')
      .getByRole('button', { name: '完成', exact: true })
      .click();
    assert.equal(await scope.getAttribute('data-user-width'), null);
    await page.setViewportSize({ width: 1420, height: 900 });
    await page.goto(new URL('StarOrbitPro.html', url).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () =>
        !document.getElementById('exportOem').disabled &&
        document.getElementById('scene').dataset.timeSec !== undefined
    );
    const proExample = page.locator('#observationExample');
    await page.locator('#craftName').fill('保留草稿');
    await proExample.click();
    const confirmDialog = page.locator('#obsExampleDialog');
    await confirmDialog.waitFor();
    await confirmDialog.locator('.floating-size-button').click();
    await confirmDialog
      .locator('.floating-size-presets')
      .getByRole('button', { name: '紧凑', exact: true })
      .click();
    await confirmDialog
      .locator('.floating-size-presets')
      .getByRole('button', { name: '复位', exact: true })
      .click();
    await confirmDialog
      .locator('.floating-size-presets')
      .getByRole('button', { name: '完成', exact: true })
      .click();
    await confirmDialog.locator('#obsExampleCancel').click();
    assert.equal(await page.locator('#craftName').inputValue(), '保留草稿');
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        mouseGuide: true,
        faq: true,
        keyGuide: true,
        frameWidths: [initialOptical.width, optical.width, largeOptical.width, focused.width],
        aspect: optical.width / optical.height,
        centerPixel,
        independentSky: true,
        mobileReset: true,
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
