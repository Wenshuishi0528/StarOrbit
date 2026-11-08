import chart from '../assets/star-chart.json';
import aliases from '../assets/xuntian-star-aliases.json';
import { cultureStarName, cultureGlyphText, normalizeSkyCulture } from './sky-cultures.js';

const names = new Map(chart.stars.map((star) => [star.id, star])),
  designations = new Map();
for (const [constellation, rows] of Object.entries(aliases.designations)) {
  for (const [hip, bayer, flamsteed] of rows) {
    const mark = bayer || flamsteed;
    if (mark && !designations.has(hip)) designations.set(hip, mark + ' ' + constellation);
  }
}
export function starChartName(hip, language = 'zh', culture = 'western') {
  if (normalizeSkyCulture(culture) === 'chinese') {
    const name = cultureStarName(hip, 'chinese', language);
    if (name) return name;
  }
  const star = names.get(Number(hip));
  return star?.[language] || star?.en || designations.get(Number(hip)) || 'HIP ' + hip;
}
export function starChartHasName(hip, culture = 'western') {
  if (normalizeSkyCulture(culture) === 'chinese') return !!cultureStarName(hip, 'chinese', 'zh');
  return names.has(Number(hip)) || designations.has(Number(hip));
}
export function starChartGlyphText(language = 'zh', culture = 'western') {
  return (
    chart.stars.map((star) => star[language] || star.en).join(' ') +
    [...designations.values()].join(' ') +
    ' HIP0123456789 Tycho-2 · J2000° /+-' +
    (normalizeSkyCulture(culture) === 'chinese' ? cultureGlyphText('chinese') : '')
  );
}
