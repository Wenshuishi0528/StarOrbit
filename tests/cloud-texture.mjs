import assert from 'node:assert/strict';
import {
  CLOUD_PNG,
  cloudChannel,
  cloudDecodeSize,
  decodeCloudBitmap,
  cloudTone,
  githubCloudOpacity,
} from '../src/cloud-texture.js';
assert.equal(cloudChannel({ source: CLOUD_PNG }), 'alpha');
assert.equal(cloudChannel({ channel: 'alpha', source: '导入快照' }), 'alpha');
assert.equal(
  cloudChannel({ source: 'https://clouds.matteason.co.uk/images/8192x4096/clouds.jpg' }),
  'red'
);
assert.deepEqual(cloudDecodeSize(8192, 4096, 'high', 16384), { width: 8192, height: 4096 });
assert.deepEqual(cloudDecodeSize(8192, 4096, 'standard', 16384), { width: 4096, height: 2048 });
assert.deepEqual(cloudDecodeSize(8192, 4096, 'medium', 16384), { width: 2048, height: 1024 });
assert.deepEqual(cloudDecodeSize(8192, 4096, 'high', 4096), { width: 4096, height: 2048 });
assert.deepEqual(cloudDecodeSize(1024, 512, 'high', 16384), { width: 1024, height: 512 });
assert.throws(() => cloudDecodeSize(8192, 2048, 'high', 16384));
console.log({
  cloudAlphaChannel: 'pass',
  legacyJPEG: 'pass',
  deviceLimit: 'pass',
  noUpscaling: 'pass',
});

assert.equal(cloudTone({ provider: 'github', channel: 'alpha' }), 1);
assert.equal(cloudTone({ provider: 'github', channel: 'red', source: '导入快照' }), 1);
assert.equal(cloudTone({ source: CLOUD_PNG }), 1);
assert.equal(cloudTone({ provider: 'satcorps', channel: 'red' }), 0);
assert.equal(cloudTone(null), 0);
assert.equal(cloudTone({ source: 'unknown import' }), 0);
assert.equal(githubCloudOpacity(0), 0);
assert.equal(githubCloudOpacity(1), 1);
assert.ok(githubCloudOpacity(0.2) < 0.02);
assert.ok(githubCloudOpacity(0.9) > 0.8);
let previous = 0;
for (let i = 0; i <= 1000; i++) {
  let next = githubCloudOpacity(i / 1000);
  assert.ok(next >= previous && next - previous < 0.003);
  previous = next;
}
console.log({ githubGreyFloor: 'pass', continuousThinClouds: 'pass', sourceIsolation: 'pass' });

// A historical 8K PNG should reach the decoder with its actual display size on
// the first call. The archived GitHub reconstruction requires the original grid.
const header = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 32, 0, 0, 0, 16, 0,
]);
const png = new Blob([header]);
const calls = [];
globalThis.createImageBitmap = async (blob, options) => {
  calls.push(options);
  return { width: options.resizeWidth || 8192, height: options.resizeHeight || 4096, close() {} };
};
for (const sourceGrid of [false, true]) {
  calls.length = 0;
  const { bitmap, size } = await decodeCloudBitmap(png, 'high', 4096, sourceGrid);
  assert.equal(calls.length, 1);
  assert.deepEqual(size, { width: 4096, height: 2048 });
  assert.equal(bitmap.width, sourceGrid ? 8192 : 4096);
  assert.equal(calls[0].imageOrientation, 'flipY');
}
calls.length = 0;
header[23] = 1;
await assert.rejects(decodeCloudBitmap(new Blob([header]), 'high', 4096, false));
assert.equal(calls.length, 0);
