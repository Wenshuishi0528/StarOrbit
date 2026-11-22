// Run against a fresh local build in a foreground 60 Hz desktop browser.
// Report the presented page cadence and real eyepiece renders separately.
async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => window.viewer?.sim?.worldExplorer);
  const button = (selector) => page.locator(selector);
  if (await button('#skipTour').isVisible()) await button('#skipTour').click();
  await button('.world-mode-entry > button').first().click();
  await page.evaluate(() => {
    const sim = viewer.sim;
    sim.mode = 'custom';
    sim.time = Date.UTC(2026, 10, 21, 14, 30);
    sim.speed = 1;
    sim.paused = false;
  });
  const results = [];
  async function sample(name, gesture, elevation) {
    const scope = gesture === 'scope' || gesture === 'zoom';
    const wide = gesture === 'wide-turn';
    await page.evaluate((el) => {
      const g = viewer.sim.worldExplorer.ground;
      for (const pose of [g.state, g.telescope?.pose])
        if (pose) Object.assign(pose, { azimuth: 318, elevation: el });
    }, elevation);
    await page.waitForTimeout(1100);
    const rect = await button(
      scope ? '.ground-scope-frame' : '.world-stage > canvas'
    ).boundingBox();
    const x = rect.x + rect.width * 0.5,
      y = rect.y + rect.height * (scope ? 0.5 : 0.55);
    await page.mouse.move(x, y);
    if (gesture === 'walk') await page.keyboard.down('KeyH');
    else if (gesture !== 'zoom') await page.mouse.down();
    const metrics = page.evaluate(
      () =>
        new Promise((done) => {
          const sky = viewer.sim.worldExplorer.ground.telescope?.sky;
          let renders = 0,
            firstRender,
            prev,
            start;
          const render = sky?.render,
            dt = [];
          if (sky)
            sky.render = function (...args) {
              renders++;
              return render.apply(this, args);
            };
          function frame(t) {
            if (prev !== undefined) dt.push(t - prev);
            else {
              start = t;
              firstRender = renders;
            }
            prev = t;
            if (t - start < 4200) {
              requestAnimationFrame(frame);
              return;
            }
            if (sky) sky.render = render;
            const perSecond = (n) => Math.round((10000 * n) / (t - start)) / 10;
            dt.sort((a, b) => a - b);
            done({
              pageFps: perSecond(dt.length),
              eyepieceFps: sky ? perSecond(renders - firstRender) : null,
              p95Ms: +dt[Math.floor(dt.length * 0.95)].toFixed(1),
              p90Ms: +dt[Math.floor(dt.length * 0.9)].toFixed(1),
              longestMs: +dt.at(-1).toFixed(1),
            });
          }
          requestAnimationFrame(frame);
        })
    );
    try {
      const start = Date.now();
      while (Date.now() - start < 4300) {
        const t = Date.now() - start;
        if (gesture === 'zoom') await page.mouse.wheel(0, 6 * Math.sin(t / 400));
        else if (wide)
          await page.mouse.move(
            x + rect.width * 0.25 * Math.sin(t * 0.0037),
            y + 55 * Math.sin(t * 0.0021)
          );
        else if (gesture !== 'walk') await page.mouse.move(x + 75 * Math.sin(t / 460), y);
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
    } finally {
      if (gesture === 'walk') await page.keyboard.up('KeyH');
      else if (gesture !== 'zoom') await page.mouse.up();
    }
    results.push({ name, ...(await metrics) });
  }
  await page.waitForTimeout(8000);
  await sample('roam-horizon', 'main', 4);
  await sample('walking-forward', 'walk', 4);
  await button('[data-ground-deploy]').click();
  await sample('finder-horizon', 'main', 8);
  await sample('finder-sky', 'main', 78);
  await sample('scope-horizon', 'scope', 8);
  await sample('scope-sky', 'scope', 78);
  await sample('scope-zoom', 'zoom', 78);
  await button('[data-scope-expand]').click();
  await sample('expanded-sky', 'scope', 78);
  await button('[data-scope-expand]').click();
  await page.evaluate(() =>
    Object.assign(viewer.sim.environment.settings, {
      stars: true,
      starChartEnabled: true,
      catalogStarLabels: true,
      starLabels: true,
      constellationArt: true,
      constellationLines: true,
      constellationNames: true,
      deepSkyObjects: true,
      deepSkyScope: 'all',
      equatorialGrid: true,
      starLabelDensity: 1,
    })
  );
  await button('[data-star-source]').selectOption('dss');
  await page.waitForTimeout(7000);
  await sample('dense-finder-horizon', 'main', 8);
  await sample('dense-scope-horizon', 'scope', 8);
  await button('[data-scope-expand]').click();
  await sample('dense-expanded-sky', 'scope', 78);
  await button('[data-scope-expand]').click();
  const bufferSize = () =>
    page.evaluate(() => [viewer.renderer.domElement.width, viewer.renderer.domElement.height]);
  const size = await bufferSize();
  await page.setViewportSize({ width: 1840, height: 980 });
  await page.evaluate(() => {
    viewer.sim.environment.settings.starLabelDensity = 0.95;
  });
  await sample('dense-finder-wide-turn', 'wide-turn', 18);
  return { size, wideSize: await bufferSize(), results };
};
