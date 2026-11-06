// Real UI regression for craft switching, pilot instruments and mission settings.
// Uses the browser already opened by the caller; no app state is injected.
export async function inspectFreeFlightControls(page,{captureDirectory=null}={}){
 const check=(value,message)=>{if(!value)throw Error(message);};
 const state=()=>page.evaluate(()=>viewer.sim.freeFlight.state);
 const panel=page.locator('#freeFlightPanel'),instruments=page.locator('#freeFlightInstruments');
 const click=name=>panel.locator('[data-flight-action="'+name+'"]').click();
 const choose=id=>panel.locator('[data-flight-select]').selectOption(id);
 const saved=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('starorbit-free-flight-v1:'))
  .map(k=>JSON.parse(localStorage.getItem(k))).sort((a,b)=>b.savedAt-a.savedAt)[0]);
 await page.waitForFunction(()=>!!window.viewer?.sim.freeFlight,null,{timeout:60000});
 if(await page.locator('#welcomeDialog').evaluate(el=>el.open))await page.locator('#skipTour').click();
 await page.locator('#openFreeFlight').click();
 const launcher=page.locator('#freeFlightLauncher');
 await launcher.locator('[data-launch-craft]').selectOption('TH_FORWARD');
 await launcher.locator('[data-start]').click();
 check((await state()).navball,'Navigation ball should be enabled initially');
 await click('undock');await choose('ship:TH_AFT');await click('undock');
 await choose('ship:TH_FORWARD');await choose('ship:TH_AFT');
 check(await page.evaluate(()=>document.activeElement.id==='freeFlightPanel'),'Switch left keyboard focus on the native selector');
 const before=await state();
 await page.keyboard.down('n');
 try{await page.waitForFunction(v=>viewer.sim.freeFlight.state.closing<v-.025,before.closing,{timeout:6000});}
 finally{await page.keyboard.up('n');}
 check((await state()).elapsed>before.elapsed,'Flight clock stopped on switch');
 await page.waitForFunction(()=>viewer.sim.freeFlight.state.phase==='free',null,{timeout:60000});
 await click('hold');
 await click('navball');check(!(await state()).navball&&await instruments.isHidden(),'Navigation-ball switch did not hide instruments');
 await click('navball');check(await instruments.locator('.ffi-navigation').isVisible(),'Navigation ball did not return');
 await click('trail');check(!(await state()).trail,'Trail toggle did not change');

 const rcs=panel.locator('[data-flight-rcs-form]');
 await rcs.locator('..').locator('summary').click();
 for(const [key,value]of Object.entries({acceleration:.16,angularAcceleration:4,maxAngularRate:8})){
  await rcs.locator('[data-flight-rcs="'+key+'"]').fill(String(value));
 }
 await rcs.locator('[type=submit]').click();
 check((await state()).rcs.acceleration===.16,'RCS settings did not apply');
 await choose('ship:TH_FORWARD');check((await state()).rcs.acceleration===.08,'RCS settings leaked to the other spacecraft');
 await choose('ship:TH_AFT');check((await state()).rcs.maxAngularRate===8,'RCS settings lost on craft switch');
 await rcs.locator('..').locator('summary').click();

 const docking=panel.locator('[data-flight-docking-form]');
 await docking.locator('..').locator('summary').click();
 for(const [key,value]of Object.entries({captureLateral:.5,captureAngle:6,captureSpeed:.25,captureLateralSpeed:.08,captureAngularSpeed:.6})){
  await docking.locator('[data-flight-limit="'+key+'"]').fill(String(value));
 }
 await docking.locator('[type=submit]').click();
 check((await state()).dockingLimits.captureLateral===.5,'Docking tolerance setting did not apply');
 check(Math.abs((await state()).dockingLimits.captureAngularSpeed-.6*Math.PI/180)<1e-12,'Angular speed tolerance unit conversion is wrong');
 await docking.locator('..').locator('summary').click();
 await click('fine');check((await state()).fine,'Precision control switch did not apply');
 await instruments.locator('[data-attitude-mode=port]').click();
 check((await state()).attitudeMode==='port','Interface attitude assist did not activate');
 // Clicking an instrument must not steal the keyboard pilot controls either.
 await page.keyboard.down('s');
 try{await page.waitForFunction(()=>viewer.sim.freeFlight.state.attitudeMode==='off');}
 finally{await page.keyboard.up('s');}
 await instruments.locator('[data-attitude-mode=port]').click();
 await panel.locator('[data-flight-view=port]').click();
 check(await instruments.locator('.ffi-docking').isVisible(),'Docking camera did not show dedicated navigation');
 check((await instruments.locator('[data-check=lateral] b').textContent()).match(/≤\s*0\.5/),'HUD is not using the configured lateral tolerance');
 check((await instruments.locator('[data-check=angle] b').textContent()).match(/≤\s*6/),'HUD is not using the configured angular tolerance');
 await click('pause');await click('save');
 const record=await saved();
 check(record.session.ships.find(s=>s.id==='ship:TH_AFT').rcs.acceleration===.16,'Saved RCS missing');
 check(record.display.trail===false&&record.display.fine===true,'Display/control settings missing from save');
 check(record.session.dockingLimits.captureAngle===6,'Saved docking tolerance missing');
 if(captureDirectory)await page.screenshot({path:captureDirectory+'/v108-docking-instruments.png'});
 await click('exit');check(await instruments.isHidden(),'Instruments leaked into orbital observation');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.viewer?.sim.freeFlight,null,{timeout:60000});
 await page.locator('#openFreeFlight').click();
 await launcher.locator('[data-launch-save]').selectOption(record.id);await launcher.locator('[data-resume]').click();
 const loaded=await state();
 check(loaded.paused&&loaded.rcs.acceleration===.16&&loaded.dockingLimits.captureAngle===6&&loaded.fine&&!loaded.trail&&loaded.view==='port','Reload lost settings or camera');
 await rcs.locator('..').locator('summary').click();await click('rcs-reset');
 check((await state()).rcs.acceleration===.08&&(await state()).rcs.angularAcceleration===3,'RCS reset failed');
 await rcs.locator('..').locator('summary').click();
 await docking.locator('..').locator('summary').click();await click('docking-reset');
 check((await state()).dockingLimits.captureLateral===.3&&(await state()).dockingLimits.captureAngle===3,'Docking tolerance reset failed');
 await docking.locator('..').locator('summary').click();
 await panel.locator('[data-flight-view=external]').click();
 await choose('ship:TH_FORWARD');await choose('ship:TH_AFT');
 check((await state()).paused,'Switching craft unexpectedly resumed a paused mission');
 if(captureDirectory)await page.screenshot({path:captureDirectory+'/v108-navigation-ball.png'});
 await click('exit');
 return {saveId:record.id,selected:record.selectedId,elapsed:record.session.elapsed,rcs:record.session.ships.map(s=>({id:s.id,rcs:s.rcs})),limits:record.session.dockingLimits};
}
