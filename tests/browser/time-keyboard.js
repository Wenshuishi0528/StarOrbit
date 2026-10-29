async page=>{
 const checks=[],check=(pass,name)=>{if(!pass)throw Error(name);checks.push(name);};
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 await page.evaluate(()=>viewer.music.pause());await page.selectOption('#hourCycle','24');
 const input=page.locator('#customTime'),selected=()=>input.evaluate(e=>e.value.slice(e.selectionStart,e.selectionEnd));
 await input.fill('2026-10-26 23:59:59');await page.locator('#setTime').click();const before=await page.evaluate(()=>viewer.sim.time);
 await input.click({position:{x:12,y:15}});check(await selected()==='2026','click selects year first, regardless of browser locale');
 for(const expected of ['10','26','23','59','59']){await input.press('ArrowRight');check(await selected()===expected,'continuous right navigation: '+expected);}
 for(const expected of ['59','23','26','10','2026']){await input.press('ArrowLeft');check(await selected()===expected,'continuous left navigation: '+expected);}
 await input.press('ArrowUp');check(await input.inputValue()==='2027-10-26 23:59:59','up changes selected year');
 for(let i=0;i<3;i++)await input.press('ArrowRight');
 await input.press('ArrowUp');check(await input.inputValue()==='2027-10-26 00:59:59','hour stepping is retained');
 await input.press('ArrowRight');await input.press('ArrowRight');await input.press('4');await input.press('2');
 check(await input.inputValue()==='2027-10-26 00:59:42','selected seconds support typing');
 await page.locator('#hourCycle').focus();await page.waitForTimeout(350);
 check(await input.inputValue()==='2027-10-26 00:59:42'&&await page.evaluate(()=>viewer.sim.time)===before,'pending edits survive readout without seeking');
 await page.locator('#setTime').click();check(await page.evaluate(()=>viewer.sim.time)===Date.parse('2027-10-26T00:59:42+08:00'),'jump applies the combined value');
 await page.selectOption('#hourCycle','12');check(await input.inputValue()==='2027-10-26 12:59:42 AM','12h format retains date and seconds');
 await input.click({position:{x:12,y:15}});for(let i=0;i<6;i++)await input.press('ArrowRight');
 check(await selected()==='AM','AM/PM is the last selectable part');await input.press('ArrowUp');check(await input.inputValue()==='2027-10-26 12:59:42 PM','AM/PM stepping retained');
 await page.selectOption('#hourCycle','24');
 return checks;
}
