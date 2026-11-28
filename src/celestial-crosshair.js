import { stellarDistance } from './xuntian-distance.js';
import { dot } from './orbit.js';
import { solarLabel } from './solar-targets.js';
import { getXuntianTarget, queryXuntianStars } from './xuntian-catalog.js';
import {
  DEEP_SKY_OBJECTS,
  deepSkyName,
  deepSkyTypeName,
  deepSkyRegionMatch,
} from './deep-sky-catalog.js';
import { deepSkyInScope } from './star-chart-symbols.js';

const DEG = Math.PI / 180;
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

// The observer supplies its actual view ray, apparent bodies, catalogue depth
// and visibility tests. This matcher has no orbit, mount or selection state.
export function identifyCelestialCrosshair({
  direction,
  fovY,
  displayHeight,
  bodies,
  language = 'zh',
  settings,
  showStars = true,
  limitMagnitude = Infinity,
  includeStar = () => true,
  outsideSky = () => false,
  blocked = () => false,
  candidates = null,
}) {
  const radius = crosshairTolerance(fovY, displayHeight) * DEG;
  const sky = { kind: 'sky', direction, toleranceDeg: radius / DEG };
  let best = null,
    bestDistance = Infinity;
  for (const body of bodies) {
    const angle = separation(direction, body.direction),
      edge = Math.max(0, angle - body.radiusRad);
    if (
      edge > radius ||
      (!candidates && edge >= bestDistance) ||
      (edge > 0 && blocked(body.direction))
    )
      continue;
    const entry = {
      kind: 'solar',
      id: 'solar:' + body.id,
      body: body.id,
      targetDirection: body.direction,
      distanceKm: body.distanceKm,
      name: solarLabel(body.id, language),
      angularDistanceDeg: angle / DEG,
      withinDisc: angle <= body.radiusRad,
    };
    candidates?.push(entry);
    if (edge >= bestDistance) continue;
    best = entry;
    bestDistance = edge;
    // The nearest actual disc hides every more distant body and catalogue star.
    if (best.withinDisc) return { ...sky, ...best };
  }
  if (showStars && typeof limitMagnitude === 'number' && !Number.isNaN(limitMagnitude)) {
    for (const star of queryXuntianStars(direction, radius / DEG, {
      maxMagnitude: limitMagnitude,
    })) {
      if (!includeStar(star) || star.mag - 2.5 * Math.log10(star.edgeWeight ?? 1) > limitMagnitude)
        continue;
      if (
        outsideSky(star.direction) ||
        bodies.some((body) => dot(star.direction, body.direction) > Math.cos(body.radiusRad)) ||
        blocked(star.direction)
      )
        continue;
      const angle = separation(direction, star.direction);
      if (angle > radius || (!candidates && angle >= bestDistance)) continue;
      const target = getXuntianTarget(star.id, language, settings?.skyCulture);
      if (!target) continue;
      const entry = {
        kind: 'star',
        id: target.id,
        name: target.name,
        identifier: target.identifier,
        targetDirection: star.direction,
        ...(target.asterisms?.length ? { asterisms: target.asterisms } : {}),
        magnitude: star.mag,
        ...stellarDistance(target.id),
        angularDistanceDeg: angle / DEG,
      };
      candidates?.push(entry);
      if (angle < bestDistance) {
        best = entry;
        bestDistance = angle;
      }
    }
  }
  let region = null,
    regionSize = Infinity;
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
        targetDirection: object.direction,
        name:
          getXuntianTarget('deep-sky:' + object.id.toLowerCase(), language, settings?.skyCulture)
            ?.name || deepSkyName(object, language),
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
      if (!candidates && angle >= bestDistance) continue;
      const visibleCenter =
        match.nearCenter &&
        object.type !== 'image-field' &&
        !outsideSky(object.direction) &&
        !bodies.some((body) => dot(object.direction, body.direction) > Math.cos(body.radiusRad)) &&
        !blocked(object.direction);
      if (match.withinRegion) candidates?.push({ ...entry, regionOnly: !visibleCenter });
      if (!visibleCenter) continue;
      if (!match.withinRegion) candidates?.push(entry);
      if (angle < bestDistance) {
        best = entry;
        bestDistance = angle;
      }
    }
  if (best) return { ...sky, ...best, ...(region && region.id !== best.id ? { region } : {}) };
  return region ? { ...sky, ...region, regionOnly: true } : sky;
}
