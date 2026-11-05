// Measure the real GLB mirror barrel independently of the instrument's stored pose.
// The two named meshes sit forward/back along its physically offset optical tube.
export async function checkXuntianBodySlew(page,{beforeFix=false,proofDirectory,onRecord}={}){
 const check=(ok,why)=>{if(!ok)throw Error(why);};
 const angle=(a,b)=>Math.atan2(Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]),a.reduce((s,x,i)=>s+x*b[i],0))*180/Math.PI;
 const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const snapshot=()=>page.evaluate(()=>{
  const {sim,groups,camera}=viewer,scope=sim.xuntian,xt=groups.freeXT,body=groups.TH,q=sim.current,canvas=sim.api.renderer.domElement;
  const instrument=scope.pointing.axes.forward,aperture=xt.getObjectByName('XT_offset_aperture_edge'),back=xt.getObjectByName('XT_offset_deep_optical_recess');
  const meshCenter=root=>{
   let mesh=root;if(!root.isMesh)root.traverse(o=>{if(!mesh.isMesh&&o.isMesh)mesh=o;});
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
   return mesh.localToWorld(mesh.geometry.boundingBox.getCenter(mesh.position.clone()));
  };
  const pupil=meshCenter(aperture),deep=meshCenter(back),local=pupil.clone().sub(deep).normalize().toArray();
  const axis=[0,1,2].map(j=>local.reduce((s,v,i)=>s+v*q.basis[i][j],0));
  const pixel=v=>{const p=v.clone().project(camera);return [(p.x+1)*canvas.clientWidth/2,(1-p.y)*canvas.clientHeight/2];};
  const lid=xt.getObjectByName('XT_open_aperture_lid'),hint=lid?meshCenter(lid):deep;
  return {time:q.t,paused:sim.paused,axis,local,command:instrument,pupil:pupil.toArray(),pixels:pixel(pupil),lidPixels:pixel(hint),
   camera:camera.position.toArray().concat(camera.quaternion.toArray()),station:body.matrixWorld.toArray(),field:scope.pointing.field,target:scope.pointing.target};
 });
 const records=[],record=async(label,a)=>{
  const b=await snapshot(),error=angle(b.axis,b.command);
  check(error<.001,'Actual GLB axis differs from eyepiece at '+label+' by '+error+'°');
  const data={label,alignmentErrorDeg:error,time:b.time,field:b.field};
  if(a)Object.assign(data,{turnDeg:angle(a.axis,b.axis),localTurnDeg:angle(a.local,b.local),aperturePixels:distance(a.pixels,b.pixels),lidPixels:distance(a.lidPixels,b.lidPixels),cameraMotion:distance(a.camera,b.camera)});
  records.push(data);onRecord?.(data);return b;
 };
 await page.waitForFunction(()=>window.viewer?.sim.xuntian);const welcome=page.locator('#welcomeDialog');
 if(await welcome.evaluate(e=>e.open))await page.locator('#skipTour').click();
 await page.locator('#languageZh').click();if(!await page.locator('#xuntianScope').isVisible())await page.locator('#openXuntianMap').click();
 await page.waitForFunction(()=>viewer.sim.xuntian.active&&viewer.sim.xuntian.optics);
 const canvas=page.locator('#xtCanvas'),start=await page.evaluate(()=>{const s=viewer.sim,p=s.data.rows[Math.floor(s.data.rows.length/2)][0];s.seek(p);return p;});
 await frames();
 const goTo=(id,query)=>page.locator('#xtSearch').fill(query).then(()=>page.locator('#xtResults [data-target="'+id+'"]').click()).then(()=>page.waitForFunction(id=>{const p=viewer.sim.xuntian.pointing;return p.locked&&p.target===id;},id,{timeout:35000}));
 const first=await record('initial');await goTo('hip:91262','织女星');const vega=await record('Vega search',first);
 check(records.at(-1).turnDeg>1,'Search never rotated the actual aperture');
 const rr=279.2347348*Math.PI/180,dd=38.78368896*Math.PI/180,reference=[Math.cos(dd)*Math.cos(rr),Math.cos(dd)*Math.sin(rr),Math.sin(dd)];
 check(angle(vega.axis,reference)<.002,'Vega GLB alignment is not at its J2000 catalogue position');
 await page.locator('#xtFocal').evaluate(el=>{el.value=String(Math.round(1000*Math.log(38/110)/Math.log(.35/110)));el.dispatchEvent(new Event('input',{bubbles:true}));});
 let previous=await record('wide ready');
 if(!beforeFix){
  await page.locator('#xtMore').evaluate(el=>{el.open=true;});
  await page.locator('#xtNear').click();
  await frames();previous=await record('external telescope close-up');
 }
 await canvas.scrollIntoViewIfNeeded();let box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
 if(proofDirectory)await page.screenshot({path:proofDirectory+'/before-steer.png'});
 await page.mouse.move(cx-50,cy+15);await page.mouse.down();await page.mouse.move(cx+65,cy+38,{steps:7});await page.mouse.up();await frames();
 let now=await record('paused eyepiece drag',previous);let item=records.at(-1);
 check(item.turnDeg>4,'Wide-field drag did not rotate the actual telescope');check(item.cameraMotion<1e-6,'Eyepiece drag moved the exterior camera');check(now.paused&&now.time===start,'Eyepiece drag advanced simulation time');
 if(!beforeFix)check(Math.max(item.aperturePixels,item.lidPixels)>8,'Real mirror/lid motion is too small to distinguish in close-up');
 if(proofDirectory)await page.screenshot({path:proofDirectory+'/after-steer.png'});
 previous=now;await canvas.focus();
 await canvas.evaluate(el=>{for(const type of ['keydown','keyup'])el.dispatchEvent(new KeyboardEvent(type,{code:'KeyD',key:'d',bubbles:true}));});await frames();
 now=await record('single between-frame D tap',previous);if(!beforeFix)check(records.at(-1).turnDeg>.005,'A complete short key press was dropped');
 previous=now;await page.keyboard.down('w');await page.waitForFunction(old=>{const v=viewer.sim.xuntian.pointing.axes.forward;return v.reduce((s,x,i)=>s+x*old[i],0)<Math.cos(.6*Math.PI/180);},previous.command,{timeout:15000});await page.keyboard.up('w');await frames();
 now=await record('held W',previous);check(records.at(-1).turnDeg>.5,'Held WASD never moved the actual telescope');
 const retime=start+20*60000;await page.evaluate(t=>viewer.sim.seek(t),retime);await page.waitForFunction(t=>viewer.sim.current.t===t,retime);await frames();
 previous=now;now=await record('time jump',previous);item=records.at(-1);
 check(item.turnDeg<.001&&item.localTurnDeg>.3,'The physical telescope did not hold the inertial field across an advancing orbit');
 check(now.time===retime,'Time jump did not reach the chosen epoch');
 return records;
}
