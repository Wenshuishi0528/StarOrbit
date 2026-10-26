async page=>{
 const results=[],check=(pass,name)=>{results.push({pass:!!pass,name});if(!pass)throw Error(name);};
 try{
  await page.waitForFunction(()=>window.viewer?.sim.initialized);await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{document.querySelector('[data-memory-key="orbit-events"]').open=true;});
  await page.locator('#eventRange').selectOption('12');await page.locator('#eventApsis').uncheck();await page.locator('#eventAutoPause').check();
  await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized&&viewer.sim.timeline.cache.result);
  check(await page.evaluate(()=>{const l=viewer.sim.timeline;return l.settings.hours===12&&!l.settings.apsis&&l.settings.autoPause&&document.getElementById('eventRange').value==='12'&&document.getElementById('eventAutoPause').checked;}),'preferences restore after reload');
  await page.locator('#eventAutoPause').uncheck();await page.locator('#eventApsis').check();await page.locator('#eventRange').selectOption('3');
  await page.evaluate(async()=>{const s=viewer.sim;viewer.music.audio.pause();await s.missions.switchTo('tiangong');s.seek((s.start+s.end)/2);s.timeline.update(performance.now(),true);});
  await page.waitForFunction(()=>viewer.sim.timeline.cache.result&&!viewer.sim.timeline.cache.pending);
  await page.evaluate(async()=>{const s=viewer.sim;const e=s.timeline.cache.result.events.find(e=>e.type==='penumbra-exit'&&e.time>s.time);s.seek(e.time+90000);await s.environment.setQuality('high');document.getElementById('fillLight').checked=false;s.timeline.settings.expanded=true;s.timeline.render();s.timeline.update(performance.now(),true);document.getElementById('eventRange').scrollIntoView({block:'center'});});
  await page.waitForFunction(()=>viewer.sim.current?.illumination>.999&&!viewer.sim.timeline.cache.pending);
  check(await page.evaluate(()=>{const a=document.querySelector('.caption').getBoundingClientRect(),b=document.getElementById('eventTimeline').getBoundingClientRect(),m=document.getElementById('musicWidget').getBoundingClientRect();return a.bottom<=b.top-5&&b.left>=m.right+10&&b.height<=86;}),'desktop caption/music clearance and compact height');
  await page.screenshot({path:'output/playwright/v037-timeline.png'});
  await page.locator('#nextOrbitEvent').click();check(await page.locator('#orbitEventDetail').isVisible(),'details visible from navigation');
  await page.screenshot({path:'output/playwright/v037-event-detail.png'});
  await page.locator('#closeOrbitEvent').click();await page.locator('#toggleEventTimeline').click();await page.screenshot({path:'output/playwright/v037-collapsed.png'});
  check((await page.locator('#eventTimeline').boundingBox()).height<=42,'collapsed height');
  await page.locator('#toggleEventTimeline').click();await page.setViewportSize({width:390,height:844});
  check(await page.evaluate(()=>{const r=document.getElementById('eventTimeline').getBoundingClientRect(),stage=viewer.sim.api.stage.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=stage.top&&r.bottom<=stage.bottom;}),'mobile timeline remains inside viewport/stage');
  await page.screenshot({path:'output/playwright/v037-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{document.body.classList.add('immersive');document.body.classList.remove('hud-visible');});
  check(await page.locator('#eventTimeline').evaluate(el=>getComputedStyle(el).visibility)==='hidden','immersive hidden HUD hides timeline');
  await page.evaluate(()=>{document.body.classList.add('hud-visible');});check(await page.locator('#eventTimeline').evaluate(el=>getComputedStyle(el).visibility)==='visible','immersive visible HUD reveals timeline');
  await page.evaluate(()=>document.body.classList.remove('immersive','hud-visible'));
 }catch(error){results.push({pass:false,error:error.stack});}
 finally{await page.evaluate(()=>{viewer.sim.paused=true;viewer.sim.timeline.settings.autoPause=false;viewer.sim.timeline.save();viewer.sim.sessionMemory.save();});}
 return results;
}
