async page=>{
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 const root=page.locator('#exposurePanel'),q=key=>root.locator('[data-exposure="'+key+'"]');
 const waitResult=result=>page.waitForFunction(expected=>{
  const photo=document.querySelector('#exposurePanel [data-exposure=photo]'),bar=document.querySelector('#exposurePanel [data-exposure=progress]');
  return photo?.dataset.result===expected&&bar?.hidden;
 },result,{timeout:120000});
 const pixels=()=>q('photo').evaluate(photo=>{
  const probe=document.createElement('canvas');probe.width=96;probe.height=54;
  const ctx=probe.getContext('2d');ctx.drawImage(photo,0,0,96,54);return [...ctx.getImageData(0,0,96,54).data];
 });
 const changed=(a,b,min=10)=>{let count=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>min)count++;return count;};
 // Use the bundled pass finder rather than tying the test to a single OEM.
 const first=await page.evaluate(async()=>{
  const sim=viewer.sim,data=sim.bundledOrbits.tiangong,first=data.rows[0][0]+137;
  await sim.flightLab.openGroundCapture({observer:{name:'北京',latitude:39.9042,longitude:116.4074,height:50},time:first,data,missionId:'tiangong'});
  return first;
 });
 const handoff=await page.evaluate(async()=>{const p=await viewer.sim.flightLab.panels.exposure.getObservationRecord();return {time:p.record.time,mode:p.record.mode,site:p.record.observer};});
 if(handoff.time!==first||handoff.mode!=='compare-ground'||handoff.site.name!=='北京')throw Error('Balcony handoff did not keep the exact epoch and observer: '+JSON.stringify({first,handoff}));
 await q('pass').click();
 await page.waitForFunction(()=>document.querySelector('[data-exposure=ground-window]')?.textContent.includes('该地在快门期间可见'),null,{timeout:30000});
 await waitResult('single');
 const start=Date.now();await q('preview').click();await waitResult('stack');const elapsed=Date.now()-start;
 const wipe=q('wipe');await wipe.focus();await wipe.press('Home');const ground=await pixels();await wipe.press('End');const fixed=await pixels();
 const difference=changed(fixed,ground);if(difference<20)throw Error('The tracking pair was indistinguishable');
 await wipe.press('Home');await wipe.press('Shift+ArrowRight');if(await wipe.getAttribute('aria-valuenow')!=='10')throw Error('Keyboard divider failed');
 await wipe.scrollIntoViewIfNeeded();const box=await root.locator('[data-exposure=film]').boundingBox();await page.mouse.move(box.x+box.width*.1,box.y+box.height*.52);await page.mouse.down();await page.mouse.move(box.x+box.width*.39,box.y+box.height*.47);await page.mouse.up();
 const split=Number(await wipe.getAttribute('aria-valuenow'));if(Math.abs(split-39)>2)throw Error('Pointer divider failed: '+JSON.stringify({split,box,handle:await wipe.boundingBox(),hit:await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.outerHTML?.slice(0,160),{x:box.x+box.width*.1,y:box.y+box.height*.52})}));
 const mixed=await pixels();
 const saved=await page.evaluate(async()=>{
  const recipe=await viewer.sim.flightLab.panels.exposure.getObservationRecord();window.exposurePairQA=recipe;
  const {time,source,product,split}=recipe.record;return {time,source,product,split,bytes:recipe.image?.size};
 });
 if(saved.product.count!==2||!saved.bytes||Math.abs(saved.split*100-split)>1||!saved.source.earth.day?.source)throw Error('Two original images or selected source missing');
 // An antipodal site is below the horizon at this same UTC. The panel must
 // discard the previous successful composite instead of passing it off as new.
 await page.evaluate(async()=>{
  const r=window.exposurePairQA,o=r.record.observer;await viewer.sim.flightLab.openGroundCapture({observer:{...o,latitude:-o.latitude,longitude:o.longitude-180},time:r.record.time,data:r.orbit,missionId:'tiangong'});
 });
 await page.waitForFunction(()=>document.querySelector('[data-exposure=ground-window]')?.textContent.includes('地平线下')&&document.querySelector('[data-exposure=photo]')?.dataset.result==='',null,{timeout:20000});
 await page.evaluate(async()=>{const p=viewer.sim.flightLab.panels.exposure,r=window.exposurePairQA;await p.restoreObservationRecord(r.record,{image:r.image,orbit:structuredClone(r.orbit)});});
 await waitResult('stack');if(changed(mixed,await pixels(),0)!==0)throw Error('Reopening changed the saved photograph');
 await q('variant').selectOption('b');
 const downloadPromise=page.waitForEvent('download',{timeout:30000});await q('save').click();const download=await downloadPromise;
 if(!download.suggestedFilename().includes('compare-ground-b-'))throw Error('Wrong photograph exported');
 // Change to a sky-field pair with the main scene's selected Milky Way.
 await q('mode').selectOption('compare-stars');await q('preset').selectOption('sky');await waitResult('single');
 await q('preview').click();await waitResult('stack');
 await wipe.focus();await wipe.press('Home');const stars=await pixels();await wipe.press('End');
 const starDifference=changed(stars,await pixels());if(starDifference<20)throw Error('The inertial and station exposures were indistinguishable');
 await q('seconds').selectOption('600');await waitResult('single');
 await q('preview').click();await page.waitForFunction(()=>{const p=document.querySelector('[data-exposure=progress]');return !p.hidden&&p.value>0&&p.value<1;},null,{timeout:70000});
 await q('cancel').click();await page.waitForTimeout(300);
 const cancelled=await q('progress').isHidden()&&await q('status').textContent();
 if(!cancelled?.includes('取消'))throw Error('Shutter cancellation did not finish');
 await page.evaluate(()=>{delete window.exposurePairQA;viewer.sim.flightLab.close();});
 return {captureMilliseconds:elapsed,changedPixels:difference,starChangedPixels:starDifference,probePixels:96*54,split,restoredPixelChanges:0,cancelled,...saved};
}
