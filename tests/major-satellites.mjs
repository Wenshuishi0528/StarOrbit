import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { JupiterMoons, RotationAxis } from 'astronomy-engine';
import { AU } from '../src/orbit.js';
import { MAJOR_SATELLITES, EXTRA_SATELLITES, SATELLITE_BY_ID } from '../src/major-satellites.js';
import { createSatelliteEphemeris, decodeSatellitePack, evaluateSatelliteSegment, satelliteET } from '../src/satellite-ephemeris.js';
import { solarWorldState, solarWorldOrbit, solarWorldDisplayRadius } from '../src/solar-world-math.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../assets/satellites/manifest.json', import.meta.url)));
const compressed = fs.readFileSync(new URL(`../assets/satellites/${manifest.file}`, import.meta.url));
const decoded = gunzipSync(compressed);
const buffer = decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength);
const pack = decodeSatellitePack(manifest, buffer);
const norm = (v) => Math.hypot(...v), sub = (a, b) => a.map((v, i) => v - b[i]);
const evaluate = (code, et) => evaluateSatelliteSegment(pack.segments.get(code), pack.coefficients, et);
assert.equal(compressed.length, manifest.bytes);
assert.equal(crypto.createHash('sha256').update(compressed).digest('hex'), manifest.sha256);
assert(compressed.length < 3 * 1024 * 1024, 'Satellite asset stays under 3 MiB');
assert.equal(MAJOR_SATELLITES.length, 20);
assert.equal(EXTRA_SATELLITES.length, 19);
assert.equal(new Set(MAJOR_SATELLITES.map((b) => b.id)).size, 20);

let referenceChecks = 0, maxQuantizationErrorKm = 0;
for (const segment of manifest.segments) {
  assert(segment.quantizationErrorBoundKm < 0.09);
  for (const reference of segment.tests) {
    const error = norm(sub(evaluate(segment.target, reference.et), reference.positionKm));
    assert(error <= segment.quantizationErrorBoundKm + 1e-6, `${segment.target} original SPK polynomial: ${error}`);
    maxQuantizationErrorKm = Math.max(maxQuantizationErrorKm, error);
    referenceChecks++;
  }
  for (const index of [1, Math.floor(segment.count / 3), segment.count - 1]) {
    const et = segment.startET + index * segment.intervalSeconds;
    const jump = norm(sub(evaluate(segment.target, et - 1e-5), evaluate(segment.target, et + 1e-5)));
    assert(jump < 2 * segment.quantizationErrorBoundKm + 0.003, `${segment.target} record boundary continuity: ${jump}`);
  }
  assert.equal(evaluate(segment.target, segment.startET - 1), null);
  assert.equal(evaluate(segment.target, segment.startET + segment.count * segment.intervalSeconds), null);
}
assert.throws(() => decodeSatellitePack(manifest, new ArrayBuffer(4)), /Invalid/);

const asset = { ...manifest, url: `data:application/gzip;base64,${compressed.toString('base64')}` };
const ephemeris = createSatelliteEphemeris(asset);
const time = Date.UTC(2026, 10, 9);
assert.equal(ephemeris.status, 'idle');
assert.equal(ephemeris.state('Phobos', time), null, 'Unloaded data never produces a placeholder orbit');
assert.equal(ephemeris.availability('Phobos', ephemeris.end), 'out-of-range');
assert(ephemeris.state('Europa', time), 'Built-in Galilean moons do not wait for SPK download');
const promise = ephemeris.load();
assert.equal(ephemeris.status, 'loading');
assert(await promise);
assert.equal(ephemeris.status, 'ready');
assert(await ephemeris.load());
assert.equal(ephemeris.state('Phobos', ephemeris.start - 1), null);
assert.equal(ephemeris.state('Phobos', ephemeris.end), null);
assert(ephemeris.state('Phobos', ephemeris.start));
assert(ephemeris.state('Phobos', ephemeris.end - 1));
assert.equal(ephemeris.state('Phobos', NaN), null);
assert.equal(ephemeris.state('NoSuchMoon', time), null);
assert(Math.abs(satelliteET(time) - (time / 1000 - 946728000 + 69.184)) < 0.002, 'UTC uses the leap-second table, not extrapolated delta-T');

