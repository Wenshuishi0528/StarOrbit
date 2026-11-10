import { constants, json2satrec, sgp4 } from 'satellite.js';
import { earthAxes, j2000ToTEMEState, temeToJ2000State } from './earth-frame.js';

// Use the same WGS72 constants as satellite.js: km, seconds, radians.
const { mu: MU, earthRadius: RE, j2: J2 } = constants;
const TAU = 2 * Math.PI,
  DEG = 180 / Math.PI,
  MAX_FIT_ITERATIONS = 16;
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0),
  norm = (a) => Math.hypot(...a),
  cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  unit = (a) => a.map((x) => x / norm(a)),
  wrap = (a) => ((a % TAU) + TAU) % TAU,
  validTime = (t) => Number.isFinite(t) && Math.abs(t) <= 8.64e15,
  finiteState = (q) => q && [...q.position, ...q.velocity].every(Number.isFinite),
  cloneState = (q) => ({ position: [...q.position], velocity: [...q.velocity] });

function ellipse(position, velocity) {
  const radius = norm(position),
    h = cross(position, velocity),
    hmag = norm(h),
    energy = dot(velocity, velocity) / 2 - MU / radius;
  if (!(energy < 0) || hmag < 1e-8) return null;
  const a = -MU / (2 * energy),
    ev = cross(velocity, h).map((x, i) => x / MU - position[i] / radius),
    e = norm(ev);
  if (!(e < 1) || a * (1 - e) <= RE) return null;
  const z = h.map((x) => x / hmag),
    x = e > 1e-12 ? ev.map((v) => v / e) : unit(position),
    y = unit(cross(z, x)),
    b = a * Math.sqrt(1 - e * e),
    E = Math.atan2(dot(position, y) / b, dot(position, x) / a + e),
    n = Math.sqrt(MU / a ** 3);
  return { a, b, e, ev, x, y, z, n, M: E - e * Math.sin(E), period: TAU / n };
}

function rotate(v, axis, angle) {
  const c = Math.cos(angle),
    s = Math.sin(angle),
    along = dot(axis, v) * (1 - c),
    perpendicular = cross(axis, v);
  return v.map((x, i) => x * c + perpendicular[i] * s + axis[i] * along);
}

function eccentricAnomaly(M, e) {
  let lo = 0,
    hi = TAU,
    E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 48; i++) {
    const f = E - e * Math.sin(E) - M;
    if (Math.abs(f) < 1e-13) break;
    if (f > 0) hi = E;
    else lo = E;
    const next = E - f / (1 - e * Math.cos(E));
    E = next > lo && next < hi ? next : (lo + hi) / 2;
  }
  return E;
}

function j2Rates(q, pole) {
  const c = dot(q.z, pole),
    f = J2 * (RE / (q.a * (1 - q.e * q.e))) ** 2;
  return {
    node: -1.5 * f * q.n * c,
    perigee: 0.75 * f * q.n * (5 * c * c - 1),
    phaseRatio: 1 + 0.75 * f * Math.sqrt(1 - q.e * q.e) * (3 * c * c - 1),
  };
}

