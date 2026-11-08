import assert from 'node:assert/strict';
import { LUNAR_PLACES } from '../src/lunar-place-catalog.js';
import {
  createLunarPlaceIndex,
  layoutLunarPlaces,
  lunarVisibleCap,
  lunarPlaceDirection,
  lunarPlaceName,
  lunarLandingMarker,
  validLunarPlace,
} from '../src/lunar-place-layout.js';
import {
  normalizeLunarPlaceControls,
  filterLunarControlPlaces,
} from '../src/lunar-place-controls.js';
const features = LUNAR_PLACES.filter((p) => p.kind === 'feature'),
  landings = LUNAR_PLACES.filter((p) => p.kind === 'landing');
const index = createLunarPlaceIndex(LUNAR_PLACES);
assert.equal(index.count, features.filter(validLunarPlace).length);
assert.ok(index.bucketCount <= 648);
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
for (const [longitude, latitude] of [
  [0, 0],
  [179.9, 30],
  [-179.9, -30],
  [35, 89.9],
  [-120, -89.9],
])
  for (const radius of [0.03, 0.4, Math.PI / 2])
    for (const minimum of [0, 10, 250]) {
      const direction = lunarPlaceDirection({ longitude, latitude });
      const actual = index
        .query({ direction, angularRadius: radius, minDiameterKm: minimum })
        .entries.map((e) => e.place.id)
        .sort();
      const expected = features
        .filter(
          (p) =>
            validLunarPlace(p) &&
            (p.diameterKm || 0) >= minimum &&
            dot(direction, lunarPlaceDirection(p)) >= Math.cos(radius) - 1e-8
        )
        .map((p) => p.id)
        .sort();
      assert.deepEqual(
        actual,
        expected,
        'spatial bins must never lose a seam/polar/frustum candidate'
      );
    }
const query = index.query({ direction: [1, 0, 0], angularRadius: 0.03, minDiameterKm: 0 });
assert.ok(
  query.visited < features.length / 10,
  'zoomed queries must not scan the entire catalogue'
);
const fullCap = lunarVisibleCap(220, 0.72, 2.7),
  zoomCap = lunarVisibleCap(220, 0.72 / 14, 2.7);
assert.ok(Math.abs(fullCap - Math.acos(1 / 220)) < 1e-12);
assert.ok(zoomCap < fullCap / 3);
assert.ok(lunarVisibleCap(1.35, 43, 1.7) < Math.PI / 2);

const fixture = [
  {
    id: 'large',
    kind: 'feature',
    name: 'Mare Example',
    longitude: 0,
    latitude: 0,
    diameterKm: 500,
  },
  { id: 'tiny', kind: 'feature', name: 'Tiny A', longitude: 1, latitude: 1, diameterKm: 1 },
  { id: 'back', kind: 'feature', name: 'Back', longitude: 180, latitude: 0, diameterKm: 500 },
  {
    id: 'unknown',
    kind: 'feature',
    name: 'Unknown',
    longitude: null,
    latitude: null,
    diameterKm: 500,
  },
];
const fixtureIndex = createLunarPlaceIndex(fixture);
const project = (_place, unit) =>
  unit[0] <= 0 ? null : { x: 150 + unit[1] * 100, y: 100 - unit[2] * 100 };
const base = {
  index: fixtureIndex,
  project,
  width: 300,
  height: 200,
  direction: [1, 0, 0],
  angularRadius: Math.PI / 2,
  density: 0.45,
  pixelsPerKm: 0.1,
};
let output = layoutLunarPlaces(base);
assert.deepEqual(
  output.items.map((p) => p.place.id),
  ['large']
);
output = layoutLunarPlaces({ ...base, pixelsPerKm: 100 });
assert.ok(output.candidates === 2, 'zoom makes small named features eligible');
output = layoutLunarPlaces({ ...base, selected: fixture[1] });
assert.ok(
  output.items.some((p) => p.place.id === 'tiny' && p.selected),
  'selected tiny features bypass size and crowding filters'
);
output = layoutLunarPlaces({ ...base, density: 1 });
assert.equal(output.overlap, true);
assert.equal(output.items.length, 2, 'maximum density keeps overlapping visible labels');
assert.ok(output.items.every((p) => p.showText));
assert.equal(
  layoutLunarPlaces({ ...base, selected: fixture[2] }).items.some((p) => p.place.id === 'back'),
  false,
  'selection cannot reveal the far side'
);
const cn = {
  id: 'cn',
  kind: 'landing',
  name: 'CN',
  country: 'CN',
  outcome: 'soft-success',
  longitude: 0,
  latitude: 0,
};
const failure = { ...cn, id: 'failure', outcome: 'impact-failed' };
output = layoutLunarPlaces({
  ...base,
  labels: false,
  landingSites: [cn, failure, { ...cn, id: 'unknown-landing', longitude: null }],
});
assert.equal(
  output.items.length,
  2,
  'landings are independent of name visibility and unknown coordinates do not get a marker'
);
assert.equal(output.items[0].marker.shape, 'star');
assert.equal(output.items[0].marker.color, '#ff5454');
assert.equal(output.items[1].marker.filled, false);
assert.equal(output.items[1].marker.failed, true);
assert.equal(lunarLandingMarker({ ...cn, country: 'US' }).shape, 'diamond');
assert.equal(lunarLandingMarker({ ...cn, outcome: 'soft-partial' }).partial, true);
assert.equal(layoutLunarPlaces({ ...base, labels: false, landingSites: [] }).items.length, 0);
assert.equal(lunarPlaceName({ name: 'Copernicus', nameZh: '哥白尼' }, 'zh'), '哥白尼');
assert.equal(
  lunarPlaceName({ name: 'Copernicus', nameZh: '哥白尼' }, 'fr'),
  'Copernicus',
  'do not invent translations of unlocalized official names'
);
assert.deepEqual(normalizeLunarPlaceControls(), {
  placesEnabled: true,
  landingsEnabled: true,
  density: 0.45,
});
assert.deepEqual(
  normalizeLunarPlaceControls({ placesEnabled: false, landingsEnabled: false, density: 9 }),
  { placesEnabled: false, landingsEnabled: false, density: 1 }
);
for (const kind of ['landing', 'feature', 'crater', 'satellite', 'mare', 'mountain', 'other'])
  assert.ok(filterLunarControlPlaces(LUNAR_PLACES, '', kind).length > 0);
assert.ok(filterLunarControlPlaces(LUNAR_PLACES, '嫦娥', 'landing').length > 0);
assert.ok(filterLunarControlPlaces(LUNAR_PLACES, 'Copernicus', 'crater').length > 0);
assert.ok(
  filterLunarControlPlaces(LUNAR_PLACES, 'Copernicus A', 'satellite').some(
    (p) => p.name === 'Copernicus A'
  )
);
assert.ok(
  landings.some((p) => !validLunarPlace(p)),
  'catalogue preserves unknown positions for non-map search results'
);
console.log(
  'Lunar place layout: full official catalogue, spatial index, poles/seam, zoom, selection, maximum overlap, independent landing markers and multilingual search passed'
);
