async page=>{
 const checks=[],check=(value,name)=>{if(!value)throw Error(name);checks.push(name);};
 await page.reload();await page.setViewportSize({width:1440,height:1000});
 await page.waitForFunction(()=>window.viewer?.sim.initialized&&!viewer.sim.environment.loading);
 const ready=async()=>page.evaluate(async()=>{const w=viewer.sim.environment.weather;await w.ready;await w.nasaRestore;viewer.music.pause();document.getElementById('welcomeDialog')?.close();w.resourcePanel.open('cloud');});
 await ready();await page.locator('#openCloudHistory').click();
 const cloud=()=>page.evaluate(()=>{const w=viewer.sim.environment.weather;return JSON.stringify({mode:w.settings.cloud,history:w.settings.cloudHistory,active:w.active.cloud,texture:w.env.uniforms.cloudMap.value.uuid});});
 const initial=await cloud();
 await page.locator('#historyProvider').selectOption('viirs');await page.locator('#historyDate').fill('2026-10-28');await page.locator('#historyQuery').click();
 await page.waitForFunction(()=>document.getElementById('historyStatus').textContent.includes('无需重复下载'));
 check(await page.locator('#historyDownload').isDisabled(),'real VIIRS download is reused without another transfer');
 const viirs=page.locator('.history-row').filter({hasText:'2026-10-28 · VIIRS 白天'});
 check(await viirs.count()===1,'only one cached copy of the selected VIIRS day');
 if(await viirs.getByRole('button',{name:'收藏保留',exact:true}).count())await viirs.getByRole('button',{name:'收藏保留',exact:true}).click();
 await page.waitForFunction(()=>viewer.sim.environment.weather.items.find(r=>r.archiveKey==='viirs:2026-10-28:day')?.favorite);
 check(true,'favorite is persisted to the shared cache');
 await page.locator('.history-preview-actions').getByRole('button',{name:'区域对比与缺测说明'}).click();
 await page.waitForFunction(()=>document.getElementById('cloudTrialStatus').textContent.includes('2026-10-28'));
 check(await page.locator('#cloudTrialSource').inputValue()==='history','downloaded historical blob opens in isolated regional viewer');
 await page.locator('#cloudTrialRegion').selectOption('north');
 await page.waitForFunction(()=>document.getElementById('cloudTrialMap').getAttribute('aria-label').includes('北极'));
 await page.keyboard.press('Escape');check(await page.locator('#cloudHistoryDialog').isVisible(),'Escape returns from trial to history');
 check(await cloud()===initial,'download, favorite and preview leave current cloud unchanged');
 await page.route('**/WMTSCapabilities.xml',route=>route.fulfill({path:'output/viirs-trial/capabilities.xml',contentType:'application/xml'}));
 await page.locator('#historyDate').fill('2018-02-23');await page.locator('#historyQuery').click();
 await page.waitForFunction(()=>document.getElementById('historyStatus').textContent.includes('未列出此日期'));
 check(await page.locator('#historyDownload').isDisabled(),'advertised catalog gaps cannot be downloaded');
 const meta=await (await page.request.get('http://127.0.0.1:8796/output/playwright/history86/synthetic-meta.json')).json();
 await page.route('**/api/cloud/history/query?*',route=>{
  const date=new URL(route.request().url()).searchParams.get('date');
  return route.fulfill({status:date==='2026-10-25'?502:200,contentType:'application/json',body:JSON.stringify(date==='2026-10-25'?{error:'暂时无法连接图源：测试断网'}:date==='2026-10-24'?{available:false,message:'该日期／时次没有此版本数据'}:{available:true,message:'测试指定时次存在'})});
 });
 await page.route('**/api/cloud/history/download?*',route=>{
  const date=new URL(route.request().url()).searchParams.get('date');
  return route.fulfill({contentType:'application/json',body:JSON.stringify(date==='2026-10-26'?{state:'error',error:'质量检查未通过：测试接缝'}:{state:'ready',id:'fixture',result:meta})});
 });
 await page.route('**/api/cloud/history/image?*',route=>route.fulfill({path:'output/playwright/history86/synthetic-clear.png',contentType:'image/png'}));
 await page.locator('#historyProvider').selectOption('satcorps');
 for(const [date,expected] of [['2026-10-25','测试断网'],['2026-10-24','没有此版本数据']]){
  await page.locator('#historyDate').fill(date);await page.locator('#historyQuery').click();await page.waitForFunction(text=>document.getElementById('historyStatus').textContent.includes(text),expected);
  check(await page.locator('#historyDownload').isDisabled(),date==='2026-10-25'?'network failure is reported separately from missing data':'missing NASA file disables download');
 }
 await page.locator('#historyDate').fill('2026-10-26');await page.locator('#historyQuery').click();await page.locator('#historyDownload').click();
 await page.waitForFunction(()=>document.getElementById('historyStatus').textContent.includes('测试接缝'));
 check(await cloud()===initial,'rejected NASA frame leaves current cloud intact');
 await page.locator('#historyDate').fill('2026-10-23');await page.locator('#historyQuery').click();await page.locator('#historyDownload').click();
 await page.waitForFunction(()=>document.getElementById('historyStatus').textContent.includes('时次与选择不符'));
 check(await page.locator('.history-row').filter({hasText:'SATCORPS'}).count()===0,'mismatched response date cannot be stored');
 await page.locator('#historyDate').fill('2026-10-27');await page.locator('#historyQuery').click();await page.locator('#historyDownload').click();
 await page.waitForFunction(()=>document.getElementById('historyStatus').textContent.includes('通过质量检查，尚未应用'));
 check(await cloud()===initial,'validated NASA archive stays unapplied after download');
 check(await page.evaluate(()=>viewer.sim.environment.weather.latestRecord('cloud','satcorps')===null),'archive is excluded from latest mode');
 await page.locator('.history-preview-actions').getByRole('button',{name:'应用此历史云图'}).click();
 await page.waitForFunction(()=>document.getElementById('historyStatus').textContent.includes('已固定使用'));
 check(await page.evaluate(()=>{const w=viewer.sim.environment.weather;return w.settings.cloud==='history'&&w.settings.cloudHistory===w.active.cloud;}),'explicit Apply pins the checked NASA historical frame');
 await page.evaluate(async()=>{const w=viewer.sim.environment.weather;await w.setSource('cloud','builtin');});
 await page.screenshot({path:'output/playwright/history86/history-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/playwright/history86/history-mobile.png'});
 check(await page.evaluate(()=>{const d=document.getElementById('cloudHistoryDialog');return d.scrollWidth<=d.clientWidth+1;}),'history controls fit a narrow viewport');
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized&&!viewer.sim.environment.loading);await ready();await page.locator('#openCloudHistory').click();
 check(await page.locator('.history-row').filter({hasText:'VIIRS 白天'}).getByRole('button',{name:'取消收藏'}).count()===1,'favorite survives page reload');
 check(await page.evaluate(()=>viewer.renderer.getContext().getError()===0),'no WebGL error after archive workflow');
 await page.keyboard.press('Escape');check(await page.locator('#resourceDialog').isVisible(),'closing history preserves resource panel');
 return checks;
}
