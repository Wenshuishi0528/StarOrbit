async (page) => {
  const check = (ok, message) => {
    if (!ok) throw Error(message);
  };
  await page.waitForFunction(
    () => window.viewer?.sim?.initialized && !viewer.sim.environment.loading,
    null,
    { timeout: 90000 }
  );
  const report = {};
  await page.evaluate(() => {
    document.getElementById('welcomeDialog')?.close();
    viewer.music.pause();
    const s = viewer.sim,
      e = s.environment;
    s.paused = true;
    s.setView('orbit');
    e.settings.clouds = false;
    e.weather.settings.volume = false;
    e.settings.geographyEnabled = false;
    e.settings.groundTrack = false;
    e.settings.earthElevation = true;
    e.elevation.setEnabled(true);
    s.orbitControls.enableDamping = false;
    s.orbitControls.minDistance = 1;
    s.orbitControls.maxDistance = 100000;
  });
  for (const [id, lat, lon, time, height, offset, fov, targetHeight] of [
    ['rainier', 46.8523, -121.7603, Date.UTC(2026, 6, 8, 20), 60, 85, 8, 4.3],
    ['beijing-hills', 39.982, 116.218, Date.UTC(2026, 6, 8, 4), 50, 60, 4, 0.3],
  ]) {
    await page.evaluate(
      ({ lat, lon, time, height, offset, fov, targetHeight }) => {
        const s = viewer.sim,
          e = s.environment;
        s.seek(time);
        s.paused = true;
        s.update(performance.now());
        const D = Math.PI / 180,
          l = lat * D,
          o = lon * D,
          n = [Math.cos(l) * Math.cos(o), Math.cos(l) * Math.sin(o), Math.sin(l)],
          north = [-Math.sin(l) * Math.cos(o), -Math.sin(l) * Math.sin(o), Math.cos(l)];
        viewer.camera.fov = fov;
        viewer.camera.updateProjectionMatrix();
        const q = e.earth.quaternion;
        s.spaceCamera.position
          .fromArray(n.map((v, i) => v * (6371 + height) + north[i] * offset))
          .applyQuaternion(q);
        s.spaceCamera.up.fromArray(n).applyQuaternion(q);
        s.orbitControls.target
          .fromArray(n.map((v) => v * (6371 + targetHeight)))
          .applyQuaternion(q);
        s.orbitControls.update();
        s.render();
      },
      { lat, lon, time, height, offset, fov, targetHeight }
    );
    await page.waitForTimeout(400);
    await page.waitForFunction(
      () => {
        const e = viewer.sim.environment;
        return e.elevation.status('main').complete && e.elevation.status('main').renderedTiles > 0;
      },
      null,
      { timeout: 180000 }
    );
    await page.waitForTimeout(700);
    await page.screenshot({ path: `output/playwright/v117-${id}-main.png` });
    report[id] = await page.evaluate(async () => {
      const s = viewer.sim,
        e = s.environment,
        r = viewer.renderer,
        gl = r.getContext();
      const get = () => {
        s.render();
        gl.finish();
        const p = new Uint8Array(64 * 64 * 4);
        gl.readPixels(
          gl.drawingBufferWidth / 2 - 32,
          gl.drawingBufferHeight / 2 - 32,
          64,
          64,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          p
        );
        return p;
      };
      const a = get(),
        status = e.elevation.status('main'),
        views = [...e.elevation.views.values()].map((v) => ({
          tiles: v.plan.tiles.length,
          level: v.plan.level,
        }));
      const samples = [];
      for (let i = 0; i < 30; i++) {
        const t = performance.now();
        s.render();
        gl.finish();
        samples.push(performance.now() - t);
        await new Promise((r) => requestAnimationFrame(r));
      }
      e.settings.earthElevation = false;
      e.elevation.setEnabled(false);
      const b = get(),
        offSamples = [];
      for (let i = 0; i < 30; i++) {
        const t = performance.now();
        s.render();
        gl.finish();
        offSamples.push(performance.now() - t);
        await new Promise((r) => requestAnimationFrame(r));
      }
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
      e.settings.earthElevation = true;
      e.elevation.setEnabled(true);
      const until = performance.now() + 30000;
      while (performance.now() < until) {
        s.render();
        if (e.elevation.status('main').complete && e.elevation.status('main').renderedTiles) break;
        await new Promise((r) => setTimeout(r, 30));
      }
      offSamples.sort((a, b) => a - b);
      samples.sort((a, b) => a - b);
      return {
        status,
        views,
        geometryActual: e.elevationLayer.base.geometry === e.elevation.baseGeometry,
        cityAtlasShared:
          e.elevationLayer.base.material.uniforms.cityMap.value === e.cityTerrain.texture,
        mainVisible: e.elevationLayer.group.visible,
        p50ms: samples[15],
        p95ms: samples[28],
        sphereP50ms: offSamples[15],
        sphereP95ms: offSamples[28],
        glError: gl.getError(),
        shaderErrors: r.info.programs.filter((p) => p.diagnostics?.runnable === false).length,
        comparison: diff / a.length,
      };
    });
    check(
      report[id].status.complete &&
        report[id].geometryActual &&
        report[id].cityAtlasShared &&
        report[id].mainVisible,
      id + ' shared geometry or imagery missing ' + JSON.stringify(report[id])
    );
    check(report[id].comparison > 0.5, id + ' terrain output unchanged');
    check(report[id].glError === 0 && !report[id].shaderErrors, id + ' GL error');
  }
  return report;
};
