import { HelioState, GeoMoon, RotationAxis } from 'astronomy-engine';
import { AU, earthAxes } from './orbit.js';

// Physical positions in AU, J2000 equatorial axes, at the same geometric epoch.
// These are not light-time corrected apparent directions used by the sky view.
export const SOLAR_WORLD_BODIES = Object.freeze([
  { id: 'Sun', name: '太阳', radiusKm: 695700, color: 0xffd890, period: 0 },
  { id: 'Mercury', name: '水星', radiusKm: 2440.53, color: 0xb5aaa0, period: 87.969 },
  { id: 'Venus', name: '金星', radiusKm: 6051.8, color: 0xe7c58b, period: 224.701 },
  { id: 'Earth', name: '地球', radiusKm: 6378.137, color: 0x5d9fce, period: 365.256 },
  { id: 'Moon', name: '月球', radiusKm: 1737.4, color: 0xbcb9ae, period: 27.322 },
  { id: 'Mars', name: '火星', radiusKm: 3396.19, color: 0xc9774b, period: 686.98 },
  { id: 'Jupiter', name: '木星', radiusKm: 71492, color: 0xd8bea0, period: 4332.589 },
  { id: 'Saturn', name: '土星', radiusKm: 60268, color: 0xe0c994, period: 10759.22 },
  { id: 'Uranus', name: '天王星', radiusKm: 25559, color: 0x9bd4da, period: 30685.4 },
  { id: 'Neptune', name: '海王星', radiusKm: 24764, color: 0x4b77ce, period: 60189 },
]);
const DAY = 86400000;
export function solarWorldState(time) {
  if (!Number.isFinite(time)) throw new RangeError('Invalid solar system time');
  const date = new Date(time);
  const states = SOLAR_WORLD_BODIES.map((body) => {
    const p = HelioState(body.id, date);
    return { ...body, position: [p.x, p.y, p.z], velocity: [p.vx, p.vy, p.vz] };
  });
  return states;
}
export function solarWorldOrbit(id, time, count = 192) {
  const body = SOLAR_WORLD_BODIES.find((b) => b.id === id);
  if (
    !body?.period ||
    !Number.isFinite(time) ||
    !Number.isInteger(count) ||
    count < 8 ||
    count > 1024
  )
    throw new RangeError('Invalid orbit sampling request');
  const result = [];
  for (let i = 0; i <= count; i++) {
    const date = new Date(time + (i / count - 0.5) * body.period * DAY);
    const p = id === 'Moon' ? GeoMoon(date) : HelioState(id, date);
    result.push([p.x, p.y, p.z]);
  }
  return result;
}
export function solarWorldBodyAxes(id, time) {
  if (id === 'Earth') return earthAxes(time);
  const a = RotationAxis(id, new Date(time)),
    ra = (a.ra * Math.PI) / 12,
    spin = (a.spin * Math.PI) / 180,
    north = [a.north.x, a.north.y, a.north.z],
    node = [-Math.sin(ra), Math.cos(ra), 0],
    east = [
      north[1] * node[2] - north[2] * node[1],
      north[2] * node[0] - north[0] * node[2],
      north[0] * node[1] - north[1] * node[0],
    ],
    x = node.map((v, i) => v * Math.cos(spin) + east[i] * Math.sin(spin)),
    y = node.map((v, i) => -v * Math.sin(spin) + east[i] * Math.cos(spin));
  return [x, y, north];
}
export function solarWorldSiteDirection(site, time) {
  const lat = Number(site?.latitude),
    lon = Number(site?.longitude);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180)
    return null;
  const a = (lat * Math.PI) / 180,
    b = (lon * Math.PI) / 180;
  const local = [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)];
  const axes = earthAxes(time);
  return [0, 1, 2].map((i) => axes.reduce((s, axis, j) => s + axis[i] * local[j], 0));
}
export function solarWorldDisplayRadius(body, distance, enhanced = true) {
  const physical = body.radiusKm / AU;
  if (!enhanced) return physical;
  const limit = body.id === 'Moon' ? 0.012 : body.id === 'Sun' ? 0.09 : 0.045;
  return Math.max(physical, Math.min(limit, Math.max(0, distance) * 0.009));
}
