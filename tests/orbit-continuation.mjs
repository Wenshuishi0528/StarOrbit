import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { constants, gstime } from 'satellite.js';
import { createOrbitContinuation } from '../src/orbit-continuation.js';
import { earthAxes, temeToJ2000, temeToJ2000State, j2000ToTEMEState } from '../src/earth-frame.js';
import { interpolate } from '../src/orbit.js';
import { parseOfficialOrbit } from '../src/data-sources.js';

const DAY = 86400000,
  TAU = 2 * Math.PI,
  DEG = 180 / Math.PI;
const norm = (a) => Math.hypot(...a),
  dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
  cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  difference = (a, b) => norm(a.map((x, i) => x - b[i])),
  wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)),
  read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const station = read('../assets/orbit.json'),
  dfh = read('../assets/spacecraft/dfh1-orbit.json');

// Frozen two-body baseline, deliberately independent of the new continuation
// and the stateAt/orbitEllipse functions being replaced by the integration.
function twoBody(row) {
  const mu = 398600.4418,
    r = row.slice(1, 4),
    v = row.slice(4),
    radius = norm(r),
    h = cross(r, v),
    hmag = norm(h),
    a = 1 / (2 / radius - dot(v, v) / mu),
    ev = cross(v, h).map((x, i) => x / mu - r[i] / radius),
    e = norm(ev),
    x = e > 1e-10 ? ev.map((v) => v / e) : r.map((v) => v / radius),
    y = cross(
      h.map((v) => v / hmag),
      x
    ),
    b = a * Math.sqrt(1 - e * e),
    E0 = Math.atan2(dot(r, y) / b, dot(r, x) / a + e),
    M0 = E0 - e * Math.sin(E0),
    n = Math.sqrt(mu / a ** 3),
    period = TAU / n;
  return {
    period,
    position(time) {
      const M = M0 + n * (((time - row[0]) / 1000) % period);
      let E = M;
      for (let i = 0; i < 20; i++) {
        const correction = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        E -= correction;
        if (Math.abs(correction) < 1e-13) break;
      }
      return x.map((v, i) => a * (Math.cos(E) - e) * v + b * Math.sin(E) * y[i]);
    },
  };
}

// Reproduce the old pass-only estimator as a historical comparison, without
// importing its implementation or inheriting changes to stateAt.
function oldPassEstimate(rows) {
  const row = rows.at(-1),
    end = row[0],
    baseline = twoBody(row),
    nodes = [];
  for (let i = rows.length - 1; i > 0 && rows[i][0] > end - DAY; i--) {
    if (rows[i - 1][3] >= 0 || rows[i][3] < 0) continue;
    let lo = rows[i - 1][0],
      hi = rows[i][0];
    while (hi - lo > 10) {
      const time = (lo + hi) / 2;
      if (interpolate(rows, time).position[2] < 0) lo = time;
      else hi = time;
    }
    const time = (lo + hi) / 2,
      p = interpolate(rows, time).position;
    nodes.unshift({ time, node: Math.atan2(p[1], p[0]) });
  }
  assert(nodes.length >= 4);
  const first = nodes[0],
    last = nodes.at(-1),
    duration = last.time - first.time,
    period = duration / (nodes.length - 1),
    ratio = (baseline.period * 1000) / period,
    planeRate = wrap(last.node - first.node) / duration;
  return (time) => {
    const elapsed = time - end,
      p = baseline.position(end + elapsed * ratio),
      angle = planeRate * elapsed,
      c = Math.cos(angle),
      s = Math.sin(angle);
    return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]];
  };
}

// Frame conversion preserves the previous TEME -> PEF -> scene construction,
// and the forward/inverse state transformations both include frame drift.
const epoch = station.rows.at(-1)[0],
  frameState = { position: [7000, -1000, 2000], velocity: [1, 6, -3] };
