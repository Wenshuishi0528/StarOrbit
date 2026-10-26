async page=>{
 const checks=[],check=(pass,name,details)=>{checks.push({name,pass:!!pass,details});if(!pass)throw Error(name+': '+JSON.stringify(details));};
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 check(await page.locator('#welcomeTitle').textContent()==='欢迎来到星轨','welcome uses StarOrbit');
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 await page.evaluate(()=>viewer.music.audio.pause());
 for(const [lang,title,heading]of [['Zh','星轨 · StarOrbit — 航天与轨道模拟','星轨 · StarOrbit'],['En','StarOrbit — Space & Orbit Simulator','StarOrbit'],['Ru','StarOrbit — Симулятор космоса и орбит','StarOrbit'],['Fr','StarOrbit — Simulateur spatial et orbital','StarOrbit']]){
  await page.locator('#language'+lang).click();check(await page.title()===title,'browser title '+lang);check(await page.locator('h1').textContent()===heading,'header brand '+lang);
 }
 await page.locator('#languageZh').click();check(await page.locator('#sceneName').inputValue()==='StarOrbit','new scene default');
 check(await page.locator('#weatherSeed').inputValue()==='StarOrbit','new weather seed default');
 check(await page.locator('#missionSelect option:checked').textContent()==='地球：空间站：中国空间站','spacecraft name remains accurate');
 await page.evaluate(()=>{const s=viewer.sim;s.seek(s.time);s.missions.state.pose={roll:12,pitch:23,yaw:34};s.missions.applyPose();s.missions.syncUI();s.sessionMemory.save();});
 const snapshot=await page.evaluate(()=>({pose:viewer.sim.missions.state.pose,order:[...viewer.music.state.order],dbs:[] }));
 const downloadPromise=page.waitForEvent('download');await page.locator('#exportScene').click();const download=await downloadPromise;
 check(download.suggestedFilename()==='StarOrbit.starorbit.json','new scene download name',download.suggestedFilename());
 check(await page.evaluate(()=>viewer.sim.sceneShare.capture().format.startsWith('tiangong')),'scene schema retains backwards compatibility');
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);await page.evaluate(()=>viewer.music.audio.pause());
 check(await page.evaluate(p=>JSON.stringify(viewer.sim.missions.state.pose)===JSON.stringify(p),snapshot.pose),'existing mission storage survives reload');
 check(await page.evaluate(order=>JSON.stringify(viewer.music.state.order)===JSON.stringify(order),snapshot.order),'music order persists with existing library');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:width===1440?960:844});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow '+width);}
 await page.setViewportSize({width:1440,height:960});await page.screenshot({path:'output/playwright/v044-brand.png'});
 await page.goto('http://127.0.0.1:8771/天宫空间站交互预览.html');await page.waitForURL('**/StarOrbit.html');await page.waitForFunction(()=>window.viewer?.sim.initialized);
 check(await page.title()==='星轨 · StarOrbit — 航天与轨道模拟','legacy entry opens renamed standalone app');
 check(await page.locator('.app-version').textContent()==='v0.44','installed standalone version');
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();await page.evaluate(()=>viewer.music.audio.pause());
 return checks;
}
