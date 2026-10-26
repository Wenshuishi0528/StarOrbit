async page=>{
 const checks=[],check=(pass,name,details)=>{checks.push({name,pass:!!pass,details});if(!pass)throw Error(name+': '+JSON.stringify(details));};
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#welcomeDialog').evaluate(el=>el.open))await page.locator('#skipTour').click();
 await page.evaluate(()=>{viewer.music.audio.pause();viewer.sim.seek(viewer.sim.time);});
 check(await page.locator('#earthQuality').inputValue()==='standard','fresh overall quality is 4K');
 check(await page.locator('#skyExposure').inputValue()==='view','fresh sky is catalog view');
 check(await page.locator('#skyExposure option:checked').textContent()==='4K · 星表观赏','sky option renamed');
 await page.locator('#helpToggle').click();
 check(await page.locator('.help-topic').count()===10,'ten help cards');
 check(await page.locator('#helpContents').evaluate(el=>[...el.children].map(e=>e.textContent).join('|').indexOf('选择画质')<el.textContent.indexOf('探索地球与星空')),'quality precedes exploration');
 await page.locator('.help-topic-group summary').click();
 check(await page.locator('.help-topic-group .help-topic').count()===2,'quality has two subtopics');
 await page.evaluate(()=>{document.getElementById('settings-environment').hidden=true;document.querySelector('[aria-controls="settings-environment"]').setAttribute('aria-expanded','false');document.querySelector('[data-memory-key="sky-style"]').open=false;});
 await page.locator('[data-topic="3"]').click();
 check(await page.locator('#earthQuality').isVisible(),'overall guide reveals actual selector');
 check(await page.locator('#helpContents').textContent().then(t=>t.includes('精细 · 8K')),'highest-quality recommendation retained');
 check(await page.locator('#tourNext').textContent()==='下一个','manual card has Next');
 await page.locator('#tourNext').click();
 check(await page.locator('#helpTitle').textContent()==='选择星空画质','manual Next reaches sky guide');
 check(await page.locator('#skyExposure').isVisible(),'sky guide expands nested menu');
 check(await page.locator('#skyExposure').evaluate(el=>el.classList.contains('tour-highlight')),'sky selector is highlighted');
 check(await page.locator('#earthQuality').inputValue()==='standard','guide leaves selected quality intact');
 await page.mouse.click(950,200);check(await page.locator('#helpPanel').isVisible(),'scene click keeps guide open');
 await page.locator('#skyExposure').selectOption('photo');check(await page.locator('#helpPanel').isVisible(),'sky control usable during guidance');
 await page.locator('#tourNext').click();check(await page.locator('#helpTitle').textContent()==='探索地球与星空','sky followed by exploration');
 check(await page.locator('[data-memory-key="sky-style"]').evaluate(el=>!el.open),'leaving sky restores folded menu');
 check(await page.locator('#settings-environment').evaluate(el=>el.hidden),'leaving quality restores section');
 for(let i=5;i<10;i++){check(await page.locator('#tourActions').isVisible(),'manual actions visible '+i);await page.locator('#tourNext').click();}
 check(await page.locator('#helpPanel').isHidden(),'manual sequence finishes');
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  for(const lang of ['Zh','Ru']){
   await page.locator('#language'+lang).click();await page.locator('#helpToggle').click();await page.locator('#replayTour').click();
   for(let i=0;i<8;i++){
    await page.waitForFunction(()=>!document.getElementById('helpSpotlight').hasAttribute('hidden'));
    check(await page.locator('#helpProgress').textContent()===`${i+1} / 8`,'tour position '+width+'/'+lang+'/'+i);
    const b=await page.evaluate(()=>{const p=document.getElementById('helpPanel').getBoundingClientRect(),n=document.getElementById('tourNext').getBoundingClientRect(),r=document.getElementById('helpRing').getBBox();return {left:p.left,right:p.right,top:p.top,bottom:p.bottom,nextBottom:n.bottom,nextRight:n.right,overlap:Math.max(0,Math.min(p.right,r.x+r.width)-Math.max(p.left,r.x))*Math.max(0,Math.min(p.bottom,r.y+r.height)-Math.max(p.top,r.y))};});
    check(b.left>=0&&b.right<=width+1&&b.top>=0&&b.bottom<= (width===1440?1000:844)+1&&b.nextBottom<=b.bottom&&b.nextRight<=b.right,'card and Next fit '+width+'/'+lang+'/'+i,b);
    if(i===3||i===4){check(b.overlap<2,'quality card avoids selector '+width+'/'+lang+'/'+i,b);if(lang==='Zh')await page.screenshot({path:`output/playwright/v042-${width}-${i}.png`});}
    if(i===7){check(await page.locator('#craftLabelsControl').isVisible(),'last step reveals label control '+width+'/'+lang);check(await page.locator('#craftLabelsControl').evaluate(el=>el.classList.contains('tour-highlight')),'last step highlights labels '+width+'/'+lang);const before=await page.locator('#labels').isChecked();await page.locator('#labels').setChecked(!before);check(await page.locator('#helpPanel').isVisible(),'label toggle keeps help open '+width+'/'+lang);await page.locator('#labels').setChecked(before);}
    await page.locator('#tourNext').click();
   }
   check(await page.locator('#helpPanel').isHidden()&&await page.locator('#helpSpotlight').isHidden(),'tour closes cleanly '+width+'/'+lang);
  }
 }
 await page.locator('#languageZh').click();
 // Explicitly saved values survive startup rather than being replaced by defaults.
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('tiangong-environment-v1'));s.quality='medium';s.exposure='photo';localStorage.setItem('tiangong-environment-v1',JSON.stringify(s));});
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 check(await page.locator('#earthQuality').inputValue()==='medium'&&await page.locator('#skyExposure').inputValue()==='photo','saved quality and sky preferences survive reload');
 await page.evaluate(()=>viewer.music.audio.pause());
 return checks;
}
