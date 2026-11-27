import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Body, GeoMoon, HelioVector } from 'astronomy-engine';
import { earthAxes } from '../src/earth-frame.js';
import { AU, cross, dot, norm, sub, unit } from '../src/orbit.js';
import { defaultMission, runMission, STEP } from '../src/pro/mission.js';
import {
  createPropagator,
  forceFields,
  harrisPriesterDensity,
  validateForces,
} from '../src/pro/orbit-propagation.js';

const ref = JSON.parse(readFileSync(new URL('./reference/pro-forces.json', import.meta.url)));
const epochMs = Date.parse(ref.epochUtc);
const scaled = (v, k) => v.map((x) => k * x);
const distance = (a, b) => norm(sub(a, b));
function rejects(f, key) {
  assert.throws(f, { name: 'RangeError', message: key });
}
function near(value, expected, tolerance, description) {
  assert(
    Math.abs(value - expected) <= tolerance,
    `${description}: got ${value}, expected ${expected} ± ${tolerance}`
  );
}

const defaults = validateForces();
assert.deepEqual(validateForces({}), defaults);
for (const flag of ['drag', 'srp', 'thirdBody']) {
  assert.equal(defaults[flag], false);
  rejects(() => validateForces({ [flag]: 'false' }), flag);
}
for (const [key, [initial, low, high]] of Object.entries(forceFields)) {
  assert.equal(defaults[key], initial);
  assert.equal(validateForces({ [key]: low })[key], low);
  assert.equal(validateForces({ [key]: high })[key], high);
  for (const value of [NaN, Infinity, undefined, 1 + high, low - 1, '1']) {
    rejects(() => validateForces({ [key]: value }), key);
  }
}
for (const value of [null, 1, [], { dragModel: true }, new Date()]) {
  rejects(() => validateForces(value), 'forces');
}

// +30° east of the subsolar direction is the density maximum. At 410 km the
// bracketed 400/420 km densities must interpolate logarithmically.
const apexSun = [Math.sqrt(3) / 2, -0.5, 0];
assert.equal(ref.densityTable.length, 50);
for (const [h, minimum, maximum] of [
  ...ref.densityTable,
  [410, Math.sqrt(2.249e-12 * 1.558e-12), Math.sqrt(7.492e-12 * 5.684e-12)],
]) {
  const r = [6378.137 + h, 0, 0];
  near(harrisPriesterDensity(r, apexSun) / maximum, 1, 1e-12, 'density apex');
  near(harrisPriesterDensity(r, scaled(apexSun, -1)) / minimum, 1, 1e-12, 'density antapex');
}
for (const height of [99.99, 1000.01]) {
  rejects(() => harrisPriesterDensity([6378.137 + height, 0, 0], apexSun), 'dragAltitude');
}
let maxDensityRelative = 0;
for (const sample of ref.densities) {
  const relative = Math.abs(
    harrisPriesterDensity(sample.rKm, sample.sunKm) / sample.densityKgM3 - 1
  );
  // Orekit uses radial height above an ellipsoid; StarOrbit uses normal height.
  // The two conventions coincide on the equator; retain a separate tighter bound.
  assert(
    relative < (sample.latitudeDeg === 0 ? 2e-12 : 6e-5),
    `density at ${sample.heightKm} km: ${relative}`
  );
  maxDensityRelative = Math.max(maxDensityRelative, relative);
}

function bodyVectors(seconds) {
  const ms = epochMs + seconds * 1000,
    date = new Date(ms);
  const sun = HelioVector(Body.Earth, date),
    moon = GeoMoon(date);
  return [
    scaled([sun.x, sun.y, sun.z], -AU),
    scaled([moon.x, moon.y, moon.z], AU),
    earthAxes(ms)[2],
  ];
}
const propagator = (forces) => createPropagator({ gravity: 'j2', epochMs, forces });
const background = propagator({});
// One circular Kepler period, using the legacy two-body/no-options route.
const kepler = createPropagator({ gravity: 'twoBody', epochMs });
const radius = 7000,
  mu = 398600.4418;
const circular = [radius, 0, 0, 0, Math.sqrt(mu / radius), 0];
const period = 2 * Math.PI * Math.sqrt(radius ** 3 / mu),
  dt = period / 4096;
let afterPeriod = circular;
for (let i = 0; i < 4096; i++) afterPeriod = kepler.advance(afterPeriod, i * dt, dt);
assert(distance(afterPeriod.slice(0, 3), circular.slice(0, 3)) < 1e-7);
assert(distance(afterPeriod.slice(3), circular.slice(3)) < 1e-10);
const effect = (p, state, t = 0) =>
  sub(p.acceleration(state, t), background.acceleration(state, t));
const [sun, , pole] = bodyVectors(0),
  radialSun = unit(sun);
const srp = propagator({ srp: true, srpAreaM2: 1.8, cr: 1.7, massKg: 4 });
const radialState = (u) => [...scaled(u, 6900), 0, 7.6, 0];
const day = radialState(radialSun),
  night = radialState(scaled(radialSun, -1));
