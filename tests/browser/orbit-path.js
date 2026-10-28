async page=>{
 await page.reload();await page.setViewportSize({width:1200,height:900});
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#photoExit').isVisible())await page.locator('#photoExit').click();
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 const checks=[],cut=Date.parse('2000-01-01T00:00:00+08:00');
 const select=async id=>{
  await page.selectOption('#missionSelect',id);
  await page.waitForFunction(id=>viewer.sim.missionId===id&&!viewer.sim.missions.busy,id);
  await page.evaluate(()=>viewer.music.pause());
 };
 const measure=async time=>page.evaluate(time=>{
  const s=viewer.sim;s.seek(time);s.update(performance.now());s.setView('orbit');s.render();
  const p=s.orbitLine.geometry.attributes.position,c=s.orbitLine.geometry.attributes.color;
  const distance=(i,j)=>Math.hypot(p.getX(i)-p.getX(j),p.getY(i)-p.getY(j),p.getZ(i)-p.getZ(j));
  let longest=0;for(let i=0;i<p.count;i++)longest=Math.max(longest,distance(i,(i+1)%p.count));
  return {vertices:p.count,closed:s.orbitLine.isLineLoop,closingEdge:distance(0,p.count-1),longest,colors:c.count,visible:s.orbitLine.visible,gl:s.api.renderer.getContext().getError()};
 },time);
 for(const [id,time,label] of [
  ['dfh1',Date.parse('2026-10-28T02:40:40Z'),'DFH-1 screenshot date'],
  ['dfh1',Date.parse('2026-10-24T03:47:28.325Z'),'DFH-1 sampled ephemeris'],
  ['dfh1',Date.parse('1970-04-25T12:29:00Z'),'DFH-1 historical orbit'],
  ['tiangong',Date.parse('2026-10-28T02:40:40Z'),'space station'],
 ]){
  await select(id);const result=await measure(time);
  if(!result.closed||result.vertices!==360||result.longest>250||!result.visible||result.colors!==result.vertices||result.gl!==0)throw Error(label+': '+JSON.stringify(result));
  checks.push({label,...result});
 }
 await select('dfh1');
 for(const time of [cut-1,cut]){
  const result=await measure(time);
  if(!result.closed||result.vertices!==360||result.longest>250||result.gl!==0)throw Error('era transition: '+JSON.stringify(result));
  checks.push({label:'era transition '+time,...result});
 }
 await measure(Date.parse('2026-10-28T02:40:40Z'));
 await page.evaluate(()=>{
  const s=viewer.sim,q=s.current,r=s.spaceCamera.position.clone().fromArray(q.position),v=r.clone().fromArray(q.velocity);
  s.orbitControls.stopMotion();s.spaceCamera.position.copy(r.cross(v).normalize().multiplyScalar(28000));s.orbitControls.target.set(0,0,0);s.orbitControls.update();
  s.environment.settings.geographyEnabled=false;s.environment.settings.starChartEnabled=false;document.body.classList.add('photo-mode');s.api.resize();s.render();
 });
 await page.waitForTimeout(300);
 await page.locator('#stage canvas').screenshot({path:'output/playwright/orbit060-after.png'});
 await page.evaluate(()=>{const s=viewer.sim;s.spaceCamera.position.addScaledVector(s.marker.position,1.8).normalize().multiplyScalar(28000);s.orbitControls.update();s.render();});
 await page.locator('#stage canvas').screenshot({path:'output/playwright/orbit060-oblique.png'});
 await page.evaluate(()=>{document.getElementById('orbitPath').checked=false;viewer.sim.render();});
 if(await page.evaluate(()=>viewer.sim.orbitLine.visible))throw Error('orbit toggle');
 await page.evaluate(()=>{document.getElementById('orbitPath').checked=true;viewer.sim.setView('follow');viewer.sim.render();});
 if(await page.evaluate(()=>viewer.sim.orbitLine.visible))throw Error('follow view hides orbit');
 return {checks,toggleAndFollow:true};
}
