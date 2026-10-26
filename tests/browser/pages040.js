async page=>{
 const results=[],check=(v,name,detail)=>{results.push({name,pass:!!v,detail});if(!v)throw Error(name+': '+JSON.stringify(detail));};
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(!await page.locator('#welcomeDialog').evaluate(el=>el.open)){await page.evaluate(()=>localStorage.removeItem('tiangong-help-v1'));await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);}
 const initial=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name));
 check(initial.every(n=>!n.includes('/api/')&&!n.includes('dongfanghong')&&!n.includes('milkyway-16')),'initial load avoids local APIs and unused spacecraft/sky',initial);
 check(await page.evaluate(()=>viewer.sim.environment.weather.settings.cloud==='builtin'&&document.getElementById('updateEnvironment').hidden&&document.getElementById('updateCloudSource').hidden),'web defaults and update controls');
 check(await page.locator('#welcomeDialog').evaluate(el=>el.open),'first welcome visible');
 await page.locator('#startTour').click();
 for(let i=0;i<4;i++){
  check(await page.locator('#helpProgress').textContent()===`${i+1} / 4`,'tour progress '+i);
  check(await page.locator('.tour-highlight').count()===1,'single highlighted target '+i);
  await page.locator('#tourNext').click();
 }
 check(await page.locator('#helpPanel').isHidden()&&await page.locator('.tour-highlight').count()===0,'finishing restores view');
 await page.locator('#helpToggle').click();
 check(await page.locator('#tourActions').isHidden(),'manual hides tour navigation');
 check(await page.locator('#helpContents details').count()===7,'manual covers all topics');
 await page.locator('#replayTour').click();await page.locator('#tourNext').click();await page.keyboard.press('Escape');
 check(await page.locator('#helpPanel').isHidden()&&await page.locator('.tour-highlight').count()===0,'escape clears tour');
 const original=await page.evaluate(()=>({t:viewer.sim.time,id:viewer.sim.missionId}));
 await page.evaluate(()=>{viewer.music.audio.pause();viewer.sim.paused=true;viewer.sim.timeUI();});
 for(const lang of ['En','Ru','Fr','Zh']){
  await page.locator('#language'+lang).click();await page.locator('#helpToggle').click();
  check((await page.locator('#helpTitle').textContent()).length>3,'localized help '+lang);
  await page.locator('#closeHelp').click();
 }
 await page.evaluate(async()=>{await viewer.sim.missions.switchTo('dfh1');});
 check(await page.evaluate(()=>!!viewer.sim.current&&viewer.sim.missionId==='dfh1'),'lazy spacecraft loads');
 check(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('dongfanghong'))),'DFH requested on switch');
 await page.evaluate(async()=>{await viewer.sim.environment.setQuality('high');});
 check(await page.evaluate(()=>viewer.sim.environment.quality==='high'),'high-quality textures load');
 await page.locator('#helpToggle').click();await page.locator('#replayTour').click();await page.locator('#tourNext').click();await page.locator('#tourPrevious').click();
 check(await page.locator('#helpProgress').textContent()==='1 / 4','tour back button');await page.keyboard.press('Escape');
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 check(!await page.locator('#welcomeDialog').evaluate(el=>el.open),'welcome dismissed across reload');
 check(await page.evaluate(()=>viewer.sim.missionId==='dfh1'&&!!viewer.sim.current),'model choice persists');
 await page.evaluate(()=>viewer.music.audio.pause());
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});await page.locator('#languageFr').click();await page.locator('#helpToggle').click();
  const r=await page.locator('#helpPanel').boundingBox();check(r.x>=0&&r.x+r.width<=width&&r.y+r.height<=(width===390?844:1000),'help fits viewport '+width,r);
  await page.screenshot({path:`output/playwright/pages040-help-${width}.png`});
  await page.locator('#replayTour').click();await page.locator('#tourNext').click();
  const tour=await page.locator('#helpPanel').boundingBox();check(tour.x>=0&&tour.y>=0&&tour.x+tour.width<=width,'tour fits viewport '+width,tour);
  await page.screenshot({path:`output/playwright/pages040-tour-${width}.png`});await page.keyboard.press('Escape');
 }
 return results;
}
