import { hipsOrderForView, hipsPixel, hipsTileUrl } from './sky-detail-math.js';
import { equatorial } from './environment-math.js';

const WIDTH = 120,
  HEIGHT = 80;

export function makeThumbnailProjection(entry, provider, width = WIDTH, height = HEIGHT) {
  const forward = equatorial(entry.raDeg, entry.decDeg);
  const up = equatorial(entry.raDeg, entry.decDeg + 90);
  // North up, east to the left, as on the astronomical chart.
  const right = equatorial(entry.raDeg - 90, 0);
  const tangent = Math.tan((entry.fov * Math.PI) / 360);
  const order = hipsOrderForView(entry.fov, height / 2, provider);
  const samples = new Map();
  for (let y = 0; y < height; y++) {
    const dy = (1 - (2 * y + 1) / height) * tangent;
    for (let x = 0; x < width; x++) {
      const dx = ((2 * x + 1 - width) / height) * tangent;
      const direction = forward.map((p, i) => p + dx * right[i] + dy * up[i]);
      const { pixel, u, v } = hipsPixel(order, direction);
      if (!samples.has(pixel)) samples.set(pixel, []);
      samples.get(pixel).push((y * width + x) * 4, u, v);
    }
  }
  return { order, samples, width, height };
}

async function fetchImage(url, signal) {
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Image HTTP ' + response.status);
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith('image/')) throw new Error('Invalid image');
  return blob;
}

export async function loadGalleryThumbnail(entry, providers, signal) {
  if (entry.work?.thumbnailUrl) return fetchImage(entry.work.thumbnailUrl, signal);
  const provider = providers.find(
    (p) => p.id === (entry.source === 'panstarrs' ? 'panstarrs' : 'dss-color')
  );
  if (!entry.object || !provider?.baseUrl) throw new Error('No preview');
  const { order, samples, width, height } = makeThumbnailProjection(entry, provider);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const output = context.createImageData(width, height);
  const tile = document.createElement('canvas');
  const tileContext = tile.getContext('2d', { willReadFrequently: true });
  for (const [pixel, pixels] of samples) {
    signal.throwIfAborted();
    const url = hipsTileUrl(provider.baseUrl, order, pixel, provider.format);
    const bitmap = await createImageBitmap(await fetchImage(url, signal));
    try {
      signal.throwIfAborted();
      tile.width = bitmap.width;
      tile.height = bitmap.height;
      tileContext.drawImage(bitmap, 0, 0);
      const data = tileContext.getImageData(0, 0, tile.width, tile.height).data;
      for (let i = 0; i < pixels.length; i += 3) {
        const offset = pixels[i],
          x = Math.min(tile.width - 1, Math.floor(pixels[i + 1] * tile.width)),
          y = Math.min(tile.height - 1, Math.floor(pixels[i + 2] * tile.height)),
          at = 4 * (y * tile.width + x);
        output.data[offset] = data[at];
        output.data[offset + 1] = data[at + 1];
        output.data[offset + 2] = data[at + 2];
        output.data[offset + 3] = 255;
      }
    } finally {
      bitmap.close();
    }
  }
  context.putImageData(output, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('Image encoding unavailable');
  return blob;
}
