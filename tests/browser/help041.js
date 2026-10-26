async page=>{
 const checks=[],check=(pass,name,details)=>{checks.push({name,pass:!!pass,details});if(!pass)throw Error(name+': '+JSON.stringify(details));};
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#welcomeDialog').evaluate(el=>el.open))await page.locator('#skipTour').click();
 await page.evaluate(()=>{viewer.music.audio.pause();viewer.sim.seek(viewer.sim.time);});
 if(await page.locator('#helpPanel').isVisible())await page.locator('#closeHelp').click();await page.locator('#helpToggle').click();
 const count=await page.locator('.help-topic').count();check(count===8,'eight compact directory topics');
 await page.mouse.click(500,250);check(await page.locator('#helpPanel').isVisible(),'clicking scene keeps directory open');
 const before=await page.evaluate(()=>({quality:viewer.sim.environment.quality,time:viewer.sim.time,id:viewer.sim.missionId}));
 await page.evaluate(()=>{const el=document.getElementById('settings-environment');el.hidden=true;document.querySelector('[aria-controls="settings-environment"]').setAttribute('aria-expanded','false');document.querySelector('aside').scrollTop=100;});
 await page.locator('[data-topic="4"]').click();
 check(await page.locator('#earthQuality').isVisible(),'quality topic opens collapsed sidebar section');
 check(await page.locator('#helpContents').textContent().then(s=>s.includes('精细 · 8K')),'quality recommends highest setting');
 check(await page.locator('#helpSpotlight').isVisible(),'spotlight visible');
 check(await page.locator('#helpArrow').getAttribute('d').then(s=>s.includes(' L')),'arrow has target path');
 check(await page.evaluate(b=>viewer.sim.environment.quality===b.quality&&viewer.sim.time===b.time&&viewer.sim.missionId===b.id,before),'guidance preserves quality/time/mission');
 await page.mouse.click(900,250);check(await page.locator('#helpPanel').isVisible(),'scene click keeps selected guide open');
 await page.locator('#earthQuality').click();await page.keyboard.press('Escape');
 // Escape from the native picker may also close the guide depending on browser;
 // use direct selection below after reopening if needed.
 if(await page.locator('#helpPanel').isHidden()){await page.locator('#helpToggle').click();await page.locator('[data-topic="4"]').click();}
 await page.locator('#earthQuality').selectOption('high');await page.waitForFunction(()=>viewer.sim.environment.quality==='high');
 check(await page.locator('#helpPanel').isVisible(),'quality change keeps help open');
 await page.locator('#helpDirectory').click();
 check(await page.locator('#settings-environment').evaluate(el=>el.hidden),'directory restores original collapsed section');
 check(await page.evaluate(()=>document.querySelector('aside').scrollTop===100),'directory restores sidebar scroll');
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  for(const lang of ['Zh','Ru']){
   await page.locator('#language'+lang).click();
   for(const i of [1,2,3,4,5,6,7]){
    await page.locator(`[data-topic="${i}"]`).click();
    await page.waitForFunction(()=>!document.getElementById('helpSpotlight').hasAttribute('hidden'));
    const boxes=await page.evaluate(()=>{const p=document.getElementById('helpPanel').getBoundingClientRect(),r=document.getElementById('helpRing').getBBox();return {p:{left:p.left,top:p.top,right:p.right,bottom:p.bottom},r:{left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height},width:innerWidth,height:innerHeight};});
    const {p,r}=boxes,overlap=Math.max(0,Math.min(p.right,r.right)-Math.max(p.left,r.left))*Math.max(0,Math.min(p.bottom,r.bottom)-Math.max(p.top,r.top));
    check(p.left>=0&&p.top>=0&&p.right<=width+1&&p.bottom<=boxes.height+1,'card stays onscreen '+width+'/'+lang+'/'+i,boxes);
    check(overlap<2,'card does not cover highlighted target '+width+'/'+lang+'/'+i,boxes);
    if(i===4&&lang==='Zh')await page.screenshot({path:`output/playwright/v041-quality-${width}.png`});
    if(i===5){await page.mouse.click(width-5,75);check(await page.locator('#musicExpanded').isVisible(),'music stays expanded for guidance '+width+'/'+lang);}
    await page.locator('#helpDirectory').click();
   }
  }
 }
 await page.locator('#languageZh').click();await page.locator('#replayTour').click();
 for(let i=0;i<6;i++){check(await page.locator('#helpProgress').textContent()===`${i+1} / 6`,'tour step '+i);await page.locator('#tourNext').click();}
 check(await page.locator('#helpPanel').isHidden()&&await page.locator('#helpSpotlight').isHidden(),'finishing clears panel and highlight');
 check(await page.evaluate(()=>!viewer.music.dock.guided),'finishing releases music lock');
 await page.locator('#helpToggle').click();await page.locator('[data-topic="4"]').click();await page.keyboard.press('Escape');
 check(await page.locator('#helpPanel').isHidden()&&await page.locator('#helpSpotlight').isHidden(),'escape explicitly closes and cleans up');
 return checks;
}
