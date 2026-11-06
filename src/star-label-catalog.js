import chart from '../assets/star-chart.json';
import aliases from '../assets/xuntian-star-aliases.json';

const names=new Map(chart.stars.map(star=>[star.id,star])),designations=new Map();
for(const [constellation,rows] of Object.entries(aliases.designations)){
 for(const [hip,bayer,flamsteed] of rows){
  const mark=bayer||flamsteed;if(mark&&!designations.has(hip))designations.set(hip,mark+' '+constellation);
 }
}
export function starChartName(hip,language='zh'){
 const star=names.get(Number(hip));
 return star?.[language]||star?.en||designations.get(Number(hip))||'HIP '+hip;
}
export function starChartHasName(hip){return names.has(Number(hip))||designations.has(Number(hip));}
export function starChartGlyphText(language='zh'){
 return chart.stars.map(star=>star[language]||star.en).join(' ')+[...designations.values()].join(' ')+' HIP0123456789 Tycho-2 · J2000° /+-';
}
