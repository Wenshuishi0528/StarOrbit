// Run against a fresh browser profile on the normal Tiangong app page.
// Drives real controls and reads the saved record to verify the exact restore.
export async function inspectFreeFlight(page,{captureDirectory=null}={}){
 const check=(value,reason)=>{if(!value)throw Error(reason);};
 const appReady=()=>page.waitForFunction(()=>!!window.viewer?.sim.freeFlight,null,{timeout:60000});
 const state=()=>page.evaluate(()=>viewer.sim.freeFlight.state);
 const phase=(key)=>page.waitForFunction(key=>viewer.sim.freeFlight.state?.phase===key,key,{timeout:95000});
 const panel=page.locator('#freeFlightPanel');
 const click=name=>panel.locator('[data-flight-action="'+name+'"]').click();
 const choose=id=>panel.locator('[data-flight-select]').selectOption(id);
 const saved=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('starorbit-free-flight-v1:'))
  .map(k=>JSON.parse(localStorage.getItem(k))).sort((a,b)=>b.savedAt-a.savedAt)[0]);
 const startButton=page.locator('#openFreeFlight'),launcher=page.locator('#freeFlightLauncher');
 await appReady();
 if(await page.locator('#welcomeDialog').evaluate(el=>el.open))await page.locator('#skipTour').click();
 await page.evaluate(()=>viewer.sim.seek(viewer.sim.current.t));
 const observation=await page.evaluate(()=>({time:viewer.sim.time,slots:JSON.stringify(viewer.state.slots),eye:viewer.camera.position.toArray()}));
 await startButton.click();await launcher.locator('[data-launch-craft]').selectOption('TH_AFT');
 await launcher.locator('[data-start]').click();await phase('docked');
 check((await state()).selectedId==='ship:TH_AFT','New flight selected wrong ship');
 await click('undock');await phase('departing');
 await choose('ship:TH_FORWARD');await click('undock');await phase('free');
 await choose('ship:TH_AFT');await phase('free');await click('hold');
 await page.waitForFunction(()=>viewer.sim.freeFlight.state?.hold);
 await panel.focus();await page.keyboard.down('d');
 try{await page.waitForFunction(()=>viewer.sim.freeFlight.state?.hold===false);}
 finally{await page.keyboard.up('d');}
 await panel.locator('[data-flight-view=port]').click();check((await state()).view==='port','Port camera did not engage');
 await click('pause');await click('save');const record=await saved();
 check(record?.session.ships.length===2&&record.session.ships.every(s=>s.status==='free'),'Save lost the second ship or failed to detach it');
 const time=record.session.elapsed;
 await click('exit');await startButton.waitFor();
 const after=await page.evaluate(()=>({time:viewer.sim.time,slots:JSON.stringify(viewer.state.slots),eye:viewer.camera.position.toArray()}));
 check(JSON.stringify(after)===JSON.stringify(observation),'Flight changed observation time, assembly or camera');
 await page.reload({waitUntil:'domcontentloaded'});await appReady();await startButton.click();
 await launcher.locator('[data-launch-save]').selectOption(record.id);await launcher.locator('[data-resume]').click();
 const restored=await state();check(restored.paused&&restored.elapsed===time&&restored.selectedId===record.selectedId&&restored.view==='port','Reload lost flight state');
 await click('save');const loaded=await saved();
 check(JSON.stringify(record.session.ships)===JSON.stringify(loaded.session.ships),'Reload changed velocity, orientation or location');
 await panel.locator('[data-flight-view=external]').click();
 if(captureDirectory)await page.screenshot({path:captureDirectory+'/free-flight-two-ships.png'});
 const download=page.waitForEvent('download');await click('photo');check((await download).suggestedFilename().endsWith('.png'),'Flight did not export PNG');
 await click('pause');
 await click('dock');await choose('ship:TH_FORWARD');await click('dock');await phase('docked');
 await choose('ship:TH_AFT');await phase('docked');await click('save');
 const end=await saved();
 check(end.session.ships.every(s=>s.status==='docked'),'Both ships must reoccupy their own ports');
 await click('restore');check((await state()).paused,'Checkpoint did not pause safely');
 await click('resume');check((await state()).phase==='docked','Explicit reload did not restore saved docking');
 await click('exit');return {saveId:record.id,elapsedAtSave:time,elapsedAtReturn:end.session.elapsed,ports:end.session.ships.map(s=>s.portId)};
}
