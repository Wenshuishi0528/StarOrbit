// ESA/Hubble and ESA/Webb pyramids retain their original image orientation. AVM
// describes FITS pixels (1-based, +Y upwards); texture UVs start at top left.
const rad = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (v) => v.map((n) => n / Math.hypot(...v));

export function createWebbPlate(record) {
  const [width, height, refW, refH, ra, dec, px, py, cd11, cd12, cd21, cd22, count] = record;
  const a = ra * rad,
    d = dec * rad;
  const reference = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const east = [-Math.sin(a), Math.cos(a), 0];
  const north = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  const x = east.map((v, i) => rad * (v * cd11 + north[i] * cd21));
  const y = east.map((v, i) => rad * (v * cd12 + north[i] * cd22));
  // Image-edge UV coordinates (pixel centres lie half a pixel inside).
  const topLeft = reference.map((v, i) => v + x[i] * (0.5 - px) + y[i] * (refH + 0.5 - py));
  const across = x.map((v) => v * refW),
    down = y.map((v) => -v * refH);
  function measure(round, build = false) {
    let w = width,
      h = height,
      total = 0,
      maxOrder = 0;
    const levels = build ? [] : null;
    for (;;) {
      const cols = Math.ceil(w / 256),
        rows = Math.ceil(h / 256);
      total += cols * rows;
      if (build) levels.push({ width: w, height: h, cols, rows });
      if (Math.max(w, h) <= 256) break;
      w = Math.max(1, round(w / 2));
      h = Math.max(1, round(h / 2));
      maxOrder++;
    }
    if (build) {
      let offset = 0;
      for (const level of levels.reverse()) {
        level.offset = offset;
        offset += level.cols * level.rows;
      }
    }
    return { total, maxOrder, levels };
  }
  // Zoomify archives round odd pixels differently. Validate the count while
  // keeping only a tier number for plates the user has not viewed.
  let round = Math.ceil,
    measured = measure(round);
  if (measured.total !== count) {
    round = Math.floor;
    measured = measure(round);
  }
  if (measured.total !== count) return null;
  let levels;
  const plate = {
    width,
    height,
    topLeft,
    across,
    down,
    maxOrder: measured.maxOrder,
    get levels() {
      return (levels ??= measure(round, true).levels);
    },
  };
  plate.direction = normalize(webbPlateRay(plate, 0.5, 0.5));
  plate.fieldSizeArcmin = [refW * Math.hypot(cd11, cd21) * 60, refH * Math.hypot(cd12, cd22) * 60];
  plate.radius = (Math.hypot(...plate.fieldSizeArcmin) * rad) / 120;
  return plate;
}

export function webbPlateRay(plate, u, v) {
  return plate.topLeft.map((n, i) => n + u * plate.across[i] + v * plate.down[i]);
}

export function webbPlateTile(provider, order, pixel) {
  const tier = provider.plate.levels[order];
  const x = pixel % tier.cols,
    y = Math.floor(pixel / tier.cols);
  const width = Math.min(256, tier.width - 256 * x),
    height = Math.min(256, tier.height - 256 * y);
  return {
    provider,
    order,
    pixel,
    width,
    height,
    priority: order === 0 ? 1 : 3,
    key: `${provider.id}@${provider.revision}/${order}/${pixel}.jpg`,
    url: `${provider.baseUrl}/TileGroup${Math.floor((tier.offset + pixel) / 256)}/${order}-${x}-${y}.jpg`,
    bounds: [
      (256 * x) / tier.width,
      (256 * y) / tier.height,
      (256 * x + width) / tier.width,
      (256 * y + height) / tier.height,
    ],
  };
}

// A complete, small native JPEG uses the same astrometry as its pyramid and
// an independent cache key and the colour encoding of the official original.
export function nativePlateTile(provider) {
  const { width, height, maxOrder } = provider.plate;
  return {
    provider,
    order: maxOrder,
    pixel: 0,
    width,
    height,
    bounds: [0, 0, 1, 1],
    priority: 1,
    nativeImage: true,
    archiveProfile: provider.nativeImage.profile,
    key: provider.id + '@' + provider.revision + '/large.jpg',
    url: provider.nativeImage.url,
  };
}