const daylightAcceleration = effect(srp, day);
const pressure = (1361 / 299792458) * (AU / (norm(sun) - 6900)) ** 2;
const expectedSrp = scaled(radialSun, (-pressure * 1.7 * 1.8) / 4 / 1000);
assert(distance(daylightAcceleration, expectedSrp) < 2e-18, 'SRP direction, scale and area/mass');
assert.deepEqual(effect(srp, night), [0, 0, 0], 'umbra');
const side = unit(cross(radialSun, [0, 0, 1]));
const limb = Math.asin(6371 / 6900);
const penumbra = radialState(
  radialSun.map((v, i) => -Math.cos(limb) * v + Math.sin(limb) * side[i])
);
const visible = norm(effect(srp, penumbra)) / norm(daylightAcceleration);
assert(visible > 0.47 && visible < 0.53, `partial Earth occultation: ${visible}`);

const drag = propagator({ drag: true, massKg: 4, cd: 2.1, dragAreaM2: 0.7, densityScale: 1.8 });
const position = ref.initial.slice(0, 3);
const air = scaled(cross(pole, position), 7.292115e-5);
assert(norm(effect(drag, [...position, ...air])) < 1e-18, 'corotating spacecraft');
const vRelative = [1.2, -5.9, 4.6],
  ambient = harrisPriesterDensity(position, sun, pole);
const airState = [...position, ...air.map((x, i) => x + vRelative[i])];
const expectedDrag = scaled(vRelative, ((-500 * ambient * 1.8 * 2.1 * 0.7) / 4) * norm(vRelative));
assert(dot(effect(drag, airState), vRelative) < 0);
assert(distance(effect(drag, airState), expectedDrag) < 2e-18, 'drag direction and SI conversion');
assert.deepEqual(effect(propagator({ drag: true, cd: 0 }), airState), [0, 0, 0]);
rejects(() => drag.advance([6378.137 + 100.1, 0, 0, -3, 7, 0], 0, 1), 'dragAltitude');
rejects(() => drag.advance([6378.137 + 999.9, 0, 0, 3, 7, 0], 0, 1), 'dragAltitude');
assert(background.advance([7500, 0, 0, 0, 7.3, 0], 0, 2.5).every(Number.isFinite));

const tide = propagator({ thirdBody: true });
for (const sec of [0, 7200.25, 43831.5, 86398.75]) {
  const [star, satellite] = bodyVectors(sec);
  const tideVector = [0, 0, 0];
  for (const [body, gm] of [
    [star, 132712440041.279419],
    [satellite, 4902.800118],
  ]) {
    const dr = sub(body, position);
    const d = sub(scaled(dr, gm / norm(dr) ** 3), scaled(body, gm / norm(body) ** 3));
    d.forEach((value, i) => {
      tideVector[i] += value;
    });
  }
  assert(
    distance(effect(tide, ref.initial, sec), tideVector) < 8e-17,
    `third-body tide at ${sec} s`
  );
}

// Worst midpoint error of all 1,440 ephemeris intervals across the reference day.
const interpolationError = [0, 0, 0];
let left = bodyVectors(0);
for (let t = 0; t < 86400; t += 60) {
  const right = bodyVectors(t + 60),
    direct = bodyVectors(t + 30);
  direct.forEach((exact, i) => {
    const midpoint = left[i].map((v, j) => (v + right[i][j]) / 2);
    interpolationError[i] = Math.max(interpolationError[i], distance(exact, midpoint));
  });
  left = right;
}
assert(
  interpolationError[0] < 0.003 && interpolationError[1] < 0.0015 && interpolationError[2] < 1e-13
);

// External fixture combines JPL DE440s geometric vectors, ERFA IAU 2006/2000A
// pole, original Orekit Harris-Priester Java implementation and SciPy DOP853.
const limits = {
  j2: [0.005, 0.006],
  drag: [0.35, 0.4],
  srp: [0.006, 0.007],
  thirdBody: [0.006, 0.007],
  combined: [0.35, 0.4],
};
const residuals = {};
for (const test of ref.cases) {
  const forces = { ...ref.parameters, ...test.switches };
  let samples;
  if (test.name === 'combined') {
    const mission = defaultMission();
    Object.assign(mission.spacecraft, ref.elements);
    mission.epochUtc = ref.epochUtc;
    mission.forces = forces;
    const run = runMission(mission);
    assert.deepEqual(run.trajectoryInfo.appliedForces, forces);
    samples = ref.timesSec.map((s) => run.orbit[s / STEP]);
  } else {
    const model = propagator(forces),
      dt = STEP / 2;
    let state = ref.initial;
    samples = [state];
    for (let t = 0; t < 86400; t += dt) {
      state = model.advance(state, t, dt);
      if (t + dt === ref.timesSec[samples.length]) samples.push(state);
    }
  }
  assert.equal(samples.length, ref.timesSec.length);
  const maxError = [0, 0];
  samples.forEach((state, i) => {
    const target = test.states[i];
    maxError[0] = Math.max(maxError[0], 1000 * distance(state.slice(0, 3), target.slice(0, 3)));
    maxError[1] = Math.max(maxError[1], 1e6 * distance(state.slice(3), target.slice(3)));
  });
  assert(
    maxError.every((v, i) => v < limits[test.name][i]),
    `${test.name}: ${maxError} [m,mm/s]`
  );
  residuals[test.name] = maxError.map((v) => +v.toFixed(6));
}
console.log('24 h DE440s/Orekit/DOP853 residuals [m, mm/s]', JSON.stringify(residuals));
console.log(
  `Orekit density relative discrepancy ≤ ${maxDensityRelative.toExponential(4)}; 60 s Sun/Moon midpoint maxima [m] ${interpolationError
    .slice(0, 2)
    .map((v) => (1000 * v).toFixed(4))
    .join(', ')}`
);
