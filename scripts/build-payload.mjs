import fs from 'node:fs';

export const EMBEDDED_ASSET_FORMAT = 'starorbit-embedded-assets-v1';
const escapeScript = (text) => text.replaceAll('<', '\\u003c');

/** JSON.stringify semantics, without allocating the complete JSON as one string. */
export function* jsonChunks(value, ancestors = new Set(), arrayElement = false) {
  if (value && typeof value.toJSON === 'function') value = value.toJSON();
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded !== undefined) yield escapeScript(encoded);
    else if (arrayElement) yield 'null';
    return;
  }
  if (ancestors.has(value)) throw new TypeError('Converting circular structure to JSON');
  ancestors.add(value);
  try {
    const array = Array.isArray(value);
    yield array ? '[' : '{';
    let comma = false;
    for (const key of array
      ? Array.from({ length: value.length }, (_, i) => i)
      : Object.keys(value)) {
      let item = value[key];
      if (item && typeof item.toJSON === 'function') item = item.toJSON();
      if (!array && (item === undefined || typeof item === 'function' || typeof item === 'symbol'))
        continue;
      if (comma) yield ',';
      comma = true;
      if (!array) {
        yield escapeScript(JSON.stringify(key));
        yield ':';
      }
      yield* jsonChunks(item, ancestors, array);
    }
    yield array ? ']' : '}';
  } finally {
    ancestors.delete(value);
  }
}

// Container records preserve arrays/objects; primitive records contain original
// asset strings. Each browser JSON.parse stays bounded independently of total size.
function* assetRecords(value, route = [], ancestors = new Set(), arrayElement = false) {
  if (value && typeof value.toJSON === 'function') value = value.toJSON();
  if (value === null || typeof value !== 'object') {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
      if (!arrayElement) return;
      value = null;
    }
    yield escapeScript(JSON.stringify([route, value]));
    return;
  }
  if (ancestors.has(value)) throw new TypeError('Converting circular structure to JSON');
  ancestors.add(value);
  try {
    const array = Array.isArray(value);
    yield escapeScript(JSON.stringify([route, array ? [] : {}]));
    for (const key of array
      ? Array.from({ length: value.length }, (_, i) => i)
      : Object.keys(value))
      yield* assetRecords(value[key], [...route, key], ancestors, array);
  } finally {
    ancestors.delete(value);
  }
}

export function* embeddedAssetScripts(
  value,
  id = 'environmentAssets',
  { chunkBytes = 8 * 1024 * 1024 } = {}
) {
  if (!/^[a-zA-Z][\w-]*$/.test(id)) throw new Error('Invalid embedded asset id');
  if (!(chunkBytes >= 256)) throw new Error('Embedded chunk budget is too small');
  yield `<script id="${id}" type="application/json">`;
  yield JSON.stringify({ format: EMBEDDED_ASSET_FORMAT, owner: id });
  yield '</script>\n';
  let records = [],
    bytes = 0;
  function* emit(last) {
    yield `<script type="application/json" data-asset-owner="${id}">{"patches":[`;
    yield records.join(',');
    yield `],"last":${last}}</script>\n`;
  }
  for (const record of assetRecords(value)) {
    const size = Buffer.byteLength(record);
    if (size > 64 * 1024 * 1024)
      throw new Error('One embedded asset exceeds the 64 MiB string budget');
    if (records.length && bytes + size + 1 > chunkBytes) {
      yield* emit(false);
      records = [];
      bytes = 0;
    }
    records.push(record);
    bytes += size + 1;
  }
  yield* emit(true);
}

/** Atomic output; only the small HTML template is scanned/replaced in memory. */
export function writeTemplatePayloads(filename, template, payloads, { maxBytes = 1200e6 } = {}) {
  const keys = Object.keys(payloads);
  const expression = new RegExp(
    keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'g'
  );
  const pending = filename + `.building-${process.pid}`;
  let fd = null,
    bytes = 0;
  const write = (piece) => {
    const buffer = Buffer.isBuffer(piece) ? piece : Buffer.from(piece);
    bytes += buffer.byteLength;
    if (bytes > maxBytes)
      throw new Error(
        `Standalone app exceeds the ${Math.round(maxBytes / 1e6)} MB distribution budget`
      );
    let offset = 0;
    while (offset < buffer.length)
      offset += fs.writeSync(fd, buffer, offset, buffer.length - offset);
  };
  try {
    fd = fs.openSync(pending, 'w');
    let previous = 0;
    for (const match of template.matchAll(expression)) {
      write(template.slice(previous, match.index));
      const producer = payloads[match[0]],
        value = typeof producer === 'function' ? producer() : producer;
      if (typeof value === 'string' || Buffer.isBuffer(value)) write(value);
      else for (const piece of value) write(piece);
      previous = match.index + match[0].length;
    }
    write(template.slice(previous));
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(pending, filename);
    return bytes;
  } catch (error) {
    if (fd !== null) fs.closeSync(fd);
    fs.rmSync(pending, { force: true });
    throw error;
  }
}
