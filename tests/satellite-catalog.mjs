import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SATELLITE_FILTER_FIELDS,
  SATELLITE_OBJECT_TYPES,
  SATELLITE_PURPOSES,
  groundSatelliteGroup,
  matchesSatelliteFilters,
  satelliteFacetLabel,
  satelliteFacets,
  satelliteGroup,
  satelliteMetadata,
} from '../src/satellite-catalog.js';

const metadata = satelliteMetadata;
const group = satelliteGroup;
const unknown = {
  group: 'regular',
  objectType: 'unknown',
  purpose: 'unknown',
  owner: 'unknown',
  launchYear: null,
  decade: null,
};
assert.deepEqual(metadata(), unknown);
assert.equal(groundSatelliteGroup, satelliteGroup);
assert.ok(SATELLITE_OBJECT_TYPES.includes('rocket-body') && SATELLITE_PURPOSES.includes('crewed'));
assert.deepEqual(SATELLITE_FILTER_FIELDS, ['objectType', 'purpose', 'owner', 'decade']);

const mission = {
  name: 'Test payload',
  satelliteGroup: 'regular',
  satelliteCatalog: {
    objectType: 'payload',
    purpose: 'earth-observation',
    owner: 'US',
    launchDate: '2017-09-29',
  },
};
const observed = metadata(mission);
assert.deepEqual(observed, {
  group: 'regular',
  objectType: 'payload',
  purpose: 'earth-observation',
  owner: 'US',
  launchYear: 2017,
  decade: 2010,
});
const raw = {
  OBJECT_NAME: 'STARLINK-1436',
  OBJECT_ID: '2020-035AA',
  OBJECT_TYPE: 'PAY',
  OWNER: 'US',
  LAUNCH_DATE: '2020-06-04',
};
assert.deepEqual(metadata(raw), {
  group: 'internet',
  objectType: 'payload',
  purpose: 'communications',
  owner: 'US',
  launchYear: 2020,
  decade: 2020,
});
assert.deepEqual(metadata({}, { satcat: raw }), metadata(raw));
assert.deepEqual(metadata({}, { gp: raw }), metadata(raw));
assert.deepEqual(
  metadata({ TIME_SYSTEM: 'UTC', EPOCH: '2024-02-20', OBJECT_NAME: 'USA 200', LAUNCH_SITE: 'WSC' }),
  unknown
);
assert.equal(metadata({ category: '通信卫星' }).purpose, 'communications');
assert.equal(group({ category: '通信卫星' }), 'regular');
assert.equal(metadata({ category: '普通卫星' }).purpose, 'unknown');
assert.equal(metadata({ name: 'United States science satellite' }).purpose, 'unknown');
assert.equal(metadata({ OBJECT_TYPE: 'PAY' }).purpose, 'unknown');

for (const name of [
  'STARLINK-1007',
  'STARLINK-1436 (VisorSat)',
  'STARLINK-1130 (DARKSAT)',
  'STARLINK-30101 (DTC)',
  'ONEWEB-1234',
  'QIANFAN-3',
  'HULIANWANG DIGUI-07A',
  'KUIPER-00241',
  'Amazon LEO-32',
  '千帆极轨01组03星',
  '星链３１８号',
]) {
  assert.equal(group({ name }), 'internet', name);
  assert.equal(metadata({}, { gp: { OBJECT_NAME: name } }).objectType, 'payload', name);
}
for (const name of [
  'Not-Starlink-1007',
  'Kepler-22b',
  'Kuiper Belt Explorer',
  'STARLINK-3000 science experiment',
  'OneWeb service launch',
  '火箭实验平台',
])
  assert.equal(group({ name }), 'regular', name);
assert.equal(
  group({ name: 'Starlink-10' }, { gp: { OBJECT_NAME: 'Kepler-22b' } }),
  'regular',
  'An authoritative catalogue name takes precedence over an unrelated mission display name'
);
assert.equal(group({ name: '观察任务' }, { gp: { OBJECT_NAME: 'Starlink-10' } }), 'internet');
assert.equal(
  group({ satelliteCatalog: { constellation: 'OneWeb', objectType: 'payload' } }),
  'internet'
);
assert.equal(
  group({ satelliteCatalog: { constellation: 'OneWeb' } }),
  'regular',
  'A launch association without payload evidence is not an internet spacecraft'
);
assert.equal(group({ payload: true, constellation: 'OneWeb' }), 'internet');
assert.equal(
  group({ satelliteGroup: 'internet', name: 'A registered network payload' }),
  'internet'
);
assert.equal(group({ satelliteGroup: 'regular', name: 'STARLINK-123' }), 'regular');
assert.equal(
  group({ satelliteGroup: 'internet', name: 'STARLINK-123' }, { gp: { OBJECT_TYPE: 'UNK' } }),
  'regular'
);
assert.equal(
  group({ satelliteGroup: 'internet', name: 'STARLINK-123', payload: false }),
  'regular'
);
for (const [actual, expected] of [
  [{ OBJECT_TYPE: 'R/B', OBJECT_NAME: 'STARLINK-123' }, 'rocket-body'],
  [{ OBJECT_TYPE: 'ROCKET BODY', OBJECT_NAME: 'ONEWEB-12' }, 'rocket-body'],
  [{ OBJECT_TYPE: 'ROCKET_BODY', OBJECT_NAME: 'QIANFAN-01' }, 'rocket-body'],
  [{ OBJECT_TYPE: 'DEB', OBJECT_NAME: 'STARLINK-12' }, 'debris'],
  [{ OBJECT_NAME: 'STARLINK-1007 R/B(2)' }, 'rocket-body'],
  [{ OBJECT_NAME: 'ONEWEB DISPENSER' }, 'debris'],
  [{ OBJECT_NAME: 'STARLINK-1436 (VisorSat) DEB [TANK]' }, 'debris'],
  [{ OBJECT_NAME: '星链3号火箭碎片' }, 'debris'],
]) {
  const wronglyTagged = {
    name: 'STARLINK-123',
    satelliteGroup: 'internet',
    satelliteCatalog: { objectType: 'payload' },
  };
  assert.deepEqual(metadata(wronglyTagged, { gp: actual }), { ...unknown, objectType: expected });
}

