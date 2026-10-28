// Local, unshipped browser harness. Uses the real app materials and renderer.
const frame=document.querySelector('#app'),status=document.querySelector('#status'),result=document.querySelector('#result');
let app,sim,environment;
async function ready(){
 if(!frame.contentWindow.viewer?.sim?.initialized){setTimeout(ready,100);return;}
 app=frame.contentWindow.viewer;sim=app.sim;environment=sim.environment;app.music.pause();frame.contentDocument.querySelector('#skipTour')?.click();
 const data=await (await fetch('check067-scene.json')).json();sim.setOrbit(data.orbit);sim.seek(data.simulation.time);sim.update(performance.now());sim.setView('orbit');
 sim.flightLab={active:true};await environment.setQuality('high');
 Object.assign(environment.settings,data.environment,{geographyEnabled:false,starChartEnabled:false});Object.assign(environment.weather.settings,{volume:true,motion:false,adaptive:false});
 frame.contentDocument.body.classList.add('photo-mode');sim.api.resize();sim.orbitControls.stopMotion();sim.orbitControls.target.fromArray(data.cameras.overview.target);sim.spaceCamera.position.fromArray(data.cameras.overview.position);sim.orbitControls.update();
 status.textContent='已就绪';requestAnimationFrame(()=>draw());
}
function draw(near){
 const camera=sim.spaceCamera,update=camera.updateProjectionMatrix;
 if(Number.isFinite(near))camera.updateProjectionMatrix=function(){this.near=near;return update.call(this);};
 try{sim.render();}finally{camera.updateProjectionMatrix=update;}
 status.textContent='near '+camera.near.toFixed(2)+' km';result.textContent=JSON.stringify({distance:camera.position.length(),near:camera.near,depthBits:app.renderer.getContext().getParameter(app.renderer.getContext().DEPTH_BITS)});
}
document.querySelector('#old').onclick=()=>draw(10);
document.querySelector('#fixed').onclick=()=>draw();
document.querySelector('#regression').onclick=()=>{
 draw();const adaptiveNear=sim.spaceCamera.near;
 const e=environment,r=app.renderer,u=e.uniforms,old=Object.fromEntries(Object.entries(u).map(([k,v])=>[k,v.value?.clone?v.value.clone():v.value]));
 const scene=new sim.sky.constructor(),camera=sim.spaceCamera.clone(),glow=e.hdr.material.uniforms.sunGlow.value.clone(),textures=[];
 const tex=value=>{const t=e.fallback.clone();t.source=new e.fallback.source.constructor();t.image={data:new Uint8Array([value,value,value,255]),width:1,height:1};t.needsUpdate=true;textures.push(t);return t;};
 const black=tex(0),white=tex(255),earth=e.earth.clone(),cloud=e.volumeClouds.clone();earth.quaternion.identity();cloud.quaternion.identity();earth.visible=cloud.visible=true;scene.add(earth,cloud);
 camera.position.set(0,0,60000);camera.up.set(0,1,0);camera.aspect=r.domElement.width/r.domElement.height;camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 try{
  u.dayMap.value=u.nightMap.value=u.oceanMap.value=black;u.cloudMap.value=white;u.enhanced.value=u.detailed.value=u.linearOutput.value=u.linearComposite.value=1;
  u.cloudTone.value=u.cloudChannel.value=u.cloudMode.value=u.cloudMotion.value=u.cloudMoonLight.value=u.stormCount.value=0;u.cloudAmount.value=.85;u.cloudNightVisible.value=1;
  for(let i=0;i<4;i++){u['nightDetailFade'+i].value=0;u['detailFade'+i].value=0;}
  u.sun.value.set(0,0,1);u.localSun.value.set(0,0,1);u.earthInverse.value.identity();e.hdr.material.uniforms.sunGlow.value.set(0,0,0);
  const read=near=>{camera.near=near;camera.updateProjectionMatrix();e.hdr.begin();r.setClearColor(0,1);r.clear();r.render(scene,camera);e.hdr.finish();
   const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,size=80,pixels=new Uint8Array(size*size*4);gl.readPixels(Math.floor(w/2)-size/2,Math.floor(h/2)-size/2,size,size,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   let sum=0,holes=0,min=255,max=0;for(let i=0;i<pixels.length;i+=4){const x=pixels[i];sum+=x;min=Math.min(min,x);max=Math.max(max,x);if(x<100)holes++;}
   return {near,mean:sum/(size*size),min,max,holes,pixels:size*size};};
  const gl=r.getContext(),before=read(10),after=read(adaptiveNear);
  result.textContent=JSON.stringify({before,after,error:gl.getError()});status.textContent=after.holes===0&&before.holes>0?'回归通过':'检查结果';
 }finally{for(const [key,value]of Object.entries(old))u[key].value=value;for(const t of textures)t.dispose();e.hdr.material.uniforms.sunGlow.value.copy(glow);r.setRenderTarget(null);}
};
document.querySelector('#occlusion').onclick=async()=>{
 try{
  if(!frame.contentWindow.cloudOcclusionTest)await new Promise((resolve,reject)=>{const script=frame.contentDocument.createElement('script');script.src='check067-occlusion.js';script.onload=resolve;script.onerror=reject;frame.contentDocument.head.append(script);});
  const checks=await frame.contentWindow.cloudOcclusionTest({waitForFunction:async()=>{},evaluate:fn=>fn()});
  result.textContent=JSON.stringify({checks});status.textContent='遮挡回归通过';
 }catch(error){result.textContent=String(error.stack||error);status.textContent='遮挡回归失败';}
};
ready();
