import { Matrix4, Quaternion, Vector3 } from 'three';
import { EARTH_RADIUS, dot } from './orbit.js';
import { geographicVector } from './geography-math.js';
import { groundHit } from './xuntian-view-math.js';
import { cameraAxes, nudge } from './xuntian-pointing.js';
import { orbitalAxes } from './xuntian-formation-math.js';

const D = Math.PI / 180,
  localZ = new Vector3(0, 0, 1);
const transform = (basis, v) =>
  [0, 1, 2].map((i) => basis.reduce((sum, a, j) => sum + a[i] * v[j], 0));
export function wrapRoll(degrees) {
  if (!Number.isFinite(degrees)) return 0;
  const n = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return n === -180 && degrees > 0 ? 180 : n;
}
// Positive image angle carries the top of the image clockwise. The optical
// axis (camera -Z) stays exactly fixed. This pose also drives the actual GLB.
export function opticalPose(base, roll) {
  return base
    .clone()
    .multiply(new Quaternion().setFromAxisAngle(localZ, roll * D))
    .normalize();
}
export function steerDetector(base, x, y, roll) {
  const optical = opticalPose(base, roll);
  nudge(optical, x, y);
  return base.copy(opticalPose(optical, -roll));
}
function orbitalRotation(q) {
  const basis = orbitalAxes(q);
  if (!basis) return null;
  return new Quaternion()
    .setFromRotationMatrix(new Matrix4().makeBasis(...basis.map((v) => new Vector3(...v))))
    .normalize();
}
// Store the complete optical pose, including roll, in the along-track,
// orbit-normal, radial frame. A later epoch changes only that frame.
export function orbitRelativePose(q, optical) {
  const orientation = orbitalRotation(q);
  return orientation ? orientation.invert().multiply(optical).normalize() : null;
}
export function orbitCarriedPose(q, relative) {
  const orientation = orbitalRotation(q);
  return orientation && relative ? orientation.multiply(relative).normalize() : null;
}
export function cityAnchor(city) {
  const lat = city.latitude * D,
    lon = city.longitude * D;
  return {
    kind: 'ground',
    cityId: city.id,
    latitude: city.latitude,
    longitude: city.longitude,
    localUp: [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)],
  };
}
export function pinCrosshair(eye, axes, base, q, terrainHit) {
  const hit = terrainHit === undefined ? groundHit(eye, axes.forward, q.earthAxes) : terrainHit;
  if (!hit) return { kind: 'sky', direction: [...axes.forward] };
  const up = cameraAxes(base).up;
  return {
    kind: 'ground',
    latitude: hit.latitude,
    longitude: hit.longitude,
    localUp: q.earthAxes.map((v) => dot(v, up)),
  };
}
export function trackGround(anchor, eye, q, elevationMeters = 0) {
  const local = geographicVector(anchor.longitude, anchor.latitude, 1),
    normal = transform(q.earthAxes, local);
  const surfaceRadius =
    EARTH_RADIUS + (Number.isFinite(elevationMeters) ? elevationMeters : 0) / 1000;
  const ray = normal.map((x, i) => x * surfaceRadius - eye[i]),
    range = Math.hypot(...ray);
  if (range < 1e-8) return null;
  return {
    direction: ray.map((x) => x / range),
    up: transform(q.earthAxes, anchor.localUp),
    visible: dot(normal, eye) >= EARTH_RADIUS - 1e-8,
    range,
  };
}
export function groundAttitude(track, previous) {
  const f = new Vector3(...track.direction).normalize(),
    reference = new Vector3(...track.up);
  const project = (v) => v.addScaledVector(f, -v.dot(f));
  let up = project(reference);
  if (up.lengthSq() < 1e-8) up = project(new Vector3(...cameraAxes(previous).up));
  if (up.lengthSq() < 1e-8)
    up = project(new Vector3(Math.abs(f.x) < 0.8 ? 1 : 0, Math.abs(f.x) < 0.8 ? 0 : 1, 0));
  const right = f.clone().cross(up).normalize();
  up = right.clone().cross(f).normalize();
  return new Quaternion()
    .setFromRotationMatrix(new Matrix4().makeBasis(right, up, f.negate()))
    .normalize();
}
const fold = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
const degreePair = (p) => p.latitude.toFixed(2) + '°, ' + p.longitude.toFixed(2) + '°';
export function createCityFinder(labels) {
  let entries, byId;
  function index() {
    if (entries) return;
    entries = labels
      .filter(
        (p) =>
          (p.kind === 'city' || p.kind === 'capital') &&
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lon)
      )
      .map((p) => ({
        p,
        normal: geographicVector(p.lon, p.lat, 1),
        forms: [...new Set([p.zh, p.en, p.ru, p.fr].filter(Boolean).map(fold))],
      }));
    byId = new Map(entries.map((entry) => ['city:' + entry.p.id, entry]));
  }
  function result(entry, language, score = 0) {
    const { p } = entry,
      out = {
        id: 'city:' + p.id,
        type: 'city',
        name: p[language] || p.en || p.zh,
        latitude: p.lat,
        longitude: p.lon,
        fov: 12,
        score,
      };
    out.identifier = degreePair(out);
    return out;
  }
  return {
    get(id, language) {
      index();
      const entry = byId.get(id);
      return entry ? result(entry, language) : null;
    },
    nearest(latitude, longitude, language = 'zh', { maxDistanceKm = 100 } = {}) {
      if (
        !Number.isFinite(latitude) ||
        Math.abs(latitude) > 90 ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(maxDistanceKm) ||
        maxDistanceKm < 0
      )
        return null;
      index();
      const normal = geographicVector(longitude, latitude, 1);
      let best = null,
        bestDot = Math.cos(Math.min(Math.PI, maxDistanceKm / EARTH_RADIUS)) - 1e-14;
      for (const entry of entries) {
        const alignment = dot(normal, entry.normal);
        if (alignment > bestDot) {
          best = entry;
          bestDot = alignment;
        }
      }
      if (!best) return null;
      // Chord length remains accurate at city centres and across the date line.
      const chord = Math.hypot(...normal.map((v, i) => v - best.normal[i]));
      const distanceKm = 2 * EARTH_RADIUS * Math.asin(Math.min(1, chord / 2));
      return distanceKm <= maxDistanceKm + 1e-8 ? { ...result(best, language), distanceKm } : null;
    },
    search(text, language, limit = 7) {
      const q = fold(text).replace(/市$/u, '');
      if (!q) return [];
      index();
      const hits = [];
      for (const entry of entries) {
        let score = Infinity;
        for (const word of entry.forms) {
          if (word === q) {
            score = 0;
            break;
          }
          if (word.startsWith(q)) score = Math.min(score, 1);
          else if (q.length > 1 && word.includes(q)) score = Math.min(score, 2);
        }
        if (Number.isFinite(score)) hits.push({ entry, score });
      }
      hits.sort(
        (a, b) =>
          a.score - b.score ||
          a.entry.p.rank - b.entry.p.rank ||
          a.entry.p.id.localeCompare(b.entry.p.id)
      );
      return hits.slice(0, limit).map(({ entry, score }) => result(entry, language, score));
    },
  };
}
