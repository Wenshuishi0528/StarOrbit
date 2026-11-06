// Matt Eason's Live Cloud Maps mirrors the outer eighth at each pole.
// Keep the global projection, reserving alpha for the usable latitude band.
import { CLOUD_JPEG, githubCloudOpacity, LIVE_CLOUD_PROCESSING } from './cloud-texture.js';
import { t } from './i18n.js';
import { readableBlobMatches } from './resource-fetch.js';

export const LIVE_CLOUD_ATTRIBUTION = 'Contains modified EUMETSAT data';
export const LIVE_CLOUD_MAX_BYTES = 50_000_000;
const TARGET_BYTES = 30_000_000;
const NATIVE_WIDTH = 8192;
const LIMIT = 67.5,
  FEATHER = 1.5;
const tone = Uint8Array.from({ length: 256 }, (_, i) =>
  Math.round(255 * githubCloudOpacity(i / 255))
);

function checkCancelled(signal) {
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
}

async function verifyJpeg(blob) {
  // Read the declared size before asking the browser to allocate a decoded bitmap.
  // This feed emits baseline JPEG; accept progressive JPEG of the same size too.
  const bytes = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer());
  if (bytes[0] !== 255 || bytes[1] !== 216) throw Error(t('云图格式无效'));
  for (let pos = 2; pos + 4 < bytes.length && bytes[pos] === 255; ) {
    while (bytes[pos] === 255) pos++;
    const marker = bytes[pos++];
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      const height = bytes[pos + 3] * 256 + bytes[pos + 4],
        width = bytes[pos + 5] * 256 + bytes[pos + 6];
      if (width !== NATIVE_WIDTH || height !== NATIVE_WIDTH / 2) throw Error(t('云图尺寸无效'));
      return;
    }
    const length = bytes[pos] * 256 + bytes[pos + 1];
    if (marker === 0xda || marker === 0xd9 || length < 2) break;
    pos += length;
  }
  throw Error(t('云图格式无效'));
}

function inspectMidLatitudes(bitmap) {
  const canvas = new OffscreenCanvas(256, 48),
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(
      bitmap,
      0,
      bitmap.height / 8,
      bitmap.width,
      (bitmap.height * 3) / 4,
      0,
      0,
      canvas.width,
      canvas.height
    );
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let low = 255,
      high = 0,
      coloured = 0;
    const counts = new Uint32Array(256);
    for (let i = 0; i < pixels.length; i += 4) {
      const value = pixels[i];
      low = Math.min(low, value);
      high = Math.max(high, value);
      counts[value]++;
      if (Math.abs(value - pixels[i + 1]) > 5 || Math.abs(value - pixels[i + 2]) > 5) coloured++;
    }
    const n = pixels.length / 4;
    if (high - low < 8 || Math.max(...counts) > n * 0.995 || coloured > n * 0.01)
      throw Error(t('图源返回空白或异常的灰度云图，未保存'));
  } finally {
    canvas.width = canvas.height = 1;
  }
}

function validity(y, height) {
  const latitude = Math.abs(90 - ((y + 0.5) * 180) / height);
  const f = Math.min(1, Math.max(0, (LIMIT - latitude) / FEATHER));
  return Math.round(255 * f * f * (3 - 2 * f));
}

