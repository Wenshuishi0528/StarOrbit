// Playwright run-code at the local StarOrbit entry, using an isolated browser profile.
async (page) => {
  const q = (s) => page.locator(s),
    out = 'output/playwright/ground-stargazing-v157/';
  const check = (ok, msg) => {
    if (!ok) throw Error(msg);
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && /World view|WebGLProgram|WebGLShader/i.test(m.text()))
      errors.push(m.text().slice(0, 400));
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => localStorage.removeItem('starorbit-world-v1'));
  await page.reload();
  await page.waitForFunction(() => window.viewer?.sim?.worldExplorer);
  if (await q('#skipTour').isVisible()) await q('#skipTour').click();
  await q('#languageZh').click();
  await q('.world-mode-entry > button').first().click();
  const site = () => page.evaluate(() => ({ ...viewer.sim.worldExplorer.site }));
  const state = () =>
    page.evaluate(() => {
      const g = viewer.sim.worldExplorer.ground,
        s = g.state,
        k = g.telescope,
        r = g.stargazing;
      return {
        az: s.azimuth,
        el: s.elevation,
        eye: s.eyeHeight,
        agl: s.site.height - s.terrainHeight,
        scopeAz: k?.pose.azimuth,
        scopeAlt: k?.pose.elevation,
        field: k?.field,
        layout: k?.layout,
        tracking: r?.tracking,
        target: r?.target?.name,
        roll: k?.pose.rollDegrees,
      };
    });
  const picker = q('dialog.ground-site-map');
  const mapOpen = () => q('[data-map-open]').click();
  await mapOpen();
  await q('[data-picker-lat]').fill('39.9042');
  await q('[data-picker-lon]').fill('116.4074');
  await q('[data-picker-confirm]').click();
  await page.waitForFunction(
    () => Math.abs(viewer.sim.worldExplorer.site.latitude - 39.9042) < 0.000001
  );
  const before = await site(),
    nav = await state();
  await q('.world-bar [data-time]').fill('2026-11-21 20:30:00');
  await q('.world-bar [data-jump]').click();
  if (!(await page.evaluate(() => viewer.sim.paused))) await q('.world-bar [data-play]').click();
  await q('[data-ground-deploy]').click();
  await page.waitForFunction(() => viewer.sim.worldExplorer.ground?.telescope?.view);
  check((await state()).layout === 'dock' && (await state()).eye === 50, 'Docked default height');
  await q('#groundStarSearch').fill('月球');
  await q('[data-star-results] button').first().click();
  await page.waitForFunction(() => viewer.sim.worldExplorer.ground.stargazing?.tracking);
  const tracked = await state();
  const frame = q('.ground-scope-frame');
  const c = await frame.boundingBox();
  const fields = [tracked.field];
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForFunction(
      (last) => viewer.sim.worldExplorer.ground.telescope.field < last,
      fields.at(-1)
    );
    fields.push((await state()).field);
  }
  check(
    fields.at(-1) > 10 &&
      fields.at(-1) < fields[0] &&
      fields.every((v, i) => !i || v < fields[i - 1]),
    'Discrete wheel ' + fields
  );
  await page.mouse.move(690, 425);
  await page.mouse.down();
  await page.mouse.move(800, 379, { steps: 5 });
  await page.mouse.up();
  const turned = await state();
  check(
    Math.abs(turned.az - tracked.az) > 1 &&
      turned.tracking &&
      Math.abs(turned.scopeAz - tracked.scopeAz) < 1e-4,
    'Main camera interrupted tracking'
  );
  await q('#groundStarLens').selectOption('10');
  await page.waitForFunction(() =>
    document.querySelector('[data-scope-hud]').textContent.includes('60×')
  );
  await page.screenshot({ path: out + 'moon-docked.png' });
  const optics = await state();
  await q('[data-scope-expand]').click();
  await page.waitForFunction(() => viewer.sim.worldExplorer.ground.telescope.layout === 'expanded');
  const large = await frame.boundingBox(),
    enlarged = await state();
  check(
    large.width > c.width * 1.8 &&
      Math.abs(enlarged.field - optics.field) < 1e-7 &&
      enlarged.tracking,
    'Layout changed telescope'
  );
  await page.screenshot({ path: out + 'moon-expanded.png' });
  const photoBox = q('[data-star-photo-width]');
  await photoBox.evaluate((el) => {
    el.closest('details').open = true;
  });
  await photoBox.selectOption('1280');
  const started = page.waitForEvent('download', { timeout: 20000 });
  await q('[data-scope-photo]').click();
  const file = await started;
  await file.saveAs(out + 'moon-photo.png');
  await q('[data-scope-expand]').click();
  await q('[data-observer-raised]').uncheck();
  await page.waitForFunction(
    () => Math.abs(viewer.sim.worldExplorer.ground.state.eyeHeight - 1.7) < 1e-8
  );
  const low = await state();
  await q('[data-observer-raised]').check();
  await q('[data-daylight-terrain]').uncheck();
  await q('[data-daylight-terrain]').check();
  await q('[data-finder-enhanced]').uncheck();
  await q('[data-finder-enhanced]').check();
  await q('[data-observer-source]').selectOption('independent');
  await picker.waitFor({ state: 'visible' });
  await q('[data-picker-in]').click();
  await q('[data-picker-lat]').fill('31.23040');
  await q('[data-picker-lon]').fill('121.47370');
  await q('[data-picker-cancel]').click();
  check(
    Math.abs((await site()).latitude - before.latitude) < 1e-7 && (await state()).tracking,
    'Map cancellation changed site or target'
  );
  await q('[data-observer-source]').selectOption('independent');
  await q('[data-picker-lat]').fill('31.23040');
  await q('[data-picker-lon]').fill('121.47370');
  await q('[data-picker-confirm]').click();
  await page.waitForFunction(
    () => Math.abs(viewer.sim.worldExplorer.site.latitude - 31.2304) < 0.000001
  );
  const secondSite = await site();
  await q('[data-observer-source]').selectOption('roam');
  await page.waitForFunction(
    () => Math.abs(viewer.sim.worldExplorer.site.latitude - 39.9042) < 0.000001
  );
  await q('[data-scope-close]').click();
  const back = await state();
  check(
    !back.layout && Math.abs(back.az - nav.az) < 0.001 && back.eye === nav.eye,
    'Returning to roam lost original pose'
  );
  await q('[data-ground-stars]').click();
  check((await state()).layout === 'expanded', 'Standalone did not open expanded');
  await q('[data-star-source]').selectOption('hubble');
  await q('[data-star-background]').selectOption('dss');
  await q('[data-star-gallery]').click();
  check(await q('#skyImageGallery').isVisible(), 'Gallery unavailable');
  const positionBeforeGallery = await state();
  await q('#skyGallerySearch').fill('heic1502a');
  await q('#skyImageGallery .sig-card').first().click();
  check((await state()).scopeAz === positionBeforeGallery.scopeAz, 'Browsing moved telescope');
  await q('#skyImageGallery').getByText('地面望远镜定位', { exact: true }).click();
  await page.waitForFunction(
    () =>
      viewer.sim.environment.skyDetail.status('ground-scope-detail').source === 'hubble' &&
      viewer.sim.worldExplorer.ground.stargazing?.tracking
  );
  const imageStatus = await page.evaluate(() =>
    viewer.sim.environment.skyDetail.status('ground-scope-detail')
  );
  check(imageStatus.requested > 0, 'Hubble field did not submit tiles');
  await q('.world-bar [data-exit]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await q('.world-mode-entry > button').first().click();
  await q('[data-ground-deploy]').click();
  check(await q('.world-ground-panel').isHidden(), 'Narrow settings obscured view');
  await q('[data-scope-expand]').click();
  await q('.world-panel-toggle').click();
  check(await q('#groundStarSearch').isVisible(), 'Narrow settings inaccessible');
  await q('.world-panel-toggle').click();
  await page.screenshot({ path: out + 'phone-expanded.png' });
  await q('[data-scope-close]').click();
  if (await q('.world-ground-panel').isHidden()) await q('.world-panel-toggle').click();
  await mapOpen();
  await page.screenshot({ path: out + 'phone-map.png' });
  await q('[data-picker-cancel]').click();
  await q('.world-bar [data-exit]').click();
  check(!errors.length, 'Browser errors: ' + errors.join('\n'));
  return { before, fields, tracked, turned, optics, enlarged, low, secondSite, back, errors };
};
