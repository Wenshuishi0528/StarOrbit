// Earth-fixed coordinates: x = longitude 0, y = longitude 90 E, z = north.
// Heights are metres; positions are kilometres. Geographic UV grows east/north.
// Height rasters and tile rows instead run north to south. Local height grids
// include their endpoints, so adjacent tiles sample identical geographic nodes.
export const ELEVATION_EARTH_RADIUS_KM = 6371;
export const ELEVATION_MAX_LEVEL = 12;

const DEG = Math.PI / 180;
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const subtract = (a, b) => a.map((value, index) => value - b[index]);
const mix = (a, b, amount) => a.map((value, index) => value + (b[index] - value) * amount);
const wrap = (x, period) => ((x % period) + period) % period;
const smooth = (x) => {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};

function vector(value, name) {
  const result = [value?.[0] ?? value?.x, value?.[1] ?? value?.y, value?.[2] ?? value?.z];
  if (!result.every(Number.isFinite)) throw new TypeError(`${name} must be a finite vector`);
  return result;
}

function unit(value, fallback) {
  const length = Math.hypot(...value);
  return length > 1e-14 ? value.map((component) => component / length) : [...fallback];
}

function direction(longitude, latitude) {
  if (latitude >= 90) return [0, 0, 1];
  if (latitude <= -90) return [0, 0, -1];
  const lon = (wrap(longitude + 180, 360) - 180) * DEG;
  const lat = latitude * DEG;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

function checkLevel(z) {
  if (!Number.isInteger(z) || z < 0 || z > ELEVATION_MAX_LEVEL) {
    throw new RangeError(`Elevation level must be an integer from 0 to ${ELEVATION_MAX_LEVEL}`);
  }
}

/** Equiangular 2:1 pyramid, with wrapped x and north-to-south y. */
export function elevationTile(z, x, y) {
  checkLevel(z);
  const rows = 2 ** z;
  const columns = rows * 2;
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= rows) {
    throw new RangeError('Elevation tile coordinates are outside their level');
  }
  x = wrap(x, columns);
  const step = 180 / rows;
  const west = -180 + x * step;
  const north = 90 - y * step;
  return {
    key: `${z}/${x}/${y}`,
    z,
    x,
    y,
    bounds: [west, north - step, west + step, north],
    rect: [x / columns, 1 - (y + 1) / rows, 1 / columns, 1 / rows],
  };
}

function makeView(view, radiusKm, minHeightMeters, maxHeightMeters) {
  const eye = vector(view.eyeKm, 'Elevation eyeKm');
  const forward = unit(vector(view.forward, 'Elevation forward'), [0, 0, 0]);
  const right = unit(vector(view.right, 'Elevation right'), [0, 0, 0]);
  const up = unit(vector(view.up, 'Elevation up'), [0, 0, 0]);
  const { fovY, width, height } = view;
  const aspect = view.aspect ?? width / height;
  if (
    !(fovY > 0 && fovY < 180) ||
    !(width > 0) ||
    !(height > 0) ||
    !(aspect > 0) ||
    !Number.isFinite(aspect) ||
    [forward, right, up].some((axis) => Math.hypot(...axis) < 0.5)
  ) {
    throw new RangeError('Elevation view needs a valid perspective frame and viewport');
  }
  const eyeRadius = Math.hypot(...eye);
  const tanY = Math.tan((fovY * DEG) / 2);
  const tanX = tanY * aspect;
  const planes = [
    forward,
    right.map((value, i) => forward[i] * tanX + value),
    right.map((value, i) => forward[i] * tanX - value),
    up.map((value, i) => forward[i] * tanY + value),
    up.map((value, i) => forward[i] * tanY - value),
  ].map((plane) => unit(plane, [0, 0, 0]));
  // The inner and outer shells bound even negative continental heights and
  // mountains. Culling at the nominal ocean radius would hide raised ridges.
  const minimumRadius = radiusKm + minHeightMeters / 1000;
  const maximumRadius = radiusKm + maxHeightMeters / 1000;
  const horizon =
    Math.acos(clamp(minimumRadius / eyeRadius, -1, 1)) + Math.acos(minimumRadius / maximumRadius);
  return {
    eye,
    eyeRadius,
    eyeDirection: unit(eye, [1, 0, 0]),
    forward,
    right,
    up,
    tanX,
    tanY,
    planes,
    horizon,
    radiusKm,
    minimumRadius,
    maximumRadius,
    width,
    height,
  };
}

