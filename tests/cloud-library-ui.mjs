// Offline DOM regression for the real library UI, with no network or renderer.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('..',import.meta.url));
const result = await build({
  stdin: {
    contents: "export {mountCloudHistory} from './src/cloud-history.js'; export {CloudLibrary} from './src/cloud-library.js';",
    resolveDir: repo,
    loader: 'js',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { mountCloudHistory, CloudLibrary } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const created = [];
class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.options = [];
    this.isConnected = true;
    this.events = {};
    this.open = false;
    this.hidden = false;
    created.push(this);
  }
  append(...items) { for(const item of items)item.parentElement=this;this.children.push(...items); }
  get textContent(){return this.children.map(x=>x.nodeValue??x.textContent??'').join('');}
  set textContent(value){this.children=[{nodeValue:String(value),isConnected:true,parentElement:this}];}
  replaceChildren(...items) { this.children = items; }
  setAttribute(key, value) { this[key] = value; }
  add(option) { this.options.push(option); }
  addEventListener(type, callback) { this.events[type] = callback; }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.close?.(); }
}
globalThis.document = {
  head: new Element('head'),
  body: new Element('body'),
  createElement: tag => new Element(tag),
  createTextNode: text => ({ nodeValue: text, isConnected: true }),
  getElementById: id => created.find(element => element.id === id),
};
globalThis.Option = class {
  constructor(text, value) { this.text = text; this.value = value; }
};
let decodes = 0;
globalThis.createImageBitmap = async () => { decodes++; return { close() {} }; };
globalThis.OffscreenCanvas = class {
  getContext() { return { drawImage() {} }; }
  async convertToBlob() { return new Blob(['preview']); }
};
const record = {
  id: 'saved', kind: 'cloud', provider: 'satcorps',
  time: Date.UTC(2026, 9, 23, 12), sha256: 'a'.repeat(64), blob: new Blob(['map']),
};
const weather = {
  items: [record], active: { cloud: record.id }, settings: { cloud: 'history' },
  env: { settings: {} }, sim: {}, render() {}, protectedIds() { return []; },
};
const library = weather.cloudLibrary = new CloudLibrary(weather);
library.task = { state: 'running', message: 'background download' };
library.loadSaved = async () => { library.notify(); return library.saved; };
const ui = mountCloudHistory(weather);
ui.open();
await new Promise(resolve => setImmediate(resolve));
const dialog = document.getElementById('cloudHistoryDialog');
const image = created.find(element => element.tagName === 'img');
assert.equal(image.hidden, false, 'the first opening displays its selected saved-image preview');
assert.equal(decodes, 1);

dialog.close();
library.notify(); // Real subscription, as triggered by background download progress.
assert.equal(image.hidden, true);
assert.equal(decodes, 1, 'a closed dialog must not decode or mark a preview as generated');
ui.open();
await new Promise(resolve => setImmediate(resolve));
assert.equal(image.hidden, false, 'reopening after background progress must restore the selected-image preview');
assert.equal(decodes, 2, 'the reopened dialog must generate the preview invalidated by close');
console.log('PASS: real cloud-history mount closes, receives background progress, and regenerates the selected preview on reopen.');

// State notifications and translation updates must preserve nested filter controls.
library.refreshCatalog=async(month)=>{library.catalog={state:'ready',month,date:'',items:[],dates:['2026-10-23']};library.notify();};
document.getElementById('cloudDownloadTab').onclick();
const provider=document.getElementById('cloudDownloadSource'),quick=document.getElementById('cloudQuickDownload');
assert.equal(provider.value,'github');
library.task={state:'idle'};library.notify();
assert.equal(quick.disabled,false,'GitHub works without the local service');
provider.value='gmgsi';provider.onchange();
assert.equal(quick.disabled,true,'the NOAA processor needs the local service');
provider.value='himawari';provider.onchange();
assert.equal(quick.disabled,true,'Himawari conversion is offered through the desktop service');
provider.value='gdps';provider.onchange();
assert.equal(quick.disabled,false,'GDPS downloads through the browser');
provider.value='satcorps';provider.onchange();
const month=document.getElementById('historyMonth'),day=document.getElementById('historyDate');
assert(month.parentElement.children.includes(month),'render must preserve the month input inside its label');
assert(day.parentElement.children.includes(day),'render must preserve the date select inside its label');
library.notify();
assert(month.parentElement.children.includes(month));assert(day.parentElement.children.includes(day));
console.log('PASS: live library rendering preserves date controls nested in translated labels.');
