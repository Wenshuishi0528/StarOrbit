async page=>{
  async function png(download){
    const stream=await download.createReadStream(),header=[];let size=0;
    for await(const bytes of stream){size+=bytes.length;for(let i=0;i<bytes.length&&header.length<24;i++)header.push(bytes[i]);}
    const u32=i=>(header[i]*0x1000000+header[i+1]*0x10000+header[i+2]*0x100+header[i+3]);
    if(header.slice(0,8).join(',')!=='137,80,78,71,13,10,26,10'||u32(16)!==1440||u32(20)!==1648)throw Error('Malformed survey PNG');
    return {filename:download.suggestedFilename(),bytes:size};
  }
  await page.waitForFunction(()=>window.viewer?.sim.initialized);await page.evaluate(()=>viewer.sim.flightLab.open('survey'));
  const root=page.locator('#surveyPanel'),field=root.locator('[data-survey=coverage-field]'),mode=root.locator('[data-sky-product=mode]');
  const open=root.locator('[data-sky-product=open]'),download=root.locator('[data-sky-product=download]'),scrub=root.locator('[data-survey=clock]');
  if(await mode.inputValue()!=='galaxy')throw Error('The first survey plan did not select the 16K galaxy layer');
  await field.selectOption('cygnus');await root.locator('[data-survey=example]').click();const target=await field.inputValue();await scrub.press('Home');
  if(await open.isEnabled()||await download.isEnabled())throw Error('An unobserved field produced a photograph');
  const count=()=>root.locator('[data-sky-product=count]').innerText();
  await mode.selectOption('catalog');const bright=parseInt((await count()).match(/\d+/)[0],10);
  await mode.selectOption('dense');const dense=parseInt((await count()).match(/\d+/)[0],10);
  if(dense<bright+400)throw Error('Dense layer did not include the measured Tycho-2 cutout');
  const ends=await root.locator('[data-job]').evaluateAll(rows=>rows.map(row=>Number(row.querySelector('[data-survey=start]').value)+Number(row.querySelector('[data-survey=duration]').value)).sort((a,b)=>a-b));
  const setClock=async value=>{await scrub.fill(String(value));await scrub.dispatchEvent('input');};
  await setClock(ends[0]);await open.click();const result=root.locator('[data-sky-product=plate]');
  const partial=await result.evaluate(canvas=>{
    const ctx=canvas.getContext('2d'),stats=[];
    for(let i=0;i<4;i++){
      const x=60+i%2*660+60,y=132+Math.floor(i/2)*660+60,p=ctx.getImageData(x,y,360,190).data,colors=new Set();
      for(let k=0;k<p.length;k+=16)colors.add((p[k]<<16)+(p[k+1]<<8)+p[k+2]);stats.push(colors.size);
    }
    return {size:[canvas.width,canvas.height],stats};
  });
  if(partial.stats.filter(x=>x>45).length!==1)throw Error('Unobserved tiles contain sky details: '+partial.stats);
  const partialDownload=page.waitForEvent('download');await root.locator('[data-sky-product=dialog-download]').click();
  const partialPNG=await png(await partialDownload);if(!partialPNG.filename.includes('-dense-1of4-'))throw Error('Wrong partial PNG');
  await root.locator('[data-sky-product=close]').click();await setClock(ends.at(-1));await mode.selectOption('galaxy');
  await page.waitForFunction(()=>/4096|2048|1024/.test(document.querySelector('[data-sky-product=description]').textContent)&&!document.querySelector('[data-sky-product=download]').disabled,{},{timeout:120000});
  const galaxyStars=parseInt((await count()).match(/\d+/)[0],10);if(galaxyStars!==dense)throw Error('Background changed the point catalogue');
  await open.click();const fullLabel=await result.getAttribute('aria-label');if(!fullLabel.includes('4/4'))throw Error('Four completed exposures did not unlock the final mosaic');
  const zoom=root.locator('[data-sky-product=zoom]'),stage=root.locator('[data-sky-product=stage]');
  const fit=await stage.evaluate(e=>({w:e.clientWidth,h:e.clientHeight,cw:e.firstChild.getBoundingClientRect().width,ch:e.firstChild.getBoundingClientRect().height}));
  if(fit.cw>fit.w+1||fit.ch>fit.h+1)throw Error('Fit view clips the mosaic');
  await zoom.click();const native=await stage.evaluate(e=>[e.firstChild.offsetWidth,e.firstChild.offsetHeight,e.scrollHeight,e.scrollWidth]);
  if(native[0]!==1440||native[1]!==1648||native[2]<1648||native[3]<1440)throw Error('Original-size mosaic is not scrollable');
  await zoom.click();
  const pending=page.waitForEvent('download');await root.locator('[data-sky-product=dialog-download]').click();const file=await pending;
  const fullPNG=await png(file);if(!fullPNG.filename.includes('-galaxy-4of4-'))throw Error('PNG did not retain the selected sky layer and coverage');
  await root.locator('[data-sky-product=close]').click();await field.selectOption(target==='leo'?'orion':'leo');
  if(await download.isEnabled())throw Error('Coverage leaked to another field');
  await mode.selectOption('dense');await field.selectOption(target);await setClock(0);if(await download.isEnabled())throw Error('Rewinding retained future exposures');
  const recipe=await page.evaluate(()=>{const p=viewer.sim.flightLab.panels.survey;return p.getObservationRecord().record;});
  if(recipe.skyLayer!=='dense')throw Error('Saved survey did not capture the actual imaging layer');
  await mode.selectOption('catalog');
  await page.evaluate(record=>{const p=viewer.sim.flightLab.panels.survey,orbit=p.getObservationRecord().orbit;p.restoreObservationRecord(record,{orbit});},recipe);
  if(await mode.inputValue()!=='dense')throw Error('Restoring a survey did not restore its sky layer');
  delete recipe.skyLayer;await mode.selectOption('catalog');
  await page.evaluate(record=>{const p=viewer.sim.flightLab.panels.survey,orbit=p.getObservationRecord().orbit;p.restoreObservationRecord(record,{orbit});},recipe);
  if(await mode.inputValue()!=='dense')throw Error('A legacy survey must use its historical high-density default');
  return {target,bright,dense,galaxyStars,partial,partialPNG,fullPNG,fullAt:ends.at(-1),orbitEnd:Number(await scrub.getAttribute('max')),restoredLayer:await mode.inputValue()};
}
