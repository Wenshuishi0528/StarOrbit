import { createXuntianViewRenderer } from '../../src/xuntian-view-render.js';
import { skyDetailView, resolveSkyDetailSource } from '../../src/sky-detail-plan.js';
import { equatorial } from '../../src/environment-math.js';
import { cross, unit } from '../../src/orbit.js';
import { mainSkyReference } from './xuntian-main-sky-reference.js';

const check = (value, message) => {
  if (!value) throw Error(message);
};
async function photoPixels(blob) {
  const bitmap = await createImageBitmap(blob),
    canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  return {
    canvas,
    data: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data,
  };
}
export async function checkHDSky(sim) {
  const env = sim.environment,
    manager = env.skyDetail,
    p = manager.providers.find((p) => p.tiles),
    forward = equatorial(p.center.raDeg, p.center.decDeg),
    right = unit(cross(forward, [0, 0, 1])),
    axes = { forward, right, up: unit(cross(right, forward)) },
    identity = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  const frame = {
    q: { basis: identity, earthAxes: identity, sun: [149597870.7, 0, 0], t: Date.UTC(2026, 10, 6) },
    axes,
    eyeKm: forward.map((v) => v * 6776),
    eyeLocal: [300, -200, 120],
    aspect: 1.6,
    fovY: 0.035,
    apertureMm: 600,
    exposure: 1,
    showGalaxy: true,
    showStars: true,
    showStation: false,
    skyExposure: 'cinematic',
    skyBrightness: 1,
  };
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:480px;height:300px;position:absolute;left:-9999px';
  document.body.append(canvas);
  const view = createXuntianViewRenderer(sim, canvas),
    width = 960,
    height = 600;
  const old = { ...env.settings },
    chartVisible = env.starChart.group.visible;
  try {
    Object.assign(env.settings, {
      skyDetail: true,
      skyDetailSource: 'auto',
      stars: true,
      milky: true,
      starBrightness: 1,
      exposure: 'cinematic',
    });
    manager.setEnabled(true);
    manager.setSource('auto');
    await env.setSkyStyle();
    env.starChart.group.visible = false;
    const hd = await photoPixels(await view.capture(frame, { width }));
    const size = { w: width, h: height, aspect: 1.6 },
      pointing = skyDetailView(frame, size);
    await manager.prepare('main-test', pointing, true);
    manager.release('main');
    env.skyDetailLayer.update(pointing, true);
    const main = mainSkyReference(sim, frame, width, height)
      .getContext('2d')
      .getImageData(0, 0, width, height).data;
    let difference = 0,
      count = 0,
      detail = 0;
    for (let y = 100; y < height - 100; y++)
      for (let x = 100; x < width - 100; x++) {
        const k = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          difference += Math.abs(hd.data[k + c] - main[k + c]);
          count++;
        }
        detail += Math.abs(hd.data[k] - hd.data[k + 4]);
      }
    difference /= count;
    window.__skyDebug = {
      difference,
      detail: detail / (count / 3),
      status: {
        ...manager.status('main-test'),
        sources: manager.status('main-test').sources.map((p) => p.id),
      },
      png: hd.canvas.toDataURL(),
      mainReady: manager.status('main').ready,
      mainMeshes: env.skyDetailLayer.meshes.size,
    };
    check(difference < 4, `Main / telescope HD images disagree: ${difference}`);
    check(detail / (count / 3) > 0.7, 'Recent source is blank or excessively blurred');
    const ready = manager.status('main-test');
    check(
      ready.sources.some((p) => p.id === 'jwst-carina-2022'),
      'Recent AVIF source was not loaded'
    );
    check(
      ready.gpuBytes <= 64 * 1024 * 1024 && ready.textureCount <= 48,
      'Global tile budget exceeded'
    );
    env.settings.skyDetail = false;
    manager.setEnabled(false);
    const fallback = await photoPixels(await view.capture(frame, { width }));
    let changed = 0;
    for (let k = 0; k < hd.data.length; k += 16) changed += Math.abs(hd.data[k] - fallback.data[k]);
    check(changed / (hd.data.length / 16) > 8, 'HD did not improve over the magnified panorama');
    check(manager.status('main').textureCount === 0, 'Disabled HD retained GPU textures');
    Object.assign(env.settings, { skyDetail: true });
    manager.setEnabled(true);
    const hidden = await photoPixels(
      await view.capture({ ...frame, showStars: false }, { width: 320 })
    );
    check(
      hidden.data.every((v, i) => i % 4 === 3 || v < 3),
      'HD ignored the shared stars toggle'
    );
    let shutters = 0;
    await view.capture(frame, {
      width: 320,
      atShutter: () => (++shutters === 1 ? frame : { ...frame, fovY: 12 }),
    });
    check(shutters === 2, 'Photo should refresh once, then take a final live shutter');
    check(
      view.photoSkyStatus().requested > 0 && !view.photoSkyStatus().complete,
      'A newly changed final field incorrectly inherited the previous HD readiness'
    );
    const renderer = sim.api.renderer;
    const brokenPrograms = renderer.info.programs.filter(
      (p) => p.diagnostics?.runnable === false
    ).length;
    check(!brokenPrograms, 'HD shader failed to compile');
    return {
      difference,
      detail: detail / (count / 3),
      textureCount: ready.textureCount,
      gpuMiB: ready.gpuBytes / 1048576,
      sources: ready.sources.map((p) => p.id),
      hdPNG: hd.canvas.toDataURL(),
      fallbackPNG: fallback.canvas.toDataURL(),
    };
  } finally {
    view.dispose();
    manager.release('main-test');
    canvas.remove();
    Object.assign(env.settings, old);
    manager.setEnabled(old.skyDetail);
    manager.setSource(resolveSkyDetailSource(old));
    env.starChart.group.visible = chartVisible;
  }
}
