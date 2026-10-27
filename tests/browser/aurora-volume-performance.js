async page=>await page.evaluate(async()=>{
 const s=viewer.sim,e=s.environment,c=e.auroraCurtains,r=viewer.renderer,gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
 if(!ext)return {unsupported:true};const render=s.render,update=c.update,results=[];s.render=()=>{};c.update=()=>{};
 const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 try{
  for(const [pose,args] of [['overhead',[65,0,16000]],['horizon',[53,0,6800,66,6510]]]){
   auroraTestPose(...args);const buckets={legacy:[],volume:[],cached:[]};let disjoint=0;
   for(let round=0;round<20;round++)for(const mode of round%2?['volume','legacy','cached']:['legacy','volume','cached']){
    e.aurora.visible=true;c.legacy.forEach(m=>m.visible=mode==='legacy');
    e.beginFrame();r.clear();r.render(e.earth,s.spaceCamera);
    if(mode==='volume')c.frameInputs=null;
    const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);
    if(mode==='legacy')r.render(e.aurora,s.spaceCamera);else c.render(s.spaceCamera);
    gl.endQuery(ext.TIME_ELAPSED_EXT);gl.flush();
    while(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))await raf();
    if(gl.getParameter(ext.GPU_DISJOINT_EXT))disjoint++;else if(round>=5)buckets[mode].push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);e.finishFrame();
   }
   for(const mode of Object.keys(buckets)){const a=buckets[mode].sort((a,b)=>a-b);results.push({pose,mode,n:a.length,disjoint,medianMs:a[Math.floor(a.length/2)],p90Ms:a[Math.floor(a.length*.9)]});}
  }return {viewport:[r.domElement.width,r.domElement.height],stats:c.stats,results};
 }finally{s.render=render;c.update=update;e.aurora.visible=true;update.call(c,s.time,false);}
})
