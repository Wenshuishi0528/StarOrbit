import { GeoVector, Illumination, RotationAxis } from 'astronomy-engine';
import { AU, EARTH_RADIUS, SUN_RADIUS, cross, dot, norm, sub, unit } from './orbit.js';
import { MOON_RADIUS, sharedLunarEphemeris } from './moon-math.js';

// JPL equatorial radii in km. Colours approximate integrated visible light;
// they are sRGB presentation colours, not the hues of enhanced spacecraft images.
const bodies = [
  ['Sun', SUN_RADIUS, 0xfffaf0],
  ['Moon', MOON_RADIUS, 0xeeeae5],
  ['Mercury', 2440.53, 0xf1e8d8],
  ['Venus', 6051.8, 0xfffcf4],
  ['Mars', 3396.19, 0xffaa82],
  ['Jupiter', 71492, 0xffedcf],
  ['Saturn', 60268, 0xffe7b5],
  ['Uranus', 25559, 0xc0e2db],
  ['Neptune', 24764, 0xadcfd8],
];
const minute = 60000,
  cache = new Map();
const interpolate = (a, b, f) => a.map((x, i) => x + (b[i] - x) * f);

function bodyAt(id, time) {
  const date = new Date(time),
    mag = Illumination(id, date).mag;
  if (id === 'Moon') {
    const { position, axes } = sharedLunarEphemeris.at(time);
    return { position, north: axes[2], prime: axes[0], mag };
  }
  const v = GeoVector(id, date, false),
    position = [v.x * AU, v.y * AU, v.z * AU];
  // The light we receive left the rotating surface earlier than the observation.
  const emission = new Date(time - (norm(position) / 299792.458) * 1000);
  const axis = RotationAxis(id, emission),
    ra = (axis.ra * Math.PI) / 12,
    spin = (axis.spin * Math.PI) / 180;
  const north = [axis.north.x, axis.north.y, axis.north.z],
    node = [-Math.sin(ra), Math.cos(ra), 0],
    east = cross(north, node);
  return {
    position,
    north,
    prime: node.map((x, i) => x * Math.cos(spin) + east[i] * Math.sin(spin)),
    mag,
  };
}
function sample(time) {
  if (cache.has(time)) return cache.get(time);
  const values = bodies.map(([id]) => {
    // The orbital simulator extends beyond the planetary theory's numeric range.
    // One unavailable body must not prevent the spacecraft scene from rendering.
    try {
      const row = bodyAt(id, time);
      return Number.isFinite(row.mag) &&
        [...row.position, ...row.north, ...row.prime].every(Number.isFinite)
        ? row
        : null;
    } catch {
      return null;
    }
  });
  cache.set(time, values);
  if (cache.size > 4) cache.delete(cache.keys().next().value);
  return values;
}

export function solarApparent(q, eyeKm = q?.position) {
  if (!Number.isFinite(q?.t) || !eyeKm?.every(Number.isFinite) || eyeKm.length !== 3) return [];
  const start = Math.floor(q.t / minute) * minute,
    f = (q.t - start) / minute;
  const a = sample(start),
    b = sample(start + minute);
  const sun = q.sun ?? (a[0] && b[0] ? interpolate(a[0].position, b[0].position, f) : null);
  if (!sun) return [];
  const result = [];
  for (const [i, [id, radiusKm, color]] of bodies.entries()) {
    if (!a[i] || !b[i]) continue;
    const position = id === 'Sun' ? sun : interpolate(a[i].position, b[i].position, f);
    const line = sub(position, eyeKm),
      distanceKm = norm(line);
    if (distanceKm <= radiusKm) continue;
    const direction = unit(line),
      north = unit(interpolate(a[i].north, b[i].north, f));
    const axis = interpolate(a[i].prime, b[i].prime, f),
      prime = unit(
        sub(
          axis,
          north.map((x) => x * dot(axis, north))
        )
      );
    const sunDirection = id === 'Sun' ? direction.map((x) => -x) : unit(sub(sun, position));
    const mag = a[i].mag + (b[i].mag - a[i].mag) * f + 5 * Math.log10(distanceKm / norm(position));
    const illuminatedFraction =
      id === 'Sun' ? 1 : Math.min(1, Math.max(0, (1 - dot(direction, sunDirection)) / 2));
    const towardsEarth = -dot(eyeKm, direction);
    const behindEarth =
      towardsEarth > 0 && towardsEarth < distanceKm && norm(cross(eyeKm, direction)) < EARTH_RADIUS;
    result.push({
      id,
      direction,
      radiusRad: Math.asin(radiusKm / distanceKm),
      mag,
      north,
      prime,
      sunDirection,
      color,
      distanceKm,
      illuminatedFraction,
      behindEarth,
    });
  }
  return result;
}
