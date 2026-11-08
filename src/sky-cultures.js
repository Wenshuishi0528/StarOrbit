import westernChart from '../assets/star-chart.json';
import chineseChart from '../assets/chinese-sky/catalog.json';

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
const cultures = {
  western: {
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
  },
  chinese: { ...chineseChart, constellations: chineseChart.asterisms },
};
const physicalKey = (id) =>
  String(id).startsWith('gaia:') ? String(id) : Number(String(id).replace(/^hip:/, ''));
const starMaps = Object.fromEntries(
  Object.entries(cultures).map(([id, culture]) => [
    id,
    new Map(
      [...culture.stars, ...(culture.otherStars || [])].map((star) => [physicalKey(star.id), star])
    ),
  ])
);

export function normalizeSkyCulture(id) {
  return id === 'chinese' ? 'chinese' : 'western';
}

export function getSkyCulture(id = 'western') {
  return cultures[normalizeSkyCulture(id)];
}

export function cultureName(id = 'western', language = 'zh') {
  return localName(getSkyCulture(id).names, language);
}

export function cultureStarName(hip, culture = 'western', language = 'zh') {
  const star = starMaps[normalizeSkyCulture(culture)].get(physicalKey(hip));
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
