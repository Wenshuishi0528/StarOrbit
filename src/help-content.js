import manualZh from './help-content/manual-zh.json';
import manualEn from './help-content/manual-en.json';
import manualFr from './help-content/manual-fr.json';
import manualRu from './help-content/manual-ru.json';
import tours from './help-content/tours.json';

const manuals = { zh: manualZh, en: manualEn, fr: manualFr, ru: manualRu };

// Stable topic and section IDs keep bookmarks independent of language and order.
const stops = [
  ['view', '#stage', 's1-2'],
  ['mission', '#missionSelect', 's2-1'],
  ['time', '.time-step-row', 's2-3'],
  ['assembly', '[data-preset="labs"]', 's3-2'],
  ['sky-image', '#skyDetailSource', 's6-1'],
  ['xuntian', '#openXuntianMap', 's4-2'],
  ['sky-chart', '#starChartEnabled', 's6-2'],
  ['flight', '#attitudeNavball', 's3-4'],
  ['world', '.world-entry', 's5-1'],
  ['pass', '#openFlightLab', 's8-1'],
  ['observatory', '#openPlanetaryObservatory', 's7-1'],
  ['resources', '#openDataResources', 's11-1'],
  ['share', '#saveImage', 's10-1'],
];

export function getHelpContent(language = 'zh') {
  const lang = Object.hasOwn(manuals, language) ? language : 'zh';
  const tourPages = stops.map(([id, target, section]) => ({
    id,
    target,
    section,
    chapter: Number(section.slice(1).split('-')[0]),
    ...tours[lang][id],
  }));
  return { tourPages, manualChapters: manuals[lang] };
}
