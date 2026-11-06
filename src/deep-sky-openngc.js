import { OPENNGC_ROWS } from './deep-sky-openngc-data.js';

// OpenNGC facts and translated common names: Mattia Verga and contributors,
// CC BY-SA 4.0. This data adaptation is independent of the application license.
const types = {
  G: 'galaxy',
  GPair: 'galaxy-group',
  GTrpl: 'galaxy-group',
  GGroup: 'galaxy-group',
  OCl: 'open-cluster',
  GCl: 'globular-cluster',
  'Cl+N': 'cluster-nebula',
  '*Ass': 'stellar-association',
  PN: 'planetary-nebula',
  HII: 'nebula',
  Neb: 'nebula',
  EmN: 'nebula',
  RfN: 'reflection-nebula',
  DrkN: 'dark-nebula',
  SNR: 'supernova-remnant',
};
// Coordinates/extents are never supplied by this naming table. Additional
// NASA/ESA references for names and the NGC6334 type correction are in docs.
const names = {
  LMC: ['大麦哲伦云', 'Large Magellanic Cloud', '大麦哲伦星云'],
  NGC292: ['小麦哲伦云', 'Small Magellanic Cloud', 'SMC', '小麦哲伦星云'],
  B33: ['马头星云', 'Horsehead Nebula', 'Barnard 33'],
  C9: ['洞穴星云', 'Cave Nebula', 'Caldwell 9'],
  C14: ['英仙座双星团', 'Double Cluster', 'Caldwell 14'],
  C41: ['毕星团', 'Hyades', 'Caldwell 41'],
  C99: ['煤袋星云', 'Coalsack Nebula', 'Caldwell 99'],
  Cl399: ['衣架星群', 'Coathanger Asterism', 'Collinder 399'],
  Mel111: ['后发座星团', 'Coma Star Cluster', 'Melotte 111'],
  HCG92: ['斯蒂芬五重星系', "Stephan's Quintet", 'Stephan Quintet'],
  IC405: ['火焰之星星云', 'Flaming Star Nebula'],
  IC1805: ['心脏星云', 'Heart Nebula', '心形星云'],
  IC1848: ['灵魂星云', 'Soul Nebula', 'Embryo Nebula'],
  NGC1333: ['NGC1333 星团与星云', 'NGC 1333'],
  NGC1909: ['女巫头星云', 'Witch Head Nebula'],
  NGC1977: ['奔跑者星云', 'Running Man Nebula'],
  NGC2070: ['蜘蛛星云', 'Tarantula Nebula', '30 Doradus', '剑鱼座30'],
  NGC2359: ['雷神头盔星云', "Thor's Helmet Nebula"],
  NGC3132: ['南环状星云', 'Southern Ring Nebula', 'Eight-Burst Nebula'],
  NGC3324: ['NGC3324 星团与星云', 'NGC 3324 Cluster and Nebula'],
  NGC6302: ['蝴蝶星云', 'Butterfly Nebula', 'Bug Nebula'],
  NGC6334: ['猫爪星云', "Cat's Paw Nebula"],
  NGC6357: ['战争与和平星云', 'War and Peace Nebula', 'Lobster Nebula', '龙虾星云'],
  NGC7635: ['气泡星云', 'Bubble Nebula'],
};

export function canonicalDeepSkyId(value) {
  const compact = String(value).replace(/\s/g, '');
  if (compact === 'ESO056-115') return 'LMC';
  return compact.replace(
    /^(NGC|IC|M|B|C|Mel|Cl|HCG|PGC|UGC)0*(\d+)/,
    (_, prefix, n) => prefix + Number(n)
  );
}

export function openNGCObjects() {
  return OPENNGC_ROWS.split('\n').map((line) => {
    const [rawId, sourceType, ra, dec, major, minor, pa, mag, ngc, ic, common] = line.split('\t');
    const id = canonicalDeepSkyId(rawId),
      authored = names[id],
      commonNames = common ? common.split(',') : [];
    const aliases = [
      rawId,
      id.replace(/^(NGC|IC|B|C|HCG)(\d)/, '$1 $2'),
      ...(authored || []),
      ...commonNames,
    ];
    for (const [catalog, values] of [
      ['NGC', ngc],
      ['IC', ic],
    ]) {
      for (const value of values.split(',').filter(Boolean))
        aliases.push(canonicalDeepSkyId(catalog + value));
    }
    return {
      id,
      name: authored?.[0] || id,
      englishName: authored?.[1] || commonNames[0] || id,
      aliases: [...new Set(aliases)],
      ra: Number(ra),
      dec: Number(dec),
      type: id === 'NGC6334' ? 'nebula' : types[sourceType],
      angularSizeArcmin: major ? [Number(major), Number(minor || major)] : null,
      positionAngleDeg: pa ? Number(pa) % 180 : null,
      mag: mag ? Number(mag) : null,
      magnitudeUncertain: false,
      source: 'openngc',
      sourceId: rawId,
    };
  });
}

// This is an IMAGE FOOTPRINT inside NGC3324, not the entire nebula or its
// embedded cluster. Vertices were derived from the source's ICRS TAN AVM using
// exactly the same 10K raster bounds as scripts/prepare-sky-detail.py. Its
// center is also the one in assets/sky-detail/manifest.json. No image is copied.
export const SKY_IMAGE_FIELDS = [
  {
    id: 'JWST-CARINA-2022',
    name: '宇宙悬崖（JWST 影像）',
    englishName: 'Cosmic Cliffs (JWST image)',
    aliases: ['宇宙悬崖', 'Cosmic Cliffs', 'JWST Carina', '韦布宇宙悬崖', 'jwst-carina-2022'],
    ra: 159.21303687393092,
    dec: -58.62016558917656,
    type: 'image-field',
    angularSizeArcmin: [7.29, 4.22],
    positionAngleDeg: null,
    mag: null,
    magnitudeUncertain: false,
    source: 'esa-webb-avm',
    sourceUrl: 'https://esawebb.org/images/weic2205a/',
    providerId: 'jwst-carina-2022',
    parentId: 'NGC3324',
    footprint: [
      [159.12088080571485, -58.67140916013748],
      [159.17350394023444, -58.553078562802924],
      [159.30492289486347, -58.56885631776473],
      [159.25272187168417, -58.68724044243608],
    ],
  },
];
