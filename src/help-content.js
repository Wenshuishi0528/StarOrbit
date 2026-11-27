import tours from './help-content/tours.json' with { type: 'json' };

// 导览文字很小，随启动包提供；各语言详细手册较大，首次打开帮助时只载入当前语言。
const manualLoaders = {
  zh: () => import('./help-content/manual-zh.json', { with: { type: 'json' } }),
  en: () => import('./help-content/manual-en.json', { with: { type: 'json' } }),
  fr: () => import('./help-content/manual-fr.json', { with: { type: 'json' } }),
  ru: () => import('./help-content/manual-ru.json', { with: { type: 'json' } }),
};
const contents = {},
  loading = {};

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

const helpLanguage = (language) => (Object.hasOwn(manualLoaders, language) ? language : 'zh');

export function helpTourPages(language = 'zh') {
  const lang = helpLanguage(language);
  return stops.map(([id, target, section]) => ({
    id,
    target,
    section,
    chapter: Number(section.slice(1).split('-')[0]),
    ...tours[lang][id],
  }));
}

// 已载入时同步返回 { tourPages, manualChapters }，否则返回 null。
export function loadedHelpContent(language = 'zh') {
  return contents[helpLanguage(language)] || null;
}

// 并发调用共用同一次载入；失败不缓存，下次打开帮助时重试。
export function loadHelpContent(language = 'zh') {
  const lang = helpLanguage(language);
  if (contents[lang]) return Promise.resolve(contents[lang]);
  return (loading[lang] ??= manualLoaders[lang]()
    .then((module) => {
      contents[lang] = { tourPages: helpTourPages(lang), manualChapters: module.default };
      return contents[lang];
    })
    .finally(() => {
      delete loading[lang];
    }));
}
