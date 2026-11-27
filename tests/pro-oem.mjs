import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  coversOem,
  OEM_MAX_BYTES,
  oemEpochs,
  parseOem,
  sampleOem,
  writeOem,
} from '../src/pro/oem.js';

const epochText = '2026-11-23T00:00:00.000Z';
const epoch = Date.parse(epochText);
const ms = (seconds) => epoch + seconds * 1000;
const date = (seconds) => new Date(ms(seconds)).toISOString();
const header = [
  'CCSDS_OEM_VERS = 2.0',
  'COMMENT Analytic test ephemeris',
  'CREATION_DATE = ' + epochText,
  'ORIGINATOR = STARORBIT-TEST',
].join('\n');

// The oracle evaluates explicit power series and analytic derivatives independently
// of the reader's divided differences. The argument u=t/100 keeps units visible.
const coefficientSets = [
  [7000, 13, -7, 3.6, -0.89, 0.43, 0.23, -0.112],
  [42, 758, 0.2, -1.7, 1.138, 0.81, -0.19, 0.06],
  [-32, -4, 3.9, 0.72, 0.016, -0.27, 0.24, 0.107],
];
function polynomialState(t, degree, withAcceleration = false) {
  const result = [];
  for (let d = 0; d <= (withAcceleration ? 2 : 1); d++) {
    for (const coeffs of coefficientSets) {
      let sum = 0;
      for (let k = d; k <= degree; k++) {
        const multiplier = d === 2 ? k * (k - 1) : d === 1 ? k : 1;
        sum += (coeffs[k] * multiplier * (t / 100) ** (k - d)) / 100 ** d;
      }
      result.push(sum);
    }
  }
  return result;
}
const cubic = (t) => polynomialState(t, 3);
function vectorClose(actual, expected, tolerance = 1e-8) {
  assert.equal(actual?.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= tolerance,
      'component ' +
        i +
        ': actual ' +
        actual[i] +
        ', expected ' +
        expected[i] +
        ', tolerance ' +
        tolerance
    );
  }
}
function segment(
  times,
  {
    state = cubic,
    method,
    degree,
    start = times[0],
    stop = times.at(-1),
    usableStart,
    usableStop,
    name = 'ANALYSIS SAT',
    id = 'UNKNOWN',
  } = {}
) {
  const lines = [
    'META_START',
    'OBJECT_NAME = ' + name,
    'OBJECT_ID = ' + id,
    'CENTER_NAME = EARTH',
    'REF_FRAME = EME2000',
    'TIME_SYSTEM = UTC',
    'START_TIME = ' + date(start),
    'STOP_TIME = ' + date(stop),
  ];
  if (usableStart !== undefined) lines.push('USEABLE_START_TIME = ' + date(usableStart));
  if (usableStop !== undefined) lines.push('USEABLE_STOP_TIME = ' + date(usableStop));
  if (method !== undefined) lines.push('INTERPOLATION = ' + method);
  if (degree !== undefined) lines.push('INTERPOLATION_DEGREE = ' + degree);
  lines.push('META_STOP');
  for (const t of times) lines.push(date(t) + ' ' + state(t).join(' '));
  return lines.join('\n');
}
const message = (...segments) => [header, ...segments].join('\n') + '\n';
function rejects(file, reason) {
  assert.throws(
    () => parseOem(file),
    (error) => error.message === 'oemInvalid' && error.line > 0 && reason.test(error.detail)
  );
}
const mandatory = message(segment([0, 60], { method: 'HERMITE', degree: 3 }));
const two = parseOem('\uFEFF' + mandatory.replaceAll('\n', '\r\n'));
assert.equal(two.originator, 'STARORBIT-TEST');
assert.equal(two.rowCount, 2);
assert.equal(two.frame, 'EME2000');
assert.equal(two.timeSystem, 'UTC');
for (const t of [0, 0.001, 12.34, 30.125, 59.99, 60]) vectorClose(sampleOem(two, ms(t)), cubic(t));
const first = sampleOem(two, ms(0));
first[0] = 12345;
assert.equal(sampleOem(two, ms(0))[0], 7000);
assert.equal(coversOem(two, ms(0), ms(60)), true);
assert.equal(coversOem(two, ms(60), ms(60)), true);
assert.equal(coversOem(two, ms(60), ms(0)), false);
for (const t of [ms(-0.001), ms(60.001), NaN]) assert.equal(sampleOem(two, t), null);
assert.equal(coversOem(two, ms(0), ms(61)), false);
const one = parseOem(message(segment([0])));
assert.deepEqual(sampleOem(one, ms(0)), cubic(0));
assert.equal(coversOem(one, ms(-1), ms(1)), false);

