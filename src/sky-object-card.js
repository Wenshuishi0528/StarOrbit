import { getLanguage } from './i18n.js';
import { DEEP_SKY_OBJECTS } from './deep-sky-catalog.js';
import { readDeepSkyObject } from './deep-sky-guide.js';
import { cultureObjectLabel } from './sky-cultures.js';
import { westernRegion } from './sky-location-math.js';
import { stellarDistance } from './xuntian-distance.js';
import { skyText } from './sky-tool-language.js';
import { objectTarget } from './sky-object-target.js';
import { readCatalogStar, readSolarBody } from './stellar-body-reading.js';

export { objectTarget } from './sky-object-target.js';
const deepSkyById = new Map(DEEP_SKY_OBJECTS.map((object) => [object.id.toLowerCase(), object]));

export function catalogCard(target, hit = {}, lang = getLanguage()) {
  if (!target) return null;
  const tr = (key, params) => skyText(key, params, lang);
  const number = (n, digits = 2) => n.toLocaleString(lang, { maximumFractionDigits: digits });
  const facts = [];
  let article;
  if (target.type === 'star') {
    const values = { ...target, ...stellarDistance(target.id), ...hit };
    article = readCatalogStar(target, values, lang);
    const catalogue = target.id.startsWith('hip:')
      ? 'Hipparcos'
      : target.id.startsWith('gaia:')
        ? 'Gaia DR3'
        : 'Tycho-2';
    if (target.direction)
      facts.push(
        [tr('star'), cultureObjectLabel(westernRegion(target.direction), lang)].join(' · ')
      );
    if (target.identifier && target.identifier !== target.name) facts.push(target.identifier);
    if (Number.isFinite(values.magnitude)) facts.push(tr('mag') + ' ' + number(values.magnitude));
    facts.push(
      Number.isFinite(values.distanceLightYears)
        ? tr('distance', { n: number(Number(values.distanceLightYears.toPrecision(3))) })
        : tr('noDistance')
    );
    if (target.asterisms?.length) facts.push(target.asterisms.map((a) => a.name).join(' · '));
    facts.push(
      tr('source') + ' · ' + catalogue + (values.distanceSource ? ' / Hipparcos 2007' : '')
    );
  } else if (target.type === 'deep-sky') {
    const item = deepSkyById.get(target.id.replace(/^deep-sky:/i, '').toLowerCase());
    article = readDeepSkyObject(item, lang);
    facts.push([target.identifier, target.category].filter(Boolean).join(' · '));
    const source =
      {
        'heasarc-messier': 'HEASARC · Messier',
        openngc: 'OpenNGC',
        'esa-webb-avm': 'ESA/Webb · AVM',
      }[item?.source] || item?.source;
    if (source) facts.push(tr('source') + ' · ' + source);
  } else if (target.type === 'solar') {
    article = readSolarBody(target.body, lang);
    if (Number.isFinite(hit.distanceKm))
      facts.push(tr('bodyDistance', { n: number(hit.distanceKm, 0) }));
  }
  return article ? { title: target.name, facts: facts.filter(Boolean), ...article } : null;
}

export function celestialCard(hit, direction, culture, lang = getLanguage()) {
  const target = objectTarget(hit, direction, culture, lang);
  return (
    catalogCard(target, hit, lang) || {
      title: target?.name || hit.name || skyText(hit.kind + 'Title', {}, lang),
      description:
        hit.kind === 'sky'
          ? skyText(hit.explicitPosition ? 'usePosition' : 'unmatched', {}, lang)
          : [skyText(hit.kind, {}, lang), hit.kind === 'satellite' && hit.detail]
              .filter(Boolean)
              .join(' '),
      facts: [],
    }
  );
}
