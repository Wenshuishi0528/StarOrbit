import assert from 'node:assert/strict';
import { createSkyImageIndex, galleryEntry, panstarrsCovers } from '../src/sky-image-index.js';
import { makeThumbnailProjection } from '../src/sky-image-thumbnail.js';
import { hipsDirection } from '../src/sky-detail-math.js';
import { equatorial } from '../src/environment-math.js';

const work = {
  id: 'weic2205a',
  title: 'Cosmic Cliffs',
  titleZh: '宇宙悬崖',
  aliases: ['NGC 3324'],
  providerId: 'jwst-carina-2022',
  center: { raDeg: 159.213, decDeg: -58.62 },
  fieldSizeArcmin: [7.29, 4.22],
};
const pillars = {
  id: 'pillars',
  title: 'Pillars of Creation',
  aliases: ['NGC 6611', 'Eagle Nebula'],
  providerId: 'webb-pillars',
};
const search = createSkyImageIndex([work, pillars]);
assert.equal(search('', 'featured')[0].work, work);
assert.equal(search('NGC 224')[0].object.id, 'M31');
assert.equal(search('宇宙悬崖')[0].work, work);
assert.equal(search('m 31', 'dss')[0].object.id, 'M31');
assert.equal(search('', 'recent').length, 2);
assert.equal(search('', 'dss').length, 12161);
assert.ok(search('', 'panstarrs').length < search('', 'dss').length);
const association = search('NGC3324');
assert.equal(association[0].object.id, 'NGC3324');
assert.equal(association[1].work, work);
assert.equal(search.related(association[0].object)[0].work, work);
assert.equal(search.related(search('鹰状星云')[0].object)[0].work, pillars);
assert.deepEqual(search.related({ id: 'NGC332', aliases: [] }), []);
assert.notEqual(
  galleryEntry(association[0], 'dss').raDeg,
  galleryEntry(association[1], 'recent').raDeg
);
assert.equal(galleryEntry(association[1], 'recent', 'en').title, 'Cosmic Cliffs');
assert.equal(search('NGC 3324', 'panstarrs').length, 0);
assert.equal(panstarrsCovers(association[0].object), false);
const large = galleryEntry(search('M31', 'dss')[0], 'dss');
const small = galleryEntry(search('M51', 'panstarrs')[0], 'panstarrs');
assert.ok(large.fov > small.fov);
assert.equal(small.source, 'panstarrs');
const survey = { minOrder: 0, maxOrder: 9, tileSize: 512 };
for (const entry of [
  large,
  small,
  { ...large, raDeg: 359.99, decDeg: 89.9 },
  { ...small, decDeg: -89.99 },
]) {
  const { samples, width, height, order } = makeThumbnailProjection(entry, survey, 25, 17);
  assert.ok(samples.size > 0 && samples.size <= 6);
  const footprint = new Set();
  for (const [pixel, positions] of samples) {
    for (let i = 0; i < positions.length; i += 3) {
      const at = positions[i] / 4;
      assert.ok(!footprint.has(at));
      footprint.add(at);
      if (at === (width * height - 1) / 2) {
        const v = hipsDirection(order, pixel, positions[i + 1], positions[i + 2]);
        const target = equatorial(entry.raDeg, entry.decDeg);
        assert.ok(Math.hypot(...v.map((n, j) => n - target[j])) < 1e-9);
      }
    }
  }
  assert.equal(footprint.size, width * height);
}
console.log(
  'Sky image gallery: catalogue aliases, colour sources, artwork centres, target framing and HiPS thumbnail projection passed.'
);
