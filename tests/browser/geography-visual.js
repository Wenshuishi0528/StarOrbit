// Highest-quality daylight view and a focused CPU layout sample.
async page=>{
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 const result=await page.evaluate(async()=>{
  const v=viewer,s=v.sim,e=s.environment,g=e.geography;
  v.music.audio.pause();s.seek(Date.parse('2026-10-24T03:30:00Z'));s.setView('orbit');s.update(performance.now());
  for(const id of ['geographyEnabled','geoCountries','geoCapitals','geoBorders','geoMarine','geoLandforms','geoRivers','geoLakes','geoLocation']){const el=document.getElementById(id);el.checked=true;el.dispatchEvent(new Event('change'));}
  document.getElementById('geoDensity').value='.5';document.getElementById('geoDensity').dispatchEvent(new Event('input'));
  await e.setQuality('high');
  const lon=108*Math.PI/180,lat=32*Math.PI/180,dir=s.spaceCamera.position.clone().set(Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)).applyQuaternion(e.earth.quaternion);
  s.spaceCamera.position.copy(dir).multiplyScalar(20000);s.spaceCamera.up.set(0,0,1);s.orbitControls.target.set(0,0,0);s.orbitControls.stopMotion();s.orbitControls.update();s.render();
  document.querySelector('[data-memory-key="geography"]').open=true;document.querySelector('[data-memory-key="star-chart"]').open=false;document.getElementById('settings-annotations').scrollIntoView({block:'center'});
  for(let i=0;i<30;i++)await new Promise(r=>requestAnimationFrame(r));
  const times=[];for(let i=0;i<30;i++){g.lastKey='';const start=performance.now();g.update(s.current,s.spaceCamera);times.push(performance.now()-start);await new Promise(r=>requestAnimationFrame(r));}
  const key=new Set([...g.shown.values()].filter(p=>p.out===undefined).map(p=>p.kind)),local=g.uniforms.localCamera.value;
  return {quality:e.quality,daylight:dir.dot(e.uniforms.sun.value)>0,visible:g.stats.visible,categories:[...key],atlas:g.atlasSide,glyphs:g.glyphs.size,lineVertices:Object.fromEntries(Object.entries(g.lines).map(([k,v])=>[k,v.geometry.attributes.position.count])),cpuLayoutMs:{mean:times.reduce((a,b)=>a+b)/times.length,max:Math.max(...times),samples:times.length},gpuErrors:v.renderer.getContext().getError(),beijingVisible:[...g.shown.values()].some(p=>p.id==='beijing'),belowHorizon:[...g.shown.values()].filter(p=>p.out===undefined&&p.position.dot(local)/6374<=6371).length};
 });
 await page.screenshot({path:'output/playwright/geography-high.png'});
 return result;
}
