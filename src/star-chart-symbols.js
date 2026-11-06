import { deepSkyName } from './deep-sky-catalog.js';

const featured = new Set([
  'LMC',
  'NGC292',
  'B33',
  'C9',
  'C41',
  'C99',
  'Cl399',
  'Mel111',
  'HCG92',
  'IC405',
  'IC1805',
  'IC1848',
  'NGC1333',
  'NGC1909',
  'NGC1977',
  'NGC2070',
  'NGC2359',
  'NGC3132',
  'NGC3324',
  'NGC6302',
  'NGC6334',
  'NGC6357',
  'NGC7635',
  'JWST-CARINA-2022',
  'M1',
  'M3',
  'M4',
  'M5',
  'M6',
  'M7',
  'M8',
  'M11',
  'M13',
  'M16',
  'M17',
  'M20',
  'M22',
  'M27',
  'M31',
  'M33',
  'M42',
  'M44',
  'M45',
  'M51',
  'M57',
  'M63',
  'M64',
  'M67',
  'M81',
  'M82',
  'M97',
  'M101',
  'M104',
  'NGC104',
  'NGC253',
  'NGC869',
  'NGC884',
  'NGC1499',
  'NGC2024',
  'NGC2237',
  'NGC2264',
  'NGC3372',
  'NGC5128',
  'NGC5139',
  'NGC6543',
  'NGC6960',
  'NGC6992',
  'NGC7000',
  'NGC7009',
  'NGC7293',
]);
const types = {
  galaxy: { shape: 'ellipse', color: '#c7b3e8', labelColor: '#d6c8ed' },
  nebula: { shape: 'box', color: '#85c9be', labelColor: '#b0dfd6' },
  'supernova-remnant': { shape: 'box', color: '#e0b09e', labelColor: '#edc6b8' },
  'open-cluster': { shape: 'circle', color: '#e2cd8c', labelColor: '#eadcb4' },
  'globular-cluster': { shape: 'cross-circle', color: '#e2cd8c', labelColor: '#eadcb4' },
  'planetary-nebula': { shape: 'cross-circle', color: '#85c9be', labelColor: '#b0dfd6' },
  'star-cloud': { shape: 'box', color: '#e2cd8c', labelColor: '#eadcb4' },
  asterism: { shape: 'circle', color: '#e2cd8c', labelColor: '#eadcb4' },
  'double-star': { shape: 'circle', color: '#c8dce8', labelColor: '#dce8ef' },
};
export function deepSkyStyle(object) {
  if (object.type === 'galaxy-group') return types.galaxy;
  if (object.type === 'stellar-association') return types['open-cluster'];
  return types[object.type] ?? types.nebula;
}
export function deepSkyLabel(object, language = 'zh') {
  const name = deepSkyName(object, language);
  return !name
    ? object.id
    : name === object.id || name.startsWith(object.id + ' ')
      ? name
      : name + ' · ' + object.id;
}
export function deepSkyInScope(object, scope = 'featured') {
  return (
    scope === 'all' ||
    (scope === 'messier' && /^M\d+$/.test(object.id)) ||
    (scope === 'featured' && featured.has(object.id))
  );
}
// Catalog extents are angular diameters. A minimum locator remains legible
// when unresolved; the capped outline is not a photograph or a claimed PA.
export function deepSkySymbol(
  object,
  { fovY = 38, height = 800, minSize = 8, maxSize = 120 } = {}
) {
  const scale = height / (2 * Math.tan((Math.max(0.001, Math.min(179, fovY)) * Math.PI) / 360));
  const size = object.angularSizeArcmin;
  const pixels = (arcmin) =>
    Number.isFinite(arcmin) && arcmin > 0
      ? 2 * Math.tan((arcmin * Math.PI) / (180 * 120)) * scale
      : minSize;
  const clamp = (value) => Math.max(minSize, Math.min(maxSize, value));
  const style = deepSkyStyle(object),
    width = clamp(pixels(size?.[0])),
    minor = clamp(pixels(size?.[1] ?? size?.[0]));
  return {
    ...style,
    width: style.shape === 'ellipse' ? Math.max(minSize * 1.5, width) : width,
    height: minor,
    rotation: 0,
  };
}
