// Run in the full built app in an isolated browser profile. No network required.
(async()=>{
 const results=[],check=(ok,name)=>{results.push({name,pass:!!ok});if(!ok)throw Error(name);};
 const {sim,camera,controls,state,changeAngle,applyConfig}=window.viewer,m=sim.missions,w=sim.environment.weather,$=id=>document.getElementById(id);
 const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const approx=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-4);
 try{
  await m.switchTo('tiangong');sim.seek(sim.bundledOrbits.dfh1.rows[4320][0]);sim.auto=false;
  state.slots.TH_FORWARD='TZ';applyConfig();changeAngle('left',37);sim.update(performance.now());
  const assembly=JSON.stringify(state),stationOrbit=sim.data,stamp=sim.time,stationCamera=camera.position.toArray();
  await m.switchTo('dfh1');await frame();
  check(sim.time===stamp,'switch preserves global simulation time');
  check(sim.data.missionId==='dfh1'&&sim.data!==stationOrbit,'independent satellite orbit selected');
  check(document.querySelector('[data-settings-module=solar]').hidden&&!$('craftAttitude').hidden,'capability-specific controls');
  check([...document.querySelectorAll('.station-tag')].every(el=>getComputedStyle(el).display==='none'),'station labels hidden');
  check(!sim.auto&&sim.current&&sim.current.basis[2].every((v,i)=>Math.abs(v-sim.current.velocity[i]/Math.hypot(...sim.current.velocity))<1e-9),'head axis follows orbital velocity');
  $('craftpitch').value=45;$('craftpitch').oninput();
  const satelliteCamera=camera.position.toArray();
  await m.switchTo('tiangong');
  check(JSON.stringify(state)===assembly,'station assembly and manual angles preserved');
  check(approx(camera.position.toArray(),stationCamera),'station camera restored');
  await m.switchTo('dfh1');
  check(m.state.pose.pitch===45&&approx(camera.position.toArray(),satelliteCamera),'satellite pose and camera restored');
  const satelliteOrbit=sim.data;
  w.useOrbit(null);sim.update(performance.now());await frame();
  check(sim.current===null&&sim.api.modelRoot.visible&&m.models.get('dfh1').visible,'missing orbit keeps spacecraft visible');
  check(!sim.marker.visible&&!sim.orbitLine.visible&&sim.minimap.points.length===0,'missing orbit clears old track and markers');
  check($('altitude').textContent==='—'&&$('illumination').textContent.includes('展示'),'missing orbit clears telemetry');
  const empty=sim.sceneShare.capture();check(empty.orbit===null&&empty.assembly===null,'model-only scene exports');
  await m.switchTo('tiangong');await sim.sceneShare.importScene(empty);check(sim.missionId==='dfh1'&&!sim.data,'model-only scene imports');
  await m.switchTo('tiangong');await m.switchTo('dfh1');check(!sim.data&&w.settings.orbitRecord==='none','explicit model-only orbit survives task switching');
  const shared=structuredClone(empty);shared.orbit=satelliteOrbit;shared.simulation.time=satelliteOrbit.rows[0][0]-3600000;
  await sim.sceneShare.importScene(shared);await frame();
  check(sim.time===shared.simulation.time&&sim.orbitStatus==='out-of-range'&&!$('validOrbitTime').hidden,'out-of-range scene keeps time and offers jump');
  $('validOrbitTime').click();await frame();check(sim.current&&sim.orbitStatus==='ready','explicit jump activates orbit');
  sim.setView('orbit');await frame();check(sim.marker.visible&&sim.orbitLine.visible,'independent orbit overview draws');
  const exported=sim.sceneShare.capture();check(exported.mission.id==='dfh1'&&exported.orbit.propagator==='SGP4','scene retains identity and orbital provenance');
  await m.switchTo('tiangong');await sim.sceneShare.importScene(exported);await frame();check(sim.missionId==='dfh1'&&sim.view==='orbit'&&m.state.pose.pitch===45,'scene round-trip restores satellite pose and view');
  const foreign=structuredClone(exported);foreign.mission.id='tiangong';let rejected=false;try{await sim.sceneShare.importScene(foreign);}catch{rejected=true;}check(rejected&&sim.missionId==='dfh1','foreign scene rejected before mutation');
  // A delayed download belongs to the task captured when it started.
  const record=await w.store('orbit',new Blob([JSON.stringify(stationOrbit)]),{missionId:'tiangong',source:'Browser regression',time:stationOrbit.rows[0][0]});
  w.acceptOrbit(stationOrbit,record.id,'tiangong');check(sim.data.missionId==='dfh1','delayed station update cannot overwrite satellite orbit');
  await m.switchTo('tiangong');check(sim.data.missionId==='tiangong','delayed update restored on correct task');
  const legacy=sim.sceneShare.capture();legacy.format='tiangong-scene-1';delete legacy.mission;delete legacy.orbit.missionId;delete legacy.orbit.center;
  await m.switchTo('dfh1');await sim.sceneShare.importScene(legacy);check(sim.missionId==='tiangong','legacy scene defaults to station');
  await m.switchTo('dfh1');sim.setView('follow');sim.seek(sim.start+2*86400000);sim.environment.moon.look();
  check(!!sim.environment.moon.savedView,'Moon view captured');await m.switchTo('tiangong');check(!sim.environment.moon.savedView,'Moon return state does not cross tasks');
  const first=m.switchTo('dfh1');let busy=false;try{await m.switchTo('tiangong');}catch{busy=true;}await first;check(busy&&sim.missionId==='dfh1','concurrent switches serialized');
  sim.setView('follow');m.state.pose={roll:0,pitch:0,yaw:0};m.applyPose();sim.seek(sim.start+3*86400000);sim.sessionMemory.save();
  check(JSON.parse(localStorage.getItem('tiangong-session-v1')).missionId==='dfh1','selected mission persisted');
  check(JSON.parse(localStorage.getItem('tiangong-orbit-library-v1')).dfh1!==JSON.parse(localStorage.getItem('tiangong-orbit-library-v1')).tiangong,'orbit cache references isolated');
  check(!sim.api.renderer.info.programs.some(p=>p.diagnostics&&!p.diagnostics.runnable),'GPU shaders compile');
 }catch(error){results.push({pass:false,error:error.stack});}
 return results;
})()
