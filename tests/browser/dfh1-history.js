async page=>{
 const checks=[],check=(pass,name)=>{if(!pass)throw Error(name);checks.push(name);},cut=Date.parse('2000-01-01T00:00:00+08:00');
 await page.waitForFunction(()=>window.viewer?.sim.initialized);
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();await page.evaluate(()=>viewer.music.pause());
 await page.selectOption('#missionSelect','dfh1');await page.waitForFunction(()=>viewer.sim.missionId==='dfh1'&&!viewer.sim.missions.busy);await page.evaluate(()=>viewer.music.pause());
 await page.selectOption('#hourCycle','24');await page.locator('#customDate').fill('1970-04-25');await page.locator('#customTime').fill('20:29:00');await page.locator('#setTime').click();
 await page.waitForFunction(()=>viewer.sim.current?.t===Date.parse('1970-04-25T12:29:00Z'));
 check(await page.locator('#gpStatus').textContent()==='历史轨道 · 1970 年新华社公报','historical time uses historical orbit');
 check(await page.locator('#dataRange').textContent().then(x=>x.includes('439 km')&&x.includes('2384 km')&&x.includes('68.5°')&&x.includes('114')),'all four historical parameters shown');
 check(await page.locator('#officialOrbitLink').getAttribute('href').then(x=>x.includes('xinhuanet')),'historical source link selected');
 check(await page.evaluate(()=>Math.abs(viewer.sim.current.altitude-2337.393320293362)<1e-6),'rendered position matches historical state');
 await page.evaluate(cut=>{const s=viewer.sim;window.historyOrbitData=s.data;s.timeline.settings.autoPause=false;s.timeline.settings.visible=true;s.timeline.settings.expanded=true;s.timeline.settings.hours=3;s.environment.settings.groundTrack=true;s.seek(cut-1);s.setView('orbit');s.update(performance.now());s.timeline.update(performance.now(),true);},cut);
 await page.waitForFunction(()=>viewer.sim.timeline.cache.result?.transitions?.length===1&&viewer.sim.environment.track.geometry.attributes.position?.count>0);
 check(await page.evaluate(()=>viewer.sim.lastOrbitSegment==='historical'&&viewer.sim.orbitLine.isLineSegments&&viewer.sim.environment.track.isLineSegments),'3D orbit and ground track use separate segments');
 check(await page.evaluate(()=>viewer.sim.orbitLine.geometry.attributes.position.count===558),'3D orbit omits the cross-era connecting edge');
 await page.waitForFunction(()=>new Set(viewer.sim.minimap.points.map(p=>p[3])).size===2);
 check(await page.evaluate(()=>new Set(viewer.sim.minimap.points.map(p=>p[3])).size===2),'minimap marks both eras in a crossing window');
 check(await page.evaluate(()=>{const tl=viewer.sim.timeline,tr=tl.cache.result.transitions[0],f=(tr.time+1000-tl.range.start)/(tl.range.end-tl.range.start)*100,band=[...document.getElementById('eventBands').children].find(e=>parseFloat(e.style.left)<=f&&parseFloat(e.style.left)+parseFloat(e.style.width)>f);return band?.classList.contains(tr.phase); }),'timeline resets shadow phase at the transition');
 await page.evaluate(cut=>{viewer.sim.seek(cut);viewer.sim.update(performance.now());},cut);
 check(await page.evaluate(()=>viewer.sim.lastOrbitSegment==='current'&&viewer.sim.data===window.historyOrbitData),'exact boundary switches without replacing current data');
 check(await page.locator('#officialOrbitLink').getAttribute('href').then(x=>x.includes('celestrak')),'current source restored at cutoff');
 await page.evaluate(cut=>{const s=viewer.sim;s.seek(cut-300);s.paused=false;s.speed=1;s.lastWall=performance.now()-1000;s.update(performance.now());},cut);
 check(await page.evaluate(cut=>viewer.sim.time>cut&&!viewer.sim.paused&&viewer.sim.lastOrbitSegment==='current',cut),'running playback crosses year 2000 without pausing');
 await page.evaluate(cut=>{const s=viewer.sim;s.seek(cut);s.timeStep=1000;s.stepTime(-1);s.update(performance.now());},cut);
 check(await page.evaluate(()=>viewer.sim.lastOrbitSegment==='historical'),'backward time step returns to historical orbit');
 await page.selectOption('#missionSelect','tiangong');await page.waitForFunction(()=>viewer.sim.missionId==='tiangong'&&!viewer.sim.missions.busy);
 check(await page.evaluate(()=>viewer.sim.lastOrbitSegment==='current'),'other spacecraft retain their own orbit');
 await page.selectOption('#missionSelect','dfh1');await page.waitForFunction(()=>viewer.sim.missionId==='dfh1'&&!viewer.sim.missions.busy);
 await page.evaluate(()=>{viewer.music.pause();viewer.sim.seek(Date.parse('1970-05-01T11:05Z'));viewer.sim.sessionMemory.save();});
 await page.reload();await page.waitForFunction(()=>window.viewer?.sim.initialized);await page.evaluate(()=>viewer.music.pause());
 check(await page.evaluate(()=>viewer.sim.missionId==='dfh1'&&viewer.sim.lastOrbitSegment==='historical'&&viewer.sim.time===Date.parse('1970-05-01T11:05Z')),'saved historical scene time restores correct orbit');
 for(const [id,text] of [['languageEn','Historical orbit'],['languageRu','Историческая орбита'],['languageFr','Orbite historique']]){await page.locator('#'+id).click();check((await page.locator('#gpStatus').textContent()).includes(text),'historical status translated '+id);}
 await page.locator('#languageZh').click();await page.screenshot({path:'output/playwright/dfh1-history051.png'});
 return checks;
}
