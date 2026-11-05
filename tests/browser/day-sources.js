// Run against a fresh local build using the Playwright CLI.
async page=>{
 const checks=[],check=(value,name)=>{if(!value)throw Error(name);checks.push(name);};
 await page.waitForFunction(()=>window.viewer?.sim.initialized&&!viewer.sim.environment.loading);
 await page.setViewportSize({width:1400,height:900});
 await page.evaluate(()=>{
  const v=viewer,s=v.sim,e=s.environment;v.music.pause();document.getElementById('welcomeDialog')?.close();
  s.seek(Date.parse('2026-06-15T04:00:00Z'));s.setView('orbit');s.orbitControls.enableDamping=false;
  e.settings.clouds=false;e.settings.stars=false;e.settings.milky=false;e.settings.groundTrack=false;
  s.update(performance.now());s.orbitControls.target.set(0,0,0);
  const lat=39.9*Math.PI/180,lon=116.4*Math.PI/180;
  s.spaceCamera.position.set(Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)).applyQuaternion(e.earth.quaternion).multiplyScalar(8755);
  s.spaceCamera.up.set(0,0,1).applyQuaternion(e.earth.quaternion);s.orbitControls.update();s.render();
  const button=document.querySelector('[aria-controls="settings-environment"]');if(button.getAttribute('aria-expanded')==='false')button.click();
  document.getElementById('daySource').scrollIntoView({block:'center'});
 });
 const settled=()=>page.waitForFunction(()=>{const e=viewer.sim.environment,d=e.detail;return !e.loading&&d.wanted.length&&d.wanted.every(c=>d.slots.some(s=>s.key===c.key&&s.texture&&performance.now()-s.born>450));});
 await settled();
 check(await page.evaluate(()=>viewer.sim.environment.settings.daySource==='2026-q2-1km'),'default 2026 Q2');
 check(await page.locator('#daySource option').count()===2,'two explicit dated maps');
 await page.screenshot({path:'output/playwright/day-2026/app-2026.png'});
 const before=await page.evaluate(()=>{const e=viewer.sim.environment;return {day:e.uniforms.dayMap.value.uuid,night:e.uniforms.nightMap.value.uuid,cloud:e.builtinCloud.uuid};});
 await page.locator('#daySource').selectOption('2004');await settled();
 check(await page.evaluate(before=>{const e=viewer.sim.environment;return e.settings.daySource==='2004'&&e.uniforms.dayMap.value.uuid!==before.day&&e.uniforms.nightMap.value.uuid===before.night&&e.builtinCloud.uuid===before.cloud&&e.detail.columns===12;},before),'2004 replaces only daytime resources and uses original grid');
 await page.screenshot({path:'output/playwright/day-2026/app-2004.png'});
 await page.evaluate(async()=>{const e=viewer.sim.environment;await Promise.all([e.setQuality('standard','2024-1km','2026-q2-1km'),e.setQuality('standard','2016','2004'),e.setQuality('standard','2016','2026-q2-1km')]);});await settled();
 check(await page.evaluate(()=>{const e=viewer.sim.environment;return e.settings.daySource==='2026-q2-1km'&&e.settings.nightSource==='2016'&&e.detail.tiles===e.assets.daySources['2026-q2-1km'].tiles&&e.detail.columns===24;}),'rapid day/night changes commit the final pair');
 check(await page.evaluate(()=>viewer.sim.environment.detail.slots.filter(s=>s.texture).length<=4),'four daytime detail tiles maximum');
 check(await page.evaluate(async()=>{const e=viewer.sim.environment,old=e.assets.daySources['2004'].base.standard,texture=e.uniforms.dayMap.value;e.assets.daySources['2004'].base.standard='missing-day-test.jpg';await e.setQuality('standard',e.settings.nightSource,'2004');e.assets.daySources['2004'].base.standard=old;return e.settings.daySource==='2026-q2-1km'&&e.uniforms.dayMap.value===texture&&document.getElementById('daySource').value==='2026-q2-1km';}),'failed base download retains current map and selection');
 await page.evaluate(async()=>{const e=viewer.sim.environment;await e.setQuality('simple',e.settings.nightSource,'2004');viewer.sim.render();});
 check(await page.evaluate(()=>{const e=viewer.sim.environment;return e.quality==='simple'&&e.settings.daySource==='2004'&&!document.getElementById('daySource').disabled&&e.detail.slots.every(s=>!s.texture);}), 'simple quality keeps selectable base and releases detail');
 await page.evaluate(async()=>{const e=viewer.sim.environment;await e.setQuality('standard',e.settings.nightSource,'2004');});await settled();
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized&&!viewer.sim.environment.loading);
 check(await page.evaluate(()=>viewer.sim.environment.settings.daySource==='2004'&&document.getElementById('daySource').value==='2004'),'daytime map persists across reload');
 check(await page.evaluate(()=>viewer.renderer.getContext().getError()===0),'no WebGL errors');
 return checks;
}
