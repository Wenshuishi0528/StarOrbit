export const GEOGRAPHY_DEFAULTS=Object.freeze({geographyEnabled:false,geoCountries:true,geoCapitals:true,geoCities:true,geoCityTier:1,geoBorders:true,geoMarine:true,geoLandforms:true,geoRivers:true,geoLakes:true,geoLocation:true,geoDensity:.5});
const switches=Object.keys(GEOGRAPHY_DEFAULTS).filter(k=>typeof GEOGRAPHY_DEFAULTS[k]==='boolean');
export function normalizeGeographySettings(input={}, {strict=false}={}){
 const result={...GEOGRAPHY_DEFAULTS},invalid=()=>{if(strict)throw Error('无效地理标注设置');};
 if(!input||typeof input!=='object'||Array.isArray(input)){invalid();return result;}
 for(const key of switches)if(Object.hasOwn(input,key)){if(typeof input[key]==='boolean')result[key]=input[key];else invalid();}
 if(Object.hasOwn(input,'geoDensity')){if(Number.isFinite(input.geoDensity)&&input.geoDensity>=0&&input.geoDensity<=1)result.geoDensity=input.geoDensity;else invalid();}
 if(Object.hasOwn(input,'geoCityTier')){if([1,2,3].includes(input.geoCityTier))result.geoCityTier=input.geoCityTier;else invalid();}
 return result;
}
export function syncGeographyControls(settings){
 for(const key of switches){const el=document.getElementById(key);el.checked=settings[key];el.disabled=key!=='geographyEnabled'&&!settings.geographyEnabled;}
 const tier=document.getElementById('geoCityTier');tier.value=settings.geoCityTier;tier.disabled=!settings.geographyEnabled||!settings.geoCities;
 const density=document.getElementById('geoDensity');density.value=settings.geoDensity;density.disabled=!settings.geographyEnabled;
}
export function bindGeographyControls(settings,changed){
 for(const key of switches)document.getElementById(key).onchange=e=>{settings[key]=e.target.checked;syncGeographyControls(settings);changed();};
 document.getElementById('geoDensity').oninput=e=>{settings.geoDensity=Number(e.target.value);changed();};
 document.getElementById('geoCityTier').onchange=e=>{settings.geoCityTier=Number(e.target.value);changed();};
 syncGeographyControls(settings);
}

// Capitals and cities share one anchor; enabling both never duplicates a label.
export function cityLabelEnabled(place,settings){
 return (place.kind==='capital'&&settings.geoCapitals)||
  (!!settings.geoCities&&place.cityTier<=settings.geoCityTier);
}
