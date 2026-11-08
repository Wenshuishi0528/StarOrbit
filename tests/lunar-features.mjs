import assert from 'node:assert/strict';
import { LUNAR_FEATURES, lunarFeature, lunarFeatureText } from '../src/lunar-features.js';

// Catch catalogue corruption, missing localizations, accidental Mars namesakes,
// and longitude-sign regressions before markers are handed to the lunar renderer.
assert.ok(LUNAR_FEATURES.length >= 12 && LUNAR_FEATURES.length <= 18);
assert.equal(new Set(LUNAR_FEATURES.map((f) => f.id)).size, LUNAR_FEATURES.length);
assert.equal(new Set(LUNAR_FEATURES.map((f) => f.source.url)).size, LUNAR_FEATURES.length);
for (const feature of LUNAR_FEATURES) {
  assert.match(feature.id, /^[a-z]+$/);
  assert.ok(['mare', 'crater'].includes(feature.kind));
  assert.ok(Number.isFinite(feature.latitude) && Math.abs(feature.latitude) <= 90);
  assert.ok(Number.isFinite(feature.longitude) && Math.abs(feature.longitude) <= 180);
  assert.ok(Number.isFinite(feature.diameterKm) && feature.diameterKm > 0);
  assert.match(feature.source.url, /^https:\/\/planetarynames\.wr\.usgs\.gov\/Feature\/\d+$/);
  assert.equal(lunarFeature(feature.id), feature);
  for (const language of ['zh', 'en', 'fr', 'ru']) {
    const text = lunarFeatureText(feature, language);
    assert.ok(
      typeof text.name === 'string' && text.name.length > 0,
      `${feature.id}: ${language} name`
    );
    assert.ok(
      typeof text.hint === 'string' && text.hint.length > 0,
      `${feature.id}: ${language} hint`
    );
  }
  assert.deepEqual(lunarFeatureText(feature, 'unknown'), lunarFeatureText(feature, 'en'));
}
assert.equal(lunarFeature('unknown'), null);
assert.deepEqual(lunarFeatureText(null), { name: '', hint: '' });
// Official lunar Copernicus is Feature 1296; Feature 1297 is on Mars.
assert.equal(lunarFeature('copernicus').source.url.split('/').at(-1), '1296');
assert.ok(lunarFeature('copernicus').latitude > 0 && lunarFeature('copernicus').longitude < 0);
assert.ok(lunarFeature('tycho').latitude < 0 && lunarFeature('tycho').longitude < 0);
assert.ok(lunarFeature('crisium').longitude > 0 && lunarFeature('crisium').longitude < 90);
const farSide = LUNAR_FEATURES.filter((f) => Math.abs(f.longitude) > 90);
assert.deepEqual(farSide.map((f) => f.id).sort(), ['moscoviense', 'tsiolkovskiy']);
assert.ok(farSide.every((f) => f.longitude > 0));
console.log(
  `Lunar features: ${LUNAR_FEATURES.length} official locations, 4 languages, source and hemisphere checks passed.`
);
