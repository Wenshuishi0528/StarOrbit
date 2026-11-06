import { dot } from './orbit.js';
import { SURVEY_TILE_WIDTH } from './survey-lab-math.js';

const span = Math.tan((SURVEY_TILE_WIDTH * Math.PI) / 180);
// Same J2000 equatorial-to-galactic rotation used by the main sky shader.
const galactic = [
  [-0.05487556, -0.87343709, -0.48383502],
  [0.49410943, -0.44482963, 0.74698224],
  [-0.867666149, -0.198076373, 0.455983776],
];
export const faceNames = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
// Face axes map a direction to the source JPEG's left-to-right, top-to-bottom coordinates.
const faceAxes = [
  [
    [1, 0, 0],
    [0, 0, -1],
    [0, -1, 0],
  ],
  [
    [-1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ],
  [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ],
  [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, -1],
  ],
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, -1, 0],
  ],
  [
    [0, 0, -1],
    [-1, 0, 0],
    [0, -1, 0],
  ],
];

export function projectStar(field, direction) {
  const z = dot(field.center, direction);
  if (z <= 0) return null;
  const x = 0.5 - dot(field.east, direction) / (2 * span * z),
    y = 0.5 - dot(field.north, direction) / (2 * span * z);
  return x >= 0 && x < 1 && y >= 0 && y < 1 ? { x, y } : null;
}
export function fieldRay(field, x, y) {
  return field.center.map(
    (c, i) => c + (1 - 2 * x) * span * field.east[i] + (1 - 2 * y) * span * field.north[i]
  );
}
export const galaxyDirection = (direction) => galactic.map((row) => dot(row, direction));
export function cubeFace(x, y, z) {
  const a = Math.abs(x),
    b = Math.abs(y),
    c = Math.abs(z);
  return a >= b && a >= c ? (x >= 0 ? 0 : 1) : b >= c ? (y >= 0 ? 2 : 3) : z >= 0 ? 4 : 5;
}
export function faceUV(direction, face, out = [0, 0]) {
  const [normal, u, v] = faceAxes[face],
    d = dot(direction, normal);
  out[0] = (dot(direction, u) / d + 1) / 2;
  out[1] = (dot(direction, v) / d + 1) / 2;
  return out;
}

// Clip the four field corners to each cube face. Both sky projection and face
// boundaries are projective lines, so UV extrema occur at polygon vertices.
function clip(polygon, plane) {
  if (!polygon.length) return [];
  const out = [];
  for (let j = 0; j < polygon.length; j++) {
    const a = polygon[(j + polygon.length - 1) % polygon.length],
      b = polygon[j],
      da = dot(a, plane),
      db = dot(b, plane);
    if (da >= 0 !== db >= 0) {
      const f = da / (da - db);
      out.push(a.map((x, i) => x + f * (b[i] - x)));
    }
    if (db >= 0) out.push(b);
  }
  return out;
}
export function galaxyCrops(field) {
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([x, y]) => galaxyDirection(fieldRay(field, x, y)));
  const result = [];
  for (let i = 0; i < 6; i++) {
    const [n, u, v] = faceAxes[i];
    let polygon = corners;
    for (const axis of [u, v])
      for (const sign of [-1, 1])
        polygon = clip(
          polygon,
          n.map((x, j) => x + sign * axis[j])
        );
    if (polygon.length < 3) continue;
    const uv = polygon.map((p) => faceUV(p, i)),
      xs = uv.map((p) => p[0]),
      ys = uv.map((p) => p[1]);
    result.push({
      face: i,
      minX: Math.max(0, Math.min(...xs)),
      maxX: Math.min(1, Math.max(...xs)),
      minY: Math.max(0, Math.min(...ys)),
      maxY: Math.min(1, Math.max(...ys)),
    });
  }
  return result;
}
export function galaxyFieldVectors(field) {
  return {
    center: galaxyDirection(field.center),
    east: galaxyDirection(field.east).map((x) => x * span),
    north: galaxyDirection(field.north).map((x) => x * span),
  };
}

export function tileCoverage(field, completed) {
  const result = Array.from({ length: 4 }, () => ({
    count: 0,
    seconds: 0,
    first: Infinity,
    last: -Infinity,
  }));
  for (const job of completed) {
    if (job.field !== field.id || !Number.isInteger(job.tile) || job.tile < 0 || job.tile > 3)
      continue;
    const stop = job.end ?? job.start + job.duration;
    if (!Number.isFinite(job.start) || !Number.isFinite(stop) || stop <= job.start) continue;
    const tile = result[job.tile];
    tile.count++;
    tile.seconds += stop - job.start;
    tile.first = Math.min(tile.first, job.start);
    tile.last = Math.max(tile.last, stop);
  }
  return result;
}

export function decodeTycho(record) {
  if (!record) return [];
  const raw = Uint8Array.from(atob(record.base64), (c) => c.charCodeAt(0));
  if (raw.byteLength !== record.count * 7) throw Error('高密星表切片无效');
  const data = new DataView(raw.buffer),
    stars = [];
  for (let i = 0; i < raw.length; i += 7) {
    const colour = raw[i + 6];
    stars.push({
      x: (data.getUint16(i, true) + 0.5) / 65536,
      y: (data.getUint16(i + 2, true) + 0.5) / 65536,
      magnitude: data.getInt16(i + 4, true) / 100,
      bv: colour === 255 ? null : colour / 75 - 0.5,
    });
  }
  return stars;
}
