import { dot } from './orbit.js';
import { solarApparent } from './solar-system.js';
import { solarLabel } from './solar-targets.js';
import { getXuntianTarget, queryXuntianStars } from './xuntian-catalog.js';
import { groundHit } from './xuntian-view-math.js';
import {
  DEEP_SKY_OBJECTS,
  deepSkyName,
  deepSkyTypeName,
  deepSkyRegionMatch,
} from './deep-sky-catalog.js';
import { deepSkyInScope } from './star-chart-symbols.js';

const DEG = Math.PI / 180;
const normalized = (v) =>
  Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) && Math.hypot(...v) > 0
    ? v.map((x) => x / Math.hypot(...v))
    : null;
const separation = (a, b) =>
  2 * Math.asin(Math.min(1, Math.hypot(...a.map((v, i) => v - b[i])) / 2));

// Six logical display pixels around the reticle, capped at half a degree in
// wide views. Narrowing or enlarging the eyepiece tightens the angular match.
export function crosshairTolerance(fovY, displayHeight) {
  if (
    !Number.isFinite(fovY) ||
    fovY <= 0 ||
    fovY >= 180 ||
    !Number.isFinite(displayHeight) ||
    displayHeight <= 0
  )
    return 0;
  return Math.min(0.5, Math.atan((12 * Math.tan((fovY * DEG) / 2)) / displayHeight) / DEG);
}

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
  const radius = crosshairTolerance(frame.fovY, displayHeight) * DEG;
  const bodies = solarApparent(frame.q, eye)
    .filter((body) => !body.behindEarth)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const sky = { kind: 'sky', direction, toleranceDeg: radius / DEG };
  let best = null,
    bestDistance = Infinity;
  for (const body of bodies) {
    const angle = separation(direction, body.direction),
      edge = Math.max(0, angle - body.radiusRad);
    if (edge > radius || edge >= bestDistance || (edge > 0 && blocked(body.direction))) continue;
    best = {
      kind: 'solar',
      id: 'solar:' + body.id,
      body: body.id,
      name: solarLabel(body.id, language),
      angularDistanceDeg: angle / DEG,
      withinDisc: angle <= body.radiusRad,
    };
    bestDistance = edge;
    // The nearest actual disc hides every more distant body and catalogue star.
    if (best.withinDisc) return { ...sky, ...best };
  }
  if (
    frame.showStars !== false &&
    typeof limitMagnitude === 'number' &&
    !Number.isNaN(limitMagnitude)
  ) {
    for (const star of queryXuntianStars(direction, radius / DEG, {
      maxMagnitude: limitMagnitude,
    })) {
      if (star.mag - 2.5 * Math.log10(star.edgeWeight ?? 1) > limitMagnitude) continue;
      if (
        groundHit(eye, star.direction, frame.q.earthAxes) ||
        bodies.some((body) => dot(star.direction, body.direction) > Math.cos(body.radiusRad)) ||
        blocked(star.direction)
      )
        continue;
      const angle = separation(direction, star.direction);
      if (angle > radius || angle >= bestDistance) continue;
      const target = getXuntianTarget(star.id, language);
      if (!target) continue;
      best = {
        kind: 'star',
        id: target.id,
        name: target.name,
        identifier: target.identifier,
        magnitude: star.mag,
        angularDistanceDeg: angle / DEG,
      };
      bestDistance = angle;
    }
  }
  let region = null,
    regionSize = Infinity;
  const settings = frame.chartSettings;
  const deepSkyEnabled = settings?.deepSkyObjects !== false && !blocked(direction);
  if (deepSkyEnabled)
    for (const object of DEEP_SKY_OBJECTS) {
      if (settings && !deepSkyInScope(object, settings.deepSkyScope)) continue;
      const match = deepSkyRegionMatch(object, direction, radius / DEG);
      if (!match) continue;
      const entry = {
        kind: 'deep-sky',
        id: 'deep-sky:' + object.id.toLowerCase(),
        identifier: object.id,
        name: deepSkyName(object, language),
        category: deepSkyTypeName(object.type, language),
        angularDistanceDeg: match.angularDistanceDeg,
        withinRegion: match.withinRegion,
        imageField: object.type === 'image-field',
      };
      if (match.withinRegion && object.regionRadiusRad < regionSize) {
        region = entry;
        regionSize = object.regionRadiusRad;
      }
      // A nearby star is still a star, even when projected inside a galaxy. Only
      // compare POINT matches here; the extended-region context is kept below.
      const angle = match.angularDistanceDeg * DEG;
      if (
        !match.nearCenter ||
        angle >= bestDistance ||
        object.type === 'image-field' ||
        groundHit(eye, object.direction, frame.q.earthAxes) ||
        bodies.some((body) => dot(object.direction, body.direction) > Math.cos(body.radiusRad)) ||
        blocked(object.direction)
      )
        continue;
      best = entry;
      bestDistance = angle;
    }
  if (best) return { ...sky, ...best, ...(region && region.id !== best.id ? { region } : {}) };
  return region ? { ...sky, ...region, regionOnly: true } : sky;
}
