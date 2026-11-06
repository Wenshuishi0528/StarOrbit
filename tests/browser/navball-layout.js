// Run after a navball + FloatingWindows fixture is mounted. The fixture should
// leave some optional panels absent so late-panel discovery remains active.
export async function inspectNavballLayout(page){
 const check=(value,message)=>{if(!value)throw Error(message);};
 const root=page.locator('#attitudeNavballPanel'),toggle=root.locator('.an-layout');
 // Match the app theme: global shorthand animates all button properties.
 // HUD geometry must opt out so ResizeObserver cannot make its header drift.
 await page.addStyleTag({content:'button{transition:.15s}'});
 await page.evaluate(()=>{
  window.layoutTest={events:0,resizes:0,texts:0};
  document.addEventListener('floating-window-layout',()=>layoutTest.events++);
  window.addEventListener('resize',()=>layoutTest.resizes++);
  new MutationObserver(records=>layoutTest.texts+=records.length).observe(document.body,{childList:true,subtree:true});
  const read=document.createElement('span');read.id='unrelated-live-readout';document.body.append(read);
  window.layoutReadTimer=setInterval(()=>{read.textContent=String(performance.now());},30);
 });
 await page.waitForTimeout(250);
 const idle=await page.evaluate(async()=>{const before={...layoutTest};await new Promise(r=>setTimeout(r,700));return Object.fromEntries(Object.keys(before).map(key=>[key,layoutTest[key]-before[key]]));});
 check(idle.events===0,'Unrelated live readouts trigger global window layout: '+JSON.stringify(idle));
 check(idle.texts>10,'Regression must exercise the active late-panel discovery observer');
 await root.locator('canvas').click();await page.keyboard.press('w');
 const button=await toggle.boundingBox(),point={x:button.x+button.width/2,y:button.y+button.height/2};
 const timings=[];
 for(let i=0;i<20;i++){
  const before=await root.getAttribute('data-compact'),start=Date.now();
  // A real press/release straddles a navigation update, at the same screen
  // location each time: replacing text or moving the header must not lose it.
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForTimeout(85);await page.mouse.up();
  const after=await root.getAttribute('data-compact');check(after!==before,'Layout click was lost at iteration '+i);
  timings.push(Date.now()-start);
 }
 const resized=await page.evaluate(()=>layoutTest.resizes);check(resized===0,'Layout toggle dispatches expensive global window resize');
 const late=await page.evaluate(async()=>{
  const panel=document.createElement('div');panel.id='musicPanel';panel.hidden=true;panel.innerHTML='<h3 class="music-panel-heading">Music</h3>';document.body.append(panel);
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return panel.dataset.floatingWindow;
 });
 check(late==='musicPanel','Actual late window was not registered');
 await page.evaluate(()=>{clearInterval(layoutReadTimer);navball.setLanguage('en');});
 await page.waitForTimeout(150);check(await toggle.getAttribute('aria-label')!=='','Translated toggle lacks accessible name');
 await toggle.click();await toggle.click();
 const final=await page.evaluate(()=>({compact:ui.root.dataset.compact,saved:localStorage.getItem('starorbit-navball-compact-v1'),resizes:layoutTest.resizes}));
 check(final.compact===final.saved,'Toggled layout not persisted');check(final.resizes===0,'Language/layout transition dispatched global resize');
 return {idle,clicks:timings.length,maxClickMs:Math.max(...timings),late,final};
}
