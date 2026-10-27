// Run after geography.js in an isolated development viewer.
async page=>{
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 return await page.evaluate(async()=>{
  const v=viewer,s=v.sim,e=s.environment,g=e.geography,$=id=>document.getElementById(id),checks=[];
  const check=(pass,name)=>{if(!pass)throw Error(name);checks.push(name);};
  const wait=()=>new Promise(r=>setTimeout(r,450));
  const set=(id,value)=>{const el=$(id);el.type==='checkbox'?el.checked=value:el.value=String(value);el.dispatchEvent(new Event(el.type==='range'?'input':'change',{bubbles:true}));};
  const live=()=>[...g.shown.values()].filter(p=>p.out===undefined);
  v.music.pause();s.setView('orbit');s.seek(Date.parse('2026-10-26T12:00:00Z'));
  set('geographyEnabled',true);set('geoCities',true);set('geoCityTier',1);
  check(e.settings.geoCities&&e.settings.geoCityTier===1,'tier 1 control applied');
  for(const key of ['geoCapitals','geoCountries','geoMarine','geoLandforms','geoRivers','geoLakes'])set(key,false);
  set('geoDensity',1);
  const point=(lon,lat)=>{s.update(performance.now());const r=lon*Math.PI/180,d=lat*Math.PI/180;const p=s.spaceCamera.position.clone().set(Math.cos(d)*Math.cos(r),Math.cos(d)*Math.sin(r),Math.sin(d)).applyQuaternion(e.earth.quaternion);s.spaceCamera.position.copy(p).multiplyScalar(13500);s.spaceCamera.up.set(0,0,1);s.orbitControls.target.set(0,0,0);s.orbitControls.stopMotion();s.orbitControls.update();s.update(performance.now());s.render();};
  point(108,32);await wait();
  check(live().length>0&&live().every(p=>p.cityTier===1),'default city layer only draws tier 1');
  check(live().some(p=>p.id==='beijing'),'Beijing remains visible through city layer');
  const atlasBuilds=g.stats.atlasBuilds,counts=[];
  for(const tier of [1,2,3]){
   set('geoCityTier',tier);await wait();
   check(live().every(p=>p.cityTier<=tier),'tier '+tier+' respects its cutoff');
   check(live().some(p=>p.cityTier===tier),'tier '+tier+' renders newly included cities');
   counts.push(g.stats.candidates);
  }
  check(counts[0]<counts[1]&&counts[1]<counts[2],'higher tiers add candidate cities');
  check(g.stats.atlasBuilds===atlasBuilds,'tier switching reuses glyph atlas');
  set('geoCapitals',true);await wait();
  check(live().filter(p=>p.id==='beijing').length===1,'capital and city switches share one Beijing label');
  check(new Set(live().map(p=>p.id)).size===live().length,'no duplicate city anchors');
  for(const lang of ['En','Ru','Fr','Zh']){
   $('language'+lang).click();await wait();
   const locale=lang.toLowerCase();check(live().every(p=>p.text===(p[locale]||p.en)),'city names follow '+locale);
   check(g.atlasSide<=2048,'bounded glyph atlas for '+locale);
  }
  await wait();const before={...g.stats};await wait();
  check(g.stats.layouts===before.layouts&&g.stats.uploads===before.uploads,'static city view reuses layout and GPU buffers');
  v.renderer.info.reset();v.renderer.render(g.group,s.spaceCamera);
  check(v.renderer.info.render.calls<=6&&g.stats.visible<=96,'cities retain six-draw and 96-label limits');
  const scene=s.sceneShare.capture();set('geoCities',false);set('geoCityTier',1);await wait();
  check($('geoCityTier').disabled&&live().every(p=>p.kind==='capital'),'city off leaves independent capitals');
  await s.sceneShare.importScene(scene);await wait();
  check(e.settings.geoCities&&e.settings.geoCityTier===3&&$('geoCityTier').value==='3'&&!$('geoCityTier').disabled,'scene restores city controls and tier');
  const saved=JSON.parse(localStorage.getItem('tiangong-environment-v1'));
  check(saved.geoCities&&saved.geoCityTier===3,'city choices persist locally');
  set('geographyEnabled',false);await wait();const inactive=g.stats.layouts;await wait();
  check(!g.group.visible&&g.stats.layouts===inactive&&$('geoCityTier').disabled,'master off stops city updates');
  set('geographyEnabled',true);set('geoCityTier',1);set('geoDensity',.5);
  for(const key of ['geoCapitals','geoCountries','geoMarine','geoLandforms','geoRivers','geoLakes'])set(key,true);
  $('languageZh').click();point(108,32);await wait();
  document.querySelector('[data-memory-key="geography"]').open=true;
  check(!v.renderer.getContext().getError(),'city rendering has no WebGL errors');
  return {checks,candidatesByTier:counts,atlasSide:g.atlasSide};
 });
}
