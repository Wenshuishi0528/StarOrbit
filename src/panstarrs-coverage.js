import moc from '../assets/sky-detail/panstarrs-moc.json' with { type: 'json' };
import { hipsDirection, hipsMaxPixelRadius, hipsPixel, hipsViewPlanes } from './sky-detail-math.js';

// Sorted half-open NESTED intervals at the MOC's native order. The compact
// footprint is shared by all views and stays available without the image host.
const ranges = new Uint32Array(moc.intervals * 2);
const packed = atob(moc.data);
let byte = 0,
  end = 0;
for (let i = 0; i < ranges.length; i++) {
  let value = 0,
    factor = 1,
    digit;
  do {
    digit = packed.charCodeAt(byte++);
    value += (digit & 127) * factor;
    factor *= 128;
  } while (digit & 128);
  end += value;
  ranges[i] = end;
}
const radii = Array.from(
  { length: moc.order + 1 },
  (_, level) => Math.sin(hipsMaxPixelRadius(level)) + 2e-14
);

function firstInterval(start) {
  let lo = 0,
    hi = moc.intervals;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ranges[mid * 2 + 1] <= start) lo = mid + 1;
    else hi = mid;
  }
  return lo * 2;
}

export function panstarrsTileCoverage(order, pixel) {
  const span = 4 ** (moc.order - order);
  const start = pixel * span,
    stop = start + span,
    i = firstInterval(start);
  if (i === ranges.length || ranges[i] >= stop) return 'none';
  return ranges[i] <= start && ranges[i + 1] >= stop ? 'full' : 'partial';
}
export function panstarrsDirectionCovered(direction) {
  return panstarrsTileCoverage(moc.order, hipsPixel(moc.order, direction).pixel) === 'full';
}

// Find whether the actual viewport contains the opposite state from its
// centre. Homogeneous MOC cells and offscreen cells prune whole subtrees.
export function panstarrsViewCoverage(view) {
  const planes = hipsViewPlanes(view);
  const centre = panstarrsDirectionCovered(view.forward) ? 'full' : 'none';
  function opposite(order, pixel) {
    const coverage = panstarrsTileCoverage(order, pixel);
    if (coverage === centre) return false;
    const [x, y, z] = hipsDirection(order, pixel);
    let margin = Infinity;
    for (const axis of planes) margin = Math.min(margin, x * axis[0] + y * axis[1] + z * axis[2]);
    if (margin < -radii[order]) return false;
    if (order === moc.order || margin >= radii[order] || (margin >= 0 && coverage !== 'partial'))
      return true;
    for (let child = 0; child < 4; child++) if (opposite(order + 1, pixel * 4 + child)) return true;
    return false;
  }
  for (let face = 0; face < 12; face++) if (opposite(0, face)) return 'partial';
  return centre;
}

// Write alpha at the image's own sampling. In image UV, nested child 1 is
// bottom-left and 2 is top-right. Subpixel footprint cells are area averaged.
export function maskPanStarrsPixels(rgba, width, order, pixel) {
  function paint(level, cell, left, top, size) {
    const coverage = panstarrsTileCoverage(level, cell);
    if (coverage === 'full') return;
    if (coverage === 'partial' && size > 1) {
      const half = size / 2;
      for (let child = 0; child < 4; child++)
        paint(
          level + 1,
          cell * 4 + child,
          left + (child >> 1) * half,
          top + (child & 1) * half,
          half
        );
      return;
    }
    let alpha = 0;
    if (coverage === 'partial') {
      const span = 4 ** (moc.order - level),
        start = cell * span,
        stop = start + span;
      let covered = 0;
      for (let i = firstInterval(start); i < ranges.length && ranges[i] < stop; i += 2)
        covered += Math.min(stop, ranges[i + 1]) - Math.max(start, ranges[i]);
      alpha = Math.round((255 * covered) / span);
    }
    for (let y = top; y < top + size; y++)
      for (let i = 4 * (y * width + left) + 3, stop = i + size * 4; i < stop; i += 4)
        rgba[i] = alpha;
  }
  paint(order, pixel, 0, 0, width);
}

const bitmapOptions = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
export async function decodeSurveyTile(blob, tile) {
  const image = await createImageBitmap(blob, bitmapOptions);
  if (
    tile?.provider.id !== 'panstarrs' ||
    image.width !== 512 ||
    image.height !== 512 ||
    panstarrsTileCoverage(tile.order, tile.pixel) !== 'partial'
  )
    return image;
  try {
    const canvas =
      typeof OffscreenCanvas === 'undefined'
        ? document.createElement('canvas')
        : new OffscreenCanvas(512, 512);
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, 512, 512);
    maskPanStarrsPixels(pixels.data, 512, tile.order, tile.pixel);
    ctx.putImageData(pixels, 0, 0);
    return await createImageBitmap(canvas, bitmapOptions);
  } finally {
    image.close();
  }
}
