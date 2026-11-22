import atlas from '../assets/geography/atlas.json';
import { CITY_TILE_GUTTER, CITY_TILE_SIZE, tileBounds } from './city-terrain-math.js';
import { clamp, locationMapImageRects, projectLocation } from './ground-site-map-projection.js';

const WORLD = [-180, -90, 180, 90];
const CITY_GUTTER = CITY_TILE_GUTTER / CITY_TILE_SIZE;
const DAY_GUTTER = 8 / 1816;
const MAX_DAY = 4;
const MAX_CITY = 12;
const MAX_RESIDENT = 16;

function dayBounds(x, y, columns, rows) {
  return [
    -180 + (360 * x) / columns,
    90 - (180 * (y + 1)) / rows,
    -180 + (360 * (x + 1)) / columns,
    90 - (180 * y) / rows,
  ];
}

function distance(frame, bounds) {
  const { x, y } = projectLocation(frame, (bounds[1] + bounds[3]) / 2, (bounds[0] + bounds[2]) / 2);
  return Math.hypot(x - frame.width / 2, y - frame.height / 2);
}

function visibleCells(frame, bounds, columns, rows) {
  const cells = new Map();
  for (const {
    source: [left, top, width, height],
  } of locationMapImageRects(frame, bounds)) {
    const right = Math.min(columns, Math.ceil((left + width) * columns));
    const bottom = Math.min(rows, Math.ceil((top + height) * rows));
    for (let y = Math.max(0, Math.floor(top * rows)); y < bottom; y++)
      for (let x = Math.max(0, Math.floor(left * columns)); x < right; x++)
        cells.set(x + '-' + y, { x, y });
  }
  return cells.values();
}

// Only selected-source day assets, packaged city tiles and tiles already in
// the user's city cache are eligible. This 2D view never registers a 3D camera
// or requests a remote region from the main terrain scheduler.
export function planSiteMapTiles(environment, frame, ratio = 1) {
  const day = [],
    city = [];
  const detail = environment.detail,
    manager = environment.cityTerrain;
  const baseWidth = environment.uniforms?.dayMap?.value?.image?.width || 1024;
  if (detail?.tiles && frame.width * ratio > (frame.longitudeSpan / 360) * baseWidth) {
    const { columns, rows } = detail;
    for (const { x, y } of visibleCells(frame, WORLD, columns, rows)) {
      const cell = x + '-' + y,
        url = detail.tiles[cell];
      if (!url || detail.slots?.some((slot) => slot.key === cell && slot.texture?.image)) continue;
      const bounds = dayBounds(x, y, columns, rows);
      day.push({ id: 'day/' + cell, bounds, url, day: true, distance: distance(frame, bounds) });
    }
  }
  if (manager?.enabled)
    for (const meta of manager.cities.values()) {
      if (manager.disabled?.has(meta.id) || manager.removals?.has(meta.id) || !meta.bounds)
        continue;
      if (!locationMapImageRects(frame, meta.bounds).length) continue;
      const [w, s, e, n] = meta.bounds;
      const pixels =
        Math.max(
          (frame.width * (e - w)) / frame.longitudeSpan,
          (frame.height * (n - s)) / frame.latitudeSpan
        ) * ratio;
      if (pixels < 24) continue;
      const level = clamp(
        Math.ceil(Math.log2(pixels / (CITY_TILE_SIZE - 2 * CITY_TILE_GUTTER))),
        0,
        meta.maxLevel
      );
      // An incomplete saved or streamed region may contain only coarser imagery.
      const levels = new Set([0, ...(!meta.builtin && level > 1 ? [level - 1] : []), level]);
      for (const z of levels)
        for (const { x, y } of visibleCells(frame, meta.bounds, 2 ** z, 2 ** z)) {
          const key = z + '/' + x + '/' + y,
            id = meta.id + '/' + key;
          if (manager.entries?.has(id) || (meta.builtin && !meta.tiles?.[key])) continue;
          const bounds = tileBounds(meta, z, x, y);
          city.push({
            id,
            cityId: meta.id,
            key,
            bounds,
            z,
            url: meta.builtin ? meta.tiles[key] : null,
            streaming: !!meta.streaming,
            distance: distance(frame, bounds),
            root: z === 0,
          });
        }
    }
  day.sort((a, b) => a.distance - b.distance);
  city.sort(
    (a, b) =>
      Number(a.streaming) - Number(b.streaming) ||
      Number(b.root) - Number(a.root) ||
      a.distance - b.distance ||
      b.z - a.z
  );
  return [...day.slice(0, MAX_DAY), ...city.slice(0, MAX_CITY)];
}

