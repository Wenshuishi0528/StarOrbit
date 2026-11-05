async page=>{
 const check=(yes,m)=>{if(!yes)throw Error(m);};const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1360,height:900});
 await page.waitForFunction(()=>window.viewer?.sim?.initialized&&viewer.sim.observations&&viewer.sim.flightLab?.observeSurveyTile,null,{timeout:90000});
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 const {time,fields}=await page.evaluate(()=>{
  const sim=viewer.sim;const original=document.querySelector('.survey-live-dialog');if(original?.open)original.close();sim.seek(sim.data.rows[Math.floor(sim.data.rows.length*.45)][0]);sim.paused=true;sim.update(performance.now());
  const n=Math.hypot(...sim.current.position),radial=sim.current.position.map(v=>v/n);
  const stars=[['orion',83.8,-5.4],['cygnus',305.5,40.3],['andromeda',10.7,41.3],['leo',168,17],['carina',161,-59.7],
   ['sagittarius',280,-23],['pleiades',56.8,24.1],['pegasus',344,15],['virgo',186,12]];const D=Math.PI/180;
  const fields=stars.map(([id,ra,dec])=>[id,[Math.cos(dec*D)*Math.cos(ra*D),Math.cos(dec*D)*Math.sin(ra*D),Math.sin(dec*D)].reduce((sum,v,i)=>sum+v*radial[i],0)]).sort((a,b)=>b[1]-a[1]);
  sim.flightLab.open('survey');return {time:sim.time,fields};
 });
 const clearField=fields[0][0],earthField=fields.at(-1)[0],lab=page.locator('#surveyPanel'),scope=page.locator('#xuntianScope');
 const scrub=lab.locator('[data-survey=clock]'),select=lab.locator('[data-survey=coverage-field]');
 await select.selectOption(clearField);await scrub.fill('42');const training=await page.evaluate(()=>viewer.sim.flightLab.panels.survey.getObservationRecord().record);
 await lab.locator('[data-survey=send-tile]').click();await scope.waitFor();
 const ready=()=>page.waitForFunction(()=>viewer.sim.xuntian.active&&viewer.sim.xuntian.pointing.locked&&!!viewer.sim.xuntian.result&&Number(document.querySelector('#xtCanvas').dataset.xuntianFrame)>1,null,{timeout:50000});
 await ready();await scope.locator('#xtPhotoWidth').selectOption('1440');const ids=[];
 async function capture(field,tile){
  const count=await page.evaluate(async([fieldId,tile])=>(await viewer.sim.observations.list({kind:'survey-photo',fieldId,tile})).length,[field,tile]);
  await scope.locator('#xtSurveyTiles button').nth(tile).click();await ready();
  await scope.locator('#xtSurveyCapture').click();
  await page.waitForFunction(()=>!document.querySelector('#xtSurveyCapture').disabled,null,{timeout:90000});
  const now=await page.evaluate(async([fieldId,tile])=>(await viewer.sim.observations.list({kind:'survey-photo',fieldId,tile})).length,[field,tile]);
  check(now>count,'Tile was not saved: '+await scope.locator('#xtSurveyNote').innerText());
  return page.evaluate(async([fieldId,tile])=>{
   const [r]=await viewer.sim.observations.list({kind:'survey-photo',fieldId,tile});const img=await viewer.sim.observations.image(r.id),thumb=await viewer.sim.observations.thumbnail(r.id);
   return {id:r.id,time:r.time,coverage:r.coverage,png:img.type,bytes:img.size,thumb:!!thumb,orbit:!!r.orbitRef,width:r.width};
  },[field,tile]);
 }
 for(let i=0;i<4;i++){
  const row=await capture(clearField,i);ids.push(row.id);check(row.time===time&&row.png==='image/png'&&row.bytes>20000&&row.width===1440&&row.orbit,'Missing original, timestamp or archived orbit');
  check(row.coverage.sky>.95&&Math.abs(Object.values(row.coverage).slice(0,4).reduce((a,b)=>a+b,0)-1)<.01,'Clear tile coverage was lost');
 }
 const again=await capture(clearField,0);check(again.id!==ids[0],'Retake replaced original');
 await scope.locator('#xtSurveyWall').click();await lab.locator('[data-survey=live-wall]').waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('.survey-live-card')].every(c=>c.dataset.record));
 const elapsed=await scrub.inputValue();check(elapsed==='42','Opening the live wall rewound the teaching clock');
 await page.evaluate(([field,id])=>viewer.sim.flightLab.panels.survey.showLivePhotos(field,id),[clearField,ids[0]]);
 await page.waitForFunction(id=>document.querySelector('[data-live-tile=A]').dataset.record===id,ids[0]);
 await lab.locator('[data-live-tile=A] .survey-live-picture').click();await lab.locator('.survey-live-dialog').waitFor({state:'visible'});check(await lab.locator('.survey-live-dialog').evaluate(d=>d.open),'Original photograph did not open');await lab.locator('.survey-live-dialog button').last().click();
 const saving=page.waitForEvent('download',{timeout:45000});await lab.locator('[data-survey=live-export]').click();const sheet=await saving;
 check(sheet.suggestedFilename().includes('4of4'),'Incomplete sheet filename');await sheet.saveAs('output/playwright/lab100-survey-live-four.png');
 await lab.locator('[data-survey=live-field]').selectOption(earthField);await lab.locator('[data-live-tile=D] [data-survey=live-observe]').click();await ready();
 const obscured=await capture(earthField,3);check(obscured.coverage.earth>.90&&obscured.coverage.sky<.02,'Earth-target screenshot was marked clear');
 await scope.locator('#xtSurveyWall').click();await page.waitForFunction(()=>document.querySelector('[data-live-tile=D]')?.dataset.record);
 check(await lab.locator('.survey-live-card[data-record=""]').count()===3,'Missing cells were filled by a synthetic image');
 const partial=page.waitForEvent('download');await lab.locator('[data-survey=live-export]').click();await (await partial).saveAs('output/playwright/lab100-survey-live-partial.png');
 const restored=await page.evaluate(async training=>{
  const sim=viewer.sim,lab=sim.flightLab.panels.survey,a=lab.getObservationRecord();const saved=await sim.observations.save(a.record,{orbit:a.orbit});
  const orbit=await sim.observations.orbit(saved.orbitRef);lab.restoreObservationRecord(training,{orbit});
  const b=lab.getObservationRecord().record;return {time:sim.time,elapsed:b.elapsed,jobs:b.jobs,field:b.fieldId};
 },training);
 check(restored.time===time&&restored.elapsed===training.elapsed&&restored.field===training.fieldId&&JSON.stringify(restored.jobs)===JSON.stringify(training.jobs),'Teaching record recovery changed data or main clock');
 // Move the actual companion along a clear arc so the assembled station lies
 // in front of the selected star field, using the public orbital placement control.
 await page.evaluate(fieldId=>viewer.sim.flightLab.observeSurveyTile({fieldId,tile:0}),clearField);
 await ready();
 const original=await page.evaluate(()=>{
  const sim=viewer.sim,form=sim.xuntian.formation,p=sim.xuntian.pointing.axes.forward,q=sim.current;
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),unit=a=>a.map(n=>n/Math.hypot(...a)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const radial=unit(q.position),along=unit(q.velocity.map((v,i)=>v-radial[i]*dot(q.velocity,radial))),normal=unit(cross(radial,along));
  const before=form.getState(),old=unit(before.offset),wanted=[along,normal,radial].map(v=>-dot(v,p)),dist=760;
  const angle=Math.acos(Math.min(1,Math.max(-1,dot(old,wanted)))),sn=Math.sin(angle);form.setOffset(old.map(v=>v*dist));
  for(let j=1;j<=12;j++){const k=j/12,dir=old.map((v,i)=>(v*Math.sin((1-k)*angle)+wanted[i]*Math.sin(k*angle))/sn);form.setOffset(dir.map(v=>v*dist));}
  return before;
 });
 let station;
 try{
  await page.waitForTimeout(450);station=await capture(clearField,0);
  check(station.coverage.station>.005&&station.coverage.sky>.02,'Real station and gaps missing from target coverage');
 }finally{
  await page.evaluate(old=>{const f=viewer.sim.xuntian.formation;if(old.automatic)f.restoreSuggested();else f.setOffset(old.offset);},original);
 }
 await scope.locator('#xtSurveyWall').click();
 await page.setViewportSize({width:390,height:844});await page.evaluate(([field,id])=>viewer.sim.flightLab.panels.survey.showLivePhotos(field,id),[clearField,ids[0]]);
 await page.waitForFunction(id=>document.querySelector('[data-live-tile=A]').dataset.record===id,ids[0]);
 const fits=await lab.locator('[data-survey=live-wall]').evaluate(e=>e.scrollWidth<=e.clientWidth+2);check(fits,'Wall overflowed the narrow screen');check(!errors.length,errors.join('\n'));
 return {time,clearField,earthField,ids,obscured:obscured.coverage,station:station.coverage,retake:again.id,narrow:fits};
}
