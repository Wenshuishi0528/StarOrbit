import { createXuntianViewRenderer } from '../../src/xuntian-view-render.js';
import { panstarrsViewCoverage } from '../../src/panstarrs-coverage.js';
import { hipsPixel } from '../../src/sky-detail-math.js';

// Compare patches with independently sampled native JPEGs. A real dark DSS
// pixel need not exceed an arbitrary luminance threshold to be covered.
function nativeReference(entries, rgba, side, frame) {
  const optical = entries.filter((entry) => !entry.provider.plate && !entry.provider.tiles);
  if (!optical.length) return {};
  const maps = new Map();
  let n = 0,
    rays = 0,
    xSum = 0,
    ySum = 0,
    xSq = 0,
    ySq = 0,
    xy = 0;
  const levels = [...new Set(optical.map((e) => e.order))].sort((a, b) => b - a);
  for (const e of optical) {
    const ctx = new OffscreenCanvas(512, 512).getContext('2d', { willReadFrequently: true });
    ctx.drawImage(e.bitmap, 0, 0);
    maps.set(e.order + '/' + e.pixel, ctx.getImageData(0, 0, 512, 512).data);
  }
  const t = Math.tan((frame.fovY * Math.PI) / 360),
    { right, up, forward } = frame.axes;
  for (let row = 0; row < 16; row++)
    for (let col = 0; col < 16; col++) {
      let a = 0,
        b = 0,
        samples = 0;
      for (let sy = 0; sy < 6; sy++)
        for (let sx = 0; sx < 6; sx++) {
          const u = (col + (sx + 0.5) / 6) / 16,
            v = (row + (sy + 0.5) / 6) / 16;
          const ray = forward.map(
            (value, i) => value + (2 * u - 1) * t * right[i] + (1 - 2 * v) * t * up[i]
          );
          for (const level of levels) {
            const loc = hipsPixel(level, ray);
            const pixels = maps.get(level + '/' + loc.pixel);
            if (!pixels) continue;
            const k =
              4 *
              (512 * Math.min(511, Math.floor(512 * loc.v)) +
                Math.min(511, Math.floor(512 * loc.u)));
            if (!pixels[k + 3]) continue;
            const p = 4 * (side * Math.floor(v * side) + Math.floor(u * side));
            a += Math.max(pixels[k], pixels[k + 1], pixels[k + 2]);
            b += Math.max(rgba[p], rgba[p + 1], rgba[p + 2]);
            samples++;
            break;
          }
        }
      rays += samples;
      if (!samples) continue;
      a /= samples;
      b /= samples;
      n++;
      xSum += a;
      ySum += b;
      xSq += a * a;
      ySq += b * b;
      xy += a * b;
    }
  return {
    nativeCoverage: rays / (256 * 36),
    nativeMean: xSum / n,
    correlation:
      (n * xy - xSum * ySum) / Math.sqrt((n * xSq - xSum * xSum) * (n * ySq - ySum * ySum)),
  };
}

