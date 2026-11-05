// Search labels stay available even before an orbit sample is ready.
const names = {
 Sun:['太阳','Soleil','Солнце','太陽'], Moon:['月球','Lune','Луна','月亮'],
 Mercury:['水星','Mercure','Меркурий'], Venus:['金星','Vénus','Венера','启明星','太白'],
 Earth:['地球','Terre','Земля'], Mars:['火星','Mars','Марс'],
 Jupiter:['木星','Jupiter','Юпитер'], Saturn:['土星','Saturne','Сатурн'],
 Uranus:['天王星','Uranus','Уран'], Neptune:['海王星','Neptune','Нептун']
};
const fold=text=>text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
export function solarLabel(id,lang){
 const row=names[id];
 return lang==='zh'?row[0]:lang==='fr'?row[1]:lang==='ru'?row[2]:id;
}
export function searchSolarTargets(text,lang){
 const query=fold(text);if(!query)return [];
 return Object.entries(names).flatMap(([body,aliases])=>{
  const keys=[body,...aliases].map(fold);
  if(!keys.some(key=>key.startsWith(query)))return [];
  return [{id:'solar:'+body,body,type:'solar',name:solarLabel(body,lang),
   category:body==='Sun'?'恒星':body==='Moon'?'天然卫星':'行星',exact:keys.includes(query)}];
 }).sort((a,b)=>Number(b.exact)-Number(a.exact));
}
