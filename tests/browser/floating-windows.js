// Exercises real product overlays without replacing the layout or app state.
export async function inspectFloatingWindows(page,{captureDirectory=null}={}){
 const check=(value,reason)=>{if(!value)throw Error(reason);};
 const ready=()=>page.waitForFunction(()=>!!window.viewer?.sim.floatingWindows,null,{timeout:60000});
 const expand=async name=>{
  const button=page.locator('[data-settings-module="'+name+'"] .settings-toggle');
  if(await button.getAttribute('aria-expanded')==='false')await button.click();
 };
 const drag=async (root,handle,dx,dy)=>{
  const panel=page.locator(root),header=panel.locator(handle),before=await panel.boundingBox(),box=await header.boundingBox();
  check(box,'Missing visible drag handle: '+root);
  await page.mouse.move(box.x+Math.min(box.width/2,35),box.y+box.height/2);
  await page.mouse.down();await page.mouse.move(box.x+Math.min(box.width/2,35)+dx,box.y+box.height/2+dy,{steps:12});await page.mouse.up();
  return {before,after:await panel.boundingBox()};
 };
 await ready();
 if(await page.locator('#welcomeDialog').evaluate(el=>el.open))await page.locator('#skipTour').click();
 await expand('attitude');await page.locator('#attitudeNavball').check();
 const nav=page.locator('#attitudeNavballPanel');await nav.waitFor();
 // Manual pose changes affect the body instrument while a paused orbit stays put.
 await page.evaluate(()=>viewer.sim.seek(viewer.sim.current.t));
 const initial=await nav.locator('.an-attitude').innerText();
 await page.locator('#craftyaw').fill('35');await page.locator('#craftyaw').press('Tab');
 await page.waitForFunction(value=>document.querySelector('#attitudeNavballPanel .an-attitude').textContent!==value,initial);
 const posed=await nav.locator('.an-attitude').innerText();
 await page.mouse.move(750,300);await page.mouse.down();await page.mouse.move(850,340,{steps:8});await page.mouse.up();
 check(await nav.locator('.an-attitude').innerText()===posed,'Observation camera changed spacecraft navball attitude');
 await page.locator('#craftyaw').fill('0');await page.locator('#craftyaw').press('Tab');
 const navMove=await drag('#attitudeNavballPanel','.an-heading h3',220,-130);
 check(navMove.after.x-navMove.before.x>150&&navMove.after.y<navMove.before.y-80,'Main navball did not move by its title');
 const telemetryMove=await drag('#telemetry','.clock',-180,90);
 check(telemetryMove.before.x-telemetryMove.after.x>100,'Telemetry window did not move');
 if(await page.locator('#orbitMinimap').isVisible()){
  const mapMove=await drag('#orbitMinimap','.minimap-heading strong',-140,-130);
  check(mapMove.before.x-mapMove.after.x>80,'Orbit map did not move');
 }
 await expand('display');
 const layout=page.locator('details[data-memory-key=window-layout]');
 if(!await layout.evaluate(el=>el.open))await layout.locator('summary').click();
 await page.locator('#lockFloatingWindows').check();
 const locked=await drag('#attitudeNavballPanel','.an-heading h3',80,60);
 check(Math.abs(locked.after.x-locked.before.x)<1&&Math.abs(locked.after.y-locked.before.y)<1,'Lock did not prevent window movement');
 await page.locator('#lockFloatingWindows').uncheck();
 // Closing a child button must keep its action and checkbox synchronization.
 await nav.locator('.an-close').click();check(!await page.locator('#attitudeNavball').isChecked(),'Navball close lost checkbox synchronization');
 await expand('attitude');await page.locator('#attitudeNavball').check();await nav.waitFor();
 const beforeReload=await nav.boundingBox();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tiangong-session-v1'))?.switches?.attitudeNavball===true);
 await page.reload({waitUntil:'domcontentloaded'});await ready();await nav.waitFor();
 const afterReload=await nav.boundingBox();
 check(Math.abs(beforeReload.x-afterReload.x)<3&&Math.abs(beforeReload.y-afterReload.y)<3,'Window position was not restored on reload');
 if(captureDirectory)await page.screenshot({path:captureDirectory+'/v108-main-navball.png'});
 await page.setViewportSize({width:390,height:780});
 await page.waitForFunction(()=>{const r=document.querySelector('#attitudeNavballPanel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;});
 if(captureDirectory)await page.screenshot({path:captureDirectory+'/v108-mobile-layout.png'});
 await page.setViewportSize({width:1440,height:900});await expand('display');
 if(!await layout.evaluate(el=>el.open))await layout.locator('summary').click();
 await page.locator('#resetFloatingWindows').click();
 check(!await nav.evaluate(el=>el.hasAttribute('data-floating-moved')),'Reset left the manual placement');
 const defaultPosition=await nav.boundingBox();
 check(Math.abs(defaultPosition.x-navMove.before.x)<3&&Math.abs(defaultPosition.y-navMove.before.y)<3,'Reset did not restore the original layout');
 await nav.locator('.an-close').click();
 return {initialAttitude:initial,posedAttitude:posed,moved:beforeReload,restored:afterReload};
}
