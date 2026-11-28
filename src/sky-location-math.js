import { Constellation } from 'astronomy-engine';
import { dot, unit } from './orbit.js';
import { equatorial } from './environment-math.js';
import { getSkyCulture } from './sky-cultures.js';

const degree = Math.PI / 180;

export function skyAngles(direction) {
  const [x, y, z] = direction;
  const ra = (((Math.atan2(y, x) / degree) % 360) + 360) % 360;
  return { ra, dec: Math.atan2(z, Math.hypot(x, y)) / degree };
}

// NDC coordinates use +y up, the camera's optical axes include its current roll.
export function rayInView(view, x, y) {
  const tan = Math.tan((view.fovY * degree) / 2);
  return unit(
    view.forward.map((v, i) => v + tan * (x * view.aspect * view.right[i] + y * view.up[i]))
  );
}

export function projectRay(view, ray) {
  const z = dot(view.forward, ray) * Math.tan((view.fovY * degree) / 2);
  return z > 0 ? [dot(ray, view.right) / (z * view.aspect), dot(ray, view.up) / z] : null;
}

export function frameOutline(view) {
  const d = view.circleDiameter;
  if (!(d > 0 && view.width > 0 && view.height > 0)) {
    const corners = [
      [-1, 1],
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
    ];
    const rays = [];
    for (let side = 0; side < 4; side++) {
      const [a, b] = corners[side],
        [c, d] = corners[side + 1];
      for (let step = 0; step < 12; step++)
        rays.push(rayInView(view, a + ((c - a) * step) / 12, b + ((d - b) * step) / 12));
    }
    return [...rays, rays[0]];
  }
  // Intersect the actual field stop with the rectangular detector.
  return Array.from({ length: 73 }, (_, i) => {
    const x = Math.cos((2 * Math.PI * i) / 72),
      y = Math.sin((2 * Math.PI * i) / 72);
    const r = Math.min(d / 2, view.width / (2 * Math.abs(x)), view.height / (2 * Math.abs(y)));
    return rayInView(view, (2 * x * r) / view.width, (2 * y * r) / view.height);
  });
}

const western = getSkyCulture('western');
const constellations = new Map(western.asterisms.map((item) => [item.id.toLowerCase(), item]));
export function westernRegion(direction) {
  const { ra, dec } = skyAngles(direction);
  return constellations.get(Constellation(ra / 15, dec).symbol.toLowerCase());
}

const charts = new WeakMap();
export function locationChart(culture) {
  if (!charts.has(culture)) {
    const line = (coords) => coords.map(([ra, dec]) => equatorial(ra, dec));
    charts.set(culture, {
      groups: culture.asterisms.map((item) => ({
        item,
        center: equatorial(item.ra, item.dec),
        lines: item.lines.map(line),
      })),
      boundaries: culture.boundaries.map(line),
    });
  }
  return charts.get(culture);
}

export function localRegion(direction, culture) {
  if (culture.id !== 'chinese') return westernRegion(direction);
  // Chinese asterisms describe member patterns. Their nearest catalogue centre
  // is a useful landmark and makes no claim that the pointing is inside it.
  let largest = -Infinity,
    nearest = null;
  for (const { item, center } of locationChart(culture).groups) {
    const value = dot(direction, center);
    if (value > largest) {
      largest = value;
      nearest = item;
    }
  }
  return nearest;
}

// North-up sky charts put increasing right ascension to the left.
export function northUpBasis(ra, dec) {
  const a = ra * degree,
    d = dec * degree;
  return {
    forward: equatorial(ra, dec),
    right: [Math.sin(a), -Math.cos(a), 0],
    up: [-Math.cos(a) * Math.sin(d), -Math.sin(a) * Math.sin(d), Math.cos(d)],
  };
}
