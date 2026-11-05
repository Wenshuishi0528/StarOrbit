async page=>{
 await page.setViewportSize({width:1280,height:880});
 await page.goto(page.url().split('#')[0]+'#lab/balcony');
 const panel=page.locator('#balconyPanel');
 await panel.waitFor({state:'visible'});const btn=k=>panel.locator('[data-view='+k+']'),sky=panel.locator('[data-id=sky]');
 if(!await sky.isVisible()){
  const example=panel.locator('[data-id=beijing]');
  if(!await example.isVisible())await panel.locator('.bal-config').first().locator('summary').click();
  await example.click();await sky.waitFor({state:'visible'});
 }
 if(await sky.getAttribute('data-sky-view')!=='hemisphere'||await btn('hemisphere').getAttribute('aria-pressed')!=='true')throw Error('Did not enter the hemisphere by default');
 const reading=panel.locator('.bal-view-bearing');
 if(!/180°.* 90°/.test(await reading.innerText()))throw Error('Hemisphere did not open at the north-up zenith');
 await sky.screenshot({path:'output/playwright/lab-new-balcony-zenith.png'});
 await btn('zenith').click();if(!(await reading.innerText()).endsWith('90°'))throw Error('Zenith unavailable');
 await btn('horizon').click();if(!/215°.* 0°/.test(await reading.innerText()))throw Error('Failed to restore requested orientation');
 await sky.screenshot({path:'output/playwright/lab097-balcony-horizon.png'});
 await btn('sphere').click();const toggle=btn('below');
 if(await toggle.getAttribute('aria-pressed')!=='true')throw Error('Full sphere hid the subsurface sky by default');
 if(!/215°.* 0°/.test(await reading.innerText()))throw Error('Full sphere did not open facing the horizon');
 await sky.screenshot({path:'output/playwright/lab097-balcony-globe-horizon.png'});
 await btn('nadir').click();
 if(!(await reading.innerText()).endsWith('-90°'))throw Error('Could not reach nadir');
 const bright=()=>sky.evaluate(c=>{
  const w=c.width,h=c.height,rgba=c.getContext('2d').getImageData(0,0,w,h).data;let points=0;
  for(let y=Math.floor(h*.16);y<h*.78;y++)for(let x=Math.floor(w*.14);x<w*.86;x++){
   const i=(y*w+x)*4;
   if(rgba[i]>115&&rgba[i]-rgba[i-8]>50&&rgba[i]-rgba[i+8]>50)points++;
  }
  return points;
 });
 const transparent=await bright();await sky.screenshot({path:'output/playwright/lab097-balcony-globe.png'});
 await toggle.click();const opaque=await bright();
 if(transparent<opaque+20)throw Error('Underground stars did not render: '+transparent+' / '+opaque);
 await toggle.click();await btn('hemisphere').click();
 return {hemisphere:'180° / 90°',horizon:'215° / 0°',fullSphereVisibleByDefault:true,nadirStarPixels:transparent,maskedPixels:opaque};
}
