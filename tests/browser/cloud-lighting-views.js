async page=>{
 await page.setViewportSize({width:1200,height:900});await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 await page.evaluate(async()=>{
  const s=viewer.sim,e=s.environment,w=e.weather;viewer.music.pause();
  s.seek(Date.parse('2026-10-28T02:59:27Z'));s.update(performance.now());s.setView('orbit');s.orbitControls.stopMotion();
  e.settings.clouds=true;e.settings.geographyEnabled=false;e.settings.starChartEnabled=false;
  w.settings.cloud='builtin';w.settings.aurora='off';w.settings.motion=false;w.settings.adaptive=false;w.settings.exposure=1.15;viewer.renderer.toneMappingExposure=1.15;
  await e.setQuality('high');await w.apply('cloud');await w.apply('aurora');
  document.body.classList.add('photo-mode');document.getElementById('orbitPath').checked=false;s.api.resize();
  window.cloudView=(side,on,volume)=>{
   const sun=s.spaceCamera.position.clone().fromArray(s.current.sun).normalize(),tangent=sun.clone().cross(s.spaceCamera.up).normalize();
   s.spaceCamera.position.copy(side==='night'?sun.negate():side==='day'?sun:sun.multiplyScalar(-.15).addScaledVector(tangent,1)).normalize().multiplyScalar(25500);
   s.orbitControls.target.set(0,0,0);s.orbitControls.stopMotion();s.orbitControls.update();e.settings.cloudNightVisible=on;w.settings.volume=volume;s.render();
  };
 });
 for(const volume of [false,true])for(const side of ['night','twilight','day'])for(const on of [false,true]){
  await page.evaluate(args=>cloudView(...args),[side,on,volume]);await page.waitForTimeout(300);
  await page.locator('#stage canvas').screenshot({path:`output/playwright/cloud063-${volume?'volume':'layer'}-${side}-${on?'on':'off'}.png`});
 }
 return await page.evaluate(()=>({time:viewer.sim.time,moonLight:viewer.sim.environment.uniforms.cloudMoonLight.value,gl:viewer.renderer.getContext().getError()}));
}
