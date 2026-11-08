import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import {
  LUNAR_PLACES,
  LUNAR_PLACES_META,
  LUNAR_FEATURE_TYPES,
  getLunarPlace,
  searchLunarPlaces,
} from '../src/lunar-place-catalog.js';
const features = LUNAR_PLACES.filter((p) => p.kind === 'feature');
const landings = LUNAR_PLACES.filter((p) => p.kind === 'landing');
assert.equal(features.length, 9087);
assert.equal(features.filter((p) => p.isSatelliteFeature).length, 7064);
assert.equal(features.length, LUNAR_PLACES_META.featureCount);
assert.equal(LUNAR_PLACES_META.rawCount, 9202);
assert.deepEqual(LUNAR_PLACES_META.excludedStatuses, { 'Not Approved': 45, Dropped: 70 });
assert.equal(new Set(LUNAR_PLACES.map((p) => p.id)).size, LUNAR_PLACES.length);
for (const p of LUNAR_PLACES) {
  assert.equal(getLunarPlace(p.id), p);
  assert.ok(p.name && /^https:\/\//.test(p.sourceUrl));
  if (p.latitude === null || p.longitude === null) {
    assert.equal(p.kind, 'landing');
    assert.equal(p.locationAccuracy, 'unknown');
    assert.equal(p.latitude, null);
    assert.equal(p.longitude, null);
  } else {
    assert.ok(Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90, p.id);
    assert.ok(Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180, p.id);
  }
  if (p.kind === 'feature') {
    assert.equal(p.featureTypeLabel, LUNAR_FEATURE_TYPES[p.featureType]);
    assert.ok(p.diameterKm >= 0);
  } else {
    assert.ok(['soft-success', 'soft-partial', 'impact-failed'].includes(p.outcome));
    assert.ok(p.date <= LUNAR_PLACES_META.landingSnapshotDate);
  }
}
assert.equal(landings.length, 40);
assert.equal(landings.filter((p) => p.latitude !== null).length, 39);
assert.equal(landings.filter((p) => p.outcome === 'soft-success').length, 24);
assert.equal(landings.filter((p) => p.outcome === 'soft-partial').length, 4);
assert.equal(landings.filter((p) => p.outcome === 'impact-failed').length, 12);
for (const id of ['9', '13', '16', '17', '20', '21', '23', '24'])
  assert.ok(getLunarPlace('landing:luna-' + id).outcome.startsWith('soft-'));
for (const id of ['11', '12', '14', '15', '16', '17'])
  assert.equal(getLunarPlace('landing:apollo-' + id).outcome, 'soft-success');
for (const id of ['3', '4', '5', '6'])
  assert.equal(getLunarPlace('landing:change-' + id).country, 'CN');
for (const id of ['change-1', 'change-7', 'im-3', 'griffin-1', 'peregrine', 'luna-2'])
  assert.equal(
    getLunarPlace('landing:' + id),
    null,
    'Do not present plans or intentional impacts as landings'
  );
assert.equal(getLunarPlace('landing:surveyor-4').latitude, null);
assert.equal(getLunarPlace('landing:change-6').longitude, -153.9852);
assert.equal(
  getLunarPlace('landing:slim').date,
  '2024-01-19',
  'UTC, not Japanese local calendar date'
);
assert.equal(
  getLunarPlace('landing:change-6').date,
  '2024-06-01',
  'UTC, not Chinese local calendar date'
);
assert.equal(getLunarPlace('tycho').id, 'usgs:6163');
assert.equal(searchLunarPlaces('Tycho A')[0].id, 'usgs:13551');
assert.equal(searchLunarPlaces('嫦娥三号')[0].id, 'landing:change-3');
assert.equal(searchLunarPlaces('CE-6')[0].id, 'landing:change-6');
assert.equal(searchLunarPlaces('', { kind: 'feature', limit: Infinity }).length, features.length);
assert.equal(searchLunarPlaces('', { country: 'CN', limit: Infinity }).length, 4);
assert.deepEqual(searchLunarPlaces('Tycho', { limit: 0 }), []);
assert.deepEqual(searchLunarPlaces('a string that cannot be a lunar place'), []);
const source = gunzipSync(
  readFileSync(new URL('../assets/moon/places/gazetteer-source.csv.gz', import.meta.url))
);
assert.equal(createHash('sha256').update(source).digest('hex'), LUNAR_PLACES_META.sourceSha256);
console.log(
  'Lunar places: complete approved Gazetteer + satellite features, 40 landing attempts, coordinates, source checksum, aliases, filters and exclusions passed.'
);