for (const time of [epoch, epoch - 36525 * DAY, epoch + 36525 * DAY]) {
  const axes = earthAxes(time),
    angle = gstime(new Date(time)),
    c = Math.cos(angle),
    s = Math.sin(angle),
    r = frameState.position,
    fixed = [c * r[0] + s * r[1], -s * r[0] + c * r[1], r[2]],
    expected = r.map((_, i) => fixed.reduce((sum, x, j) => sum + x * axes[j][i], 0)),
    converted = temeToJ2000State(frameState, time),
    restored = j2000ToTEMEState(converted, time);
  assert(difference(temeToJ2000(r, time), expected) < 1e-10);
  assert(difference(restored.position, r) < 1e-10);
  assert(difference(restored.velocity, frameState.velocity) < 1e-12);
}

// Both actual data sources, both endpoints, and both time directions. The
// returned state values match; no claim of exact SGP4 position differentiation.
const models = [];
for (const data of [station, dfh])
  for (const row of [data.rows[0], data.rows.at(-1)]) {
    const model = createOrbitContinuation(row);
    assert.equal(model.kind, 'sgp4');
    assert.equal(model.bstar, 0);
    assert(model.iterations <= 16);
    assert(model.positionErrorKm < 1e-6);
    assert(model.velocityErrorKmS < 1e-9);
    assert.deepEqual(model.state(row[0]), { position: row.slice(1, 4), velocity: row.slice(4) });
    for (const direction of [-1, 1]) {
      const q = model.state(row[0] + direction),
        dt = direction / 1000;
      // The semi-analytic SGP4 position/velocity series differ by a few m/s;
      // over this 1 ms stencil the position residual must stay below 5 mm.
      assert(
        difference(
          q.position,
          row.slice(1, 4).map((x, i) => x + dt * row[i + 4])
        ) < 5e-6
      );
      assert(difference(q.velocity, row.slice(4)) < 3e-5);
    }
    models.push(model);
  }

// Genuine, withheld operator ephemeris: compare with both the old frozen
// ellipse and the former pass-only period/node correction, at the same cutoff
// used by the existing pass regression test.
const archived = parseOfficialOrbit(
    fs.readFileSync(new URL('../assets/official-orbit-source.html', import.meta.url), 'utf8')
  ),
  cutoff = archived.rows[0][0] + 2.93 * DAY,
  training = archived.rows.filter((row) => row[0] <= cutoff),
  row = training.at(-1),
  fitted = createOrbitContinuation(row),
  frozen = twoBody(row),
  oldEstimate = oldPassEstimate(training),
  holdout = [];
assert.equal(fitted.kind, 'sgp4');
for (const hours of [6, 12, 24, 48, 72]) {
  const time = row[0] + hours * 3600000,
    truth = interpolate(archived.rows, time).position,
    errorKm = difference(fitted.state(time).position, truth),
    oldEstimateKm = difference(oldEstimate(time), truth),
    twoBodyKm = difference(frozen.position(time), truth);
  assert(errorKm < twoBodyKm * 0.2, `improves frozen ellipse at ${hours} h`);
  assert(errorKm < oldEstimateKm, `does not regress former pass-only estimator at ${hours} h`);
  holdout.push({ hours, errorKm, oldEstimateKm, twoBodyKm });
}

function circularRow(inclination, radius = 7000, eccentricity = 0) {
  const a = inclination / DEG,
    v = Math.sqrt((constants.mu * (1 + eccentricity)) / radius);
  // This helper describes a state in TEME at epoch, then converts both vectors.
  const q = temeToJ2000State(
    { position: [radius, 0, 0], velocity: [0, v * Math.cos(a), v * Math.sin(a)] },
    epoch
  );
  return [epoch, ...q.position, ...q.velocity];
}