function tileCap(tile) {
  const [west, south, east, north] = tile.bounds;
  const normal = direction((west + east) / 2, (south + north) / 2);
  let cosine = 1;
  for (const longitude of [west, east]) {
    for (const latitude of [south, north]) {
      cosine = Math.min(cosine, dot(normal, direction(longitude, latitude)));
    }
  }
  // A <=180-degree geographic rectangle is enclosed by this cap: at fixed
  // longitude the midpoint dot product has no interior minimum in latitude.
  const angle = Math.acos(clamp(cosine, -1, 1));
  return {
    normal,
    angle,
    cosine: Math.cos(angle),
    sine: Math.sin(angle),
  };
}

function visible(tile, view) {
  const cap = tileCap(tile);
  if (Math.acos(clamp(dot(cap.normal, view.eyeDirection), -1, 1)) > view.horizon + cap.angle) {
    return false;
  }
  // Support function of the spherical cap and its radial height interval.
  // Inflating a bounding sphere by 12 km in EVERY direction would unnecessarily
  // request dozens of tiles at 30 m zoom, even though height is primarily radial.
  return view.planes.every((plane) => {
    const cosine = clamp(dot(plane, cap.normal), -1, 1);
    const maximum =
      cosine >= cap.cosine
        ? 1
        : cosine * cap.cosine + Math.sqrt(Math.max(0, 1 - cosine * cosine)) * cap.sine;
    const radius = maximum >= 0 ? view.maximumRadius : view.minimumRadius;
    return radius * maximum - dot(plane, view.eye) >= -1e-8;
  });
}

function rayDistance(view, u, v, radius) {
  const ray = unit(
    view.forward.map(
      (value, i) => value + u * view.tanX * view.right[i] + v * view.tanY * view.up[i]
    ),
    view.forward
  );
  const b = dot(view.eye, ray);
  const discriminant = b * b - dot(view.eye, view.eye) + radius * radius;
  if (discriminant < 0) return null;
  const distance = -b - Math.sqrt(discriminant);
  return distance > 0 ? distance : null;
}

function collectTiles(view, level, maximum) {
  const tiles = [];
  const pending = [elevationTile(0, 0, 0), elevationTile(0, 1, 0)];
  while (pending.length) {
    const tile = pending.pop();
    if (!visible(tile, view)) continue;
    if (tile.z === level) {
      tiles.push(tile);
      // This is only a failure signal. The caller retries the WHOLE view at a
      // lower level, never renders this arbitrarily truncated list.
      if (tiles.length > maximum) return null;
    } else {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          pending.push(elevationTile(tile.z + 1, tile.x * 2 + dx, tile.y * 2 + dy));
        }
      }
    }
  }
  return tiles;
}

function markNeighbours(tiles) {
  const keys = new Set(tiles.map((tile) => tile.key));
  for (const tile of tiles) {
    const rows = 2 ** tile.z;
    const has = (dx, dy) =>
      tile.y + dy >= 0 &&
      tile.y + dy < rows &&
      keys.has(elevationTile(tile.z, tile.x + dx, tile.y + dy).key);
    tile.edgeNeighbours = [has(-1, 0), has(1, 0), has(0, 1), has(0, -1)];
    tile.cornerNeighbours = [has(-1, -1), has(1, -1), has(-1, 1), has(1, 1)];
  }
}

/**
 * Select a complete, conservative same-level cover, bounded by maxTiles. Rays
 * choose sampling density; spherical-cap/frustum traversal provides coverage,
 * including the limb between sampled rays. An oversized/polar view uses only
 * the real global base instead of starting continental-scale COG downloads.
 */
