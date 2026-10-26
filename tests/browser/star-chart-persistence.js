// Run in an isolated Playwright profile; seeds legacy preferences and reloads.
async page=>{
 const results=[],check=(pass,name,details={})=>{results.push({pass:!!pass,name,...details});if(!pass)throw Error(name);};
 await page.evaluate(()=>localStorage.removeItem('tiangong-environment-v1'));
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 let q=await page.evaluate(()=>{viewer.music.audio.pause();const e=viewer.sim.environment,c=e.starChart;return {enabled:e.settings.starChartEnabled,atlas:!!c.texture,geometry:!!c.labels,layouts:c.stats.layouts};});
 check(!q.enabled&&!q.atlas&&!q.geometry&&q.layouts===0,'first startup leaves chart off with no glyph or overlay GPU resources',q);
 await page.addInitScript(()=>{if(!sessionStorage.getItem('seedLegacyChart'))return;sessionStorage.removeItem('seedLegacyChart');localStorage.setItem('tiangong-environment-v1',JSON.stringify({quality:'simple',starLabels:true}));const s=JSON.parse(localStorage.getItem('tiangong-session-v1'));delete s.detailsByKey;s.details=[false,true,false,true,false,true,false];localStorage.setItem('tiangong-session-v1',JSON.stringify(s));});
 await page.evaluate(()=>sessionStorage.setItem('seedLegacyChart','1'));
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 q=await page.evaluate(()=>{viewer.music.audio.pause();const e=viewer.sim.environment;return {enabled:e.settings.starChartEnabled,scope:e.settings.starLabelScope,checked:document.getElementById('starChartEnabled').checked,sky:document.querySelector('[data-memory-key="sky-style"]').open,weather:document.querySelector('[data-memory-key="weather"]').open,photo:document.querySelector('[data-memory-key="photography"]').open,chart:document.querySelector('[data-memory-key="star-chart"]').open};});
 check(q.enabled&&q.scope==='classic'&&q.checked,'legacy bright-star switch migrates to the three-label preset',q);
 check(q.sky&&!q.weather&&q.photo&&!q.chart,'old sidebar expansion positions remain aligned');
 await page.evaluate(()=>{const e=viewer.sim.environment;Object.assign(e.settings,{starChartEnabled:true,starLabelScope:'all',starLabelDensity:.8,constellationBoundaries:true});e.save();document.querySelector('[data-memory-key="star-chart"]').open=true;viewer.sim.sessionMemory.save();});
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 q=await page.evaluate(()=>{viewer.music.audio.pause();const e=viewer.sim.environment;return {scope:e.settings.starLabelScope,density:e.settings.starLabelDensity,boundaries:e.settings.constellationBoundaries,scopeControl:document.getElementById('starLabelScope').value,open:document.querySelector('[data-memory-key="star-chart"]').open};});
 check(q.scope==='all'&&q.density===.8&&q.boundaries&&q.scopeControl==='all'&&q.open,'reload restores all annotation preferences and its nested panel',q);
 return results;
}
