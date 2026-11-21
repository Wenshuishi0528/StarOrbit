// Offline DOM regression for the real library UI, with no network or renderer.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const result = await build({
  stdin: {
    contents:
      "export {mountCloudHistory} from './src/cloud-history.js'; export {CloudLibrary} from './src/cloud-library.js';",
    resolveDir: repo,
    loader: 'js',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { mountCloudHistory, CloudLibrary } = await import(
  'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
);
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
  append(...items) {
    for (const item of items) item.parentElement = this;
    this.children.push(...items);
  }
  get textContent() {
    return this.children.map((x) => x.nodeValue ?? x.textContent ?? '').join('');
  }
  set textContent(value) {
    this.children = [{ nodeValue: String(value), isConnected: true, parentElement: this }];
  }
  replaceChildren(...items) {
    this.children = items;
  }
  removeAttribute(key) { delete this[key]; }
  setAttribute(key, value) {
    this[key] = value;
  }
  add(option) {
    this.options.push(option);
  }
  addEventListener(type, callback) {
    this.events[type] = callback;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.events.close?.();
  }
}
globalThis.document = {
  head: new Element('head'),
  body: new Element('body'),
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => ({ nodeValue: text, isConnected: true }),
  getElementById: (id) => created.find((element) => element.id === id),
};
globalThis.Option = class {
  constructor(text, value) {
    this.text = text;
    this.value = value;
  }
};
let decodes = 0;
globalThis.createImageBitmap = async () => {
  decodes++;
  return { close() {} };
};
globalThis.OffscreenCanvas = class {
  getContext() {
    return { drawImage() {} };
  }
  async convertToBlob() {
    return new Blob(['preview']);
  }
};
const record = {
  id: 'saved',
  kind: 'cloud',
  provider: 'satcorps',
  time: Date.UTC(2026, 9, 23, 12),
  sha256: 'a'.repeat(64),
  blob: new Blob(['map']),
};
const weather = {
  items: [record],
  active: { cloud: record.id },
  settings: { cloud: 'history' },
  env: { settings: {} },
  sim: {},
  render() {},
  protectedIds() {
    return [];
  },
};
const library = (weather.cloudLibrary = new CloudLibrary(weather));
library.task = { state: 'running', message: 'background download' };
library.loadSaved = async () => {
  library.notify();
  return library.saved;
};
const ui = mountCloudHistory(weather);
ui.open();
await new Promise((resolve) => setImmediate(resolve));
const dialog = document.getElementById('cloudHistoryDialog');
const image = created.find((element) => element.tagName === 'img');
assert.equal(image.hidden, false, 'the first opening displays its selected saved-image preview');
assert.equal(decodes, 1);

dialog.close();
library.notify(); // Real subscription, as triggered by background download progress.
assert.equal(image.hidden, true);
assert.equal(decodes, 1, 'a closed dialog must not decode or mark a preview as generated');
ui.open();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(
  image.hidden,
  false,
  'reopening after background progress must restore the selected-image preview'
);
assert.equal(decodes, 2, 'the reopened dialog must generate the preview invalidated by close');
console.log(
  'PASS: real cloud-history mount closes, receives background progress, and regenerates the selected preview on reopen.'
);

// State notifications and translation updates must preserve nested filter controls.
library.refreshCatalog = async (month) => {
  library.catalog = { state: 'ready', month, date: '', items: [], dates: ['2026-10-23'] };
  library.notify();
};
document.getElementById('cloudDownloadTab').onclick();
const provider = document.getElementById('cloudDownloadSource'),
  quick = document.getElementById('cloudQuickDownload');
assert.equal(provider.value, 'github');
library.task = { state: 'idle' };
library.notify();
assert.equal(quick.disabled, false, 'GitHub works without the local service');
provider.value = 'gmgsi';
provider.onchange();
assert.equal(quick.disabled, true, 'the NOAA processor needs the local service');
provider.value = 'himawari';
provider.onchange();
assert.equal(quick.disabled, true, 'Himawari conversion is offered through the desktop service');
provider.value = 'gdps';
provider.onchange();
assert.equal(quick.disabled, false, 'GDPS downloads through the browser');
provider.value = 'satcorps';
provider.onchange();
const month = document.getElementById('historyMonth'),
  day = document.getElementById('historyDate');
