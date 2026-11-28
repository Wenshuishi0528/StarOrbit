import { getLanguage } from './i18n.js';
import { getXuntianTarget } from './xuntian-catalog.js';
import { solarLabel } from './solar-targets.js';
import { DEEP_SKY_OBJECTS } from './deep-sky-catalog.js';
import { describeSkyObject } from './sky-object-reading.js';
import { cultureObjectLabel } from './sky-cultures.js';
import { westernRegion } from './sky-location-math.js';
import { skyText } from './sky-tool-language.js';

const nasa = 'https://science.nasa.gov/';
const featured = {
  'hip:91262': ['vega', 'solar-system/skywatching/night-sky-network/summer-triangle-corner-vega/'],
  'hip:32349': ['sirius', 'skywatching/faq/'],
  'hip:11767': [
    'polaris',
    'solar-system/skywatching/what-is-the-north-star-and-how-do-you-find-it/',
  ],
  'hip:27989': [
    'betelgeuse',
    'solar-system/skywatching/night-sky-network/betelgeuse-and-the-crab-nebula/',
  ],
  'hip:97649': [
    'altair',
    'solar-system/skywatching/night-sky-network/summer-triangle-corner-altair/',
  ],
};
export function objectTarget(hit, direction, culture, lang = getLanguage()) {
  if (hit.kind === 'solar')
    return {
      id: hit.id,
      name: solarLabel(hit.body, lang),
      type: 'solar',
      body: hit.body,
      direction: hit.targetDirection,
    };
  if (hit.id && ['star', 'deep-sky'].includes(hit.kind))
    return getXuntianTarget(hit.id, lang, culture);
  return hit.kind === 'sky'
    ? { type: 'sky-field', name: skyText('blank', {}, lang), direction }
    : null;
}
export function celestialCard(hit, direction, culture, lang = getLanguage()) {
  const tr = (key, params) => skyText(key, params, lang);
  const target = objectTarget(hit, direction, culture, lang);
  if (!target)
    return {
      title: (hit.kind === 'satellite' && hit.name) || tr(hit.kind + 'Title'),
      description: [tr(hit.kind), hit.kind === 'satellite' && hit.detail].filter(Boolean).join(' '),
      facts: [],
    };
  const card = { title: target.name, facts: [] };
  const number = (n, d = 2) => n.toLocaleString(lang, { maximumFractionDigits: d });
  if (hit.kind === 'sky') {
    card.description = tr(hit.explicitPosition ? 'usePosition' : 'unmatched');
    return card;
  }
  if (hit.kind === 'star') {
    const file = featured[hit.id],
      catalogue = hit.id.startsWith('hip:')
        ? 'Hipparcos'
        : hit.id.startsWith('gaia:')
          ? 'Gaia DR3'
          : 'Tycho-2';
    card.description = tr(file?.[0] || 'starGeneric');
    card.facts.push(
      [tr('star'), cultureObjectLabel(westernRegion(target.direction), lang)].join(' · ')
    );
    if (target.identifier !== target.name) card.facts.push(target.identifier);
    if (Number.isFinite(hit.magnitude)) card.facts.push(tr('mag') + ' ' + number(hit.magnitude));
    card.facts.push(
      Number.isFinite(hit.distanceLightYears)
        ? tr('distance', { n: number(Number(hit.distanceLightYears.toPrecision(3))) })
        : tr('noDistance')
    );
    if (target.asterisms?.length) card.facts.push(target.asterisms.map((a) => a.name).join(' · '));
    card.facts.push(
      tr('source') + ' · ' + catalogue + (hit.distanceSource ? ' / Hipparcos 2007' : '')
    );
    if (file) card.link = { name: 'NASA', url: nasa + file[1] };
  } else if (hit.kind === 'deep-sky') {
    const item = DEEP_SKY_OBJECTS.find((object) => object.id.toLowerCase() === hit.id.slice(9));
    if (item) card.description = describeSkyObject(item, lang);
    card.facts.push([target.identifier, target.category].filter(Boolean).join(' · '));
    if (item?.source) {
      const sources = {
        'heasarc-messier': 'HEASARC · Messier',
        openngc: 'OpenNGC',
        'esa-webb-avm': 'ESA/Webb · AVM',
      };
      card.facts.push(tr('source') + ' · ' + (sources[item.source] || item.source));
      if (item.sourceUrl)
        card.link = { name: sources[item.source] || item.source, url: item.sourceUrl };
    }
  } else if (hit.kind === 'solar') {
    card.description = tr(hit.body === 'Earth' ? 'earthBody' : hit.body.toLowerCase());
    card.link = { name: 'NASA', url: nasa + hit.body.toLowerCase() + '/' };
    if (Number.isFinite(hit.distanceKm))
      card.facts.push(tr('bodyDistance', { n: number(hit.distanceKm, 0) }));
  }
  return card;
}
