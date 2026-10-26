async page=>{
 const checks=[],check=(pass,name,details)=>{checks.push({name,pass:!!pass,details});if(!pass)throw Error(name+': '+JSON.stringify(details));};
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 await page.evaluate(async()=>{viewer.music.audio.pause();await viewer.sim.environment.setQuality('simple');viewer.sim.timeline.settings.autoPause=false;});
 for(const id of ['tiangong','dfh1']){
  await page.evaluate(async id=>{await viewer.sim.missions.switchTo(id);},id);
  for(const direction of [-1,1])for(const paused of [true,false]){
   const r=await page.evaluate(({direction,paused})=>{const s=viewer.sim;s.seek(direction<0?s.start+1000:s.end-1000);s.paused=paused;s.speed=60;s.timeStep=3600000;const initial=s.time;for(let i=0;i<72;i++)s.stepTime(direction);s.update(performance.now());const result={delta:s.time-initial,paused:s.paused,speed:s.speed,ready:s.orbitStatus,position:s.current?.position,points:s.minimap.points.length};s.paused=true;return result;},{direction,paused});
   check(Math.abs(r.delta-direction*72*3600000)<5000&&r.paused===paused&&r.speed===60&&r.ready==='ready'&&r.position.every(Number.isFinite),'72 hourly steps '+id+'/'+direction+'/'+paused,r);
  }
  await page.evaluate(()=>{const s=viewer.sim;s.seek(s.end+365*864e5);s.timeline.reset();s.timeline.update(performance.now(),true);});
  await page.waitForFunction(()=>viewer.sim.timeline.cache.result&&!viewer.sim.timeline.cache.pending);
  check(await page.evaluate(()=>viewer.sim.timeline.cache.result.events.length>0&&viewer.sim.current&&viewer.sim.time>viewer.sim.end),'future year events '+id);
 }
 check(await page.evaluate(()=>{const s=viewer.sim;s.seek(s.start-365*864e5);const old=s.time;s.missions.switchTo('tiangong');return s.time===old;}),'switch keeps date');
 await page.waitForFunction(()=>!viewer.sim.missions.busy);
 check(await page.evaluate(async()=>{const s=viewer.sim;s.seek(s.end+365*864e5);const time=s.time,scene=s.sceneShare.capture();await s.sceneShare.importScene(scene);s.update(performance.now());return s.time===time&&s.current&&s.orbitStatus==='ready';}),'scene restores future date');
 check(await page.evaluate(()=>{const s=viewer.sim;s.realTime();s.timeStep=1000;s.stepTime(1);return s.mode==='custom'&&!s.paused&&s.speed===1;}),'real-time step continues at 1x');
 await page.evaluate(()=>{const s=viewer.sim;s.seek(s.end+30*864e5);s.sessionMemory.save();});
 const saved=await page.evaluate(()=>viewer.sim.time);
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 check(await page.evaluate(saved=>viewer.sim.time===saved&&viewer.sim.paused&&viewer.sim.current&&viewer.sim.orbitStatus==='ready',saved),'restart restores date outside samples');
 await page.evaluate(()=>viewer.music.audio.pause());
 for(const [lang,id] of [['ru','languageRu'],['fr','languageFr'],['en','languageEn'],['zh-CN','languageZh']]){
  const before=await page.evaluate(()=>({time:viewer.sim.time,mission:viewer.sim.missionId,speed:viewer.sim.speed}));
  await page.locator('#'+id).click();
  const r=await page.evaluate(()=>({lang:document.documentElement.lang,time:viewer.sim.time,mission:viewer.sim.missionId,speed:viewer.sim.speed,mode:document.getElementById('gpStatus').textContent}));
  check(r.lang===lang&&r.time===before.time&&r.mission===before.mission&&r.speed===before.speed,'language preserves simulation '+lang,r);
 }
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});
  for(const lang of ['Ru','Fr']){
   await page.locator('#language'+lang).click();
   const boxes=await page.evaluate(()=>{const ids=['languageZh','languageEn','languageRu','languageFr'];return ids.map(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect();return {id,x:r.x,right:r.right,width:r.width};});});
   check(boxes.every(b=>b.x>=0&&b.right<=width),'language controls fit '+lang+'/'+width,boxes);
   check(await page.evaluate(()=>document.querySelector('header').scrollWidth<=innerWidth),'header fits '+lang+'/'+width);
   await page.screenshot({path:`output/playwright/v039-${lang}-${width}.png`});
  }
 }
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);check(await page.evaluate(()=>document.documentElement.lang==='fr'),'French persists');
 await page.evaluate(()=>viewer.music.audio.pause());
 return checks;
}
