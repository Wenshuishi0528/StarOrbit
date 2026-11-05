// Run with playwright-cli run-code against a fresh local build.
async page=>{
 const checks=[],check=(value,name)=>{if(!value)throw Error(name);checks.push(name);};
 await page.waitForFunction(()=>window.viewer?.sim.initialized&&!viewer.sim.environment.loading);
 await page.setViewportSize({width:1400,height:900});
 await page.evaluate(()=>{
  const v=viewer,s=v.sim,e=s.environment;v.music.pause();document.getElementById('welcomeDialog')?.close();
  s.seek(Date.parse('2026-10-26T16:00:00Z'));s.setView('orbit');s.orbitControls.enableDamping=false;
  e.settings.clouds=false;e.settings.stars=false;e.settings.milky=false;e.settings.groundTrack=false;
  s.update(performance.now());s.orbitControls.target.set(0,0,0);
  const lat=39.9*Math.PI/180,lon=116.4*Math.PI/180;
  s.spaceCamera.position.set(Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)).applyQuaternion(e.earth.quaternion).multiplyScalar(8755);
  s.spaceCamera.up.set(0,0,1).applyQuaternion(e.earth.quaternion);s.orbitControls.update();s.render();
  const button=document.querySelector('[aria-controls="settings-environment"]');if(button.getAttribute('aria-expanded')==='false')button.click();
  document.getElementById('nightSource').scrollIntoView({block:'center'});
 });
 const settled=()=>page.waitForFunction(()=>{const e=viewer.sim.environment,d=e.nightDetail;return !e.loading&&d.wanted.length&&d.wanted.every(c=>d.slots.some(s=>s.key===c.key&&s.texture&&performance.now()-s.born>450));});
 await settled();
 check(await page.evaluate(()=>viewer.sim.environment.settings.nightSource==='2024-1km'),'default 2024 1 km');
 check(await page.locator('#nightSource option').count()===2,'exactly two 1 km choices, no 500 m option');
 await page.screenshot({path:'output/playwright/night-2024/app-2024.png'});
 const before=await page.evaluate(()=>({day:viewer.sim.environment.uniforms.dayMap.value.uuid,cloud:viewer.sim.environment.builtinCloud.uuid,night:viewer.sim.environment.uniforms.nightMap.value.uuid}));
 await page.locator('#nightSource').selectOption('2016');await settled();
 check(await page.evaluate(before=>{const e=viewer.sim.environment;return e.settings.nightSource==='2016'&&e.uniforms.dayMap.value.uuid===before.day&&e.builtinCloud.uuid===before.cloud&&e.uniforms.nightMap.value.uuid!==before.night;},before),'2016 selected without reloading day/cloud textures');
 await page.screenshot({path:'output/playwright/night-2024/app-2016.png'});
 await page.evaluate(async()=>{const e=viewer.sim.environment;await Promise.all([e.setQuality('standard','2024-1km'),e.setQuality('standard','2016'),e.setQuality('standard','2024-1km')]);});await settled();
 check(await page.evaluate(()=>{const e=viewer.sim.environment;return e.settings.nightSource==='2024-1km'&&e.nightDetail.tiles===e.assets.nightSources['2024-1km'].tiles;}),'rapid switching commits the final year and its tiles');
 check(await page.evaluate(()=>viewer.sim.environment.nightDetail.slots.filter(s=>s.texture).length<=4),'four night tiles maximum');
 check(await page.evaluate(async()=>{const e=viewer.sim.environment,old=e.assets.nightSources['2016'].base.standard,texture=e.uniforms.nightMap.value;e.assets.nightSources['2016'].base.standard='missing-night-test.jpg';await e.setQuality('standard','2016');e.assets.nightSources['2016'].base.standard=old;return e.settings.nightSource==='2024-1km'&&e.uniforms.nightMap.value===texture&&document.getElementById('nightSource').value==='2024-1km';}),'failed base download preserves current year and texture');
 await page.evaluate(async()=>{const e=viewer.sim.environment;await e.setQuality('simple','2016');viewer.sim.render();});
 check(await page.evaluate(()=>{const e=viewer.sim.environment;return e.quality==='simple'&&document.getElementById('nightSource').disabled&&e.nightDetail.slots.every(s=>!s.texture);}), 'simple quality releases night textures and disables selector');
 await page.evaluate(async()=>{await viewer.sim.environment.setQuality('standard','2016');});await settled();
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized&&!viewer.sim.environment.loading);
 check(await page.evaluate(()=>viewer.sim.environment.settings.nightSource==='2016'&&document.getElementById('nightSource').value==='2016'),'selected year persists across reload');
 check(await page.evaluate(()=>viewer.renderer.getContext().getError()===0),'no WebGL errors');
 return checks;
}
