// Run against a local web build. NOAA fixtures are generated in this isolated browser only.
async page=>{
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 return await page.evaluate(async()=>{
  const v=viewer,s=v.sim,e=s.environment,c=e.auroraCurtains,w=e.weather,r=v.renderer,checks=[];
  const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
  const frame=()=>{s.update(performance.now());s.render();};
  v.music.pause();s.seek(Date.parse('2026-03-20T00:00:00Z'));w.settings.adaptive=false;w.settings.aurora='local';await w.apply('aurora');
  await e.setQuality('standard');frame();
  const legacy=c.legacy.map(m=>({geometry:m.geometry,material:m.material,shader:m.material.fragmentShader}));
  check(!c.volumeMaterial&&c.legacy.length===9&&c.legacy.every(m=>m.visible),'4K retains the original nine shells');
  await e.setQuality('high');frame();check(c.target&&!c.failed&&!c.legacy.some(m=>m.visible),'8K creates volume renderer');
  const updates=c.stats.fluxUpdates,phase=c.fluxMaterial.uniforms.phase.value,rendered=c.stats.volumeRenders;
  for(let i=0;i<10;i++)c.render(s.spaceCamera);
  check(c.stats.fluxUpdates===updates&&c.stats.volumeRenders===rendered,'paused camera reuses footprint and integrated light');
  const rt=r.getRenderTarget(),clear=r.autoClear;c.frameInputs=null;c.render(s.spaceCamera);
  check(r.getRenderTarget()===rt&&r.autoClear===clear,'render target and autoClear restored');
  c.update(s.time,true);c.render(s.spaceCamera);check(c.stats.steps===16,'adaptive mode reduces segment samples');
  c.update(s.time,false);c.render(s.spaceCamera);check(c.stats.steps===24,'normal mode restores segment samples');
  s.seek(s.time+10000);frame();check(c.fluxMaterial.uniforms.phase.value!==phase,'paused seek refreshes footprint');
  s.seek(Date.parse('2026-03-20T00:00:00Z'));frame();check(c.fluxMaterial.uniforms.phase.value===phase,'returning to time restores phase');
  const midnight=s.time,nearMidnight=[];
  for(const offset of [-1,1]){s.seek(midnight+offset);frame();const pixels=new Uint8Array(1024*512*4);r.readRenderTargetPixels(c.fluxTarget,0,0,1024,512,pixels);nearMidnight.push(pixels);}
  let midnightDelta=0;for(let i=0;i<nearMidnight[0].length;i++)midnightDelta=Math.max(midnightDelta,Math.abs(nearMidnight[0][i]-nearMidnight[1][i]));
  check(midnightDelta<=2,'footprint and plume remain continuous across midnight');s.seek(midnight);frame();
  const before=c.stats.fluxUpdates,wall=c.lastFluxWall;s.paused=false;s.speed=1000000;
  for(let i=0;i<10;i++){c.lastWall=performance.now()-16;c.update(s.time+i*16000000,false);c.render(s.spaceCamera);}
  check(c.stats.fluxUpdates-before<=Math.ceil((performance.now()-wall)/250)+1,'fast time does not refresh footprint each frame');s.speed=1;s.seek(Date.parse('2026-03-20T00:00:00Z'));frame();
  const make=zero=>({'Forecast Time':new Date(s.time).toISOString(),'Observation Time':new Date(s.time-60000).toISOString(),coordinates:Array.from({length:360*181},(_,i)=>{const lon=i%360-180,lat=Math.floor(i/360)-90;return [lon,lat,zero?0:Math.round(80*Math.exp(-Math.pow((Math.abs(lat)-50)/3,2)))];})});
  const records=[];
  try{
   for(const zero of [false,true]){
    const record=await w.store('aurora',new Blob([JSON.stringify(make(zero))],{type:'application/json'}),{time:s.time,observed:s.time-60000,resolution:'360×181'});records.push(record.id);
    await w.reload();w.settings.aurora='history';w.settings.auroraHistory=record.id;await w.apply('aurora');frame();
    check(c.source===w.auroraTexture,'NOAA snapshot bound '+zero);
    const pixels=new Uint8Array(1024*512*4);r.readRenderTargetPixels(c.fluxTarget,0,0,1024,512,pixels);
    let max=0;for(let i=0;i<pixels.length;i+=4)max=Math.max(max,pixels[i],pixels[i+1],pixels[i+2]);
    check(zero?max===0:max>0,zero?'zero NOAA produces zero emission':'NOAA 50 degree footprint is retained');
   }
   const scene=s.sceneShare.capture();w.settings.aurora='off';await w.apply('aurora');frame();check(!c.target&&!c.volumeMaterial,'off releases volume resources');
   await s.sceneShare.importScene(scene);frame();check(c.target&&c.source===w.auroraTexture,'scene import restores volume source');
  }finally{for(const id of records)await w.remove(id);}
  w.settings.aurora='local';await w.apply('aurora');frame();
  const hdrFailed=e.hdr.failed;e.hdr.failed=true;frame();check(e.uniforms.linearOutput.value===0&&!c.failed,'direct screen fallback works');e.hdr.failed=hdrFailed;frame();
  const textureCount=r.info.memory.textures;
  for(let i=0;i<3;i++){await e.setQuality('standard');frame();check(!c.target,'quality switch releases targets '+i);await e.setQuality('high');frame();}
  check(e.aurora.children.length===9&&c.legacy.every((m,i)=>m.geometry===legacy[i].geometry&&m.material===legacy[i].material&&m.material.fragmentShader===legacy[i].shader),'4K identity preserved across switches');
  check(r.info.memory.textures<=textureCount+2,'quality round trips do not accumulate textures');
  const ratio=r.getPixelRatio();r.setPixelRatio(2);frame();check(c.stats.width<=960&&c.stats.height<=640,'high DPI volume resolution capped');r.setPixelRatio(ratio);frame();
  check(!r.info.programs.some(p=>p.diagnostics&&!p.diagnostics.runnable)&&r.getContext().getError()===0,'shader compilation and GL checks pass');
  const has=r.extensions.has;c.release();r.extensions.has=name=>name==='EXT_color_buffer_float'?false:has.call(r.extensions,name);frame();check(c.failed&&c.legacy.every(m=>m.visible),'unsupported float buffer restores classic aurora');r.extensions.has=has;
  await e.setQuality('standard');frame();await e.setQuality('high');frame();check(!c.failed&&c.target,'quality change recovers volume rendering');
  return {checks,stats:c.stats,memory:r.info.memory};
 });
}
