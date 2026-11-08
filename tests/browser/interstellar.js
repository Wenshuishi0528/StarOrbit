async () => {
  const sim = window.viewer.sim, world = sim.worldExplorer, renderer = viewer.renderer;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const checks = [], assert = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  const $ = s => document.querySelector('.interstellar-panel ' + s);
  const difference = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
  const previousPaused = sim.paused, previousMode = sim.mode;
  sim.paused = true; sim.mode = 'sim';
  world.close(); await wait(150);
  const initial = {...renderer.info.memory}, started = performance.now();
  world.open('stellar'); const entryMs = performance.now()-started;
  await wait(300);
  let view = world.interstellar;
  assert(view.status().count===19286,'19286 reliable-distance stars');
  const startTime = sim.time;
  $('[data-shortcut="hip:32349"]').click(); $('[data-go]').click();
  await wait(4100);
  let s=view.status();
  assert(!s.flight && s.nearest===s.selected && s.nearestDistance<0.000003,'Sirius travel arrives outside measured sphere');
  assert(sim.time===startTime,'Paused clock remains independent of travel');
  $('[data-sun]').click(); await wait(150);
  assert(view.status().selected===0,'Look back at Sun selects physical Sun');
  $('[data-dipper]').click(); await wait(150); const home=view.snapshot();
  assert(view.status().formationSegments===6,'Big Dipper uses all six physical segments');
  $('[data-side]').click(); await wait(150); const side=view.snapshot();
  assert(difference(home.position,side.position)>50,'Side view moves observer into space');
  $('[data-bookmark-name]').value='Audit waypoint'; $('[data-save]').click();
  const bookmark=$('[data-bookmarks]').value;
  $('[data-home]').click(); $('[data-bookmarks]').value=bookmark; $('[data-bookmarks]').dispatchEvent(new Event('change'));
  assert(difference(view.snapshot().position,side.position)<1e-9,'Waypoint restores spatial coordinates');
  assert(view.status().formation===side.formation,'Waypoint restores culture formation');
  // Shared pilot keys and focus ownership in the actual application.
  const canvas=renderer.domElement; canvas.focus();
  const before=view.snapshot();
  canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyH',bubbles:true,cancelable:true})); await wait(450);
  window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyH',bubbles:true}));
  assert(difference(before.position,view.snapshot().position)>0.01,'H advances observer');
  canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true,cancelable:true}));
  const stopped=view.snapshot(); await wait(180);
  assert(difference(stopped.position,view.snapshot().position)<1e-12,'Space brakes immediately');
  $('[data-search]').focus(); const typing=view.snapshot();
  $('[data-search]').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyH',bubbles:true})); await wait(160);
  assert(difference(typing.position,view.snapshot().position)<1e-12,'Typing does not move camera');
  for(const query of ['翼宿','翼火蛇','Sirius','HIP 32349']) {
    $('[data-search]').value=query; $('[data-search]').dispatchEvent(new Event('input')); await wait(220);
    assert(document.querySelectorAll('.interstellar-results button').length>0,query+' searchable');
  }
  $('[data-search]').value=''; $('[data-search]').dispatchEvent(new Event('input')); await wait(200);
  // Stars must remain a single draw batch; count actual rendered points.
  const oldAuto=renderer.info.autoReset; renderer.info.autoReset=false; renderer.info.reset();
  renderer.render(view.scene,view.camera);
  const draw={...renderer.info.render};renderer.info.autoReset=oldAuto;
  assert(draw.points===19287 && draw.calls<=3,'Star scene stays within three draw calls');
  const frames=[];let last=performance.now();
  await new Promise(resolve=>{function sample(now){frames.push(now-last);last=now;if(frames.length<120)requestAnimationFrame(sample);else resolve();}requestAnimationFrame(sample);});
  frames.sort((a,b)=>a-b);
  // Verify real PNG generation and label-free option without leaving a download.
  const oldBlob=HTMLCanvasElement.prototype.toBlob,oldClick=HTMLAnchorElement.prototype.click;
  let photo=null,resolvePhoto;const done=new Promise(r=>resolvePhoto=r);
  HTMLAnchorElement.prototype.click=function(){};
  HTMLCanvasElement.prototype.toBlob=function(callback,...args){return oldBlob.call(this,blob=>{photo={bytes:blob?.size,width:this.width,height:this.height,type:blob?.type};callback(blob);resolvePhoto();},...args);};
  try{document.querySelector('.world-bar [data-photo]').click();await Promise.race([done,wait(3000)]);assert(photo?.bytes>10000&&photo.type==='image/png','PNG photo generated');}
  finally{HTMLCanvasElement.prototype.toBlob=oldBlob;HTMLAnchorElement.prototype.click=oldClick;}
  $('[data-bookmarks]').value=bookmark; $('[data-remove]').click();
  const cycles=[];
  for(let i=0;i<4;i++){world.close();await wait(120);cycles.push({...renderer.info.memory});world.open('stellar');await wait(150);}
  assert(cycles.every(c=>c.geometries===cycles[0].geometries&&c.textures===cycles[0].textures),'Four view cycles release GPU geometry and preserve shared textures');
  world.close();await wait(150); assert(!world.active&&viewer.controls.enabled,'Closing restores orbit controls');
  world.open('solar');await wait(350);world.open('stellar');await wait(150);
  const fromSolar=world.interstellar.snapshot();world.open('solar');await wait(150);world.open('stellar');await wait(150);
  assert(difference(fromSolar.position,world.interstellar.snapshot().position)<1e-8,'Solar and interstellar round trip preserves camera position');
  const toSolar=world.interstellar.snapshot();
  assert(Math.abs(fromSolar.quaternion.reduce((sum,v,i)=>sum+v*toSolar.quaternion[i],0))>.99999,'Solar round trip preserves camera orientation');
  assert(renderer.getContext().getError()===0,'No WebGL error');
  world.close();sim.paused=previousPaused;sim.mode=previousMode;
  return {checks,entryMs,initial,cycles,draw,photo,frames:{samples:frames.length,medianMs:frames[60],p95Ms:frames[114]},browser:navigator.userAgent};
}
