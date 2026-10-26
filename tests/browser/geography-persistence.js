async page=>{
 const results=[],check=(pass,name)=>{results.push({pass:!!pass,name});if(!pass)throw Error(name);};
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 await page.evaluate(async()=>{
  const s=viewer.sim,e=s.environment,w=e.weather;
  viewer.music.audio.pause();Object.assign(e.settings,{geographyEnabled:true,geoCapitals:false,geoDensity:.7});e.save();
  document.querySelector('[data-memory-key="geography"]').open=true;document.querySelector('[data-memory-key="star-chart"]').open=true;s.sessionMemory.save();
  document.getElementById('environmentPresetName').value='Geography persistence test';w.savePreset();document.getElementById('environmentPresets').value=String(w.presets().length-1);
  e.settings.geoCapitals=true;e.settings.geoDensity=.1;await w.loadPreset();
 });
 let state=await page.evaluate(()=>({capitals:viewer.sim.environment.settings.geoCapitals,density:viewer.sim.environment.settings.geoDensity,checked:document.getElementById('geoCapitals').checked}));
 check(!state.capitals&&state.density===.7&&!state.checked,'environment preset restores geography values and controls');
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 state=await page.evaluate(()=>{viewer.music.audio.pause();const s=viewer.sim,e=s.environment;return {enabled:e.settings.geographyEnabled,capitals:e.settings.geoCapitals,density:e.settings.geoDensity,geography:document.querySelector('[data-memory-key="geography"]').open,stars:document.querySelector('[data-memory-key="star-chart"]').open};});
 check(state.enabled&&!state.capitals&&state.density===.7,'reopening restores the shared geography preferences');
 check(state.geography&&state.stars,'both second-level panels retain independent expansion state');
 await page.evaluate(()=>{const e=viewer.sim.environment;e.settings.geoCapitals=true;e.settings.geoDensity=.5;e.save();document.getElementById('geoCapitals').checked=true;document.getElementById('geoDensity').value='.5';});
 return results;
}
