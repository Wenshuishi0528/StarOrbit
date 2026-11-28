import chart from '../assets/star-chart.json' with { type: 'json' };
import { deepSkyReadingId } from './deep-sky-catalog.js';
import {
  catalogueExtentText,
  describeObjectAppearance,
  describeSkyObject,
} from './sky-object-reading.js';
import { deepSkyLandmarks } from './deep-sky-featured-reading.js';
import { messierReading } from './messier-reading-data.js';

const languages = ['zh', 'en', 'ru', 'fr'];
const messier =
  'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/';
const openNGC =
  'https://github.com/mattiaverga/OpenNGC/tree/be3cd6c5498806a2fbb2f7e0452ef802dbb02be0';
const heasarc = {
  name: 'NASA / HEASARC · Messier',
  url: 'https://heasarc.gsfc.nasa.gov/W3Browse/all/messier.html',
};
const messier1781 = {
  name: 'C. Messier · 1781',
  url: 'https://onepagepapers.com/messier-catalogue/read/',
};
// Hubble's published collection has 89 individual pages for the 110 objects.
const outsideHubbleCollection = new Set([
  6, 18, 21, 23, 25, 26, 29, 34, 36, 37, 38, 39, 40, 41, 47, 50, 52, 73, 93, 97, 103,
]);

const featuredSources = {
  NGC346: { name: 'ESA / Hubble', url: 'https://esahubble.org/news/heic0514/' },
  NGC3324: { name: 'ESA / Webb', url: 'https://esawebb.org/images/weic2205a/' },
  LMC: { name: 'ESO', url: 'https://www.eso.org/public/images/eso0708b/' },
};
const deg = Math.PI / 180;
const landmarks = chart.stars.filter((s) => s.hasProperName && s.mag <= 2.5);
const compass = [
  ['北', '东北', '东', '东南', '南', '西南', '西', '西北'],
  ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'],
  ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад'],
  ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'],
];
function landmarkSentence(object, i) {
  if (!Number.isFinite(object.ra) || !Number.isFinite(object.dec)) return '';
  const dec = object.dec * deg;
  let best = -1,
    nearest;
  for (const star of landmarks) {
    const d = star.dec * deg,
      offset = (object.ra - star.ra) * deg;
    const dot = Math.sin(dec) * Math.sin(d) + Math.cos(dec) * Math.cos(d) * Math.cos(offset);
    if (dot > best) {
      best = dot;
      nearest = star;
    }
  }
  const distance = Math.acos(Math.min(1, best)) / deg;
  if (!nearest || distance < 0.15 || distance > 22.5) return '';
  const d = nearest.dec * deg,
    offset = (object.ra - nearest.ra) * deg;
  const angle =
    Math.atan2(
      Math.sin(offset) * Math.cos(dec),
      Math.cos(d) * Math.sin(dec) - Math.sin(d) * Math.cos(dec) * Math.cos(offset)
    ) / deg;
  const dir = compass[i][(Math.round(angle / 45) + 8) % 8],
    name = nearest[languages[i]] || nearest.en;
  const n = distance.toLocaleString(languages[i], { maximumFractionDigits: 1 });
  return [
    `认星时可以先找亮星${name}，再从它向${dir}约 ${n}° 寻找这个目标。`,
    `To find this field, start at the bright star ${name} and look about ${n}° to its ${dir}.`,
    `Ориентир на карте — яркая звезда ${name}. От неё до объекта около ${n}° в направлении на ${dir}.`,
    `Pour retrouver ce champ, partez de l’étoile brillante ${name}, puis parcourez environ ${n}° vers ${dir === 'est' || dir === 'ouest' ? 'l’' + dir : 'le ' + dir} sur la carte.`,
  ][i];
}

export { describeSkyObject as describeDeepSkySubject };

export function readDeepSkyObject(object, language = 'zh') {
  if (!object) return null;
  const i = Math.max(0, languages.indexOf(String(language).toLowerCase().split('-')[0])),
    lang = languages[i];
  const id = deepSkyReadingId(object.id);
  const description = describeSkyObject(object, lang);
  const history = messierReading[id]?.[i];
  const extent = catalogueExtentText(object, lang);
  const parts = (values) => values.filter(Boolean).join(i === 0 ? '' : ' ');
  const detail = parts([history, extent]);
  const observing = parts([describeObjectAppearance(object, lang), landmarkSentence(object, i)]);
  let link;
  let catalogue;
  if (id === 'HCG92')
    link = {
      name: 'NASA / ESA / CSA · Webb',
      url: 'https://science.nasa.gov/asset/webb/stephans-quintet-nircam-and-miri-composite-image/',
    };
  else if (/^M\d+$/.test(id)) {
    const n = Number(id.slice(1));
    link = outsideHubbleCollection.has(n)
      ? messier1781
      : { name: 'NASA · Hubble', url: messier + 'messier-' + n + '/' };
    if (n !== 102) catalogue = heasarc; // HEASARC omits the disputed historical identification.
  } else if (deepSkyLandmarks[id] || featuredSources[id]) {
    link = deepSkyLandmarks[id]?.source || featuredSources[id];
    if (object.source === 'openngc') catalogue = { name: 'OpenNGC', url: openNGC };
  } else if (object.source === 'openngc') {
    link = { name: 'OpenNGC', url: openNGC };
    if (/^(NGC|IC)\d/.test(id))
      catalogue = {
        name: 'CDS · SIMBAD',
        url:
          'https://simbad.cfa.harvard.edu/simbad/sim-id?Ident=' +
          encodeURIComponent(id.replace(/^(NGC|IC)(\d)/, '$1 $2')),
      };
  } else if (object.sourceUrl)
    link = {
      name: object.source === 'esa-webb-avm' ? 'ESA/Webb' : object.source,
      url: object.sourceUrl,
    };
  else if (object.source === 'heasarc-messier') link = heasarc;
  return {
    description,
    detail: detail || undefined,
    observing,
    link,
    sources: [link, catalogue].filter(Boolean),
  };
}
