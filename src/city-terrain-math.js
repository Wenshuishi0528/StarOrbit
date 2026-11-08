// City packs use north-up WGS84 bounds [west, south, east, north], in degrees.
// Their 512 px images contain a 504 px core and a 4 px gutter on every side.
// Tile y grows SOUTH, while Earth texture v grows NORTH. Decode north-up images
// with one vertical flip, as EarthDetail does; the returned UVs are bottom-up.
export const CITY_TILE_SIZE = 512;
export const CITY_TILE_GUTTER = 4;
export const CITY_TILE_INNER = CITY_TILE_SIZE - 2 * CITY_TILE_GUTTER;
export const CITY_EARTH_RADIUS_KM = 6371;

const DEG = Math.PI / 180;
// WGS84 constants: https://geographiclib.sourceforge.io/html/python/code.html
const WGS84_A_KM = 6378.137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const MAX_LEVEL = 12;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function vector(value, name) {
  const result = [value?.[0] ?? value?.x, value?.[1] ?? value?.y, value?.[2] ?? value?.z];
  if (!result.every(Number.isFinite)) throw new TypeError(`${name} must be a finite vector`);
  return result;
}

function unit(value, name) {
  const result = vector(value, name);
  const length = Math.hypot(...result);
  if (!length) throw new TypeError(`${name} must be nonzero`);
  return result.map((component) => component / length);
}

function checkLevel(z) {
  if (!Number.isInteger(z) || z < 0 || z > MAX_LEVEL) {
    throw new RangeError(`City tile level must be an integer from 0 to ${MAX_LEVEL}`);
  }
}

function checkBounds(bounds) {
  if (
    !Array.isArray(bounds) ||
    bounds.length !== 4 ||
    !bounds.every(Number.isFinite) ||
    bounds[0] < -180 ||
    bounds[2] > 180 ||
    bounds[1] <= -90 ||
    bounds[3] >= 90 ||
    bounds[0] >= bounds[2] ||
    bounds[1] >= bounds[3] ||
    bounds[2] - bounds[0] >= 180
  ) {
    throw new RangeError('City bounds must not cross the date line or either pole');
  }
  return bounds;
}

function extent(sizeKm) {
  const result = Array.isArray(sizeKm) ? sizeKm : [sizeKm, sizeKm];
  if (result.length !== 2 || !result.every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('City extent must contain positive kilometres');
  }
  return result;
}

function curvature(latitude) {
  const denominator = 1 - WGS84_E2 * Math.sin(latitude) ** 2;
  return {
    meridian: (WGS84_A_KM * (1 - WGS84_E2)) / denominator ** 1.5,
    parallel: (WGS84_A_KM * Math.cos(latitude)) / Math.sqrt(denominator),
  };
}

/** Local WGS84 approximation; unsupported date-line/polar packs return null. */
export function cityBounds(center, sizeKm) {
  if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite)) {
    throw new TypeError('City center must be [longitude, latitude] in degrees');
  }
  const [longitude, latitude] = center;
  const [width, height] = extent(sizeKm);
  if (longitude < -180 || longitude > 180 || Math.abs(latitude) >= 90) return null;
  const radii = curvature(latitude * DEG);
  const halfWidth = width / (2 * radii.parallel * DEG);
  const halfHeight = height / (2 * radii.meridian * DEG);
  const bounds = [
    longitude - halfWidth,
    latitude - halfHeight,
    longitude + halfWidth,
    latitude + halfHeight,
  ];
  if (
    bounds[0] < -180 ||
    bounds[2] > 180 ||
    bounds[1] <= -90 ||
    bounds[3] >= 90 ||
    halfWidth >= 90
  ) {
    return null;
  }
  return bounds;
}

/** Finest level whose core sampling is at least the requested metres per pixel. */
export function maxLevelFromExtent(sizeKm, pixelMeters = 10) {
  if (!Number.isFinite(pixelMeters) || pixelMeters <= 0) {
    throw new RangeError('City pixel size must be positive metres');
  }
  const z = Math.max(
    0,
    Math.ceil(Math.log2((Math.max(...extent(sizeKm)) * 1000) / (CITY_TILE_INNER * pixelMeters)))
  );
  checkLevel(z);
  return z;
}

