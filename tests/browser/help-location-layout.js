// Run against a local build in a fresh Chinese-language Playwright context.
async (page, output = 'output/playwright/help-layout') => {
  const checks = [];
  const byId = (id) => page.locator('#' + id);
  const check = (ok, description, detail) => {
    if (!ok) throw Error(description + ' ' + JSON.stringify(detail));
    checks.push({ name: description, pass: true });
  };
  const settle = () =>
    page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
  const openHelp = async () => {
    if (!(await byId('helpToggle').isVisible())) await byId('toolsToggle').click();
    await byId('helpToggle').click();
  };
  async function assertPlacement(description) {
    await settle();
    const result = await page.evaluate(() => {
      const card = document.getElementById('helpPanel').getBoundingClientRect();
      const ring = document.getElementById('helpRing').getBoundingClientRect();
      const control = document.querySelector('.tour-highlight');
      const label = control?.closest('label') || control?.labels?.[0];
      const contains = (a, b) =>
        a.left <= b.left + 1 &&
        a.top <= b.top + 1 &&
        a.right >= b.right - 1 &&
        a.bottom >= b.bottom - 1;
      const intersects = (a, b) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const button = document.getElementById('helpDirectory');
      const b = button.getBoundingClientRect();
      const visibleReturn = button.contains(
        document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
      );
      return {
        found: !!control && !document.getElementById('helpSpotlight').hasAttribute('hidden'),
        withinViewport: contains({ left: 0, top: 0, right: innerWidth, bottom: innerHeight }, card),
        clear: !intersects(card, ring),
        labelled: !label || contains(ring, label.getBoundingClientRect()),
        visibleReturn,
        target: control?.id || control?.className,
        card: card.toJSON(),
        ring: ring.toJSON(),
      };
    });
    check(
      result.found &&
        result.withinViewport &&
        result.clear &&
        result.labelled &&
        result.visibleReturn,
      description,
      result
    );
  }
  await page.waitForFunction(
    () =>
      window.viewer?.sim?.initialized &&
      typeof document.getElementById('helpToggle')?.onclick === 'function',
    undefined,
    { timeout: 90000 }
  );
  if (await byId('welcomeDialog').isVisible()) await byId('skipTour').click();
  for (const [width, height] of [
    [1360, 900],
    [834, 700],
    [390, 844],
    [667, 375],
    [375, 500],
  ]) {
    await page.setViewportSize({ width, height });
    await settle();
    await openHelp();
    await byId('replayTour').click();
    for (let i = 1; i <= 13; i++) {
      await assertPlacement(`${width}×${height} tour ${i}`);
      if (i === 7 && (width === 1360 || width === 390)) {
        await page.screenshot({ path: `${output}/tour-7-${width}.png` });
        const label = page.locator('label:has(#starChartEnabled)');
        const was = await byId('starChartEnabled').isChecked();
        await label.click();
        check(
          (await byId('starChartEnabled').isChecked()) !== was,
          `${width} can click full chart label`
        );
        await label.click();
      }
      if (i < 13) await byId('tourNext').press('Enter');
    }
    await byId('closeHelp').click();
  }
  for (const width of [1360, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await settle();
    await openHelp();
    await byId('helpManual').click();
    await byId('helpSearch').fill('1.1');
    await page.locator('[data-section-id="s1-1"]').click();
    let linkedSections = 0;
    for (let i = 0; i < 57; i++) {
      const name = await byId('helpTitle').innerText();
      const links = page.locator('[data-help-locate]:visible');
      const count = await links.count();
      if (count) linkedSections++;
      for (let k = 0; k < count; k++) {
        const before = await byId('helpContents').evaluate((el) => {
          el.scrollTop = 80;
          return el.scrollTop;
        });
        if (width === 1360 && name.startsWith('6.2') && k === 0)
          await page.screenshot({ path: `${output}/manual-6-2.png` });
        await links.nth(k).click();
        await assertPlacement(`${width} ${name} target ${k + 1}`);
        check(!(await byId('helpSwitch').isVisible()), `${width} locating shows one return action`);
        if (name.startsWith('6.2') && k === 0)
          await page.screenshot({ path: `${output}/manual-location-${width}.png` });
        await byId('helpDirectory').click();
        const after = await byId('helpContents').evaluate((el) => el.scrollTop);
        const title = await byId('helpTitle').innerText();
        check(
          title === name && Math.abs(after - before) < 2,
          `${width} ${name} returns to the saved paragraph`,
          { before, after, title }
        );
      }
      if (i < 56) await byId('tourNext').press('Enter');
    }
    check(
      linkedSections === 55,
      `${width} contextual links on 55 applicable sections`,
      linkedSections
    );
    await byId('closeHelp').click();
  }
  return checks;
};
