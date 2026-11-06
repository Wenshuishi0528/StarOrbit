import { validateObserver } from './pass-prediction.js';

export const OBSERVER_KEY = 'starorbit-pass-observer-v1';
export function lastObserver() {
  try {
    return validateObserver(JSON.parse(localStorage.getItem(OBSERVER_KEY)));
  } catch {
    return null;
  }
}
export function rememberObserver(site) {
  try {
    localStorage.setItem(OBSERVER_KEY, JSON.stringify(validateObserver(site)));
    return true;
  } catch {
    return false;
  }
}
export function sameObserver(a, b) {
  return (
    !!a && !!b && ['name', 'latitude', 'longitude', 'height'].every((key) => a[key] === b[key])
  );
}
// The revision also captures explicit changes to the selection for an inactive mission.
export function orbitSelection(sim, id) {
  const choice = sim.orbits?.selection?.(id);
  return {
    recordId: choice?.recordId ?? null,
    revision: choice?.revision ?? 0,
    activeData: sim.missionId === id ? sim.data : undefined,
  };
}
export function sameSelection(a, b) {
  return (
    !!a &&
    !!b &&
    a.recordId === b.recordId &&
    a.revision === b.revision &&
    a.activeData === b.activeData
  );
}
export async function observerOrbit(sim, id) {
  if (sim.missionId === id) return sim.data;
  if (sim.orbits?.selectionData) return (await sim.orbits.selectionData(id)).data;
  return sim.bundledOrbits?.[id] ?? null;
}
export function locationDraft(
  coords,
  { typedHeight = null, typedName = '', savedSites = [] } = {}
) {
  const validHeight = (h) => Number.isFinite(h) && h >= -500 && h <= 9000;
  // Reuse a stored height only for essentially the same horizontal position.
  const distance = (site) =>
    Math.hypot(
      (site.latitude - coords.latitude) * 111200,
      (((site.longitude - coords.longitude + 540) % 360) - 180) *
        111200 *
        Math.cos((coords.latitude * Math.PI) / 180)
    );
  const nearest = savedSites
    .map((site) => ({ site, metres: distance(site) }))
    .sort((a, b) => a.metres - b.metres)[0];
  const match = nearest?.metres <= 15 ? nearest.site : null;
  let height = null,
    heightSource = 'missing';
  if (validHeight(coords.altitude)) {
    height = Math.round(coords.altitude);
    heightSource = 'device';
  } else if (validHeight(typedHeight)) {
    height = typedHeight;
    heightSource = 'manual';
  } else if (validHeight(match?.height)) {
    height = match.height;
    heightSource = 'saved';
  }
  const accuracy = (value) => (Number.isFinite(value) && value >= 0 ? Math.ceil(value) : null);
  return {
    name: typedName || match?.name || '',
    latitude: coords.latitude,
    longitude: coords.longitude,
    height,
    heightSource,
    horizontalAccuracy: accuracy(coords.accuracy),
    verticalAccuracy: accuracy(coords.altitudeAccuracy),
  };
}
