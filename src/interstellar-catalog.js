import stars from '../assets/stars.json';
import distances from '../assets/stellar-distances/catalog.json';
import { getSkyCulture, cultureStarName, cultureObjectLabel } from './sky-cultures.js';
import { buildSpatialCatalog } from './interstellar-math.js';

let cached;
// Shared immutable buffers are built only on first entry, never per frame/view.
export function interstellarCatalog() {
  if (cached) return cached;
  const chinese = getSkyCulture('chinese');
  const extra = chinese.additionalStars || [];
  const rows = [...stars, ...extra];
  const data = buildSpatialCatalog(rows, distances.rows);
  const key = (ra, dec) => `${(((ra % 360) + 360) % 360).toFixed(4)},${dec.toFixed(4)}`;
  const positions = new Map(rows.map(([hip, ra, dec]) => [key(ra, dec), `hip:${hip}`]));
  const formations = [];
  for (const culture of ['western', 'chinese']) {
    for (const item of getSkyCulture(culture).asterisms) {
      const segments = [],
        members = new Set();
      let total = 0;
      for (const path of item.lines || []) {
        for (let i = 1; i < path.length; i++) {
          total++;
          const a = data.byId.get(positions.get(key(...path[i - 1]))),
            b = data.byId.get(positions.get(key(...path[i])));
          if (a === undefined || b === undefined) continue;
          segments.push([a, b]);
          members.add(a);
          members.add(b);
        }
      }
      formations.push({ id: item.targetId, culture, item, segments, members: [...members], total });
    }
  }
  cached = { ...data, formations };
  return cached;
}
export function spatialStarName(catalog, index, language = 'zh', culture = 'western') {
  if (index === 0) return { zh: '太阳', en: 'Sun', ru: 'Солнце', fr: 'Soleil' }[language] || 'Sun';
  return (
    cultureStarName(catalog.hips[index], culture, language) ||
    cultureStarName(catalog.hips[index], 'western', language) ||
    `HIP ${catalog.hips[index]}`
  );
}
export const spatialFormationName = (formation, language) =>
  cultureObjectLabel(formation.item, language);
