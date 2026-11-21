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

// Round the complete angle before splitting so a carry cannot produce 60 seconds.
export function galleryCoordinates(ra, dec, raLabel = 'RA', decLabel = 'Dec') {
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90) return '';
  const pad = (value) => String(value).padStart(2, '0');
  const tenth = Math.round((((ra % 360) + 360) % 360) * 2400) % 864000;
  const arcsec = Math.round(Math.abs(dec) * 3600);
  const hours = pad(Math.floor(tenth / 36000));
  const minutes = pad(Math.floor(tenth / 600) % 60);
  const seconds = pad(Math.floor(tenth / 10) % 60) + '.' + (tenth % 10);
  const degrees = pad(Math.floor(arcsec / 3600));
  const arcminutes = pad(Math.floor(arcsec / 60) % 60);
  const arcseconds = pad(arcsec % 60);
  return `${raLabel} ${hours}ʰ${minutes}ᵐ${seconds}ˢ　${decLabel} ${dec < 0 ? '−' : '+'}${degrees}°${arcminutes}′${arcseconds}″`;
}

export function galleryEntry(row, source, language = 'zh') {
  const { object, work } = row;
  if (work) {
    return {
      kind: 'work',
      id: work.id,
      source: work.source || 'recent',
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

// Designations are exact names: NGC 0224 is NGC 224, while M31 is distinct from M310.
function designations(text) {
  return [...text.matchAll(/\b(Messier|M|NGC|IC|Abell)\s*0*(\d+[A-Z]?)\b/gi)].map(
    ([, prefix, number]) =>
      (prefix.toUpperCase() === 'MESSIER' ? 'M' : prefix.toUpperCase()) + number.toUpperCase()
  );
}

// Keep the sky object first, then its curated views, other pointable images and previews.
function searchRank({ work }) {
  if (!work) return 0;
  if (!work.providerId) return 3;
  return work.titleZh ? 1 : 2;
}
const compareRank = (a, b) => searchRank(a) - searchRank(b);

export function createSkyImageIndex(works, objects = DEEP_SKY_OBJECTS) {
  const words = (values) => [...new Set(values.filter(Boolean).map(fold))];
  const objectRows = objects
    .filter((o) => o.type !== 'image-field')
    .map((object) => ({
      object,
      words: words([object.id, object.name, object.englishName, ...object.aliases]),
    }));
  const objectByName = new Map();
  for (const row of objectRows) {
    for (const name of row.words) {
      if (!objectByName.has(name)) objectByName.set(name, []);
      objectByName.get(name).push(row);
    }
  }
  const linked = new Map();
  const workRows = works.map((work) => {
    const names = [work.title, work.titleZh, ...(work.aliases || [])].filter(Boolean);
    const pillar = names.some((name) => /pillars of creation|创[造生]之柱/i.test(name));
    const keywords = [...names, ...designations(names.join(' '))];
    if (pillar) keywords.push('创生之柱', '创造之柱', 'Pillars of Creation', 'M16');
    const associations = new Set(keywords.flatMap((key) => objectByName.get(fold(key)) || []));
    const subjects = [...associations];
    // These named regions sit within larger catalogue objects. Prefer the
    // object whose profile explains that feature, while keeping every link.
    const primaryId = pillar
      ? 'M16'
      : names.some((name) => /cosmic cliffs|宇宙悬崖/i.test(name))
        ? 'NGC3324'
        : null;
    const primarySubject =
      subjects.length === 1 ? subjects[0] : subjects.find((item) => item.object.id === primaryId);
    const row = { work, subjects, primarySubject, words: words([work.id, ...keywords]) };
    for (const match of associations) {
      if (!linked.has(match.object.id)) linked.set(match.object.id, []);
      linked.get(match.object.id).push(row);
    }
    const aliases = [...associations].flatMap((match) => {
      // M16 includes the named Pillars region. Other fields in the nebula
      // belong under M16, but a search for the Pillars should find that feature.
      if (match.object.id === 'M16' && !pillar)
        return match.words.filter(
          (word) => !['pillarsofcreation', '创生之柱', '创造之柱'].includes(word)
        );
      return match.words;
    });
    row.words = [...new Set([...row.words, ...aliases])];
    return row;
  });
  for (const list of linked.values()) list.sort(compareRank);
  const rows = [...objectRows, ...workRows];
  const featured = [];
  const ids = ['weic2205a', 'heic1501a', 'weic2207c', 'heic0506a'];
  const byId = new Map(objectRows.map((row) => [row.object.id, row]));
  for (const [i, id] of featuredObjects.entries()) {
    const favorite =
      i < ids.length && workRows.find((row) => row.work.id === ids[i] && row.work.providerId);
    if (favorite) featured.push(favorite);
    if (byId.has(id)) featured.push(byId.get(id));
  }
  function search(query = '', filter = 'featured') {
    let needle = fold(query.trim());
    const notation = /^(m|messier|ngc|ic|abell)0*(\d+[a-z]?)$/i.exec(needle);
    if (notation) needle = (notation[1] === 'messier' ? 'm' : notation[1]) + notation[2];
    if (!needle && filter === 'featured') return featured;
    const corpus = ['recent', 'hubble'].includes(filter)
      ? workRows.filter((row) => (row.work.source || 'recent') === filter)
      : filter === 'panstarrs'
        ? objectRows.filter((row) => panstarrsCovers(row.object))
        : filter === 'dss'
          ? objectRows
          : rows;
    if (!needle) return corpus;
    const exact = [],
      prefix = [],
      rest = [];
    for (const row of corpus) {
      if (row.words.includes(needle)) exact.push(row);
      else if (!notation && row.words.some((word) => word.startsWith(needle))) prefix.push(row);
      else if (!notation && row.words.some((word) => word.includes(needle))) rest.push(row);
    }
    return [...exact.sort(compareRank), ...prefix, ...rest];
  }
  search.related = (object) => linked.get(object.id) || [];
  return search;
}