function nodeDrift(model) {
  const node = (time) => {
    const q = model.state(time),
      h = cross(q.position, q.velocity),
      axes = earthAxes(epoch),
      fixed = axes.map((a) => dot(a, h));
    return Math.atan2(fixed[0], -fixed[1]);
  };
  let angle = 0,
    previous = node(epoch);
  for (let hour = 1; hour <= 72; hour++) {
    const current = node(epoch + hour * 3600000);
    angle += wrap(current - previous);
    previous = current;
  }
  return (angle * DEG) / 3;
}
const cssDrift = nodeDrift(models[1]);
assert(cssDrift < -5.7 && cssDrift > -6.5, `CSS node continues drifting: ${cssDrift} deg/day`);
const prograde = createOrbitContinuation(circularRow(42)),
  retrograde = createOrbitContinuation(circularRow(175)),
  polar = createOrbitContinuation(circularRow(90)),
  progradeDrift = nodeDrift(prograde),
  retrogradeDrift = nodeDrift(retrograde);
assert.equal(prograde.kind, 'sgp4');
assert.equal(retrograde.kind, 'j2');
assert.equal(retrograde.reason, 'retrograde-chart');
assert(progradeDrift < -4.5 && progradeDrift > -6);
assert(retrogradeDrift > 6.5 && retrogradeDrift < 8.5);
assert(Math.abs(nodeDrift(polar)) < 0.03);
assert(Math.abs(retrogradeDrift - retrograde.nodeRate * 86400 * DEG) < 0.03);

// Exact/near circular, equatorial, polar, retrograde and high-eccentricity
// cases, including a 12-hour resonant orbit that must never reach dspace.
const degenerate = [
  circularRow(0),
  circularRow(1e-9),
  circularRow(42, 7000, 1e-10),
  circularRow(90),
  circularRow(179.999999),
  circularRow(180),
  circularRow(55, 26560),
  circularRow(60, 7500, 0.85),
];
for (const input of degenerate) {
  const model = createOrbitContinuation(input);
  assert(model, `valid continuation for ${input}`);
  assert.deepEqual(model.state(epoch), { position: input.slice(1, 4), velocity: input.slice(4) });
  assert(model.positionErrorKm < 1e-6 && model.velocityErrorKmS < 1e-9);
  for (const offset of [-36525 * DAY, -DAY, 1, DAY, 36525 * DAY]) {
    const q = model.state(epoch + offset);
    assert(q && [...q.position, ...q.velocity].every(Number.isFinite));
    assert(norm(q.position) > constants.earthRadius);
  }
  models.push(model);
}
const deep = createOrbitContinuation(circularRow(55, 26560));
assert.equal(deep.kind, 'j2');
assert.equal(deep.reason, 'deep-space');
// Unlike SGP4, the vector J2 model has an explicitly differentiated basis.
for (const offset of [-DAY, 0, DAY]) {
  const time = epoch + offset,
    q = deep.state(time),
    a = deep.state(time - 100),
    b = deep.state(time + 100);
  assert(
    difference(
      q.velocity,
      b.position.map((x, i) => (x - a.position[i]) / 0.2)
    ) < 1e-7
  );
}

const started = performance.now();
for (const model of models)
  for (let i = 0; i < 100; i++) {
    const time = i === 0 ? -8.64e15 : i === 99 ? 8.64e15 : epoch + ((i - 50) * 36525 * DAY) / 50,
      q = model.state(time);
    assert(q && [...q.position, ...q.velocity].every(Number.isFinite));
    assert.deepEqual(model.state(time), q, 'random query order is deterministic');
  }
const queryMs = performance.now() - started;
assert(queryMs < 3000, `random 100-year/extreme-date queries stay bounded: ${queryMs} ms`);
assert.equal(createOrbitContinuation([epoch, 7000, 0, 0, 12, 0, 0]), null);
assert.equal(createOrbitContinuation([epoch, 7000, 0, 0, 0, 0, 0]), null);
assert.equal(createOrbitContinuation([NaN, 7000, 0, 0, 0, 7, 0]), null);
assert.equal(fitted.state(NaN), null);
assert.equal(fitted.state(8.64e15 + 1), null);
console.log(
  'Orbit continuation: scaled SGP4 fit, OEM holdout, frame round-trip, J2 drift, degeneracies and bounded far-date queries passed',
  {
    holdout,
    cssDrift,
    progradeDrift,
    retrogradeDrift,
    queryMs,
  }
);
