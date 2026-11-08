export const LUNAR_MIN_TIME = Date.UTC(1900, 0, 1);
export const LUNAR_MAX_TIME = Date.UTC(2101, 0, 1) - 1;
export const LUNAR_DAY = 86400000;
export function validLunarTime(value) {
  return Number.isFinite(value) && value >= LUNAR_MIN_TIME && value <= LUNAR_MAX_TIME;
}
export function lunarUTCInput(time) {
  return new Date(time).toISOString().slice(0, 19);
}
export function parseLunarUTC(text) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(text)) throw Error('date');
  const full = text.length === 16 ? text + ':00' : text;
  const value = Date.parse(full + 'Z');
  if (!validLunarTime(value) || lunarUTCInput(value) !== full) throw Error('date');
  return value;
}
export function normalizeLunarPreferences(value) {
  return {
    mode: value?.mode === 'atlas' || value?.layer === 'geology' ? 'atlas' : 'observe',
    layer: ['elevation', 'geology'].includes(value?.layer) ? value.layer : 'natural',
    relief: value?.relief === 8 ? 8 : 1,
    labels: typeof value?.labels === 'boolean' ? value.labels : true,
    landings: typeof value?.landings === 'boolean' ? value.landings : true,
    placeDensity: Number.isFinite(value?.placeDensity)
      ? Math.max(0, Math.min(1, value.placeDensity))
      : 0.45,
    feature: typeof value?.feature === 'string' ? value.feature.slice(0, 80) : '',
    aperture: Number.isFinite(value?.aperture) ? Math.max(30, Math.min(500, value.aperture)) : 100,
  };
}
export function lunarResolution(apertureMm, distanceKm) {
  if (!(apertureMm >= 30 && apertureMm <= 500 && distanceKm > 0)) throw Error('instrument');
  const radians = (1.22 * 550e-9) / (apertureMm / 1000);
  return { arcsec: ((radians * 180) / Math.PI) * 3600, km: radians * distanceKm };
}