// Secular, first-order J2 fallback. Calibrate the underlying ellipse velocity
// against the rotating basis and corrected mean motion, rather than rotating a
// two-body orbit after the fact. No RAAN/perigee angles are needed at e=0/i=0/pi.
function createJ2(initial, epoch, pole, reason) {
  let v = [...initial.velocity],
    q,
    rates;
  for (let i = 0; i < 24; i++) {
    q = ellipse(initial.position, v);
    if (!q) return null;
    rates = j2Rates(q, pole);
    const angular = pole.map((x, j) => rates.node * x + rates.perigee * q.z[j]),
      drift = cross(angular, initial.position),
      next = initial.velocity.map((x, j) => (x - drift[j]) / rates.phaseRatio),
      change = norm(next.map((x, j) => x - v[j]));
    v = next;
    if (change < 1e-12) break;
  }
  q = ellipse(initial.position, v);
  if (!q) return null;
  rates = j2Rates(q, pole);
  const phaseRate = q.n * rates.phaseRatio,
    phasePeriod = TAU / phaseRate,
    angleAt = (rate, seconds) => (rate ? rate * (seconds % (TAU / Math.abs(rate))) : 0);
  function calculate(time) {
    const seconds = (time - epoch) / 1000,
      E = eccentricAnomaly(wrap(q.M + phaseRate * (seconds % phasePeriod)), q.e),
      c = Math.cos(E),
      s = Math.sin(E),
      rate = phaseRate / (1 - q.e * c),
      node = angleAt(rates.node, seconds),
      perigee = angleAt(rates.perigee, seconds),
      transform = (vector) => rotate(rotate(vector, q.z, perigee), pole, node),
      position = transform(q.x.map((x, j) => q.a * (c - q.e) * x + q.b * s * q.y[j])),
      baseVelocity = transform(q.x.map((x, j) => rate * (-q.a * s * x + q.b * c * q.y[j]))),
      normal = rotate(q.z, pole, node),
      angular = pole.map((x, j) => rates.node * x + rates.perigee * normal[j]),
      drift = cross(angular, position);
    return { position, velocity: baseVelocity.map((x, j) => x + drift[j]) };
  }
  const boundary = calculate(epoch),
    positionErrorKm = norm(boundary.position.map((x, j) => x - initial.position[j])),
    velocityErrorKmS = norm(boundary.velocity.map((x, j) => x - initial.velocity[j]));
  if (positionErrorKm > 1e-7 || velocityErrorKmS > 1e-9) return null;
  return {
    kind: 'j2',
    epoch,
    reason,
    period: phasePeriod,
    nodeRate: rates.node,
    perigeeRate: rates.perigee,
    positionErrorKm,
    velocityErrorKmS,
    state(time) {
      if (!validTime(time)) return null;
      return time === epoch ? cloneState(initial) : calculate(time);
    },
  };
}

// Prograde equinoctial parameters avoid separately fitting the undefined
// perigee and ascending-node angles of circular/equatorial states. Near pi the
// prograde chart is singular, so that case uses the vector J2 model instead.
function initialParameters(q, position) {
  const hx = -q.z[1] / (1 + q.z[2]),
    hy = q.z[0] / (1 + q.z[2]),
    d = 1 + hx * hx + hy * hy,
    f = [(1 + hx * hx - hy * hy) / d, (2 * hx * hy) / d, (-2 * hy) / d],
    g = [(2 * hx * hy) / d, (1 - hx * hx + hy * hy) / d, (2 * hx) / d],
    ex = dot(q.ev, f),
    ey = dot(q.ev, g),
    longitude = Math.atan2(dot(position, g), dot(position, f)),
    varpi = Math.atan2(ey, ex),
    anomaly = longitude - varpi,
    E = Math.atan2(Math.sqrt(1 - q.e * q.e) * Math.sin(anomaly), q.e + Math.cos(anomaly)),
    lambda =
      q.e < 1e-8
        ? longitude - 2 * (ex * Math.sin(longitude) - ey * Math.cos(longitude))
        : varpi + E - q.e * Math.sin(E);
  return [Math.log(q.n), ex, ey, hx, hy, wrap(lambda)];
}

function satrecAt(parameters, epochText) {
  const [logn, ex, ey, hx, hy, lambda] = parameters,
    e = Math.hypot(ex, ey),
    n = Math.exp(logn),
    inclination = 2 * Math.atan(Math.hypot(hx, hy)),
    node = Math.atan2(hy, hx),
    varpi = e > 1e-15 ? Math.atan2(ey, ex) : 0;
  if (!(e < 0.99) || !(n > 0) || !parameters.every(Number.isFinite)) return null;
  const rec = json2satrec({
    NORAD_CAT_ID: 99999,
    EPOCH: epochText,
    MEAN_MOTION: (n * 86400) / TAU,
    ECCENTRICITY: e,
    INCLINATION: inclination * DEG,
    RA_OF_ASC_NODE: wrap(node) * DEG,
    ARG_OF_PERICENTER: wrap(varpi - node) * DEG,
    MEAN_ANOMALY: wrap(lambda - varpi) * DEG,
    BSTAR: 0,
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
  });
  // In particular, do not allow dspace's 720-minute resonance loop into the
  // arbitrary-date continuation. The J2 fallback has constant query cost.
  return rec.method === 'n' && !rec.error ? rec : null;
}

function rawState(rec, minutes) {
  const state = sgp4(rec, minutes);
  if (!state?.position || !state.velocity || rec.error) return null;
  const result = {
    position: ['x', 'y', 'z'].map((k) => state.position[k]),
    velocity: ['x', 'y', 'z'].map((k) => state.velocity[k]),
  };
  return finiteState(result) ? result : null;
}

