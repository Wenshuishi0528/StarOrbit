async page=>{
 await page.reload();await page.setViewportSize({width:1280,height:900});await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator("#welcomeDialog").evaluate(e=>e.open))await page.locator("#skipTour").click();
 await page.evaluate(async()=>{
  const v=viewer,s=v.sim,e=s.environment;v.music.pause();s.seek(Date.parse('2026-03-20T00:00:00Z'));s.setView('orbit');s.orbitControls.stopMotion();s.orbitControls.minDistance=1;
  e.settings.geographyEnabled=false;e.settings.starChartEnabled=false;e.weather.settings.adaptive=false;e.weather.settings.aurora='local';e.weather.settings.auroraStrength=1.4;await e.weather.apply('aurora');await e.setQuality('high');document.body.classList.add('photo-mode');document.getElementById('orbitPath').checked=false;s.update(performance.now());s.render();
  window.auroraTestPose=(lat,lon,r,targetLat=0,targetR=0,targetLon=lon)=>{
   const earth=e.earth.quaternion,c=s.spaceCamera;
   const vec=(lat,lon,r)=>c.position.clone().set(Math.cos(lat*Math.PI/180)*Math.cos(lon*Math.PI/180),Math.cos(lat*Math.PI/180)*Math.sin(lon*Math.PI/180),Math.sin(lat*Math.PI/180)).multiplyScalar(r).applyQuaternion(earth);
   c.position.copy(vec(lat,lon,r));c.up.set(0,0,1).applyQuaternion(earth);s.orbitControls.target.copy(vec(targetLat,targetLon,targetR));s.orbitControls.stopMotion();s.orbitControls.update();s.render();
  };
 });
 for(const [name,args] of [['overhead',[65,0,16000]],['horizon',[53,0,6800,66,6510]],['oblique',[70,35,6771,64,6500,40]],['south',[-65,0,16000]],['day',[65,180,16000]]]){
  await page.evaluate(args=>auroraTestPose(...args),args);await page.waitForTimeout(450);await page.screenshot({path:'output/playwright/aurora058-'+name+'.png'});
 }
 return await page.evaluate(()=>({failed:viewer.sim.environment.auroraCurtains.failed,stats:viewer.sim.environment.auroraCurtains.stats,errors:viewer.renderer.info.programs.filter(p=>p.diagnostics&&!p.diagnostics.runnable).map(p=>p.name)}));
}
