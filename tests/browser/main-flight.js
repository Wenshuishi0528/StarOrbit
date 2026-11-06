// Real pointer/key events exercise ownership, inertia and reset in the product.
export async function inspectMainFlight(page,{captureDirectory=null}={}){
 const check=(value,reason)=>{if(!value)throw Error(reason);};
 const read=()=>page.evaluate(()=>viewer.sim.mainFlight.state);
 await page.waitForFunction(()=>!!window.viewer?.sim.mainFlight,null,{timeout:60000});
 if(await page.locator('#welcomeDialog').evaluate(el=>el.open))await page.locator('#skipTour').click();
 const toggle=page.locator('[data-settings-module=attitude] .settings-toggle');
 if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
 await page.locator('#attitudeNavball').check();
 const nav=page.locator('#attitudeNavballPanel'),ball=nav.locator('canvas');await nav.waitFor();
 const button=name=>nav.locator('[data-pilot="'+name+'"]');
 await page.keyboard.press('w');check(!(await read()).active,'Unfocused key started the pilot');
 const camera=await page.evaluate(()=>viewer.camera.position.toArray());
 const original=await page.evaluate(()=>JSON.stringify(viewer.sim.missions.state.pose));
 const orbit=await page.evaluate(()=>JSON.stringify(viewer.sim.data));
 await ball.click();await page.keyboard.press('t');check(!(await read()).sas,'T did not switch SAS off');
 // Even a tap shorter than one fixed physics step must supply bounded torque.
 await page.keyboard.press('w');
 await page.waitForFunction(()=>viewer.sim.mainFlight.state.angularSpeed>.05);
 await page.keyboard.down('s');
 try{await page.waitForFunction(()=>viewer.sim.mainFlight.state.angularSpeed>1.2);}
 finally{await page.keyboard.up('s');}
 const coast=await read();
 await page.waitForFunction(t=>viewer.sim.mainFlight.state.translation.elapsed>t+.8,coast.translation.elapsed);
 check(Math.abs((await read()).angularSpeed-coast.angularSpeed)<.01,'Releasing the key secretly damped inertia');
 check(JSON.stringify(await page.evaluate(()=>viewer.camera.position.toArray()))===JSON.stringify(camera),'Body controls rotated observer camera');
 await page.keyboard.press('t');
 check((await read()).angularSpeed>0,'SAS instantly erased angular velocity');
 await page.waitForFunction(()=>viewer.sim.mainFlight.state.angularSpeed<.005,null,{timeout:10000});
 // RCS off gates translation; enabling RCS does not cancel momentum.
 await page.keyboard.down('h');
 const noThrust=await read();
 try{await page.waitForFunction(t=>viewer.sim.mainFlight.state.translation.elapsed>t+.3,noThrust.translation.elapsed);}
 finally{await page.keyboard.up('h');}
 check((await read()).speed<1e-6,'RCS-off translation applied thrust');
 await page.keyboard.press('r');await page.keyboard.down('h');
 try{await page.waitForFunction(()=>viewer.sim.mainFlight.state.speed>.06);}
 finally{await page.keyboard.up('h');}
 const drifting=await read();
 await page.waitForFunction(t=>viewer.sim.mainFlight.state.translation.elapsed>t+.6,drifting.translation.elapsed);
 check((await read()).speed>.05&&(await read()).distance>drifting.distance,'SAS or release removed linear drift');
 await button('center').click();await button('brake').click();
 await page.waitForFunction(()=>viewer.sim.mainFlight.state.speed<.008,null,{timeout:10000});
 if(captureDirectory)await page.screenshot({path:captureDirectory+'/v109-main-pilot.png'});
 await button('reset').click();check(!(await read()).active,'Restore did not leave the exercise');
 check(await page.evaluate(()=>viewer.sim.api.modelRoot.position.length())<1e-9,'Restore left model displacement');
 check(await page.evaluate(()=>viewer.controls.target.length())<400,'Restore left camera at moved craft');
 check(await page.evaluate(()=>JSON.stringify(viewer.sim.missions.state.pose))===original,'Exercise overwrote saved pose');
 check(await page.evaluate(()=>JSON.stringify(viewer.sim.data))===orbit,'Exercise modified public orbit data');
 // Outside blank areas and text/number inputs both relinquish ownership.
 await page.locator('h1').click();await page.keyboard.press('s');check(!(await read()).active,'Blank-area click did not release keys');
 await ball.click();await page.keyboard.press('Escape');await page.keyboard.press('s');check(!(await read()).active,'Esc failed to release keys');
 await ball.click();await page.locator('#craftyaw').fill('12');await page.locator('#craftyaw').press('Tab');
 check(!(await read()).active,'Number input triggered flight');
 check(await page.evaluate(()=>viewer.sim.missions.state.pose.yaw)===12,'Manual slider/number edit was lost');
 await page.locator('#resetCraftPose').click();
 await ball.click();await page.keyboard.press('CapsLock');check((await read()).fine,'Caps Lock did not toggle precision');
 await page.keyboard.down('s');
 try{await page.waitForFunction(()=>viewer.sim.mainFlight.state.angularSpeed>.1);}
 finally{await page.keyboard.up('s');}
 await button('pause').click();const paused=await read();
 await page.waitForTimeout(150);check((await read()).translation.elapsed===paused.translation.elapsed,'Pause did not freeze physics');
 await button('pause').click();await page.keyboard.press('t');
 await page.keyboard.down('s');
 try{await page.waitForFunction(()=>viewer.sim.mainFlight.state.angularSpeed>.3);}
 finally{await page.keyboard.up('s');}
 await nav.locator('.an-close').click();const hidden=await read();
 await page.waitForFunction(t=>viewer.sim.mainFlight.state.translation.elapsed>t+.3,hidden.translation.elapsed);
 check((await read()).angularSpeed>.2,'Hiding the navigation ball stopped inertia');
 await page.locator('#attitudeNavball').check();await button('reset').click();
 await ball.click();await page.keyboard.press('s');await page.waitForFunction(()=>viewer.sim.mainFlight.active);
 await page.locator('#stepForward').click();await page.waitForFunction(()=>!viewer.sim.mainFlight.active);
 return {inertialRate:coast.angularSpeed,linearSpeed:drifting.speed,referencePreserved:true};
}
