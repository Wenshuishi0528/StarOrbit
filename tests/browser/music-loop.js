async page=>{
 const checks=[],check=(pass,name)=>{if(!pass)throw Error(name);checks.push(name);};
 await page.waitForFunction(()=>window.viewer?.sim.initialized);await page.evaluate(()=>viewer.music.ready);
 if(await page.locator('#welcomeDialog').evaluate(e=>e.open))await page.locator('#skipTour').click();
 await page.selectOption('#missionSelect','tiangong');await page.waitForFunction(()=>!viewer.music.broadcast);await page.locator('#musicOrb').click();
 const order=await page.evaluate(()=>[...viewer.music.state.order]);
 await page.evaluate(()=>viewer.music.select(viewer.music.state.order.at(-1),true));
 for(let i=0;i<order.length*2;i++){
  await page.waitForFunction(()=>!viewer.music.audio.paused&&viewer.music.audio.readyState>=2&&viewer.music.audio.seekable.length&&viewer.music.audio.seekable.end(0)>1);
  await page.evaluate(()=>{viewer.music.audio.currentTime=viewer.music.audio.duration-.08;});
  await page.waitForFunction(id=>viewer.music.current===id&&!viewer.music.audio.paused,order[i%order.length]);
 }
 check(true,'two complete playlist cycles including last-to-first continue playing');
 check(await page.evaluate(()=>document.getElementById('musicMeta').textContent.includes('列表循环')),'repeat status visible');
 await page.evaluate(()=>{const m=viewer.music;m.state.order=[m.current];m.render();});
 for(let i=0;i<2;i++){
  await page.waitForFunction(()=>viewer.music.audio.readyState>=2&&viewer.music.audio.seekable.length&&viewer.music.audio.seekable.end(0)>1);
  await page.evaluate(()=>viewer.music.audio.currentTime=viewer.music.audio.duration-.08);
  await page.waitForFunction(()=>viewer.music.audio.currentTime<2&&!viewer.music.audio.paused);
 }
 check(await page.evaluate(()=>viewer.music.audio.loop),'single-track playlist repeats natively');
 await page.evaluate(()=>viewer.music.pause());
 check(await page.evaluate(()=>viewer.music.audio.paused&&!viewer.music.wantPlayback),'manual pause stops loop');
 await page.evaluate(order=>{viewer.music.state.order=order;viewer.music.render();},order);
 await page.selectOption('#missionSelect','dfh1');await page.waitForFunction(()=>viewer.music.broadcast);
 check(await page.evaluate(()=>!viewer.music.audio.loop&&viewer.music.current==='mission-dfh1-broadcast'),'DFH1 keeps separate five-second-gap loop');
 await page.evaluate(()=>viewer.music.pause());
 return checks;
}
