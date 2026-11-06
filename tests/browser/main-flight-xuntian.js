// Real UI actions check ownership between the main navball and telescope finder.
export async function inspectMainFlightXuntian(page){
 const check=(value,message)=>{if(!value)throw Error(message);};
 const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 const quaternionDistance=(a,b)=>Math.min(distance(a,b),distance(a,b.map(v=>-v)));
 const read=()=>page.evaluate(()=>{
  const sim=viewer.sim,navigation=sim.mainFlight.navigation,optics=sim.xuntian.optics;
  return {state:sim.mainFlight.state,target:sim.mainFlight.targetId,active:sim.mainFlight.active,
   station:sim.missions.bodyRoot().quaternion.toArray(),origin:sim.api.modelRoot.position.toArray(),
   axes:optics?.axes,offset:sim.xuntian.formation.getOffset(),pointing:sim.xuntian.pointing,
   navigation:navigation&&{quaternion:navigation.quaternion,basis:navigation.q.basis},
   savedPose:sim.missions.state.pose};
 });
 const verifyAxes=sample=>{
  const [x,y,z,w]=sample.navigation.quaternion,basis=sample.navigation.basis;
  const local=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w)];
  const forward=[0,1,2].map(i=>local.reduce((sum,v,j)=>sum+v*basis[j][i],0));
  check(distance(forward,sample.axes.forward)<1e-7,'Navball forward axis differs from the actual optical axis');
 };
 await page.waitForFunction(()=>!!window.viewer?.sim.initialized&&!!viewer.sim.mainFlight,null,{timeout:90000});
 if(await page.locator('#welcomeDialog').evaluate(el=>el.open))await page.locator('#skipTour').click();
 const section=page.locator('[data-settings-module=attitude] .settings-toggle');
 if(await section.getAttribute('aria-expanded')==='false')await section.click();
 await page.locator('#attitudeNavball').check();
 const nav=page.locator('#attitudeNavballPanel'),ball=nav.locator('canvas'),target=nav.locator('.an-craft');
 const button=name=>nav.locator('[data-pilot="'+name+'"]');
 await page.locator('#openXuntianMap').click();
 await page.waitForFunction(()=>viewer.sim.mainFlight.targetId==='xuntian'&&document.querySelector('#attitudeNavballPanel .an-craft').value==='xuntian');
 check(await target.inputValue()==='xuntian','Opening the finder did not select Xuntian in the navball');
 const initial=await read(),savedPose=JSON.stringify(initial.savedPose);
 await ball.click();if((await read()).state.sas)await page.keyboard.press('t');
 await page.keyboard.down('s');
 try{await page.waitForFunction(()=>viewer.sim.mainFlight.state.angularSpeed>.8);}
 finally{await page.keyboard.up('s');}
 const spinning=await read();
 await page.waitForFunction(t=>viewer.sim.mainFlight.state.translation.elapsed>t+.4,spinning.state.translation.elapsed);
 const rotated=await read();verifyAxes(rotated);
 check(distance(rotated.axes.forward,initial.axes.forward)>.002,'Navball input did not rotate the telescope optics');
 check(quaternionDistance(rotated.station,initial.station)<1e-10,'Telescope rotation also rotated the station');
 check(distance(rotated.origin,initial.origin)<1e-10,'Telescope rotation translated the station');
 await page.locator('#xtSearch').fill('HIP 91262');
 await page.locator('#xtResults [data-target="hip:91262"]').click();
 await page.waitForFunction(()=>viewer.sim.xuntian.pointing.target==='hip:91262'&&viewer.sim.xuntian.pointing.locked,null,{timeout:45000});
 const aimed=await read();verifyAxes(aimed);
 check(aimed.state.phase==='external','Finder search failed to relinquish navball attitude ownership');
 const finder=page.locator('#xtCanvas'),box=await finder.boundingBox();
 check(!!box,'Finder is not visible');
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
 await page.mouse.move(box.x+box.width*.6,box.y+box.height*.56,{steps:8});await page.mouse.up();
 await page.waitForFunction(()=>viewer.sim.xuntian.pointing.mode==='free');
 const dragged=await read();verifyAxes(dragged);
 check(distance(dragged.axes.forward,aimed.axes.forward)>.002,'Dragging the finder failed to update its actual direction');
 await ball.click();if(!(await read()).state.rcs)await page.keyboard.press('r');
 await page.keyboard.down('h');
 try{await page.waitForFunction(()=>viewer.sim.mainFlight.state.speed>.04);}
 finally{await page.keyboard.up('h');}
 const moving=await read();
 await page.waitForFunction(t=>viewer.sim.mainFlight.state.translation.elapsed>t+.4,moving.state.translation.elapsed);
 const moved=await read();
 check(distance(moved.offset,dragged.offset)>.01,'RCS did not move Xuntian');
 check(distance(moved.origin,initial.origin)<1e-10,'Xuntian RCS translated the station');
 check(JSON.stringify(moved.savedPose)===savedPose,'Finder control overwrote the saved station pose');
 // Selecting a second craft transfers input; the telescope keeps its momentum.
 await ball.click();await page.keyboard.down('s');
 try{await page.waitForFunction(()=>viewer.sim.mainFlight.state.angularSpeed>.8);}
 finally{await page.keyboard.up('s');}
 await target.selectOption('mission');
 const beforeStation=await read();await ball.click();await page.keyboard.press('s');
 await page.waitForFunction(()=>viewer.sim.mainFlight.state.active&&viewer.sim.mainFlight.state.translation.elapsed>.4);
 const stationFlying=await read();
 check(distance(stationFlying.axes.forward,beforeStation.axes.forward)>.001,'Switching to the station stopped telescope inertia');
 check(quaternionDistance(stationFlying.station,beforeStation.station)>1e-7,'Station input was still routed to Xuntian');
 await target.selectOption('xuntian');
 await page.locator('#craftyaw').fill('17');
 await page.waitForTimeout(220);
 check(await page.locator('#craftyaw').inputValue()==='17','Station flight overwrote the focused Xuntian pose input');
 await page.locator('#craftyaw').press('Tab');verifyAxes(await read());
 check(JSON.stringify((await read()).savedPose)===savedPose,'Editing Xuntian pose changed the saved station pose');
 await button('reset').click();await target.selectOption('mission');await button('reset').click();
 check(!(await read()).active,'Resetting both objects left a flight state active');
 check(distance((await read()).origin,initial.origin)<1e-10,'Reset left a station position offset');
 // Hiding the model invalidates the selected telescope instead of leaving dead controls.
 await target.selectOption('xuntian');await ball.click();await page.keyboard.press('s');
 const assembly=page.locator('[data-settings-module=assembly] .settings-toggle');
 if(await assembly.getAttribute('aria-expanded')==='false')await assembly.click();
 await page.locator('#showXT').uncheck();
 await page.waitForFunction(()=>viewer.sim.mainFlight.targetId==='mission'&&!viewer.sim.mainFlight.active);
 return {telescopeRotation:true,searchHandoff:true,dragHandoff:true,independentTranslation:true,
  independentCoasting:true,manualPose:true,invalidTargetRecovery:true};
}
