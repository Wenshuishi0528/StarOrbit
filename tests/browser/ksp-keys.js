// Use real focused keyboard events at the two remaining legacy lab surfaces.
export async function inspectLabKspKeys(page){
 const check=(value,message)=>{if(!value)throw Error(message);};
 await page.waitForFunction(()=>window.viewer?.sim.initialized,null,{timeout:90000});
 if(await page.locator('#welcomeDialog').evaluate(el=>el.open))await page.locator('#skipTour').click();
 await page.locator('#languageZh').click();
 await page.evaluate(()=>{window.keyTestDock=viewer.sim.flightLab.open('docking');});
 const dock=page.locator('#dockingPanel'),canvas=dock.locator('canvas');
 await dock.locator('[data-role=start]').click();
 const bindings={w:'pitchD',s:'pitchU',a:'yawL',d:'yawR',q:'rollL',e:'rollR',h:'f',n:'b',j:'l',l:'r',i:'d',k:'u'};
 for(const [key,action] of Object.entries(bindings)){
  await canvas.focus();await page.keyboard.down(key);
  try{check(await dock.locator('[data-control="'+action+'"]').evaluate(e=>e.classList.contains('held')),'Wrong docking key: '+key);}
  finally{await page.keyboard.up(key);}
  check(await dock.locator('.held').count()===0,'Key release retained thrust: '+key);
 }
 // Both events happen before the browser can draw another frame. The real
 // training clock must consume one torque pulse rather than miss the tap.
 await page.evaluate(()=>{
  const training=keyTestDock.simulation,previous=training.onStep;window.keyTestOriginalStep=previous;window.keyTestSteps=[];
  training.onStep=(state,context)=>{keyTestSteps.push(context.command.rotation[1]);previous?.(state,context);};
  const canvas=document.querySelector('#dockingPanel canvas');canvas.focus();
  for(const type of ['keydown','keyup'])canvas.dispatchEvent(new KeyboardEvent(type,{code:'KeyW',key:'w',bubbles:true,cancelable:true}));
 });
 await page.waitForFunction(()=>keyTestSteps.length>=4);
 check(await page.evaluate(()=>keyTestSteps.filter(pitch=>pitch<0).length===1),'A short docking tap was lost or repeated over multiple physics steps');
 const fine=dock.locator('[data-role=fine]'),damping=dock.locator('[data-role=damping]');
 const originalFine=await fine.isChecked(),originalDamping=await damping.isChecked();
 await canvas.press('CapsLock');check(await fine.isChecked()!==originalFine,'Caps Lock did not change precision');
 await canvas.press('t');check(await damping.isChecked()!==originalDamping,'T did not toggle training SAS');
 await page.keyboard.down('h');await dock.locator('[data-role=contact-speed]').focus();
 check(await dock.locator('.held').count()===0,'Focusing a field retained docking thrust');await page.keyboard.up('h');
 await page.locator('#balconyTab').click();
 const before=await page.evaluate(()=>keyTestDock.state.time);
 await page.waitForTimeout(120);
 check(await page.evaluate(time=>keyTestDock.paused&&keyTestDock.state.time===time,before),'Leaving the docking tab did not pause it');
 const balcony=page.locator('#balconyPanel'),sky=balcony.locator('[data-id=sky]');
 if(!await sky.isVisible()){
  const example=balcony.locator('[data-id=beijing]');
  if(!await example.isVisible())await balcony.locator('.bal-config').first().locator('summary').click();
  await example.click();await sky.waitFor({state:'visible'});
 }
 const view=name=>balcony.locator('[data-view="'+name+'"]');
 await view('hemisphere').click();await view('zenith').click();
 const bearing=()=>balcony.locator('.bal-view-bearing').textContent();
 check(/90°$/.test(await bearing()),'Balcony did not start at zenith');
 await sky.focus();await sky.press('w');check(/85°$/.test(await bearing()),'W did not look down in the hemisphere');
 await sky.press('s');check(/90°$/.test(await bearing()),'S did not look up in the hemisphere');
 await view('sphere').click();await sky.focus();
 await sky.press('w');check(/-5°$/.test(await bearing()),'W did not look below the horizon in globe mode');
 await sky.press('s');check(/0°$/.test(await bearing()),'S did not restore the horizon');
 const neutral=await bearing();await sky.press('a');check(await bearing()!==neutral,'A did not change the sky azimuth');
 await sky.press('d');check(await bearing()===neutral,'D did not reverse A');
 await page.locator('#closeFlightLab').click();await page.evaluate(()=>{keyTestDock.simulation.onStep=keyTestOriginalStep;delete window.keyTestDock;delete window.keyTestSteps;delete window.keyTestOriginalStep;});
 return {dockingKeys:Object.keys(bindings).join(''),singleStepTap:true,precisionAndSas:true,focusRelease:true,balconyPitchAndYaw:true};
}