const heliocentric = new Map(solarWorldState(time, ephemeris).map((body) => [body.id, body]));
assert.equal(heliocentric.size, 29, 'Sun, 8 planets, and 20 moons');
for (const body of EXTRA_SATELLITES) {
  const state = ephemeris.state(body.id, time);
  assert(state, body.id);
  const km = norm(state.position) * AU;
  assert(km > body.orbitRadiusKm * 0.9 && km < body.orbitRadiusKm * 1.1, `${body.id} km/AU scale and parent center`);
  assert(norm(sub(sub(heliocentric.get(body.id).position, heliocentric.get(body.parent).position), state.position)) < 1e-13);
  assert.equal(solarWorldDisplayRadius(body, 5, false), body.radiusKm / AU);
  assert(solarWorldDisplayRadius(body, 5, true) <= body.orbitRadiusKm / AU * 0.081, 'Enhanced satellites do not engulf their parent orbit');
  const orbit = solarWorldOrbit(body.id, time, 32, ephemeris);
  assert.equal(orbit.length, 33);
  assert(orbit.every((p) => norm(p) * AU > body.orbitRadiusKm * 0.9));
  if (body.parent === 'Jupiter') {
    const source = JupiterMoons(new Date(time))[body.id.toLowerCase()];
    assert.deepEqual(state.position, [source.x, source.y, source.z]);
  } else {
    const parentCode = Math.floor(body.code / 100) * 100 + 99;
    const expected = sub(evaluate(body.code, satelliteET(time)), evaluate(parentCode, satelliteET(time)));
    assert(norm(sub(state.position.map((v) => v * AU), expected)) < 1e-8, 'System barycenter must be subtracted');
  }
}
for (const edge of [ephemeris.start, ephemeris.end - 1]) assert.equal(solarWorldOrbit('Iapetus', edge, 32, ephemeris).length, 33);
assert.deepEqual(solarWorldOrbit('Iapetus', ephemeris.end, 32, ephemeris), []);

const horizons = JSON.parse(fs.readFileSync(new URL('./fixtures/satellite-horizons.json', import.meta.url)));
let maxHorizonsErrorKm = 0;
for (const reference of horizons) {
  // Invert the UTC→TDB conversion so this checks the whole public provider.
  let utc = (reference.et + 946728000 - 69.184) * 1000;
  for (let i = 0; i < 3; i++) utc += (reference.et - satelliteET(utc)) * 1000;
  const state = ephemeris.state(reference.id, utc);
  const error = norm(sub(state.position.map((v) => v * AU), reference.positionKm));
  assert(error < 0.2, `${reference.id} independent Horizons reference: ${error} km`);
  maxHorizonsErrorKm = Math.max(maxHorizonsErrorKm, error);
}
const triton = ephemeris.state('Triton', time).position;
const motion = sub(ephemeris.state('Triton', time + 60000).position, ephemeris.state('Triton', time - 60000).position);
const momentum = [triton[1] * motion[2] - triton[2] * motion[1], triton[2] * motion[0] - triton[0] * motion[2], triton[0] * motion[1] - triton[1] * motion[0]];
const pole = RotationAxis('Neptune', new Date(time)).north;
assert(momentum[0] * pole.x + momentum[1] * pole.y + momentum[2] * pole.z < 0, 'Triton orbit is retrograde relative to Neptune north');

const cached = createSatelliteEphemeris(asset);
assert(await cached.load());
assert.deepEqual(cached.state('Phobos', time), ephemeris.state('Phobos', time));
const failed = createSatelliteEphemeris({ ...manifest, url: 'data:application/gzip;base64,YmFk' });
assert.equal(await failed.load(), false);
assert.equal(failed.status, 'error');
assert.equal(failed.state('Phobos', time), null);
assert(failed.state('Io', time));
console.log(`major-satellites: 20 moons; ${referenceChecks} source-polynomial checks; max quantization sample ${(maxQuantizationErrorKm * 1000).toFixed(1)} m; Horizons ${(maxHorizonsErrorKm * 1000).toFixed(1)} m; loading, boundaries, centers, retrograde motion, physical scale passed`);
