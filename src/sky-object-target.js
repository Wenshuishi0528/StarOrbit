import { getLanguage } from './i18n.js';
import { getXuntianTarget } from './xuntian-catalog.js';
import { solarLabel } from './solar-targets.js';
import { skyText } from './sky-tool-language.js';

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
