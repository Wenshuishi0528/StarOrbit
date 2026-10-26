async page=>{
 const checks=[],check=(pass,name,details)=>{checks.push({name,pass:!!pass,details});if(!pass)throw Error(name+': '+JSON.stringify(details));};
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#welcomeDialog').evaluate(el=>el.open))await page.locator('#skipTour').click();
 await page.evaluate(()=>{viewer.music.audio.pause();const s=viewer.sim;for(let i=0;i<50;i++){s.seek(s.time+120000);s.update(performance.now());if(s.current?.illumination>.99)break;}});
 await page.setViewportSize({width:1440,height:1000});
 const open=async()=>{if(await page.locator('#settings-attitude').evaluate(e=>e.hidden))await page.locator('[aria-controls="settings-attitude"]').click();await page.locator('#craftroll').scrollIntoViewIfNeeded();};
 await open();
 check(await page.locator('#craftAttitude').isVisible(),'station exposes three-axis controls');
 check(await page.locator('#craftAttitudeModeControl').isHidden(),'station keeps its ground-track reference');
 const before=await page.evaluate(()=>{const s=viewer.sim;window.poseStats={rebuild:0,orbit:0};const r=s.tracker.rebuild.bind(s.tracker),o=s.updateOrbit.bind(s);s.tracker.rebuild=(...a)=>{poseStats.rebuild++;return r(...a);};s.updateOrbit=(...a)=>{poseStats.orbit++;return o(...a);};return {time:s.time,position:[...s.current.position],auto:s.auto};});
 for(const [key,angle]of [['roll',35.5],['pitch',-40],['yaw',90]]){
  await page.locator('#resetCraftPose').click();await page.locator('#craft'+key).fill(String(angle));await page.locator('#craft'+key).press('Tab');
  await page.waitForFunction(({key,angle})=>viewer.sim.missions.state.pose[key]===angle&&Math.abs(viewer.sim.api.model.rotation[{roll:'x',pitch:'y',yaw:'z'}[key]]-angle*Math.PI/180)<1e-8,{key,angle});
  check(await page.locator('#craft'+key+'Range').inputValue()===String(angle),'number synchronizes slider '+key);
 }
 await page.locator('#craftyawRange').focus();await page.keyboard.press('ArrowLeft');
 check(await page.locator('#craftyaw').inputValue()==='89.9','slider keyboard edit synchronizes number');
 await page.locator('#craftpitch').fill('');await page.locator('#craftpitch').press('Tab');check(await page.locator('#craftpitch').inputValue()==='0','empty edit restores prior angle');
 await page.locator('#craftroll').fill('999');await page.locator('#craftroll').press('Tab');check(await page.locator('#craftroll').inputValue()==='180','angle clamps to 180');
 await page.locator('#craftroll').fill('-24.56');await page.locator('#craftroll').press('Tab');check(await page.locator('#craftroll').inputValue()==='-24.6','decimal input normalizes to slider precision');
 const state=await page.evaluate(()=>({time:viewer.sim.time,position:viewer.sim.current.position,auto:viewer.sim.auto,...poseStats}));
 check(state.time===before.time&&JSON.stringify(state.position)===JSON.stringify(before.position)&&state.auto===before.auto,'attitude preserves orbital position, time and solar tracking');
 check(state.rebuild===0&&state.orbit===0,'editing reuses solar geometry and orbit line',state);
 const coherent=await page.evaluate(()=>{const t=viewer.sim.tracker;for(const b of Object.values(t.occluders))for(const r of b.records){const expected=r.box.clone().copy(r.mesh.geometry.boundingBox).applyMatrix4(r.mesh.matrixWorld);if(expected.min.distanceTo(r.box.min)>1e-7||expected.max.distanceTo(r.box.max)>1e-7)return false;}return true;});check(coherent,'solar occlusion caches follow rotated station');
 await page.screenshot({path:'output/playwright/v043-station.png'});
 const stationPose=await page.evaluate(()=>({...viewer.sim.missions.state.pose}));
 await page.locator('#missionSelect').selectOption('dfh1');await page.waitForFunction(()=>viewer.sim.missionId==='dfh1'&&!viewer.sim.missions.busy);await open();
 check(await page.locator('#craftAttitudeModeControl').isVisible(),'satellite keeps attitude reference selector');
 await page.locator('#craftSpin').uncheck();await page.locator('#craftpitch').fill('45');await page.locator('#craftpitch').press('Tab');
 await page.waitForFunction(()=>Math.abs(viewer.sim.missions.bodyRoot().rotation.y-Math.PI/4)<1e-8);
 check(await page.locator('#craftpitchRange').inputValue()==='45','satellite number and slider synchronize');
 await page.locator('#missionSelect').selectOption('tiangong');await page.waitForFunction(()=>viewer.sim.missionId==='tiangong'&&!viewer.sim.missions.busy);
 check(await page.evaluate(p=>JSON.stringify(viewer.sim.missions.state.pose)===JSON.stringify(p),stationPose),'switching missions restores station pose');
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);await page.evaluate(()=>viewer.music.audio.pause());await open();
 check(await page.evaluate(p=>JSON.stringify(viewer.sim.missions.state.pose)===JSON.stringify(p),stationPose),'pose survives reload');
 check(await page.locator('#craftrollRange').inputValue()===String(stationPose.roll),'restored slider matches saved pose');
 // Scene sharing uses the same persisted pose schema.
 const scene=await page.evaluate(()=>viewer.sim.sceneShare?.capture?.());
 if(scene){check(JSON.stringify(scene.mission.pose)===JSON.stringify(stationPose),'scene captures body attitude');}
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  for(const lang of ['Zh','En','Ru','Fr']){
   await page.locator('#language'+lang).click();await open();
   for(const id of ['craftroll','craftpitch','craftyaw','craftrollRange','craftpitchRange','craftyawRange']){
    const b=await page.locator('#'+id).boundingBox();check(b&&b.x>=0&&b.x+b.width<=width,'control fits '+width+'/'+lang+'/'+id,b);
   }
  }
 }
 await page.locator('#languageZh').click();await page.locator('#resetCraftPose').click();
 check(await page.evaluate(()=>Object.values(viewer.sim.missions.state.pose).every(x=>x===0)&&Math.abs(viewer.sim.api.model.quaternion.w-1)<1e-8),'reset restores original attitude');
 await page.screenshot({path:'output/playwright/v043-mobile.png'});
 return checks;
}
