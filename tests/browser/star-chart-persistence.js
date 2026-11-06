// Run in an isolated Playwright profile; seeds legacy preferences and reloads.
async page=>{
 const results=[],check=(pass,name,details={})=>{results.push({pass:!!pass,name,...details});if(!pass)throw Error(name);};
 await page.evaluate(()=>localStorage.removeItem('tiangong-environment-v1'));
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 let q=await page.evaluate(()=>{viewer.music.audio.pause();const e=viewer.sim.environment,c=e.starChart;return {enabled:e.settings.starChartEnabled,catalog:e.settings.catalogStarLabels,art:e.settings.constellationArt,atlas:!!c.texture,geometry:!!c.labels,layouts:c.stats.layouts};});
 check(!q.enabled&&!q.atlas&&!q.geometry&&q.layouts===0,'first startup leaves chart off with no glyph or overlay GPU resources',q);
 check(q.catalog===false&&q.art===true,'first startup defaults to named stars and enables the constellation-art category',q);
 await page.addInitScript(()=>{if(!sessionStorage.getItem('seedLegacyChart'))return;sessionStorage.removeItem('seedLegacyChart');localStorage.setItem('tiangong-environment-v1',JSON.stringify({quality:'simple',starLabels:true}));const s=JSON.parse(localStorage.getItem('tiangong-session-v1'));delete s.detailsByKey;s.details=[false,true,false,true,false,true,false];localStorage.setItem('tiangong-session-v1',JSON.stringify(s));});
 await page.evaluate(()=>sessionStorage.setItem('seedLegacyChart','1'));
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 q=await page.evaluate(()=>{viewer.music.audio.pause();const e=viewer.sim.environment;return {enabled:e.settings.starChartEnabled,catalog:e.settings.catalogStarLabels,checked:document.getElementById('starChartEnabled').checked,sky:document.querySelector('[data-memory-key="sky-style"]').open,weather:document.querySelector('[data-memory-key="weather"]').open,photo:document.querySelector('[data-memory-key="photography"]').open,chart:document.querySelector('[data-memory-key="star-chart"]').open};});
 check(q.enabled&&q.catalog===false&&q.checked,'legacy bright-star preference migrates into explicit categories',q);
 check(q.sky&&!q.weather&&q.photo&&!q.chart,'old sidebar expansion positions remain aligned');
 await page.evaluate(()=>{const saved={...viewer.sim.environment.settings,catalogStarLabels:true,starLabelDensity:.95,constellationArt:false};delete saved.starChartCatalogDefaultVersion;localStorage.setItem('tiangong-environment-v1',JSON.stringify(saved));});
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 q=await page.evaluate(()=>{const s=viewer.sim.environment.settings,p=JSON.parse(localStorage.getItem('tiangong-environment-v1'));return {catalog:s.catalogStarLabels,density:s.starLabelDensity,art:s.constellationArt,marker:s.starChartCatalogDefaultVersion,persisted:p.catalogStarLabels===false&&p.starChartCatalogDefaultVersion===1};});
 check(q.catalog===false&&q.density===.95&&q.art===false&&q.marker===1&&q.persisted,'old automatic catalogue-label default migrates once with an atomic marker while preserving other choices',q);
 await page.evaluate(()=>{const e=viewer.sim.environment;Object.assign(e.settings,{starChartEnabled:true,catalogStarLabels:true,solarSystemLabels:false,starLabelDensity:.8,constellationBoundaries:true});e.save();document.querySelector('[data-memory-key="star-chart"]').open=true;viewer.sim.sessionMemory.save();});
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 q=await page.evaluate(()=>{viewer.music.audio.pause();const e=viewer.sim.environment;return {catalog:e.settings.catalogStarLabels,density:e.settings.starLabelDensity,art:e.settings.constellationArt,marker:e.settings.starChartCatalogDefaultVersion,boundaries:e.settings.constellationBoundaries,catalogControl:document.getElementById('catalogStarNames').checked,open:document.querySelector('[data-memory-key="star-chart"]').open};});
 check(q.catalog===true&&q.density===.8&&q.art===false&&q.marker===1&&q.boundaries&&q.catalogControl===true&&q.open,'reload preserves explicit catalogue opt-in, art opt-out and nested-panel preferences after the migration',q);
 return results;
}
