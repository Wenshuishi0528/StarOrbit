// Actual highest-quality viewer, in sunlight with auxiliary lighting disabled.
async page=>{
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 return await page.evaluate(async()=>{
  const v=viewer,s=v.sim,light=s.api.sunLight,shadow=light.shadow,results=[];
  const check=(pass,name,detail={})=>{results.push({name,pass:!!pass,...detail});if(!pass)throw Error(name);};
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const frames=async(n,each=()=>{})=>{for(let i=0;i<n;i++){each(i);await frame();}};
  const original=shadow.updateMatrices,measure=s.tracker.measure;let passes=0,measures=0;
  shadow.updateMatrices=function(...args){passes++;return original.apply(this,args);};
  s.tracker.measure=function(...args){measures++;return measure.apply(this,args);};
  // Compare the spacecraft itself; Earth textures can finish loading between frames.
  const sample=()=>{const r=v.renderer,gl=r.getContext(),p=new Uint8Array(128*128*4);r.autoClear=true;r.render(v.scene,v.camera);gl.readPixels(Math.floor(r.domElement.width/2)-64,Math.floor(r.domElement.height/2)-64,128,128,gl.RGBA,gl.UNSIGNED_BYTE,p);s.render();return p;};
  try{
   v.music.audio.pause();await s.missions.switchTo('tiangong');await s.environment.setQuality('high');
   document.getElementById('fillLight').checked=false;document.getElementById('labels').checked=false;s.auto=true;s.seek(1792673220000);s.update(performance.now());v.controls.stopMotion();v.controls.enabled=false;v.fit(null,[-1,.25,.65]);await frames(3);
   check(s.current.illumination===1&&s.environment.quality==='high'&&s.api.fillLight.intensity===0&&!v.scene.environment,'review uses full sunlight, highest quality and no auxiliary lighting');
   shadow.autoUpdate=true;passes=0;await frames(20);const before=passes,redrawn=sample();
   shadow.autoUpdate=false;s.shadowCache.dirty=true;await frames(2);passes=0;measures=0;
   const pixels=sample(),started=performance.now();await frames(20);const after=passes,comparison=sample();
   check(before>=19&&after===0,'paused scene reuses its shadow map',{frames:20,before,after,elapsedMs:performance.now()-started});
   check(pixels.every((n,i)=>n===comparison[i]),'cached shadow frames retain identical rendered detail');
   check(pixels.every((n,i)=>n===redrawn[i]),'cached spacecraft matches a fully redrawn shadow frame');
   // Cross several old 700 ms solver deadlines without moving simulated time.
   const base=performance.now();for(let i=0;i<5;i++)s.update(base+1000*(i+1));s.lastWall=performance.now();
   check(measures===0,'paused solar tracking skips repeated ray tests',{measurements:measures});
   passes=0;await frames(12,()=>{const offset=v.camera.position.clone().sub(v.controls.target).applyAxisAngle(v.camera.up,.002);v.camera.position.copy(v.controls.target).add(offset);v.controls.update();});
   check(passes===0,'moving only the camera reuses the shadow map',{passes});
   s.auto=false;passes=0;const time=s.time;await frames(30,i=>s.seek(time+i*(1000/60)));
   check(passes>0&&passes<15,'slow solar motion refreshes only after a subpixel change',{frames:30,passes});
   passes=0;v.state.target='TH_WENTIAN';v.changeAngle('left',v.state.angles.TH_WENTIAN.left+5);await frames(2);
   check(passes>0,'solar-array movement invalidates cached shadows',{passes});
   measures=0;s.update(performance.now()+1000);s.lastWall=performance.now();
   check(measures===1,'manual array movement refreshes paused illumination readings',{measurements:measures});
   passes=0;v.state.showXT=!v.state.showXT;v.applyConfig();await frames(2);check(passes>0,'assembly visibility change rebuilds shadow coverage');
   await s.missions.switchTo('dfh1');s.seek(1792813648325);s.missions.state.rotation.enabled=true;s.update(performance.now());await frames(2);
   passes=0;await frames(12,i=>s.seek(1792813648325+(i+1)*16));check(passes>=11,'satellite spin updates shadows each changing frame',{frames:12,passes});
   s.seek(1792816768325);s.update(performance.now());await frames(2);passes=0;await frames(8,i=>s.seek(1792816768325+(i+1)*16));
   check(s.current.illumination===0&&passes===0,'full eclipse skips unlit shadow rendering',{passes});
   s.seek(1792813648325);s.update(performance.now());await frames(2);check(passes>0,'return to sunlight refreshes the shadow map');
   check(v.renderer.getContext().getError()===0&&!v.renderer.info.programs.some(p=>p.diagnostics&&!p.diagnostics.runnable),'cached and dynamic GPU rendering stays valid');
  }catch(error){results.push({pass:false,error:error.stack});}
  finally{shadow.updateMatrices=original;s.tracker.measure=measure;shadow.autoUpdate=false;s.shadowCache.dirty=true;s.lastWall=performance.now();s.paused=true;s.timeUI();}
  return results;
 });
}