const highOrder = parseOem(
  message(segment([0, 22, 43, 67, 90, 115], { state: (t) => polynomialState(t, 7) }))
);
assert.equal(highOrder.segments[0].interpolation, 'HERMITE');
assert.equal(highOrder.segments[0].degree, 7);
for (const t of [1.5, 23.5, 47.125, 72.25, 113.5])
  vectorClose(sampleOem(highOrder, ms(t)), polynomialState(t, 7));
const pva = parseOem(
  message(
    segment([0, 90], { state: (t) => polynomialState(t, 5, true), method: 'HERMITE', degree: 5 })
  )
);
for (const t of [8.25, 47.125, 71.375]) vectorClose(sampleOem(pva, ms(t)), polynomialState(t, 5));
function independentChannels(t) {
  const [x, y, z] = polynomialState(t, 7);
  return [x, y, z, 3 - y / 34.3, 0.2 * x + 1, 1 - z];
}
const lagrange = parseOem(
  message(
    segment([0, 9, 21, 33, 54, 62, 87, 94, 107], {
      state: independentChannels,
      method: 'LAGRANGE',
      degree: 7,
    })
  )
);
for (const t of [4.375, 44.5, 98.75])
  vectorClose(sampleOem(lagrange, ms(t)), independentChannels(t));
const straight = parseOem(message(segment([0, 60], { method: 'LINEAR', degree: 1 })));
vectorClose(
  sampleOem(straight, ms(30)),
  cubic(0).map((v, i) => (v + cubic(60)[i]) / 2)
);

// The two blocks have padding and a velocity jump. The right segment owns the
// shared useable instant, even if only the left segment reports a knot there.
const after = (t) => cubic(t).map((v, i) => (i === 3 ? v + 0.12 : v));
const touchingText = message(
  segment([0, 30, 50, 60], { usableStop: 50 }),
  segment([45, 55, 65, 75], { usableStart: 50, state: after, method: 'LINEAR', degree: 1 })
);
const touching = parseOem(touchingText);
assert.equal(coversOem(touching, ms(5), ms(74)), true);
vectorClose(sampleOem(touching, ms(49.875)), cubic(49.875));
vectorClose(
  sampleOem(touching, ms(50)),
  after(45).map((v, i) => (v + after(55)[i]) / 2)
);
assert.deepEqual(
  [...oemEpochs(touching)].map((t) => (t - epoch) / 1000),
  [0, 30, 55, 65, 75]
);
const touchingKnots = parseOem(message(segment([0, 50]), segment([50, 75])));
assert.deepEqual([...oemEpochs(touchingKnots, ms(50), ms(55))], [ms(50)]);
const gappedText = touchingText.replace(
  'USEABLE_STOP_TIME = ' + date(50),
  'USEABLE_STOP_TIME = ' + date(40)
);
const gapped = parseOem(gappedText);
assert.equal(sampleOem(gapped, ms(45)), null);
assert.equal(coversOem(gapped, ms(40), ms(50)), false);
assert.equal(coversOem(gapped, ms(50), ms(74)), true);
assert.equal(coversOem(gapped, ms(3), ms(40)), true);
const paddedDeclaration = parseOem(message(segment([5, 60], { start: 0, stop: 90 })));
assert.equal(paddedDeclaration.startMs, ms(5));
assert.equal(paddedDeclaration.stopMs, ms(60));
assert.equal(sampleOem(paddedDeclaration, ms(62)), null);

const covariance = [
  'COVARIANCE_START',
  'EPOCH = ' + date(0),
  'COV_REF_FRAME = RTN',
  '1',
  '0 1',
  '0 0 1',
  '0 0 0 1',
  '0 0 0 0 1',
  '0 0 0 0 0 1',
  'COVARIANCE_STOP',
].join('\n');
assert.equal(parseOem(mandatory + covariance).covarianceCount, 1);
rejects(mandatory + covariance.replace('0 0 1\n', '0 1\n'), /covariance row/);
rejects(mandatory + covariance.replace(date(0), date(99)), /Covariance epoch outside/);
rejects(mandatory + covariance.replace('COVARIANCE_STOP', ''), /unterminated/);
rejects(mandatory.replace('CCSDS_OEM_VERS = 2.0', 'CCSDS_OEM_VERS = 1.0'), /VERS/);
rejects(mandatory.replace('CENTER_NAME = EARTH', 'CENTER_NAME = MARS'), /CENTER_NAME/);
rejects(mandatory.replace('REF_FRAME = EME2000', 'REF_FRAME = ITRF2014'), /REF_FRAME/);
rejects(mandatory.replace('TIME_SYSTEM = UTC', 'TIME_SYSTEM = TAI'), /TIME_SYSTEM/);
rejects(mandatory.replace('ORIGINATOR = STARORBIT-TEST\n', ''), /Missing ORIGINATOR/);
rejects(
  mandatory.replace('OBJECT_NAME = ANALYSIS SAT', 'OBJECT_NAME = A\nOBJECT_NAME = B'),
  /Duplicate OBJECT_NAME/
);
rejects(mandatory.replaceAll('2026-11-23', '2026-02-29'), /Invalid UTC/);
rejects(mandatory.replace('00:00:00.000Z', '23:59:60Z'), /leap-second/);
const crossing = mandatory
  .replaceAll(date(0), '2016-12-31T23:59:00Z')
  .replaceAll(date(60), '2017-01-01T00:00:00Z');
