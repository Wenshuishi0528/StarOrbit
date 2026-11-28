import { groundHit } from './xuntian-view-math.js';
import { solarApparent } from './solar-system.js';
import { identifyCelestialCrosshair } from './celestial-crosshair.js';

export { crosshairTolerance } from './celestial-crosshair.js';

const normalized = (v) =>
  Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) && Math.hypot(...v) > 0
    ? v.map((x) => x / Math.hypot(...v))
    : null;
// Identification is read-only: it describes this optical ray, never the
// selected tracking target. The eye is already the absolute optical entrance.
export function identifyXuntianCrosshair(
  frame,
  {
    surface = null,
    groundSurface,
    displayHeight = 300,
    cityFinder = null,
    limitMagnitude = Infinity,
    blocked = () => false,
    candidates = null,
  } = {}
) {
  const direction = normalized(frame?.axes?.forward),
    eye = frame?.eyeKm,
    language = frame?.language || 'zh';
  if (
    !direction ||
    !Array.isArray(eye) ||
    eye.length !== 3 ||
    !eye.every(Number.isFinite) ||
    !frame?.q?.earthAxes
  )
    return { kind: 'unavailable' };
  // A terrain miss is authoritative too: a ray through a real depression or
  // beside a mountain must not be replaced with a hit on the old sphere.
  const ground =
    groundSurface === undefined
      ? surface?.kind === 'earth'
        ? surface
        : groundHit(eye, direction, frame.q.earthAxes)
      : groundSurface;
  if (surface?.kind === 'station' && surface.distanceKm < (ground?.distanceKm ?? Infinity))
    return { ...surface };
  if (ground)
    return {
      ...ground,
      city: cityFinder?.nearest(ground.latitude, ground.longitude, language) || null,
    };
  return identifyCelestialCrosshair({
    direction,
    fovY: frame.fovY,
    displayHeight,
    language,
    bodies: solarApparent(frame.q, eye)
      .filter((body) => !body.behindEarth)
      .sort((a, b) => a.distanceKm - b.distanceKm),
    settings: frame.chartSettings,
    showStars: frame.showStars !== false,
    limitMagnitude,
    candidates,
    outsideSky: (ray) => !!groundHit(eye, ray, frame.q.earthAxes),
    blocked,
  });
}
