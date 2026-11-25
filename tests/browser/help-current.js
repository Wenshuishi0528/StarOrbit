// Run against a locally built app in a fresh browser context with Playwright.
// playwright-cli run-code --filename tests/browser/help-current.js
async (page, output = 'output/playwright/help-current') => {
  const checks = [];
  const check = (condition, name, details) => {
    if (!condition) throw new Error(name + ': ' + JSON.stringify(details));
    checks.push({ name, pass: true });
  };
  const panel = page.locator('#helpPanel');
  const contents = page.locator('#helpContents');
  const title = page.locator('#helpTitle');
  const button = (id) => page.locator('#' + id);
  const tourIds = [
    'view',
    'mission',
    'time',
    'assembly',
    'sky-image',
    'xuntian',
    'sky-chart',
    'flight',
    'world',
    'pass',
    'observatory',
    'resources',
    'share',
  ];
  const sectionCounts = [3, 4, 6, 7, 5, 5, 6, 6, 4, 5, 6];
  const sectionIds = sectionCounts.flatMap((count, chapter) =>
    Array.from({ length: count }, (_, index) => 's' + (chapter + 1) + '-' + (index + 1))
  );
  const expectView = async (view) => {
    await page.waitForFunction((value) => {
      const el = document.getElementById('helpPanel');
      return !el.hidden && el.dataset.helpView === value;
    }, view);
  };
  const useHelp = async () => {
    if (!(await button('helpToggle').isVisible())) await button('toolsToggle').click();
    await button('helpToggle').click();
    await expectView('home');
  };
  const openTour = async () => {
    await useHelp();
    await button('replayTour').click();
    await expectView('tour');
  };
  const close = async () => {
    await button('closeHelp').click();
    await panel.waitFor({ state: 'hidden' });
  };
  const screenshot = async (name) => {
    await page.screenshot({ path: output + '/' + name + '.png', timeout: 30000 });
  };
  const fits = async (name) => {
    const size = page.viewportSize(),
      bounds = await panel.boundingBox();
    check(
      bounds &&
        bounds.width > 100 &&
        bounds.height > 80 &&
        bounds.x >= -1 &&
        bounds.y >= -1 &&
        bounds.x + bounds.width <= size.width + 1 &&
        bounds.y + bounds.height <= size.height + 1,
      name + ' fits screen',
      { bounds, size }
    );
  };
  const readPage = async () =>
    page.evaluate(() => ({
      title: document.getElementById('helpTitle').innerText,
      progress: document.getElementById('helpProgress').innerText,
      text: document.getElementById('helpContents').innerText,
    }));
  const localeBody = (text, language) => {
    if (language === 'Zh') return /[\u3400-\u9fff]/.test(text);
    if (/[\u3400-\u9fff]/.test(text)) return false;
    return language !== 'Ru' || /[А-Яа-яЁё]/.test(text);
  };
  const baseline = () =>
    page.evaluate(() => ({
      time: viewer.sim.time,
      paused: viewer.sim.paused,
      speed: viewer.sim.speed,
      mode: viewer.sim.mode,
      mission: viewer.sim.missionId,
      quality: viewer.sim.environment.quality,
      appearance: ['clouds', 'stars', 'cityTerrain', 'starBrightness'].map(
        (key) => viewer.sim.environment.settings[key]
      ),
      optics: ['field', 'aperture', 'ev', 'roll'].map((key) => viewer.sim.xuntian.pointing[key]),
      slots: viewer.state.slots,
      scope: viewer.sim.xuntian.active,
      focus: viewer.sim.cameraFocus.selected,
    }));
  const openXuntianCard = async () => {
    await openTour();
    await button('helpDirectory').click();
    await contents.locator('[data-tour-id="xuntian"]').click();
  };

  await page.waitForFunction(
    () =>
      window.viewer?.sim?.initialized &&
      typeof document.getElementById('helpToggle')?.onclick === 'function',
    undefined,
    { timeout: 90000 }
  );
  if (await page.locator('#welcomeDialog').evaluate((el) => el.open)) {
    check(
      (await button('startTour').isVisible()) && (await button('welcomeManual').isVisible()),
      'first-launch welcome offers both guide and handbook'
    );
    await button('welcomeManual').click();
    await expectView('manualIndex');
    await close();
  }
  // Hold one instant while checking that reading help preserves the scene.
  await page.evaluate(() => {
    viewer.music.audio.pause();
    viewer.sim.seek(viewer.sim.time);
  });
  const before = await baseline();
  for (const language of ['Zh', 'En', 'Ru', 'Fr']) {
    await button('language' + language).click();
    await openTour();
    for (let i = 0; i < tourIds.length; i++) {
      const card = await readPage();
      const seq = i + 1;
      check(
        new RegExp(seq + '\\s*/\\s*13').test(card.progress) &&
          new RegExp('^' + seq + '(?:[.、．: ]|$)').test(card.title.trim()),
        language + ' tour number ' + seq,
        card
      );
      check(
        card.text.length >= 25 && localeBody(card.title + ' ' + card.text, language),
        language + ' tour copy ' + seq,
        card
      );
      if (language === 'Zh' && seq === 4) {
        const exercise = contents.locator('details').first();
        await exercise.locator('summary').click();
        check((await exercise.innerText()).includes('空置'), 'assembly exercise includes undo');
        await page.locator('[data-preset="labs"]').click();
        await button('TH_FORWARD').selectOption('TH');
        const secondFront = page.locator('select[id="TH_FORWARD/TH_FORWARD"]');
        await secondFront.selectOption('TH');
        check(
          (await page.locator('#ports [data-core]').count()) === 3,
          'guide builds two additional Tianhe cores'
        );
        await screenshot('04-station-assembly');
        await button('TH_FORWARD').selectOption('');
        check(
          (await page.locator('#ports [data-core]').count()) === 1 &&
            (await button('TH_WENTIAN').inputValue()) === 'WT' &&
            (await button('TH_MENGTIAN').inputValue()) === 'MT',
          'clearing the first forward port restores the original three modules'
        );
        await page.locator('[data-preset="full"]').click();
        check(
          (await button('TH_FORWARD').inputValue()) === 'SZ' &&
            (await button('TH_LOWER').inputValue()) === 'SZ' &&
            (await button('TH_AFT').inputValue()) === 'TZ',
          'complete station preset includes both Shenzhou ships and Tianzhou'
        );
      }
      if (i + 1 < tourIds.length) await button('tourNext').press('Enter');
    }
    if (language === 'Zh') {
      await button('tourPrevious').click();
      check(
        /12\s*\/\s*13/.test((await readPage()).progress),
        'previous button revisits guide page 12'
      );
      await button('tourNext').click();
    }
    await button('helpDirectory').click();
    await expectView('tourIndex');
    const ids = await contents
      .locator('[data-tour-id]')
      .evaluateAll((list) => list.map((e) => e.dataset.tourId));
    check(JSON.stringify(ids) === JSON.stringify(tourIds), language + ' tour directory order', ids);
    await close();
    await useHelp();
    await button('helpManual').click();
    await expectView('manualIndex');
    const chapters = contents.locator('details[data-chapter-id]');
    check((await chapters.count()) === 11, language + ' manual chapters', await chapters.count());
    const idsInIndex = await contents
      .locator('[data-section-id]')
      .evaluateAll((list) => list.map((el) => el.dataset.sectionId));
    check(
      JSON.stringify(idsInIndex) === JSON.stringify(sectionIds),
      language + ' manual 57 sections, in order',
      idsInIndex
    );
    if (!(await chapters.first().evaluate((el) => el.open)))
      await chapters.first().locator('summary').click();
    await contents.locator('[data-section-id="s1-1"]').click();
    await expectView('manual');
    for (let i = 0; i < sectionIds.length; i++) {
      const section = await readPage();
      const number = sectionIds[i].slice(1).replace('-', '.');
      check(
        section.title.match(/^\d+\.\d+/)?.[0] === number &&
          section.text.length >= 70 &&
          localeBody(section.title + ' ' + section.text, language),
        language + ' manual section ' + number,
        section
      );
      if (i + 1 < sectionIds.length) await button('tourNext').press('Enter');
    }
    await close();
  }

  await button('languageZh').click();
  await useHelp();
  await screenshot('01-help-home');
  await button('helpManual').click();
  await button('helpSearch').fill('织女星');
  const result = contents.locator('[data-section-id="s4-2"]');
  check(await result.isVisible(), 'search finds actionable Xuntian example');
  await result.click();
  await expectView('manual');
  check((await title.innerText()).startsWith('4.2'), 'opens matching section');
  await button('tourPrevious').click();
  check(
    (await title.innerText()).startsWith('4.1'),
    'previous button revisits the preceding manual section'
  );
  await button('tourNext').click();
  await screenshot('04-manual-xuntian');
  await close();
  await useHelp();
  await button('helpResume').click();
  await expectView('manual');
  check((await title.innerText()).startsWith('4.2'), 'resumes last manual section');
  await close();

  await openXuntianCard();
  const topic = await title.innerText();
  await button('helpSwitch').click();
  await expectView('manual');
  check((await title.innerText()).startsWith('4.2'), 'tour opens manual at matching section');
  await button('helpSwitch').click();
  await expectView('tour');
  check((await title.innerText()) === topic, 'back to originating tour page');
  await close();
  await useHelp();
  await button('helpResume').click();
  check((await title.innerText()) === topic, 'continues the same tour page after closing');
  check(
    JSON.stringify(await baseline()) === JSON.stringify(before),
    'reading preserves the active scene',
    await baseline()
  );

  // Drive actual sample controls and assert the real Xuntian optical target.
  const exampleTime = Date.parse('2026-11-05T13:44:00+08:00');
  await contents.locator('[data-help-example="vega"]').click();
  await page.waitForFunction(
    (t) => {
      const sim = viewer.sim;
      return (
        sim.time === t &&
        sim.paused &&
        sim.xuntian.active &&
        /^hip:91262$/i.test(sim.xuntian.pointing.target)
      );
    },
    exampleTime,
    { timeout: 45000 }
  );
  check(true, 'sample opens telescope, pauses at the specified instant and points at Vega');
  await screenshot('06-xuntian-vega');
  await contents.locator('[data-help-example="beijing"]').click();
  await page.waitForFunction(
    (t) => {
      const sim = viewer.sim,
        p = sim.xuntian.pointing;
      return (
        sim.time === t &&
        sim.paused &&
        p.target === 'city:beijing' &&
        p.ground?.visible &&
        Math.abs(p.ground.latitude - 39.9042) < 0.05 &&
        Math.abs(p.ground.longitude - 116.4074) < 0.05
      );
    },
    exampleTime,
    { timeout: 45000 }
  );
  check(true, 'second example aims at visible Beijing without changing time');
  await page.waitForFunction(
    () => {
      const sim = viewer.sim,
        p = sim.xuntian.pointing,
        city = sim.xuntian.result?.cityTerrain;
      return (
        !sim.environment.settings.clouds &&
        sim.environment.settings.cityTerrain &&
        Math.abs(p.field - 0.7) < 0.001 &&
        Math.abs(p.ev - 0.7) < 0.001 &&
        city?.complete &&
        city.ready > 0 &&
        city.sources.some((source) => source.id === 'beijing')
      );
    },
    undefined,
    { timeout: 45000 }
  );
  check(true, 'Beijing optics and cloud-free bundled city imagery are ready');
  const visibleTexture = await page.waitForFunction(
    () => {
      const canvas = document.querySelector('#xtCanvas');
      if (!(Number(canvas.dataset.xuntianFrame) > 0)) return false;
      // Central pixels avoid all finder labels and the HTML crosshair.
      const width = 96,
        x = (canvas.width - width) >> 1,
        y = (canvas.height - width) >> 1;
      const rgba = canvas.getContext('2d').getImageData(x, y, width, width).data;
      let light = 0,
        edges = 0,
        samples = 0;
      for (let row = 0; row < width; row += 2) {
        for (let col = 0; col < width - 2; col += 2) {
          const i = (row * width + col) * 4;
          const luma = (rgba[i] + 2 * rgba[i + 1] + rgba[i + 2]) / 4;
          const next = (rgba[i + 8] + 2 * rgba[i + 9] + rgba[i + 10]) / 4;
          light += luma;
          if (Math.abs(next - luma) > 3) edges++;
          samples++;
        }
      }
      const brightness = light / samples,
        edgeFraction = edges / samples;
      return brightness > 35 && edgeFraction > 0.06 && { brightness, edgeFraction };
    },
    undefined,
    { timeout: 45000, polling: 150 }
  );
  check(true, 'the Beijing viewfinder contains illuminated, textured city imagery');
  checks.at(-1).image = await visibleTexture.jsonValue();
  await screenshot('06-xuntian-beijing');
  await contents.locator('[data-help-example="restore"]').click();
  await page.waitForFunction(
    (b) =>
      viewer.sim.time === b.time &&
      viewer.sim.missionId === b.mission &&
      viewer.sim.xuntian.active === b.scope,
    before,
    { timeout: 45000 }
  );
  check(
    JSON.stringify(await baseline()) === JSON.stringify(before),
    'example restores prior scene',
    await baseline()
  );
  await close();

  await button('openXuntianMap').click();
  await button('xtAperture').press('ArrowLeft');
  await button('xtEV').press('ArrowRight');
  const originalScope = await baseline();
  check(
    originalScope.scope && originalScope.optics[2] !== 0 && originalScope.optics[1] !== 600,
    'starts a second trial with user-selected optical settings',
    originalScope
  );
  await openXuntianCard();
  await contents.locator('[data-help-example="beijing"]').click();
  await page.waitForFunction(() => viewer.sim.xuntian.pointing.target === 'city:beijing');
  await contents.locator('[data-help-example="restore"]').click();
  await page.waitForFunction(() => !viewer.sim.helpExampleActive);
  check(
    JSON.stringify(await baseline()) === JSON.stringify(originalScope),
    'returns to an already-open viewfinder with the previous optics and environment',
    await baseline()
  );
  await close();
  await button('xtClose').click();

  await button('missionSelect').selectOption('dfh1');
  await page.waitForFunction(() => viewer.sim.missionId === 'dfh1' && !viewer.sim.missions.busy);
  const alternate = await baseline();
  await openXuntianCard();
  await contents.locator('[data-help-example="vega"]').click();
  await page.waitForFunction(
    () =>
      viewer.sim.missionId === 'tiangong' &&
      viewer.sim.xuntian.active &&
      /^hip:91262$/i.test(viewer.sim.xuntian.pointing.target),
    undefined,
    { timeout: 45000 }
  );
  await close();
  await page.waitForFunction(
    (b) =>
      viewer.sim.time === b.time &&
      viewer.sim.missionId === b.mission &&
      !viewer.sim.helpExampleActive &&
      !viewer.sim.missions.busy,
    alternate,
    { timeout: 45000 }
  );
  check(
    JSON.stringify(await baseline()) === JSON.stringify(alternate),
    'closing sample restores Dongfanghong task and state',
    await baseline()
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.waitForFunction(() => document.getElementById('toolbarActions').hidden);
  await openTour();
  check(
    (await contents.innerText()).includes('单指'),
    'touchscreen receives the touch instructions'
  );
  await fits('narrow guide');
  await screenshot('mobile-tour');
  await button('helpSwitch').click();
  await expectView('manual');
  await fits('narrow manual');
  await screenshot('mobile-manual');
  await close();
  await useHelp();
  await button('helpResume').click();
  await expectView('manual');
  await button('helpDirectory').click();
  await button('helpSearch').fill('按眼前的现象查');
  await contents.locator('[data-section-id="s11-6"]').click();
  await expectView('manual');
  const mobileTitle = await title.innerText();
  const scrollOffset = await contents.evaluate((el) => {
    el.scrollTop = Math.min(120, el.scrollHeight - el.clientHeight);
    return el.scrollTop;
  });
  check(scrollOffset > 30, 'the longer manual section scrolls before closing', { scrollOffset });
  await close();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      window.viewer?.sim?.initialized &&
      typeof document.getElementById('helpToggle')?.onclick === 'function',
    undefined,
    { timeout: 90000 }
  );
  await useHelp();
  await button('helpResume').click();
  await expectView('manual');
  check(
    (await title.innerText()) === mobileTitle,
    'read position survives reload on narrow screen'
  );
  const recoveredScroll = await contents.evaluate((el) => el.scrollTop);
  check(
    Math.abs(recoveredScroll - scrollOffset) <= 2,
    'restores manual scroll position on narrow screen',
    { scrollOffset, recoveredScroll }
  );
  await close();
  await cdp.detach();
  return checks;
};
