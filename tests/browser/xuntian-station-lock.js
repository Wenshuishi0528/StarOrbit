async page=>{
 await page.setViewportSize({width:1240,height:830});await page.waitForFunction(()=>window.viewer?.sim?.initialized&&viewer.sim.xuntian,null,{timeout:90000});
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
const sim=()=>page.evaluate(()=>({p:viewer.sim.xuntian.pointing,center:viewer.sim.xuntian.result?.center}));
 await page.evaluate(()=>{const s=viewer.sim;s.seek(Date.UTC(2026,10,5,5,44));s.update(performance.now());s.xuntian.open();});
 const more=page.locator('#xtMore');if(!await more.evaluate(e=>e.open))await more.locator('> summary').click();
 await page.locator('[data-xt-mode=station]').click();
 await page.waitForFunction(()=>viewer.sim.xuntian.pointing.mode==='station'&&viewer.sim.xuntian.pointing.locked);
 await page.waitForTimeout(200);const first=await sim();
 if(first.center?.kind!=='station'){
  const delta=await page.evaluate(()=>{
   const s=viewer.sim,x=s.xuntian,p=x.pointing,q=s.current,frame=x.optics,records=s.tracker.occluders['TH'].records;
   const bySize=records.filter(r=>r.mesh).sort((a,b)=>{const val=r=>{const v=r.box.getSize(r.mesh.position.clone());return v.x*v.y*v.z;};return val(b)-val(a);});
   const center=bySize[0].box.getCenter(bySize[0].mesh.position.clone());
   const local=center.toArray().map((v,i)=>v-frame.eyeLocal[i]),n=Math.hypot(...local),dots=dir=>dir.reduce((sum,v,i)=>sum+v*local[i],0)/n;
   const l=frame.localAxes,angleX=Math.atan2(dots(l.right),dots(l.forward))*180/Math.PI,angleY=Math.asin(dots(l.up))*180/Math.PI,c=document.querySelector('#xtCanvas');
   return [-angleX*c.clientHeight/p.field,angleY*c.clientHeight/p.field];
  });
  const c=page.locator('#xtCanvas');await c.scrollIntoViewIfNeeded();const b=await c.boundingBox(),x=b.x+b.width*.5,y=b.y+b.height*.5;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+delta[0],y+delta[1]);await page.mouse.up();
  await page.waitForFunction(()=>viewer.sim.xuntian.result?.center.kind==='station',null,{timeout:15000});
  await page.locator('#xtPin').click();
 }else await page.locator('#xtPinHere').click();
 await page.waitForFunction(()=>viewer.sim.xuntian.pointing.mode==='station-pin',null,{timeout:25000});const locked=await sim();
 await page.evaluate(()=>{const s=viewer.sim;s.seek(s.time+45000);s.update(performance.now());});
 await page.waitForFunction(()=>viewer.sim.xuntian.pointing.locked&&viewer.sim.xuntian.result?.center?.kind==='station');
 const moved=await sim(),id=moved.center.moduleId;
 let freed;
 try{
  await page.evaluate(id=>{const s=viewer.sim;s.api.groups[id].visible=false;s.update(performance.now());},id);
  await page.waitForFunction(()=>viewer.sim.xuntian.pointing.mode==='free');freed=await page.locator('#xtTrackingInfo').innerText();
 }finally{await page.evaluate(id=>{const s=viewer.sim;s.api.groups[id].visible=true;s.update(performance.now());},id);}
 if(locked.center?.kind!=='station'||moved.center?.moduleId!==locked.center?.moduleId||!freed)throw Error('Physical station pin did not track and release');
 return {baseline:first.center?.kind,locked:locked.center,moved:moved.center,freed};
}