function drawImage(context, frame, image, bounds, gutter = 0, flipped = false) {
  if (!image?.width || !image.height) return;
  const w = image.width,
    h = image.height,
    core = 1 - 2 * gutter;
  for (const {
    source: [l, t, sw, sh],
    target: [x, y, dw, dh],
  } of locationMapImageRects(frame, bounds)) {
    if (flipped) {
      // The 3D day-detail manager decodes ImageBitmaps south-up for WebGL.
      context.save();
      context.translate(x, y + dh);
      context.scale(1, -1);
    }
    context.drawImage(
      image,
      (gutter + l * core) * w,
      (gutter + (flipped ? 1 - t - sh : t) * core) * h,
      sw * core * w,
      sh * core * h,
      flipped ? 0 : x,
      flipped ? 0 : y,
      dw,
      dh
    );
    if (flipped) context.restore();
  }
}

function atlasFallback() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#183b53';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#4d635e';
  ctx.strokeStyle = '#738278';
  ctx.lineWidth = 0.6;
  for (const country of atlas.countries)
    for (const { rings } of country.parts || []) {
      ctx.beginPath();
      for (const ring of rings || []) {
        for (let i = 0; i < ring.length; i++) {
          const [lon, lat] = ring[i];
          const start = !i || Math.abs(lon - ring[i - 1][0]) > 180;
          ctx[start ? 'moveTo' : 'lineTo'](
            ((lon + 180) / 360) * canvas.width,
            ((90 - lat) / 180) * canvas.height
          );
        }
        ctx.closePath();
      }
      ctx.fill('evenodd');
      ctx.stroke();
    }
  return canvas;
}

