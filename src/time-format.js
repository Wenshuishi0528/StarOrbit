// UTC+8 presentation independent of the number of digits in the calendar year.
export const localISO=time=>new Date(time+8*3600000).toISOString().replace(/\.\d{3}Z$/,'');
export const clockText=time=>localISO(time).replace('T',' ');
export const inputText=time=>localISO(time).replace(/^\+0*/, '');
export const shortClock=time=>localISO(time).split('T')[1];
export const shortDate=time=>localISO(time).split('T')[0].slice(-5)+' '+shortClock(time);
export function parseLocalTime(value){
 const normalized=value.replace(/^(\d{5,})-/,(_,year)=>'+'+year.padStart(6,'0')+'-');
 return Date.parse(normalized+'+08:00');
}