rejects(crossing, /spans a UTC leap second/);
assert.equal(parseOem(mandatory.replaceAll('2026-11-23', '2026-327')).startMs, epoch);
rejects(mandatory.replace(' 7000 ', ' NaN '), /numeric/);
rejects(mandatory.replace(' 7000 ', ' 0xABC '), /numeric/);
rejects(mandatory.replace(' 7000 ', ' 1E309 '), /numeric/);
rejects(mandatory.replaceAll(date(60), date(0)), /increase/);
rejects(mandatory.replace('INTERPOLATION_DEGREE = 3', 'INTERPOLATION_DEGREE = 7'), /Too few/);
rejects(
  mandatory.replace('INTERPOLATION = HERMITE', 'INTERPOLATION = CHEBYSHEV'),
  /Unsupported INTERPOLATION/
);
rejects(mandatory.replace('INTERPOLATION = HERMITE\n', ''), /both INTERPOLATION/);
rejects(message(segment([0, 30, 60], { method: 'HERMITE', degree: 4 })), /requires complete/);
rejects(message(segment([0, 30]), segment([30, 60], { id: 'DIFFERENT' })), /one object/);
rejects(message(segment([0, 30]), segment([20, 60])), /Overlapping/);
rejects(mandatory.trimEnd() + ' 0 0 0', /consistent columns/);
assert.throws(
  () => parseOem(' '.repeat(OEM_MAX_BYTES + 1)),
  (err) => err.message === 'oemInvalid' && /8 MiB/.test(err.detail)
);

function result(duration, mode = 'elements', sourceText, name = 'STUDY') {
  const h = 5;
  return {
    frame: 'EME2000',
    timeSystem: 'UTC',
    stepSeconds: h,
    durationSec: duration,
    mission: {
      epochUtc: epochText,
      spacecraft: { name },
      trajectory: { mode, oemText: sourceText },
    },
    trajectoryInfo: { objectName: 'KJZ', objectId: 'CSS' },
    orbit: Array.from({ length: duration / h + 1 }, (_, i) => cubic(i * h)),
  };
}
const simulated = writeOem(result(65));
const output = parseOem(simulated);
assert.equal(output.version, '3.0');
assert.equal(output.originator, 'STARORBIT');
assert.equal(output.objectId, 'UNKNOWN');
assert.equal(output.objectName, 'STUDY');
assert.equal(Number.isFinite(output.createdMs), true);
assert.deepEqual([...oemEpochs(output)], [ms(0), ms(60), ms(65)]);
assert.match(simulated, /Simulated trajectory propagated from mission orbital elements/);
const partialSteps = parseOem(writeOem(result(65), 7));
for (const t of [0, 7, 14, 29, 38, 60, 64.875, 65])
  vectorClose(sampleOem(partialSteps, ms(t)), cubic(t));
assert.equal(partialSteps.rowCount, 11);
const utf8 = writeOem(result(65, 'elements', null, '星轨分析卫星'.repeat(12)));
assert.equal(parseOem(utf8).objectName, 'UNKNOWN');
assert.match(utf8, /COMMENT Local name \(percent-encoded\): %E6/);
assert.ok(utf8.split('\n').every((s) => s.length <= 254 && /^[\x20-\x7E]*$/.test(s)));
assert.doesNotThrow(() => writeOem(result(65, 'elements', null, '\uD800')));
for (const bad of [0, -1, Infinity, NaN, 0.5])
  assert.throws(() => writeOem(result(65), bad), /oemInvalid/);