export function createSiteMapImagery(environment, redraw) {
  const resident = new Map(),
    images = new Map();
  let fallback,
    wanted = [],
    failed = new Set(),
    detailSource,
    job = null;
  let open = false,
    lastSources = [];

  function cityImage(key, entry) {
    const data = environment.cityTerrain.texture?.image?.data;
    const previous = resident.get(key);
    if (previous?.entry === entry) return previous.image;
    const bytes = CITY_TILE_SIZE * CITY_TILE_SIZE * 4;
    if (!data || data.byteLength < (entry.layer + 1) * bytes) return null;
    const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset + entry.layer * bytes, bytes);
    const image = document.createElement('canvas');
    image.width = image.height = CITY_TILE_SIZE;
    image.getContext('2d').putImageData(new ImageData(rgba, CITY_TILE_SIZE, CITY_TILE_SIZE), 0, 0);
    resident.delete(key);
    resident.set(key, { entry, image });
    while (resident.size > MAX_RESIDENT) resident.delete(resident.keys().next().value);
    return image;
  }

  let miniBase, miniSource, miniFrame;
  function drawMiniBase(context, frame, image) {
    // WebKit can re-decode the entire 8K AVIF on drawImage, even when the
    // requested town occupies only a few source pixels. Retain that crop
    // separately so changes to city tiles or the compass never decode it again.
    const width = context.canvas.width,
      height = context.canvas.height;
    const key = [frame.west, frame.east, frame.south, frame.north, width, height].join('|');
    if (miniSource !== image || miniFrame !== key) {
      miniBase ??= document.createElement('canvas');
      miniBase.width = width;
      miniBase.height = height;
      const ctx = miniBase.getContext('2d');
      ctx.setTransform(width / frame.width, 0, 0, height / frame.height, 0, 0);
      drawImage(ctx, frame, image, WORLD);
      miniFrame = key;
      miniSource = image;
    }
    context.drawImage(miniBase, 0, 0, frame.width, frame.height);
  }

  function draw(context, frame, large) {
    context.fillStyle = '#101c28';
    context.fillRect(0, 0, frame.width, frame.height);
    const base = environment.uniforms?.dayMap?.value?.image;
    const baseImage = base?.width > 1 ? base : (fallback ??= atlasFallback());
    if (large) drawImage(context, frame, baseImage, WORLD);
    else drawMiniBase(context, frame, baseImage);
    const detail = environment.detail;
    for (const record of images.values())
      if (large && record.day && detailSource === detail?.tiles)
        drawImage(context, frame, record.image, record.bounds, DAY_GUTTER);
    for (const slot of detail?.slots || []) {
      if (!slot.key || !slot.texture?.image) continue;
      const [x, y] = slot.key.split('-').map(Number);
      drawImage(
        context,
        frame,
        slot.texture.image,
        dayBounds(x, y, detail.columns, detail.rows),
        DAY_GUTTER,
        true
      );
    }
    const manager = environment.cityTerrain;
    if (!manager?.enabled) {
      resident.clear();
      return;
    }
    const visible = [...manager.entries]
      .filter(([, entry]) => locationMapImageRects(frame, entry.bounds).length)
      .map(([id, entry]) => ({
        id,
        entry,
        bounds: entry.bounds,
        z: entry.z,
        streaming: !!manager.cities.get(entry.cityId)?.streaming,
        distance: distance(frame, entry.bounds),
      }))
      .sort((a, b) => Number(b.z === 0) - Number(a.z === 0) || a.distance - b.distance || b.z - a.z)
      .slice(0, MAX_RESIDENT);
    if (large)
      for (const record of images.values()) {
        if (
          record.day ||
          manager.entries.has(record.id) ||
          !manager.cities.has(record.cityId) ||
          manager.disabled?.has(record.cityId) ||
          manager.removals?.has(record.cityId)
        )
          continue;
        if (locationMapImageRects(frame, record.bounds).length) visible.push(record);
      }
    visible.sort((a, b) => Number(b.streaming) - Number(a.streaming) || a.z - b.z);
    for (const record of visible)
      drawImage(
        context,
        frame,
        record.image || cityImage(record.id, record.entry),
        record.bounds,
        CITY_GUTTER
      );
  }

  async function load(tile, signal) {
    let blob;
    if (tile.url) {
      const response = await fetch(tile.url, { signal });
      if (!response.ok) throw Error('Map tile unavailable');
      blob = await response.blob();
    } else {
      const cached = await environment.cityTerrain.cache.getTile(tile.cityId, tile.key);
      if (!cached) return null;
      blob = new Blob([cached.buffer], { type: cached.mimeType });
    }
    signal.throwIfAborted();
    return createImageBitmap(blob);
  }

  function pump() {
    if (!open || job) return;
    const tile = wanted.find((entry) => !images.has(entry.id) && !failed.has(entry.id));
    if (!tile) return;
    const controller = new AbortController();
    job = { id: tile.id, controller };
    load(tile, controller.signal)
      .then((image) => {
        if (controller.signal.aborted || !open) {
          image?.close();
          return;
        }
        if (image) {
          images.set(tile.id, { ...tile, image });
          redraw();
        } else failed.add(tile.id);
      })
      .catch(() => {
        if (!controller.signal.aborted) failed.add(tile.id);
      })
      .finally(() => {
        if (job?.controller === controller) job = null;
        pump();
      });
  }

  function reset() {
    open = false;
    lastSources = [];
    job?.controller.abort();
    wanted = [];
    failed.clear();
    for (const entry of images.values()) entry.image.close();
    images.clear();
  }

  function sourceChanged() {
    const detail = environment.detail,
      city = environment.cityTerrain;
    const current = [
      environment.uniforms?.dayMap?.value?.image,
      detail?.tiles,
      ...(detail?.slots || []).map((slot) => slot.texture?.image),
      city?.enabled,
      city?.revision,
      city?.cities.size,
    ];
    const changed =
      current.length !== lastSources.length || current.some((value, i) => value !== lastSources[i]);
    lastSources = current;
    return changed;
  }

  return {
    draw,
    sourceChanged,
    update(frame, ratio) {
      if (detailSource !== environment.detail?.tiles) {
        reset();
        detailSource = environment.detail?.tiles;
      }
      open = true;
      wanted = planSiteMapTiles(environment, frame, ratio);
      const ids = new Set(wanted.map((tile) => tile.id));
      if (job && !ids.has(job.id)) job.controller.abort();
      for (const [id, entry] of images)
        if (!ids.has(id)) {
          entry.image.close();
          images.delete(id);
        }
      failed = new Set([...failed].filter((id) => ids.has(id)));
      pump();
    },
    // During a drag let a still-useful decode finish, but don't start more
    // work against the old viewport before the next settled plan.
    pause() {
      wanted = [];
    },
    close: reset,
    dispose() {
      reset();
      resident.clear();
      if (fallback) fallback.width = fallback.height = 1;
      if (miniBase) miniBase.width = miniBase.height = 1;
      miniBase = miniSource = miniFrame = null;
    },
  };
}
