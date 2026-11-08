import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('src/xuntian-distance.js', root))],
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
});
const { stellarDistance, crosshairDistanceText: format } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);
const catalog = JSON.parse(readFileSync(new URL('assets/stellar-distances/catalog.json', root)));
const original = readFileSync(new URL('assets/stellar-distances/source/I-311-hip2.tsv', root));
assert.equal(createHash('sha256').update(original).digest('hex'), catalog.sourceSha256);
const sourceRows = new Map(original.toString().split('\n').filter(l => /^\s*\d+\t/.test(l)).map(l => l.split('\t').map(Number)).map(([id, ...v]) => [id, v]));
assert.equal(sourceRows.size, 117955);
const existing = new Set([
  ...JSON.parse(readFileSync(new URL('assets/stars.json', root))),
  ...JSON.parse(readFileSync(new URL('assets/chinese-sky/catalog.json', root))).additionalStars,
].map(row => row[0]));
assert.equal(new Set(catalog.rows.map(row => row[0])).size, catalog.rows.length);
assert.equal(catalog.rows.length, 19286);
for (const [hip, parallax, error] of catalog.rows) {
  assert(existing.has(hip));
  assert.deepEqual([parallax, error], sourceRows.get(hip));
  assert(parallax > 0 && error > 0 && error / parallax <= .1);
}
const vega = stellarDistance('hip:91262');
assert(vega.distanceLightYears > 24 && vega.distanceLightYears < 26);
assert.match(format({ kind: 'star', ...vega }), /光年/);
for (const id of ['hip:4714', 'hip:115481', 'hip:999999', 'tyc:91262', 'gaia:91262', null])
  assert.equal(stellarDistance(id), null, 'Unknown/low-SNR/other catalogue identities do not get invented distances');
assert.equal(format({ kind: 'star' }), '距离：暂无可靠数据');
assert.equal(format({ kind: 'deep-sky', distanceKm: 42 }), '距离：暂无可靠数据');
assert.equal(format({ kind: 'star', distanceLightYears: Infinity }), '距离：暂无可靠数据');
assert.equal(format({ kind: 'station', distanceKm: .03 }), '距准星落点 30.0 m');
assert.equal(format({ kind: 'earth', distanceKm: 405 }), '距准星落点 405 km');
assert.equal(format({ kind: 'solar', distanceKm: 384400 }), '距天体中心 384,400 km');
assert.match(format({ kind: 'solar', distanceKm: 149597870.7 }), /1\.000 AU/);
for (const hit of [null, { kind: 'sky' }, { kind: 'unavailable' }, { kind: 'solar', distanceKm: NaN }, { kind: 'earth', distanceKm: -1 }])
  assert.equal(format(hit), '');
console.log('Distance provenance, all 19286 high-S/N parallaxes, stable physical identity, known/unknown distances, unit boundaries and surface/centre distinction passed.');
