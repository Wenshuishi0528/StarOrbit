import { getLanguage } from './i18n.js';
import { getXuntianTarget } from './xuntian-catalog.js';
import { solarLabel } from './solar-targets.js';
import { skyText } from './sky-tool-language.js';

// A hit inside an extended footprint describes the clicked position. A point
// source keeps its own catalogue direction, including on constellation borders.
export function objectSightline(hit, target, ray) {
  return hit.regionOnly ? ray : target?.direction || ray;
}

export function objectTarget(hit, direction, culture, lang = getLanguage()) {
  if (hit.kind === 'solar')
    return {
      id: hit.id,
      name: solarLabel(hit.body, lang),
      type: 'solar',
      body: hit.body,
      direction: hit.targetDirection,
    };
  if (hit.id && ['star', 'deep-sky', 'formation'].includes(hit.kind))
    return getXuntianTarget(hit.id, lang, culture);
  return hit.kind === 'sky'
    ? { type: 'sky-field', name: skyText('blank', {}, lang), direction }
    : null;
}
