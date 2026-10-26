// Run with playwright-cli run-code against the built viewer in an isolated profile.
async page=>{
 const results=[],check=(pass,name,detail={})=>{results.push({name,pass:!!pass,...detail});if(!pass)throw Error(name);};
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const read=()=>page.evaluate(()=>{const s=viewer.sim;return {time:s.time,paused:s.paused,speed:s.speed,mode:s.mode,dragging:s.minimap.dragging,button:document.getElementById('pauseTime').textContent,saved:JSON.parse(localStorage.getItem('tiangong-session-v1'))};});
 const points=()=>page.evaluate(()=>{
  const m=viewer.sim.minimap,r=m.canvas.getBoundingClientRect(),s=viewer.sim;
  const inside=m.points.filter(p=>Math.abs(p[1])<155&&Math.abs(p[2])<70);
  const a=inside.reduce((a,p)=>Math.abs(p[0]-s.time)<Math.abs(a[0]-s.time)?p:a),b=inside.find(p=>p[0]>s.time+300000)||inside.at(-1);
  return [a,b].map(p=>({x:r.x+(p[1]+180)/360*r.width,y:r.y+(90-p[2])/180*r.height,time:p[0]}));
 });
 async function prepare(id,paused,speed,real=false){
  await page.evaluate(async({id,paused,speed,real})=>{
   const s=viewer.sim;viewer.music.audio.pause();await s.missions.switchTo(id);await s.environment.setQuality('simple');s.minimap.setVisible(true);
   s.seek((s.start+s.end)/2);s.paused=paused;s.speed=speed;if(real)s.realTime();s.lastWall=performance.now();s.update(performance.now());s.minimap.lastDraw=s.minimap.lastTrack=-Infinity;s.timeUI();
  },{id,paused,speed,real});await frame();
 }
 async function drag(id,paused,speed,real=false){
  await prepare(id,paused,speed,real);const [a,b]=await points(),before=await read();
  if(real)check(before.mode==='real','real-time case starts in real mode');
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await frame();
  const held=await read();await frame();const still=await read();
  check(held.dragging&&still.time===held.time,'pointer holds the selected time: '+id+'/'+(real?'real':speed)+'/'+paused);
  check(held.paused===paused,'scrubbing preserves playback state: '+id+'/'+speed+'/'+paused);
  await page.mouse.up();const released=await read();await frame();const after=await read();
  const expectedSpeed=real?1:speed;
  check(!released.dragging&&released.paused===paused&&released.speed===expectedSpeed&&released.mode==='custom','release preserves state and speed: '+id+'/'+(real?'real':speed)+'/'+paused);
  check(paused?after.time===released.time:after.time>released.time,'clock continues only when previously running: '+id+'/'+speed+'/'+paused);
  check(Math.abs(released.time-b.time)<5000,'release stays near selected track position',{target:b.time,actual:released.time});
  check(released.saved.paused===paused&&released.saved.speed===expectedSpeed,'saved state matches resumed playback');
 }
 try{
  for(const id of ['dfh1','tiangong']){await drag(id,false,60);await drag(id,true,300);}
  await drag('dfh1',false,1000,true); // Real-time is 1x even with an older custom speed.
  for(const event of ['pointercancel','lostpointercapture']){
   await prepare('dfh1',false,10);const [a,b]=await points();await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);await frame();
   await page.evaluate(event=>{const m=viewer.sim.minimap;if(event==='lostpointercapture')m.canvas.releasePointerCapture(m.pointerId);else m.canvas.dispatchEvent(new PointerEvent(event,{pointerId:m.pointerId,bubbles:true}));},event);
   await page.mouse.up();await frame();const released=await read();await frame();const after=await read();check(!released.dragging&&!released.paused&&after.time>released.time,event+' releases scrubbing and continues playback');
  }
 }catch(e){results.push({pass:false,error:e.stack});}
 finally{await page.mouse.up();await page.evaluate(()=>{const s=viewer.sim;s.paused=true;s.timeUI();s.sessionMemory.save();});}
 return results;
}
