async page=>{
  await page.waitForFunction(()=>window.viewer?.sim.initialized);
  await page.evaluate(()=>viewer.sim.flightLab.open('exposure'));
  const root=page.locator('#exposurePanel'),photo=root.locator('[data-exposure=photo]');
  const complete=type=>page.waitForFunction(expected=>{
    const canvas=document.querySelector('#exposurePanel [data-exposure=photo]');
    const bar=document.querySelector('#exposurePanel [data-exposure=progress]');
    return canvas?.dataset.result===expected&&bar?.hidden;
  },type,{timeout:90000});
  const shoot=async()=>{await root.locator('[data-exposure=viewfinder]').click();await complete('single');};
  const compare=key=>photo.evaluate((canvas,action)=>{
    const ctx=canvas.getContext('2d'),now=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    if(action==='remember'){canvas.cameraQA=new Uint8ClampedArray(now);return 0;}
    let differences=0;
    for(let i=0;i<now.length;i+=4)if(Math.abs(now[i]-canvas.cameraQA[i])+Math.abs(now[i+1]-canvas.cameraQA[i+1])+Math.abs(now[i+2]-canvas.cameraQA[i+2])>24)differences++;
    return differences;
  },key);
  await complete('single');
  if(!await root.locator('[data-station-orbit=update]').isVisible())throw Error('Station orbit controls are missing');
  await shoot();await compare('remember');
  const shift=root.locator('[data-camera=x]');await root.locator('details summary').click();await shift.fill('12');await shoot();
  const moved=await compare('changed');if(moved<500)throw Error('Moving the mount did not change the view');
  await root.locator('[data-exposure=reset-camera]').click();await shoot();
  const restored=await compare('changed');if(restored>25)throw Error('Reset did not recover the original framing');
  for(const [key,value] of [['azimuth','-60'],['pitch','12'],['fov','28']]){
    await root.locator(`[data-camera=${key}]`).fill(value);await shoot();
    if(await compare('changed')<500)throw Error('Lens control did not change the photograph: '+key);
    await root.locator('[data-exposure=reset-camera]').click();await shoot();
  }
  await root.locator('[data-exposure=preset]').selectOption('core');await shoot();await compare('remember');
  // Change the real GLB solar-cell materials in this isolated session. Only
  // pixels covered by those surfaces should respond. Restore them even on failure.
  const marked=await page.evaluate(()=>{
    const materials=new Set();viewer.sim.api.model.traverse(obj=>{if(!obj.isMesh)return;for(const m of [].concat(obj.material))if(/solar.*blue/i.test(m.name))materials.add(m);});
    window.cameraQAMaterials=[...materials].map(m=>[m,m.color.clone()]);
    for(const [m] of window.cameraQAMaterials)m.color.setRGB(1,0,0);
    return materials.size;
  });
  let coloured;
  try{await shoot();coloured=await compare('changed');if(!marked||coloured<100)throw Error('Original GLB colours did not reach the exposure');}
  finally{await page.evaluate(()=>{for(const [m,colour] of window.cameraQAMaterials)m.color.copy(colour);delete window.cameraQAMaterials;});}
  await shoot();await compare('remember');await root.locator('[data-exposure=fill]').uncheck();await shoot();
  const fill=await compare('changed');if(fill<500)throw Error('Photography fill did not alter the hull lighting');
  await root.locator('[data-exposure=fill]').check();await root.locator('[data-exposure=mode]').selectOption('inertial');
  await root.locator('[data-exposure=preview]').click();await complete('stack');
  await page.locator('#passTab').click();
  const restarted=await page.evaluate(async()=>{
    const progress=document.querySelector('#exposurePanel [data-exposure=progress]');let ran=!progress.hidden;
    const watch=new MutationObserver(()=>{if(!progress.hidden)ran=true;});watch.observe(progress,{attributes:true,attributeFilter:['hidden']});
    document.dispatchEvent(new Event('visibilitychange'));await new Promise(resolve=>setTimeout(resolve,250));watch.disconnect();return ran;
  });
  if(restarted)throw Error('Hidden exposure panel restarted');
  await page.locator('#exposureTab').click();await complete('stack');await page.locator('#closeFlightLab').click();
  return {movedPixels:moved,restoredDifference:restored,sourceMaterials:marked,recolouredPixels:coloured,fillPixels:fill};
}
