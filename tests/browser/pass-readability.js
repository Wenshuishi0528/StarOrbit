async page=>{
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#welcomeDialog').evaluate(element=>element.open))await page.locator('#skipTour').click();
 if(await page.locator('#flightLab').evaluate(element=>element.open))await page.locator('#closeFlightLab').click();
 await page.locator('#languageZh').click();
 await page.locator('#openFlightLab').click();await page.locator('#passTab').click();
 await page.getByRole('button',{name:'使用北京',exact:true}).click();
 await page.getByRole('button',{name:'使用有效数据时段',exact:true}).click();
 const checks=[],check=(pass,name,data={})=>{if(!pass)throw Error(name+' '+JSON.stringify(data));checks.push({name,...data});};
 const run=async()=>{await page.locator('[data-action=predict]').click();await page.waitForFunction(()=>!document.querySelector('[data-action=predict]').disabled);};
 await page.locator('[data-pass-field=minimum]').fill('10');await run();
 const result=await page.evaluate(()=>{const r=viewer.sim.flightLab.panels.pass.result;return {count:r.passes.length,first:r.passes[0]};});
 check(result.count>0,'calculation produces passes');
 check(await page.locator('.pass-stage').count()===3,'three labelled viewing stages');
 const axis=await page.locator('.pass-chart').textContent();check(['0°','45°','90°','地平线','头顶','UTC+8'].every(label=>axis.includes(label)),'explicit time and elevation axes',{axis});
 const slider=page.locator('[data-testid=pass-time-slider]');
 for(const value of [0,500,1000]){
  await slider.evaluate((element,value)=>{element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));},String(value));
  const reading=await page.locator('.pass-scrubber').evaluate(element=>({time:Date.parse(element.querySelector('time').dateTime),direction:element.querySelector('.pass-readout-direction').textContent}));
  const expected=result.first.path[value===0?0:value===1000?48:24];
  check(Math.abs(reading.time-expected.time)<1&&reading.direction.includes(expected.azimuth.toFixed(1)+'°')&&reading.direction.includes(expected.elevation.toFixed(1)+'°'),'slider reports the sampled direction at '+value,reading);
 }
 if(result.count>1){
  await page.locator('[data-pass-index="1"]').click();
  const times=await page.evaluate(()=>({shown:Date.parse(document.querySelector('.pass-readout-time').dateTime),peak:viewer.sim.flightLab.panels.pass.result.passes[1].maximum.time}));
  check(Math.abs(times.shown-times.peak)<1,'selecting another pass resets the cursor to its peak',times);
 }
 for(const language of ['En','Fr','Ru','Zh']){
  await page.locator('#closeFlightLab').click();await page.locator('#language'+language).click();await page.locator('#openFlightLab').click();
  const content=await page.locator('.pass-preview').textContent();check(language==='Zh'||!/[\u4e00-\u9fff]/.test(content),'translated viewing guidance '+language);
 }
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>{const chart=document.querySelector('.pass-chart');return Math.abs(chart.viewBox.baseVal.width-chart.clientWidth)<2;});
 const dimensions=await page.locator('.pass-chart').evaluate(element=>({width:element.clientWidth,viewBox:element.viewBox.baseVal.width,container:element.closest('.pass-panel').clientWidth}));
 check(dimensions.width<=dimensions.container&&Math.abs(dimensions.viewBox-dimensions.width)<2,'mobile chart keeps readable unscaled labels',dimensions);
 await page.locator('[data-pass-field=latitude]').fill('100');
 check(!await page.locator('.pass-results').isVisible()&&await page.locator('.pass-stage').count()===0&&(await page.locator('.pass-readout-direction').textContent())==='','input changes clear stale cards and slider readout');
 await run();check((await page.locator('.pass-status').textContent()).includes('坐标无效'),'invalid observer is still rejected');
 await page.locator('[data-pass-field=latitude]').fill('90');await page.locator('[data-pass-field=minimum]').fill('80');await run();
 const zero=await page.evaluate(()=>viewer.sim.flightLab.panels.pass.result?.passes.length);
 check(zero===0&&!await page.locator('.pass-results').isVisible(),'zero-pass forecast hides chart, cards and controls',{count:zero});
 await page.setViewportSize({width:1440,height:1100});await page.locator('#closeFlightLab').click();return checks;
}
