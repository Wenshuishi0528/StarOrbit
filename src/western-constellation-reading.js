import readings from './western-constellation-reading-data.json' with { type: 'json' };

// Original field notes. Star patterns are guides to recognition; the IAU
// defines constellations by areas. Positions and object types were checked
// against the project's star chart and OpenNGC records. The linked charts are
// the IAU / Sky & Telescope series, with individual credits on each file page.
// https://www.iau.org/IAU/Astronomy-FAQs/Constellations.aspx
// https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/
const chartLabels = {
  zh: '星座图',
  en: 'Star chart',
  fr: 'Carte du ciel',
  ru: 'Звёздная карта',
};

export function readWesternConstellation(record, language = 'zh') {
  if (!record || (record.culture && record.culture !== 'western')) return null;
  const item = Object.hasOwn(readings, record.id) && readings[record.id];
  if (!item) return null;
  const locale = String(language || 'zh')
    .toLowerCase()
    .split('-')[0];
  const lang = Object.hasOwn(chartLabels, locale) ? locale : 'en';
  return {
    description: item[lang],
    link: {
      name: `${chartLabels[lang]} · ${item.chart} (IAU / Sky & Telescope)`,
      url:
        'https://commons.wikimedia.org/wiki/File:' +
        encodeURIComponent(item.chart.replaceAll(' ', '_')) +
        '_IAU.svg',
    },
  };
}
