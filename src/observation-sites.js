import { validateObserver } from './pass-prediction.js';
import {
  BEIJING_BALCONY,
  EXAMPLE_HORIZON,
  normalizeHorizon,
  siteKey,
} from './balcony-lab-geometry.js';

export const BALCONY_SITES_KEY = 'starorbit-balcony-sites-v1';
export function storedSites() {
  const sites = new Map();
  try {
    const list = JSON.parse(localStorage.getItem(BALCONY_SITES_KEY));
    for (const item of Array.isArray(list) ? list : []) {
      try {
        const site = validateObserver(item.site);
        sites.set(siteKey(site), { site, points: normalizeHorizon(item.points) });
      } catch {}
    }
  } catch {}
  return sites;
}
export function siteHorizon(site, useExample = false, sites = storedSites()) {
  const key = siteKey(site),
    example = useExample && key === siteKey(BEIJING_BALCONY);
  const points = normalizeHorizon(example ? EXAMPLE_HORIZON : sites.get(key)?.points);
  return { points, kind: example ? 'example' : points.length ? 'saved' : 'flat' };
}
