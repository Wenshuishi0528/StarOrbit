// Run on a fresh browser page of the built application.
export async function inspectXuntianCrosshair(page){
 const check=(value,message)=>{if(!value)throw Error(message);};
 const panel=page.locator('#xuntianScope'),search=page.locator('#xtSearch'),canvas=page.locator('#xtCanvas'),readout=page.locator('#xtCrosshairReadout');
 const state=()=>page.evaluate(()=>({pointing:viewer.sim.xuntian.pointing,hit:viewer.sim.xuntian.result?.identification,center:viewer.sim.xuntian.result?.center}));
 await page.setViewportSize({width:1240,height:830});
 await page.waitForFunction(()=>window.viewer?.sim?.initialized&&!!viewer.sim.xuntian,null,{timeout:90000});
 if(await page.locator('#welcomeDialog').evaluate(el=>el.open))await page.locator('#skipTour').click();
 const initial=Date.UTC(2026,10,5,5,44);
 const seek=t=>page.evaluate(time=>{viewer.sim.seek(time);viewer.sim.update(performance.now());},t);
 await seek(initial);await page.locator('#openXuntianMap').click();
 const choose=async(text,id)=>{await search.fill(text);await page.locator('#xtResults [data-target="'+id+'"]').click();await page.waitForFunction(target=>viewer.sim.xuntian.pointing.target===target&&viewer.sim.xuntian.pointing.locked,id,{timeout:45000});};
 await choose('北京','city:beijing');
 await page.waitForFunction(()=>{const hit=viewer.sim.xuntian.result?.identification;return hit?.city?.id==='city:beijing'&&hit.city.distanceKm<.02;},null,{timeout:45000});
 const beijing=await state();
 check(beijing.hit.kind==='earth'&&beijing.hit.city.distanceKm<.02,'City readout must describe the actual surface intersection');
 check((await readout.innerText()).includes('北京')&&(await readout.innerText()).includes('市中心'),'Nearby city must be distinguished from the exact ground point');
 const target=JSON.stringify({mode:beijing.pointing.mode,target:beijing.pointing.target,pinned:beijing.pointing.pinned});
 await page.waitForTimeout(300);const unchanged=await state();
 check(JSON.stringify({mode:unchanged.pointing.mode,target:unchanged.pointing.target,pinned:unchanged.pointing.pinned})===target,'Live identification changed the tracking lock');
 await seek(initial+46*60000);
 await page.waitForFunction(()=>viewer.sim.xuntian.pointing.ground?.visible===false&&viewer.sim.xuntian.result?.identification?.kind==='earth'&&viewer.sim.xuntian.result.identification.city?.id!=='city:beijing',null,{timeout:45000});
 const hidden=await state();check(hidden.pointing.target==='city:beijing','Occlusion must not replace the selected city');
 await seek(initial);await choose('HIP 91262','hip:91262');
 for(let i=0;i<8;i++){
  await page.waitForTimeout(350);if((await state()).hit?.id==='hip:91262')break;
  await seek(initial+(i+1)*10*60000);
 }
 await page.waitForFunction(()=>viewer.sim.xuntian.result?.identification?.id==='hip:91262',null,{timeout:20000});
 check((await page.locator('#xtCrosshairName').innerText()).includes('织女'),'Known star name did not reach the readout');
 await canvas.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>viewer.sim.xuntian.pointing.mode==='free'&&viewer.sim.xuntian.result?.identification?.id!=='hip:91262',null,{timeout:20000});
 const moved=await state();
 check(moved.hit&&moved.pointing.target===null,'A paused, manually shifted final frame kept the stale matched star');
 await choose('M31','deep-sky:m31');
 for(let i=0;i<8;i++){
  await page.waitForTimeout(350);if((await state()).hit?.id==='deep-sky:m31')break;
  await seek(initial+(i+1)*10*60000);
 }
 await page.waitForFunction(()=>viewer.sim.xuntian.result?.identification?.id==='deep-sky:m31',null,{timeout:20000});
 const galaxy=await state();check((await page.locator('#xtCrosshairName').innerText()).includes('仙女座星系'),'Deep-sky catalogue name did not reach the eyepiece');
 await page.setViewportSize({width:390,height:844});
 const dimensions=await panel.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
 check(dimensions.scroll<=dimensions.width+2,'Crosshair detail overflowed the mobile panel');
 await page.locator('#xtClose').click();
 return {beijing:beijing.hit,occulted:selected(hidden),moved:moved.hit,galaxy:galaxy.hit,mobile:dimensions};
}
function selected(state){return {target:state.pointing.target,hit:state.hit};}
