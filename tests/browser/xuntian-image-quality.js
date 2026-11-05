async page=>{
 const errors=[],check=(v,m)=>{if(!v)throw Error(m);};
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|webgl|framebuffer/i.test(m.text()))errors.push(m.text());});
 await page.waitForFunction(()=>window.viewer?.sim.xuntian?.active&&document.getElementById('xtCanvas').dataset.xuntianFrame>0,null,{timeout:60000});
 const root=page.locator('#xuntianScope'),canvas=page.locator('#xtCanvas');
 const frame=()=>canvas.getAttribute('data-xuntian-frame');
 const pixels=()=>canvas.evaluate(c=>{
  const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let sum=0,e=0,n=0,min=255,max=0;
  for(let y=1;y<c.height-1;y+=2)for(let x=2;x<c.width-1;x+=2){const i=(y*c.width+x)*4;const l=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];sum+=l;n++;min=Math.min(min,l);max=Math.max(max,l);e+=Math.abs(d[i+1]-d[i-3]);}
  return {mean:sum/n,edge:e/n,min,max,w:c.width,h:c.height};
 });
 const changed=async(old)=>page.waitForFunction(old=>{const n=document.getElementById('xtCanvas').dataset.xuntianFrame;return n!==old&&Number(n)>0;},old,{timeout:35000});
 const set=async(id,n)=>{const f=await frame();await page.locator(id).evaluate((e,n)=>{e.value=n;e.dispatchEvent(new Event('input',{bubbles:true}));},n);await changed(f);};
 const mode=async name=>{await root.locator('[data-xt-mode='+name+']').click();await page.waitForFunction(name=>{const s=viewer.sim.xuntian;return s.pointing.mode===name&&s.pointing.locked&&s.result?.center.kind==='earth';},name,{timeout:45000});};
 const photo=async(width,path)=>{await page.locator('#xtPhotoWidth').selectOption(String(width));const got=page.waitForEvent('download',{timeout:85000});await page.locator('#xtCapture').click();await (await got).saveAs(path);};
 const matchDisplay=async()=>{
  await page.waitForFunction(()=>{const c=document.getElementById('xtCanvas');return c.width===Math.min(2048,Math.round(c.getBoundingClientRect().width*devicePixelRatio));},null,{timeout:35000});
  return canvas.evaluate(c=>({css:c.getBoundingClientRect().width,dpr:devicePixelRatio,w:c.width,h:c.height}));};
 const small=await matchDisplay();check(small.dpr===2,'This test measures a Retina display; run with deviceScaleFactor: 2');
 const time=1794206100000,nightTime=1794208080000;
 await page.evaluate(t=>viewer.sim.seek(t),time);
 if(!await page.locator('#xtMore').evaluate(n=>n.open))await page.locator('#xtMore>summary').click();
 await mode('nadir');await set('#xtAperture',Math.round(Math.log(288/25)/Math.log(80)*1000));
 await page.evaluate(async()=>{await viewer.sim.environment.setQuality('medium');});
 await page.waitForFunction(()=>document.getElementById('xtSources').textContent.includes('2K'),null,{timeout:50000});
 const medium=await pixels();await page.evaluate(async()=>{await viewer.sim.environment.setQuality('high');});
 await page.waitForFunction(()=>document.getElementById('xtSources').textContent.includes('8K'),null,{timeout:75000});
 await page.waitForFunction(()=>document.getElementById('xtIllumination').textContent==='昼面');
 await page.waitForTimeout(1300);
 const high=await pixels(),info=await page.locator('#xtSources').innerText();
 check(high.mean>8&&high.max-high.min>20,'Sunlit terrain is black or flat: '+JSON.stringify(high));
 check(info.includes('16K')&&info.includes('8K'),'Incorrect bound texture sizes: '+info);
 const geo=await page.evaluate(()=>viewer.sim.xuntian.result.center);
 check(Math.abs(geo.latitude-40.74)<.05&&Math.abs(geo.longitude-115.925)<.05,'Mismatch with the v0.98 Beijing ground ray');
 await photo(1440,'output/v099-beijing-day.png');
 await set('#xtEV',-1);await page.waitForTimeout(250);const under=await pixels();
 await set('#xtEV',1);await page.waitForTimeout(250);const over=await pixels();
 check(over.mean>under.mean+5,'EV did not change the sunlight on the same ground '+JSON.stringify([under,over]));
 await set('#xtEV',0);await photo(3840,'output/v099-beijing-3840.png');
 await page.locator('#xtExpand').click();const large=await matchDisplay();check(large.w>small.w*1.2,'Large finder not materially larger');
 await page.locator('#xtNear').click();
 const actual=await page.evaluate(()=>{const {sim}=viewer,v=sim.xuntian.formation.getOptics();return{distance:viewer.camera.position.distanceTo(viewer.controls.target),axes:v.axes.forward};});check(actual.distance>0,'Close-up not available');
 await mode('sunlit');await page.waitForFunction(()=>document.querySelector('#xtIllumination').textContent==='昼面');
 check((await page.evaluate(()=>viewer.sim.time))===time,'Sunlit shortcut moved the simulation time');
 await page.evaluate(t=>viewer.sim.seek(t),nightTime);
 await page.waitForFunction(()=>document.getElementById('xtStatus').textContent.includes('夜侧')&&document.getElementById('xtIllumination').textContent==='夜面',null,{timeout:45000});
 const night=await pixels();check((await page.evaluate(()=>viewer.sim.time))===nightTime,'Night shortcut advanced the clock');
 await page.evaluate(t=>viewer.sim.seek(t),time);await mode('nadir');
 check(!errors.length,'Renderer errors: '+errors.join(';'));
 return {small,large,source:info,medium,high,under,over,night,geo,closeDistance:actual.distance};
}
