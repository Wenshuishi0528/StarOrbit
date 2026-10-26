// Playwright CLI run-code function; run after missions.js in an isolated profile.
async (page) => {
 const results=[],check=(ok,name)=>{results.push({name,pass:!!ok});if(!ok)throw Error(name);};
 const before=await page.evaluate(async()=>{
  const {sim,state,changeAngle}=viewer,m=sim.missions;
  await m.switchTo('tiangong');sim.auto=false;changeAngle('left',37);sim.sessionMemory.save();const assembly=JSON.stringify(state);
  await m.switchTo('dfh1');m.state.pose={roll:17,pitch:23,yaw:-31};m.applyPose();
  const scene=sim.sceneShare.capture();scene.orbit=null;await sim.sceneShare.importScene(scene);sim.sessionMemory.save();
  return {assembly,time:sim.time,pose:m.state.pose};
 });
 await page.reload();await page.waitForFunction(()=>!!window.viewer);
 const satellite=await page.evaluate(()=>({id:viewer.sim.missionId,data:viewer.sim.data,time:viewer.sim.time,pose:viewer.sim.missions.state.pose}));
 check(satellite.id==='dfh1'&&satellite.data===null,'model-only mission survives reload');
 check(satellite.time===before.time&&JSON.stringify(satellite.pose)===JSON.stringify(before.pose),'time and spacecraft attitude survive reload');
 await page.evaluate(()=>viewer.sim.missions.switchTo('tiangong'));
 check(await page.evaluate(()=>JSON.stringify(viewer.state))===before.assembly,'station manual wing angles survive other-mission boot');
 await page.reload();await page.waitForFunction(()=>!!window.viewer);
 check(await page.evaluate(()=>!viewer.sim.auto&&JSON.stringify(viewer.state))===before.assembly,'station manual wing angles survive own boot');
 const scene=await page.evaluate(async()=>{const s=viewer.sim;await s.missions.switchTo('dfh1');const w=s.environment.weather;w.settings.orbitRecord=null;w.settings.orbitRecords.dfh1=null;w.useOrbit(s.bundledOrbits.dfh1,false);s.seek(s.start+3*86400000);s.sessionMemory.save();return s.sceneShare.capture();});
 await page.locator('#sceneFile').setInputFiles({name:'dfh1.tiangong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(scene))});
 await page.waitForFunction(()=>document.getElementById('sceneStatus').textContent.includes('已恢复')&&!viewer.sim.sceneBusy);
 check(await page.evaluate(()=>viewer.sim.missionId==='dfh1'&&viewer.sim.data.propagator==='SGP4'),'scene file upload restores mission');
 await page.evaluate(()=>document.querySelector('[data-settings-module="sharing"]')?.querySelector('.settings-toggle')?.click());
 const downloadPromise=page.waitForEvent('download');await page.locator('#exportScene').evaluate(el=>el.click());const download=await downloadPromise;
 await download.saveAs('/Users/apple/Documents/Codex/Tiangong-Orbit-Simulator/output/playwright/dfh1-roundtrip.tiangong.json');
 check(download.suggestedFilename().endsWith('.tiangong.json'),'scene export downloads JSON file');
 const asyncChecks=await page.evaluate(async()=>{
  const w=viewer.sim.environment.weather,proto=Object.getPrototypeOf(w),data=viewer.sim.data;let release;
  const delayed=new Promise(r=>release=r),orbitProto=Object.getPrototypeOf(viewer.sim.orbits),stub={records:{dfh1:'A'},sim:{bundledOrbits:viewer.sim.bundledOrbits,api:{toast(){}}},resources:{items:[{id:'A',kind:'orbit',missionId:'dfh1',blob:{text:()=>delayed}},{id:'B',kind:'orbit',missionId:'dfh1',blob:new Blob([JSON.stringify({...data,source:'B'})])}]}};
  const pending=orbitProto.resolve.call(stub,'dfh1');stub.records.dfh1='B';release(JSON.stringify({...data,source:'A'}));const loaded=await pending;
  let protectedIds;await proto.trim.call({settings:{limit:20,orbitRecords:{tiangong:'station',dfh1:'satellite'}},active:{cloud:'cloud'},cache:{trim:async(limit,ids)=>{protectedIds=ids;}},reload:async()=>{}});
  // Keep the preset's quality await pending and attempt an intervening switch.
  const original=w.env.setQuality;let unlock;w.env.setQuality=()=>new Promise(r=>unlock=r);w.savePreset();document.getElementById('environmentPresets').value=String(w.presets().length-1);
  const restoration=w.loadPreset();while(!unlock)await new Promise(r=>setTimeout(r,0));let rejected=false;try{await viewer.sim.missions.switchTo('tiangong');}catch{rejected=true;}unlock();await restoration;w.env.setQuality=original;
  return {race:loaded.recordId==='B'&&loaded.data.source==='B',cache:protectedIds.includes('station')&&protectedIds.includes('satellite'),preset:rejected&&viewer.sim.missionId==='dfh1'&&!viewer.sim.sceneBusy};
 });
 check(asyncChecks.race,'cache read remains consistent with concurrent update');check(asyncChecks.cache,'automatic trimming protects every selected mission orbit');check(asyncChecks.preset,'preset restore blocks task switch until complete');
 return results;
}
