// Normal simulator entry point. The timeline's numeric value is authoritative
// for both map clicks and keyboard gestures; map time is checked in reverse too.
export async function inspectSurveyOrbitOverview(page){
 const dialog=page.locator('#flightLab'),panel=page.locator('#surveyPanel');
 if(!await dialog.isVisible())await page.locator('#openFlightLab').click();
 await page.locator('#surveyTab').click();
 const map=panel.locator('[data-testid=survey-orbit-overview]'),canvas=map.locator('canvas'),clock=panel.locator('[data-survey=clock]');
 await map.locator('[data-orbit-view=normal]').click();await canvas.scrollIntoViewIfNeeded();
 const box=await canvas.boundingBox();if(!box)throw Error('Orbit map is hidden');
 const earthRadius=Math.min(box.height*.365,box.width*.326),cx=box.x+box.width/2,cy=box.y+box.height*.515;
 await page.mouse.click(cx,cy-earthRadius*6771/6371);
 const quarter=Number(await clock.inputValue());if(Math.abs(quarter-1386)>11)throw Error('Map pick did not select one-quarter orbit');
 await canvas.press('ArrowRight');
 if(Number(await clock.inputValue())!==quarter+60)throw Error('Map arrow did not advance the timeline');
 await clock.press('Home');
 if(await canvas.getAttribute('aria-valuenow')!=='0')throw Error('Timeline did not return the spacecraft to the orbit start');
 await map.locator('[data-orbit-view=oblique]').click();
 if(await map.locator('[data-orbit-view=oblique]').getAttribute('aria-pressed')!=='true')throw Error('Oblique orbit view was not selected');
 await map.locator('[data-orbit-view=equatorial]').click();
 if(await map.locator('[data-orbit-view=equatorial]').getAttribute('aria-pressed')!=='true'||await map.locator('[data-orbit-view=oblique]').getAttribute('aria-pressed')!=='false')throw Error('Equatorial view was not independently selected');
 await canvas.screenshot({path:'output/playwright/lab-survey-equatorial-plane.png'});
 await page.mouse.click(cx+earthRadius*6771/6371*Math.cos(35*Math.PI/180),cy);
 const ascending=Number(await clock.inputValue());
 await canvas.press('ArrowRight');if(Number(await clock.inputValue())!==Math.min(Number(await clock.getAttribute('max')),ascending+60))throw Error('Equatorial map lost clock navigation');
 const window=map.locator('.survey-ov-window-list button').first();
 if(await window.count()){
  const begin=Math.ceil(Number(await window.getAttribute('data-start')));await window.click();
  if(Number(await clock.inputValue())!==begin||await map.getAttribute('data-window-state')!=='clear')throw Error('Exposure window did not seek to its available arc');
 }
 await map.locator('[data-orbit-view=normal]').click();
 return {quarter,ascending,keyboardAndTimeline:true};
}