export function planElevationTiles(view, options = {}) {
  const {
    maxTiles = 12,
    minLevel = 7,
    maxLevel = ELEVATION_MAX_LEVEL,
    gridSize = 129,
    maxLatitude = 80,
    pixelsPerVertex = 2,
    radiusKm = ELEVATION_EARTH_RADIUS_KM,
    minHeightMeters = -12000,
    maxHeightMeters = 12000,
  } = options;
  checkLevel(minLevel);
  checkLevel(maxLevel);
  if (
    minLevel > maxLevel ||
    !Number.isInteger(maxTiles) ||
    maxTiles < 1 ||
    !Number.isInteger(gridSize) ||
    gridSize < 3 ||
    !(pixelsPerVertex > 0) ||
    !(maxLatitude > 0 && maxLatitude <= 90) ||
    !Number.isFinite(minHeightMeters) ||
    !Number.isFinite(maxHeightMeters) ||
    minHeightMeters > maxHeightMeters ||
    !(radiusKm + minHeightMeters / 1000 > 0)
  ) {
    throw new RangeError('Invalid elevation tile planning limits');
  }
  let frame;
  try {
    frame = makeView(view, radiusKm, minHeightMeters, maxHeightMeters);
  } catch {
    return { tiles: [], level: null, reason: 'invalid-view' };
  }
  if (frame.eyeRadius <= frame.minimumRadius) {
    return { tiles: [], level: null, reason: 'inside-earth' };
  }
  const centerDistance = rayDistance(frame, 0, 0, frame.maximumRadius);
  if (centerDistance !== null) {
    const center = frame.eye.map((value, i) => value + centerDistance * frame.forward[i]);
    if (Math.abs(Math.asin(clamp(center[2] / Math.hypot(...center), -1, 1)) / DEG) > maxLatitude) {
      return { tiles: [], level: null, reason: 'polar-base' };
    }
  }
  const distances = [];
  for (const v of [-1, 0, 1]) {
    for (const u of [-1, 0, 1]) {
      const distance = rayDistance(frame, u, v, frame.maximumRadius);
      if (distance !== null) distances.push(distance);
    }
  }
  // No sample hitting the shell is not proof of invisibility; a narrow sliver
  // of terrain can still enter between rays. The traversal resolves that case.
  const distance = distances.length
    ? Math.min(...distances)
    : Math.max(1, -dot(frame.eye, frame.forward));
  const metresPerPixel = (2000 * distance * frame.tanY) / frame.height;
  const desired = clamp(
    Math.ceil(
      Math.log2((Math.PI * radiusKm * 1000) / ((gridSize - 1) * metresPerPixel * pixelsPerVertex))
    ),
    minLevel,
    maxLevel
  );
  for (let level = desired; level >= minLevel; level--) {
    const tiles = collectTiles(frame, level, maxTiles);
    if (!tiles) continue;
    if (tiles.some((tile) => tile.bounds[1] < -maxLatitude || tile.bounds[3] > maxLatitude)) {
      return { tiles: [], level: null, reason: 'polar-base' };
    }
    markNeighbours(tiles);
    const score = (tile) => {
      const [west, south, east, north] = tile.bounds;
      const center = direction((west + east) / 2, (south + north) / 2).map(
        (value) => value * radiusKm
      );
      const relative = subtract(center, frame.eye);
      return Math.acos(clamp(dot(unit(relative, frame.forward), frame.forward), -1, 1));
    };
    tiles.sort((a, b) => score(a) - score(b) || a.y - b.y || a.x - b.x);
    return {
      tiles,
      level: tiles.length ? level : null,
      requestedLevel: desired,
      reason: tiles.length ? (level < desired ? 'budget-lod' : 'detail') : 'outside-earth',
    };
  }
  return { tiles: [], level: null, requestedLevel: desired, reason: 'global-base' };
}

function indicesForGrid(columns, rows, skirts = []) {
  const stride = columns + 1;
  const bodyVertices = stride * (rows + 1);
  const vertexCount = bodyVertices + skirts.length;
  const ArrayType = vertexCount > 65535 ? Uint32Array : Uint16Array;
  const indices = new ArrayType(columns * rows * 6 + skirts.length * 6);
  let at = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const nw = y * stride + x;
      const ne = nw + 1;
      const sw = nw + stride;
      const se = sw + 1;
      // The NE-SW diagonal must also be used by sampleElevationMesh.
      indices.set([nw, sw, ne, ne, sw, se], at);
      at += 6;
    }
  }
  for (let i = 0; i < skirts.length; i++) {
    const next = (i + 1) % skirts.length;
    indices.set(
      [
        skirts[i],
        skirts[next],
        bodyVertices + i,
        skirts[next],
        bodyVertices + next,
        bodyVertices + i,
      ],
      at
    );
    at += 6;
  }
  return indices;
}

