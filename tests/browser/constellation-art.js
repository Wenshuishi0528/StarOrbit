// Actual scope controls, shared-resource switches and exported teaching layers.
async page=>{
 const results={},check=(v,m)=>{if(!v)throw Error(m);};
 await page.waitForFunction(()=>window.viewer?.sim?.initialized);
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 await page.evaluate(()=>{const s=viewer.sim,e=s.environment;s.seek(Date.UTC(2026,10,5,5,44));s.xuntian.open();Object.assign(e.settings,{stars:true,milky:true,starChartEnabled:true,constellationArt:true,catalogStarLabels:false,skyDetail:false,skyDetailSource:'galaxy'});e.save();});
 await page.locator('#xtNames').check();await page.locator('#xtPhotoNames').check();
 if(await page.locator('#openOrbitMap').getAttribute('aria-expanded')==='true')await page.locator('#openOrbitMap').click();
 if(await page.locator('#xtExpand').getAttribute('aria-pressed')!=='true')await page.locator('#xtExpand').click();
 for(const[name,imageId]of [['天鹅座','cygnus'],['英仙座','perseus']]){
  await page.locator('#xtSearch').fill(name);await page.locator('#xtSearch').press('Enter');await page.waitForFunction(()=>viewer.sim.xuntian.pointing.locked,null,{timeout:45000});
  await page.evaluate(()=>{const s=viewer.sim;for(let i=0;i<90;i++){const p=s.xuntian.pointing,eye=s.xuntian.optics?.eyeKm;if(eye&&eye.reduce((v,x,j)=>v+x*p.axes.forward[j],0)>1000)break;s.seek(s.time+60000);s.update(performance.now());}});
  await page.waitForFunction(()=>viewer.sim.xuntian.pointing.locked&&viewer.sim.xuntian.result?.center.kind==='sky',null,{timeout:45000});
  await page.waitForFunction(id=>viewer.sim.xuntian.result?.constellationArt?.images.includes(id),imageId,{timeout:30000});await page.waitForTimeout(500);
  results[name]=await page.evaluate(()=>({pointing:viewer.sim.xuntian.pointing,art:viewer.sim.xuntian.result.constellationArt,loaded:viewer.sim.environment.constellationArt.entries.size}));
  await page.locator('#xtCanvas').scrollIntoViewIfNeeded();await page.screenshot({path:'output/playwright/v116-art-'+imageId+'.png'});
  await page.locator('#xtPhotoWidth').selectOption('1440');const pending=page.waitForEvent('download',{timeout:60000});await page.locator('#xtCapture').click();await(await pending).saveAs('output/playwright/v116-art-'+imageId+'-photo.png');
 }
 const point=await page.evaluate(()=>viewer.sim.xuntian.pointing);
 await page.evaluate(()=>{const c=document.getElementById('constellationArt');c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.waitForFunction(()=>viewer.sim.xuntian.result?.constellationArt?.requested===0);
 const disabled=await page.evaluate(()=>viewer.sim.xuntian.pointing);check(JSON.stringify(disabled.axes)===JSON.stringify(point.axes)&&disabled.field===point.field,'Art toggle moved optical axes');
 await page.evaluate(()=>{const c=document.getElementById('constellationArt');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.waitForFunction(()=>viewer.sim.xuntian.result?.constellationArt?.ready>0);
 await page.locator('#xtFocal').fill('1000');await page.waitForFunction(()=>viewer.sim.xuntian.pointing.field<1&&viewer.sim.xuntian.result?.constellationArt?.requested===0);
 results.narrowFade=true;results.gpu=await page.evaluate(()=>viewer.sim.environment.constellationArt.status('main').gpuBytes);check(results.gpu<=16*1024*1024,'Art textures exceeded GPU budget');
 return results;
}
