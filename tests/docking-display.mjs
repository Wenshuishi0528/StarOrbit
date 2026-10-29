import assert from 'node:assert/strict';
import {installDockingDisplay} from '../src/docking-display.js';

class Element extends EventTarget{
 constructor(){super();this.classes=new Set();this.attributes={};this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
 setAttribute(key,value){this.attributes[key]=value;}
 focus(){this.focused=true;}
}
const dialog=new Element(),panel=new Element(),large=new Element(),fill=new Element();
panel.querySelector=selector=>selector.includes('large-view')?large:fill;
let cleared=0,language='';
const display=installDockingDisplay(dialog,panel,{t:key=>language+key,clearInput:()=>cleared++});
const escape=()=>{const event=new Event('cancel',{cancelable:true});dialog.dispatchEvent(event);return event.defaultPrevented;};
assert.equal(escape(),false,'normal Escape must be allowed to close the dialog');
large.onclick();assert(panel.classes.has('dock-expanded'));assert.equal(large.attributes['aria-pressed'],'true');
fill.onclick();assert(dialog.classes.has('dock-window-fill'));assert(large.disabled);
assert(escape());assert(!dialog.classes.has('dock-window-fill'));assert(panel.classes.has('dock-expanded'),'Esc from filled window restores previous large view');assert(fill.focused);
assert(escape());assert(!panel.classes.has('dock-expanded'));assert(large.focused);assert.equal(escape(),false);
fill.onclick();fill.onclick();assert(!panel.classes.has('dock-expanded'),'fill toggled from standard returns to standard');
large.onclick();language='translated: ';display.refresh();assert.equal(large.textContent,'translated: 标准视窗');
fill.onclick();display.reset();assert.equal(dialog.classes.size,0);assert.equal(panel.classes.size,0);assert(!large.disabled);assert.equal(escape(),false,'switching away must release Esc');
assert(cleared>=6,'layout changes release held controls');
large.onclick();display.dispose();assert.equal(dialog.classes.size,0);assert.equal(large.onclick,null);assert.equal(fill.onclick,null);assert.equal(escape(),false);
console.log('Docking size modes: restore stack, Escape, focus, input release, translation and cleanup passed');