// Native deflate encodes 64-row strips. A normal 8K RGBA canvas alone needs
// 128 MiB and exceeds some browsers' canvas area limit. PNG colour type 4
// stores just our grayscale display value and the separate coverage weight.
function uint32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n;
});
function pngChunk(type, data) {
  const name = new TextEncoder().encode(type);
  let crc = 0xffffffff;
  for (const bytes of [name, data])
    for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return [uint32(data.length), name, data, uint32(crc ^ 0xffffffff)];
}
async function encodeCropped(bitmap, width, signal, onProgress) {
  const height = width / 2,
    scale = bitmap.width / width,
    stride = 1 + 2 * width,
    strip = 64;
  const canvas = new OffscreenCanvas(width, strip),
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  const zip = new CompressionStream('deflate'),
    writer = zip.writable.getWriter();
  const compressed = new Response(zip.readable).arrayBuffer();
  compressed.catch(() => {}); // Abort rejects both sides of the compression stream.
  let validPixels = 0;
  try {
    for (let y = 0; y < height; y += strip) {
      checkCancelled(signal);
      const rows = Math.min(strip, height - y),
        packed = new Uint8Array(stride * rows);
      if (y + rows > height / 8 && y < (height * 7) / 8) {
        ctx.drawImage(bitmap, 0, y * scale, bitmap.width, rows * scale, 0, 0, width, rows);
        const rgba = ctx.getImageData(0, 0, width, rows).data;
        for (let j = 0; j < rows; j++) {
          const alpha = validity(y + j, height);
          if (!alpha) continue;
          validPixels += width;
          const row = j * stride;
          packed[row] = 1; // PNG Sub: encode differences from the pixel to the left.
          packed[row + 2] = alpha;
          let left = 0;
          for (let x = 0; x < width; x++) {
            const value = tone[rgba[(j * width + x) * 4]];
            packed[row + 1 + 2 * x] = value - left;
            left = value;
          }
        }
      }
      await writer.write(packed);
      if (y % (strip * 8) === 0)
        onProgress(t('正在裁切极区并压缩云图… {pct}%', { pct: Math.floor((y / height) * 100) }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await writer.close();
    const idat = new Uint8Array(await compressed);
    checkCancelled(signal);
    const ihdr = new Uint8Array(13);
    ihdr.set(uint32(width));
    ihdr.set(uint32(height), 4);
    ihdr.set([8, 4], 8);
    const blob = new Blob(
      [
        Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
        ...pngChunk('IHDR', ihdr),
        ...pngChunk('IDAT', idat),
        ...pngChunk('IEND', new Uint8Array()),
      ],
      { type: 'image/png' }
    );
    return { blob, validPixels };
  } catch (error) {
    await writer.abort(error).catch(() => {});
    throw error;
  } finally {
    canvas.width = canvas.height = 1;
    writer.releaseLock();
  }
}

export async function downloadLiveCloud(weather, { signal, onProgress = () => {} } = {}) {
  checkCancelled(signal);
  let nextNotice = 0;
  const response = await weather.fetch(CLOUD_JPEG, LIVE_CLOUD_MAX_BYTES, {
    signal,
    timeout: 90000,
    onProgress: ({ received, total }) => {
      if (received < nextNotice && received !== total) return;
      nextNotice = received + 500_000;
      onProgress(t('正在下载 GitHub 云图… {mb} MB', { mb: (received / 1e6).toFixed(1) }));
    },
  });
  checkCancelled(signal);
  const sourceSha256 = await weather.checkedCloudHash(response.blob);
  checkCancelled(signal);
  const saved = weather.items.find(
    (r) =>
      r.kind === 'cloud' &&
      r.provider === 'github' &&
      r.processing === LIVE_CLOUD_PROCESSING &&
      r.channel === 'validity' &&
      !r.integrityFailed &&
      r.sourceSha256 === sourceSha256 &&
      r.blob &&
      r.blob.size <= LIVE_CLOUD_MAX_BYTES
  );
  if (saved && (await readableBlobMatches(saved.blob, saved.sha256))) {
    checkCancelled(signal);
    return saved;
  }
  await verifyJpeg(response.blob);
  checkCancelled(signal);
  const bitmap = await createImageBitmap(response.blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  let result,
    width = NATIVE_WIDTH;
  try {
    checkCancelled(signal);
    if (bitmap.width !== NATIVE_WIDTH || bitmap.height !== NATIVE_WIDTH / 2)
      throw Error(t('云图尺寸无效'));
    inspectMidLatitudes(bitmap);
    result = await encodeCropped(bitmap, width, signal, onProgress);
    if (result.blob.size > TARGET_BYTES) {
      width /= 2;
      result = await encodeCropped(bitmap, width, signal, onProgress);
    }
  } finally {
    bitmap.close();
  }
  if (result.blob.size > LIVE_CLOUD_MAX_BYTES) throw Error(t('数据超过大小限制'));
  const digest = await weather.checkedCloudHash(result.blob);
  checkCancelled(signal);
  const record = await weather.store('cloud', result.blob, {
    provider: 'github',
    processing: LIVE_CLOUD_PROCESSING,
    channel: 'validity',
    time: null,
    release: 'Live Cloud Maps',
    resolution: width + '×' + width / 2,
    nativeResolution: '8192×4096',
    latitudeLimit: LIMIT,
    featherDegrees: FEATHER,
    source: CLOUD_JPEG,
    sourceSha256,
    attribution: LIVE_CLOUD_ATTRIBUTION,
    archiveKey: LIVE_CLOUD_PROCESSING,
    contentHash: digest,
    integrityFailed: false,
    manualValidation: { schema: 1, sha256: digest, validPixels: result.validPixels },
  });
  weather.pendingRecords.delete(record.id);
  return record;
}
