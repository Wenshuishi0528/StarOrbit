import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';

// A small real DOM fixture exercises focus, pointer capture and touch without
// loading the application's large textures or constructing a WebGL renderer.
export async function inspectFlightInput(page){
 const check=(value,message)=>{if(!value)throw Error(message);};
 const bundle=await build({stdin:{contents:`
  import {mountFreeFlightPanel} from './src/free-flight-panel.js';
  import {createFlightInputBuffer} from './src/main-flight-input.js';
  const input=createFlightInputBuffer(),actions=[];
  let state={selectedId:'ship:one',phase:'free',paused:false,rcsEnabled:true,angularDamping:false,
   crafts:[{id:'ship:one',label:'神舟'},{id:'ship:two',label:'天舟'}],elapsed:0};
  const panel=mountFreeFlightPanel({onInput:(value,{clear=false}={})=>clear?input.clear():input.set(value),
   onAction:(...args)=>actions.push(args)});
  panel.show(state);
  globalThis.fixture={panel,input,actions,set(patch){state={...state,...patch};panel.update(state);}};
 `,resolveDir:process.cwd()},bundle:true,format:'iife',write:false,logLevel:'silent'});
 await page.setContent('<!doctype html><html><head></head><body><input id="outside" aria-label="Outside field"></body></html>');
 await page.addStyleTag({content:await readFile(new URL('../../src/free-flight.css',import.meta.url),'utf8')});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const panel=page.locator('#freeFlightPanel'),take=()=>page.evaluate(()=>fixture.input.take());
 const idle=value=>![...value.rotation,...value.translation,Number(value.brake),Number(value.temporarySas)].some(Boolean);
 await panel.focus();await page.keyboard.press('w');
 check(JSON.stringify((await take()).rotation)==='[0,-1,0]','A short W press disappeared before the physics tick');
 check(idle(await take()),'Released W remained active');
 await page.keyboard.down('f');check((await take()).temporarySas,'Held F did not enable temporary SAS');
 await page.keyboard.up('f');check(!(await take()).temporarySas,'F stayed active after release');
 check((await page.evaluate(()=>fixture.actions)).length===0,'Temporary SAS mutated a persistent action');
 await page.keyboard.press('r');await page.keyboard.press('t');await page.keyboard.press('CapsLock');
 check(JSON.stringify(await page.evaluate(()=>fixture.actions))==='[["rcs-toggle"],["damping"],["fine"]]','KSP toggle bindings changed');
 const settings=panel.locator('.ff-settings').first();await settings.locator('summary').click();
 const field=settings.locator('input').first();
 await panel.focus();await page.keyboard.down('w');await field.focus();
 check(idle(await take()),'Focusing an internal parameter field failed to cancel held/queued thrust');
 await page.keyboard.up('w');await page.keyboard.press('s');await page.keyboard.press('r');
 check(idle(await take()),'Typing in a parameter field generated flight input');
 check((await page.evaluate(()=>fixture.actions)).length===3,'Typing R in a parameter field toggled RCS');
 await panel.focus();await page.keyboard.press('s');await page.locator('#outside').focus();
 check(idle(await take()),'Leaving the panel retained a queued short tap');
 await panel.focus();await page.keyboard.press('s');await page.evaluate(()=>fixture.set({paused:true}));
 check(idle(await take()),'Pausing left a pending command');
 await page.keyboard.press('w');check(idle(await take()),'Paused controls accepted thrust');
 await page.evaluate(()=>fixture.set({paused:false}));await panel.focus();await page.keyboard.press('h');
 await page.evaluate(()=>fixture.set({selectedId:'ship:two'}));check(idle(await take()),'Craft switching transferred a pending command');
 await page.evaluate(()=>fixture.set({rcsEnabled:false}));await panel.focus();await page.keyboard.press('h');
 check(idle(await take()),'Disabled RCS accepted translation');
 await page.keyboard.press('s');check((await take()).rotation[1]===1,'RCS off also disabled attitude wheels');
 await page.evaluate(()=>fixture.set({rcsEnabled:true}));
 await page.setViewportSize({width:390,height:780});
 await page.evaluate(()=>{document.querySelector('.ff-inputs').open=true;document.querySelector('.ff-settings').open=false;});
 const thrust=panel.locator('[data-flight-control=up]');await thrust.scrollIntoViewIfNeeded();
 const box=await thrust.boundingBox();check(box?.height>=38,'Touch controls are too small');
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 check((await take()).translation[2]===1,'Pointer press did not apply upward thrust');
 await page.mouse.move(389,0);await page.mouse.up();check(idle(await take()),'Releasing outside the captured button left thrust active');
 const layout=await panel.boundingBox();check(layout.x>=0&&layout.x+layout.width<=390,'Mobile flight panel overflows horizontally');
 await page.evaluate(()=>fixture.panel.dispose());
 return {shortTap:true,temporarySas:true,editableIsolation:true,pausedIsolation:true,craftSwitch:true,rcsGate:true,pointerRelease:true,mobile:true};
}
