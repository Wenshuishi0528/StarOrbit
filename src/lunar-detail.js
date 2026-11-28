import * as THREE from 'three';
import { dot } from './orbit.js';

const columns = 32,
  rows = 16,
  tileSize = 512,
  gutter = 8;
const padded = tileSize + 2 * gutter;
const step = Math.PI / rows;

// A bounding sphere encloses each curved patch, including its corners. Using
// body-fixed coordinates keeps the atlas, the polar regions and the longitude
// seam independent of the orientation of the telescope.
function patch(lon, lat, halfStep) {
  const cos = Math.cos(lat);
  const angle = Math.hypot(halfStep, halfStep * Math.cos(Math.max(0, Math.abs(lat) - halfStep)));
  return {
    centre: [cos * Math.cos(lon), cos * Math.sin(lon), Math.sin(lat)],
    angle,
    radius: 2 * Math.sin(angle / 2),
  };
}
const patches = Array.from({ length: columns * rows }, (_, id) => {
  const lon = ((id % columns) + 0.5) * step - Math.PI;
  const lat = Math.PI / 2 - (Math.floor(id / columns) + 0.5) * step;
  const quarter = step / 4;
  return {
    ...patch(lon, lat, step / 2),
    id,
    children: [-quarter, quarter].flatMap((dx) =>
      [-quarter, quarter].map((dy) => patch(lon + dx, lat + dy, quarter))
    ),
  };
});

export function visibleLunarTiles(view) {
  if (!view) return [];
  const { eye, forward, right, up, tanX, tanY, height, relief = 0 } = view;
  const distance = Math.hypot(...eye);
  // One 2K equatorial sample subtends 1/326 radians. Leave headroom
  // around native resolution so a normal overview stays on the packaged 2K map.
  if (height / (2 * tanY * Math.max(0.01, distance - 1)) < 500) return [];
  const horizon = Math.acos(Math.min(1, 1 / distance)) + (relief ? Math.sqrt(2 * relief) : 0);
  const sideX = Math.hypot(1, tanX),
    sideY = Math.hypot(1, tanY);
  const ex = dot(eye, right),
    ey = dot(eye, up),
    ez = dot(eye, forward);
  function intersects({ centre, radius, angle }) {
    if (dot(centre, eye) < distance * Math.cos(Math.min(Math.PI, horizon + angle))) return false;
    const r = radius + relief,
      z = dot(centre, forward) - ez;
    return (
      z + r > 0 &&
      Math.abs(dot(centre, right) - ex) <= z * tanX + r * sideX &&
      Math.abs(dot(centre, up) - ey) <= z * tanY + r * sideY
    );
  }
  const visible = [];
  for (const tile of patches) {
    if (!intersects(tile) || !tile.children.some(intersects)) continue;
    const dx = dot(tile.centre, right) - ex,
      dy = dot(tile.centre, up) - ey;
    visible.push({ id: tile.id, priority: dx * dx + dy * dy });
  }
  return visible.sort((a, b) => a.priority - b.priority).map((tile) => tile.id);
}

// The lookup table maps geographic cells to resident GPU pages. Each array
// layer holds two pages to support all 512 addresses on minimum WebGL2 hardware.
export const lunarDetailGLSL = `
uniform bool lunarDetailOn;
uniform sampler2D lunarPageTable;
uniform highp sampler2DArray lunarPages;
vec3 lunarAlbedo(vec2 uv, vec3 overview) {
 if (!lunarDetailOn) return overview;
 vec2 cell=vec2(fract(uv.x)*32.,clamp(1.-uv.y,0.,1.)*16.);
 ivec2 index=min(ivec2(floor(cell)),ivec2(31,15));
 vec2 entry=texelFetch(lunarPageTable,index,0).rg;
 int slot=int(round(entry.r*255.))+256*int(round(entry.g*255.))-1;
 if (slot<0) return overview;
 vec2 local=(vec2(${gutter}.)+(cell-vec2(index))*${tileSize}.)/${padded}.;
 return texture(lunarPages,vec3((float(slot%2)+local.x)*.5,local.y,float(slot/2))).rgb;
}`;

// Reuse decoded source imagery across independent WebGL contexts. HTTP cache
// remains browser-managed. Keep only a few full tiles after copying their pixels.
const sourceCaches = new WeakMap();
function tileImage(source, cache, id) {
  const existing = cache.get(id);
  if (existing) {
    cache.delete(id);
    cache.set(id, existing);
    return existing;
  }
  const url =
    source.tiles?.[id] ?? `${source.root}/${Math.floor(id / columns)}/${id % columns}.jpg`;
  const promise = new THREE.ImageLoader().loadAsync(url).catch((error) => {
    if (cache.get(id) === promise) cache.delete(id);
    throw error;
  });
  cache.set(id, promise);
  if (cache.size > 20) cache.delete(cache.keys().next().value);
  return promise;
}

// At a wide field many geographic tiles share relatively few screen pixels.
// Filter their source pixels down on upload. A close field uses full 512-pixel
// interiors. A single view always fits within 35 MiB of GPU page storage.
function pageLayout(count, current) {
  if (count > 128 || (current === 4 && count > 100)) return [4, 512];
  if (count > 32 || (current >= 2 && count > 25)) return [2, 128];
  return [1, 32];
}

