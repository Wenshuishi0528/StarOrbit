// Run with playwright-cli against a freshly loaded build.
async page=>{
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 const checks=[],check=(pass,name)=>{if(!pass)throw Error(name);checks.push(name);};
 await page.evaluate(async()=>{
  const v=viewer,s=v.sim,e=s.environment;v.music.pause();document.getElementById('welcomeDialog').close();
  s.seek(Date.parse('2026-10-26T16:00:00Z'));await e.setQuality('high');s.setView('orbit');s.orbitControls.enableDamping=false;
  e.settings.clouds=false;e.settings.stars=false;e.settings.milky=false;e.settings.groundTrack=false;s.orbitControls.target.set(0,0,0);
  const lat=39.9*Math.PI/180,lon=116.4*Math.PI/180;
  s.spaceCamera.position.set(Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)).applyQuaternion(e.earth.quaternion).multiplyScalar(8755);
  s.spaceCamera.up.set(0,0,1).applyQuaternion(e.earth.quaternion);s.orbitControls.update();s.render();
 });
 const settled=()=>page.waitForFunction(()=>{const d=viewer.sim.environment.nightDetail;return d.wanted.length>0&&d.wanted.every(c=>d.slots.some(s=>s.key===c.key&&s.texture&&performance.now()-s.born>450));});
 await settled();
 check(await page.evaluate(()=>viewer.sim.environment.nightDetail.slots.some(s=>s.texture)),'night detail loads at 2384 km');
 await page.screenshot({path:'output/playwright/earth052-after.png'});
 for(const altitude of [439,1999,2001,2384]){
  await page.evaluate(altitude=>{const s=viewer.sim;s.spaceCamera.position.normalize().multiplyScalar(6371+altitude);s.orbitControls.update();s.render();},altitude);await settled();
  check(await page.evaluate(()=>viewer.sim.environment.nightDetail.slots.filter(s=>s.texture).length<=4),'night detail stays within four slots at '+altitude+' km');
 }
 await page.evaluate(()=>{const s=viewer.sim;s.spaceCamera.position.normalize().multiplyScalar(28000);s.orbitControls.update();s.render();});
 check(await page.evaluate(()=>viewer.sim.environment.nightDetail.slots.every(s=>!s.texture)),'distant overview releases detail');
 await page.evaluate(()=>{viewer.sim.spaceCamera.zoom=8;viewer.sim.render();});await settled();checks.push('zooming distant overview restores detail');
 await page.evaluate(()=>{const s=viewer.sim,e=s.environment;s.spaceCamera.zoom=1;s.spaceCamera.position.normalize().multiplyScalar(8755);s.orbitControls.update();s.seek(Date.parse('2026-10-26T04:00:00Z'));s.update(performance.now());const lat=39.9*Math.PI/180,lon=116.4*Math.PI/180;s.spaceCamera.position.set(Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)).applyQuaternion(e.earth.quaternion).multiplyScalar(8755);s.spaceCamera.up.set(0,0,1).applyQuaternion(e.earth.quaternion);s.orbitControls.update();s.render();});
 await page.waitForFunction(()=>viewer.sim.environment.detail.slots.some(s=>s.texture));checks.push('day detail loads at 2384 km');
 await page.evaluate(async()=>{await viewer.sim.environment.setQuality('standard');viewer.sim.render();});
 check(await page.evaluate(()=>[viewer.sim.environment.detail,viewer.sim.environment.nightDetail].every(d=>d.slots.every(s=>!s.texture))),'standard quality releases all detail textures');
 check(await page.evaluate(()=>viewer.renderer.getContext().getError()===0),'no WebGL error');
 return checks;
}
