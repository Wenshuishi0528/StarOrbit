async page=>{
  await page.waitForFunction(()=>window.viewer?.sim.initialized);
  if(await page.locator('#welcomeDialog').evaluate(el=>el.open))await page.locator('#skipTour').click();
  await page.evaluate(()=>viewer.sim.flightLab.open('exposure'));
  const root=page.locator('#exposurePanel'),photo=root.locator('[data-exposure=photo]'),free=root.locator('[data-exposure=free]');
  const click=key=>root.locator('[data-exposure='+key+']').click();
  const complete=kind=>page.waitForFunction(kind=>{
    const c=document.querySelector('#exposurePanel [data-exposure=photo]'),p=document.querySelector('#exposurePanel [data-exposure=progress]');
    return c.dataset.result===kind&&c.dataset.quality==='full'&&p.hidden;
  },kind,{timeout:120000});
  const pose=()=>root.locator('[data-camera]').evaluateAll(sliders=>Object.fromEntries(sliders.map(s=>[s.dataset.camera,+s.value])));
  const verify=(ok,message)=>{if(!ok)throw Error(message);};
  const shoot=async()=>{await click('viewfinder');await complete('single');};
  const point=async()=>{await photo.scrollIntoViewIfNeeded();const b=await photo.boundingBox();return {x:b.x+b.width*.53,y:b.y+b.height*.48};};
  const press=async(key,ms=210)=>{await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);};
  await page.waitForFunction(()=>!!document.querySelector('#exposurePanel [data-exposure=time]')?.value);
  verify(!await free.isChecked(),'free mode must start disabled');
  const original=await pose(),p=await point();await page.mouse.click(p.x,p.y);await press('w',90);
  verify(JSON.stringify(await pose())===JSON.stringify(original),'unchecked canvas consumed keys');
  await free.check();verify((await photo.getAttribute('data-free-state'))==='ready','checking the switch captured the keyboard prematurely');
  await press('d',90);verify(JSON.stringify(await pose())===JSON.stringify(original),'uncaptured switch consumed keys');
  const enter=await point();await page.mouse.move(enter.x,enter.y);await page.mouse.down();await page.mouse.move(enter.x+55,enter.y-25,{steps:4});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('#exposurePanel [data-exposure=photo]').dataset.freeState==='active');
  const dragged=await pose();verify(Math.abs(dragged.azimuth-original.azimuth)>1&&dragged.pitch>original.pitch,'first press-and-drag failed');
  await page.keyboard.down('w');await page.waitForTimeout(170);const middle=await pose();await page.waitForTimeout(150);const later=await pose();await page.keyboard.up('w');
  verify(middle.pitch>dragged.pitch&&later.pitch>middle.pitch,'held key did not move smoothly over consecutive frames');
  await press('s');const lowered=await pose();verify(lowered.pitch<later.pitch,'S did not tilt down');
  await press('a');const left=await pose();await press('d');const right=await pose();verify(left.azimuth>lowered.azimuth&&right.azimuth<left.azimuth,'A/D did not look left/right');
  await press('e');const rolled=await pose();await press('q');const unrolled=await pose();verify(rolled.roll>right.roll+2&&unrolled.roll<rolled.roll-2,'Q/E did not roll');
  const v=s=>[s.x,s.y,s.z],distance=(a,b)=>Math.hypot(...v(a).map((n,i)=>n-v(b)[i]));
  const along=(a,b,c)=>v(a).reduce((sum,x,i)=>sum+(v(b)[i]-x)*(v(c)[i]-v(b)[i]),0);
  await press('r');const advance=await pose();await press('f');const retreat=await pose();
  verify(distance(unrolled,advance)>.25&&along(unrolled,advance,retreat)<0,'R/F motion not opposite');
  await press('Shift');const rise=await pose();await press('Control');const fall=await pose();
  verify(distance(retreat,rise)>.25&&along(retreat,rise,fall)<0,'Shift/Ctrl motion not opposite');
  await page.keyboard.press('Escape');verify(await page.locator('#flightLab').evaluate(el=>el.open)&&await photo.getAttribute('data-free-state')==='ready','first Escape closed the lab or retained controls');
  const idle=await pose();await press('w',90);verify(JSON.stringify(idle)===JSON.stringify(await pose()),'released controls still consumed W');
  const focusPoint=await point();await page.mouse.click(focusPoint.x,focusPoint.y);
  await root.locator('[data-exposure=time]').focus();
  verify(await photo.getAttribute('data-free-state')==='ready','a focused input retained free capture');
  await page.mouse.click(focusPoint.x,focusPoint.y);
  const shortcut=await photo.evaluate(c=>c.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',key:'f',ctrlKey:true,cancelable:true,bubbles:true})));
  verify(shortcut&&await photo.getAttribute('data-free-state')==='ready','Ctrl+F browser shortcut was consumed');
  await page.mouse.click(focusPoint.x,focusPoint.y);await page.keyboard.down('w');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const hidden=await pose();await page.waitForTimeout(120);await page.keyboard.up('w');
  verify(await photo.getAttribute('data-free-state')==='ready'&&JSON.stringify(hidden)===JSON.stringify(await pose()),'background page retained held keys');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await click('reset-camera');await shoot();
  // A +90° roll turns the same optical image counterclockwise about its centre.
  await photo.evaluate(c=>{c.baseline=new Uint8ClampedArray(c.getContext('2d').getImageData(0,0,c.width,c.height).data);});
  const details=root.locator('details');if(!await details.evaluate(e=>e.open))await details.locator('summary').click();
  await root.locator('[data-camera=roll]').evaluate(e=>{e.value=90;e.dispatchEvent(new Event('input',{bubbles:true}));});await shoot();
  const diff=await photo.evaluate(c=>{
    const now=c.getContext('2d').getImageData(0,0,c.width,c.height).data,old=c.baseline,cx=(c.width-1)/2,cy=(c.height-1)/2,side=Math.floor(c.height*.42);
    let rotated=0,unrotated=0,n=0;for(let y=Math.ceil(cy-side);y<cy+side;y+=3)for(let x=Math.ceil(cx-side);x<cx+side;x+=3){
      const i=(y*c.width+x)*4,j=(Math.round(cy+x-cx)*c.width+Math.round(cx+cy-y))*4;
      for(let k=0;k<3;k++){rotated+=Math.abs(now[i+k]-old[j+k]);unrotated+=Math.abs(now[i+k]-old[i+k]);n++;}
    }delete c.baseline;return {rotated:rotated/n,unrotated:unrotated/n};
  });
  verify(diff.rotated<diff.unrotated*.6,'actual viewfinder failed 90-degree optical roll: '+JSON.stringify(diff));
  await click('reset-camera');await shoot();if(await details.evaluate(e=>e.open))await details.locator('summary').click();
  const frame=await point();await page.mouse.click(frame.x,frame.y);await press('e',130);await press('r',150);
  await page.waitForFunction(()=>{const c=document.querySelector('#exposurePanel [data-exposure=photo]');return c.dataset.quality==='full'&&c.dataset.freeState==='active';});
  await root.evaluate(panel=>{
    const top=panel.querySelector('[data-exposure=free]').closest('label').getBoundingClientRect().top;
    panel.scrollTop+=top-panel.getBoundingClientRect().top-12;
  });
  await page.locator('#flightLab').screenshot({path:'output/playwright/lab097-free-camera-view.png'});
  const take=await pose();await root.locator('.exposure-head h3').click();verify(await photo.getAttribute('data-free-state')==='ready','outside click retained capture');
  await root.locator('[data-exposure=seconds]').selectOption('30');await click('preview');await complete('stack');
  const downloadPromise=page.waitForEvent('download',{timeout:120000});await click('save');
  const download=await downloadPromise;await download.saveAs('output/playwright/lab097-free-camera-sample.png');
  verify(await photo.evaluate(c=>c.width===1920&&c.height===1080),'download did not render the full sensor');
  verify(JSON.stringify(await pose())===JSON.stringify(take),'stack or export changed the selected free pose');
  const again=await point();await page.mouse.click(again.x,again.y);await page.keyboard.down('e');await page.locator('#passTab').click();
  const switched=await pose();await page.waitForTimeout(100);await page.keyboard.up('e');
  verify(JSON.stringify(switched)===JSON.stringify(await pose())&&await photo.getAttribute('data-free-state')==='ready','held input survived tab switch');
  await page.locator('#closeFlightLab').click();return {quarterRoll:diff,pose:take,download:download.suggestedFilename()};
}