const seeded = writeOem(result(65, 'oemInitial'));
assert.match(seeded, /Simulated trajectory propagated from a supplied OEM state/);
assert.equal(parseOem(seeded).objectId, 'CSS');
assert.equal(parseOem(seeded).objectName, 'KJZ');
const replayResult = result(75, 'oemReplay', touchingText);
replayResult.trajectoryInfo = { objectName: 'ANALYSIS SAT', objectId: 'UNKNOWN' };
const replay = writeOem(replayResult, 11);
assert.match(replay, /Resampled supplied ephemeris/);
const reread = parseOem(replay);
assert.equal(reread.segments.length, 2);
assert.equal(reread.segments[0].rows.at(-1)[0], ms(50));
assert.equal(reread.segments[1].rows[0][0], ms(50));
vectorClose(reread.segments[0].rows.at(-1).slice(1), cubic(50));
vectorClose(sampleOem(reread, ms(50)), sampleOem(touching, ms(50)));
for (const t of oemEpochs(reread)) vectorClose(sampleOem(reread, t), sampleOem(touching, t));
assert.throws(
  () => writeOem(result(75, 'oemReplay', gappedText)),
  (err) => /continuously cover/.test(err.detail)
);

// Within a second of the Unix origin, a double millisecond timestamp can retain
// sub-nanosecond fractions. Rounding the OEM textual representation can carry.
const nearUnix = message(segment([0, 1]), segment([1, 65]))
  .replaceAll('2026-11-23', '1970-01-01')
  .replaceAll('T00:00:01.000Z', 'T00:00:00.9999999998Z');
const nearUnixResult = result(65, 'oemReplay', nearUnix);
nearUnixResult.mission.epochUtc = '1970-01-01T00:00:00Z';
assert.equal(parseOem(writeOem(nearUnixResult)).segments[0].stopMs, 1000);

// Independent observations within the repository's archived agency product:
// discard every other original vector before interpolation, then compute the
// 3-D errors only at those withheld epochs. This tests interpolation, not the
// derivation or measurement accuracy of the agency orbit itself.
const html = readFileSync(new URL('../assets/official-orbit-source.html', import.meta.url), 'utf8');
const originalLines = [...html.matchAll(/<div>([^<>]*)<\/div>/gi)]
  .map((m) => m[1].replace(/&nbsp;/g, ' ').trim())
  .filter(
    (s) =>
      s === 'META_START' ||
      s === 'META_STOP' ||
      /^(?:CCSDS_OEM_VERS|CREATION_DATE|ORIGINATOR|OBJECT_NAME|OBJECT_ID|CENTER_NAME|REF_FRAME|TIME_SYSTEM|START_TIME|STOP_TIME)\s*=|^COMMENT |^20\d\d-\d\d-\d\dT/.test(
        s
      )
  );
const archive = parseOem(originalLines.join('\n'));
assert.equal(archive.objectName, 'KJZ');
assert.equal(archive.objectId, 'CSS');
assert.equal(archive.originator, 'BACC');
assert.equal(archive.startMs, Date.parse('2026-10-19T00:00:00Z'));
assert.equal(archive.stopMs, Date.parse('2026-10-26T00:00:00Z'));
assert.equal([...oemEpochs(archive)].length, 2521);
const microsecondKnot = archive.segments[0].rows[3][0];
assert.ok(Math.abs(Date.parse('2026-10-19T00:12:00Z') - microsecondKnot - 0.001) < 0.00013);
let nativeIndex = 0;
const reduced = parseOem(
  originalLines.filter((s) => !/^20\d\d-\d\d-\d\dT/.test(s) || nativeIndex++ % 2 === 0).join('\n')
);
let sum = 0,
  peakPosition = 0,
  peakVelocity = 0,
  holdouts = 0;
for (let i = 1; i < archive.rowCount; i += 2) {
  const [t, ...truth] = archive.segments[0].rows[i];
  const estimate = sampleOem(reduced, t);
  const errors = truth.map((v, j) => (v - estimate[j]) * 1000);
  const position = Math.hypot(...errors.slice(0, 3)),
    velocity = Math.hypot(...errors.slice(3));
  sum += position ** 2;
  peakPosition = Math.max(peakPosition, position);
  peakVelocity = Math.max(peakVelocity, velocity);
  holdouts++;
}
const rmsPosition = Math.sqrt(sum / holdouts);
assert.equal(holdouts, 1260);
assert.ok(rmsPosition < 0.8 && peakPosition < 2.6 && peakVelocity < 0.01);
console.log(
  'OEM round trip, interpolation, discontinuities, UTC, bounds and malformed-input checks passed.'
);
console.log(
  JSON.stringify({
    source: 'Archived BACC OEM',
    originalRows: archive.rowCount,
    holdouts,
    retainedCadence_s: 480,
    positionRms_m: rmsPosition,
    positionPeak_m: peakPosition,
    velocityPeak_mps: peakVelocity,
  })
);