assert(
  month.parentElement.children.includes(month),
  'render must preserve the month input inside its label'
);
assert(
  day.parentElement.children.includes(day),
  'render must preserve the date select inside its label'
);
library.notify();
assert(month.parentElement.children.includes(month));
assert(day.parentElement.children.includes(day));
console.log('PASS: live library rendering preserves date controls nested in translated labels.');

// Real view: coverage and quality are distinct; unknown/partial maps stay out,
// while a same-hash disk sidecar can supply metadata missing from the browser.
const full = {
  ...record,
  coverage: 0.9983,
  polarCoverage: { north: 0.9999, south: 0.9994 },
  footprint: { global: 0.9997, north: 0.9999, south: 0.9996 },
  quality: { schema: 1, status: 'rejected', reasons: ['high-opacity-plateau'] },
};
library.disk = [{ ...full, disk: 'global.png' }];
weather.items = [
  record,
  { ...full, id: 'partial', time: record.time + 3600e3, sha256: 'b'.repeat(64), coverage: 0.25 },
  { ...record, id: 'unknown', time: record.time + 7200e3, sha256: 'c'.repeat(64) },
  { ...full, id: 'other', provider: 'gdps', sha256: 'd'.repeat(64) },
];
const globalTab = document.getElementById('cloudGlobalTab');
globalTab.onclick();
let shown = document.getElementById('cloudArchiveList').children;
assert.equal(shown.length, 1);
assert(shown[0].textContent.includes('全球覆盖'));
assert(
  shown[0].textContent.includes('亮度平台可能异常'),
  'quality warning survives the global-coverage filter'
);
assert.equal(globalTab.textContent, 'NASA 全球覆盖（1）');
assert.equal(document.getElementById('historyApply').hidden, false);
assert.equal(document.getElementById('cloudGlobalInfo').hidden, false);
library.notify();
assert.equal(document.getElementById('cloudArchiveList').children.length, 1);
library.disk = [];
library.notify();
assert.equal(globalTab.textContent, 'NASA 全球覆盖（0）');
assert(document.getElementById('cloudArchiveList').textContent.includes('不代表官方档案没有'));
document.getElementById('cloudSavedTab').onclick();
assert.equal(
  document.getElementById('cloudArchiveList').children.length,
  4,
  'all saved maps remain accessible'
);
assert.equal(document.getElementById('cloudGlobalInfo').hidden, true);
console.log(
  'PASS: NASA global view separates valid coverage, missing metadata and quality hints without losing saved maps.'
);

// Explicit deletion is available even for a protected, favourite, active map.
weather.items = [{ ...record, favorite: true }];
weather.protectedIds = () => [record.id];
library.task = { state: 'idle' };
library.notify();
const remove = document.getElementById('historyRemove');
assert.equal(remove.hidden, false);
assert.equal(remove.disabled, false);
let requested, confirmation;
globalThis.confirm = (text) => {
  confirmation = text;
  return false;
};
library.remove = async (row) => {
  requested = row;
};
remove.onclick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(requested, undefined, 'cancelling confirmation preserves the map');
assert(confirmation.includes('内置静态云图'));
assert(confirmation.includes('已收藏'));
globalThis.confirm = () => true;
remove.onclick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(requested.record.id, record.id);
weather.items = [];
library.disk = [{ ...record, disk: 'saved.png' }];
library.notify();
assert.equal(remove.hidden, false, 'disk-only versions expose deletion');
assert.equal(remove.disabled, false);
library.task = { state: 'running' };
library.notify();
assert.equal(remove.disabled, true, 'active downloads cannot race deletion');
console.log(
  'PASS: manual deletion confirms active/favourite versions, includes disk-only maps, and does not use automatic retention guards.'
);

