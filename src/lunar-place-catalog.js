import gazetteer from '../assets/moon/places/gazetteer.json' with { type: 'json' };
import landings from '../assets/moon/places/landings.json' with { type: 'json' };
import { LUNAR_FEATURES } from './lunar-features.js';

const selectedBySource = new Map(
  LUNAR_FEATURES.map((f) => [Number(f.source.url.split('/').at(-1)), f])
);
const fold = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’‘']/g, '')
    .replace(/[‐‑–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export const LUNAR_FEATURE_TYPES = Object.freeze({ ...gazetteer.types });
export const LUNAR_PLACES = Object.freeze([
  ...gazetteer.features.map(([id, name, latitude, longitude, diameterKm, featureType]) => {
    const selected = selectedBySource.get(id);
    return Object.freeze({
      id: 'usgs:' + id,
      kind: 'feature',
      name,
      latitude,
      longitude,
      diameterKm,
      featureType,
      featureTypeLabel: gazetteer.types[featureType],
      isSatelliteFeature: featureType === 'SF',
      sourceUrl: 'https://planetarynames.wr.usgs.gov/Feature/' + id,
      ...(selected
        ? {
            nameZh: selected.name.zh,
            aliases: [selected.id, ...Object.values(selected.name)],
            featuredId: selected.id,
          }
        : {}),
    });
  }),
  ...landings.records.map((record) => Object.freeze({ ...record, kind: 'landing' })),
]);
export const LUNAR_PLACES_META = Object.freeze({
  ...gazetteer.meta,
  landingSnapshotDate: landings.snapshotDate,
  landingCount: landings.records.length,
  locatedLandingCount: landings.records.filter(
    (r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude)
  ).length,
  landingScope: landings.scope,
  totalCount: LUNAR_PLACES.length,
});
const byId = new Map(LUNAR_PLACES.map((p) => [p.id, p]));
for (const place of LUNAR_PLACES) if (place.featuredId) byId.set(place.featuredId, place);
const index = LUNAR_PLACES.map((place) => ({
  place,
  keys: [
    place.id,
    place.name,
    place.nameZh,
    ...(place.aliases || []),
    ...(place.carriedVehicles || []),
  ]
    .filter(Boolean)
    .map(fold),
}));
export function getLunarPlace(id) {
  return byId.get(id) ?? null;
}
export function searchLunarPlaces(query = '', { kind, limit = 80, country, outcome } = {}) {
  const q = fold(query),
    words = q.split(' ').filter(Boolean),
    cap = limit === Infinity ? Infinity : Math.max(0, Math.floor(Number(limit) || 0));
  const matches = [];
  for (const row of index) {
    const p = row.place;
    if (
      (kind && p.kind !== kind) ||
      (country && p.country !== country) ||
      (outcome && p.outcome !== outcome)
    )
      continue;
    if (words.length && !row.keys.some((key) => words.every((word) => key.includes(word))))
      continue;
    const rank = !q
      ? 2
      : row.keys.includes(q)
        ? 0
        : row.keys.some((key) => key.startsWith(q))
          ? 1
          : 2;
    matches.push({ p, rank });
  }
  return matches
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.p.kind === 'landing' ? -1 : 0) - (b.p.kind === 'landing' ? -1 : 0) ||
        (b.p.diameterKm || 0) - (a.p.diameterKm || 0) ||
        a.p.name.localeCompare(b.p.name, 'en')
    )
    .slice(0, cap)
    .map(({ p }) => p);
}
