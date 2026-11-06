// Invoke with an initialized StarOrbit Playwright page. Remote survey images
// remain real; only the SDO record is a disposable in-memory caption fixture.
async function checkSkySourceSwitch(
  page,
  { screenshot = 'output/playwright/v116-sky-selector.png' } = {}
) {
  const failures = [],
    report = { choices: {}, photos: {}, failures };
  const check = (value, message) => {
    if (!value) failures.push(message);
  };
  const state = () =>
    page.evaluate(() => {
      const s = viewer.sim,
        m = s.environment.skyDetail,
        p = s.xuntian.pointing;
      const status = (value) => value && { ...value, sources: value.sources.map((p) => p.id) };
      return {
        pointing: {
          axes: p.axes,
          field: p.field,
          aperture: p.aperture,
          roll: p.roll,
          mode: p.mode,
          target: p.target,
          locked: p.locked,
        },
        preference: s.environment.settings.skyDetailSource,
        main: document.querySelector('#skyDetailSource').value,
        finder: document.querySelector('#xtSkyDetailSource').value,
        legacy: document.querySelector('#skyDetailEnabled').checked,
        status: status(s.xuntian.result?.skyDetail),
        entries: [...m.entries.keys()],
        activeLoads: m.activeLoads.size,
        text: document.querySelector('#xtSkyDetailStatus').textContent,
        center: s.xuntian.result?.center?.kind,
        labels: document.querySelector('#xtNames').checked,
        photoLabels: document.querySelector('#xtPhotoNames').checked,
      };
    });
  const setFov = (fov) =>
    page
      .locator('#xtFocal')
      .fill(String(Math.round((Math.log(fov / 110) / Math.log(0.006 / 110)) * 1000)));
  async function chooseTarget(query, id) {
    await page.locator('#xtSearch').fill(query);
    await page.locator(`#xtResults [data-target="${id}"]`).click();
    await page.waitForFunction(
      (id) => viewer.sim.xuntian.pointing.target === id && viewer.sim.xuntian.pointing.locked,
      id
    );
  }
  async function aboveEarth() {
    // Target buttons animate the physical telescope first; the orbital search
    // must use its final line of sight, not an intermediate slew direction.
    await page.waitForFunction(() => viewer.sim.xuntian.pointing.locked);
    await page.evaluate(() => {
      const s = viewer.sim;
      for (let i = 0; i < 100; i++) {
        if (
          s.current.position.reduce((n, v, j) => n + v * s.xuntian.pointing.axes.forward[j], 0) >
          1000
        )
          break;
        s.seek(s.time + 60000);
        s.update(performance.now());
      }
    });
    await page.waitForFunction(() => viewer.sim.xuntian.result?.center?.kind === 'sky', null, {
      timeout: 20000,
    });
  }
  async function select(source, waitForTiles = false) {
    await page.locator('#xtSkyDetailSource').selectOption(source);
    await page.waitForFunction((source) => {
      const s = viewer.sim;
      return (
        s.xuntian.result?.skyDetail?.source === source &&
        document.querySelector('#skyDetailSource').value === source
      );
    }, source);
    if (waitForTiles) {
      try {
        await page.waitForFunction(
          () => {
            const s = viewer.sim.xuntian.result?.skyDetail;
            return s && (s.complete || !s.loading);
          },
          null,
          { timeout: 40000 }
        );
      } catch {
        failures.push(`${source}: real survey did not settle within 40 seconds`);
      }
    }
    return state();
  }
  async function capture(tag, path) {
    await page.evaluate((tag) => {
      const f = window.__skySourceFixture;
      f.capture = tag;
      f.photo = null;
      f.footers = [];
    }, tag);
    const pending = page.waitForEvent('download', { timeout: 65000 });
    await page.locator('#xtCapture').click();
    const download = await pending;
    if (path) await download.saveAs(path);
    const result = await page.evaluate(() => {
      const f = window.__skySourceFixture,
        p = f.photo;
      f.capture = null;
      return {
        status: p && { ...p, sources: p.sources.map((p) => p.id) },
        footers: [...new Set(f.footers)],
      };
    });
    await download.delete();
    report.photos[tag] = result;
    return result;
  }
  await page.evaluate(async () => {
    const s = viewer.sim,
      env = s.environment,
      m = env.skyDetail;
    const f = (window.__skySourceFixture = {
      settings: { ...env.settings },
      update: m.update,
      fillText: CanvasRenderingContext2D.prototype.fillText,
      capture: null,
      photo: null,
      footers: [],
      solar: null,
    });
    m.update = function (id, ...args) {
      const result = f.update.call(this, id, ...args);
      // The renderer mutates this exact returned status at the final shutter,
      // including skyVisible after Earth/SDO occlusion is evaluated.
      if (id.startsWith('photo-')) f.photo = result;
      return result;
    };
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      if (
        f.capture &&
        this.canvas.width >= 1000 &&
        /^(Sky imagery selected:|Rendered:|Selected image|HD tiles|NASA\/SDO|JWST NIRCam|dss-color ·|panstarrs ·|jwst-carina-2022 ·)/.test(
          text
        )
      )
        f.footers.push(String(text));
      return f.fillText.call(this, text, ...args);
    };
    s.seek(Date.UTC(2026, 10, 5, 5, 44));
    s.update(performance.now());
    Object.assign(env.settings, {
      stars: true,
      milky: true,
      starBrightness: 1,
      exposure: 'cinematic',
      starLabels: true,
      catalogStarLabels: true,
      deepSkyObjects: true,
      deepSkyScope: 'featured',
      starLabelDensity: 0.6,
    });
    await env.setSkyStyle();
    s.xuntian.open();
  });
  try {
    await select('galaxy');
    await chooseTarget('HIP 91262', 'hip:91262');
    await aboveEarth();
    await setFov(1);
    await page.locator('#xtNames').check();
    await page.locator('#xtPhotoNames').check();
    await page.locator('#xtPhotoWidth').selectOption('1440');
    await page.waitForFunction(() => viewer.sim.xuntian.pointing.field < 1.01);
    const baseline = await state();
    for (const source of ['auto', 'galaxy', 'dss', 'panstarrs', 'recent']) {
      const selected = await select(source, ['auto', 'dss', 'panstarrs'].includes(source));
      report.choices[source] = selected;
      check(
        JSON.stringify(selected.pointing) === JSON.stringify(baseline.pointing),
        `${source}: source selection moved the telescope or changed its optics`
      );
      check(
        selected.preference === source && selected.main === source && selected.finder === source,
        `${source}: main/finder/global source are not synchronized`
      );
      check(
        selected.legacy === (source !== 'galaxy'),
        `${source}: legacy checkbox contradicts the selector`
      );
      check(
        selected.labels && selected.photoLabels,
        `${source}: source selection changed annotation preferences`
      );
      if (source === 'dss' || source === 'panstarrs') {
        const provider = source === 'dss' ? 'dss-color' : 'panstarrs';
        check(
          selected.status.ready > 0 &&
            selected.status.sources.length === 1 &&
            selected.status.sources[0] === provider,
          `${source}: ready image is absent or mixes another survey`
        );
        check(
          selected.entries.every((key) => key.startsWith(provider + '@')),
          `${source}: obsolete provider survived in GPU textures`
        );
      }
      if (source === 'recent')
        check(
          selected.status.fallback === 'outside-coverage' && selected.status.requested === 0,
          'Recent-only Vega field did not explicitly fall back to its background'
        );
      if (source === 'galaxy')
        check(
          !selected.entries.length && !selected.status.requested,
          'Original-background choice retained HD textures'
        );
      console.log(
        'SKY_SOURCE',
        source,
        JSON.stringify({
          ready: selected.status.ready,
          requested: selected.status.requested,
          sources: selected.status.sources,
          fallback: selected.status.fallback,
        })
      );
    }
    // This direction uses the main control's real change event as well.
    await page.locator('#skyDetailSource').selectOption('dss', { force: true });
    await page.waitForFunction(() => document.querySelector('#xtSkyDetailSource').value === 'dss');
    check(
      (await state()).preference === 'dss',
      'Changing the main source did not reach the finder'
    );
    for (const source of ['panstarrs', 'dss', 'galaxy', 'auto', 'recent'])
      await page.locator('#xtSkyDetailSource').selectOption(source);
    await page.waitForFunction(
      () =>
        viewer.sim.environment.skyDetail.activeLoads.size === 0 &&
        viewer.sim.xuntian.result?.skyDetail?.source === 'recent',
      null,
      { timeout: 20000 }
    );
    report.rapid = await state();
    check(
      !report.rapid.entries.length && !report.rapid.status.requested,
      'A canceled provider returned after a rapid source switch'
    );
    check(
      JSON.stringify(report.rapid.pointing) === JSON.stringify(baseline.pointing),
      'Rapid source switching changed pointing'
    );
    await select('dss', true);
    const dss = await capture('dss');
    check(
      dss.status?.source === 'dss' &&
        dss.status.skyVisible &&
        dss.status.sources.length === 1 &&
        dss.status.sources[0] === 'dss-color',
      'DSS photo did not use the final shared source'
    );
    check(
      dss.footers.some((s) => s.includes('DSS2 optical')) &&
        dss.footers.some((s) => s.startsWith('dss-color ·')) &&
        !dss.footers.some((s) => s.startsWith('panstarrs ·')),
      'DSS photo attribution is missing or names the wrong survey'
    );
    await page.locator('#xtSkyDetailInfo > summary').click();
    await page.locator('#xtSkyDetailTarget').click();
    await aboveEarth();
    await page.waitForFunction(
      () => {
        const s = viewer.sim.xuntian.result?.skyDetail;
        return s?.source === 'recent' && s.complete;
      },
      null,
      { timeout: 20000 }
    );
    const recent = await capture('recent');
    check(
      recent.status?.source === 'recent' &&
        recent.status.sources.length === 1 &&
        recent.status.sources[0] === 'jwst-carina-2022',
      'Recent photo failed to use the bundled JWST field'
    );
    check(
      recent.footers.some((s) => s.includes('JWST infrared')) &&
        recent.footers.some((s) => s.startsWith('JWST NIRCam')),
      'Recent photo omitted its infrared attribution'
    );
    console.log(
      'SKY_SOURCE photos',
      JSON.stringify({ dss: dss.status.sources, recent: recent.status.sources })
    );
    await select('galaxy');
    await page.locator('#xtGroundQuick').click();
    await setFov(1);
    await page.waitForFunction(() => viewer.sim.xuntian.result?.center?.kind === 'earth');
    const ground = await capture('ground');
    check(
      ground.status?.skyVisible === false &&
        !ground.footers.some((s) => s.startsWith('Sky imagery selected:')),
      'A pure ground photograph was mislabeled as a sky image'
    );
    // Local fixture only: avoid depending on availability of the live SDO relay
    // when verifying source controls and a mutually exclusive photo footer.
    await page.evaluate(async () => {
      const store = viewer.sim.environment.solarObservations,
        f = window.__skySourceFixture;
      await store.ready;
      f.solar = { record: store.records.hmi, ensure: store.ensure, channel: store.channel };
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.fillStyle = '#aaa';
      ctx.beginPath();
      ctx.arc(512, 512, 435, 0, 2 * Math.PI);
      ctx.fill();
      const stamp = new Date(viewer.sim.time).toISOString();
      const record = {
        id: 'sdo:hmi:sky-source-test-fixture',
        channel: 'hmi',
        imageId: 'test',
        width: 1024,
        height: 1024,
        provider: 'SDO / Helioviewer',
        sourceUrl: 'https://api.helioviewer.org/v2/takeScreenshot/',
        observedAt: stamp,
        fetchedAt: stamp,
        checkedAt: stamp,
        radiusFraction: 0.85,
        solarCenterUV: [0.5, 0.5],
        solarNorthUp: true,
        blob: await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')),
        revision: ++store.revision,
      };
      store.records.hmi = record;
      store.ensure = async () => record;
      store.setChannel('hmi');
      store.notify();
    });
    await page.locator('#xtObserveSun').click();
    await aboveEarth();
    await page.waitForFunction(
      () =>
        document.querySelector('#xtSolarControls').dataset.channel === 'hmi' &&
        document.querySelector('#xtSkyDetailControls').hidden
    );
    const solar = await capture('sdo-fixture');
    check(
      solar.status?.skyVisible === false &&
        !solar.footers.some((s) => s.startsWith('Sky imagery selected:')) &&
        solar.footers.some((s) => s.startsWith('NASA/SDO')),
      'SDO photograph has missing solar attribution or a spurious sky footer'
    );
    check(
      await page.locator('#xtSkyDetailInfo').isHidden(),
      'Sky source details remain visible in SDO mode'
    );
    await chooseTarget('LMC', 'deep-sky:lmc');
    await aboveEarth();
    await setFov(9);
    const southern = await select('panstarrs');
    check(
      southern.status.fallback === 'outside-coverage' && !southern.status.requested,
      'Southern LMC was presented as Pan-STARRS coverage'
    );
    await select('dss', true);
    await page.waitForFunction(
      () => {
        const r = viewer.sim.xuntian.result,
          hit = r?.identification;
        return (
          (hit?.id === 'deep-sky:lmc' || hit?.region?.id === 'deep-sky:lmc') &&
          r.labels?.labels.some((l) => l.key === 'deep-LMC')
        );
      },
      null,
      { timeout: 20000 }
    );
    report.lmc = await page.evaluate(() => ({
      identification: viewer.sim.xuntian.result.identification,
      label: viewer.sim.xuntian.result.labels.labels.find((l) => l.key === 'deep-LMC'),
      name: document.querySelector('#xtCrosshairName').textContent,
      detail: document.querySelector('#xtCrosshairDetail').textContent,
      source: viewer.sim.xuntian.result.skyDetail.source,
      sources: viewer.sim.xuntian.result.skyDetail.sources.map((p) => p.id),
    }));
    check(
      report.lmc.source === 'dss' && report.lmc.sources.includes('dss-color'),
      'LMC did not display the selected DSS survey'
    );
    await page.evaluate(() => {
      document.querySelector('#xtSkyDetailInfo').open = false;
      document.querySelector('#xuntianScope .xt-body').scrollTop = 0;
    });
    await page.waitForTimeout(250);
    const panel = await page.locator('#xuntianScope').boundingBox(),
      end = await page.locator('#xtSkyDetailInfo').boundingBox();
    await page.screenshot({
      path: screenshot,
      clip: {
        x: panel.x,
        y: panel.y,
        width: panel.width,
        height: Math.min(panel.height, end.y + end.height - panel.y + 8),
      },
    });
    report.screenshot = screenshot;
    if (failures.length) {
      const error = new Error(failures.join('\n'));
      error.report = report;
      throw error;
    }
    return report;
  } finally {
    await page.evaluate(() => {
      const f = window.__skySourceFixture,
        env = viewer.sim.environment;
      if (!f) return;
      env.skyDetail.update = f.update;
      CanvasRenderingContext2D.prototype.fillText = f.fillText;
      if (f.solar) {
        const s = env.solarObservations;
        s.records.hmi = f.solar.record;
        s.ensure = f.solar.ensure;
        s.setChannel(f.solar.channel);
        s.revision++;
        s.notify();
      }
      Object.assign(env.settings, f.settings);
      env.skyDetail.setSource(
        f.settings.skyDetail === false ? 'galaxy' : f.settings.skyDetailSource || 'auto'
      );
      env.skyDetail.setEnabled(f.settings.skyDetail !== false);
      delete window.__skySourceFixture;
    });
  }
}
