import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import { writeArrayBuffer } from 'geotiff';
import { resolveObjectURL } from 'node:buffer';
import { ElevationSource } from '../src/earth-elevation-source.js';

const bundled = await build({
  entryPoints: ['src/earth-elevation-worker.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  write: false,
});
const plane = (lon, lat) => 100 + 40 * (lon - 115) + 80 * (41 - lat);
function fixture({ fault, point = true, areaEdges = false, height = plane } = {}) {
  let calls = 0,
    cancelled = 0,
    id = 0;
  const pending = new Map(),
    files = new Map();
  const scope = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    DOMException,
    Response,
    Headers,
    ReadableStream,
    TextEncoder,
    TextDecoder,
    ArrayBuffer,
    DataView,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    Blob,
  };
  scope.fetch = async (url, options) => {
    calls++;
    options.signal?.throwIfAborted();
    if (fault === 'missing') return new Response('', { status: 404 });
    if (fault === 'permission') return new Response('', { status: 403 });
    if (fault === 'network' && calls === 1) throw TypeError('fixture disconnect');
    if (fault === 'server' && calls === 1) return new Response('', { status: 503 });
    if (fault === 'whole' || fault === 'range')
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(1));
          },
          cancel() {
            cancelled++;
          },
        }),
        {
          status: fault === 'whole' ? 200 : 206,
          headers: { 'content-range': 'bytes 0-399999999/400000000' },
        }
      );
    if (!files.has(url)) {
      const match = /_(N|S)(\d+)_00_(E|W)(\d+)_00_DEM\.tif$/.exec(url);
      assert(match, 'Only the known OpenTopography tile naming convention is requested');
      const lat = Number(match[2]) * (match[1] === 'S' ? -1 : 1),
        lon = Number(match[4]) * (match[3] === 'W' ? -1 : 1),
        step = 1 / 16,
        size = areaEdges ? 16 : 17;
      const values = Float32Array.from({ length: size * size }, (_, i) =>
        height(
          lon + ((i % size) + (areaEdges ? 0.5 : 0)) * step,
          lat + 1 - (Math.floor(i / size) + (areaEdges ? 0.5 : 0)) * step
        )
      );
      files.set(
        url,
        new Uint8Array(
          writeArrayBuffer(values, {
            width: size,
            height: size,
            ModelPixelScale: [step, step, 0],
            ModelTiepoint: [
              0,
              0,
              0,
              lon - (point || areaEdges ? 0 : step / 2),
              lat + 1 + (point || areaEdges ? 0 : step / 2),
              0,
            ],
            GeographicTypeGeoKey: 4326,
            GTModelTypeGeoKey: 2,
            GTRasterTypeGeoKey: point && !areaEdges ? 2 : 1,
            GDAL_NODATA: '-32767',
          })
        )
      );
    }
    const bytes = files.get(url),
      [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range),
      start = Number(a),
      end = Math.min(Number(b), bytes.length - 1);
    const short =
      (fault === 'short' && calls === 1) ||
      (fault === 'exhausted' && calls <= 3) ||
      fault === 'cancel';
    return new Response(bytes.slice(start, short ? end : end + 1), {
      status: 206,
      headers: {
        'content-range': `bytes ${start}-${end}/${bytes.length}`,
        'content-length': String(end - start + 1),
      },
    });
  };
  scope.self = {
    postMessage: (data, transfer) => {
      const result = structuredClone(data, { transfer });
      pending.get(data.id)?.(result);
      pending.delete(data.id);
    },
  };
  vm.runInNewContext(bundled.outputFiles[0].text, scope);
  return {
    get calls() {
      return calls;
    },
    get cancelled() {
      return cancelled;
    },
    request(bounds, z = 12) {
      const job = ++id;
      return new Promise((resolve) => {
        pending.set(job, resolve);
        scope.self.onmessage({
          data: { id: job, tile: { key: `test-${job}`, z, x: 0, y: 0, bounds } },
        });
      });
    },
    cancel() {
      scope.self.onmessage({ data: { id, action: 'cancel' } });
    },
  };
}
function checkPlane(result, bounds) {
  assert(!result.error, result.error);
  assert(result.result.heights instanceof Float32Array);
  assert.equal(result.result.gridSize, 129);
  assert.equal(result.result.heights.length, 129 * 129);
  assert.equal(result.result.coverage, 1);
  const [w, s, e, n] = bounds;
  for (const [x, y] of [
    [0, 0],
    [128, 0],
    [0, 128],
    [128, 128],
    [64, 64],
    [48, 27],
  ])
    assert(
      Math.abs(
        result.result.heights[y * 129 + x] - plane(w + ((e - w) * x) / 128, n - ((n - s) * y) / 128)
      ) < 1e-4,
      'World coordinates must map to correct node heights'
    );
}
const bounds = [116.25, 39.25, 116.75, 39.75];
for (const point of [true, false]) checkPlane(await fixture({ point }).request(bounds), bounds);
const seam = [115.75, 39.75, 116.25, 40.25],
  cross = fixture();
