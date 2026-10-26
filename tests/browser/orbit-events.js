async page=>{
 const results=[],check=(value,name,detail={})=>{results.push({name,pass:!!value,...detail});if(!value)throw Error(name);};
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const ready=()=>page.waitForFunction(()=>{const l=viewer.sim.timeline;return l.cache.result&&!l.cache.pending&&l.cache.data===viewer.sim.data&&l.range&&l.cache.result.start<=l.range.start&&l.cache.result.end>=l.range.end;});
 async function prepare(id,paused=true,speed=60){
  await page.evaluate(async({id,paused,speed})=>{const s=viewer.sim;viewer.music.audio.pause();await s.missions.switchTo(id);await s.environment.setQuality('simple');s.seek((s.start+s.end)/2);s.paused=paused;s.speed=speed;const l=s.timeline;Object.assign(l.settings,{visible:true,expanded:true,hours:3,shadow:true,apsis:true,node:true,autoPause:false});l.range=null;l.render();l.update(performance.now(),true);s.lastWall=performance.now();s.timeUI();},{id,paused,speed});await ready();
 }
 try{
  await prepare('tiangong');
  check(await page.locator('.event-marker').count()>0,'markers rendered for station');
  const before=await page.evaluate(()=>({builds:viewer.sim.timeline.cache.builds,time:viewer.sim.time}));await frame();await frame();
  check(await page.evaluate(b=>viewer.sim.timeline.cache.builds===b.builds&&viewer.sim.time===b.time,before),'paused frames reuse event cache');
  for(const id of ['tiangong','dfh1'])for(const paused of [false,true]){
   await prepare(id,paused,300);const rect=await page.locator('#eventRail').boundingBox(),x=rect.x+rect.width*.61,y=rect.y+rect.height-2;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+rect.width*.05,y,{steps:3});await frame();
   const held=await page.evaluate(()=>({time:viewer.sim.time,paused:viewer.sim.paused,range:viewer.sim.timeline.range.start,dragging:viewer.sim.timeline.dragging}));await frame();
   check(await page.evaluate(h=>viewer.sim.time===h.time&&viewer.sim.timeline.range.start===h.range&&viewer.sim.timeline.dragging,held),'held pointer freezes time/window '+id+'/'+paused);
   await page.mouse.up();const released=await page.evaluate(()=>({time:viewer.sim.time,paused:viewer.sim.paused,speed:viewer.sim.speed,dragging:viewer.sim.timeline.dragging}));await frame();
   check(released.paused===paused&&released.speed===300&&!released.dragging,'release preserves state '+id+'/'+paused);
   check(await page.evaluate(({released,paused})=>paused?viewer.sim.time===released.time:viewer.sim.time>released.time,{released,paused}),'playback resumes correctly '+id+'/'+paused);
  }
  await prepare('dfh1');
  await page.evaluate(()=>{const s=viewer.sim;s.realTime();s.speed=1000;});await ready();
  {const box=await page.locator('#eventRail').boundingBox();await page.mouse.click(box.x+box.width*.5,box.y+box.height-2);}
  check(await page.evaluate(()=>viewer.sim.mode==='custom'&&!viewer.sim.paused&&viewer.sim.speed===1),'real-time scrub continues at 1x');
  for(const type of ['pointercancel','lostpointercapture']){
   await prepare('dfh1',false,10);const box=await page.locator('#eventRail').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height-2);await page.mouse.down();
   await page.evaluate(type=>{const l=viewer.sim.timeline,el=document.getElementById('eventRail');if(type==='pointercancel')el.dispatchEvent(new PointerEvent(type,{pointerId:l.pointerId,bubbles:true}));else el.releasePointerCapture(l.pointerId);},type);await page.mouse.up();await frame();
   check(await page.evaluate(()=>!viewer.sim.timeline.dragging&&!viewer.sim.paused&&viewer.sim.speed===10),type+' ends drag and preserves playback');
  }
  await prepare('dfh1',true,60);await page.locator('.event-marker').first().click();
  check(await page.evaluate(()=>viewer.sim.time===viewer.sim.timeline.selected.time&&viewer.sim.paused&&viewer.sim.speed===60),'event click locates time while preserving pause/speed');
  check(await page.locator('#orbitEventDetail').isVisible(),'event details open');
  const selected=await page.evaluate(()=>viewer.sim.timeline.selected.time);await page.locator('#watchOrbitEvent').click();
  check(await page.evaluate(time=>!viewer.sim.paused&&viewer.sim.speed===1&&Math.abs(viewer.sim.time-(time-30000))<2000,selected),'watch starts 30 seconds before at 1x');
  await prepare('dfh1');
  for(const speed of [1,1000]){
   const outcome=await page.evaluate(speed=>{const s=viewer.sim,l=s.timeline,e=l.next();s.time=e.time-(speed===1?10:10000);s.paused=false;s.speed=speed;l.settings.autoPause=true;s.lastWall=performance.now();s.update(s.lastWall+(speed===1?20:100));const r={time:s.time,target:e.time,paused:s.paused};l.settings.autoPause=false;s.paused=true;return r;},speed);
   check(outcome.paused&&outcome.time===outcome.target,'auto-pause catches first crossed event at '+speed+'x',outcome);
  }
  check(await page.evaluate(()=>{const s=viewer.sim,l=s.timeline,e=l.next();s.time=e.time-10;s.mode='real';s.speed=1000;l.settings.autoPause=true;const time=l.limitAdvance(s.time,e.time+10);const pass=time===e.time&&s.speed===1&&s.paused&&s.mode==='custom';s.time=time;l.settings.autoPause=false;return pass;}),'real-time automatic pause normalizes speed');
  await page.evaluate(()=>{const l=viewer.sim.timeline;l.settings.shadow=false;l.settings.apsis=false;l.settings.node=true;l.render();});
  check(await page.evaluate(()=>viewer.sim.timeline.events.every(e=>['ascending','descending'].includes(e.type))),'filters select navigation and pause events');
  await page.locator('#nextOrbitEvent').click();check(await page.evaluate(()=>['ascending','descending'].includes(viewer.sim.timeline.selected.type)),'next event follows filters');
  await page.locator('#toggleEventTimeline').click();check(!(await page.locator('#eventRail').isVisible())&&(await page.locator('#eventTimeline').boundingBox()).height<50,'collapse leaves compact summary');
  await page.locator('#toggleEventTimeline').click();
  await page.evaluate(()=>{const d=document.querySelector('[data-memory-key="orbit-events"]');d.open=true;});
  await page.locator('#eventRange').selectOption('24');await ready();check(await page.evaluate(()=>viewer.sim.timeline.range.end-viewer.sim.timeline.range.start===86400000),'24h window computes');
  await page.locator('#showEventTimeline').uncheck();check(!(await page.locator('#eventTimeline').isVisible()),'shared visibility switch');await page.locator('#showEventTimeline').check();
  check(await page.evaluate(()=>JSON.parse(localStorage.getItem('tiangong-timeline-v1')).hours===24),'preferences saved without event arrays');
  await page.evaluate(()=>{const s=viewer.sim;window.savedTimelineOrbit=s.data;s.timeline.cache.request(s.data,s.start,s.start+86400000);s.setOrbit(null);s.timeline.update(performance.now(),true);});await frame();
  check(await page.evaluate(()=>!viewer.sim.timeline.cache.result&&!viewer.sim.timeline.range&&!document.querySelector('.event-marker')),'orbit removal cancels pending results and clears UI');
  await page.evaluate(()=>{const s=viewer.sim;s.setOrbit(window.savedTimelineOrbit);delete window.savedTimelineOrbit;});await prepare('tiangong');
  check(await page.evaluate(()=>viewer.sim.timeline.cache.data===viewer.sim.data),'mission switch uses the current orbit');
  await page.locator('#languageEn').click();check(await page.locator('#toggleEventTimeline').textContent()==='Collapse timeline','English labels');await page.locator('#languageZh').click();
  await page.evaluate(()=>document.body.classList.add('photo-mode'));check(await page.locator('#eventTimeline').evaluate(el=>getComputedStyle(el).visibility)==='hidden','photo mode hides timeline');await page.evaluate(()=>document.body.classList.remove('photo-mode'));
  await page.evaluate(()=>{const s=viewer.sim;s.timeline.settings.autoPause=true;s.timeline.cache.reset();const before=s.time;s.paused=false;s.speed=1000;s.update(s.lastWall+1000);window.pendingAdvance={pass:s.time===before&&!s.paused};});
  check(await page.evaluate(()=>window.pendingAdvance.pass),'auto-pause holds at uncomputed coverage boundary');await ready();
  await prepare('tiangong');
 }catch(error){results.push({pass:false,error:error.stack});}
 finally{await page.mouse.up();await page.evaluate(()=>{viewer.sim.paused=true;viewer.sim.timeline.settings.autoPause=false;viewer.sim.timeUI();viewer.sim.sessionMemory.save();});}
 return results;
}
