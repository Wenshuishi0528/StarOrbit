async page=>{
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 if(await page.locator('#flightLab').evaluate(e=>e.open))await page.locator('#closeFlightLab').click();
 await page.evaluate(()=>viewer.music.pause());await page.locator('#languageZh').click();
 await page.locator('#openFlightLab').click();await page.locator('#dockingTab').click();
 const capture=await page.evaluate(()=>{
  const p=viewer.sim.flightLab.panels.docking;p.reset(50);p.setCamera('onboard');p.state.position=[0,.36,0];p.state.velocity=[0,-.05,0];p.step(.5);p.render();
  return {status:p.state.status,caption:document.querySelector('.dock-pause-caption').textContent,targetVisible:!document.querySelector('.dock-target').hidden};
 });
 if(capture.status!=='docked'||!capture.targetVisible||capture.caption.includes('按开始继续')||!capture.caption.includes('重新开始'))throw Error(JSON.stringify(capture));
 await page.locator('.dock-viewport').screenshot({path:'output/playwright/flight066-docking-captured.png'});
 await page.locator('[data-role=reset]').click();await page.locator('[data-role=start]').click();await page.waitForTimeout(200);
 const blurred=await page.evaluate(()=>{const p=viewer.sim.flightLab.panels.docking;window.dispatchEvent(new Event('blur'));return {paused:p.paused,time:p.state.time};});
 await page.waitForTimeout(250);
 if(!blurred.paused||await page.evaluate(()=>viewer.sim.flightLab.panels.docking.state.time)!==blurred.time)throw Error('blur did not pause');
 const before=await page.evaluate(()=>{const s=viewer.sim;s.mode='custom';s.speed=60;s.paused=false;s.lastWall=performance.now();s.timeUI();return s.time;});
 await page.waitForTimeout(600);
 const during=await page.evaluate(()=>viewer.sim.time);if(during!==before)throw Error('main clock advanced behind modal');
 await page.locator('#flightLab').screenshot({path:'output/playwright/flight066-local-runtime.png'});
 await page.locator('#closeFlightLab').click();await page.waitForTimeout(100);
 const resumed=await page.evaluate(()=>{const s=viewer.sim;const time=s.time;s.realTime();s.update(performance.now());return time;});
 if(resumed<before||resumed-before>18000)throw Error('custom clock caught up hidden time '+(resumed-before));
 return {version:await page.locator('.app-version').textContent(),capture,blurPauses:true,mainClockFrozen:true,resumedMilliseconds:resumed-before};
}
