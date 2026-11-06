async page => {
  const check = (value, message) => { if (!value) throw Error(message); };
  await page.evaluate(() => {
    const s = viewer.sim;
    s.seek(Date.UTC(2026, 10, 5, 5, 44));
    Object.assign(s.environment.settings, { starLabels: true, catalogStarLabels: true, deepSkyObjects: true, deepSkyScope: 'featured', constellationNames: true, starLabelDensity: 0.95 });
    s.xuntian.open();
  });
  await page.locator('#xtSkyDetailSource').selectOption('galaxy');
  const search = page.locator('#xtSearch'), canvas = page.locator('#xtCanvas');
  async function chooseVeil() {
    await search.fill('NGC6960');
    await page.locator('#xtResults [data-target="deep-sky:ngc6960"]').click();
    await page.waitForFunction(() => viewer.sim.xuntian.pointing.target === 'deep-sky:ngc6960' && viewer.sim.xuntian.pointing.locked);
  }
  await chooseVeil();
  await page.evaluate(() => {
    const s = viewer.sim;
    for (let i = 0; i < 100; i++) {
      s.seek(s.time + 60000); s.update(performance.now());
      if (s.current.position.reduce((n, v, i) => n + v * s.xuntian.pointing.axes.forward[i], 0) > 1000) break;
    }
  });
  await page.locator('#xtNames').check();
  await page.setViewportSize({ width: 344, height: 900 });
  await page.locator('#xtFocal').fill(String(Math.round(Math.log(13.8 / 110) / Math.log(0.006 / 110) * 1000)));
  const labelState = () => page.evaluate(() => {
    const s = viewer.sim, c = document.querySelector('#xtCanvas'), labels = s.xuntian.result?.labels?.labels || [];
    return { width: c.clientWidth, height: c.clientHeight, first: labels[0]?.key, label: labels.find(x => x.key === 'deep-NGC6960'), mode: s.xuntian.pointing.mode, field: s.xuntian.pointing.field, center: s.xuntian.result?.center?.kind, frame: c.dataset.xuntianFrame };
  });
  async function named() {
    await page.waitForFunction(() => viewer.sim.xuntian.result?.labels?.labels.some(x => x.key === 'deep-NGC6960'), null, { timeout: 20000 });
    await canvas.scrollIntoViewIfNeeded();
    // A paused finder need not draw again. Give its asynchronous GPU readback
    // time to reach the 2D canvas before recording the visual regression.
    await page.waitForTimeout(200);
    return labelState();
  }
  const centered = await named();
  check(centered.width <= 300 && centered.first === 'deep-NGC6960' && centered.center === 'sky', 'Compact search target was hidden');
  await page.locator('.xt-ocular').screenshot({ path: 'output/playwright/v115-veil-centered.png' });
  const box = await canvas.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 7, y + 3, { steps: 3 }); await page.mouse.up();
  await page.waitForFunction(() => viewer.sim.xuntian.pointing.mode === 'sky-pin');
  const panned = await named();
  check(panned.label && panned.mode === 'sky-pin', 'Manual fixed pan lost the nebula name');
  await chooseVeil();
  await page.locator('#xtFocal').fill('1000');
  await page.waitForFunction(() => viewer.sim.xuntian.pointing.field < 0.007);
  const zoomed = await named();
  check(zoomed.label, 'Extreme zoom hid the centered name');
  const overlaid = await page.evaluate(() => {
    const c = document.querySelector('#xtCanvas').getBoundingClientRect(), label = viewer.sim.xuntian.result.labels.labels.find(x => x.key === 'deep-NGC6960').rect;
    return ['xtField', 'xtClock', 'xtCoordinates', 'xtDepth'].filter(id => {
      const r = document.getElementById(id).getBoundingClientRect(), x = r.x - c.x, y = r.y - c.y;
      return label.x < x + r.width && label.x + label.w > x && label.y < y + r.height && label.y + label.h > y;
    });
  });
  check(overlaid.length === 0, 'Readouts covered the target label: ' + overlaid.join(', '));
  await page.locator('.xt-ocular').screenshot({ path: 'output/playwright/v115-veil-zoomed.png' });
  await chooseVeil();
  await page.locator('#xtPhotoNames').check();
  await page.locator('#xtPhotoWidth').selectOption('1440');
  const pending = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('#xtCapture').click();
  await (await pending).saveAs('output/playwright/v115-veil-labeled-photo.png');
  await page.locator('#xtNames').uncheck();
  await page.waitForFunction(() => viewer.sim.xuntian.result?.labels === null);
  check(await page.locator('#xtPhotoNames').isChecked(), 'Preview switch changed the independent photo preference');
  await page.locator('#xtPhotoNames').uncheck();
  await page.locator('#xtNames').check();
  await named();
  check(!await page.locator('#xtPhotoNames').isChecked(), 'Photo preference was forced by the preview switch');
  return { centered, panned, zoomed, photo: 'v115-veil-labeled-photo.png' };
}
