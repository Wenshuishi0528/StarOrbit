// Run in an isolated browser profile. snapshotJSON must be a real exported
// solar observation; the test never fabricates an image or its observed date.
export async function inspectXuntianSolarControls(page,{snapshotJSON}={}){
 const check=(value,message)=>{if(!value)throw Error(message);};
 await page.setViewportSize({width:1440,height:1000});
 await page.waitForFunction(()=>window.viewer?.sim?.initialized&&viewer.sim.environment.solarObservations,null,{timeout:90000});
 if(await page.locator('#welcomeDialog').evaluate(element=>element.open))await page.locator('#skipTour').click();
 await page.locator('#languageZh').click();
 if(snapshotJSON)await page.evaluate(async json=>viewer.sim.environment.solarObservations.importSnapshot(new Blob([json],{type:'application/json'})),snapshotJSON);
 await page.evaluate(()=>{const sim=viewer.sim;sim.seek(Date.UTC(2026,10,5,5,44));sim.update(performance.now());sim.xuntian.open();});
 const search=page.locator('#xtSearch'),canvas=page.locator('#xtCanvas');
 const state=()=>page.evaluate(()=>({pointing:viewer.sim.xuntian.pointing,channel:document.querySelector('#xtSolarControls').dataset.channel,sources:document.querySelector('#xtSources').textContent,depth:document.querySelector('#xtDepth').textContent,record:viewer.sim.environment.solarObservations.snapshot().record?.id}));
 const observe=async()=>{
  await page.evaluate(()=>viewer.sim.xuntian.observeSolar({channel:'hmi'}));
  await page.waitForFunction(()=>viewer.sim.xuntian.pointing.target==='solar:Sun'&&viewer.sim.xuntian.pointing.locked,null,{timeout:45000});
 };
 const firstPlaceholder=await search.getAttribute('placeholder');
 await search.fill('尚未完成的查询');await page.locator('#xtClose').click();await page.locator('#openXuntianMap').click();
 const nextPlaceholder=await search.getAttribute('placeholder');
 check(firstPlaceholder!==nextPlaceholder,'Opening did not refresh the suggested targets');
 check(await search.inputValue()==='尚未完成的查询','Opening replaced a draft search');
 await search.fill('');await search.focus();
 const suggestions=await page.locator('#xtResults [data-target]').evaluateAll(rows=>rows.map(row=>({id:row.dataset.target,name:row.querySelector('b').textContent})));
 check(suggestions.length===3&&suggestions.map(row=>row.name).join('、')===nextPlaceholder,'Empty search differs from its placeholder recommendations');
 await observe();
 const solar=await state();
 check(solar.channel==='hmi'&&solar.pointing.field===.9,'Solar entry did not select HMI and the full-disc field');
 check(solar.sources.includes('SDO')&&!solar.sources.includes('银河')&&!solar.depth,'SDO HUD still described the ordinary optical background');
 if(snapshotJSON){
  check(solar.record,'Imported observation was not used');
  check(!await page.locator('#xtCapture').isDisabled(),'A valid cached observation was not photographable');
 }
 await canvas.focus();await canvas.press('w');const nudged=await state();
 check(nudged.pointing.mode==='free'&&nudged.channel==='hmi','Manual composition unexpectedly left the solar band');
 check(solar.pointing.axes.up.reduce((sum,value,i)=>sum+value*nudged.pointing.axes.forward[i],0)<0,'KSP W did not pitch down');
 await canvas.press('f');const afterF=await state();
 check(afterF.pointing.mode==='free'&&afterF.pointing.pinned===null,'F still toggled the telescope lock');
 const composition={axes:afterF.pointing.axes,field:afterF.pointing.field,roll:afterF.pointing.roll,mode:afterF.pointing.mode};
 await page.locator('#xtSolarOrdinary').click();await page.locator('[data-xt-solar-channel="hmi"]').click();const switched=await state();
 // Free pointing reconstructs a quaternion from the fixed orbital frame on
 // each tick. That round-trip can change axis components by one or two ULPs.
 const modeAxisDelta=Math.max(...Object.keys(composition.axes).flatMap(axis=>composition.axes[axis].map((value,i)=>Math.abs(value-switched.pointing.axes[axis][i]))));
 check(modeAxisDelta<1e-12&&composition.field===switched.pointing.field&&composition.roll===switched.pointing.roll&&composition.mode===switched.pointing.mode,'Changing image modes altered the telescope composition: '+JSON.stringify({modeAxisDelta,before:composition,after:switched.pointing}));
 await search.fill('HIP 91262');await page.locator('#xtResults [data-target="hip:91262"]').click();
 check((await state()).channel==='none','Selecting a star left the solar filter enabled');
 await observe();await page.locator('#xtRecommend').click();check((await state()).channel==='none','Recommended star field retained the solar filter');
 await observe();await page.locator('#xtInitial').click();check((await state()).channel==='none','Initial position retained the solar filter');
 await observe();await page.locator('#xtClose').click();await page.locator('#openXuntianMap').click();
 check((await state()).channel==='none','Reopening retained the solar filter');
 await observe();await page.locator('#xtSolarResources').click();
 check(await page.locator('#resourceDialog').evaluate(element=>element.open),'Solar resources did not open the shared resource panel');
 check(await page.locator('[data-resource="solar"]').count()===1,'Resource panel did not expose one shared solar card');
 await page.locator('#closeResources').click();await page.setViewportSize({width:390,height:844});
 const bounds=await page.locator('#xuntianScope').evaluate(element=>[element.clientWidth,element.scrollWidth]);
 check(bounds[1]<=bounds[0]+2,'Solar controls overflowed the mobile viewport');
 await page.locator('#xtClose').click();
 return {suggestions: suggestions.map(row=>row.id),solarRecord:solar.record,kspPitch:true,modePreservesComposition:true,modeAxisDelta,explicitTargetsRestoreOptics:true,mobile:bounds};
}
