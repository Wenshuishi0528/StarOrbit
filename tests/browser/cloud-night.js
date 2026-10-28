// Run with playwright-cli run-code against the built viewer.
async page=>{
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 await page.evaluate(()=>{const old=JSON.parse(localStorage.getItem('tiangong-environment-v1')||'{}');delete old.cloudNightVisible;localStorage.setItem('tiangong-environment-v1',JSON.stringify(old));});
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 const result=await page.evaluate(async()=>{
  const s=viewer.sim,e=s.environment,w=e.weather,r=viewer.renderer,$=id=>document.getElementById(id),checks=[];
  const check=(ok,name,data={})=>{checks.push({name,pass:!!ok,...data});if(!ok)throw Error(name+' '+JSON.stringify(data));};
  const toggle=value=>{const input=$('cloudNightVisible');input.checked=value;input.dispatchEvent(new Event('change',{bubbles:true}));};
  check(e.settings.cloudNightVisible===false&&!$('cloudNightVisible').checked,'new profile defaults off');
  toggle(true);check(JSON.parse(localStorage.getItem('tiangong-environment-v1')).cloudNightVisible===true,'checkbox saves preference');
  const saved=s.sceneShare.capture();check(saved.environment.cloudNightVisible,'scene capture includes option');
  toggle(false);await s.sceneShare.importScene(saved);check(e.settings.cloudNightVisible&&$('cloudNightVisible').checked,'scene import restores checkbox');
  const legacy=structuredClone(saved);delete legacy.environment.cloudNightVisible;await s.sceneShare.importScene(legacy);check(!e.settings.cloudNightVisible&&!$('cloudNightVisible').checked,'old scene resets option off');
  toggle(true);$('environmentPresetName').value='Night cloud test';w.savePreset();$('environmentPresets').value=String(w.presets().length-1);
  toggle(false);await w.restorePreset();check(e.settings.cloudNightVisible&&$('cloudNightVisible').checked,'preset restores option');
  const presets=w.presets();delete presets.at(-1).environment.cloudNightVisible;localStorage.setItem('tiangong-environment-presets-v1',JSON.stringify(presets));await w.restorePreset();check(!e.settings.cloudNightVisible&&!$('cloudNightVisible').checked,'old preset resets option off');
  await e.setQuality('simple');check($('cloudNightVisible').disabled,'simple quality disables unavailable cloud setting');
  await e.setQuality('standard');check(!$('cloudNightVisible').disabled,'detailed quality enables setting');toggle(true);
  for(const view of ['follow','orbit']){s.setView(view);s.render();check(e.uniforms.cloudNightVisible.value===1&&e.clouds.visible,'shared cloud option in '+view);}
  e.settings.clouds=false;s.render();check(!e.clouds.visible&&!e.volumeClouds.visible&&e.uniforms.cloudAmount.value===0,'master cloud visibility remains authoritative');e.settings.clouds=true;
  w.settings.cloud='off';await w.apply('cloud');s.render();check(e.uniforms.cloudAmount.value===0,'cloud source off remains authoritative');w.settings.cloud='builtin';await w.apply('cloud');
  await e.setQuality('high');s.render();check(e.quality==='high','8K assets loaded');
  // Isolate the actual production materials, with fixed geometry/cloud mask.
  // Read floating-point WebGL pixels so weak moonlight is not rounded away at 8 bits.
  // 1015 is THREE.FloatType; the viewer already requires EXT_color_buffer_float for HDR.
  const u=e.uniforms,values=Object.fromEntries(Object.entries(u).map(([k,v])=>[k,v.value?.clone?v.value.clone():v.value]));
  const scene=new s.sky.constructor(),camera=s.spaceCamera.clone();camera.position.set(0,0,18000);camera.up.set(0,1,0);camera.lookAt(0,0,0);camera.aspect=1;camera.updateProjectionMatrix();
  const target=new e.hdr.target.constructor(64,64,{type:1015}),oldTarget=r.getRenderTarget(),oldColor=r.getClearColor({copy:c=>c.clone()}),oldAlpha=r.getClearAlpha();
  const mask=e.fallback.clone();mask.image={data:new Uint8Array([230,230,230,255]),width:1,height:1};mask.needsUpdate=true;
  const pixels=new Float32Array(64*64*4),read=(mesh,night,enabled,moonZ=384400,irradiance=4e-6)=>{
   u.sun.value.set(0,0,night?-1:1);u.localSun.value.copy(u.sun.value);u.cloudNightVisible.value=enabled?1:0;if(Array.isArray(moonZ))u.cloudMoonPosition.value.fromArray(moonZ);else u.cloudMoonPosition.value.set(0,0,moonZ);u.cloudMoonLight.value=irradiance;
   scene.clear();scene.add(mesh);r.setRenderTarget(target);r.setClearColor(0,1);r.clear();r.render(scene,camera);r.readRenderTargetPixels(target,0,0,64,64,pixels);
   const image=pixels.slice();let total=0;for(let i=0;i<image.length;i+=4)total+=image[i]+image[i+1]+image[i+2];return {image,mean:total*255/(64*64*3)};
  };
  try{
   u.cloudMap.value=mask;u.cloudTone.value=0;u.cloudChannel.value=0;u.cloudMode.value=0;u.cloudAmount.value=.85;u.cloudMotion.value=0;u.stormCount.value=0;u.earthInverse.value.identity();u.linearOutput.value=0;
   for(const [kind,original,enhanced,composite,linear] of [['medium',e.clouds,0,0,0],['standard',e.clouds,0,0,0],['layer8K-HDR',e.clouds,1,1,1],['volume8K-HDR',e.volumeClouds,1,1,1],['layer8K-fallback',e.clouds,1,0,0],['volume8K-fallback',e.volumeClouds,1,0,0]]){
    const mesh=original.clone();mesh.quaternion.identity();mesh.visible=true;u.enhanced.value=enhanced;u.linearComposite.value=composite;u.linearOutput.value=linear;
    const day=read(mesh,false,true),night=read(mesh,true,true),naturalDay=read(mesh,false,false),naturalNight=read(mesh,true,false);
    const darkMoon=read(mesh,true,true,384400,0),below=read(mesh,true,true,-384400);
    const difference=(a,b)=>{let max=0;for(let i=0;i<a.image.length;i++)max=Math.max(max,Math.abs(a.image[i]-b.image[i]));return max;};
    // Verify final display bytes after the real ACES/sRGB path, at maximum UI exposure.
    const exposure=r.toneMappingExposure,glow=e.hdr.material.uniforms.sunGlow.value.clone();
    try{
     r.toneMappingExposure=2.5;e.hdr.material.uniforms.sunGlow.value.set(0,0,0);
     u.sun.value.set(0,0,-1);u.localSun.value.copy(u.sun.value);u.cloudMoonPosition.value.set(0,0,384400);u.cloudMoonLight.value=4e-6;u.cloudNightVisible.value=1;
     if(linear){if(!e.hdr.begin())throw Error('HDR unavailable');}else r.setRenderTarget(null);
     r.setClearColor(0,1);r.clear();r.render(scene,camera);if(linear)e.hdr.finish();
     const gl=r.getContext(),display=new Uint8Array(64*64*4);
     gl.readPixels(Math.floor(gl.drawingBufferWidth/2)-32,Math.floor(gl.drawingBufferHeight/2)-32,64,64,gl.RGBA,gl.UNSIGNED_BYTE,display);
     let peak=0;for(let i=0;i<display.length;i+=4)peak=Math.max(peak,display[i],display[i+1],display[i+2]);
     check(peak<=2,kind+' final night pixels near black at maximum exposure',{peak,scale:255});
    }finally{r.toneMappingExposure=exposure;e.hdr.material.uniforms.sunGlow.value.copy(glow);}
    check(day.mean>10&&difference(day,naturalDay)===0,kind+' day pixels unchanged by option',{day:day.mean,maxDelta:difference(day,naturalDay)});
    check(night.mean<.1&&night.mean>=naturalNight.mean,kind+' night remains dark',{day:day.mean,night:night.mean,off: naturalNight.mean});
    check(night.mean>darkMoon.mean,kind+' moonlight adds weak illumination',{moonlit:night.mean,unlit:darkMoon.mean});
    check(difference(darkMoon,naturalNight)===0&&difference(below,naturalNight)===0,kind+' no new light without a visible illuminated Moon');
    const center=image=>{const i=(32*64+32)*4;return (image[i]+image[i+1]+image[i+2])/3;};
    const horizon=[86,88,90,92,94,96].map(degrees=>{const a=degrees*Math.PI/180;return center(read(mesh,true,true,[384400*Math.sin(a),0,384400*Math.cos(a)]).image);});
    check(horizon.every((v,i)=>Number.isFinite(v)&&(!i||v<=horizon[i-1]+1e-6))&&Math.abs(horizon.at(-1)-center(naturalNight.image))<1e-6,kind+' Moon sets continuously behind Earth',{horizon});
   }
   check(r.getContext().getError()===0,'no WebGL errors');
  }finally{for(const [k,value] of Object.entries(values))u[k].value=value;mask.dispose();target.dispose();r.setRenderTarget(oldTarget);r.setClearColor(oldColor,oldAlpha);s.render();}
  toggle(true);s.seek(Date.parse('2026-10-28T02:40:40Z'));s.update(performance.now());s.render();
  const moonBefore=e.uniforms.cloudMoonLight.value,position=e.uniforms.cloudMoonPosition.value.toArray();
  e.settings.moon=false;s.render();check(e.uniforms.cloudMoonLight.value===moonBefore&&e.uniforms.cloudMoonPosition.value.toArray().every((x,i)=>x===position[i]),'hidden Moon does not change cloud lighting');
  s.spaceCamera.position.multiplyScalar(1.01);s.render();check(e.uniforms.cloudMoonLight.value===moonBefore,'camera does not change lunar illumination');e.settings.moon=true;
  e.save();return checks;
 });
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 const persisted=await page.evaluate(()=>viewer.sim.environment.settings.cloudNightVisible&&document.getElementById('cloudNightVisible').checked);
 if(!persisted)throw Error('reload persistence');result.push({name:'reload persistence',pass:true});
 return result;
}
