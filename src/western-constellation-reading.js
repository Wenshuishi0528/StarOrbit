import readings from './western-constellation-reading-data.json' with { type: 'json' };
import histories from './western-constellation-history.json' with { type: 'json' };

const labels = {
  zh: { chart: '星座图', history: '名称与沿革' },
  en: { chart: 'Star chart', history: 'Name and history' },
  fr: { chart: 'Carte du ciel', history: 'Nom et histoire' },
  ru: { chart: 'Звёздная карта', history: 'Название и история' },
};

// The IAU links these individual All Skies Encyclopaedia articles in its constellation FAQ.
// Most use the chart title. These two have distinct canonical article names.
const historyTitles = { Boo: 'Bootes', Ser: 'Serpens' };
const nasaMessier =
  'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/';
const references = {
  And: { name: 'NASA / Hubble · M31', url: nasaMessier + 'messier-31/' },
  Ant: {
    name: 'N.-L. de Lacaille · 1756 (University of Oklahoma)',
    url: 'https://galileo.ou.edu/exhibits/planisphere-containing-celestial-constellations.html',
  },
  CMa: { name: 'ESA / Hubble · Sirius B', url: 'https://esahubble.org/news/heic0516/' },
  Cep: {
    name: 'NASA · Henrietta Swan Leavitt',
    url: 'https://starchild.gsfc.nasa.gov/docs/StarChild/questions/cepheids.html',
  },
  Lyr: { name: 'NASA / Hubble · M57', url: nasaMessier + 'messier-57/' },
  Ori: { name: 'ESA / Hubble · M42', url: 'https://esahubble.org/news/heic0917/' },
  Ser: { name: 'NASA / Hubble · M16', url: nasaMessier + 'messier-16/' },
  Sex: {
    name: 'J. Hevelius · Machina coelestis (Library of Congress)',
    url: 'https://www.loc.gov/pictures/item/92516556/',
  },
  Sgr: { name: 'EHT / ESO · Sgr A*', url: 'https://www.eso.org/public/news/eso2208-eht-mw/' },
  Vir: { name: 'EHT / ESO · M87*', url: 'https://www.eso.org/public/news/eso1907/' },
};

function starChart(title, lang) {
  return {
    name: `${labels[lang].chart} · ${title} (IAU / Sky & Telescope)`,
    url:
      'https://commons.wikimedia.org/wiki/File:' +
      encodeURIComponent(title.replaceAll(' ', '_')) +
      '_IAU.svg',
  };
}

export function readWesternConstellation(record, language = 'zh') {
  if (!record || (record.culture && record.culture !== 'western')) return null;
  const item = Object.hasOwn(readings, record.id) && readings[record.id];
  if (!item) return null;
  const locale = String(language || 'zh')
    .toLowerCase()
    .split('-')[0];
  const lang = Object.hasOwn(labels, locale) ? locale : 'en';
  const history = histories[record.id];
  const title = historyTitles[record.id] || item.chart;
  const sources = [
    {
      name: `${labels[lang].history} · All Skies Encyclopaedia (${title})`,
      url: 'https://ase.exopla.net/index.php/' + encodeURIComponent(title.replaceAll(' ', '_')),
    },
  ];
  if (record.id === 'Ser') sources.push(starChart('Serpens Cauda', lang));
  if (references[record.id]) sources.push(references[record.id]);
  return {
    description: history[lang],
    detail: history.detail?.[lang],
    observing: item[lang],
    link: starChart(item.chart, lang),
    sources,
  };
}
