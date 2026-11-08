import { GeoMoonState, JupiterMoons } from 'astronomy-engine';
import { AU } from './orbit.js';
import { SATELLITE_BY_ID } from './major-satellites.js';

// The extracted SPK records use TDB, not the library's extrapolated delta-T.
// NAIF naif0012.tls DELTET constants; UTC conversion is for the 2026–2030 pack,
// assuming the current TAI−UTC = 37 seconds until a new leap table is supplied.
export function satelliteET(time) {
  const base = time / 1000 - 946728000 + 69.184;
  let et = base;
  for (let i = 0; i < 3; i++) {
    const m = 6.239996 + 1.99096871e-7 * et;
    et = base + 0.001657 * Math.sin(m + 0.01671 * Math.sin(m));
  }
  return et;
}

// Returns geometric position in km relative to the SPK segment's center.
// Clenshaw evaluates the original type-2 polynomial without time resampling.
export function evaluateSatelliteSegment(segment, coefficients, et) {
  const record = Math.floor((et - segment.startET) / segment.intervalSeconds);
  if (record < 0 || record >= segment.count || !Number.isFinite(et)) return null;
  const tau = 2 * ((et - segment.startET) / segment.intervalSeconds - record) - 1;
  const n = segment.coefficientsPerAxis;
  const start = segment.offset + record * 3 * n;
  return [0, 1, 2].map((axis) => {
    const offset = start + axis * n;
    let b1 = 0,
      b2 = 0;
    for (let k = n - 1; k >= 1; k--) {
      const b0 = coefficients[offset + k] + 2 * tau * b1 - b2;
      b2 = b1;
      b1 = b0;
    }
    return (coefficients[offset] + tau * b1 - b2) * segment.quantumKm;
  });
}

export function decodeSatellitePack(manifest, buffer) {
  if (
    manifest?.schema !== 'starorbit-satellite-chebyshev-1' ||
    buffer.byteLength !== manifest.decodedBytes ||
    buffer.byteLength % 4
  )
    throw new Error('Invalid satellite ephemeris pack');
  const view = new DataView(buffer);
  const coefficients = new Int32Array(buffer.byteLength / 4);
  for (let i = 0; i < coefficients.length; i++) coefficients[i] = view.getInt32(i * 4, true);
  const segments = new Map();
  for (const segment of manifest.segments) {
    const end = segment.offset + segment.count * 3 * segment.coefficientsPerAxis;
    if (
      segment.frame !== 'J2000' ||
      !Number.isSafeInteger(end) ||
      end > coefficients.length ||
      segment.offset < 0 ||
      !(segment.intervalSeconds > 0)
    )
      throw new Error('Invalid satellite ephemeris segment');
    segments.set(segment.target, segment);
  }
  return { coefficients, segments };
}

// One immutable decoded pack is shared by successive solar-system visits.
const packs = new Map();
async function loadPack(asset) {
  const manifest = asset.manifest || asset;
  if (!asset.url) throw new Error('Satellite ephemeris asset missing');
  if (!packs.has(asset.url)) {
    const promise = (async () => {
      const response = await fetch(asset.url);
      if (!response.ok) throw new Error(`Satellite ephemeris HTTP ${response.status}`);
      const compressed = await response.blob();
      const buffer = await new Response(
        compressed.stream().pipeThrough(new DecompressionStream('gzip'))
      ).arrayBuffer();
      return decodeSatellitePack(manifest, buffer);
    })();
    packs.set(asset.url, promise);
    promise.catch(() => packs.delete(asset.url));
  }
  return packs.get(asset.url);
}

export function createSatelliteEphemeris(asset = {}) {
  const manifest = asset.manifest || asset;
  const start = Date.parse(manifest.startUTC),
    end = Date.parse(manifest.endUTCExclusive);
  let pack = null,
    status = 'idle',
    pending = null,
    jupiterTime = NaN,
    jupiterStates = null;
  function state(id, time) {
    if (!Number.isFinite(time)) return null;
    const body = SATELLITE_BY_ID.get(id);
    if (!body) return null;
    if (id === 'Moon') {
      const p = GeoMoonState(new Date(time));
      return { position: [p.x, p.y, p.z], source: 'Astronomy Engine' };
    }
    if (body.parent === 'Jupiter') {
      if (time !== jupiterTime) {
        jupiterStates = JupiterMoons(new Date(time));
        jupiterTime = time;
      }
      const p = jupiterStates[id.toLowerCase()];
      return { position: [p.x, p.y, p.z], source: 'Astronomy Engine · L1' };
    }
    if (!pack || time < start || time >= end) return null;
    const parentCode = Math.floor(body.code / 100) * 100 + 99;
    const satelliteSegment = pack.segments.get(body.code),
      parentSegment = pack.segments.get(parentCode);
    if (!satelliteSegment || !parentSegment || satelliteSegment.center !== parentSegment.center)
      return null;
    const et = satelliteET(time);
    const p = evaluateSatelliteSegment(satelliteSegment, pack.coefficients, et);
    const center = evaluateSatelliteSegment(parentSegment, pack.coefficients, et);
    if (!p || !center) return null;
    return {
      position: p.map((v, i) => (v - center[i]) / AU),
      source: 'JPL SPK',
      quantizationErrorBoundKm:
        satelliteSegment.quantizationErrorBoundKm + parentSegment.quantizationErrorBoundKm,
    };
  }
  return {
    get status() {
      return status;
    },
    start,
    end,
    state,
    async load() {
      if (pack) return true;
      if (!pending) {
        status = 'loading';
        pending = loadPack(asset)
          .then((value) => {
            pack = value;
            status = 'ready';
            return true;
          })
          .catch(() => {
            status = 'error';
            pending = null;
            return false;
          });
      }
      return pending;
    },
    availability(id, time) {
      const body = SATELLITE_BY_ID.get(id);
      if (!body) return 'unknown';
      if (id === 'Moon' || body.parent === 'Jupiter') return 'ready';
      if (time < start || time >= end) return 'out-of-range';
      return status;
    },
  };
}