/** Core bounds only: gutters overlap neighboring cores and do not change coverage. */
export function tileBounds(meta, z, x, y) {
  const [west, south, east, north] = checkBounds(meta.bounds);
  checkLevel(z);
  const n = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    throw new RangeError('City tile coordinates are outside their level');
  }
  const width = (east - west) / n;
  const height = (north - south) / n;
  return [west + x * width, north - (y + 1) * height, west + (x + 1) * width, north - y * height];
}

function uvRect([west, south, east, north]) {
  return [west / 360 + 0.5, south / 180 + 0.5, (east - west) / 360, (north - south) / 180];
}

export function tileUVRect(meta, z, x, y) {
  return uvRect(tileBounds(meta, z, x, y));
}

/** Root first, then each complete level in north-to-south raster order. */
export function allCityTiles(maxLevel) {
  checkLevel(maxLevel);
  // This materializes a pack manifest, not a streaming traversal. Reject an
  // accidentally enormous manifest before allocating millions of objects.
  if ((4 ** (maxLevel + 1) - 1) / 3 > 1000000) {
    throw new RangeError('City pack contains too many tiles to enumerate');
  }
  const result = [];
  for (let z = 0; z <= maxLevel; z++) {
    const n = 2 ** z;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) result.push({ key: `${z}/${x}/${y}`, z, x, y });
    }
  }
  return result;
}

function direction(longitude, latitude) {
  const cosLatitude = Math.cos(latitude * DEG);
  return [
    cosLatitude * Math.cos(longitude * DEG),
    cosLatitude * Math.sin(longitude * DEG),
    Math.sin(latitude * DEG),
  ];
}

function angularDistance(a, b) {
  return Math.atan2(
    Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]),
    dot(a, b)
  );
}

function cap(bounds) {
  const [west, south, east, north] = bounds;
  const normal = direction((west + east) / 2, (south + north) / 2);
  // For these non-wrapping rectangles (<180° wide), the farthest direction
  // from the geographic midpoint is a corner. This encloses the curved edges
  // too; treating the four corners as a flat quad would miss limb intersections.
  let angle = 0;
  for (const longitude of [west, east]) {
    for (const latitude of [south, north]) {
      angle = Math.max(angle, angularDistance(normal, direction(longitude, latitude)));
    }
  }
  return {
    normal,
    angle,
    center: normal.map((value) => value * CITY_EARTH_RADIUS_KM),
    radius: 2 * CITY_EARTH_RADIUS_KM * Math.sin(angle / 2),
  };
}

function makeView(view) {
  const eye = vector(view.eyeKm, 'City eyeKm');
  const eyeDistance = Math.hypot(...eye);
  const forward = unit(view.forward, 'City forward');
  const right = unit(view.right, 'City right');
  const up = unit(view.up, 'City up');
  const { fovY, width, height } = view;
  const aspect = view.aspect ?? width / height;
  if (
    !(fovY > 0 && fovY < 180) ||
    !(width > 0) ||
    !(height > 0) ||
    !(aspect > 0) ||
    ![fovY, width, height, aspect].every(Number.isFinite)
  ) {
    throw new RangeError('City view needs positive physical dimensions and a FOV below 180°');
  }
  const tanY = Math.tan((fovY * DEG) / 2);
  const tanX = tanY * aspect;
  const planes = [forward];
  for (const [axis, tangent] of [
    [right, tanX],
    [up, tanY],
  ]) {
    for (const sign of [-1, 1]) {
      planes.push(
        unit(
          forward.map((value, i) => value * tangent + sign * axis[i]),
          'City frustum plane'
        )
      );
    }
  }
  return {
    eye,
    forward,
    planes,
    eyeDistance,
    eyeNormal: eyeDistance ? eye.map((value) => value / eyeDistance) : [0, 0, 0],
    horizon: Math.acos(clamp(CITY_EARTH_RADIUS_KM / eyeDistance, -1, 1)),
    pixelSlope: Math.min((2 * tanY) / height, (2 * tanX) / width),
  };
}