checkPlane(await cross.request(seam), seam);
assert.equal(cross.calls, 4, 'Four source cells share a seamless analytic surface');
const coarse = (await fixture({ areaEdges: true }).request(seam)).result;
assert.equal(coarse.coverage, 1, 'Touching raster pixel footprints must not leave missing seams');
for (let y = 0; y < 129; y++)
  for (let x = 0; x < 129; x++) {
    const expected = plane(seam[0] + (0.5 * x) / 128, seam[3] - (0.5 * y) / 128);
    assert(
      Math.abs(coarse.heights[y * 129 + x] - expected) <= 3.75,
      'An edge sample may clamp by at most half a source pixel'
    );
  }
for (const fault of ['short', 'network', 'server']) {
  const source = fixture({ fault });
  checkPlane(await source.request(bounds), bounds);
  assert.equal(source.calls, 2);
}
const retry = fixture({ fault: 'exhausted' });
assert.match((await retry.request(bounds)).error, /收到/);
assert.equal(retry.calls, 3);
checkPlane(await retry.request(bounds), bounds);
assert.equal(retry.calls, 4);
for (const fault of ['whole', 'range', 'permission']) {
  const source = fixture({ fault });
  assert((await source.request(bounds)).error);
  assert.equal(source.calls, 1);
  if (fault !== 'permission') assert.equal(source.cancelled, 1);
}
const ocean = fixture({ fault: 'missing' });
const missing = await ocean.request(bounds);
assert.equal(missing.result.coverage, 0);
assert(missing.result.heights.every(Number.isNaN));
await ocean.request(bounds);
assert.equal(ocean.calls, 1, 'Missing source must not be fetched every frame');
const broad = fixture();
assert((await broad.request([-180, -90, 180, 90], 0)).result.limited);
assert.equal(broad.calls, 0);
assert((await broad.request(bounds, 13)).error);
assert.equal(broad.calls, 0);
for (const height of [() => -430, () => 0]) {
  const r = (await fixture({ height }).request(bounds)).result;
  assert.equal(r.coverage, 1);
  assert(r.heights.every((v) => v === height()));
}
const invalid = fixture({
  height: (lon, lat) =>
    Math.abs(lon - 116.5) < 0.001 && Math.abs(lat - 39.5) < 0.001 ? 10000 : plane(lon, lat),
});
const hole = (await invalid.request(bounds)).result;
assert(Number.isNaN(hole.heights[64 * 129 + 64]));
assert(hole.coverage > 0 && hole.coverage < 1);
const aborted = fixture({ fault: 'cancel' }),
  waiting = aborted.request(bounds);
await new Promise((r) => setTimeout(r, 10));
aborted.cancel();
assert((await waiting).error);
await new Promise((r) => setTimeout(r, 350));
assert.equal(aborted.calls, 1, 'Abort must cancel retry backoff');

// Main-thread limits, cancellation, missing-key retention and URL cleanup.
const oldWorker = globalThis.Worker;
globalThis.__ELEVATION_WORKER__ = '';
class FakeWorker {
  constructor(url) {
    this.url = url;
    this.messages = [];
  }
  postMessage(data) {
    this.messages.push(data);
  }
  terminate() {
    this.terminated = true;
  }
  respond(id, result) {
    this.onmessage({ data: { id, result } });
  }
}
globalThis.Worker = FakeWorker;
const source = new ElevationSource();
try {
  const controller = new AbortController(),
    a = source.tile({ key: 'a' }, controller.signal).catch((e) => e),
    b = source.tile({ key: 'b' });
  await assert.rejects(source.tile({ key: 'c' }), /两个/);
  assert.equal(source.pending.size, 2);
  controller.abort();
  assert.equal((await a).name, 'AbortError');
  assert.equal(source.pending.size, 1);
  const worker = source.worker,
    url = source.workerUrl;
  worker.respond(2, {
    heights: new Float32Array(129 * 129),
    missingSourceKeys: ['N39_00_E116_00'],
  });
  await b;
  source.close();
  assert(worker.terminated);
  assert.equal(resolveObjectURL(url), undefined);
  const c = source.tile({ key: 'c' });
  assert.deepEqual(source.worker.messages[0].knownMissing, ['N39_00_E116_00']);
  source.worker.respond(3, { heights: new Float32Array(129 * 129) });
  await c;
} finally {
  source.close();
  globalThis.Worker = oldWorker;
  delete globalThis.__ELEVATION_WORKER__;
}
console.log(
  'Elevation source: point/area grids, cross-cell seams, nodata/fallback, bounded retries, cancellation and lifecycle passed'
);
