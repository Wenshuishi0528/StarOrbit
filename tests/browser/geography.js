// Run with playwright-cli on the isolated development viewer.
async page=>{
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 return await page.evaluate(async()=>{
  const v=viewer,s=v.sim,e=s.environment,g=e.geography,$=id=>document.getElementById(id),results=[];
  const check=(pass,name,detail={})=>{results.push({name,pass:!!pass,...detail});if(!pass)throw Error(name);};
  const frames=async n=>{for(let i=0;i<n;i++)await new Promise(r=>requestAnimationFrame(r));};
  const set=(id,value)=>{const el=$(id);el.type==='checkbox'?el.checked=value:el.value=String(value);el.dispatchEvent(new Event(el.type==='range'?'input':'change',{bubbles:true}));};
  const point=(lon,lat,distance=20000)=>{const r=lon*Math.PI/180,d=lat*Math.PI/180,p=s.spaceCamera.position.clone().set(Math.cos(d)*Math.cos(r),Math.cos(d)*Math.sin(r),Math.sin(d)).applyQuaternion(e.earth.quaternion);s.spaceCamera.position.copy(p).multiplyScalar(distance);s.spaceCamera.up.set(0,0,1);s.orbitControls.target.set(0,0,0);s.orbitControls.stopMotion();s.orbitControls.update();s.render();};
  try{
   v.music.audio.pause();s.seek(1792673220000);s.setView('orbit');s.update(performance.now());point(108,32);
   check(!e.settings.geographyEnabled&&!g.labels,'first launch allocates no geography GPU resources');
   check(document.querySelector('[data-memory-key="star-chart"]').parentElement.id==='settings-annotations'&&document.querySelector('[data-memory-key="geography"]').parentElement.id==='settings-annotations','geography and star chart are siblings at the second menu level');
   set('geographyEnabled',true);await frames(25);
   check(g.group.visible&&g.labels&&g.lines.china.visible,'shared globe overlay enables labels and official China outline');
   check([...g.shown.values()].some(p=>p.id==='beijing'&&p.text==='北京'),'Beijing anchor is visible in China view');
   check(g.items.find(p=>p.id==='beijing').marker==='star'&&g.glyphs.has('★')&&g.labels.geometry.attributes.tint.array.some((v,i,a)=>i%3===0&&v>.9&&a[i+1]<.1),'Beijing uses the red five-pointed-star glyph');
   const live=[...g.shown.values()].filter(p=>p.out===undefined);
   check(live.every((p,i)=>live.every((q,j)=>i===j||p.rect.x>=q.rect.x+q.rect.w||p.rect.x+p.rect.w<=q.rect.x||p.rect.y>=q.rect.y+q.rect.h||p.rect.y+p.rect.h<=q.rect.y)),'labels avoid text collisions');
   check(live.every(p=>p.position.dot(g.uniforms.localCamera.value)/6374>6371),'backside and below-horizon anchors are hidden');
   check(live.some(p=>p.kind==='landform')&&live.some(p=>p.kind==='marine'),'default density includes major landforms and seas alongside countries and capitals');
   const stage=s.api.stage.getBoundingClientRect(),reserved=['telemetry','orbitMinimap'].map(id=>{const b=$(id).getBoundingClientRect();return {x:b.x-stage.x,y:b.y-stage.y,w:b.width,h:b.height};});
   check(live.every(p=>reserved.every(r=>p.rect.x>=r.x+r.w||p.rect.x+p.rect.w<=r.x||p.rect.y>=r.y+r.h||p.rect.y+p.rect.h<=r.y)),'labels leave telemetry and minimap areas clear');
   check(g.stats.visible<=96&&g.atlasSide<=2048,'visible count and glyph atlas have bounded size',{atlas:g.atlasSide,visible:g.stats.visible});
   check([...g.glyphs.values()].every(p=>p.x>=0&&p.y>=0&&p.x+40<=g.atlasSide&&p.y+40<=g.atlasSide),'every complete glyph cell stays inside the atlas texture');
   await frames(45);const before={...g.stats};await frames(35);check(g.stats.layouts===before.layouts&&g.stats.uploads===before.uploads&&g.stats.lookups===before.lookups,'paused static view reuses layouts, buffers and location lookup',{delta:Object.fromEntries(Object.keys(before).map(k=>[k,g.stats[k]-before[k]]))});
   const r=v.renderer,camera=s.spaceCamera;r.info.reset();r.render(g.group,camera);check(r.info.render.calls<=6,'all geography layers use at most six draw calls',{drawCalls:r.info.render.calls});
   set('geoBorders',false);s.render();check(!g.lines.china.visible&&!g.lines.borders.visible&&!g.lines.offshore.visible,'boundary switch controls global, China and offshore lines');
   set('geoRivers',false);set('geoLakes',false);await frames(20);check(!g.lines.rivers.visible&&!g.lines.lakes.visible&&![...g.shown.values()].some(p=>['river','lake'].includes(p.kind)&&p.out===undefined),'river and lake switches control names and geometry');
   set('geoBorders',true);set('geoRivers',true);set('geoLakes',true);
   g.lastLocation=-Infinity;g.updateLocation({...s.current,latitude:39.9042,longitude:116.4074},performance.now()/1000,'zh');check($('minimapLocation').textContent.includes('中国')&&$('minimapLocation').textContent.includes('北京'),'current-location readout identifies Beijing');
   set('geoLocation',false);s.render();check($('minimapLocation').hidden,'location readout can be hidden independently');set('geoLocation',true);
   const total=g.stats.layouts;set('geographyEnabled',false);await frames(20);check(!g.group.visible&&g.stats.layouts===total&&$('minimapLocation').hidden,'master off stops rendering, layouts and readout');
   set('geographyEnabled',true);$('languageEn').click();await frames(20);check([...g.shown.values()].some(p=>p.id==='beijing'&&p.text==='Beijing'),'English labels and Beijing anchor use shared language');$('languageZh').click();await frames(20);
   const shared=g;await s.missions.switchTo('dfh1');s.seek(1792813648325);s.update(performance.now());s.render();check(e.geography===shared&&e.settings.geographyEnabled,'model switch retains the shared atlas and settings');
   const scene=s.sceneShare.capture();set('geographyEnabled',false);set('geoDensity',.1);await s.sceneShare.importScene(scene);s.render();check(e.settings.geographyEnabled&&$('geographyEnabled').checked&&e.settings.geoDensity===scene.environment.geoDensity,'scene import restores geography settings and controls');
   s.setView('follow');v.fit(null,[1,-1,.6]);s.update(performance.now());await frames(20);
   const record=s.shadowCache.records[0],oldPosition=record.object.position.clone();record.object.position.x+=.1;record.object.updateMatrixWorld(true);g.lastLayout=-Infinity;
   const layoutBefore=g.stats.layouts;g.update(s.current,s.spaceCamera);check(g.stats.layouts>layoutBefore,'paused spacecraft geometry movement refreshes complete-label occlusion');record.object.position.copy(oldPosition);record.object.updateMatrixWorld(true);
   check(!v.renderer.info.programs.some(p=>p.diagnostics&&!p.diagnostics.runnable)&&v.renderer.getContext().getError()===0,'overview and follow shaders compile without WebGL errors');
   e.save();const saved=JSON.parse(localStorage.getItem('tiangong-environment-v1'));check(saved.geographyEnabled&&saved.geoDensity===e.settings.geoDensity,'geography preferences persist in the shared environment');
   s.setView('orbit');s.update(performance.now());point(108,32);await frames(20);
   return results;
  }catch(error){results.push({pass:false,error:error.stack});return results;}
 });
}
