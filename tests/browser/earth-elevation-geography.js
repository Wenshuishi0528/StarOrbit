// Real render regression: checking group.visible alone misses a hidden ancestor.
async (page) => {
  await page.waitForFunction(
    () => window.viewer?.sim?.initialized && !viewer.sim.environment.loading,
    null,
    { timeout: 90000 }
  );
  if (!(await page.evaluate(() => viewer.sim.environment.settings.earthElevation)))
    throw Error('Real terrain must default on for a new profile');
  await page.evaluate(() => {
    document.getElementById('welcomeDialog')?.close();
    viewer.music.pause();
    const s = viewer.sim,
      e = s.environment;
    s.seek(Date.UTC(2026, 10, 5, 4));
    s.paused = true;
    s.setView('orbit');
    s.update(performance.now());
    Object.assign(e.settings, {
      geographyEnabled: true,
      geoBorders: true,
      geoRivers: true,
      geoLakes: true,
      groundTrack: true,
      earthElevation: false,
    });
    const lon = (108 * Math.PI) / 180,
      lat = (32 * Math.PI) / 180;
    s.spaceCamera.position
      .set(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat))
      .applyQuaternion(e.earth.quaternion)
      .multiplyScalar(20000);
    s.spaceCamera.up.set(0, 0, 1).applyQuaternion(e.earth.quaternion);
    s.orbitControls.target.set(0, 0, 0);
    s.orbitControls.stopMotion();
    s.orbitControls.update();
    s.render();
  });
  const report = [];
  for (const enabled of [false, true, false, true]) {
    await page.evaluate((enabled) => {
      viewer.sim.environment.settings.earthElevation = enabled;
      viewer.sim.render();
    }, enabled);
    if (enabled)
      await page.waitForFunction(
        () => viewer.sim.environment.elevation.status('main').baseReady,
        null,
        { timeout: 30000 }
      );
    await page.waitForTimeout(350);
    const row = await page.evaluate(() => {
      const s = viewer.sim,
        e = s.environment,
        g = e.geography;
      const objects = {
        labels: g.labels,
        borders: g.lines.china,
        rivers: g.lines.rivers,
        lakes: g.lines.lakes,
        track: e.track,
        sphere: e.earth,
        terrain: e.elevationLayer.base,
      };
      const draws = {},
        restore = [];
      for (const [name, object] of Object.entries(objects)) {
        draws[name] = 0;
        const original = object.onBeforeRender;
        object.onBeforeRender = function (...args) {
          draws[name]++;
          original.apply(this, args);
        };
        restore.push(() => {
          object.onBeforeRender = original;
        });
      }
      try {
        s.render();
      } finally {
        restore.forEach((fn) => fn());
      }
      return {
        enabled: e.settings.earthElevation,
        draws,
        beijing: [...g.shown.values()].some((p) => p.id === 'beijing' && p.out === undefined),
        labels: g.stats.visible,
        glError: viewer.renderer.getContext().getError(),
      };
    });
    report.push(row);
    if (
      !row.beijing ||
      !row.labels ||
      !row.draws.labels ||
      !row.draws.borders ||
      !row.draws.rivers ||
      !row.draws.lakes ||
      !row.draws.track
    )
      throw Error('Earth annotations did not render: ' + JSON.stringify(report));
    if (
      row.draws.sphere !== (enabled ? 0 : 1) ||
      row.draws.terrain !== (enabled ? 1 : 0) ||
      row.glError
    )
      throw Error('Incorrect surface switching: ' + JSON.stringify(report));
  }
  await page.screenshot({ path: 'output/playwright/v118-geography-terrain.png' });
  const disabled = await page.evaluate(() => {
    const s = viewer.sim,
      e = s.environment,
      g = e.geography;
    e.settings.geographyEnabled = false;
    e.settings.groundTrack = false;
    s.render();
    return !g.group.visible && !e.track.visible && e.elevationLayer.group.visible;
  });
  if (!disabled) throw Error('Geography switches no longer control overlays independently');
  // Upgrade old defaults once, then respect an explicit off choice on restart.
  await page.evaluate(() =>
    localStorage.setItem(
      'tiangong-environment-v1',
      JSON.stringify({ earthElevation: false, quality: 'high' })
    )
  );
  await page.waitForLoadState('networkidle');
  await page.reload();
  await page.waitForFunction(
    () => window.viewer?.sim?.initialized && !viewer.sim.environment.loading
  );
  if (!(await page.evaluate(() => viewer.sim.environment.settings.earthElevation)))
    throw Error('Old default was not migrated');
  await page.evaluate(() => {
    const checkbox = document.getElementById('earthElevation');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
  });
  await page.waitForLoadState('networkidle');
  await page.reload();
  await page.waitForFunction(
    () => window.viewer?.sim?.initialized && !viewer.sim.environment.loading
  );
  if (await page.evaluate(() => viewer.sim.environment.settings.earthElevation))
    throw Error('Explicit off choice was overwritten after restart');
  return { report, independentSwitches: disabled, defaultOn: true, migrationAndPersistence: true };
};