function gridNormals(positions, radials, columns, rows, global = false) {
  const normals = new Float32Array(positions.length);
  const stride = columns + 1;
  const at = (x, y) => positions.subarray((y * stride + x) * 3, (y * stride + x) * 3 + 3);
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= columns; x++) {
      const index = (y * stride + x) * 3;
      const radial = radials.subarray(index, index + 3);
      let normal;
      if (global && (y === 0 || y === rows)) {
        normal = radial;
      } else {
        const west = global && x === 0 ? columns - 1 : Math.max(0, x - 1);
        const east = global && x === columns ? 1 : Math.min(columns, x + 1);
        normal = unit(
          cross(
            subtract(at(x, Math.min(rows, y + 1)), at(x, Math.max(0, y - 1))),
            subtract(at(east, y), at(west, y))
          ),
          radial
        );
        if (dot(normal, radial) < 0) normal = normal.map((value) => -value);
      }
      normals.set(normal, index);
    }
  }
  return normals;
}

function readRaster(heights, width, height, longitude, latitude) {
  const px = wrap(((longitude + 180) / 360) * width - 0.5, width);
  const py = clamp(((90 - latitude) / 180) * height - 0.5, 0, height - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  let sum = 0;
  let weight = 0;
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      const value = heights[Math.min(height - 1, y0 + dy) * width + ((x0 + dx) % width)];
      const w = (dx ? px - x0 : 1 - (px - x0)) * (dy ? py - y0 : 1 - (py - y0));
      if (Number.isFinite(value)) {
        sum += value * w;
        weight += w;
      }
    }
  }
  return weight > 0 ? sum / weight : 0;
}

/** A global coarse mesh sampled from a north-up, pixel-centred height raster. */
export function elevationBaseMesh(heights, options = {}) {
  const {
    width,
    height,
    columns = 512,
    rows = 256,
    radiusKm = ELEVATION_EARTH_RADIUS_KM,
  } = options;
  if (
    ![width, height, columns, rows].every(Number.isInteger) ||
    width < 2 ||
    height < 2 ||
    columns < 4 ||
    rows < 2 ||
    heights?.length !== width * height ||
    !(radiusKm > 0)
  ) {
    throw new RangeError('Invalid global elevation raster or mesh dimensions');
  }
  const count = (columns + 1) * (rows + 1);
  const positions = new Float32Array(count * 3);
  const radials = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const nodeHeights = new Float32Array(count);
  const poles = [0, 0];
  for (let pole = 0; pole < 2; pole++) {
    let total = 0;
    let samples = 0;
    const offset = (pole ? height - 1 : 0) * width;
    for (let x = 0; x < width; x++) {
      const value = heights[offset + x];
      if (Number.isFinite(value)) {
        total += value;
        samples++;
      }
    }
    poles[pole] = samples ? total / samples : 0;
  }
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let y = 0; y <= rows; y++) {
    const latitude = 90 - (180 * y) / rows;
    for (let x = 0; x <= columns; x++) {
      const longitude = -180 + (360 * x) / columns;
      const index = y * (columns + 1) + x;
      const normal = direction(longitude, latitude);
      const heightMetres =
        y === 0
          ? poles[0]
          : y === rows
            ? poles[1]
            : readRaster(heights, width, height, longitude, latitude);
      nodeHeights[index] = heightMetres;
      minHeight = Math.min(minHeight, heightMetres);
      maxHeight = Math.max(maxHeight, heightMetres);
      positions.set(
        normal.map((value) => value * (radiusKm + heightMetres / 1000)),
        index * 3
      );
      radials.set(normal, index * 3);
      uv.set([x / columns, 1 - y / rows], index * 2);
    }
  }
  return {
    positions,
    basePositions: positions,
    normals: gridNormals(positions, radials, columns, rows, true),
    radials,
    uv,
    indices: indicesForGrid(columns, rows),
    nodeHeights,
    columns,
    rows,
    radiusKm,
    origin: [0, 0, 0],
    bounds: [-180, -90, 180, 90],
    rect: [0, 0, 1, 1],
    minHeight,
    maxHeight,
    global: true,
  };
}

