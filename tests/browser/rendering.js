// Run with playwright-cli run-code against the built viewer.
async page=>await page.evaluate(async()=>{
 const v=viewer,s=v.sim,env=s.environment,r=v.renderer,$=id=>document.getElementById(id),results=[];
 const check=(pass,name,detail={})=>{results.push({name,pass:!!pass,...detail});if(!pass)throw Error(name);};
 const original=s.sceneShare.capture(),dprDescriptor=Object.getOwnPropertyDescriptor(window,'devicePixelRatio');
 const luminance=()=>{
  const bg=v.scene.background;v.scene.background=null;
  const clear=r.getClearColor(s.api.sunLight.color.clone()),alpha=r.getClearAlpha();
  r.setClearColor(0,1);r.autoClear=true;r.render(v.scene,v.camera);
  const canvas=new OffscreenCanvas(128,128),ctx=canvas.getContext('2d');ctx.drawImage(r.domElement,0,0,128,128);
  const bytes=ctx.getImageData(0,0,128,128).data;let sum=0;for(let i=0;i<bytes.length;i+=4)sum+=bytes[i]+bytes[i+1]+bytes[i+2];
  r.setClearColor(clear,alpha);v.scene.background=bg;s.render();return sum/(128*128*3);
 };
 try{
  await s.missions.switchTo('dfh1');s.missions.state.pose={roll:0,pitch:0,yaw:0};s.missions.state.rotation.enabled=false;s.missions.applyPose();
  const day=(s.start+s.end)/2;let night;
  for(let i=0;i<120;i++){s.seek(day+i*60000);s.update(performance.now());if(s.current.illumination===0){night=s.time;break;}}
  check(!!night,'full eclipse found in DFH-1 orbit');$('fillLight').checked=false;
  v.fit(null,[1,-1,.6]);
  for(const tier of ['simple','medium','standard','high']){
   await env.setQuality(tier);s.seek(night);s.update(performance.now());s.render();
   const dark=luminance();check(dark===0,'eclipse surface is dark with auxiliary light off: '+tier,{luminance:dark});
   check(!v.scene.environment&&s.api.fillLight.intensity===0,'all auxiliary sources disabled: '+tier);
  }
  s.seek(day);s.update(performance.now());s.render();const lit=luminance();check(lit>.02,'sunlight illuminates satellite',{luminance:lit});
  s.seek(night);s.update(performance.now());$('fillLight').checked=true;s.render();const assisted=luminance();check(assisted>.02&&!!v.scene.environment,'auxiliary lighting reveals metallic satellite in eclipse',{luminance:assisted});
  const reflection=v.scene.environment;let privateReflection=false;s.missions.models.get('dfh1').traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])privateReflection||=!!m.envMap;});
  check(!privateReflection,'imported materials have no independent studio light');
  await s.missions.switchTo('tiangong');s.seek((s.start+s.end)/2);s.update(performance.now());s.render();check(v.scene.environment===reflection,'station uses the same auxiliary reflection');
  $('fillLight').checked=false;s.render();check(!v.scene.environment&&s.api.fillLight.intensity===0,'station auxiliary light fully switches off');
  for(const ratio of [1,2,1.5,2]){
   Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:ratio});s.render();
   check(r.getPixelRatio()===ratio&&r.domElement.width===Math.floor(r.domElement.clientWidth*ratio),'screen density change refreshes drawing buffer '+ratio);
   check(env.hdr.target.width===r.domElement.width&&env.hdr.target.height===r.domElement.height,'HDR retains full drawing resolution '+ratio);
  }
  const gl=r.getContext(),supported=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES);
  check(env.hdr.target.samples>0||!supported?.length,'HDR uses supported multisampling',{samples:env.hdr.target.samples});
  check(gl.getContextAttributes().antialias&&gl.getParameter(gl.SAMPLES)>0,'spacecraft output retains MSAA',{samples:gl.getParameter(gl.SAMPLES)});
  check(gl.getError()===gl.NO_ERROR,'no WebGL error');
  check(!r.info.programs.some(p=>p.diagnostics&&!p.diagnostics.runnable),'GPU shaders compile');
  s.setOrbit(null);s.update(performance.now());s.render();check(v.scene.environment===reflection&&s.api.fillLight.intensity===.65,'model-only preview retains display lighting');
  Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:1});s.render();check(r.getPixelRatio()===1,'model-only preview follows screen density changes');
  s.setOrbit(s.bundledOrbits.tiangong);s.seek((s.start+s.end)/2);s.update(performance.now());s.render();check(!v.scene.environment&&s.api.fillLight.intensity===0,'return from preview removes display lighting');
 }catch(e){results.push({pass:false,error:e.stack});}
 finally{if(dprDescriptor)Object.defineProperty(window,'devicePixelRatio',dprDescriptor);else delete window.devicePixelRatio;await s.sceneShare.importScene(original);s.render();}
 return results;
})
