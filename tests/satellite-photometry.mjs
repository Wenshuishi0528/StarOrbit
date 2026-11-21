import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  estimateSatelliteMagnitude as estimate,
  validSatellitePhotometry,
} from '../src/satellite-photometry.js';

const reference = JSON.parse(
  fs.readFileSync(new URL('../assets/missions/catalog.json', import.meta.url))
).missions.dfh1.satellitePhotometry;
const object = [6600, 0, 0],
  observer = [5600, 0, 0],
  sun = [-1.5e8, 0, 0];
const equal = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, a + ' vs ' + b);
assert.ok(validSatellitePhotometry(reference));
equal(estimate(reference, observer, object, sun, 1), 6.5);
equal(estimate(reference, [4600, 0, 0], object, sun, 1), 6.5 + 5 * Math.log10(2));
equal(estimate(reference, observer, object, [6600, 1.5e8, 0], 1), 6.5 + 2.5 * Math.log10(Math.PI));
equal(
  estimate({ ...reference, magnitude: 7.1, phaseDeg: 90 }, observer, object, [6600, 1.5e8, 0], 1),
  7.1
);
equal(estimate(reference, observer, object, sun, 0.5), 6.5 + 2.5 * Math.log10(2));
for (const ref of [
  undefined,
  { ...reference, source: '' },
  { ...reference, magnitude: null },
  { ...reference, phaseDeg: 180 },
])
  assert.equal(estimate(ref, observer, object, sun, 1), null);
assert.equal(estimate(reference, observer, object, sun, 0), null);
assert.equal(estimate(reference, observer, object, [1.5e8, 0, 0], 1), null);
assert.equal(estimate(reference, observer, observer, sun, 1), null);
console.log(
  'Satellite photometry: QuickSat full-phase convention, quadrature calibration, inverse-square range, penumbra, missing data and shadow passed.'
);
