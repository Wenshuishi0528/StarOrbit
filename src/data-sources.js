import {parseOrbit,validateOrbit} from './orbit.js';
export function parseOfficialOrbit(html){
 if(html.trim().startsWith('{'))return validateOrbit(JSON.parse(html));
 const text=html.replace(/<[^>]*>/g,'\n').replace(/&nbsp;|&#160;|&#xA0;/gi,' ').replace(/&amp;/g,'&');
 if(!text.includes('REF_FRAME'))return parseOrbit(text);
 const field=k=>text.match(new RegExp('\\b'+k+'\\s*=\\s*(\\S+)'))?.[1];
 if(field('REF_FRAME')!=='EME2000'||field('TIME_SYSTEM')!=='UTC'||field('CENTER_NAME')!=='EARTH')throw Error('官方轨道坐标系无效');
 const number='[+-]?\\d+(?:\\.\\d+)?(?:[Ee][+-]?\\d+)?';const re=new RegExp('(20\\d\\d-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d+)?Z?)\\s+('+Array(6).fill(number).join('\\s+')+')','g');
 const rows=[];for(const m of text.matchAll(re)){const stamp=Date.parse(m[1].slice(0,19)+'Z')+Math.round(Number('0.'+(m[1].match(/\.(\d+)/)?.[1]||'0'))*1000);if(!rows.length||stamp>rows.at(-1)[0])rows.push([stamp,...m[2].trim().split(/\s+/).map(Number)]);}
 return validateOrbit({source:'中国载人航天工程办公室 / BACC',created:field('CREATION_DATE')?.replace(/Z?$/,'Z'),frame:'EME2000',timeSystem:'UTC',units:'km, km/s',rows});
}
