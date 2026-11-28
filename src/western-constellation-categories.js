// Group the modern constellations by the history of the figures on European charts.
// Coma and Crux were known groups before they gained independent constellation entries.
// Argo was one entry for Ptolemy and three regions on the modern sky.
const groups = [
  [
    'classical',
    '古典星表中的星座',
    'And Aqr Aql Ara Ari Aur Boo Cnc CMa CMi Cap Cas Cen Cep Cet CrA CrB Crv Crt Cyg Del Dra Equ Eri Gem Her Hya Leo Lep Lib Lup Lyr Oph Ori Peg Per Psc PsA Sge Sgr Sco Ser Tau Tri UMa UMi Vir',
  ],
  [
    'early-atlases',
    '航海时代与早期星图',
    'Aps Cam Cha Col Com Cru Dor Gru Hyi Ind Mon Mus Pav Phe TrA Tuc Vol',
  ],
  ['hevelius', '赫维留斯的星座', 'CVn Lac LMi Lyn Sct Sex Vul'],
  ['lacaille', '拉卡伊命名的星座', 'Ant Cae Cir For Hor Men Mic Nor Oct Pic Pyx Ret Scl Tel'],
  ['argo', '南船座的三个部分', 'Car Pup Vel'],
];

export const WESTERN_CONSTELLATION_CATEGORIES = groups.map(([id, label]) => ({ id, label }));
const categoriesByConstellation = new Map(
  groups.flatMap(([category, , ids]) => ids.split(' ').map((id) => [id, category]))
);

export function westernConstellationCategory(id) {
  return categoriesByConstellation.get(id) || '';
}

export const WESTERN_SKY_POSITIONS = [
  { id: 'north', label: '天赤道以北' },
  { id: 'equatorial', label: '横跨天赤道' },
  { id: 'south', label: '天赤道以南' },
];
// IAU boundaries intersected by the J2000 equator, in increasing right ascension.
const onEquator = new Set('Psc Cet Tau Eri Ori Mon CMi Hya Sex Leo Vir Ser Oph Aql Aqr'.split(' '));

export function westernSkyPosition(record) {
  if (onEquator.has(record.id)) return 'equatorial';
  if (!Number.isFinite(record.dec)) return '';
  return record.dec > 0 ? 'north' : 'south';
}
