async (page) => {
  await page.waitForFunction(() => window.viewer?.sim.initialized);
  if (await page.locator('#welcomeDialog').evaluate((el) => el.open))
    await page.locator('#skipTour').click();
  if (await page.locator('#flightLab').evaluate((el) => el.open))
    await page.locator('#closeFlightLab').click();
  await page.locator('#languageZh').click();
  await page.evaluate(() => {
    viewer.sim.seek(Date.UTC(2026, 10, 5, 15, 59, 40));
    viewer.sim.update(performance.now());
  });
  await page.locator('#openFlightLab').click();
  await page.locator('#surveyTab').click();
  const lab = page.locator('#surveyPanel');
  await lab.locator('[data-survey=show-schedule]').click();
  await lab.locator('[data-survey=new-orbit]').click();
  await page.waitForFunction(() =>
    document.querySelector('#surveyPanel .survey-schedule-time')?.textContent.includes('2026-11-06')
  );
  const display = lab.locator('[data-survey=coverage-field]'),
    rows = lab.locator('[data-job]');
  const snapshot = () =>
    rows.evaluateAll((all) =>
      all.map((row) => {
        const value = (key) => row.querySelector('[data-survey=' + key + ']').value;
        return {
          field: value('field'),
          tile: +value('tile'),
          start: +value('start'),
          duration: +value('duration'),
          enabled: row.querySelector('[data-survey=enabled]').checked,
        };
      })
    );
  const ids = await display.locator('option').evaluateAll((all) => all.map((o) => o.value));
  let clear, blocked;
  for (const id of ids) {
    await display.selectOption(id);
    const feedback = await lab.locator('[data-survey=schedule-feedback]').textContent();
    if (feedback.includes('太阳避让')) blocked = id;
    if (feedback.includes('可见窗口重新安排') || feedback.includes('均可在当前排程')) clear = id;
  }
  if (!clear || !blocked)
    throw Error('Orbit did not expose both a schedulable and solar-excluded field');
  await display.selectOption(blocked);
  await rows.nth(1).locator('[data-survey=duration]').selectOption('60');
  await rows.nth(1).locator('[data-survey=enabled]').uncheck();
  const before = await snapshot();
  await display.selectOption(clear);
  const synchronized = await snapshot();
  if (
    !synchronized.every(
      (j, i) =>
        j.field === clear &&
        j.tile === i &&
        j.start === before[i].start &&
        j.duration === before[i].duration &&
        j.enabled === before[i].enabled
    )
  )
    throw Error('Field change lost manual settings or did not retarget every tile');
  await rows.nth(0).locator('[data-survey=field]').selectOption(blocked);
  await rows.nth(0).locator('[data-survey=start]').focus();
  if ((await display.inputValue()) !== clear || (await snapshot())[1].field !== clear)
    throw Error('A row edit changed the global field or another row');
  await lab.locator('[data-survey=arrange]').click();
  if (
    !(await lab.locator('[data-survey=play]').isEnabled()) ||
    !(await snapshot()).every((j, i) => j.field === clear && j.tile === i && j.enabled)
  )
    throw Error('Clear-window arrangement did not produce a runnable four-tile plan');
  await display.selectOption(blocked);
  const blockedSnapshot = JSON.stringify(await snapshot());
  await lab.locator('[data-survey=arrange]').click();
  if (
    JSON.stringify(await snapshot()) !== blockedSnapshot ||
    (await lab.locator('[data-survey=play]').isEnabled())
  )
    throw Error('Solar exclusion replaced or executed the manual plan');
  const rowText = await rows.locator('.survey-rowstatus').allTextContents();
  if (
    !rowText.every((text) => text.includes('UTC+8')) ||
    !rowText.some((text) => text.includes('太阳角距'))
  )
    throw Error('Missing absolute time or pointing reason');
  const search = lab.locator('#surveyTargetSearch');
  await search.fill('02h 30m +80°');
  await search.press('Enter');
  const customId = 'sky-37.5_80';
  if (
    (await display.inputValue()) !== customId ||
    !(await snapshot()).every((job) => job.field === customId)
  )
    throw Error('Custom coordinates did not reach all four schedule rows');
  const record = await page.evaluate(
    () => viewer.sim.flightLab.panels.survey.getObservationRecord().record
  );
  if (record.fields[0]?.ra !== 37.5 || record.fields[0]?.dec !== 80)
    throw Error('Missing custom field geometry in the saved recipe');
  await display.selectOption(clear);
  const restored = await page.evaluate(
    (recipe) => viewer.sim.flightLab.panels.survey.restoreObservationRecord(recipe),
    record
  );
  if (!restored || (await display.inputValue()) !== customId)
    throw Error('Custom mosaic did not survive restoration');
  await search.fill('火星');
  await search.press('Enter');
  if (
    (await lab.locator('[data-survey=single]').isVisible()) ||
    !(await lab.locator('[data-survey=dynamic]').isVisible())
  )
    throw Error('A moving target offered a fixed sky exposure');
  await lab.locator('[data-survey=back-static]').click();
  if ((await display.inputValue()) !== customId)
    throw Error('Leaving a moving target lost the previous plan');
  await page.locator('#closeFlightLab').click();
  return { clear, blocked, retargeted: 4, individualEdit: true, failedPlanPreserved: true };
};
