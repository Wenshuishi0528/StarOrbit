// Run through playwright-cli against the built viewer, on a separate test profile.
async page=>{
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 return await page.evaluate(async()=>{
  const v=viewer,s=v.sim,e=s.environment,c=e.starChart,$=id=>document.getElementById(id),results=[];
  const check=(pass,name,detail={})=>{results.push({name,pass:!!pass,...detail});if(!pass)throw Error(name);};
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const frames=async n=>{for(let i=0;i<n;i++)await frame();};
  const set=(id,value)=>{const node=$(id);if(node.type==='checkbox')node.checked=value;else node.value=String(value);node.dispatchEvent(new Event(node.type==='range'?'input':'change',{bubbles:true}));};
  const point=(ra,dec)=>{const cam=s.spaceCamera,r=ra*Math.PI/180,d=dec*Math.PI/180,dir=cam.position.clone().set(Math.cos(r)*Math.cos(d),Math.sin(r)*Math.cos(d),Math.sin(d));cam.position.copy(dir).multiplyScalar(20000);cam.up.set(0,0,1);s.orbitControls.target.copy(cam.position).addScaledVector(dir,20000);s.orbitControls.stopMotion();s.orbitControls.update();s.render();};
  try{
   v.music.audio.pause();s.seek(1792673220000);s.setView('orbit');s.update(performance.now());point(85,5);
   set('starChartEnabled',true);set('starNames',true);set('constellationNames',true);set('constellationLines',true);set('constellationBoundaries',false);set('starLabelScope','major');set('starLabelDensity',.55);await frames(20);
   check(c.group.visible&&c.lines.visible&&!c.boundaries.visible,'shared sky chart enables names and constellation lines');
   check([...c.shown.values()].some(p=>p.text==='猎户座')&&[...c.shown.values()].some(p=>p.text==='参宿四'),'Orion and Betelgeuse align with the existing J2000 star field');
   const live=[...c.shown.values()].filter(p=>p.out===undefined);
   check(live.every((p,i)=>live.every((q,j)=>i===j||p.rect.x>=q.rect.x+q.rect.w||p.rect.x+p.rect.w<=q.rect.x||p.rect.y>=q.rect.y+q.rect.h||p.rect.y+p.rect.h<=q.rect.y)),'visible labels avoid one another');
   check(c.atlasSide<=2048&&c.stats.visible<=96,'label atlas and display count stay bounded',{atlas:c.atlasSide,visible:c.stats.visible});
   const before={...c.stats};await frames(30);
   check(c.stats.layouts===before.layouts&&c.stats.uploads===before.uploads,'stationary view reuses layout and GPU buffers',{frames:30,layouts:c.stats.layouts-before.layouts,uploads:c.stats.uploads-before.uploads});
   set('constellationBoundaries',true);s.render();
   check(c.boundaries.visible&&[...c.boundaries.geometry.attributes.position.array].every(Number.isFinite),'constellation boundaries use finite spherical geometry');
   const r=v.renderer,renderCalls=()=>{r.info.reset();e.renderBackground(r);return r.info.render.calls;};
   const withChart=renderCalls();c.group.visible=false;const without=renderCalls();s.render();
   check(withChart-without<=3,'all chart graphics use at most three draw calls',{extraDrawCalls:withChart-without});
   set('starLabelScope','all');await frames(15);const allCandidates=c.stats.candidates;
   set('starLabelScope','major');await frames(15);check(allCandidates>=c.stats.candidates,'expanded name range includes additional named or designated stars',{all:allCandidates,major:c.stats.candidates});
   set('starLabelScope','classic');await frames(15);
   check(c.classic.length===3&&c.classic.some(p=>p.zh==='牛郎星')&&c.classic.some(p=>p.zh==='织女星')&&c.classic.some(p=>p.id===11767&&p.zh==='北极星'&&p.en==='Polaris'),'classic preset contains exactly the three requested labels');
   check(!c.lines.visible&&!c.boundaries.visible&&[...c.shown.values()].filter(p=>p.out===undefined).every(p=>c.classic.some(x=>x.key===p.key)),'classic preset suppresses full constellation overlays');
   check($('constellationLines').disabled&&$('starLabelDensity').disabled,'classic controls match the effective display');
   point(285,30);await frames(20);check([...c.shown.values()].some(p=>p.text==='织女星'),'classic label appears at Vega');
   const polaris=c.classic.find(p=>p.id===11767);point(polaris.ra,polaris.dec);await frames(20);check([...c.shown.values()].some(p=>p.id===11767&&p.text==='北极星'),'classic label appears at Polaris rather than an asterism center');
   const geometry=c.labels.geometry,layouts=c.stats.layouts;set('starChartEnabled',false);await frames(20);
   check(!c.group.visible&&c.stats.layouts===layouts&&c.labels.geometry===geometry,'disabled chart performs no layout or uploads');
   set('starChartEnabled',true);set('starLabelScope','major');point(85,5);await frames(20);
   $('languageEn').click();await frames(20);check([...c.shown.values()].some(p=>p.text==='Orion')&&[...c.shown.values()].some(p=>p.text==='Betelgeuse'),'English sky labels use the shared language setting');
   $('languageZh').click();await frames(20);check(c.stats.atlasBuilds===before.atlasBuilds+2,'language changes replace one shared glyph atlas',{builds:c.stats.atlasBuilds});
   // Point into Earth. The same label directions are rejected by CPU and GPU masks.
   const cam=s.spaceCamera;cam.position.set(0,0,20000);s.orbitControls.target.set(0,0,0);s.orbitControls.stopMotion();s.orbitControls.update();s.render();await frames(20);
   const blocked=[...c.shown.values()].filter(p=>p.out===undefined&&p.dir.dot(c.uniforms.earthDisc.value)>c.uniforms.earthDisc.value.w);
   check(blocked.length===0,'Earth hides star-label anchors');
   const saved={...e.settings};await s.missions.switchTo('dfh1');s.seek(1792813648325);s.update(performance.now());s.render();
   check(e.starChart===c&&e.settings.starChartEnabled===saved.starChartEnabled&&e.settings.starLabelScope===saved.starLabelScope,'spacecraft switch reuses the chart and preferences');
   // Rays to an actual visible mesh must hide labels even if their text would extend past the hull.
   s.setView('follow');v.fit(null,[1,-1,.6]);s.update(performance.now());s.render();await frames(15);
   c.prepareOccluders();let blockedRay=false;
   for(const record of c.occluders){const center=record.box.getCenter(v.camera.position.clone()),local=center.sub(v.camera.position).normalize(),basis=s.current.basis,world=local.clone().set(local.x*basis[0][0]+local.y*basis[1][0]+local.z*basis[2][0],local.x*basis[0][1]+local.y*basis[1][1]+local.z*basis[2][1],local.x*basis[0][2]+local.y*basis[1][2]+local.z*basis[2][2]);if(c.hiddenBySpacecraft(world)){blockedRay=true;break;}}
   check(blockedRay,'spacecraft geometry hides the complete anchored label');
   check(c.occluders.some(r=>r.mesh.geometry.boundsTree&&(r.mesh.geometry.index?.count||r.mesh.geometry.attributes.position.count)>6144),'large imported geometry reuses an acceleration tree for label occlusion');
   const scene=s.sceneShare.capture();set('starChartEnabled',false);await s.sceneShare.importScene(scene);s.render();
   check(e.settings.starChartEnabled===scene.environment.starChartEnabled&&$('starChartEnabled').checked===scene.environment.starChartEnabled&&e.settings.constellationBoundaries===scene.environment.constellationBoundaries,'scene round trip restores chart settings and controls');
   check(!v.renderer.info.programs.some(p=>p.diagnostics&&!p.diagnostics.runnable)&&v.renderer.getContext().getError()===0,'sky chart shaders compile without WebGL errors');
   e.save();const stored=JSON.parse(localStorage.getItem('tiangong-environment-v1'));check(stored.starLabelScope===e.settings.starLabelScope&&stored.starChartEnabled===e.settings.starChartEnabled,'shared chart preferences are persisted');
  }catch(error){results.push({pass:false,error:error.stack});}
  return results;
 });
}
