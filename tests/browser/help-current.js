// Execute with playwright-cli run-code --filename tests/browser/help-current.js
async page => {
  const checks = [];
  const check = (pass, name, details) => {
    checks.push({ name, pass: !!pass, details });
    if (!pass) throw Error(name + ': ' + JSON.stringify(details));
  };
  await page.waitForFunction(() => window.viewer?.sim.initialized && document.getElementById('openFreeFlight') && typeof document.getElementById('helpToggle')?.onclick === 'function', undefined, { timeout: 60000 });
  if (await page.locator('#welcomeDialog').evaluate(el => el.open)) await page.locator('#skipTour').click();
  await page.evaluate(() => { viewer.music.audio.pause(); viewer.sim.seek(viewer.sim.time); });
  const initial = await page.evaluate(() => ({ mission: viewer.sim.missionId, quality: viewer.sim.environment.quality, time: viewer.sim.time }));
  if (await page.locator('#helpPanel').isVisible()) await page.locator('#closeHelp').click();
  await page.locator('#helpToggle').click();
  check(await page.locator('.help-topic').count() === 16, 'sixteen optional help topics');
  const targets = ['openXuntianMap', 'attitudeNavball', 'openFreeFlight', 'openCityTerrain', 'skyDetailSource', 'openDataResources'];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const language of ['Zh', 'En', 'Ru', 'Fr']) {
      await page.locator('#language' + language).click();
      for (let i = 0; i < targets.length; i++) {
        const group = page.locator('.help-topic-group').filter({ has: page.locator(`[data-topic="${i + 10}"]`) });
        if (await group.count() && !await group.evaluate(el => el.open)) await group.locator('summary').click();
        await page.locator(`[data-topic="${i + 10}"]`).click();
        await page.waitForFunction(id => document.getElementById(id)?.classList.contains('tour-highlight') || document.getElementById('toolsToggle')?.classList.contains('tour-highlight'), targets[i]);
        const content = await page.locator('#helpContents').innerText();
        check(content.length > 40 && (language === 'Zh' || !/[\u3400-\u9fff]/.test(content)), 'translated topic ' + width + '/' + language + '/' + i);
        const bounds = await page.locator('#helpPanel').boundingBox();
        check(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= (width === 1440 ? 1000 : 844) + 1, 'help card fits ' + width + '/' + language + '/' + i, bounds);
        await page.locator('#helpDirectory').click();
      }
    }
    await page.locator('#languageZh').click();
    await page.screenshot({ path: `output/playwright/v120-help-${width}.png` });
  }
  await page.locator('#replayTour').click();
  for (let step = 1; step <= 8; step++) {
    check(await page.locator('#helpProgress').innerText() === `${step} / 8`, 'original tour stop ' + step);
    await page.locator('#tourNext').click();
  }
  check(await page.locator('#helpPanel').isHidden() && await page.locator('#helpSpotlight').isHidden(), 'tour closes and clears highlight');
  check(await page.evaluate(before => viewer.sim.missionId === before.mission && viewer.sim.environment.quality === before.quality && viewer.sim.time === before.time, initial), 'help preserves task, time and quality');
  return checks;
}