export function createLunarDetail(source, invalidate = () => {}) {
  const uniforms = {
    lunarDetailOn: { value: false },
    lunarPageTable: { value: null },
    lunarPages: { value: null },
  };
  const slots = new Map(),
    pending = new Set(),
    failedUntil = new Map(),
    waiters = new Set();
  let wanted = new Set(),
    free = [],
    scale = 0,
    context,
    revision = 0,
    disposed = false;
  let bank = null,
    lastView = null,
    retryTimer = null;
  function releaseImages() {
    if (bank && --bank.users === 0) {
      bank.images.clear();
      sourceCaches.delete(source);
    }
    bank = null;
  }
  function clearPages() {
    uniforms.lunarPages.value?.dispose();
    uniforms.lunarPageTable.value?.dispose();
    uniforms.lunarPages.value = uniforms.lunarPageTable.value = null;
    uniforms.lunarDetailOn.value = false;
    slots.clear();
    scale = 0;
    context = null;
  }
  function allocate(divisor, capacity) {
    clearPages();
    scale = divisor;
    const side = padded / scale;
    const pages = new THREE.DataArrayTexture(
      new Uint8Array(side * side * capacity * 4),
      side * 2,
      side,
      capacity / 2
    );
    pages.minFilter = pages.magFilter = THREE.LinearFilter;
    pages.colorSpace = THREE.SRGBColorSpace;
    uniforms.lunarPages.value = pages;
    const table = new THREE.DataTexture(new Uint8Array(columns * rows * 4), columns, rows);
    table.needsUpdate = true;
    uniforms.lunarPageTable.value = table;
    free = Array.from({ length: capacity }, (_, i) => capacity - i - 1);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingQuality = 'high';
  }
  function put(id, image) {
    if (image.naturalWidth !== padded || image.naturalHeight !== padded)
      throw Error('Invalid lunar tile');
    const side = padded / scale;
    context.drawImage(image, 0, 0, side, side);
    const pixels = context.getImageData(0, 0, side, side).data;
    const slot = free.pop(),
      layer = Math.floor(slot / 2),
      offset = slot % 2;
    const pages = uniforms.lunarPages.value;
    for (let row = 0; row < side; row++) {
      const start = row * side * 4;
      pages.image.data.set(
        pixels.subarray(start, start + side * 4),
        ((layer * side + row) * 2 + offset) * side * 4
      );
    }
    pages.addLayerUpdate(layer);
    pages.needsUpdate = true;
    slots.set(id, slot);
    const table = uniforms.lunarPageTable.value;
    table.image.data[id * 4] = (slot + 1) & 255;
    table.image.data[id * 4 + 1] = (slot + 1) >> 8;
    table.needsUpdate = true;
    uniforms.lunarDetailOn.value = true;
    revision++;
    invalidate();
  }
  function pump() {
    const now = Date.now();
    let waiting = false,
      retryAt = Infinity;
    for (const id of wanted) {
      if (slots.has(id)) continue;
      if (failedUntil.get(id) > now) {
        retryAt = Math.min(retryAt, failedUntil.get(id));
        continue;
      }
      waiting = true;
      if (pending.size >= 4) break;
      if (pending.has(id)) continue;
      pending.add(id);
      tileImage(source, bank.images, id)
        .then((image) => {
          if (!disposed && wanted.has(id)) put(id, image);
        })
        .catch(() => failedUntil.set(id, Date.now() + 30000))
        .finally(() => {
          pending.delete(id);
          pump();
        });
    }
    if (Number.isFinite(retryAt) && retryTimer === null) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        pump();
      }, retryAt - now);
    }
    if (!waiting) for (const finish of [...waiters]) finish();
  }
  function sameFootprint(view) {
    if (!view || !lastView) return view === lastView;
    if (
      view.tanX !== lastView.tanX ||
      view.tanY !== lastView.tanY ||
      view.height !== lastView.height ||
      view.relief !== lastView.relief
    )
      return false;
    const angle = view.tanY / view.height;
    const linear = angle * Math.max(0.01, Math.hypot(...view.eye) - 1);
    for (const key of ['eye', 'forward', 'right', 'up']) {
      const tolerance = key === 'eye' ? linear : angle;
      for (let i = 0; i < 3; i++)
        if (Math.abs(view[key][i] - lastView[key][i]) > tolerance) return false;
    }
    return true;
  }
  function update(view) {
    if (
      disposed ||
      (!source?.root && source?.tiles?.length !== columns * rows) ||
      sameFootprint(view)
    )
      return;
    lastView = view;
    wanted = new Set(visibleLunarTiles(view));
    if (!wanted.size) {
      releaseImages();
      clearTimeout(retryTimer);
      retryTimer = null;
      if (scale) {
        clearPages();
        revision++;
      }
      pump();
      return;
    }
    const [divisor, capacity] = pageLayout(wanted.size, scale);
    if (divisor !== scale) {
      try {
        allocate(divisor, capacity);
      } catch {
        clearPages();
        releaseImages();
        wanted.clear();
        pump();
        return;
      }
    }
    if (!bank) {
      bank = sourceCaches.get(source) ?? { images: new Map(), users: 0 };
      bank.users++;
      sourceCaches.set(source, bank);
    }
    const table = uniforms.lunarPageTable.value;
    for (const [id, slot] of slots) {
      if (wanted.has(id)) continue;
      table.image.data.fill(0, id * 4, id * 4 + 2);
      table.needsUpdate = true;
      slots.delete(id);
      free.push(slot);
    }
    pump();
  }
  function ready(timeout = 5000) {
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        waiters.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, timeout);
      waiters.add(finish);
      pump();
    });
  }
  return {
    uniforms,
    update,
    ready,
    get revision() {
      return revision;
    },
    get status() {
      return { active: wanted.size > 0, wanted: wanted.size, loaded: slots.size };
    },
    dispose() {
      disposed = true;
      clearTimeout(retryTimer);
      wanted.clear();
      releaseImages();
      clearPages();
      pump();
    },
  };
}
