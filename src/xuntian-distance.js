import catalog from '../assets/stellar-distances/catalog.json';

// IAU parsec definition and Julian light-year; catalogue estimates are static,
// heliocentric distances, not a fictitious range to the rendered sky sphere.
const PARSEC_LIGHT_YEARS = 3.2615637771674336;
const AU_KM = 149597870.7;
const parallaxes = new Map(
  catalog.rows.map(([hip, parallax, error]) => [hip, { parallax, error }])
);

export function stellarDistance(id) {
  const match = /^hip:(\d+)$/.exec(String(id));
  const record = match && parallaxes.get(Number(match[1]));
  if (!record) return null;
  return {
    distanceLightYears: (1000 / record.parallax) * PARSEC_LIGHT_YEARS,
    distanceRelativeError: record.error / record.parallax,
    distanceSource: 'hipparcos-2007',
  };
}

export function crosshairDistanceText(
  hit,
  translate = (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '')
) {
  if (!hit) return '';
  const t = translate;
  if (hit.kind === 'star') {
    const distance = hit.distanceLightYears;
    return Number.isFinite(distance) && distance > 0
      ? t('距太阳约 {distance} 光年（星表估计）', {
          distance: Number(distance.toPrecision(3)).toString(),
        })
      : t('距离：暂无可靠数据');
  }
  if (hit.kind === 'deep-sky') return t('距离：暂无可靠数据');
  if (
    !['solar', 'earth', 'station'].includes(hit.kind) ||
    !Number.isFinite(hit.distanceKm) ||
    hit.distanceKm < 0
  )
    return '';
  const km = hit.distanceKm;
  const distance =
    km < 1
      ? (km * 1000).toFixed(1) + ' m'
      : km < 1e7
        ? Number(km.toPrecision(5)).toLocaleString('en-US') + ' km'
        : Number(km.toPrecision(5)).toLocaleString('en-US') +
          ' km / ' +
          (km / AU_KM).toFixed(3) +
          ' AU';
  return t(hit.kind === 'solar' ? '距天体中心 {distance}' : '距准星落点 {distance}', { distance });
}