function solve(matrix, rhs) {
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let i = 0; i < 6; i++) {
    let pivot = i;
    for (let j = i + 1; j < 6; j++) if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    if (Math.abs(a[pivot][i]) < 1e-12) return null;
    [a[i], a[pivot]] = [a[pivot], a[i]];
    const scale = a[i][i];
    for (let k = i; k <= 6; k++) a[i][k] /= scale;
    for (let j = 0; j < 6; j++)
      if (j !== i) {
        const factor = a[j][i];
        for (let k = i; k <= 6; k++) a[j][k] -= factor * a[i][k];
      }
  }
  return a.map((row) => row[6]);
}

function fitNearEarth(initial, epoch) {
  const target = j2000ToTEMEState(initial, epoch),
    q = ellipse(target.position, target.velocity);
  if (!q) return { reason: 'invalid-teme-state' };
  if (q.period >= 220 * 60) return { reason: 'deep-space' };
  if (q.z[2] < Math.cos(170 / DEG)) return { reason: 'retrograde-chart' };
  const epochText = new Date(epoch).toISOString(),
    scales = [norm(target.position), norm(target.velocity)],
    wanted = [...target.position, ...target.velocity];
  function evaluate(parameters) {
    const rec = satrecAt(parameters, epochText),
      state = rec && rawState(rec, 0);
    if (!state) return null;
    const residual = [...state.position, ...state.velocity].map(
      (x, j) => (x - wanted[j]) / scales[j < 3 ? 0 : 1]
    );
    return { rec, residual, error: norm(residual) };
  }
  let parameters = initialParameters(q, target.position),
    current = evaluate(parameters),
    iterations = 0;
  if (!current) return { reason: 'initialization-failed' };
  for (; iterations < MAX_FIT_ITERATIONS && current.error > 1e-12; iterations++) {
    const jacobian = Array.from({ length: 6 }, () => Array(6));
    for (let j = 0; j < 6; j++) {
      const step = 1e-6 * Math.max(1, Math.abs(parameters[j])),
        plus = [...parameters],
        minus = [...parameters];
      plus[j] += step;
      minus[j] -= step;
      const a = evaluate(plus),
        b = evaluate(minus);
      if (!a || !b) return { reason: 'jacobian-failed' };
      for (let k = 0; k < 6; k++) jacobian[k][j] = (a.residual[k] - b.residual[k]) / (2 * step);
    }
    const delta = solve(
      jacobian,
      current.residual.map((x) => -x)
    );
    if (!delta) return { reason: 'singular-fit' };
    let accepted = false;
    for (let damping = 1; damping >= 1 / 256; damping /= 2) {
      const next = parameters.map((x, j) => x + damping * delta[j]),
        result = evaluate(next);
      if (result && result.error < current.error) {
        parameters = next;
        current = result;
        accepted = true;
        break;
      }
    }
    if (!accepted) return { reason: 'fit-stalled' };
  }
  if (current.error > 1e-10) return { reason: 'fit-residual' };
  const rec = current.rec,
    boundary = temeToJ2000State(rawState(rec, 0), epoch),
    positionErrorKm = norm(boundary.position.map((x, j) => x - initial.position[j])),
    velocityErrorKmS = norm(boundary.velocity.map((x, j) => x - initial.velocity[j]));
  return {
    model: {
      kind: 'sgp4',
      epoch,
      bstar: 0,
      iterations,
      period: TAU / (rec.no / 60),
      positionErrorKm,
      velocityErrorKmS,
      state(time) {
        if (!validTime(time)) return null;
        if (time === epoch) return cloneState(initial);
        const raw = rawState(rec, (time - epoch) / 60000);
        return raw && temeToJ2000State(raw, time);
      },
    },
  };
}

/**
 * Continue one EME2000 endpoint [epochMs, x, y, z, vx, vy, vz].
 * This is a no-drag mathematical continuation, not long-term orbit knowledge.
 * SGP4's returned velocity is fitted as supplied; it is not claimed to be the
 * exact derivative of SGP4's approximate position series. Invalid, unbound or
 * Earth-intersecting endpoint states return null.
 */
export function createOrbitContinuation(row) {
  if (!Array.isArray(row) || row.length !== 7 || !row.every(Number.isFinite) || !validTime(row[0]))
    return null;
  const epoch = row[0],
    initial = { position: row.slice(1, 4), velocity: row.slice(4) };
  if (!ellipse(initial.position, initial.velocity)) return null;
  const fitted = fitNearEarth(initial, epoch);
  return fitted.model || createJ2(initial, epoch, earthAxes(epoch)[2], fitted.reason);
}
