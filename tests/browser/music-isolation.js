async page=>{
 await page.addInitScript(()=>{
  localStorage.setItem('tiangong-missions-v1',JSON.stringify({active:'dfh1',states:{}}));
  localStorage.setItem('tiangong-help-v1','seen');
  localStorage.setItem('tiangong-music-settings-v1',JSON.stringify({autoplay:true,volume:.25,muted:true}));
  window.musicPlayRequests=[];
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){window.musicPlayRequests.push(this.getAttribute('src'));return play.call(this);};
 });
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized&&viewer.music.loaded);
 const checks=[];
 const verify=async(name,fn)=>{if(!await page.evaluate(fn))throw Error(name);checks.push(name);};
 await verify('startup restores DFH-1 before any other music starts',()=>viewer.sim.missionId==='dfh1'&&musicPlayRequests.length>0&&musicPlayRequests.every(x=>x?.includes('dfh1-broadcast')));
 await page.evaluate(()=>viewer.music.play());
 await page.waitForFunction(()=>!viewer.music.audio.paused&&Number.isFinite(viewer.music.audio.duration));
 for(let n=0;n<2;n++){
  await page.evaluate(()=>{viewer.music.audio.currentTime=viewer.music.audio.duration-.15;});
  await page.waitForFunction(()=>!!viewer.music.loopTimer);
  await verify('repeat gap remains silent '+n,()=>viewer.music.audio.paused&&viewer.music.current==='mission-dfh1-broadcast');
  await page.waitForTimeout(5100);await page.waitForFunction(()=>!viewer.music.loopTimer&&!viewer.music.audio.paused);
  await verify('exclusive repeat keeps the recording '+n,()=>musicPlayRequests.every(x=>x?.includes('dfh1-broadcast'))&&viewer.music.audio.currentTime<3);
 }
 await page.evaluate(()=>{viewer.music.audio.currentTime=viewer.music.audio.duration-.15;});await page.waitForFunction(()=>!!viewer.music.loopTimer);
 await page.evaluate(()=>viewer.music.pause());const pausedCount=await page.evaluate(()=>musicPlayRequests.length);await page.waitForTimeout(5100);
 if(await page.evaluate(()=>musicPlayRequests.length)!==pausedCount)throw Error('paused timer restarted audio');checks.push('pause cancels scheduled repeat');
 await page.evaluate(async()=>{window.initialMedia=viewer.music.audio;await viewer.sim.missions.switchTo('tiangong');await viewer.music.play();});
 await page.waitForFunction(()=>viewer.music.audio.duration>0&&!viewer.music.audio.paused);
 const first=await page.evaluate(()=>viewer.music.current);
 await page.evaluate(()=>{viewer.music.audio.currentTime=viewer.music.audio.duration-.15;});await page.waitForFunction(id=>viewer.music.current!==id,first);
 await verify('normal playlist advances using the same authorized media element',()=>viewer.music.audio===initialMedia&&!viewer.music.broadcast);
 await page.evaluate(async()=>{await viewer.sim.missions.switchTo('dfh1');window.exclusiveStart=musicPlayRequests.length;await viewer.music.play();viewer.music.select(viewer.music.state.order[0],true);viewer.music.audio.dispatchEvent(new Event('ended'));});
 await verify('DFH-1 blocks playlist selection and ignores an obsolete end event',()=>viewer.music.current==='mission-dfh1-broadcast'&&!viewer.music.loopTimer&&musicPlayRequests.slice(exclusiveStart).every(x=>x.includes('dfh1-broadcast')));
 await page.evaluate(()=>viewer.music.pause());
 return {checks,requests:await page.evaluate(()=>musicPlayRequests)};
}