function visible(tileCap, view) {
  if (view.eyeDistance <= CITY_EARTH_RADIUS_KM) return false;
  if (
    dot(tileCap.normal, view.eyeNormal) <
    Math.cos(Math.min(Math.PI, view.horizon + tileCap.angle)) - 1e-12
  ) {
    return false;
  }
  const offset = subtract(tileCap.center, view.eye);
  return view.planes.every((plane) => dot(plane, offset) >= -tileCap.radius - 1e-7);
}

function desiredLevel(meta, tileCap, view) {
  const [west, south, east, north] = meta.bounds;
  const radii = curvature(((south + north) / 2) * DEG);
  const rootTexelMeters =
    (1000 *
      Math.max((east - west) * DEG * radii.parallel, (north - south) * DEG * radii.meridian)) /
    CITY_TILE_INNER;
  // A depth lower bound is conservative even for a patch clipping a viewport
  // corner or the horizon. It may request excess detail, never less on the near
  // side. Budget reduction below coarsens whole footprints, not arbitrary tiles.
  const depthKm = Math.max(
    1e-6,
    dot(subtract(tileCap.center, view.eye), view.forward) - tileCap.radius
  );
  const pixelMeters = depthKm * view.pixelSlope * 1000;
  return clamp(Math.ceil(Math.log2(rootTexelMeters / pixelMeters)), 0, meta.maxLevel ?? 0);
}

function tileDescriptor(meta, z, x, y, desired, selected) {
  const bounds = tileBounds(meta, z, x, y);
  const parentKey = z ? `${z - 1}/${Math.floor(x / 2)}/${Math.floor(y / 2)}` : null;
  return {
    cityId: meta.id,
    key: `${z}/${x}/${y}`,
    z,
    x,
    y,
    bounds,
    rect: uvRect(bounds),
    cityRect: uvRect(meta.bounds),
    parentKey,
    parentRect: z ? tileUVRect(meta, z - 1, Math.floor(x / 2), Math.floor(y / 2)) : null,
    // Transform this tile's bottom-up core UV into its parent's core UV.
    parentUVRect: z ? [(x % 2) / 2, (1 - (y % 2)) / 2, 0.5, 0.5] : null,
    uvScale: [CITY_TILE_INNER / CITY_TILE_SIZE, CITY_TILE_INNER / CITY_TILE_SIZE],
    uvOffset: [CITY_TILE_GUTTER / CITY_TILE_SIZE, CITY_TILE_GUTTER / CITY_TILE_SIZE],
    desiredLevel: desired,
    selectedLevel: selected,
  };
}

/**
 * Plan complete city footprints with their ancestors, ordered coarse to fine.
 * view uses Earth-fixed x=lon0, y=lon90, z=north; fovY is DEGREES, dimensions
 * are physical pixels, and eyeKm is relative to Earth's center. No Three types
 * are required (vectors may be arrays or {x,y,z}). The sphere matches the app.
 *
 * An enclosing spherical cap/3D sphere is tested against every frustum plane:
 * small cities and tiles crossing ±1 viewport edges cannot fall between rays.
 * All desired levels are reduced together until the *complete* plan fits.
 * If even one root per visible city cannot fit, return [] for the global layer
 * to cover the view; never return a city with arbitrary holes in its footprint.
 */
export function planCityTiles(cities, view, { maxTiles = 40 } = {}) {
  if (!Number.isInteger(maxTiles) || maxTiles < 0)
    throw new RangeError('City tile budget must be a nonnegative integer');
  if (!maxTiles) return [];
  const frame = makeView(view);
  const visibleCities = [];
  for (const meta of cities) {
    if (typeof meta.id !== 'string' || !meta.id) throw new TypeError('City pack needs an id');
    checkLevel(meta.maxLevel ?? 0);
    const rootCap = cap(checkBounds(meta.bounds));
    if (!visible(rootCap, frame)) continue;
    visibleCities.push({ meta, desired: desiredLevel(meta, rootCap, frame) });
  }
  if (!visibleCities.length || visibleCities.length > maxTiles) return [];
  const maxDesired = Math.max(...visibleCities.map((city) => city.desired));
  for (let reduction = 0; reduction <= maxDesired; reduction++) {
    const result = [];
    const visit = (city, z, x, y, selected) => {
      if (!visible(cap(tileBounds(city.meta, z, x, y)), frame)) return true;
      result.push(tileDescriptor(city.meta, z, x, y, city.desired, selected));
      if (result.length > maxTiles) return false;
      if (z >= selected) return true;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (!visit(city, z + 1, 2 * x + dx, 2 * y + dy, selected)) return false;
        }
      }
      return true;
    };
    const complete = visibleCities.every((city) =>
      visit(city, 0, 0, 0, Math.max(0, city.desired - reduction))
    );
    if (complete) return result.sort((a, b) => a.z - b.z);
  }
  return [];
}

