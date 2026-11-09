import { AU_LY } from './interstellar-math.js';

// J2000 equatorial axes -> Galactic axes (Hipparcos convention).
// This is a rotation about the observer, not a Galactocentric translation.
// https://docs.astropy.org/en/stable/api/astropy.coordinates.Galactic.html
const GALACTIC = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];
export function galacticVector(p) {
  return GALACTIC.map((row) => row[0] * p[0] + row[1] * p[1] + row[2] * p[2]);
}
export function mapProjection(p, mode = '3d', side = false, yaw = -0.55, pitch = 0.55) {
  const [x, y, z] = p;
  if (mode === '2d') return side ? [x, z, -y] : [x, y, z];
  const a = Math.cos(yaw) * x - Math.sin(yaw) * y;
  const b = Math.sin(yaw) * x + Math.cos(yaw) * y;
  return [a, Math.sin(pitch) * b + Math.cos(pitch) * z, Math.cos(pitch) * b - Math.sin(pitch) * z];
}
export function clampMapRadius(value) {
  return Number.isFinite(value) ? Math.max(AU_LY, Math.min(1e8, value)) : 20;
}
export function fittedMapRadius(center, points) {
  return clampMapRadius(
    Math.max(1, ...points.map((p) => Math.hypot(...p.map((v, i) => v - center[i])) * 1.2))
  );
}
export function nearestMapHit(hits, x, y, tolerance = 12) {
  let best = null,
    score = tolerance * tolerance;
  for (const hit of hits) {
    const d = (hit.x - x) ** 2 + (hit.y - y) ** 2;
    if (d < score) {
      best = hit;
      score = d;
    }
  }
  return best;
}
export function mapHitCandidates(hits, x, y, tolerance = 7) {
  const unique = new Map();
  for (const hit of hits) {
    const distance = Math.hypot(hit.x - x, hit.y - y);
    if (distance > tolerance) continue;
    const key = `${hit.kind}:${hit.index}`;
    if (!unique.has(key) || unique.get(key).distance > distance)
      unique.set(key, { ...hit, distance });
  }
  return [...unique.values()].sort((a, b) => a.distance - b.distance).slice(0, 8);
}
// One in-session bounded trail. Teleports explicitly start a new segment.
export function createMapTrail(capacity = 512) {
  let points = [],
    elapsed = 0;
  return {
    get points() {
      return points;
    },
    reset() {
      points = [];
      elapsed = 0;
    },
    update(position, dt, radius) {
      elapsed += dt;
      if (elapsed < 0.1) return;
      elapsed = 0;
      const last = points.at(-1);
      if (
        last &&
        Math.hypot(...position.map((v, i) => v - last[i])) < Math.max(AU_LY * 0.01, radius * 0.0005)
      )
        return;
      points.push([...position]);
      if (points.length > capacity) points.shift();
    },
  };
}