const dfh = JSON.parse(
  readFileSync(new URL('../assets/spacecraft/dfh1-orbit.json', import.meta.url))
);
assert.equal(metadata({}, dfh).launchYear, 1970);
assert.equal(
  metadata({}, dfh).owner,
  'unknown',
  'The name, ephemeris and launch site cannot establish ownership'
);
assert.equal(metadata({ satelliteCatalog: { launchDate: '1999-12-31' } }, dfh).launchYear, 1999);
assert.equal(metadata({ OBJECT_ID: '1970-034A', LAUNCH_DATE: '2024-02-30' }).launchYear, 1970);
assert.equal(metadata({ OBJECT_ID: '1970-034A', LAUNCH_DATE: '2016-02-29' }).launchYear, 2016);
assert.equal(metadata({ INTLDES: '57001B', COUNTRY: 'CIS' }).launchYear, 1957);
assert.equal(metadata({ INTLDES: '00001A', COUNTRY: 'PRC' }).launchYear, 2000);
assert.equal(metadata({ EPOCH: '2024-01-02T18:53Z', OBJECT_ID: '30003' }).launchYear, null);
assert.equal(metadata({ satelliteCatalog: { owner: 'unk' }, COUNTRY: 'ESA' }).owner, 'ESA');
assert.equal(metadata({ owner: 'OrbitWorks' }).owner, 'OrbitWorks');
assert.equal(metadata({ owner: 'prc' }).owner, 'PRC');

const samples = [
  unknown,
  observed,
  metadata(raw),
  metadata({ OWNER: 'PRC', PURPOSE: 'weather', OBJECT_TYPE: 'PAY', LAUNCH_DATE: '1978-01-25' }),
];
const facets = satelliteFacets(samples.values());
assert.deepEqual(facets.decade, [
  { value: 2020, count: 1 },
  { value: 2010, count: 1 },
  { value: 1970, count: 1 },
  { value: 'unknown', count: 1 },
]);
assert.deepEqual(facets.owner, [
  { value: 'PRC', count: 1 },
  { value: 'US', count: 2 },
  { value: 'unknown', count: 1 },
]);
assert.deepEqual(facets.objectType, [
  { value: 'payload', count: 3 },
  { value: 'unknown', count: 1 },
]);
assert.deepEqual(satelliteFacets([]), { objectType: [], purpose: [], owner: [], decade: [] });
const select = (filters) => samples.filter((item) => matchesSatelliteFilters(item, filters));
assert.deepEqual(
  select({
    objectType: 'payload',
    purpose: ['communications', 'earth-observation'],
    owner: 'US',
    decade: ['2010', 2020],
  }),
  [observed, samples[2]]
);
assert.deepEqual(select({ owner: ['US', 'PRC'], decade: 1970 }), [samples[3]]);
assert.deepEqual(select({ objectType: 'payload', purpose: 'unknown' }), []);
assert.deepEqual(select({ decade: 'unknown' }), [unknown]);
assert.deepEqual(select({ owner: [], decade: '', objectType: null }), samples);
assert.deepEqual(select(null), samples);
assert.deepEqual(select({ owner: [null, ''] }), samples);
assert.deepEqual(select({ owner: [null, 'PRC'] }), [samples[3]]);
assert.equal(satelliteFacetLabel('purpose', 'weather'), '气象');
assert.equal(
  satelliteFacetLabel('objectType', 'debris', 'en', (key) => (key === '碎片' ? 'Debris' : key)),
  'Debris'
);
assert.equal(satelliteFacetLabel('decade', 1970), '1970 年代');
assert.equal(satelliteFacetLabel('owner', 'PRC', 'en'), 'China (PRC)');
assert.equal(
  satelliteFacetLabel('owner', 'US', 'fr'),
  new Intl.DisplayNames('fr', { type: 'region' }).of('US') + ' (US)'
);
assert.equal(satelliteFacetLabel('owner', 'CHBZ', 'en'), 'China / Brazil (CHBZ)');
assert.equal(satelliteFacetLabel('owner', 'IM'), '国际移动卫星组织 (IM)');
assert.equal(satelliteFacetLabel('owner', 'OrbitWorks'), 'OrbitWorks');
assert.equal(satelliteFacetLabel('owner', 'XL'), 'XL');
assert.equal(satelliteFacetLabel('owner', 'unknown'), '未知');
console.log('Satellite catalog metadata, filters and facet labels passed.');
