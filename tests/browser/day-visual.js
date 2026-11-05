// Final rendered colour/shoreline review, with the same camera for both sources.
async page=>{
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized&&!viewer.sim.environment.loading);
 await page.setViewportSize({width:1400,height:900});
 await page.evaluate(()=>{viewer.music.pause();document.getElementById('welcomeDialog')?.close();const e=viewer.sim.environment;e.settings.clouds=false;e.settings.stars=false;e.settings.milky=false;e.settings.geographyEnabled=false;e.settings.groundTrack=false;});
 for(const item of [
  {name:'americas-2026',lon:-90,lat:15,time:'18:00',source:'2026-q2-1km',radius:24000},
  {name:'americas-2004',lon:-90,lat:15,time:'18:00',source:'2004',radius:24000},
  {name:'africa-2026',lon:10,lat:15,time:'11:20',source:'2026-q2-1km',radius:24000},
  {name:'asia-2026',lon:120,lat:25,time:'04:00',source:'2026-q2-1km',radius:24000},
  {name:'east-sea-2026',lon:123,lat:33,time:'04:00',source:'2026-q2-1km',radius:8500}
 ]){
  await page.evaluate(async item=>{
   const s=viewer.sim,e=s.environment;await e.setQuality('high','2024-1km',item.source);s.seek(Date.parse('2026-06-15T'+item.time+':00Z'));s.setView('orbit');s.orbitControls.enableDamping=false;
   s.update(performance.now());s.orbitControls.target.set(0,0,0);
   const lat=item.lat*Math.PI/180,lon=item.lon*Math.PI/180;
   s.spaceCamera.position.set(Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)).applyQuaternion(e.earth.quaternion).multiplyScalar(item.radius);
   s.spaceCamera.up.set(0,0,1).applyQuaternion(e.earth.quaternion);s.orbitControls.update();s.render();
   const button=document.querySelector('[aria-controls="settings-environment"]');if(button.getAttribute('aria-expanded')==='false')button.click();document.getElementById('daySource').scrollIntoView({block:'center'});
  },item);
  await page.waitForFunction(()=>{const e=viewer.sim.environment,d=e.detail;return !e.loading&&d.wanted.every(c=>d.slots.some(s=>s.key===c.key&&s.texture&&performance.now()-s.born>700));});
  await page.screenshot({path:'output/playwright/day-2026/'+item.name+'.png'});
 }
 return {title:await page.title(),source:await page.locator('#daySource').inputValue(),glError:await page.evaluate(()=>viewer.renderer.getContext().getError())};
}
