const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const url =
    process.env.STARORBIT_PRO_URL || pathToFileURL(path.join(root, 'StarOrbitPro.html')).href;
  const channel = process.env.STARORBIT_TEST_BROWSER || 'chrome',
    offline = url.startsWith('file:');
  const output = path.join(root, 'output/pro-v169/browser', channel, offline ? 'file' : 'http');
  fs.mkdirSync(output, { recursive: true });
  const { defaultMission, observationMission } = await import('../../src/pro/mission.js');
  const { writeObservationCsv } = await import('../../src/pro/products.js');
  const { translate } = await import('../../src/pro/labels.js');
  const { observationLabels } = await import('../../src/pro/observation-labels.js');
  for (const entries of Object.values(observationLabels))
    assert(
      entries.length === 4 &&
        entries.every((text) => typeof text === 'string' && text.trim().length)
    );
  const browser = await chromium.launch({ channel, args: ['--enable-unsafe-swiftshader'] });
  const errors = [],
    requests = [];
  try {
    const ctx = await browser.newContext({
      offline,
      viewport: { width: 1460, height: 970 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (/^https?:/.test(r.url())) requests.push(r.url());
    });
    const ui = (id) => page.locator('#' + id);
    const complete = () =>
      page.waitForFunction(
        () =>
          !document.getElementById('exportOem').disabled &&
          document.getElementById('scene').dataset.timeSec !== undefined
      );
    async function run() {
      await ui('runTop').click();
      await complete();
      assert(await ui('formError').isHidden());
    }
    async function product(id) {
      const b = ui(id);
      await b.evaluate((button) => {
        if (button.closest('details')) button.closest('details').open = true;
      });
      const pending = page.waitForEvent('download');
      await b.click();
      const item = await pending;
      const chunks = [];
      for await (const data of await item.createReadStream()) chunks.push(data);
      return Buffer.concat(chunks).toString('utf8');
    }
    async function restore(m) {
      await ui('file').setInputFiles({
        name: 'mission.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(m)),
      });
      await page.waitForFunction(
        (name) => document.getElementById('missionTitle').textContent.includes(name),
        m.spacecraft.name
      );
      await complete();
    }
    async function clickEvent(action) {
      const event = Number(await action.getAttribute('data-event-sec')),
        focus = await action.getAttribute('data-focus');
      await action.click();
      assert(Math.abs(Number(await ui('scene').getAttribute('data-time-sec')) - event) < 1e-8);
      assert.equal(
        Number(await ui('scene').getAttribute('data-sample-sec')),
        Math.round(event / 5) * 5
      );
      assert.equal(await ui('scene').getAttribute('data-observation-focus'), focus);
      if (focus !== 'none') {
        assert(Number(await ui('scene').getAttribute('data-observation-range-km')) > 0);
        assert((await ui('eventDetail').innerText()).includes(translate('zh', 'obsSlantRange')));
      }
      assert.equal(Number(await ui('eventDetail').getAttribute('data-observation-sec')), event);
      assert((await ui('eventDetail').innerText()).includes(translate('zh', 'obsSampleUtc')));
    }
    await page.goto(url);
    await complete();
    assert(!(await ui('observationEnabled').isChecked()));
    assert(await ui('observationReport').isHidden());
    await ui('craftName').fill('尚未保存的草稿');
    await ui('observationExample').click();
    assert(await ui('obsExampleDialog').isVisible());
    await ui('obsExampleCancel').click();
    assert.equal(await ui('craftName').inputValue(), '尚未保存的草稿');
    await ui('observationExample').click();
    await ui('obsExampleConfirm').click();
    assert(await ui('observationEnabled').isChecked());
    assert(await ui('observationReport').isHidden());
    assert(await ui('exportOem').isDisabled());
    assert.equal(
      await ui('obsTargetName').inputValue(),
      observationMission().observation.target.name
    );
    await run();
    assert(await ui('observationReport').isVisible());
    assert(await ui('exportObservationCsv').isEnabled());
    const original = JSON.parse(await product('resultFile')),
      task = JSON.parse(await product('export'));
    assert.deepEqual(task, original.mission);
    assert.deepEqual(task.observation, observationMission().observation);
    assert.deepEqual(
      original.plans.map((p) => p.observation.metrics.usefulDeliveredCount),
      [2, 8]
    );
    assert.equal(original.observationAccess.opportunities.length, 20);
    assert.equal(await product('exportObservationCsv'), writeObservationCsv(original));
    const summary = await ui('obsSummary').innerText();
    assert(summary.includes('2 / 17') && summary.includes('8 / 17'));
    assert((await ui('obsDiagnostic').innerText()).includes(translate('zh', 'obsCapacityLimit')));
    await ui('obsAccess').locator('summary').click();
    assert.equal(await page.locator('#obsWindows .obs-window-list').count(), 2);
    await clickEvent(page.locator('#obsWindows [data-focus="station"]').first());
    await ui('obsAccess').locator('summary').click();
    const detail = ui('obsTimelines');
    await clickEvent(detail.locator('[data-stage="obsCaptureActual"][data-plan="1"]').first());
    await clickEvent(detail.locator('[data-stage="obsCaptureActual"][data-plan="1"]').last());
    assert.equal(
      await ui('readouts')
        .locator('div')
        .filter({ hasText: translate('zh', 'obsOnboard') })
        .locator('dd')
        .innerText(),
      '32.0 MB'
    );
    await ui('replay').screenshot({ path: path.join(output, 'capture-event.png') });
    await clickEvent(detail.locator('[data-stage="obsProcessing"][data-plan="1"]').first());
    await clickEvent(detail.locator('[data-stage="obsTransfer"][data-plan="1"]').last());
    await ui('replay').screenshot({ path: path.join(output, 'downlink-event.png') });
    await ui('time').fill('7000');
    assert.equal(await ui('scene').getAttribute('data-observation-focus'), 'none');
    assert(await ui('eventDetail').isHidden());
    const last = original.plans[1].events.find(
      (e) => e.kind === 'lowBattery' && e.startSec % 5 !== 0
    );
    assert(last);
    await page.locator('#obsSummary [data-plan="1"] [data-limit-kind="lowBattery"]').click();
    assert.equal(Number(await ui('scene').getAttribute('data-time-sec')), last.startSec);
    assert((await ui('eventDetail').innerText()).includes(translate('zh', 'obsSampleUtc')));
    assert((await ui('readouts').innerText()).includes('30.0 Wh'));
    await ui('lang').selectOption('en');
    assert.equal(Number(await ui('scene').getAttribute('data-time-sec')), last.startSec);
    await ui('lang').selectOption('zh');
    const ids = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        ...(await page
          .locator('#obsImageRows [data-image-id]')
          .evaluateAll((buttons) => buttons.map((b) => Number(b.dataset.imageId))))
      );
      if (i < 2) await ui('obsNext').click();
    }
    assert.deepEqual(
      ids,
      original.plans[0].observation.images.map((v) => v.id)
    );
    await ui('obsFilter').selectOption('different');
    const candidates = original.plans[0].observation.images.filter(
      (a, i) =>
        a.status !== original.plans[1].observation.images[i].status ||
        a.reason !== original.plans[1].observation.images[i].reason
    );
    assert.equal(
      await page.locator('#obsImageRows [data-image-id]').first().getAttribute('data-image-id'),
      String(candidates[0].id)
    );
    const rejected = original.plans[1].observation.images.find((v) => v.status === 'filteredOut');
    await ui('obsFilter').selectOption('all');
    for (let i = 0; i < Math.floor((rejected.id - 1) / 8); i++) await ui('obsNext').click();
    await page.locator('[data-image-id="' + rejected.id + '"]').click();
    assert(
      (await ui('obsTimelines').innerText()).includes(translate('zh', 'obsReasonFilterRejected'))
    );
    await clickEvent(detail.locator('[data-stage="obsDiscard"]').first());
    for (const lang of ['en', 'fr', 'ru', 'zh']) {
      await ui('lang').selectOption(lang);
      assert.equal(
        await ui('observationExample').innerText(),
        translate(lang, 'observationExample')
      );
      assert(
        (await ui('obsTimelines').innerText()).includes(translate(lang, 'obsStatusFilteredOut'))
      );
      assert((await ui('eventDetail').innerText()).includes(translate(lang, 'obsSampleUtc')));
    }
    await ui('observationReport').screenshot({ path: path.join(output, 'image-ledger.png') });
    await page.reload();
    await complete();
    assert(await ui('observationReport').isVisible());
    assert.deepEqual(JSON.parse(await product('export')).observation, task.observation);
    await ui('obsMaxOffNadirDeg').evaluate((input) => {
      input.closest('details').open = true;
    });
    await ui('obsMaxOffNadirDeg').fill('92');
    await ui('runTop').click();
    assert((await ui('formError').innerText()).includes(translate('zh', 'maxOffNadirDeg')));
    assert(await ui('exportObservationCsv').isDisabled());
    await ui('obsMaxOffNadirDeg').fill('50');
    await ui('obsStationName').fill('研究站点');
    await ui('editTabs').locator('[data-plan="1"]').click();
    await ui('obsMode1').selectOption('raw');
    await ui('obsDelay1').fill('24.5');
    await run();
    const edited = JSON.parse(await product('export'));
    assert.equal(edited.observation.station.name, '研究站点');
    assert.deepEqual(edited.observation.strategies[1], { mode: 'raw', delaySec: 24.5 });
    const legacy = defaultMission();
    legacy.spacecraft.name = '兼容任务';
    await restore(legacy);
    assert(await ui('observationReport').isHidden());
    assert(!(await ui('observationEnabled').isChecked()));
    await ui('observationEnabled').check();
    assert.equal(await ui('craftName').inputValue(), '兼容任务');
    await ui('observationEnabled').uncheck();
    await run();
    assert.equal(JSON.parse(await product('export')).observation, undefined);
    await ui('observationExample').click();
    assert(await ui('obsExampleDialog').isHidden());
    assert(await ui('observationEnabled').isChecked());
    const edgeCase = structuredClone(edited);
    edgeCase.spacecraft.name = '零接收窗口';
    edgeCase.observation.minStationElevationDeg = 90;
    await restore(edgeCase);
    assert((await ui('obsDiagnostic').innerText()).includes(translate('zh', 'obsNoStation')));
    assert(
      (await ui('obsTimelines').innerText()).includes(
        translate('zh', 'obsReasonNoStationAfterReady')
      )
    );
    edgeCase.spacecraft.name = '无拍摄机会';
    edgeCase.observation.maxOffNadirDeg = 0;
    await restore(edgeCase);
    assert(await ui('obsNoRows').isVisible());
    assert(await ui('obsImageDetail').isHidden());
    edgeCase.spacecraft.name = '链路容量不足';
    edgeCase.observation.maxOffNadirDeg = 50;
    edgeCase.observation.minStationElevationDeg = 25;
    edgeCase.observation.downlinkMbps = 0.001;
    await restore(edgeCase);
    assert((await ui('obsDiagnostic').innerText()).includes(translate('zh', 'obsCapacityLimit')));
    await restore(task);
    assert.deepEqual(JSON.parse(await product('export')).observation, task.observation);
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await ui('obsSummary').screenshot({ path: path.join(output, 'narrow-comparison.png') });
    if (offline) assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    console.log(
      channel +
        ' ' +
        browser.version() +
        ' ' +
        (offline ? 'offline file' : 'HTTP') +
        ' passed lake mission, device strategies, ledger, exact events, moving geometry, contact and storage limits, CSV, four languages, legacy tasks, saved configuration and mobile layout.'
    );
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
