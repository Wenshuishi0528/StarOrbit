import { DEEP_SKY_OBJECTS, deepSkyName } from './deep-sky-catalog.js';

const featuredObjects = ['M31', 'M42', 'M51', 'M45', 'M57', 'M104', 'M16', 'M13', 'M33', 'LMC'];
const fold = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_.·–-]/gu, '');
const COVERAGE_LIMIT = -28;

export function skyObjectFov(object) {
  const diameter = object.angularSizeArcmin?.[0] / 60 || 0.2;
  return Math.min(80, Math.max(0.08, diameter * 1.6));
}

export function panstarrsCovers(object) {
  const halfDiagonal = Math.atan(
    Math.tan((skyObjectFov(object) * Math.PI) / 360) * Math.hypot(1, 1.5)
  );
  return object.dec - (halfDiagonal * 180) / Math.PI > COVERAGE_LIMIT;
}

export function galleryEntry(row, source, language = 'zh') {
  const { object, work } = row;
  if (work) {
    return {
      kind: 'work',
      id: work.id,
      source: 'recent',
      work,
      providerId: work.providerId,
      title: language === 'zh' && work.titleZh ? work.titleZh : work.title,
      raDeg: work.center?.raDeg,
      decDeg: work.center?.decDeg,
      fov: work.fieldSizeArcmin ? (Math.hypot(...work.fieldSizeArcmin) / 60) * 1.05 : null,
    };
  }
  return {
    kind: 'object',
    id: object.id,
    source: source === 'panstarrs' && panstarrsCovers(object) ? 'panstarrs' : 'dss',
    object,
    title: deepSkyName(object, language),
    raDeg: object.ra,
    decDeg: object.dec,
    fov: skyObjectFov(object),
  };
}

export function createSkyImageIndex(works, objects = DEEP_SKY_OBJECTS) {
  const rows = [
    ...objects
      .filter((o) => o.type !== 'image-field')
      .map((object) => ({
        object,
        words: [object.id, object.name, object.englishName, ...object.aliases]
          .filter(Boolean)
          .map(fold),
      })),
    ...works.map((work) => ({
      work,
      words: [work.id, work.titleZh, work.title, ...(work.aliases || [])].filter(Boolean).map(fold),
    })),
  ];
  const featured = [];
  const featuredWorkIds = ['weic2205a', 'pillarsofcreation_composite', 'weic2207c', 'weic2209a'];
  const favoriteWorks = featuredWorkIds.map((id) =>
    rows.find((row) => row.work?.id === id && row.work.providerId)
  );
  const byId = new Map(rows.filter((r) => r.object).map((r) => [r.object.id, r]));
  for (const [i, id] of featuredObjects.entries()) {
    if (i < 4 && favoriteWorks[i]) featured.push(favoriteWorks[i]);
    if (byId.has(id)) featured.push(byId.get(id));
  }
  const search = (query = '', filter = 'featured') => {
    const needle = fold(query.trim());
    if (!needle && filter === 'featured') return featured;
    const filtered = rows.filter(({ object, work }) =>
      filter === 'recent'
        ? !!work
        : filter === 'panstarrs'
          ? !!object && panstarrsCovers(object)
          : filter === 'dss'
            ? !!object
            : true
    );
    if (!needle) return filtered;
    const exact = [],
      prefix = [],
      rest = [];
    for (const row of filtered) {
      if (row.words.includes(needle)) exact.push(row);
      else if (row.words.some((word) => word.startsWith(needle))) prefix.push(row);
      else if (row.words.some((word) => word.includes(needle))) rest.push(row);
    }
    return [...exact, ...prefix, ...rest];
  };
  // Join only complete catalogue designations (including aliases), never a
  // substring such as M51 inside M510 or an apparent overlap on screen.
  const worksByDesignation = new Map();
  const designations = (text) =>
    [...text.matchAll(/\b(Messier|M|NGC|IC|Abell)\s*(\d+[A-Z]?)\b/gi)].map(
      ([, prefix, number]) =>
        (prefix.toUpperCase() === 'MESSIER' ? 'M' : prefix.toUpperCase()) + number.toUpperCase()
    );
  for (const row of rows.filter((row) => row.work)) {
    const work = row.work;
    for (const id of new Set(designations([work.title, ...(work.aliases || [])].join(' ')))) {
      if (!worksByDesignation.has(id)) worksByDesignation.set(id, []);
      worksByDesignation.get(id).push(row);
    }
  }
  search.related = (object) => {
    const linked = new Set();
    for (const id of designations([object.id, ...(object.aliases || [])].join(' '))) {
      for (const row of worksByDesignation.get(id) || []) linked.add(row);
    }
    return [...linked];
  };
  return search;
}
