import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  jsonChunks,
  embeddedAssetScripts,
  writeTemplatePayloads,
} from '../scripts/build-payload.mjs';
import { readEmbeddedAssets } from '../src/embedded-assets.js';
const value = {
  plain: 'hello',
  escaped: '</SCRIPT><img src=x> & 中文',
  numbers: [1, NaN, Infinity, null, undefined],
  skip: undefined,
  date: new Date('2026-11-08T00:00:00Z'),
  nested: {
    tiles: Array.from({ length: 12 }, (_, i) => ({
      id: i,
      data: 'data:image/avif;base64,' + 'A'.repeat(1200),
    })),
  },
  ...JSON.parse('{"__proto__":{"test":"own property"}}'),
};
const expected = JSON.parse(JSON.stringify(value));
assert.deepEqual(JSON.parse([...jsonChunks(value)].join('')), expected);
assert(![...jsonChunks(value)].join('').includes('</SCRIPT>'));
const output = [...embeddedAssetScripts(value, 'environmentAssets', { chunkBytes: 2048 })].join('');
const tags = [...output.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
assert(tags.length > 6, 'large asset data is partitioned into separate inert JSON nodes');
assert(tags.every((m) => m[1].includes('type="application/json"')));
const blocks = tags.slice(1).map((m) => ({
  textContent: m[2],
  removed: false,
  remove() {
    this.removed = true;
  },
}));
const node = {
  id: 'environmentAssets',
  textContent: tags[0][2],
  ownerDocument: { querySelectorAll: () => blocks },
};
const result = readEmbeddedAssets(node);
assert.deepEqual(result, expected);
assert.equal(Object.getPrototypeOf(result), Object.prototype);
assert(Object.hasOwn(result, '__proto__'));
assert(
  blocks.every((b) => b.removed),
  'parsed block nodes are released'
);
assert.deepEqual(
  readEmbeddedAssets({ textContent: JSON.stringify(expected) }),
  expected,
  'legacy and split JSON are unchanged'
);
const incomplete = { ...node, ownerDocument: { querySelectorAll: () => blocks.slice(0, -1) } };
assert.throws(() => readEmbeddedAssets(incomplete), /incomplete/);
const cyclic = {};
cyclic.self = cyclic;
assert.throws(() => [...jsonChunks(cyclic)], /circular/);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starorbit-payload-'));
try {
  const file = path.join(dir, 'index.html');
  const length = writeTemplatePayloads(file, 'before __DATA__ after __OTHER__', {
    __DATA__: () => jsonChunks(value),
    __OTHER__: 'literal $& text',
  });
  const stored = fs.readFileSync(file, 'utf8');
  assert.equal(Buffer.byteLength(stored), length);
  assert(stored.startsWith('before {') && stored.endsWith(' after literal $& text'));
  assert.throws(
    () => writeTemplatePayloads(file, '__DATA__', { __DATA__: 'too large' }, { maxBytes: 2 }),
    /budget/
  );
  assert.equal(fs.readFileSync(file, 'utf8'), stored, 'failed builds preserve previous output');
  assert.deepEqual(fs.readdirSync(dir), ['index.html'], 'failed temporary files are removed');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(
  'Build payload: streamed JSON, bounded inert environment blocks, legacy decoding, array/own-key semantics, script escaping and atomic budget rejection passed'
);
