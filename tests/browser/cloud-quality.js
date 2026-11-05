async page=>{
 const checks=[],check=(condition,name)=>{if(!condition)throw Error(name);checks.push(name);};
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized&&!viewer.sim.environment.loading);
 await page.evaluate(async()=>{await viewer.sim.environment.weather.ready;await viewer.sim.environment.weather.nasaRestore;viewer.music.pause();document.getElementById('welcomeDialog')?.close();});
 check(await page.locator('#cloudSource option[value=latest]').isDisabled(),'GitHub source is visibly paused');
 await page.evaluate(()=>viewer.sim.environment.weather.resourcePanel.open('cloud'));
 await page.locator('#resourceCloudProvider').selectOption('github');
 check(await page.getByRole('button',{name:'检查 GitHub 云图更新',exact:true}).isDisabled(),'unreliable source cannot be downloaded');
 check(await page.getByText('GitHub 图源含地表信号和镜像极区，无法可靠还原云层，已暂停下载与应用。历史文件仍可预览、导出和删除。',{exact:true}).count()===1,'source limitation is explained');
 const seeded=await page.evaluate(async()=>{
  const w=viewer.sim.environment.weather,meta=await(await fetch('/output/cloud84/meta.json')).json();delete meta.quality;
  const fixture=async(name,path,age)=>{const blob=await(await fetch(path)).blob(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');const r={...meta,kind:'cloud',id:name,blob,sha256:hash,time:meta.time-age,downloaded:Date.now()-age,size:blob.size,favorite:false};await w.cache.put(r);return r;};
  await fixture('qa-good','/output/cloud84/good-fixture.png',86400000);await fixture('qa-bad','/output/cloud84/real-bad.png',0);
  w.settings.cloud='satcorps';w.save();return true;
 });check(seeded,'legacy good and actual defective frames seeded in isolated test origin');
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized&&!viewer.sim.environment.loading);
 await page.evaluate(async()=>{await viewer.sim.environment.weather.ready;await viewer.sim.environment.weather.nasaRestore;viewer.music.pause();document.getElementById('welcomeDialog')?.close();});
 const result=await page.evaluate(()=>{const w=viewer.sim.environment.weather;return {active:w.active.cloud,rows:w.items.filter(r=>r.id.startsWith('qa-')).map(r=>({id:r.id,quality:r.quality})),bound:w.env.uniforms.cloudMap.value===w.cloudTexture,error:viewer.renderer.getContext().getError()};});
 check(result.active==='qa-good'&&result.bound,'legacy good frame remains displayed after newer bad frame is quarantined');
 check(result.rows.find(r=>r.id==='qa-good').quality.status==='accepted','legacy good frame automatically revalidated');
 const bad=result.rows.find(r=>r.id==='qa-bad');check(bad.quality.status==='rejected'&&bad.quality.reasons.includes('high-opacity-plateau'),'actual NASA block rejected while original remains in archive');
 check(Math.abs(bad.quality.metrics.plateauFraction-.014202117919921875)<1e-10,'browser PNG sampling matches Python actual-frame metrics');
 check(result.error===0,'no WebGL errors');
 await page.evaluate(()=>{const w=viewer.sim.environment.weather;w.resourcePanel.open('cloud');w.settings.cloudDownloadProvider='satcorps';w.render();document.querySelector('[data-memory-key=downloads]').open=true;w.renderHistory();});
 check(await page.locator('#weatherHistory .snapshot-card').filter({hasText:'此云图未通过质量检查'}).getByRole('button',{name:'使用此版本',exact:true}).isDisabled(),'rejected archive cannot be applied');
 await page.screenshot({path:'output/cloud84/resource-quality.png'});
 return checks;
}
