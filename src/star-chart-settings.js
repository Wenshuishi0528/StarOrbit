export const STAR_CHART_DEFAULTS=Object.freeze({starChartEnabled:false,starLabels:true,catalogStarLabels:true,solarSystemLabels:true,constellationNames:true,constellationLines:true,constellationBoundaries:false,deepSkyObjects:true,deepSkyScope:'featured',starLabelDensity:.95});
const checkboxIds={starChartEnabled:'starChartEnabled',starLabels:'starNames',catalogStarLabels:'catalogStarNames',solarSystemLabels:'solarSystemNames',constellationNames:'constellationNames',constellationLines:'constellationLines',constellationBoundaries:'constellationBoundaries',deepSkyObjects:'deepSkyObjects'};
const own=(value,key)=>Object.hasOwn(value,key);

// Categories are global; each viewing surface owns its display master. Legacy
// scope presets are migrated once and never remain as a hidden second filter.
export function normalizeStarChartSettings(input={}, {strict=false}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)){
  if(strict)throw Error('无效星图设置');input={};
 }
 const invalid=()=>{if(strict)throw Error('无效星图设置');},result={...STAR_CHART_DEFAULTS};
 for(const key of Object.keys(checkboxIds))if(own(input,key)){
  if(typeof input[key]==='boolean')result[key]=input[key];else invalid();
 }
 const legacy=!own(input,'starChartEnabled');
 if(legacy){result.starChartEnabled=own(input,'starLabels')&&input.starLabels===true;result.starLabels=true;}
 if(own(input,'starLabelScope')&&!['major','all','catalog','classic'].includes(input.starLabelScope))invalid();
 const classic=own(input,'starLabelScope')&&input.starLabelScope==='classic'||legacy&&own(input,'starLabels')&&input.starLabels===true;
 if(classic){
  for(const key of ['catalogStarLabels','constellationNames','constellationLines','constellationBoundaries','deepSkyObjects'])if(!own(input,key))result[key]=false;
 }
 if(!legacy&&own(input,'starLabels')&&input.starLabels===false){
  if(!own(input,'catalogStarLabels'))result.catalogStarLabels=false;
  if(!own(input,'solarSystemLabels'))result.solarSystemLabels=false;
 }
 if(own(input,'deepSkyScope')){
  if(['featured','messier','all'].includes(input.deepSkyScope))result.deepSkyScope=input.deepSkyScope;else invalid();
 }
 if(own(input,'starLabelDensity')){
  if(Number.isFinite(input.starLabelDensity)&&input.starLabelDensity>=0&&input.starLabelDensity<=1)result.starLabelDensity=input.starLabelDensity;else invalid();
 }
 return result;
}

export function syncStarChartControls(settings){
 const $=id=>document.getElementById(id);
 for(const [key,id] of Object.entries(checkboxIds)){$(id).checked=settings[key];$(id).disabled=false;}
 $('starLabelDensity').value=String(settings.starLabelDensity);$('starLabelDensity').disabled=false;
 $('deepSkyScope').value=settings.deepSkyScope;$('deepSkyScope').disabled=!settings.deepSkyObjects;
 $('starDensityAll').hidden=settings.starLabelDensity<1;$('starDensityAuto').hidden=settings.starLabelDensity>=1;
}

export function bindStarChartControls(settings,onChange){
 const $=id=>document.getElementById(id),changed=()=>{syncStarChartControls(settings);onChange();};
 for(const [key,id] of Object.entries(checkboxIds))$(id).onchange=()=>{settings[key]=$(id).checked;changed();};
 $('deepSkyScope').onchange=()=>{settings.deepSkyScope=$('deepSkyScope').value;changed();};
 $('starLabelDensity').oninput=()=>{settings.starLabelDensity=Number($('starLabelDensity').value);changed();};
 syncStarChartControls(settings);
}

// Apply the requested quieter startup once; later explicit maximum selections
// and scene imports remain valid and are never silently reduced.
export function migrateStarDensityDefault(settings,storage){
 const key='starorbit-star-density-default-v110';
 try{
  if(storage.getItem(key))return;
  if(settings.starLabelDensity===1)settings.starLabelDensity=STAR_CHART_DEFAULTS.starLabelDensity;
  storage.setItem('tiangong-environment-v1',JSON.stringify(settings));
  storage.setItem(key,'1');
 }catch{}
}
