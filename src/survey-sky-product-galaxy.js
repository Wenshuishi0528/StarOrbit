import { cubeFace, faceUV, galaxyCrops, galaxyFieldVectors } from './survey-sky-product-math.js';

const cancelled = () => new DOMException('Aborted', 'AbortError');
const check = (signal) => {
  if (signal.aborted) throw cancelled();
};
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function loadImage(url, signal) {
  return new Promise((resolve, reject) => {
    check(signal);
    const image = new Image();
    image.decoding = 'async';
    const stop = () => {
      image.onload = image.onerror = null;
      image.removeAttribute('src');
      reject(cancelled());
    };
    signal.addEventListener('abort', stop, { once: true });
    image.onload = () => {
      signal.removeEventListener('abort', stop);
      resolve(image);
    };
    image.onerror = () => {
      signal.removeEventListener('abort', stop);
      reject(Error('银河立方体面载入失败'));
    };
    image.src = url;
  });
}
async function fieldPatch(environment, level, part, signal) {
  const faces = environment.assets?.sky?.[level];
  if (!faces?.[part.face]) throw Error('银河立方体面载入失败');
  const existing = environment.skySize === level && environment.galaxyTexture?.image?.[part.face];
  const source = existing || (await loadImage(faces[part.face], signal));
  check(signal);
  const width = source.naturalWidth || source.width,
    height = source.naturalHeight || source.height;
  if (width !== level * 256 || height !== width) throw Error('银河立方体面尺寸不符');
  const left = clamp(Math.floor(part.minX * width) - 2, 0, width - 1),
    top = clamp(Math.floor(part.minY * height) - 2, 0, height - 1);
  const right = clamp(Math.ceil(part.maxX * width) + 2, left + 1, width),
    bottom = clamp(Math.ceil(part.maxY * height) + 2, top + 1, height);
  const canvas = document.createElement('canvas');
  canvas.width = right - left;
  canvas.height = bottom - top;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw Error('银河画布不可用');
  ctx.drawImage(source, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  // The persistent copy is only the small sky patch. The main scene owns its texture.
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width, left, top, data, face: part.face };
}

function sample(patch, u, v, out, at) {
  const { data, width, left, top } = patch;
  const x = clamp(u * width - 0.5 - left, 0, data.width - 1),
    y = clamp(v * width - 0.5 - top, 0, data.height - 1);
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const i = (iy * data.width + ix) * 4,
    dx = ix < data.width - 1 ? 4 : 0,
    dy = iy < data.height - 1 ? data.width * 4 : 0;
  for (let c = 0; c < 3; c++)
    out[at + c] =
      (data.data[i + c] * (1 - fx) + data.data[i + dx + c] * fx) * (1 - fy) +
      (data.data[i + dy + c] * (1 - fx) + data.data[i + dx + dy + c] * fx) * fy;
  out[at + 3] = 255;
}
async function raster(field, parts, signal) {
  const side = 640,
    canvas = document.createElement('canvas');
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('银河画布不可用');
  const image = ctx.createImageData(side, side),
    patches = Object.fromEntries(parts.map((p) => [p.face, p]));
  const { center, east, north } = galaxyFieldVectors(field),
    direction = [0, 0, 0],
    uv = [0, 0];
  for (let row = 0; row < side; row++) {
    if (row % 64 === 0) {
      check(signal);
      await new Promise((r) => setTimeout(r, 0));
    }
    const v = 1 - (2 * (row + 0.5)) / side,
      base = center.map((value, i) => value + v * north[i]);
    for (let x = 0; x < side; x++) {
      const u = 1 - (2 * (x + 0.5)) / side;
      for (let i = 0; i < 3; i++) direction[i] = base[i] + u * east[i];
      const face = cubeFace(direction[0], direction[1], direction[2]);
      faceUV(direction, face, uv);
      sample(patches[face], uv[0], uv[1], image.data, (row * side + x) * 4);
    }
  }
  check(signal);
  ctx.putImageData(image, 0, 0);
  return canvas;
}
export async function loadSurveyGalaxy(field, environment, signal) {
  if (environment.skyLoading && environment.skyLoad) {
    await environment.skyLoad;
    check(signal);
  }
  const parts = galaxyCrops(field);
  for (const level of [16, 8, 4]) {
    try {
      const patches = [];
      // A 6-degree survey field typically occupies one face. Decode only its
      // intersecting faces, in sequence, even when the main sky is switched off.
      for (const part of parts) patches.push(await fieldPatch(environment, level, part, signal));
      return { level, canvas: await raster(field, patches, signal) };
    } catch (error) {
      if (error.name === 'AbortError') throw error;
    }
  }
  throw Error('银河图源暂不可用');
}
