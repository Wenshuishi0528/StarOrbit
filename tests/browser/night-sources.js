// Run with playwright-cli run-code against a current local build.
async page=>{
 const checks=[],check=(value,name)=>{if(!value)throw Error(name);checks.push(name);};
 const initialized=()=>page.waitForFunction(()=>window.viewer?.sim.initialized&&!viewer.sim.environment.loading);
 await initialized();
 // Simulate the previous released default, then let the real startup migration
 // run. The rest of the user's environment preferences remain intact.
 await page.evaluate(()=>{const key='tiangong-environment-v1',old=JSON.parse(localStorage.getItem(key)||'{}');old.nightSource='2024-1km';delete old.nightSourceDefaultVersion;localStorage.setItem(key,JSON.stringify(old));});
 await page.reload();await initialized();
 check(await page.evaluate(()=>viewer.sim.environment.settings.nightSource==='2025-500m'&&viewer.sim.environment.settings.nightSourceDefaultVersion===1),'old default migrates to 2025 500 m before any manual selection');
 await page.setViewportSize({width:1400,height:900});
 await page.evaluate(async()=>{
  const v=viewer,s=v.sim,e=s.environment;v.music.pause();document.getElementById('welcomeDialog')?.close();
  await e.setQuality('high','2025-500m');
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
 check(await page.evaluate(()=>viewer.sim.environment.settings.nightSource==='2025-500m'&&viewer.sim.environment.settings.nightSourceDefaultVersion===1),'old default migrates to 2025 500 m');
 check(JSON.stringify(await page.locator('#nightSource option').evaluateAll(options=>options.map(o=>o.value)))===JSON.stringify(['2025-500m','2024-1km','2016']),'new source plus both historical choices');
 check(await page.evaluate(()=>{const e=viewer.sim.environment,d=e.nightDetail;return d.columns===48&&d.rows===24&&Object.keys(d.tiles).length===1152&&d.tiles===e.assets.nightSources['2025-500m'].tiles;}),'native 48x24 atlas is active');
 await page.screenshot({path:'output/playwright/night-2025/app-2025.png'});
 const before=await page.evaluate(()=>({day:viewer.sim.environment.uniforms.dayMap.value.uuid,cloud:viewer.sim.environment.builtinCloud.uuid,night:viewer.sim.environment.uniforms.nightMap.value.uuid}));
 for(const id of ['2024-1km','2016']){
  await page.locator('#nightSource').selectOption(id);await settled();
  check(await page.evaluate(({before,id})=>{const e=viewer.sim.environment,d=e.nightDetail;return e.settings.nightSource===id&&d.columns===24&&d.rows===12&&Object.keys(d.tiles).length===288&&e.uniforms.dayMap.value.uuid===before.day&&e.builtinCloud.uuid===before.cloud&&e.uniforms.nightMap.value.uuid!==before.night;},{before,id}),id+' selected with its 24x12 grid without reloading day/cloud textures');
  await page.screenshot({path:'output/playwright/night-2025/app-'+id+'.png'});
 }
 await page.evaluate(async()=>{const e=viewer.sim.environment;await Promise.all([e.setQuality('high','2025-500m'),e.setQuality('high','2016'),e.setQuality('high','2025-500m')]);});await settled();
 check(await page.evaluate(()=>{const e=viewer.sim.environment;return e.settings.nightSource==='2025-500m'&&e.nightDetail.columns===48&&e.nightDetail.tiles===e.assets.nightSources['2025-500m'].tiles;}),'rapid switching commits final year and grid');
 check(await page.evaluate(()=>viewer.sim.environment.nightDetail.slots.filter(s=>s.texture).length<=4),'four night tiles maximum');
 check(await page.evaluate(async()=>{const e=viewer.sim.environment,old=e.assets.nightSources['2016'].base.high,texture=e.uniforms.nightMap.value;e.assets.nightSources['2016'].base.high='missing-night-test.jpg';try{await e.setQuality('high','2016');return e.settings.nightSource==='2025-500m'&&e.nightDetail.columns===48&&e.uniforms.nightMap.value===texture&&document.getElementById('nightSource').value==='2025-500m';}finally{e.assets.nightSources['2016'].base.high=old;}}),'failed base download preserves current year, grid and texture');
 await page.evaluate(async()=>{const e=viewer.sim.environment;await e.setQuality('simple','2016');viewer.sim.render();});
 check(await page.evaluate(()=>{const e=viewer.sim.environment;return e.quality==='simple'&&document.getElementById('nightSource').disabled&&e.nightDetail.slots.every(s=>!s.texture);}), 'simple quality releases night textures and disables selector');
 await page.evaluate(async()=>{await viewer.sim.environment.setQuality('high','2024-1km');});await settled();
 await page.reload();await initialized();
 check(await page.evaluate(()=>{const e=viewer.sim.environment;return e.settings.nightSource==='2024-1km'&&e.nightDetail.columns===24&&document.getElementById('nightSource').value==='2024-1km';}),'explicit historical source survives reload after migration');
 await page.evaluate(async()=>{await viewer.sim.environment.setQuality('high','2025-500m');});
 await page.reload();await initialized();
 check(await page.evaluate(()=>{const e=viewer.sim.environment;return e.settings.nightSource==='2025-500m'&&e.nightDetail.columns===48&&document.getElementById('nightSource').value==='2025-500m';}),'restored 2025 choice survives reload');
 check(await page.evaluate(()=>viewer.renderer.getContext().getError()===0),'no WebGL errors');
 return checks;
}