// Undownloaded remote estimates are filterable before any full image exists.
weather.items=[];library.disk=[];
provider.value='satcorps';
document.getElementById('cloudDownloadTab').onclick();
const remoteTime=Date.parse(month.value+'-02T12:00:00Z');
const estimated=(n,coverage,north=1,south=1)=>({provider:'satcorps',time:remoteTime+n*3600e3,date:month.value+'-02',slot:String(12+n),coverageCheck:{state:'ready',estimated:true,coverage,polarCoverage:{north,south}}});
library.catalog={state:'ready',month:month.value,date:'',dates:[],items:[estimated(0,.98),estimated(1,.2),estimated(2,.999,.4),{provider:'satcorps',time:remoteTime+4*3600e3,coverageCheck:{state:'queued',estimated:true}}]};
library.notify();
const coverageFilter=document.getElementById('historyCoverageFilter');
assert.equal(document.getElementById('cloudArchiveList').children.length,4);
assert(document.getElementById('cloudArchiveList').textContent.includes('正在自动核查覆盖'));
coverageFilter.value='global';coverageFilter.onchange();
assert.equal(document.getElementById('cloudArchiveList').children.length,1);
assert(document.getElementById('cloudArchiveList').textContent.includes('98.0%'));
assert.equal(document.getElementById('historyApply').hidden,true);
library.catalog.items[3].coverageCheck={state:'ready',estimated:true,coverage:.999,polarCoverage:{north:1,south:1}};library.notify();
assert.equal(document.getElementById('cloudArchiveList').children.length,2,'polling progress enters filtered results without a download');
console.log('PASS: remote estimates, partial/polar exclusions and automatic filter updates before download.');

// A slow preview must not replace the next selected observation.
coverageFilter.value = 'all';
const pendingPreviews = [];
weather.fetch = (url, max, {signal}) => new Promise((resolve) => {
  pendingPreviews.push({url, signal, resolve});
});
const remoteRows = [estimated(0,.98), estimated(1,.96)].map((r) => ({
  ...r, preview: 'https://satcorps.larc.nasa.gov/' + r.slot + '.gif',
}));
library.catalog.items = remoteRows;
library.notify();
const archiveRows = document.getElementById('cloudArchiveList').children;
archiveRows[0].onclick();
archiveRows[1].onclick();
const previousPreview = pendingPreviews.at(-2);
const selectedPreview = pendingPreviews.at(-1);
assert.equal(previousPreview.signal.aborted, true);
assert.equal(selectedPreview.url, remoteRows[0].preview);
selectedPreview.resolve({blob:new Blob(['GIF89a-current'])});
await new Promise((resolve) => setImmediate(resolve));
assert.equal(image.hidden, false);
const selectedImage = image.src;
previousPreview.resolve({blob:new Blob(['GIF89a-old'])});
await new Promise((resolve) => setImmediate(resolve));
assert.equal(image.src, selectedImage);
assert.equal(document.getElementById('historyApply').hidden, true);
console.log('PASS: only the selected NASA observation preview is shown before download.');

library.task = {state: 'running', message: '下载中', downloadPercent: 42};
library.notify();
const bar = created.find((el) => el.tagName === 'progress');
assert.equal(bar.value, 42);
assert.equal(bar.hidden, false);
assert.match(document.getElementById('cloudDownloadStatus').textContent, /42%/);
library.task.downloadPercent = null;
library.notify();
assert.equal(bar.value, undefined);
assert(!document.getElementById('cloudDownloadStatus').textContent.includes('%'));
for (const state of ['error', 'cancelled']) {
  library.task = {state, message: state, downloadPercent: 42}; library.notify();
  assert.equal(bar.hidden, true);
  assert(!document.getElementById('cloudDownloadStatus').textContent.includes('%'));
}
library.task = {state:'ready',message:'已保存'};library.notify();
assert.match(document.getElementById('cloudDownloadStatus').textContent,/100%/);
const {cloudTransfer} = await import('../src/cloud-download-progress.js');
const transfers = [];
const receive = cloudTransfer((...args)=>transfers.push(args),'下载中');
for (const [received,total] of [[5,10],[5,10],[7,10],[500000,null],[10,10]]) receive({received,total});
assert.deepEqual(transfers,[['下载中',50],['下载中',70],['下载中 · 0.5 MB',null],['下载中',100]]);
