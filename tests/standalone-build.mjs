import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const file = process.argv[2] || 'StarOrbit.html';
assert(fs.statSync(file).size <= 900e6, 'standalone distribution budget');
const manifest = JSON.parse(fs.readFileSync('assets/earth/night-2025-500m/manifest.json', 'utf8'));
const earthManifest = JSON.parse(fs.readFileSync('assets/earth/observation/manifest.json','utf8'));
const earthFiles = new Set([...Object.values(earthManifest.layers).map(r=>r.file),earthManifest.layers.earthElevation.heightFile,earthManifest.minerals.file]);
const expected = new Set(
  Object.keys(manifest.files).filter((name) => /^\d+-\d+\.avif$/.test(name))
);
let buffer = '',
  tag = null,
  blocks = 0,
  last = false,
  maximum = 0,
  nightCount = 0,
  nightBases = 0,
  format = false,
  scripts = 0;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function script(attributes, body) {
  scripts++;
  if (/\bid="environmentAssets"/.test(attributes)) {
    const value = JSON.parse(body);
    assert.equal(value.format, 'starorbit-embedded-assets-v1');
    format = true;
  }
  if (!/\bdata-asset-owner="environmentAssets"/.test(attributes)) return;
  assert(!last, 'no blocks may follow the final environment block');
  maximum = Math.max(maximum, Buffer.byteLength(body));
  assert(
    maximum < 64 * 1024 * 1024 + 4096,
    'every parsed block fits the bounded browser string budget'
  );
  const payload = JSON.parse(body);
  blocks++;
  last = payload.last;
  for (const [path, value] of payload.patches) {
    if (path[0] === 'earthObservation' && typeof value === 'string' && value.startsWith('data:')) {
      const record = path[1] === 'layers' ? earthManifest.layers[path[2]] : earthManifest.minerals;
      const file = path.at(-1) === 'heightUrl' ? record.heightFile : record.file;
      assert(earthFiles.delete(file), file);
      assert.equal(sha(Buffer.from(value.slice(value.indexOf(',')+1),'base64')),sha(fs.readFileSync(file)));
    }
    if (
      path[0] !== 'nightSources' ||
      path[1] !== '2025-500m' ||
      path.length !== 4 ||
      typeof value !== 'string'
    )
      continue;
    const name = path[3] + '.avif';
    assert(value.startsWith('data:image/avif;base64,'));
    const bytes = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64');
    assert.equal(
      sha(bytes),
      sha(fs.readFileSync('assets/earth/night-2025-500m/' + name)),
      name + ' preserves source resolution and bytes'
    );
    if (path[2] === 'tiles') {
      assert(expected.delete(name), name);
      nightCount++;
    } else if (path[2] === 'base') nightBases++;
  }
}
for await (const chunk of fs.createReadStream(file, {
  encoding: 'utf8',
  highWaterMark: 1024 * 1024,
})) {
  buffer += chunk;
  while (true) {
    if (tag === null) {
      const match = /<script\b([^>]*)>/.exec(buffer);
      if (!match) {
        buffer = buffer.slice(-1024);
        break;
      }
      tag = match[1];
      buffer = buffer.slice(match.index + match[0].length);
    }
    const end = buffer.indexOf('</script>');
    if (end < 0) break;
    script(tag, buffer.slice(0, end));
    buffer = buffer.slice(end + 9);
    tag = null;
  }
  assert(
    buffer.length < 80 * 1024 * 1024,
    'validator never materializes the complete HTML or environment JSON'
  );
}
assert.equal(tag, null, 'all script tags terminate');
assert(format && blocks > 1 && last);
assert.equal(expected.size, 0);
assert.equal(nightBases, 4);
assert.equal(earthFiles.size,0);
console.log(
  JSON.stringify({
    file,
    bytes: fs.statSync(file).size,
    inertEnvironmentBlocks: blocks,
    maximumBlockBytes: maximum,
    nativeNightTiles: nightCount,
    nativeNightBases: nightBases,
    scripts,
  })
);