export function validSkyImageDimensions(tile, width, height) {
  if (tile.nativeImage || !(tile.provider?.plate || tile.zoomify)) {
    return width === (tile.width ?? 512) && height === (tile.height ?? 512);
  }
  const match = (actual, expected) =>
    expected === 256
      ? actual === 256
      : actual > 0 && actual <= 256 && Math.abs(actual - expected) <= 1;
  return match(width, tile.width) && match(height, tile.height);
}

export function webbPlateTiles(provider, maxOrder = provider.maxOrder) {
  const tiles = [];
  for (const [order, level] of provider.plate.levels.entries()) {
    if (order > maxOrder) break;
    for (let i = 0; i < level.cols * level.rows; i++) tiles.push(webbPlateTile(provider, order, i));
  }
  return tiles;
}

function visiblePolygon(plate, view, tangent) {
  // In a TAN plane the four perspective-frustum side planes clip linearly.
  let polygon = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  for (const [axis, limit] of [
    [view.right, tangent * view.aspect],
    [view.up, tangent],
  ]) {
    for (const sign of [1, -1]) {
      const normal = view.forward.map((v, i) => limit * v + sign * axis[i]);
      const origin = dot(plate.topLeft, normal),
        dx = dot(plate.across, normal),
        dy = dot(plate.down, normal);
      const next = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        const da = origin + a[0] * dx + a[1] * dy,
          db = origin + b[0] * dx + b[1] * dy;
        if (da >= 0) next.push(a);
        if (da >= 0 !== db >= 0) {
          const t = da / (da - db);
          next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      polygon = next;
      if (!polygon.length) return null;
    }
  }
  return polygon;
}

// Intersect each tile row with the convex projected viewport. A rotated
// rectangle's empty corners can otherwise force a lower tier in large mosaics.
function visibleTier(provider, order, polygon, limit) {
  const tier = provider.plate.levels[order];
  const rowOf = (value) =>
    Math.min(tier.rows - 1, Math.max(0, Math.floor((value * tier.height) / 256)));
  const colOf = (value) =>
    Math.min(tier.cols - 1, Math.max(0, Math.floor((value * tier.width) / 256)));
  const top = rowOf(Math.min(...polygon.map((p) => p[1]))),
    bottom = rowOf(Math.max(...polygon.map((p) => p[1])));
  if (bottom - top + 1 > limit) return null;
  const spans = [];
  let count = 0;
  for (let y = top; y <= bottom; y++) {
    const lo = (y * 256) / tier.height,
      hi = ((y + 1) * 256) / tier.height;
    let left = Infinity,
      right = -Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      if (a[1] >= lo && a[1] <= hi) {
        left = Math.min(left, a[0]);
        right = Math.max(right, a[0]);
      }
      for (const edge of [lo, hi]) {
        if (a[1] < edge === b[1] < edge) continue;
        const x = a[0] + ((b[0] - a[0]) * (edge - a[1])) / (b[1] - a[1]);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    if (left > right) continue;
    left = colOf(left);
    right = colOf(right);
    count += right - left + 1;
    if (count > limit) return null;
    spans.push([y, left, right]);
  }
  const tiles = [];
  for (const [y, left, right] of spans)
    for (let x = left; x <= right; x++)
      tiles.push(webbPlateTile(provider, order, y * tier.cols + x));
  return tiles;
}

// Clip before enumerating. Even a gigapixel mosaic only needs local tiles and
// their lower-resolution coverage for offline panning and zooming back out.
export function offlinePlateField(provider, view, maxOrder = provider.maxOrder) {
  const bounds = visiblePolygon(provider.plate, view, Math.tan((view.fovY * rad) / 2));
  if (!bounds) return [];
  const tiles = [];
  for (let order = 0; order <= Math.min(maxOrder, provider.maxOrder); order++) {
    const tier = visibleTier(provider, order, bounds, 150);
    if (!tier) break;
    tiles.push(...tier);
  }
  return tiles;
}

const plateBuckets = new WeakMap();
function indexPlates(providers) {
  let bins = plateBuckets.get(providers);
  if (bins) return bins;
  const byCell = new Map();
  for (const p of providers) {
    const plate = p.plate;
    if (!plate) continue;
    const d = plate.direction;
    const lonBin = Math.floor((Math.atan2(d[1], d[0]) / rad + 180) / 10) % 36;
    const latBin = Math.min(17, Math.floor((Math.asin(d[2]) / rad + 90) / 10));
    const key = latBin * 36 + lonBin;
    let bin = byCell.get(key);
    if (!bin) {
      const a = (lonBin * 10 - 175) * rad,
        b = (latBin * 10 - 85) * rad;
      bin = {
        axis: [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)],
        radius: 0,
        size: 0,
        items: [],
      };
      byCell.set(key, bin);
    }
    bin.radius = Math.max(
      bin.radius,
      Math.acos(Math.max(-1, Math.min(1, dot(bin.axis, d)))) + plate.radius
    );
    const width = Math.hypot(...plate.across),
      size = Math.max(width, Math.hypot(...plate.down));
    bin.size = Math.max(bin.size, size);
    bin.items.push({ provider: p, width, size });
  }
  bins = [...byCell.values()];
  plateBuckets.set(providers, bins);
  return bins;
}

export function planWebbPlate(providers, view, preferredId, savedPyramidOrder) {
  const tangent = Math.tan((view.fovY * rad) / 2);
  const half = Math.atan(tangent * Math.hypot(view.aspect, 1));
  const pxPerRad = view.pixelHeight / (2 * tangent);
  let best = null,
    bestBounds = null,
    bestAlignment = -Infinity;
  outer: for (const bin of indexPlates(providers)) {
    if (
      bin.size * pxPerRad < 8 ||
      dot(bin.axis, view.forward) < Math.cos(Math.min(Math.PI, half + bin.radius))
    )
      continue;
    for (const item of bin.items) {
      if (item.size * pxPerRad < 8) continue;
      const { plate, id } = item.provider,
        alignment = dot(view.forward, plate.direction);
      if (
        alignment < Math.cos(Math.min(Math.PI, half + plate.radius)) ||
        (id !== preferredId && alignment <= bestAlignment)
      )
        continue;
      const bounds = visiblePolygon(plate, view, tangent);
      if (!bounds) continue;
      best = item;
      bestAlignment = alignment;
      bestBounds = bounds;
      if (id === preferredId) break outer;
    }
  }
  if (!best) return [];
  const provider = best.provider,
    plate = provider.plate;
  const savedOrder = provider.nativeImage ? savedPyramidOrder?.(provider.id) : undefined;
  if (provider.nativeImage && savedOrder === undefined) return [nativePlateTile(provider)];
  const limit = Math.min(provider.maxOrder, savedOrder ?? provider.maxOrder);
  const first = plate.levels.findIndex((t) => t.width >= best.width * pxPerRad);
  for (let order = first < 0 ? limit : Math.min(limit, first); order >= 0; order--) {
    const tiles = visibleTier(provider, order, bestBounds, 18);
    if (!tiles) continue;
    if (order) tiles.unshift(webbPlateTile(provider, 0, 0));
    if (provider.nativeImage) for (const tile of tiles) tile.cacheOnly = true;
    return tiles;
  }
  return [];
}

// Celestial positions remain on the original tangent plane. Triangles and UVs
// then interpolate projectively without a curved-mesh approximation.
export function webbPlateGeometry(tile) {
  const [u0, v0, u1, v1] = tile.bounds,
    plate = tile.provider.plate;
  const origin = webbPlateRay(plate, (u0 + u1) / 2, (v0 + v1) / 2);
  const vertices = [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
  return {
    origin,
    positions: new Float32Array(
      vertices.flatMap(([u, v]) => webbPlateRay(plate, u, v).map((a, i) => a - origin[i]))
    ),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  };
}
