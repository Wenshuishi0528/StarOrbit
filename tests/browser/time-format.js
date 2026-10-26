async page=>{
 const checks=[],check=(pass,name)=>{if(!pass)throw Error(name);checks.push(name);};
 await page.waitForFunction(()=>window.viewer?.sim.initialized);await page.evaluate(()=>localStorage.removeItem('starorbit-hour-cycle-v1'));await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 await page.evaluate(()=>viewer.music.pause());
 check(await page.locator('#hourCycle').inputValue()==='24','24h default independent of browser locale');
 await page.locator('#customDate').fill('2026-10-26');await page.locator('#customTime').fill('23:05:06');await page.locator('#setTime').click();
 check(await page.evaluate(()=>viewer.sim.time===Date.parse('2026-10-26T23:05:06+08:00')),'24h jump retains UTC+8');
 await page.selectOption('#hourCycle','12');
 check(await page.locator('#customTime').inputValue()==='11:05:06 PM','24h to 12h preserves exact time');
 await page.locator('#customTime').fill('12:00:00 AM');await page.locator('#setTime').click();
 check(await page.evaluate(()=>viewer.sim.time===Date.parse('2026-10-26T00:00:00+08:00')),'12 AM means midnight');
 await page.locator('#customTime').fill('12:00:00 PM');await page.locator('#setTime').click();
 check(await page.evaluate(()=>viewer.sim.time===Date.parse('2026-10-26T12:00:00+08:00')),'12 PM means noon');
 await page.locator('#customTime').fill('13:00:00 PM');await page.locator('#setTime').click();
 check(await page.evaluate(()=>viewer.sim.time===Date.parse('2026-10-26T12:00:00+08:00')),'invalid 12h time leaves simulation unchanged');
 await page.locator('#customTime').fill('09:30:00 PM');await page.selectOption('#hourCycle','24');
 check(await page.locator('#customTime').inputValue()==='21:30:00','format switch preserves unsubmitted edit');
 check(await page.evaluate(()=>viewer.sim.time===Date.parse('2026-10-26T12:00:00+08:00')),'format switch does not seek');
 await page.selectOption('#hourCycle','12');await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);await page.evaluate(()=>viewer.music.pause());
 check(await page.locator('#hourCycle').inputValue()==='12','12h selection persists after reload');
 await page.locator('#languageEn').click();check((await page.locator('#customTime').inputValue()).endsWith(' PM'),'12h survives language changes');
 await page.screenshot({path:'output/playwright/time049-desktop.png'});
 await page.setViewportSize({width:375,height:812});await page.locator('#customTime').scrollIntoViewIfNeeded();
 check(await page.locator('.date-time-inputs').evaluate(e=>e.scrollWidth<=e.clientWidth),'date and clock fit narrow sidebar');
 await page.screenshot({path:'output/playwright/time049-mobile.png'});
 await page.selectOption('#hourCycle','24');
 return checks;
}
