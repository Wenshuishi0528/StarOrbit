// Actual Earth + cloud materials, including final display mapping over city emission.
async page=>{
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 return await page.evaluate(async()=>{
  const s=viewer.sim,e=s.environment,r=viewer.renderer;await e.setQuality('high');s.render();
  const u=e.uniforms,old=Object.fromEntries(Object.entries(u).map(([k,v])=>[k,v.value?.clone?v.value.clone():v.value]));
  const exposure=r.toneMappingExposure,glow=e.hdr.material.uniforms.sunGlow.value.clone(),checks=[];
  const scene=new s.sky.constructor(),camera=s.spaceCamera.clone();camera.position.set(0,0,18000);camera.near=1000;camera.up.set(0,1,0);camera.lookAt(0,0,0);camera.aspect=1;camera.updateProjectionMatrix();
  const textures=[],tex=value=>{const t=e.fallback.clone();t.source=new e.fallback.source.constructor();t.image={data:new Uint8Array([value,value,value,255]),width:1,height:1};t.needsUpdate=true;textures.push(t);return t;};
  const black=tex(0),city=tex(128),brightCity=tex(255),masks=[tex(0),tex(77),tex(255)],earth=e.earth.clone();earth.quaternion.identity();scene.add(earth);
  const check=(pass,name,data)=>{checks.push({name,pass,...data});if(!pass)throw Error(name+' '+JSON.stringify(data));};
  try{
   u.dayMap.value=black;u.nightMap.value=city;u.oceanMap.value=black;u.detailed.value=1;
   for(let i=0;i<4;i++){u['nightDetailFade'+i].value=0;u['detailFade'+i].value=0;}
   u.cloudTone.value=0;u.cloudChannel.value=0;u.cloudMode.value=0;u.cloudMotion.value=0;u.cloudAmount.value=.85;u.cloudMoonLight.value=0;u.stormCount.value=0;u.earthInverse.value.identity();e.hdr.material.uniforms.sunGlow.value.set(0,0,0);
   for(const [name,original,enhanced,hdr] of [['2K',e.clouds,0,0],['4K',e.clouds,0,0],['8K layer HDR',e.clouds,1,1],['8K volume HDR',e.volumeClouds,1,1],['8K layer fallback',e.clouds,1,0],['8K volume fallback',e.volumeClouds,1,0]]){
    const mesh=original.clone();mesh.quaternion.identity();mesh.visible=true;scene.add(mesh);u.enhanced.value=enhanced;u.linearOutput.value=hdr;u.linearComposite.value=hdr;
    const read=(mask,on,amount=.85,day=false)=>{
     u.cloudMap.value=masks[mask];u.cloudNightVisible.value=on?1:0;u.cloudAmount.value=amount;u.sun.value.set(0,0,day?1:-1);u.localSun.value.copy(u.sun.value);
     if(hdr){if(!e.hdr.begin())throw Error('HDR unavailable');}else r.setRenderTarget(null);
     r.setClearColor(0,1);r.clear();r.render(scene,camera);if(hdr)e.hdr.finish();
     const gl=r.getContext(),pixels=new Uint8Array(32*32*4);gl.readPixels(Math.floor(gl.drawingBufferWidth/2)-16,Math.floor(gl.drawingBufferHeight/2)-16,32,32,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
     let sum=0;for(let i=0;i<pixels.length;i+=4)sum+=pixels[i];return sum/(32*32);
    };
    for(const exp of [1.15,2.5]){
     r.toneMappingExposure=exp;
     const clear=read(0,true),thin=read(1,true),thick=read(2,true),off=read(2,false),zero=read(2,true,0);
     check(clear>30&&thick<clear*.15&&thin<clear&&thin>thick,name+' night city extinction at exposure '+exp,{clear,thin,thick,off,zero});
     check(Math.abs(off-clear)<=1&&Math.abs(zero-clear)<=1,name+' off and zero density restore clear city lights '+exp,{clear,off,zero});
     const a=read(2,true,.85,true),b=read(2,false,.85,true);check(a===b,name+' day unchanged '+exp,{on:a,off:b});
    }
    u.nightMap.value=brightCity;r.toneMappingExposure=2.5;const brightThick=read(2,true);check(brightThick<=5,name+' brightest city under thick cloud',{red:brightThick,scale:255});u.nightMap.value=city;
    const marker=s.marker.clone();marker.position.set(0,0,7000);marker.scale.setScalar(6);marker.visible=true;scene.add(marker);
    const frontOn=read(2,true),frontOff=read(2,false);check(Math.abs(frontOn-frontOff)<=1&&frontOn>5,name+' foreground spacecraft survives cloud extinction',{frontOn,frontOff});
    marker.position.z=-7000;const behind=read(2,true);check(behind<=5,name+' Earth hides far-side spacecraft',{behind});scene.remove(marker);
    scene.remove(mesh);
   }
   check(r.getContext().getError()===0,'no WebGL errors',{});
  }finally{for(const [k,value] of Object.entries(old))u[k].value=value;for(const t of textures)t.dispose();r.toneMappingExposure=exposure;e.hdr.material.uniforms.sunGlow.value.copy(glow);r.setRenderTarget(null);s.render();}
  return checks;
 });
}
