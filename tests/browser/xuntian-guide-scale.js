async page=>{
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 await page.evaluate(()=>{const s=viewer.sim;s.seek(s.data.rows[Math.floor(s.data.rows.length/2)][0]);s.xuntian.open();});
 await page.waitForFunction(()=>viewer.sim.xuntian.optics&&viewer.sim.xuntian.result&&document.getElementById('xtGuideScale'));
 await page.locator('#xtMore').evaluate(el=>{el.open=true;});await page.locator('#xtNear').click();
 const scale=page.locator('#xtGuideScale');if(await scale.inputValue()!=='1')throw Error('The guide should start at its original size');
 const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const focal=page.locator('#xtFocal');
 await focal.evaluate(el=>{el.value=String(Math.round(1000*Math.log(30/110)/Math.log(.35/110)));el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>viewer.sim.xuntian.pointing.locked);await frames();
 const observation=()=>page.evaluate(()=>{
  const s=viewer.sim,scope=s.xuntian,line=s.api.scene.getObjectByName('Xuntian field of view');
  const b=line.geometry.attributes.position.array,eye=Array.from(b.slice(0,3)),tip=Array.from(b.slice(3,6));
  const f=scope.pointing,im=document.getElementById('xtCanvas'),values=im.getContext('2d').getImageData(0,0,im.width,im.height).data;
  let hash=2166136261;for(let i=0;i<values.length;i++)hash=Math.imul(hash^values[i],16777619);
  const xt=s.api.groups.freeXT;
  return {eye,length:Math.hypot(...tip.map((v,i)=>v-eye[i])),fov:f.field,forward:f.axes.forward,hash,
   v28:[0,1,2,3].every(i=>xt.getObjectByName('XT_V28_INSET_RCS_FLOOR_'+i)),visible:line.visible};
 });
 // Compose a fixed external side view with the full 2× rectangle in the
 // unobscured part of the main viewport. This changes only the test viewpoint.
 await page.evaluate(()=>{
  const {sim}=viewer,{camera,controls,stage}=sim.api,{eyeLocal:eye,localAxes:a}=sim.xuntian.optics;
  const v=x=>camera.position.clone().fromArray(x),up=v(a.up),forward=v(a.forward);
  const direction=v(a.right).multiplyScalar(-1).addScaledVector(up,.32).addScaledVector(forward,.3).normalize();
  const sx=up.clone().cross(direction).normalize(),sy=direction.clone().cross(sx),viewport=stage.getBoundingClientRect();
  const lo=Math.max(viewport.left+12,document.querySelector('aside').getBoundingClientRect().right+18),hi=Math.min(viewport.right-12,document.querySelector('#xuntianScope').getBoundingClientRect().left-18);
  const targetX=(lo+hi)/2,relativeX=(targetX-viewport.left)/viewport.width*2-1;
  const distance=700,tan=Math.tan(camera.fov*Math.PI/360),center=v(eye).addScaledVector(forward,130);
  const aim=center.addScaledVector(sx,-relativeX*tan*camera.aspect*distance).addScaledVector(sy,10);
  controls.stopMotion();controls.target.copy(aim);camera.up.copy(up);camera.position.copy(aim).addScaledVector(direction,distance);controls.update();camera.updateMatrixWorld();
 });await frames();
 const initial=await observation();
 await page.screenshot({path:'output/playwright/v101-exterior-cone-1x.png'});
 await scale.selectOption('2');await frames();const twice=await observation();
 await page.screenshot({path:'output/playwright/v101-exterior-cone-2x.png'});
 if(!initial.v28||!twice.visible||Math.abs(twice.length/initial.length-2)>.00001||
  initial.fov!==twice.fov||initial.hash!==twice.hash||JSON.stringify(initial.eye)!==JSON.stringify(twice.eye)||
  JSON.stringify(initial.forward)!==JSON.stringify(twice.forward))throw Error('Guide changed the aperture, optical camera or resolved image: '+JSON.stringify({initial,twice}));
 await scale.selectOption('0.5');await frames();const half=await observation();
 if(Math.abs(half.length/initial.length-.5)>.00001)throw Error('Half-scale guide did not shrink');
 await page.locator('#xtShowGuide').uncheck();await frames();if(await scale.isEnabled()||(await observation()).visible)throw Error('Hidden guide still active');
 await page.locator('#xtShowGuide').check();await frames();await scale.selectOption('1');
 return {fov:initial.fov,defaultLength:initial.length,doubleLength:twice.length,halfLength:half.length,eyepiecePixelHash:twice.hash,v28:initial.v28};
}
