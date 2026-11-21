// ESA/Webb Zoomify pyramids retain their original image orientation. AVM
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
  function pyramid(round) {
    const levels = [];
    for (
      let w = width, h = height;
      ;
      w = Math.max(1, round(w / 2)), h = Math.max(1, round(h / 2))
    ) {
      levels.push({ width: w, height: h, cols: Math.ceil(w / 256), rows: Math.ceil(h / 256) });
      if (Math.max(w, h) <= 256) break;
    }
    levels.reverse();
    let offset = 0;
    for (const level of levels) {
      level.offset = offset;
      offset += level.cols * level.rows;
    }
    return offset === count ? levels : null;
  }
  // Zoomify producers differ on the final odd pixel. Match the archive count.
  const levels = pyramid(Math.ceil) || pyramid(Math.floor);
  if (!levels) return null;
  const plate = { width, height, topLeft, across, down, levels };
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

export function validSkyImageDimensions(tile, width, height) {
  if (!(tile.provider?.plate || tile.zoomify)) {
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

function visibleBounds(plate, view, tangent) {
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
  const u = polygon.map((p) => p[0]),
    v = polygon.map((p) => p[1]);
  return [Math.min(...u), Math.min(...v), Math.max(...u), Math.max(...v)];
}

export function planWebbPlate(providers, view, preferredId) {
  const tangent = Math.tan((view.fovY * rad) / 2);
  const half = Math.atan(tangent * Math.hypot(view.aspect, 1));
  const candidates = [];
  for (const provider of providers) {
    const plate = provider.plate;
    if (!plate) continue;
    const alignment = dot(view.forward, plate.direction);
    if (alignment < Math.cos(Math.min(Math.PI, half + plate.radius))) continue;
    const pxPerRad = view.pixelHeight / (2 * tangent);
    // Subpixel plates do not need a network request in the all-sky view.
    const neededWidth = Math.hypot(...plate.across) * pxPerRad;
    if (Math.max(neededWidth, Math.hypot(...plate.down) * pxPerRad) < 8) continue;
    candidates.push({ provider, alignment, neededWidth });
  }
  candidates.sort(
    (a, b) =>
      Number(b.provider.id === preferredId) - Number(a.provider.id === preferredId) ||
      b.alignment - a.alignment
  );
  for (const { provider, neededWidth } of candidates) {
    const plate = provider.plate,
      bounds = visibleBounds(plate, view, tangent);
    if (!bounds) continue;
    const first = plate.levels.findIndex((t) => t.width >= neededWidth);
    for (let order = first < 0 ? provider.maxOrder : first; order >= 0; order--) {
      const tier = plate.levels[order];
      const range = (n, pixels, cells) =>
        Math.max(0, Math.min(cells - 1, Math.floor((n * pixels) / 256)));
      const left = range(bounds[0], tier.width, tier.cols),
        right = range(bounds[2], tier.width, tier.cols);
      const top = range(bounds[1], tier.height, tier.rows),
        bottom = range(bounds[3], tier.height, tier.rows);
      if ((right - left + 1) * (bottom - top + 1) > 18) continue;
      const tiles = order ? [webbPlateTile(provider, 0, 0)] : [];
      for (let y = top; y <= bottom; y++)
        for (let x = left; x <= right; x++) {
          tiles.push(webbPlateTile(provider, order, y * tier.cols + x));
        }
      return tiles;
    }
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
