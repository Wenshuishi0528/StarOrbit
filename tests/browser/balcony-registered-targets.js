async page=>{
  const ok=(value,message)=>{if(!value)throw Error(message);};
  await page.waitForFunction(()=>window.viewer?.sim.flightLab&&window.viewer?.sim.xuntian);
  const id='balcony-fixture-'+Date.now().toString(36);
  const lab=page.locator('#flightLab'),bal=page.locator('#balconyPanel'),target=bal.locator('[data-id=dataset]');
  if(await page.locator('#welcomeDialog').evaluate(el=>el.open))await page.locator('#skipTour').click();
  if(await lab.isVisible())await page.locator('#closeFlightLab').click();
  // Register a genuinely new GLB-only mission through the application's file input.
  const vertices=Buffer.alloc(36);
  [0,0,0,2,0,0,0,2,0].forEach((v,i)=>vertices.writeFloatLE(v,i*4));
  const model={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:36}],
    bufferViews:[{buffer:0,byteLength:36,target:34962}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[2,2,0]}]};
  const json=Buffer.from(JSON.stringify(model)),padded=(json.length+3)&~3,glb=Buffer.alloc(12+8+padded+8+vertices.length);
  glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
  glb.writeUInt32LE(padded,12);glb.writeUInt32LE(0x4e4f534a,16);glb.fill(32,20,20+padded);json.copy(glb,20);
  glb.writeUInt32LE(vertices.length,20+padded);glb.writeUInt32LE(0x004e4942,24+padded);vertices.copy(glb,28+padded);
  const task={format:'tiangong-mission-1',id,name:'独立阳台验证星',category:'测试',model:{file:'viewer.glb',metresPerUnit:1,forwardAxis:'+X',normalAxis:'+Z'},orbit:{}};
  await page.locator('#missionFiles').setInputFiles([
    {name:'task.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(task))},
    {name:'viewer.glb',mimeType:'model/gltf-binary',buffer:glb}
  ]);
  await page.waitForFunction(id=>viewer.sim.missionId===id&&!viewer.sim.missions.busy,id,{timeout:45000});
  ok(await page.evaluate(()=>viewer.sim.data===null),'Model-only mission unexpectedly has ephemeris');
  await page.locator('#missionSelect').selectOption('tiangong');await page.waitForFunction(()=>viewer.sim.missionId==='tiangong'&&!viewer.sim.missions.busy);
  const initial=await page.evaluate(()=>({source:viewer.sim.data.source,first:viewer.sim.data.rows[0][0]}));
  if(!await page.locator('#openFlightLab').isVisible()&&await page.locator('#toolsToggle').isVisible())await page.locator('#toolsToggle').click();
  await page.locator('#openFlightLab').click();await page.locator('#balconyTab').click();
  await target.selectOption('tiangong');
  const site=bal.locator('[data-id=config]');if(!await site.evaluate(el=>el.open))await site.locator('summary').click();
  await bal.locator('[data-id=beijing]').click();
  await page.waitForFunction(()=>document.querySelector('#balconyPanel [data-id=passes]').options.length>0);
  await target.selectOption('dfh1');await page.waitForFunction(()=>!document.querySelector('#balconyPanel [data-id=predict]').disabled);
  ok((await bal.locator('[data-id=context]').textContent()).includes('东方红一号'),'Selected spacecraft not used by the sky');
  const beforeChange=await page.evaluate(()=>viewer.sim.time);
  await target.selectOption(id);await page.waitForFunction(id=>document.querySelector('#balconyPanel [data-id=dataset]').value===id&&!document.querySelector('#balconyPanel [data-id=predict]').disabled,id);
  ok(await bal.locator('[data-id=passes]').evaluate(n=>n.options.length===0),'Previous target left stale passes');
  ok((await bal.locator('[data-id=context]').textContent()).includes(task.name),'Wrong name for registered target');
  ok(await bal.locator('[data-id=sky]').isVisible(),'Site sky disappeared with a model-only mission');
  const radius=7171,n=Math.sqrt(398600.4418/radius**3),inclination=55*Math.PI/180,start=Date.now()-6*3600000;
  const orbit={missionId:id,source:'Synthetic test orbit '+id,frame:'EME2000',center:'EARTH',timeSystem:'UTC',units:'km, km/s',created:new Date(start).toISOString(),rows:[]};
  for(let i=0;i<60*80;i++){const t=i*60,phi=n*t,c=Math.cos(phi),s=Math.sin(phi);
    orbit.rows.push([start+t*1000,radius*c,radius*s*Math.cos(inclination),radius*s*Math.sin(inclination),-radius*n*s,radius*n*c*Math.cos(inclination),radius*n*c*Math.sin(inclination)]);
  }
  const upload=async data=>{
    const panel=bal.locator('[data-id=sourcePanel]');if(await panel.count()&&!await panel.evaluate(n=>n.open))await panel.locator('summary').click();
    const input=bal.locator('[data-id=orbitFile]');
    // Set the chosen file via the real change handler, without opening an OS picker in an automated browser.
    await input.evaluate(el=>{el.click=()=>{};});
    try {await bal.locator('[data-id=importTarget]').click();
      await input.setInputFiles({name:'test-orbit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    } finally {await input.evaluate(el=>{delete el.click;});}
  };
  await upload({...orbit,missionId:'tiangong'});
  await page.waitForFunction(()=>document.querySelector('#balconyPanel [data-id=status]').textContent.includes('其他任务'));
  ok(await page.evaluate(async id=>(await viewer.sim.orbits.selectionData(id)).data===null,id),'Wrong-target import was accepted');
  await upload(orbit);
  await page.waitForFunction(id=>document.querySelector('#balconyPanel [data-id=coverageText]').textContent.includes(id)&&document.querySelector('#balconyPanel [data-id=passes]').options.length>0,id,{timeout:60000});
  const recipe=await page.evaluate(()=>viewer.sim.flightLab.panels.balcony.getObservationRecord());
  ok(recipe.record.missionId===id&&recipe.orbit.source===orbit.source&&recipe.record.observer.latitude===39.9042,'Incorrect orbit/site after import');
  ok(recipe.record.profile.length>4,'Target switch discarded the saved skyline');
  const after=await page.evaluate(()=>({main:viewer.sim.missionId,time:viewer.sim.time,source:viewer.sim.data.source,first:viewer.sim.data.rows[0][0]}));
  ok(after.main==='tiangong'&&after.source===initial.source&&after.first===initial.first&&after.time===beforeChange,'Changing balcony targets changed main mission, ephemeris or clock');
  await lab.locator('[data-observation-action=save]').click();
  await page.waitForFunction(async id=>(await viewer.sim.observations.list({kind:'balcony'})).some(r=>r.missionId===id),id);
  const stored=await page.evaluate(async id=>(await viewer.sim.observations.list({kind:'balcony'})).find(r=>r.missionId===id),id);
  await target.selectOption('dfh1');
  await lab.locator('[data-observation-action=browse]').click();
  await lab.locator('[data-observation-id="'+stored.id+'"] [data-observation-action=restore]').click();
  await page.waitForFunction(id=>!document.querySelector('.obs-journal').open&&document.querySelector('#balconyPanel [data-id=dataset]').value===id,id);
  const restored=await page.evaluate(()=>viewer.sim.flightLab.panels.balcony.getObservationRecord());
  ok(restored.record.time===stored.time&&restored.orbit.source===orbit.source,'Archival replay lost target, time or source');
  const result={target:id,main:after.main,archive:stored.id,events:recipe.record.passStart!==undefined,source:orbit.source,skyline:recipe.record.profile.length};
  return result;
}
