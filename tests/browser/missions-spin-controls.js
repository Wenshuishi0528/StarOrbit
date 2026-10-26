async(page)=>{
 const results=[],check=(ok,name)=>{results.push({name,pass:!!ok});if(!ok)throw Error(name);};
 await page.goto('http://127.0.0.1:8878/天宫空间站交互预览.html');await page.waitForFunction(()=>!!window.viewer);
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(async()=>{const s=viewer.sim;await s.missions.switchTo('dfh1');s.missions.state.pose={roll:0,pitch:0,yaw:0};s.missions.state.rotation={mode:'prograde',enabled:true,phase:0,epoch:s.start+3*86400000};s.seek(s.start+3*86400000);s.update(performance.now());s.missions.syncUI();});
 const spin=await page.evaluate(()=>{
  const s=viewer.sim,m=s.missions,root=m.models.get('dfh1'),time=s.time,camera=viewer.camera.quaternion.clone();
  const q0=root.quaternion.clone();s.seek(time+125);s.update(performance.now());const quarter=q0.angleTo(root.quaternion);
  s.seek(time+500);s.update(performance.now());const full=q0.angleTo(root.quaternion);
  s.seek(time+125);s.update(performance.now());document.getElementById('craftSpin').click();const stopped=root.quaternion.clone();s.seek(time+623);s.update(performance.now());const frozen=stopped.angleTo(root.quaternion);
  document.getElementById('craftSpin').click();const resume=stopped.angleTo(root.quaternion);s.seek(time+748);s.update(performance.now());const advanced=stopped.angleTo(root.quaternion);
  return {quarter,full,frozen,resume,advanced,cameraDelta:camera.angleTo(viewer.camera.quaternion)};
 });
 check(Math.abs(spin.quarter-Math.PI/2)<1e-6&&spin.full<1e-6,'120 rpm gives quarter turn in 0.125 s and full turn in 0.5 s');
 check(spin.frozen<1e-6&&spin.resume<1e-6&&Math.abs(spin.advanced-Math.PI/2)<1e-6,'spin toggle freezes and resumes without a phase jump');
 check(spin.cameraDelta<1e-6,'camera does not rotate with satellite spin');
 const pause=await page.evaluate(async()=>{const s=viewer.sim,q=s.missions.models.get('dfh1').quaternion.clone();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return q.angleTo(s.missions.models.get('dfh1').quaternion);});check(pause<1e-6,'paused simulation freezes spin');
 const axes=await page.evaluate(()=>{const s=viewer.sim,m=s.missions,epoch=s.time,before=s.current.basis[2];document.getElementById('craftAttitudeMode').value='inertial';document.getElementById('craftAttitudeMode').onchange();const fixed=JSON.stringify(s.current.basis);s.seek(epoch+600000);s.update(performance.now());const same=fixed===JSON.stringify(s.current.basis);document.getElementById('craftAttitudeMode').value='prograde';document.getElementById('craftAttitudeMode').onchange();return {same,forward:s.current.basis[2].every((v,i)=>Math.abs(v-s.current.velocity[i]/Math.hypot(...s.current.velocity))<1e-10)};});
 check(axes.same&&axes.forward,'inertial axis stays fixed; prograde axis follows changing orbital velocity');
 const before=await page.evaluate(()=>{const s=viewer.sim;s.sessionMemory.save();return {rotation:s.missions.state.rotation,quaternion:s.missions.models.get('dfh1').quaternion.toArray()};});
 await page.reload();await page.waitForFunction(()=>!!window.viewer);
 check(await page.evaluate(before=>JSON.stringify(viewer.sim.missions.state.rotation)===JSON.stringify(before.rotation)&&viewer.sim.missions.models.get('dfh1').quaternion.toArray().every((v,i)=>Math.abs(v-before.quaternion[i])<1e-8),before),'spin settings and phase survive reload');
 const sharing=await page.evaluate(async()=>{const s=viewer.sim,scene=s.sceneShare.capture(),before=JSON.stringify(scene.mission.rotation);await s.missions.switchTo('tiangong');await s.sceneShare.importScene(scene);return before===JSON.stringify(s.missions.state.rotation);});check(sharing,'scene restores spin and axis mode');
 async function drag(name){
  const sample=()=>page.evaluate(()=>{const v=viewer.camera.position.clone().sub(viewer.controls.target);return {direction:v.clone().normalize().toArray(),up:viewer.camera.up.toArray(),radius:v.length(),target:viewer.controls.target.toArray()};});
  await page.evaluate(()=>{viewer.controls.enableDamping=false;viewer.controls.update();document.getElementById('telemetry').hidden=true;viewer.sim.minimap.setVisible(false);});
  const box=await page.locator('#stage > canvas').boundingBox(),x=box.x+box.width*.55,y=box.y+box.height*.5,before=await sample();
  await page.mouse.move(x,y);await page.mouse.down({button:'left'});await page.mouse.move(x+90,y,{steps:8});await page.mouse.up({button:'left'});const after=await sample();
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  check(Math.abs(dot(before.direction,before.up)-dot(after.direction,after.up))<1e-6&&Math.abs(before.radius-after.radius)<1e-5&&before.target.every((v,i)=>Math.abs(v-after.target[i])<1e-6)&&dot(before.direction,after.direction)<.999,name);
 }
 await drag('satellite left drag rotates around model with stable height, distance and target');
 await page.evaluate(()=>document.querySelector('[data-view="horizon"]').click());await drag('horizon left drag respects updated camera up');
 const preset=await page.evaluate(async()=>{const s=viewer.sim,w=s.environment.weather,c=viewer.camera;document.querySelector('[data-view=horizon]').click();c.fov=44;c.zoom=1.3;c.updateProjectionMatrix();const before={up:c.up.toArray(),fov:c.fov,zoom:c.zoom};w.savePreset();document.getElementById('environmentPresets').value=String(w.presets().length-1);document.querySelector('[data-view=iso]').click();c.fov=38;c.zoom=1;c.updateProjectionMatrix();await w.loadPreset();return {before,after:{up:c.up.toArray(),fov:c.fov,zoom:c.zoom}};});
 check(preset.before.up.every((v,i)=>Math.abs(v-preset.after.up[i])<1e-9)&&preset.before.fov===preset.after.fov&&preset.before.zoom===preset.after.zoom,'preset restores camera up, field of view and zoom');
 await drag('left drag uses restored preset camera frame');
 await page.evaluate(()=>viewer.sim.missions.switchTo('tiangong'));await drag('station left drag retains original behavior');
 await page.evaluate(()=>viewer.sim.missions.switchTo('dfh1'));await drag('satellite left drag remains correct after mission return');
 await page.evaluate(()=>{viewer.controls.enableDamping=true;viewer.sim.sessionMemory.save();});
 return results;
}
