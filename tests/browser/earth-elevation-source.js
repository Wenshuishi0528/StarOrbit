import { ElevationSource } from '../../src/earth-elevation-source.js';

const assert = (condition, message) => {
  if (!condition) throw Error(message);
};
export async function checkElevationSamples(cases) {
  const source = new ElevationSource(),
    reports = [];
  try {
    for (const item of cases) {
      const { lon, lat, halfSpan = 0.02 } = item;
      await window.elevationPhase?.(item.id);
      const result = await source.tile({
        key: item.id,
        z: 12,
        x: 0,
        y: 0,
        bounds: [lon - halfSpan, lat - halfSpan, lon + halfSpan, lat + halfSpan],
      });
      assert(result.heights instanceof Float32Array, 'Height array did not transfer');
      assert(
        result.gridSize === 129 && result.heights.length === 129 * 129,
        'Incorrect grid shape'
      );
      assert(
        result.coverage === 1,
        `${item.id} land window has unexpected holes (${result.coverage}; ${result.warnings.join('; ')})`
      );
      const center = result.heights[64 * 129 + 64];
      if (Number.isFinite(item.height))
        assert(
          Math.abs(center - item.height) < 0.002,
          'DEM height disagrees with independent Rasterio transform/interpolation'
        );
      let min = Infinity,
        max = -Infinity;
      for (const v of result.heights) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      reports.push({
        id: item.id,
        center,
        min,
        max,
        coverage: result.coverage,
        sourceTiles: result.sourceTiles,
        bytes: result.heights.byteLength,
      });
    }
    // Missing ocean data must remain NaN; it is the base layer's job to provide sea level.
    await window.elevationPhase?.('ocean');
    const ocean = { key: 'ocean', z: 12, x: 0, y: 0, bounds: [0.1, -40.2, 0.2, -40.1] };
    const missing = await source.tile(ocean);
    assert(
      missing.coverage === 0 && missing.heights.every(Number.isNaN),
      'Missing ocean source fabricated heights'
    );
    assert(missing.missingSourceKeys.length === 1, 'Missing source key was not recorded');
    source.close();
    await window.elevationPhase?.('ocean-repeat');
    await source.tile(ocean);
    return { reports, ocean: { coverage: missing.coverage, missing: missing.missingSourceKeys } };
  } finally {
    source.close();
  }
}

export async function checkElevationCancellation() {
  const source = new ElevationSource();
  try {
    const controller = new AbortController();
    await window.armElevationRequest();
    const pending = source
      .tile(
        { key: 'cancel', z: 12, x: 0, y: 0, bounds: [116.16, 39.98, 116.2, 40.02] },
        controller.signal
      )
      .then(
        () => false,
        (e) => e.name === 'AbortError'
      );
    await window.waitElevationRequest();
    controller.abort();
    assert(await pending, 'In-flight terrain request did not cancel');
    assert(source.pending.size === 0, 'Cancelled request remained pending');
    await window.advanceElevationClock();
    assert(!source.worker && !source.workerUrl, 'Idle elevation worker/URL was not disposed');
    const result = await source.tile({
      key: 'restart',
      z: 12,
      x: 0,
      y: 0,
      bounds: [-122.3521, 47.5862, -122.3121, 47.6262],
    });
    assert(result.coverage === 1, 'Worker did not restart after cancellation');
    return { cancelled: true, idleDisposed: true, restarted: true };
  } finally {
    source.close();
  }
}
