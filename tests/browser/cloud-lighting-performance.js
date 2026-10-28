async page=>await page.evaluate(async()=>{
 const s=viewer.sim,e=s.environment,r=viewer.renderer,gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
 if(!ext)return {unsupported:true};
 s.seek(Date.parse('2026-10-28T02:59:27Z'));s.update(performance.now());s.setView('orbit');s.orbitControls.stopMotion();
 s.spaceCamera.position.fromArray(s.current.sun).normalize().multiplyScalar(-25500);s.orbitControls.target.set(0,0,0);s.orbitControls.update();
 e.weather.settings.volume=true;e.weather.settings.motion=false;e.weather.settings.adaptive=false;e.weather.settings.aurora='off';await e.weather.apply('aurora');await e.setQuality('high');
 const render=s.render,buckets={off:[],on:[]};let disjoint=0;s.render=()=>{};
 const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 try{
  for(let round=0;round<12;round++)for(const mode of round%2?['on','off']:['off','on']){
   e.settings.cloudNightVisible=mode==='on';const query=gl.createQuery();
   gl.beginQuery(ext.TIME_ELAPSED_EXT,query);render.call(s);gl.endQuery(ext.TIME_ELAPSED_EXT);gl.flush();
   let waits=0;while(!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){if(++waits>120)throw Error('GPU timing unavailable');await raf();}
   if(gl.getParameter(ext.GPU_DISJOINT_EXT))disjoint++;else if(round>=4)buckets[mode].push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);
   gl.deleteQuery(query);
  }
  const results=Object.entries(buckets).map(([mode,values])=>{values.sort((a,b)=>a-b);return {mode,n:values.length,medianMs:values[Math.floor(values.length/2)],p90Ms:values[Math.floor(values.length*.9)]};});
  return {viewport:[r.domElement.width,r.domElement.height],disjoint,results};
 }finally{s.render=render;e.settings.cloudNightVisible=true;render.call(s);}
})
