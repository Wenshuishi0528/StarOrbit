// Verify the portable professional entry with a real browser, local files and Worker.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

// Retain the actual exported vectors in two disjoint time spans. The first
// usable boundary also exercises OEM precision finer than the datetime control.
function partialReference(source) {
  const [header, body] = source.trim().split('META_START');
  const [metadata, vectors] = body.split('META_STOP');
  const rows = vectors.trim().split(/\r?\n/);
  function segment(first, last, submillisecond) {
    const start = rows[first].split(/\s/)[0],
      stop = rows[last].split(/\s/)[0];
    const meta = metadata
      .trim()
      .replace(/^START_TIME = .*$/m, 'START_TIME = ' + start)
      .replace(/^STOP_TIME = .*$/m, 'STOP_TIME = ' + stop);
    const boundary = submillisecond ? ['USEABLE_START_TIME = ' + start.replace('Z', '.0005Z')] : [];
    return ['META_START', meta, ...boundary, 'META_STOP', ...rows.slice(first, last + 1)].join(
      '\n'
    );
  }
  return [header.trim(), segment(0, 60, true), segment(1380, 1440, false)].join('\n');
}

async function main() {
  const root = path.resolve(__dirname, '../..');
  const url =
    process.env.STARORBIT_PRO_URL || pathToFileURL(path.join(root, 'StarOrbitPro.html')).href;
  const channel = process.env.STARORBIT_TEST_BROWSER || 'chrome';
  const offline = url.startsWith('file:');
  const output = path.resolve(
    root,
    process.env.STARORBIT_TEST_OUTPUT || 'output/pro-validation-v168/browser',
    channel,
    offline ? '' : 'http'
  );
  fs.mkdirSync(output, { recursive: true });
  const { parseOem } = await import('../../src/pro/oem.js');
  const { translate } = await import('../../src/pro/labels.js');
  const browser = await chromium.launch({ channel, args: ['--enable-unsafe-swiftshader'] });
  const errors = [],
    network = [];
  try {
    const context = await browser.newContext({
      offline,
      viewport: { width: 1420, height: 950 },
      deviceScaleFactor: 1,
    });
    // Force the same fallback a large real reference uses when Web Storage is full.
    await context.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'starorbit-pro-mission-v1' && value.includes('CCSDS_OEM_VERS')) {
          throw new DOMException('Quota test', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) network.push(request.url());
    });
    const ui = (id) => page.locator('#' + id);
    const completed = () =>
      page.waitForFunction(
        () =>
          !document.getElementById('exportOem').disabled &&
          document.getElementById('scene').dataset.timeSec !== undefined
      );
    async function run() {
      await ui('runTop').click();
      await completed();
      assert(await ui('formError').isHidden());
    }
    async function download(id) {
      const pending = page.waitForEvent('download');
      await ui(id).click();
      const item = await pending;
      const content = await item.createReadStream();
      const chunks = [];
      for await (const chunk of content) chunks.push(chunk);
      return Buffer.concat(chunks).toString('utf8');
    }
    async function openTaskFiles() {
      await ui('resultFile').evaluate((button) => {
        button.closest('details').open = true;
      });
    }
    const loadOem = (name, text) =>
      ui('oemFile').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
    const loadMission = (mission) =>
      ui('file').setInputFiles({
        name: 'mission.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(mission)),
      });

    await page.goto(url);
    await completed();
    assert.equal(await ui('trajectoryMode').inputValue(), 'elements');
    assert(await ui('comparisonTable').isHidden());
    const source = await download('exportOem');
    const reference = parseOem(source);
    assert.equal(reference.stopMs - reference.startMs, 86400000);
    assert.equal(reference.rowCount, 1441);
    const csv = (await download('exportCsv')).trimEnd().split('\r\n');
    assert.equal(csv.length, 17282);
    assert.equal(csv[0].split(',').length, csv[1].split(',').length);
    assert(csv[0].includes('b_board_degC'));
    assert.deepEqual(csv.at(-1).split(',').slice(-3), ['', '', '']);

    await ui('epochUtc').fill('2026-10-22T01:23:45.125');
    const priorEpoch = await ui('epochUtc').inputValue();
    await loadOem('reference.oem', source);
    await ui('oemInfo').waitFor();
    assert.equal(await ui('epochUtc').inputValue(), priorEpoch);
    assert.equal(await ui('oemName').innerText(), 'reference.oem');
    assert(await ui('exportCsv').isDisabled());
    assert((await ui('oemObject').innerText()).includes(reference.objectName));
    await ui('adoptOemEpoch').click();
    assert.equal(Date.parse((await ui('epochUtc').inputValue()) + 'Z'), reference.startMs);
    await ui('trajectoryMode').selectOption('oemInitial');
    assert(await ui('elementsSection').isHidden());
    await run();
    await ui('comparisonTable').waitFor();
    assert((await ui('comparisonState').innerText()).includes(translate('zh', 'nativeRms')));
    await openTaskFiles();
    const first = JSON.parse(await download('resultFile'));
    assert.equal(first.orbitComparison.count, 17281);
    assert.equal(first.orbitComparison.native.count, 1441);
    // The 60 s OEM declares cubic interpolation between its exact native vectors.
    assert(first.orbitComparison.rmsM < 1);
    assert(first.orbitComparison.native.rmsM < 1e-6);
    await ui('replayPeak').click();
    assert.equal(
      Number(await ui('scene').getAttribute('data-time-sec')),
      first.orbitComparison.maxSec
    );
    assert.equal(await ui('scene').getAttribute('data-view'), 'craft');
    assert((await ui('eventDetail').innerText()).includes(translate('zh', 'peakSceneKey')));
    await ui('residualPlot').click({ position: { x: 160, y: 68 } });
    assert(await ui('eventDetail').isHidden());
    const chartTime = Number(await ui('scene').getAttribute('data-time-sec'));
    assert(chartTime > 0 && chartTime < 86400);
    const event = page.locator('#eventRows button').first();
    await event.click();
    assert.equal(
      await ui('scene').getAttribute('data-time-sec'),
      await event.getAttribute('data-start')
    );
    assert.equal(await ui('scene').getAttribute('data-view'), 'craft');

    await loadOem('wrong-frame.oem', source.replace('REF_FRAME = EME2000', 'REF_FRAME = ITRF'));
    await ui('formError').waitFor();
    assert((await ui('formError').innerText()).includes('REF_FRAME'));
    assert.equal(await ui('oemName').innerText(), 'reference.oem');
    assert(await ui('exportOem').isEnabled());
    await ui('oemFile').setInputFiles({
      name: 'oversize.oem',
      mimeType: 'text/plain',
      buffer: Buffer.alloc(8 * 1024 * 1024 + 1),
    });
    await page.waitForFunction(
      (text) => document.getElementById('formError').textContent.includes(text),
      translate('zh', 'oemSize')
    );
    assert.equal(await ui('oemName').innerText(), 'reference.oem');
    const malformed = structuredClone(first.mission);
    malformed.spacecraft.name = 'Unaccepted task';
    malformed.trajectory.oemText = source.replace('TIME_SYSTEM = UTC', 'TIME_SYSTEM = GPS');
    await loadMission(malformed);
    await page.waitForFunction(() =>
      document.getElementById('formError').textContent.includes('TIME_SYSTEM')
    );
    assert.equal(await ui('craftName').inputValue(), first.mission.spacecraft.name);
    assert.equal(await ui('oemName').innerText(), 'reference.oem');

    const partial = partialReference(source);
    const segments = parseOem(partial).segments;
    await loadOem('partial.oem', partial);
    await page.waitForFunction(
      () => document.getElementById('oemName').textContent === 'partial.oem'
    );
    await ui('oemSegments').locator('summary').click();
    await page.waitForFunction(() =>
      document.querySelector('#segmentList').textContent.includes('\n')
    );
    assert.equal((await ui('segmentList').textContent()).split('\n').length, 2);
    await ui('adoptOemEpoch').click();
    assert.equal(
      Date.parse((await ui('epochUtc').inputValue()) + 'Z'),
      Math.ceil(segments[0].startMs)
    );
    await run();
    assert((await ui('comparisonState').innerText()).includes('×2'));
    const partialSamples = (await download('exportCsv')).trimEnd().split('\r\n');
    assert.deepEqual(partialSamples[8641].split(',').slice(-3), ['', '', '']);
    assert(
      partialSamples[1]
        .split(',')
        .slice(-3)
        .every((value) => value !== '')
    );
    const emptyTime = await ui('scene').getAttribute('data-time-sec');
    const width = (await ui('residualPlot').boundingBox()).width;
    await ui('residualPlot').click({ position: { x: width / 2, y: 70 } });
    assert.equal(await ui('scene').getAttribute('data-time-sec'), emptyTime);
    await ui('trajectoryMode').selectOption('oemReplay');
    await ui('runTop').click();
    await ui('formError').waitFor();
    assert((await ui('formError').innerText()).includes(translate('zh', 'oemReplayCoverage')));
    await ui('trajectoryMode').selectOption('oemInitial');
    await ui('craftName').fill('工程载荷 A');
    await ui('forceSection').locator('summary').click();
    await ui('drag').check();
    await ui('srp').check();
    await ui('thirdBody').check();
    await ui('massKg').fill('114');
    const archived = parseOem(await ui('proReferenceExample').textContent());
    await ui('referenceExample').click();
    assert.equal(await ui('trajectoryMode').inputValue(), 'oemInitial');
    assert.equal(
      Date.parse((await ui('epochUtc').inputValue()) + 'Z'),
      Math.ceil(archived.startMs)
    );
    assert.equal(await ui('craftName').inputValue(), '工程载荷 A');
    assert.equal(await ui('massKg').inputValue(), '114');
    assert(await ui('exportOem').isDisabled());
    // Cancel synchronously, before a fast worker can finish the new task.
    const oldTitle = await ui('missionTitle').innerText();
    await page.evaluate(() => {
      document.getElementById('runTop').click();
      document.getElementById('cancelRun').click();
    });
    await page.waitForFunction(
      (text) => document.querySelector('#solved').textContent === text,
      translate('zh', 'runCancelled')
    );
    assert.equal(await ui('missionTitle').innerText(), oldTitle);
    assert(await ui('exportOem').isDisabled());
    await run();
    const propagated = JSON.parse(await download('resultFile'));
    assert.equal(propagated.trajectoryInfo.appliedForces.massKg, 114);
    for (const field of ['drag', 'srp', 'thirdBody'])
      assert(propagated.trajectoryInfo.appliedForces[field]);
    assert(propagated.orbitComparison.maxM > 1);
    assert(propagated.orbitComparison.native.count > 0);
    const samples = (await download('exportCsv')).trimEnd().split('\r\n');
    const peakRow = samples[1 + propagated.orbitComparison.maxSec / propagated.stepSeconds];
    assert.deepEqual(peakRow.split(',').slice(-3).map(Number), propagated.orbitComparison.peakRtnM);
    assert((await ui('sceneStamp').innerText()).includes(translate('zh', 'dragShort')));
    await ui('replayPeak').click();
    assert.equal(await ui('scene').getAttribute('data-reference-peak'), 'true');
    assert(
      Math.abs(
        Number(await ui('scene').getAttribute('data-reference-distance-m')) -
          propagated.orbitComparison.maxM
      ) < 1e-5
    );
    await ui('orbitComparison').screenshot({ path: path.join(output, 'reference-comparison.png') });
    await ui('replay').screenshot({ path: path.join(output, 'reference-peak.png') });
    for (const language of ['en', 'ru', 'fr', 'zh']) {
      await ui('lang').selectOption(language);
      assert.equal(await ui('replayPeak').innerText(), translate(language, 'replayPeak'));
      assert.equal(await ui('exportCsv').innerText(), translate(language, 'exportCsv'));
    }
    const withReference = JSON.parse(await download('export'));
    assert.equal(
      withReference.trajectory.oemText,
      (await ui('proReferenceExample').textContent()).trim()
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem('starorbit-pro-mission-v1')),
      '@indexeddb'
    );
    await page.reload();
    await completed();
    assert.equal(await ui('oemName').innerText(), withReference.trajectory.name);
    assert.equal(await ui('trajectoryMode').inputValue(), 'oemInitial');
    await ui('trajectoryMode').selectOption('oemReplay');
    assert(await ui('forceSection').isHidden());
    await run();
    await openTaskFiles();
    const replay = JSON.parse(await download('resultFile'));
    assert.equal(replay.trajectoryInfo.mode, 'oemReplay');
    assert.equal(replay.trajectoryInfo.appliedForces, null);
    assert.equal(replay.orbitComparison, null);
    assert(await ui('replayPeak').isHidden());
    assert((await ui('sceneStamp').innerText()).includes(translate('zh', 'oemReplay')));
    assert(!(await ui('sceneStamp').innerText()).includes(translate('zh', 'dragShort')));

    await ui('epochUtc').fill(new Date(archived.stopMs - 3600000).toISOString().slice(0, 16));
    await ui('runTop').click();
    await ui('formError').waitFor();
    assert((await ui('formError').innerText()).includes(translate('zh', 'oemReplayCoverage')));
    assert(await ui('exportOem').isDisabled());
    await ui('removeOem').click();
    assert(await ui('oemInfo').isHidden());
    assert.equal(await ui('trajectoryMode').inputValue(), 'elements');
    await ui('epochUtc').fill('2016-12-31T12:00');
    await ui('runTop').click();
    await ui('formError').waitFor();
    for (const language of ['en', 'fr', 'ru', 'zh']) {
      await ui('lang').selectOption(language);
      assert((await ui('formError').innerText()).includes(translate(language, 'leapDay')));
    }

    // A schema-1 task saved before OEM support must restore the element model and clear the previous reference.
    const legacy = structuredClone(first.mission);
    legacy.spacecraft.name = '旧版任务';
    delete legacy.trajectory;
    delete legacy.forces;
    await loadMission(legacy);
    await page.waitForFunction(() =>
      document.querySelector('#missionTitle').textContent.includes('旧版任务')
    );
    await completed();
    assert(await ui('oemInfo').isHidden());
    assert(!(await ui('drag').isChecked()));
    await loadMission(withReference);
    await page.waitForFunction(() =>
      document.querySelector('#missionTitle').textContent.includes('工程载荷 A')
    );
    await completed();
    assert.equal(await ui('trajectoryMode').inputValue(), 'oemInitial');
    assert.equal(await ui('oemName').innerText(), withReference.trajectory.name);
    await page.setViewportSize({ width: 390, height: 844 });
    await ui('orbitComparison').scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await ui('orbitComparison').screenshot({ path: path.join(output, 'reference-narrow.png') });
    if (offline) assert.deepEqual(network, []);
    assert.deepEqual(errors, []);
    console.log(
      `${channel} ${browser.version()} ${offline ? 'offline file' : 'HTTP'} passed OEM load, segmented coverage, forecasts and replay, fallback persistence, cancellation, RTN and 3D replay, four languages, engineering exports and legacy task round trip.`
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
