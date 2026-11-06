// Run against the actual app with Playwright's run-code command.
async (page) => {
  const failures = [];
  const onError = (error) => failures.push(error.message);
  page.on('pageerror', onError);
  const check = (value, message) => {
    if (!value) throw Error(message);
  };
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.waitForFunction(
    () => window.viewer?.sim.initialized && !viewer.sim.environment.loading,
    null,
    { timeout: 90000 }
  );
  const saved = await page.evaluate(() => {
    const { sim: s, camera } = viewer,
      e = s.environment;
    viewer.music.pause();
    document.getElementById('welcomeDialog')?.close();
    const saved = {
      paused: s.paused,
      time: s.time,
      view: s.view,
      fov: camera.fov,
      position: s.spaceCamera.position.toArray(),
      up: s.spaceCamera.up.toArray(),
      target: s.orbitControls.target.toArray(),
      damping: s.orbitControls.enableDamping,
      settings: { ...e.settings },
      volume: e.weather.settings.volume,
    };
    s.paused = true;
    e.settings.clouds = false;
    e.weather.settings.volume = false;
    e.settings.cityTerrain = true;
    e.settings.cityAutoLoad = false;
    e.settings.geographyEnabled = false;
    e.settings.groundTrack = false;
    e.cityTerrain.setEnabled(true);
    s.setView('orbit');
    s.orbitControls.enableDamping = false;
    return saved;
  });
  const report = {};
  try {
    for (const [id, time] of [
      ['beijing', '2026-07-08T04:00:00Z'],
      ['seattle', '2026-07-08T20:00:00Z'],
    ]) {
      await page.evaluate(
        ({ id, time }) => {
          const s = viewer.sim,
            e = s.environment,
            city = e.cityTerrain.cities.get(id),
            [longitude, latitude] = city.center,
            lon = (longitude * Math.PI) / 180,
            lat = (latitude * Math.PI) / 180;
          s.seek(Date.parse(time));
          s.paused = true;
          s.update(performance.now());
          // render() copies the main camera FOV onto spaceCamera every frame.
          viewer.camera.fov = 1;
          viewer.camera.updateProjectionMatrix();
          s.spaceCamera.fov = 1;
          s.spaceCamera.position
            .set(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat))
            .applyQuaternion(e.earth.quaternion)
            .multiplyScalar(7500);
          s.spaceCamera.up.set(0, 0, 1).applyQuaternion(e.earth.quaternion);
          s.orbitControls.target.set(0, 0, 0);
          s.orbitControls.update();
          s.render();
        },
        { id, time }
      );
      await page.waitForFunction(() => {
        const detail = viewer.sim.environment.detail;
        return detail.wanted.every((tile) =>
          detail.slots.some(
            (slot) => slot.key === tile.key && slot.texture && performance.now() - slot.born > 450
          )
        );
      });
      report[id] = await page.evaluate(async (id) => {
        const s = viewer.sim,
          e = s.environment,
          manager = e.cityTerrain,
          city = manager.cities.get(id),
          gl = viewer.renderer.getContext();
        await manager.prepareView('main', manager.views.get('main').input, 1, 8000);
        const sample = () => {
          s.render();
          const pixels = new Uint8Array(128 * 128 * 4);
          gl.readPixels(
            Math.floor(gl.drawingBufferWidth / 2) - 64,
            Math.floor(gl.drawingBufferHeight / 2) - 64,
            128,
            128,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels
          );
          return pixels;
        };
        const high = sample();
        const mainUniforms = e.earth.material.uniforms;
        const shared =
          mainUniforms.cityMap.value === manager.texture &&
          manager.uniforms('main').cityMap.value === manager.texture;
        const count = mainUniforms.cityCount.value;
        const status = manager.status('main');
        const [longitude, latitude] = city.center,
          lon = (longitude * Math.PI) / 180,
          lat = (latitude * Math.PI) / 180;
        const center = s.spaceCamera.position
          .clone()
          .set(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat))
          .multiplyScalar(6371)
          .applyQuaternion(e.earth.quaternion)
          .project(s.spaceCamera);
        const uv = [longitude / 360 + 0.5, latitude / 180 + 0.5];
        const covering = manager.views.get('main').plan.filter((tile) => {
          const [u, v, w, h] = tile.rect;
          return tile.cityId === id && uv[0] >= u && uv[0] <= u + w && uv[1] >= v && uv[1] <= v + h;
        });
        e.settings.cityTerrain = false;
        manager.setEnabled(false);
        const fallback = sample();
        let mean = 0,
          difference = 0,
          variation = 0;
        for (let i = 0; i < high.length; i += 4) {
          mean += (high[i] + high[i + 1] + high[i + 2]) / 3;
          for (let c = 0; c < 3; c++) difference += Math.abs(high[i + c] - fallback[i + c]) / 3;
          if (i >= 4) variation += Math.abs(high[i] - high[i - 4]);
        }
        e.settings.cityTerrain = true;
        manager.setEnabled(true);
        await manager.prepareView('main', manager.views.get('main').input, 1, 8000);
        s.render();
        return {
          city: id,
          center: city.center,
          projectedCenter: [center.x, center.y],
          centerCoveredLevels: covering.map((tile) => tile.z),
          shared,
          count,
          requested: status.requested,
          ready: status.ready,
          complete: status.complete,
          sources: status.sources.map((source) => source.id),
          gpuBytes: status.gpuBytes,
          cpuBytes: status.cpuBytes,
          mean: mean / (high.length / 4),
          difference: difference / (high.length / 4),
          variation: variation / (high.length / 4),
          glError: gl.getError(),
          shaderFailures: viewer.renderer.info.programs
            .filter((program) => program.diagnostics?.runnable === false)
            .map((program) => program.diagnostics),
        };
      }, id);
      const result = report[id];
      check(result.complete && result.ready > 0 && result.count > 0, id + ': no ready city blocks');
      check(result.shared, id + ': main Earth did not share the manager atlas');
      check(result.sources.includes(id), id + ': wrong city source');
      check(Math.hypot(...result.projectedCenter) < 1e-7, id + ': city center is not centered');
      check(result.centerCoveredLevels.length >= 2, id + ': city center lacks detail and ancestor');
      check(
        result.difference > 1,
        id + ': main output did not change when city layer was disabled'
      );
      check(result.mean > 8 && result.variation > 0.1, id + ': blank or featureless main image');
      check(result.glError === 0 && !result.shaderFailures.length, id + ': WebGL render failure');
      await page.screenshot({ path: `output/playwright/v116-${id}-main.png` });
    }
    check(!failures.length, failures.join('\n'));
    return report;
  } finally {
    page.off('pageerror', onError);
    await page.evaluate((saved) => {
      const { sim: s, camera } = viewer,
        e = s.environment;
      Object.assign(e.settings, saved.settings);
      e.weather.settings.volume = saved.volume;
      e.cityTerrain.setEnabled(saved.settings.cityTerrain);
      camera.fov = saved.fov;
      camera.updateProjectionMatrix();
      s.setView(saved.view);
      s.seek(saved.time);
      s.paused = saved.paused;
      s.spaceCamera.position.fromArray(saved.position);
      s.spaceCamera.up.fromArray(saved.up);
      s.orbitControls.target.fromArray(saved.target);
      s.orbitControls.enableDamping = saved.damping;
      s.orbitControls.update();
      s.render();
    }, saved);
  }
};
