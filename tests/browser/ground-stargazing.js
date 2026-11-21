// Run with Playwright run-code in an isolated browser profile at the local entry.
async (page) => {
  await page.reload();
  await page.waitForFunction(() => window.viewer?.sim?.worldExplorer);
  const control = (selector) => page.locator(selector);
  if (await control('#skipTour').isVisible()) await control('#skipTour').click();
  await control('#languageZh').click();
  await control('.world-mode-entry > button').first().click();
  await control('[data-ground-stars]').click();
  const angles = await control('[data-star-mount]').evaluate(async (mount) => {
    const az = mount.querySelector('#groundStarAz');
    const alt = mount.querySelector('#groundStarAlt');
    // Reproduce an edit between the default opening action and its queued toggle.
    const toggled = new Promise((done) => mount.addEventListener('toggle', done, { once: true }));
    mount.querySelector('summary').click();
    az.value = '229.07';
    alt.value = '20.37';
    for (const input of [az, alt]) input.dispatchEvent(new Event('input', { bubbles: true }));
    await toggled;
    mount.querySelector('[data-star-manual]').click();
    return [az.valueAsNumber, alt.valueAsNumber];
  });
  if (angles[0] !== 229.07 || angles[1] !== 20.37) throw Error('Opening overwrote the direction');
  await page.waitForFunction(() => {
    const sky = viewer.sim.worldExplorer.ground.stargazing;
    return Math.abs(sky.azimuth - 229.07) < 0.001 && Math.abs(sky.elevation - 20.37) < 0.001;
  });
  const clock = control('.world-bar [data-time]');
  await clock.fill('2026-11-21 12:15:00');
  await control('.world-bar [data-jump]').click();
  if (!(await page.evaluate(() => viewer.sim.paused))) await control('.world-bar [data-play]').click();
  await control('[data-star-night]').click();
  await page.waitForFunction(() => document.querySelector('[data-star-night]').hidden);
  await page.waitForFunction(() =>
    /^2026-11-21 18:28:5\d$/.test(document.querySelector('.world-bar [data-time]').value)
  );
  const dusk = await clock.inputValue();
  await control('.world-bar [data-exit]').click();
  return { angles, dusk };
}
