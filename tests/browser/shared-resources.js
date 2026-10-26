// Playwright CLI function: exercises the visible import control with local fixtures.
async(page)=>{
 const results=[],check=(value,name)=>{results.push({name,pass:!!value});if(!value)throw Error(name);};
 const base='http://127.0.0.1:8878';
 await page.goto(base+'/天宫空间站交互预览.html');await page.waitForFunction(()=>!!window.viewer);
 await page.evaluate(async()=>{await viewer.sim.missions.switchTo('dfh1');const db=await new Promise(resolve=>{const request=indexedDB.open('tiangong-mission-packages-v1',1);request.onsuccess=()=>resolve(request.result);});await new Promise(resolve=>{const tx=db.transaction('snapshots','readwrite');for(const id of ['test-large','test-tiny','test-lock'])tx.objectStore('snapshots').delete(id);tx.oncomplete=resolve;});db.close();});
 await page.goto(base+'/天宫空间站交互预览.html');await page.waitForFunction(()=>!!window.viewer);await page.locator('#languageZh').click();
 await page.evaluate(async()=>{const w=viewer.sim.environment.weather;await w.nasaRestore;for(const r of w.items.filter(r=>r.kind==='cloud'))await w.cache.remove(r.id);w.settings.cloud='satcorps';w.save();});
 const meta=(await (await page.request.get(base+'/api/cloud/satcorps/status')).json()).result;
 let statuses=0,posts=0;const observer=request=>{if(request.method()==='POST'&&request.url().includes('/api/cloud/satcorps/update'))posts++;};page.on('request',observer);
 await page.route('**/api/cloud/satcorps/status',route=>{statuses++;return route.fulfill({json:{state:statuses<3?'running':'ready',status:'检查公共资源恢复',result:meta}});});
 await page.reload();await page.waitForFunction(()=>!!window.viewer);
 await page.evaluate(()=>viewer.sim.environment.weather.nasaRestore);
 check(statuses>=3&&posts===0,'reload resumes a running NASA job without starting another download');
 await page.unroute('**/api/cloud/satcorps/status');page.off('request',observer);
 check(await page.evaluate(()=>!!viewer.sim.environment.weather.active.cloud&&viewer.sim.environment.weather.cloudRecord.provider==='satcorps'),'empty browser cache restores the shared disk NASA image');
 await page.evaluate(()=>{const s=viewer.sim;window.sharedBefore={env:s.environment,texture:s.environment.weather.cloudTexture,time:s.time,source:s.environment.weather.settings.cloud};});
 const model='/Users/apple/Documents/Codex/Tiangong-Orbit-Simulator/assets/spacecraft/dongfanghong1_v03_meters.glb';
 for(const id of ['test-large','test-tiny']){
  await page.locator('#missionFiles').setInputFiles(['/tmp/'+id+'.json',model,'/tmp/tiangong-package-orbit.json']);
  await page.waitForFunction(id=>!viewer.sim.missions.importing&&viewer.sim.missionId===id,id);
  const state=await page.evaluate(()=>{const s=viewer.sim,w=s.environment.weather,root=s.missions.models.get(s.missionId),top=root.getObjectByName('顶部天线_400mm');root.updateMatrixWorld(true);const p=top.getWorldPosition(s.center.clone());s.seek(s.start+3*86400000);s.update(performance.now());const distance=viewer.camera.position.distanceTo(viewer.controls.target);return {name:document.getElementById('activeMission').textContent,shared:s.environment===sharedBefore.env&&w.cloudTexture===sharedBefore.texture&&w.settings.cloud===sharedBefore.source,head:p.z>0&&Math.hypot(p.x,p.y)<1e-7,distance,min:viewer.controls.minDistance,max:viewer.controls.maxDistance,near:viewer.camera.near,frame:s.current.basis[2].every((v,i)=>Math.abs(v-s.current.velocity[i]/Math.hypot(...s.current.velocity))<1e-9)};});
  check(state.name.includes(id==='test-large'?'大模型检验':'小模型检验'),'imported manifest supplies selector and category: '+id);
  check(state.shared,'import keeps the exact shared environment and NASA texture: '+id);
  check(state.head&&state.frame,'imported GLB antenna points along orbital velocity: '+id);
  check(state.distance>state.min&&state.distance<state.max&&state.near<state.distance/2,'camera fit adapts to imported model size: '+id);
  if(id==='test-large')check(state.distance>500,'large model camera exceeds the previous fixed distance cap');
  else check(state.distance<.01,'tiny model receives a close camera fit');
 }
 await page.reload();await page.waitForFunction(()=>!!window.viewer);await page.evaluate(()=>viewer.sim.environment.weather.nasaRestore);
 check(await page.evaluate(()=>viewer.sim.missionId==='test-tiny'&&viewer.sim.data?.missionId==='test-tiny'&&document.getElementById('missionSelect').options.length===4),'imported model, orbit and active task persist across reload');
 const roundtrip=await page.evaluate(async()=>{const s=viewer.sim,scene=s.sceneShare.capture();await s.sceneShare.importScene(scene);return s.missionId==='test-tiny'&&!!s.data;});check(roundtrip,'tiny imported model supports scene export/import');
 await page.locator('#missionFiles').setInputFiles(['/tmp/test-tiny.json',model,'/tmp/tiangong-package-orbit.json']);
 await page.waitForFunction(()=>!viewer.sim.missions.importing);
 check(await page.locator('#missionImportStatus').innerText().then(x=>x.includes('ID 已存在')),'duplicate IDs report an error and preserve the existing task');
 await page.locator('#missionFiles').setInputFiles(['/tmp/test-invalid.json',model,'/tmp/tiangong-bad-orbit.json']);
 await page.waitForFunction(()=>!viewer.sim.missions.importing);
 check(await page.evaluate(()=>viewer.sim.missionId==='test-tiny'&&document.getElementById('missionSelect').options.length===4),'invalid orbit import rolls back its registration');
 const lock=await page.evaluate(async()=>{const s=viewer.sim,m=s.missions,original=m.load;let release,held=false;m.load=async function(id){if(!held){held=true;await new Promise(r=>release=r);}return original.call(this,id);};const record={format:'tiangong-mission-1',id:'test-lock',name:'Lock',model:{file:'empty.glb',metresPerUnit:1,forwardAxis:'+Y',normalAxis:'-Z'}};const response=await fetch('/assets/spacecraft/dongfanghong1_v03_meters.glb'),blob=await response.blob();const importing=m.importPackage([new File([JSON.stringify(record)],'mission.json'),new File([blob],'empty.glb')]);while(!release)await new Promise(r=>setTimeout(r,0));let rejects=0;for(const fn of [()=>m.switchTo('tiangong'),()=>s.sceneShare.capture(),()=>s.environment.weather.loadPreset()])try{await fn();}catch{rejects++;}release();await importing;m.load=original;return rejects===3;});
 check(lock,'in-progress package import blocks task switches, scene export and presets');
 // Return to a built-in task; keep test evidence but remove isolated fixtures from this profile.
 await page.evaluate(async()=>{const s=viewer.sim;await s.missions.switchTo('dfh1');s.seek(s.start+3*86400000);s.sessionMemory.save();const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tiangong-mission-packages-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');for(const id of ['test-large','test-tiny','test-lock'])tx.objectStore('snapshots').delete(id);tx.oncomplete=resolve;tx.onerror=reject;});db.close();});
 await page.reload();await page.waitForFunction(()=>!!window.viewer);await page.evaluate(()=>viewer.sim.environment.weather.nasaRestore);
 return results;
}