// An initialized real app and the original remote DSS/PS1 services are used.
// The optional network switch is supplied by the browser host (e.g. Chrome CDP).
export async function checkWideSurveyImagery(sim, { setOffline, onPhoto } = {}) {
  const env = sim.environment,
    manager = env.skyDetail;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:512px;height:512px;position:fixed;left:-3000px';
  document.body.append(canvas);
  const view = createXuntianViewRenderer(sim, canvas, { skyOnly: true, captions: false });
  const main = document.querySelector('#skyDetailSource');
  const previous = main.value,
    finder = env.skyDetailControls.finderSelection();
  const report = {};
  const check = (value, message) => {
    if (!value) throw Error(message);
  };
  function aim(ra, dec, fovY, source, background = 'galaxy', artworkId = null) {
    const rad = Math.PI / 180,
      a = ra * rad,
      d = dec * rad;
    return {
      q: { ...sim.current, t: sim.time },
      aspect: 1,
      apertureMm: 600,
      exposure: 1,
      showGalaxy: true,
      showStars: true,
      skyExposure: 'cinematic',
      skyBrightness: 1,
      showStation: false,
      photoNames: false,
      previewNames: false,
      axes: {
        forward: [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)],
        up: [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)],
        right: [Math.sin(a), -Math.cos(a), 0],
      },
      fovY,
      detailSelection: { source, background, artworkId },
    };
  }
  async function capture(id, frame, width = 512) {
    const geometry = {
      ...frame.axes,
      fovY: frame.fovY,
      aspect: 1,
      pixelHeight: width,
      detailSelection: frame.detailSelection,
    };
    const key = 'photo-verify-' + id;
    try {
      await manager.prepare(key, geometry, true, 45000);
      const blob = await view.capture(frame, { width });
      const status = view.photoSkyStatus();
      const bitmap = await createImageBitmap(blob);
      const image = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = image.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      let lit = 0,
        top = 0,
        bottom = 0,
        peak = 0,
        sum = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const value = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
        peak = Math.max(peak, value);
        sum += value;
        if (value > 2) {
          lit++;
          if (i < pixels.length / 5) top++;
          if (i >= (4 * pixels.length) / 5) bottom++;
        }
      }
      const n = pixels.length / 4;
      const record = {
        requested: status.requested,
        ready: status.ready,
        failed: status.failed,
        limited: status.limited,
        complete: status.complete,
        coverage: status.opticalCoverage,
        fallback: status.fallback,
        sources: status.sources.map((s) => s.id),
        orders: [...new Set(manager.ready(key).map((t) => t.order))],
        lit,
        illuminated: lit / n,
        peak,
        mean: sum / n,
        top: (top * 5) / n,
        bottom: (bottom * 5) / n,
        ...nativeReference(manager.ready(key), pixels, image.width, frame),
      };
      report[id] = record;
      await onPhoto?.(id, blob, record);
      return record;
    } finally {
      manager.release(key);
    }
  }
  try {
    main.value = 'dss';
    main.dispatchEvent(new Event('change', { bubbles: true }));
    env.skyDetailControls.setFinderSelection('recent', { background: 'blank' });
    check(
      main.value === 'dss' && document.querySelector('#xtWebbBackground').value === 'blank',
      'Main and finder sources did not remain independent'
    );
    const wide = aim(91.8, 5, 65, 'dss');
    const broad = await capture('wideDss', wide);
    check(
      broad.sources.join() === 'dss-color' &&
        broad.orders.includes(0) &&
        broad.nativeCoverage === 1 &&
        broad.correlation > 0.5,
      'Wide DSS did not record a complete real field ' + JSON.stringify(broad)
    );
    check(
      !env.stars.visible && !env.milky.visible,
      'Main view still draws a synthetic sky over DSS'
    );
    const zoom = await capture('narrowDss', aim(91.8, 5, 0.16, 'dss'));
    check(
      Math.max(...zoom.orders) > Math.max(...broad.orders) &&
        zoom.nativeCoverage === 1 &&
        zoom.correlation > 0.5,
      'Narrow DSS did not resolve finer survey data ' + JSON.stringify(zoom)
    );
    const boundary = aim(80, -30, 38, 'panstarrs');
    check(
      panstarrsViewCoverage({ ...boundary.axes, aspect: 1, fovY: 38 }) === 'partial',
      'MOC misses boundary'
    );
    const edge = await capture('panstarrsBoundary', boundary);
    check(
      edge.coverage === 'partial' &&
        edge.sources.join() === 'panstarrs' &&
        edge.top > 0.03 &&
        edge.bottom < 0.03,
      'Pan-STARRS boundary or empty sky mismatch ' + JSON.stringify(edge)
    );
    const south = await capture('panstarrsSouth', aim(90, -72, 20, 'panstarrs'));
    check(
      south.ready === 0 && south.peak === 0 && south.fallback === 'outside-coverage',
      'Unexpected southern exposure'
    );
    const plate = await capture(
      'blankWideWebb',
      aim(159.21262, -58.62002, 23, 'recent', 'blank', 'jwst-carina-2022'),
      768
    );
    check(
      plate.sources.includes('jwst-carina-2022') && plate.lit > 0 && plate.illuminated < 0.002,
      'The WCS-size Webb footprint did not render on black ' + JSON.stringify(plate)
    );
    const hubble = await capture(
      'blankWideHubble',
      aim(274.719657, -13.839437, 23, 'hubble', 'blank', 'hubble-heic1501a'),
      768
    );
    check(
      hubble.sources.includes('hubble-heic1501a') && hubble.lit > 0 && hubble.illuminated < 0.002,
      'The selected Hubble footprint did not render on black ' + JSON.stringify(hubble)
    );
    const blank = await capture('blankEmpty', aim(82, -80, 0.14, 'recent', 'blank'));
    check(
      blank.peak === 0 && blank.ready === 0,
      'A synthetic source illuminates an empty artwork field'
    );
    if (setOffline) {
      await setOffline(true);
      check(navigator.onLine === false, 'Browser offline emulation failed');
      const warm = await capture('offlineCachedDss', wide);
      check(
        warm.sources.join() === 'dss-color' && warm.mean === broad.mean,
        'Cached wide DSS changed while offline ' + JSON.stringify(warm)
      );
      const coldFrame = aim(285, -54, 0.04, 'dss');
      const coldGeometry = {
        ...coldFrame.axes,
        fovY: coldFrame.fovY,
        aspect: 1,
        pixelHeight: 512,
        detailSelection: coldFrame.detailSelection,
      };
      manager.update('scope-reconnect-verify', coldGeometry, true);
      const cold = await capture('offlineUncachedDss', coldFrame);
      check(
        !cold.ready && cold.failed > 0 && cold.peak === 0,
        'An offline uncached field produced fake light ' + JSON.stringify(cold)
      );
      await setOffline(false);
      const recovered = await capture('reconnectedDss', coldFrame);
      check(
        recovered.ready > 0 && recovered.sources.join() === 'dss-color' && recovered.peak > 0,
        'The same field did not resume on reconnection ' + JSON.stringify(recovered)
      );
    }
    return report;
  } finally {
    if (setOffline) await setOffline(false);
    manager.release('scope-reconnect-verify');
    main.value = previous;
    main.dispatchEvent(new Event('change', { bubbles: true }));
    env.skyDetailControls.setFinderSelection(finder.source, finder);
    view.dispose();
    canvas.remove();
  }
}