/** Shared conservative region visibility for stream discovery and mixed LOD. */
export function visibleCityRegions(cities, input, { elevationKm = 0 } = {}) {
  const view = makeView(input);
  if (elevationKm > 0)
    view.horizon += Math.acos(CITY_EARTH_RADIUS_KM / (CITY_EARTH_RADIUS_KM + elevationKm));
  return cities.flatMap((meta) => {
    const bounds = checkBounds(meta.bounds),
      boundsCap = cap(bounds);
    if (!visible(boundsCap, view)) return [];
    const offset = subtract(boundsCap.center, view.eye),
      depth = Math.max(0.01, dot(offset, view.forward) - boundsCap.radius);
    const score = boundsCap.radius / (depth * view.pixelSlope);
    return [{ meta, score }];
  });
}

/** Mixed per-tile LOD: keep coarse coverage first, then spend the budget on the
 * largest projected texel. A distant cell cannot force a nearby cell to blur.
 * Ancestors stay resident while children arrive, avoiding holes during motion. */
export function planStreamedCityTiles(
  cities,
  input,
  { maxTiles = 64, rangeKm = 400, center = null } = {}
) {
  if (!Number.isInteger(maxTiles) || maxTiles < 0)
    throw new RangeError('City tile budget must be a nonnegative integer');
  if (!maxTiles) return [];
  const view = makeView(input);
  view.horizon += Math.acos(CITY_EARTH_RADIUS_KM / (CITY_EARTH_RADIUS_KM + 9));
  const result = [],
    leaves = [];
  const priority = (node) => {
    const tileCap = cap(tileBounds(node.meta, node.z, node.x, node.y));
    let desired = desiredLevel(node.meta, tileCap, view);
    if (
      node.meta.streaming &&
      center &&
      angularDistance(direction(...center), tileCap.normal) * CITY_EARTH_RADIUS_KM -
        tileCap.radius >
        rangeKm
    )
      desired = 0;
    const offset = subtract(tileCap.center, view.eye),
      depth = Math.max(0.01, dot(offset, view.forward) - tileCap.radius);
    const projected = tileCap.radius / (depth * view.pixelSlope);
    return { desired, score: desired > node.z ? projected * (node.meta.streaming ? 1 : 2) : 0 };
  };
  const roots = visibleCityRegions(cities, input, { elevationKm: 9 }).sort(
    (a, b) =>
      Number(a.meta.streaming) - Number(b.meta.streaming) ||
      b.score - a.score ||
      a.meta.id.localeCompare(b.meta.id)
  );
  function add(meta, z, x, y) {
    const node = { meta, z, x, y, ...priority({ meta, z, x, y }) };
    result.push(tileDescriptor(meta, z, x, y, node.desired, z));
    leaves.push(node);
  }
  for (const { meta } of roots.slice(0, maxTiles)) add(meta, 0, 0, 0);
  while (result.length < maxTiles && leaves.length) {
    leaves.sort((a, b) => b.score - a.score || a.meta.id.localeCompare(b.meta.id));
    const node = leaves.shift();
    if (node.score <= 0) break;
    const children = [];
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const child = { z: node.z + 1, x: node.x * 2 + dx, y: node.y * 2 + dy };
        if (visible(cap(tileBounds(node.meta, child.z, child.x, child.y)), view))
          children.push(child);
      }
    if (result.length + children.length > maxTiles) continue;
    for (const child of children) add(node.meta, child.z, child.x, child.y);
  }
  return result.sort((a, b) => a.z - b.z || a.cityId.localeCompare(b.cityId));
}
