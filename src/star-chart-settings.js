export const STAR_CHART_DEFAULTS=Object.freeze({starChartEnabled:false,starLabels:true,starLabelScope:'major',constellationNames:true,constellationLines:true,constellationBoundaries:false,starLabelDensity:.55});
const checkboxIds={starChartEnabled:'starChartEnabled',starLabels:'starNames',constellationNames:'constellationNames',constellationLines:'constellationLines',constellationBoundaries:'constellationBoundaries'};
const own=(value,key)=>Object.hasOwn(value,key);

// Keep saved preferences, environment presets and imported scenes on one schema.
export function normalizeStarChartSettings(input={}, {strict=false}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)){
  if(strict)throw Error('无效星图设置');input={};
 }
 const invalid=()=>{if(strict)throw Error('无效星图设置');};
 const result={...STAR_CHART_DEFAULTS};
 const legacy=!own(input,'starChartEnabled');
 for(const key of Object.keys(checkboxIds))if(own(input,key)){
  if(typeof input[key]==='boolean')result[key]=input[key];else invalid();
 }
 if(legacy){result.starChartEnabled=own(input,'starLabels')&&input.starLabels===true;result.starLabels=true;result.starLabelScope=result.starChartEnabled?'classic':'major';}
 if(own(input,'starLabelScope')){
  if(['major','all','classic'].includes(input.starLabelScope))result.starLabelScope=input.starLabelScope;else invalid();
 }
 if(own(input,'starLabelDensity')){
  if(Number.isFinite(input.starLabelDensity)&&input.starLabelDensity>=0&&input.starLabelDensity<=1)result.starLabelDensity=input.starLabelDensity;else invalid();
 }
 return result;
}

export function syncStarChartControls(settings){
 const $=id=>document.getElementById(id),enabled=settings.starChartEnabled,classic=settings.starLabelScope==='classic';
 for(const [key,id] of Object.entries(checkboxIds)){
  $(id).checked=settings[key];$(id).disabled=key!=='starChartEnabled'&&(!enabled||(classic&&key.startsWith('constellation')));
 }
 $('starLabelScope').value=settings.starLabelScope;$('starLabelScope').disabled=!enabled;
 $('starLabelDensity').value=String(settings.starLabelDensity);$('starLabelDensity').disabled=!enabled||classic;
 $('classicStarNote').hidden=!classic;
}

export function bindStarChartControls(settings,onChange){
 const $=id=>document.getElementById(id),changed=()=>{syncStarChartControls(settings);onChange();};
 for(const [key,id] of Object.entries(checkboxIds))$(id).onchange=()=>{settings[key]=$(id).checked;changed();};
 $('starLabelScope').onchange=()=>{settings.starLabelScope=$('starLabelScope').value;changed();};
 $('starLabelDensity').oninput=()=>{settings.starLabelDensity=Number($('starLabelDensity').value);changed();};
 syncStarChartControls(settings);
}
