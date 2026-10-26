// Playwright CLI function; verifies the standalone file without network access.
async(page)=>{
 const results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.context().setOffline(true);
 try{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('file:///Users/apple/Documents/Codex/Tiangong-Orbit-Simulator/天宫空间站交互预览.html');await page.waitForFunction(()=>!!window.viewer);
  await page.locator('#missionSelect').selectOption('tiangong');await page.waitForFunction(()=>viewer.sim.missionId==='tiangong'&&!viewer.sim.missions.busy);
  results.push({name:'offline station loads',pass:await page.evaluate(()=>viewer.sim.missionId==='tiangong'&&viewer.sim.api.model.visible)});
  await page.locator('#missionSelect').selectOption('dfh1');await page.waitForFunction(()=>viewer.sim.missionId==='dfh1'&&!viewer.sim.missions.busy);
  await page.evaluate(()=>{const s=viewer.sim;s.seek(s.start+3*86400000);s.update(performance.now());});
  results.push({name:'offline satellite and independent orbit load',pass:await page.evaluate(()=>viewer.sim.current&&viewer.sim.data.missionId==='dfh1'&&viewer.sim.missions.models.get('dfh1').visible)});
  await page.locator('#viewMenuToggle').click();await page.locator('[data-view=horizon]').click();
  results.push({name:'horizon up follows satellite radial direction',pass:await page.evaluate(()=>{const s=viewer.sim,r=s.current.position,n=Math.hypot(...r),up=s.current.basis.map(a=>a.reduce((v,x,i)=>v+x*r[i]/n,0));return viewer.camera.up.toArray().every((x,i)=>Math.abs(x-up[i])<1e-6);})});
  await page.evaluate(()=>{document.getElementById('showMinimap').checked=false;viewer.sim.minimap.setVisible(false);});
  await page.screenshot({path:'/Users/apple/Documents/Codex/Tiangong-Orbit-Simulator/output/playwright/v029-dfh1-offline.png'});
  await page.getByRole('button',{name:'English',exact:true}).click();await page.setViewportSize({width:760,height:900});
  results.push({name:'English narrow layout fits viewport',pass:await page.evaluate(()=>document.getElementById('activeMission').textContent==='Earth：Satellite：Dong Fang Hong 1'&&document.documentElement.scrollWidth<=innerWidth)});
  await page.screenshot({path:'/Users/apple/Documents/Codex/Tiangong-Orbit-Simulator/output/playwright/v029-dfh1-narrow-en.png'});
  await page.locator('#missionSelect').selectOption('tiangong');await page.waitForFunction(()=>viewer.sim.missionId==='tiangong'&&!viewer.sim.missions.busy);
  results.push({name:'offline return restores station model',pass:await page.evaluate(()=>viewer.sim.api.model.visible&&!viewer.sim.missions.models.get('dfh1').visible)});
  results.push({name:'no uncaught browser errors',pass:errors.length===0,errors});
 }finally{await page.context().setOffline(false);}
 return results;
}