/**
 * Sample the ACTUAL Cartesian coarse/fine triangle, including its chord sag,
 * not a sphere at interpolated DEM height. Skirts are deliberately excluded.
 * Positions returned here are absolute Earth-fixed kilometres.
 */
export function sampleElevationMesh(mesh, longitude, latitude) {
  if (!mesh || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const [west, south, east, north] = mesh.bounds;
  if (latitude < south - 1e-9 || latitude > north + 1e-9) return null;
  longitude += 360 * Math.round(((west + east) / 2 - longitude) / 360);
  if (longitude < west - 1e-9 || longitude > east + 1e-9) return null;
  const columns = mesh.columns ?? mesh.gridSize - 1;
  const rows = mesh.rows ?? mesh.gridSize - 1;
  const px = clamp(((longitude - west) / (east - west)) * columns, 0, columns);
  const py = clamp(((north - latitude) / (north - south)) * rows, 0, rows);
  const x = Math.min(columns - 1, Math.floor(px));
  const y = Math.min(rows - 1, Math.floor(py));
  const fx = px - x;
  const fy = py - y;
  const nw = y * (columns + 1) + x;
  const sw = nw + columns + 1;
  const nodes = fx + fy <= 1 ? [nw, nw + 1, sw] : [nw + 1, sw, sw + 1];
  const weights = fx + fy <= 1 ? [1 - fx - fy, fx, fy] : [1 - fy, 1 - fx, fx + fy - 1];
  const position = [...(mesh.origin || [0, 0, 0])];
  const normal = [0, 0, 0];
  let sourceHeightMeters = 0;
  for (let i = 0; i < 3; i++) {
    const node = nodes[i];
    for (let axis = 0; axis < 3; axis++) {
      position[axis] += mesh.positions[node * 3 + axis] * weights[i];
      normal[axis] += mesh.normals[node * 3 + axis] * weights[i];
    }
    sourceHeightMeters += (mesh.nodeHeights?.[node] || 0) * weights[i];
  }
  return {
    position,
    normal: unit(normal, direction(longitude, latitude)),
    heightMeters: (Math.hypot(...position) - mesh.radiusKm) * 1000,
    sourceHeightMeters,
  };
}

export function sampleElevationBase(base, longitude, latitude) {
  return sampleElevationMesh(base, longitude, latitude);
}

function blendAmount(x, y, size, edgeCells, neighbours, corners) {
  if (!(edgeCells > 0)) return 1;
  const west = x;
  const east = size - 1 - x;
  const north = y;
  const south = size - 1 - y;
  let distance = Infinity;
  for (const [index, value] of [west, east, south, north].entries()) {
    if (!neighbours[index]) distance = Math.min(distance, value);
  }
  // Concave boundaries need a corner transition too, even when both cardinal
  // neighbours exist. Otherwise three tiles would disagree at the fourth hole.
  for (const [index, value] of [
    Math.max(west, north),
    Math.max(east, north),
    Math.max(west, south),
    Math.max(east, south),
  ].entries()) {
    if (!corners[index]) distance = Math.min(distance, value);
  }
  return smooth(distance / edgeCells);
}

/**
 * A real terrain patch. The mesh uses a nearby origin to keep Float32 height
 * precision. Exposed edges meet the exact global coarse triangles; equal-level
 * shared edges retain their measured height. baseSample optionally supplies an
 * old visible mesh for the shader's transition, without changing final edges.
 */
export function elevationTileMesh(tile, heights, options = {}) {
  const {
    gridSize = 129,
    base,
    baseSample,
    edgeBlendCells = 2,
    skirtDepthMeters = 100,
    edgeNeighbours = tile.edgeNeighbours || [false, false, false, false],
    cornerNeighbours = tile.cornerNeighbours || [
      edgeNeighbours[0] && edgeNeighbours[3],
      edgeNeighbours[1] && edgeNeighbours[3],
      edgeNeighbours[0] && edgeNeighbours[2],
      edgeNeighbours[1] && edgeNeighbours[2],
    ],
  } = options;
  const intervals = gridSize - 1;
  if (
    !Number.isInteger(gridSize) ||
    gridSize < 3 ||
    gridSize > 257 ||
    (intervals & (intervals - 1)) !== 0 ||
    heights?.length !== gridSize * gridSize ||
    !base?.positions ||
    !(skirtDepthMeters >= 0) ||
    !(edgeBlendCells >= 0)
  ) {
    throw new RangeError('Local elevation needs a base and an endpoint-inclusive 2^n + 1 grid');
  }
  const { bounds, rect } = tile;
  const [west, south, east, north] = bounds;
  const radiusKm = base.radiusKm;
  const origin = direction((west + east) / 2, (south + north) / 2).map((v) => v * radiusKm);
  // Counter-clockwise in local map coordinates, so the skirt faces outside.
  const perimeter = [];
  if (skirtDepthMeters > 0) {
    for (let x = 0; x < intervals; x++) perimeter.push(x);
    for (let y = 0; y < intervals; y++) perimeter.push(y * gridSize + intervals);
    for (let x = intervals; x > 0; x--) perimeter.push(intervals * gridSize + x);
    for (let y = intervals; y > 0; y--) perimeter.push(y * gridSize);
  }
  const bodyCount = gridSize * gridSize;
  const count = bodyCount + perimeter.length;
  const positions = new Float32Array(count * 3);
  const basePositions = new Float32Array(count * 3);
  const radials = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const nodeHeights = new Float32Array(bodyCount);
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let y = 0; y < gridSize; y++) {
    const latitude = north - ((north - south) * y) / intervals;
    for (let x = 0; x < gridSize; x++) {
      const longitude = west + ((east - west) * x) / intervals;
      const index = y * gridSize + x;
      const radial = direction(longitude, latitude);
      const foundation = sampleElevationBase(base, longitude, latitude);
      if (!foundation) throw new RangeError('Global elevation base does not cover the tile');
      const transition = baseSample?.(longitude, latitude) || foundation;
      const value = heights[index];
      const real = Number.isFinite(value)
        ? radial.map((component) => component * (radiusKm + value / 1000))
        : foundation.position;
      const amount = blendAmount(x, y, gridSize, edgeBlendCells, edgeNeighbours, cornerNeighbours);
      const target = mix(foundation.position, real, amount);
      nodeHeights[index] = Number.isFinite(value) ? value : foundation.sourceHeightMeters;
      minHeight = Math.min(minHeight, nodeHeights[index]);
      maxHeight = Math.max(maxHeight, nodeHeights[index]);
      positions.set(subtract(target, origin), index * 3);
      basePositions.set(subtract(transition.position, origin), index * 3);
      radials.set(radial, index * 3);
      uv.set([longitude / 360 + 0.5, latitude / 180 + 0.5], index * 2);
    }
  }
  const normals = gridNormals(positions, radials, intervals, intervals);
  for (let i = 0; i < perimeter.length; i++) {
    const source = perimeter[i];
    const target = bodyCount + i;
    for (let axis = 0; axis < 3; axis++) {
      const drop = (radials[source * 3 + axis] * skirtDepthMeters) / 1000;
      positions[target * 3 + axis] = positions[source * 3 + axis] - drop;
      basePositions[target * 3 + axis] = basePositions[source * 3 + axis] - drop;
      radials[target * 3 + axis] = radials[source * 3 + axis];
      normals[target * 3 + axis] = normals[source * 3 + axis];
    }
    uv.set(uv.subarray(source * 2, source * 2 + 2), target * 2);
  }
  return {
    positions,
    basePositions,
    normals,
    radials,
    uv,
    indices: indicesForGrid(intervals, intervals, perimeter),
    nodeHeights,
    gridSize,
    columns: intervals,
    rows: intervals,
    radiusKm,
    origin,
    bounds: [...bounds],
    rect: [...rect],
    minHeight,
    maxHeight,
    bodyVertexCount: bodyCount,
    skirtVertexCount: perimeter.length,
    edgeNeighbours: [...edgeNeighbours],
    cornerNeighbours: [...cornerNeighbours],
  };
}
