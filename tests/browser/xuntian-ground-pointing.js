async page=>{
 const check=(v,msg)=>{if(!v)throw Error(msg);},dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const initial=Date.UTC(2026,10,5,5,44);
 await page.setViewportSize({width:1240,height:830});
 await page.waitForFunction(()=>window.viewer?.sim?.initialized&&viewer.sim.xuntian,null,{timeout:90000});
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 await page.evaluate(t=>{const s=viewer.sim;s.seek(t);s.update(performance.now());s.xuntian.open();},initial);
 const canvas=page.locator('#xtCanvas'),search=page.locator('#xtSearch'),pin=page.locator('#xtPin');
 const state=()=>page.evaluate(()=>{
  const s=viewer.sim,x=s.xuntian,p=x.pointing,xt=s.api.groups.freeXT,m=xt.matrixWorld.elements,
   bodyForward=[m[0],m[1],m[2]],bodyUp=[m[8],m[9],m[10]],dot=(a,b)=>a.reduce((v,e,i)=>v+e*b[i],0)/Math.hypot(...a);
  return {time:s.time,p,center:x.result?.center,bodyForward:dot(bodyForward,x.optics.localAxes.forward),bodyUp:dot(bodyUp,x.optics.localAxes.up),frame:document.querySelector('#xtCanvas').dataset.xuntianFrame};
 });
 const seek=t=>page.evaluate(ts=>{const s=viewer.sim;s.seek(ts);s.update(performance.now());},t);
 const settle=mode=>page.waitForFunction(m=>viewer.sim.xuntian.pointing.mode===m&&viewer.sim.xuntian.pointing.locked,mode,{timeout:45000});
 const ground=(lat,lon)=>page.waitForFunction(([a,b])=>{const c=viewer.sim.xuntian.result?.center;return c?.kind==='earth'&&Math.abs(c.latitude-a)<.015&&Math.abs(c.longitude-b)<.015;},[lat,lon],{timeout:45000});
 async function photo(tag){
  await page.locator('#xtPhotoWidth').selectOption('1440');const pending=page.waitForEvent('download',{timeout:90000});
  await page.locator('#xtCapture').click();const d=await pending;check(d.suggestedFilename().includes('city_beijing'),'Unexpected target in city PNG');
  await d.saveAs('output/playwright/xuntian101-beijing-'+tag+'.png');
 }
 await page.locator('#xtRollReset').click();await search.fill('北京市');const result=page.locator('#xtResults [data-target="city:beijing"]');
 await result.waitFor();await result.click();await settle('city');await ground(39.9042,116.4074);const first=await state();
 check(first.time===initial&&first.p.ground.visible&&first.p.pinned==='ground','Visible Beijing failed to track');
 await photo('north');await page.locator('#xtRoll').fill('90');await page.waitForFunction(()=>viewer.sim.xuntian.pointing.roll===90);
 await ground(39.9042,116.4074);const rotated=await state();
 check(dot(first.p.axes.forward,rotated.p.axes.forward)>.9999998&&dot(first.p.axes.up,rotated.p.axes.right)>.9999,'Roll changed boresight or did not rotate the eyepiece');
 check(rotated.bodyForward>.999999&&rotated.bodyUp>.999999,'Model body and detector roll disagree');await photo('clockwise');
 await seek(initial+50000);await settle('city');await ground(39.9042,116.4074);const moved=await state();
 check(dot(first.p.axes.forward,moved.p.axes.forward)<.999&&moved.p.roll===90,'Ground track stayed inertial');
 await seek(initial+46*60000);await page.waitForFunction(()=>viewer.sim.xuntian.pointing.ground?.visible===false);await settle('city');const far=await state();
 check(far.time===initial+46*60000&&far.p.target==='city:beijing'&&await page.locator('#xtStatus').getAttribute('data-blocked')==='true','Occluded city bypassed Earth or changed the clock');
 await seek(initial);await settle('city');await ground(39.9042,116.4074);await page.locator('#xtRollReset').click();
 await pin.click();check((await state()).p.pinned===null,'Release kept the earth anchor');
 await page.locator('#xtGroundQuick').click();await settle('nadir');await canvas.focus();await page.keyboard.press('ArrowRight');
 await pin.click();await settle('ground-pin');const manual=await state();await seek(initial+30000);await settle('ground-pin');await ground(manual.p.ground.latitude,manual.p.ground.longitude);
 await pin.click();check(!(await state()).p.pinned,'Pin button did not unlock');
 await page.locator('#xtRecommend').click();await page.waitForFunction(()=>viewer.sim.xuntian.pointing.locked&&viewer.sim.xuntian.result?.center.kind==='sky',{},{timeout:45000});
 await canvas.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('e');await pin.click();
 await settle('sky-pin');const stars=await state();await seek(initial+120000);const inertial=await state();
 check(dot(stars.p.axes.forward,inertial.p.axes.forward)>.999999999&&stars.p.roll>0&&stars.p.roll===inertial.p.roll,'Inertial lock changed direction or roll over time '+JSON.stringify({stars:stars.p,inertial:inertial.p}));
 await canvas.focus();await page.keyboard.press('e');check((await state()).p.pinned==='sky','Rolling released the sky lock');
 await search.fill('HIP 91262');await search.press('Enter');await settle('sky');check((await state()).p.target==='hip:91262','City catalogue displaced HIP lookup');
 // At release, the whole rolled detector must keep its current composition.
 // Afterwards the same three axes must be constant in the local orbital frame.
 await page.locator('#xtRecommend').click();await settle('sky');await page.locator('#xtRoll').fill('37');
 const lockedPose=await state();await pin.click();let free=await state();
 check(free.p.mode==='free'&&!free.p.pinned&&['right','up','forward'].every(k=>dot(free.p.axes[k],lockedPose.p.axes[k])>1-1e-12),'Releasing an automatic target jumped or captured the sky');
 const reference=()=>page.evaluate(()=>{
  const sim=viewer.sim,q=sim.current,p=sim.xuntian.pointing,a=p.axes,dot=(l,r)=>l.reduce((n,x,i)=>n+x*r[i],0),unit=l=>l.map(v=>v/Math.hypot(...l));
  const r=unit(q.position),along=unit(q.velocity.map((x,i)=>x-r[i]*dot(q.velocity,r))),normal=[r[1]*along[2]-r[2]*along[1],r[2]*along[0]-r[0]*along[2],r[0]*along[1]-r[1]*along[0]];
  const c=document.createElement('canvas');c.width=120;c.height=75;const ctx=c.getContext('2d');ctx.drawImage(document.querySelector('#xtCanvas'),0,0,c.width,c.height);
  return {axes:Object.values(a).map(axis=>[along,normal,r].map(b=>dot(b,axis))),inertial:a.forward,pixels:Array.from(ctx.getImageData(0,0,c.width,c.height).data.filter((v,i)=>i%4===0)),frame:Number(document.querySelector('#xtCanvas').dataset.xuntianFrame),roll:p.roll};
 });
 await page.waitForTimeout(450);const zero=await reference();await page.waitForTimeout(350);const paused=await reference();
 check(dot(zero.inertial,paused.inertial)>1-1e-12,'Paused local frame drifted');
 await seek(free.time+90000);
 await page.waitForFunction(old=>Number(document.querySelector('#xtCanvas').dataset.xuntianFrame)>old,paused.frame,{timeout:45000});const shifted=await reference();
 const movedAngle=Math.acos(Math.max(-1,Math.min(1,dot(paused.inertial,shifted.inertial))))*180/Math.PI;
 const pixelDifference=shifted.pixels.reduce((n,x,i)=>n+Math.abs(x-paused.pixels[i]),0)/shifted.pixels.length;
 check(movedAngle>.4&&pixelDifference>1,'The free eyepiece still held the stars '+JSON.stringify({movedAngle,pixelDifference}));
 check(paused.roll===shifted.roll&&paused.axes.every((v,i)=>v.every((x,j)=>Math.abs(x-shifted.axes[i][j])<1e-7)),'Screen roll or local attitude slipped in free mode');
 await pin.click();const newPin=await state();check(newPin.p.mode==='sky-pin','Pin button did not re-pin the moving sky');
 await seek(free.time+180000);const held=await state();check(dot(held.p.axes.forward,newPin.p.axes.forward)>1-1e-11,'Inertial re-pin kept coasting with orbit');
 await pin.click();check((await state()).p.mode==='free','Pin button did not return to orbital motion');
 await page.locator('#xtGroundQuick').click();await settle('nadir');await page.locator('#xtPinHere').click();await settle('ground-pin');
 await page.setViewportSize({width:390,height:844});await page.locator('#xtExpand').click();const width=await page.locator('#xuntianScope').evaluate(e=>[e.clientWidth,e.scrollWidth]);
 check(width[1]<=width[0]+2,'Mobile pointing scope overflowed');
 check(!errors.length,errors.join('\n'));return {first:first.center,earthTrack:moved.center,below:far.p.ground.visible,manual:manual.p.ground,skyDirection:stars.p.axes.forward,roll:rotated.p.roll,movedAngle,pixelDifference,body:rotated.bodyUp,mobile:width};
}
