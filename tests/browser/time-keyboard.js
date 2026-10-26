async page=>{
 const checks=[],check=(pass,name)=>{if(!pass)throw Error(name);checks.push(name);};
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 await page.evaluate(()=>viewer.music.pause());await page.selectOption('#hourCycle','24');
 await page.locator('#customDate').fill('2026-10-26');const clock=page.locator('#customTime');
 await clock.fill('23:59:59');await page.locator('#setTime').click();const before=await page.evaluate(()=>viewer.sim.time);
 await clock.click({position:{x:12,y:15}});check(await clock.evaluate(e=>e.selectionStart===0&&e.selectionEnd===2),'click selects hours');
 await clock.press('ArrowUp');check(await clock.inputValue()==='00:59:59','up adjusts selected hours and wraps at 24');
 await clock.press('ArrowDown');await clock.press('ArrowRight');
 check(await clock.evaluate(e=>e.selectionStart===3&&e.selectionEnd===5),'right selects minutes');
 await clock.press('ArrowUp');check(await clock.inputValue()==='23:00:59','up adjusts minutes independently');
 await clock.press('ArrowRight');await clock.press('ArrowUp');check(await clock.inputValue()==='23:00:00','right then up adjusts seconds');
 await clock.press('ArrowLeft');await clock.press('ArrowDown');check(await clock.inputValue()==='23:59:00','left selects minutes and down wraps');
 await clock.press('ArrowRight');await clock.press('4');await clock.press('2');check(await clock.inputValue()==='23:59:42','selected part supports direct digit entry');
 await page.locator('#hourCycle').focus();await page.waitForTimeout(350);
 check(await clock.inputValue()==='23:59:42'&&await page.evaluate(()=>viewer.sim.time)===before,'pending keyboard edits survive readout without seeking');
 await page.locator('#setTime').click();check(await page.evaluate(()=>viewer.sim.time)===Date.parse('2026-10-26T23:59:42+08:00'),'jump applies keyboard edit');
 await page.selectOption('#hourCycle','12');await clock.click({position:{x:12,y:15}});await clock.press('ArrowUp');check(await clock.inputValue()==='12:59:42 AM','12h hour adjustment crosses midnight');
 for(let i=0;i<3;i++)await clock.press('ArrowRight');
 check(await clock.evaluate(e=>e.value.slice(e.selectionStart,e.selectionEnd))==='AM','right selects AM/PM');
 await clock.press('ArrowUp');check(await clock.inputValue()==='12:59:42 PM','up switches AM to PM');
 await clock.press('ArrowDown');check(await clock.inputValue()==='12:59:42 AM','down switches PM to AM');
 await page.selectOption('#hourCycle','24');check(await clock.inputValue()==='00:59:42','24h switch preserves keyboard edits');
 await page.locator('#customDate').focus();await page.keyboard.press('ArrowUp');check(await page.locator('#customDate').inputValue()!=='2026-10-26','native date keyboard editing retained');
 return checks;
}
