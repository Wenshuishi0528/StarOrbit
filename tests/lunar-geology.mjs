import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  LUNAR_GEOLOGY,
  GEOLOGY_VIEWS,
  GEOLOGY_GUIDE,
  geologyText,
  geologyView,
} from '../src/lunar-geology.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root));
const manifest = JSON.parse(await read('assets/moon/geology/manifest.json'));
const evidence = JSON.parse(await read('assets/moon/geology/source-record.json'));
assert.equal(manifest.id, LUNAR_GEOLOGY.id);
assert.equal(manifest.doi, LUNAR_GEOLOGY.doi);
assert.equal(evidence['@id'], 'https://doi.org/' + LUNAR_GEOLOGY.doi);
assert.equal(evidence.conditionsOfAccess, 'PUBLIC');
assert.equal(evidence.license, LUNAR_GEOLOGY.licenseUrl);
assert.equal(evidence.size.value, manifest.original.bytes);
assert.equal(manifest.original.bytes, 206245173);
assert.equal(
  manifest.original.sha256,
  'dfc7efe5ec59aecd7b345f322fefb71ac918a89eb7b61f1bfa6f41728b547dd7'
);
assert.match(evidence.datePublished, /^2022-/);
assert.match(evidence.description, /non-commercial/);
assert.equal(LUNAR_GEOLOGY.globeTexture, true);
assert.equal(LUNAR_GEOLOGY.derivedGeoreferencedRaster, true);
assert.equal(manifest.projection.georeferencedRaster, false);
assert.equal(manifest.projection.main, 'Mollweide');
assert.equal(new Set(GEOLOGY_VIEWS.map((view) => view.id)).size, 4);
const registration = JSON.parse(await read(LUNAR_GEOLOGY.registrationAsset));
assert.equal(registration.centralMeridianDegrees, 0);
assert.deepEqual(registration.outputSize, [4096, 2048]);
assert.equal(registration.alphaNoData, 0);
assert.ok(registration.graticuleControls.every((control) => control.residualPixels < 3));
assert.match(registration.longitudeConvention, /-180 left, 0 centre, \+180 right/);

function dimensions(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  for (let pos = 12; pos + 8 <= bytes.length; ) {
    const kind = bytes.toString('ascii', pos, pos + 4),
      size = bytes.readUInt32LE(pos + 4),
      p = pos + 8;
    assert.ok(p + size <= bytes.length, 'WebP chunk must be within the asset');
    if (kind === 'VP8 ') {
      assert.equal(bytes.toString('hex', p + 3, p + 6), '9d012a');
      return [bytes.readUInt16LE(p + 6) & 0x3fff, bytes.readUInt16LE(p + 8) & 0x3fff];
    }
    if (kind === 'VP8X') return [bytes.readUIntLE(p + 4, 3) + 1, bytes.readUIntLE(p + 7, 3) + 1];
    pos = p + size + (size % 2);
  }
  throw Error('Supported WebP image header not found');
}

let totalBytes = 0;
const globe = manifest.outputs.find((entry) => entry.id === 'globe');
assert.ok(globe.hasAlphaNoData);
const globeBytes = await read(globe.file);
assert.equal(createHash('sha256').update(globeBytes).digest('hex'), globe.sha256);
assert.deepEqual(dimensions(globeBytes), [4096, 2048]);
assert.ok(globeBytes.length < 8 * 1024 * 1024);
for (const view of GEOLOGY_VIEWS) {
  const item = manifest.outputs.find((entry) => entry.id === view.id);
  assert.ok(item, 'Every view must have a manifested asset');
  assert.equal(view.asset, item.file);
  const bytes = await read(view.asset);
  assert.equal(bytes.length, item.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
  assert.deepEqual(dimensions(bytes), [view.width, view.height]);
  assert.deepEqual([item.width, item.height], [view.width, view.height]);
  if (['poster', 'overview'].includes(view.id)) {
    assert.equal(item.cropNormalized, null, 'Full original layout must not be cropped');
    assert.ok(
      Math.abs(view.width / view.height - manifest.original.width / manifest.original.height) <
        0.002
    );
  } else {
    assert.equal(item.cropNormalized.length, 4);
    const [left, top, right, bottom] = item.cropNormalized;
    assert.ok(left >= 0 && top >= 0 && right <= 1 && bottom <= 1 && right > left && bottom > top);
    assert.ok(
      Math.abs(
        view.width / view.height -
          ((right - left) * manifest.original.width) / ((bottom - top) * manifest.original.height)
      ) < 0.002
    );
  }
  for (const language of ['zh', 'en', 'ru', 'fr']) {
    assert.ok(geologyText(view.title, language).trim());
    assert.ok(geologyText(view.description, language).trim());
  }
  totalBytes += bytes.length;
}
assert.ok(
  totalBytes < 10 * 1024 * 1024,
  'Bundle only the prepared views, not the 196 MiB source poster'
);
for (const item of GEOLOGY_GUIDE)
  for (const language of ['zh', 'en', 'ru', 'fr']) {
    assert.ok(item.title[language]?.trim());
    assert.ok(item.body[language]?.trim());
  }
assert.equal(geologyView('missing'), GEOLOGY_VIEWS[0]);
assert.equal(geologyText({ zh: '中文', en: 'English' }, 'zh-CN'), '中文');
assert.equal(geologyText({ zh: '中文', en: 'English' }, 'unknown'), 'English');
console.log(
  `Lunar geology: public source identity/license evidence, original layout, four decoded image dimensions/hashes, and four-language interpretation passed (${(totalBytes / 1048576).toFixed(2)} MiB).`
);
