// Rebuild the offline terrain from the real NASA SVS / LRO LOLA raster.
// node scripts/prepare-lunar-terrain.mjs [--download] [--source path/to/ldem_4.tif]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fromFile } from 'geotiff';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4.tif';
const sourceArg = process.argv.indexOf('--source');
const source =
  sourceArg >= 0
    ? path.resolve(process.argv[sourceArg + 1])
    : path.join(root, 'output/lunar-source/ldem_4.tif');
if (process.argv.includes('--download')) {
  fs.mkdirSync(path.dirname(source), { recursive: true });
  execFileSync(
    'curl',
    ['--fail', '--location', '--retry', '2', '--max-time', '60', url, '--output', source],
    { stdio: 'inherit' }
  );
}
if (!fs.existsSync(source))
  throw Error(
    'Source TIFF absent. Run with --download, or pass --source; no synthetic terrain fallback is generated.'
  );
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = fs.readFileSync(source);
if (hash(sourceBytes) !== '330afa2556a86fd05ac6ba2f912f246600fdade35de2a0d90593d50d07b01b65')
  throw Error(
    'NASA source hash changed; inspect the new source before updating the pinned baseline'
  );
const tiff = await fromFile(source),
  image = await tiff.getImage();
if (image.getWidth() !== 1440 || image.getHeight() !== 720)
  throw Error('Unexpected NASA raster dimensions');
const raster = await image.readRasters({ interleave: true });
if (!(raster instanceof Float32Array)) throw Error('Expected floating point elevations in km');
const width = 720,
  height = 360,
  output = Buffer.alloc(width * height * 2);
let min = Infinity,
  max = -Infinity,
  maxQuantizationErrorMeters = 0;
for (let row = 0; row < height; row++)
  for (let col = 0; col < width; col++) {
    let sum = 0;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const value = raster[(row * 2 + dy) * 1440 + col * 2 + dx];
        if (!Number.isFinite(value) || value < -12 || value > 12)
          throw Error('Invalid elevation in source');
        sum += value;
      }
    const mean = sum / 4,
      units = Math.round(mean * 2000);
    if (units < -32768 || units > 32767) throw Error('Half-metre int16 overflow');
    output.writeInt16LE(units, (row * width + col) * 2);
    min = Math.min(min, units * 0.5);
    max = Math.max(max, units * 0.5);
    maxQuantizationErrorMeters = Math.max(
      maxQuantizationErrorMeters,
      Math.abs(units * 0.5 - mean * 1000)
    );
  }
await tiff.close();
const packed = gzipSync(output, { level: 9 }),
  directory = path.join(root, 'assets/moon');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'lola-720x360.i16.gz'), packed);
const manifest = {
  schema: 1,
  id: 'lro-lola-svs4720-2ppd',
  title: 'LRO LOLA lunar topography',
  width,
  height,
  encoding: 'gzip-int16-le',
  scaleMeters: 0.5,
  offsetMeters: 0,
  referenceRadiusKm: 1737.4,
  projection: 'equirectangular',
  longitude: 'east-positive; -180 at left edge; 0 at centre',
  latitude: '90N at top edge;90S at bottom edge',
  registration: 'pixel-centres',
  file: 'assets/moon/lola-720x360.i16.gz',
  bytes: packed.length,
  sha256: hash(packed),
  unpackedBytes: output.length,
  minMeters: min,
  maxMeters: max,
  processing:
    '2x2 arithmetic-mean downsample from 1440x720 float32 km to 720x360 signed half-metre int16; north-to-south rows unchanged',
  maxQuantizationErrorMeters,
  source: {
    title: 'NASA SVS CGI Moon Kit / LRO LOLA, spring 2019 gridded product',
    url,
    page: 'https://svs.gsfc.nasa.gov/4720/',
    sha256: hash(sourceBytes),
    bytes: sourceBytes.length,
    width: 1440,
    height: 720,
    units: 'float32 kilometres relative to 1737.4 km radius',
    credit: "NASA's Scientific Visualization Studio / LRO LOLA",
    usage: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
  },
  color: {
    file: 'assets/moon/lroc-color-2k.jpg',
    sha256: hash(fs.readFileSync(path.join(directory, 'lroc-color-2k.jpg'))),
    note: 'Existing repository LROC visualization mosaic; no albedo image regeneration',
  },
};
fs.writeFileSync(
  path.join(directory, 'terrain-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);
console.log(
  JSON.stringify({
    sourceSHA256: manifest.source.sha256,
    runtimeBytes: packed.length,
    minMeters: min,
    maxMeters: max,
    maxQuantizationErrorMeters,
  })
);
