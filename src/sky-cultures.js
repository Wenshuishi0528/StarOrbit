import westernChart from '../assets/star-chart.json' with { type: 'json' };

const languages = ['zh', 'en', 'ru', 'fr'];
const namesFor = (item) =>
  Object.fromEntries(
    languages.map((language) => [
      language,
      item.names?.[language] || item[language] || item.en || item.zh || item.id,
    ])
  );
const localName = (names, language) => names?.[language] || names?.en || names?.zh || '';
const westernAsterisms = westernChart.constellations.map((item) => ({
  ...item,
  names: namesFor(item),
  targetId: 'constellation:' + item.id,
  culture: 'western',
  memberHips: [],
  members: [],
}));
const physicalKey = (id) =>
  String(id).startsWith('gaia:') ? String(id) : Number(String(id).replace(/^hip:/, ''));
// The western system ships with the application. Other cultures are parsed
// only when a view, search or card first uses them (see ensureSkyCulture).
const cultures = {},
  starMaps = {},
  loads = new Map(),
  listeners = new Set();
function install(id, culture) {
  cultures[id] = culture;
  starMaps[id] = new Map(
    [...culture.stars, ...(culture.otherStars || [])].map((star) => [physicalKey(star.id), star])
  );
}
install('western', {
  ...westernChart,
  id: 'western',
  names: {
    zh: '西方星座',
    en: 'Western constellations',
    ru: 'Западные созвездия',
    fr: 'Constellations occidentales',
  },
  edition: { zh: '现代通行体系', en: 'Modern conventional system' },
  groups: [],
  asterisms: westernAsterisms,
  constellations: westernAsterisms,
  additionalStars: [],
  otherStars: [],
  namedObjects: [],
});
const sources = {
  chinese: () => import('../assets/chinese-sky/catalog.json', { with: { type: 'json' } }),
};

export function normalizeSkyCulture(id) {
  return id === 'chinese' ? 'chinese' : 'western';
}

export function isSkyCultureLoaded(id) {
  return !!cultures[normalizeSkyCulture(id)];
}

/** Loads one culture once. Concurrent callers share the request; a failed
 * request is forgotten so a later selection can retry it. */
export function ensureSkyCulture(id = 'western') {
  const culture = normalizeSkyCulture(id);
  if (cultures[culture]) return Promise.resolve(cultures[culture]);
  if (!loads.has(culture))
    loads.set(
      culture,
      sources[culture]()
        .then(({ default: chart }) => {
          install(culture, { ...chart, constellations: chart.asterisms });
          for (const listener of [...listeners])
            try {
              listener(culture);
            } catch (error) {
              console.error(error);
            }
          return cultures[culture];
        })
        .catch((error) => {
          loads.delete(culture);
          console.error('星空体系数据加载失败：' + culture, error);
          throw error;
        })
    );
  return loads.get(culture);
}

/** Called after a culture has been parsed; returns an unsubscribe function. */
export function onSkyCultureLoaded(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Every renderer applies a culture only after ensureSkyCulture resolved. A
// synchronous read before that is a programming error, never a reason to draw
// the western system under the user's other choice.
export function getSkyCulture(id = 'western') {
  const culture = normalizeSkyCulture(id);
  if (!cultures[culture])
    throw Error(`星空体系“${culture}”尚未加载，请先等待 ensureSkyCulture('${culture}')`);
  return cultures[culture];
}

export function cultureName(id = 'western', language = 'zh') {
  return localName(getSkyCulture(id).names, language);
}

export function cultureStarName(hip, culture = 'western', language = 'zh') {
  const id = normalizeSkyCulture(culture);
  getSkyCulture(id);
  const star = starMaps[id].get(physicalKey(hip));
  return star && star.cultureNamed !== false
    ? localName(star.names || namesFor(star), language)
    : null;
}

export function cultureGlyphText(id = 'western') {
  const culture = getSkyCulture(id);
  return [
    ...new Set(
      [
        culture.names,
        ...culture.groups.map((item) => item.names),
        ...culture.asterisms.map((item) => item.names),
        ...culture.stars.map((item) => item.names || namesFor(item)),
        ...(culture.otherStars || []).map((item) => item.names),
        ...(culture.namedObjects || []).map((item) => item.names),
      ]
        .flatMap((names) => Object.values(names || {}))
        .join('')
    ),
  ].join('');
}

export function cultureObjectLabel(object, language = 'zh') {
  return localName(object?.names || (object ? namesFor(object) : null), language);
}
