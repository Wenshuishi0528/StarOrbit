import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dateTimeText, dateTimeValue, stepDateTime } from '../src/date-time-input.js';
// Exercise the actual UI lifecycle with a small DOM/canvas harness; astronomy and GPU
// rendering have separate numerical tests. Delayed promises reproduce real-clock races.
class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this._value = '';
    this.textContent = '';
    this.checked = true;
    this.clientWidth = 1000;
    this.clientHeight = 600;
    this.width = 1000;
    this.height = 600;
    this.classList = { toggle() {}, contains: () => false };
  }
  set value(v) {
    this._value = String(v);
  }
  get value() {
    return this._value;
  }
  append(...items) {
    this.children.push(...items);
  }
  prepend(...items) {
    this.children.unshift(...items);
  }
  replaceChildren(...items) {
    this.children = [...items];
    if (this.tag === 'select' && items.length) this.value = items[0].value;
  }
  remove() {}
  focus() {}
  setSelectionRange() {}
  click() {}
  querySelector(s) {
    if (!nodes.has(s))
      nodes.set(s, new Element(/body|layer|compare|view/.test(s) ? 'select' : 'div'));
    return nodes.get(s);
  }
  querySelectorAll() {
    return [];
  }
  getContext() {
    return context2d;
  }
  toBlob(fn) {
    fn(null);
  }
}
const nodes = new Map(),
  drawn = [];
const context2d = {
  measureText: (s) => ({ width: s.length * 6 }),
  fillRect() {},
  drawImage() {},
  fillText: (s) => drawn.push(s),
};
const document = {
  head: new Element(),
  body: new Element(),
  activeElement: null,
  createElement: (tag) => new Element(tag),
  createTextNode: (s) => s,
  getElementById: () => null,
};
const canvas = new Element('canvas');
canvas.parentNode = new Element();
const presets = [],
  eventSearches = [],
  routes = [];
const sim = {
  api: {
    renderer: { domElement: canvas, getPixelRatio: () => 1, setSize() {} },
    controls: { enabled: true, stopMotion() {} },
    toast() {},
  },
  environment: {
    assets: {
      mars: {
        layers: {
          visible: { label: '可见光', credit: 'Viking credit' },
          geology: { label: '地质', credit: 'USGS geology credit' },
        },
      },
    },
    elevation: { setEnabled() {} },
  },
  time: Date.parse('2025-01-01'),
  mode: 'real',
  paused: false,
  speed: 60,
  timeUI() {},
  seek(time) {
    this.time = time;
    this.mode = 'custom';
    this.paused = true;
  },
  realTime() {
    this.mode = 'real';
    this.time = Date.now();
    this.paused = false;
  },
  worldExplorer: {
    close() {},
    open(...args) {
      routes.push(args);
    },
    openGround(...args) {
      routes.push(args);
    },
  },
  mainFlight: { stop() {} },
  flightLab: { close() {} },
};
const sandbox = {
  document,
  window: { matchMedia: () => ({ matches: false }) },
  Option: class extends Element {
    constructor(text, value) {
      super();
      this.textContent = text;
      this.value = value;
    }
  },
  performance: { now: () => 1000 },
  Date,
  AbortController,
  console,
  URL,
  setTimeout,
  dateTimeText,
  dateTimeValue,
  stepDateTime,
  t: (s) => s,
  getLanguage: () => 'zh',
  onLanguageChange: () => () => {},
  lastObserver: () => ({ name: '北京', latitude: 39.9, longitude: 116.4, height: 50 }),
  rememberObserver: () => true,
  sampleElevationBase: () => null,
  searchWorldPlaces: () => [],
  atlas: { labels: [] },
  geologyLegend: { units: [] },
  MARS_FEATURES: [],
  findPlanetaryEvents: (args) => new Promise((resolve) => eventSearches.push({ args, resolve })),
  planetaryComparisonDates: (args) => new Promise((resolve) => presets.push({ args, resolve })),
  createPlanetaryRenderer: () => ({
    loading: false,
    focus() {},
    dispose() {},
    project: () => null,
    frame(s, b, w, h) {
      return {
        a: { settings: s, rect: { x: 0, y: 0, width: b ? w / 2 : w, height: h } },
        b: b
          ? { settings: { ...s, ...b }, rect: { x: w / 2, y: 0, width: w / 2, height: h } }
          : null,
      };
    },
  }),
};
const source = readFileSync(new URL('../src/planetary-observatory.js', import.meta.url), 'utf8')
  .replace(/^import .*?;\n/gms, '')
  .replace('export function installPlanetaryObservatory', 'function installPlanetaryObservatory');
vm.createContext(sandbox);
vm.runInContext(source + '\nglobalThis.install=installPlanetaryObservatory;', sandbox);
const ui = sandbox.install(sim),
  $ = (key) => nodes.get(key);
ui.open('Mars');
sim.time += 1000;
presets[0].resolve([{ time: Date.parse('2027-02-19'), label: '下次冲' }]);
await new Promise(setImmediate);
assert.equal(
  $('[data-date-presets]').children.length,
  1,
  'realtime advancement must not discard date presets'
);
$('[data-time]').value = '2025-01-02 00:00:00';
$('[data-jump]').onclick();
const obsolete = presets.at(-1);
ui.open('Earth');
assert.equal(obsolete.args.signal.aborted, true);
obsolete.resolve([{ time: sim.time, label: 'stale' }]);
await new Promise(setImmediate);
assert.equal($('[data-date-presets]').children.length, 0);
ui.open('Mars');
$('[data-time]').value = '2025-0';
$('[data-time]').oninput();
ui.tick(2000, 0.1);
assert.equal($('[data-time]').value, '2025-0', 'typed date stays untouched by frame updates');
sim.paused = false;
sim.mode = 'custom';
const before = sim.time;
ui.tick(2400, 0.1);
assert.equal(sim.time, before + 6000, 'custom clock advances at shared simulation speed');
$('[data-event-body]').value = 'Jupiter';
let task = $('[data-event-search]').onclick();
const event = eventSearches.at(-1);
event.resolve([
  {
    body: 'Jupiter',
    title: '木卫一凌木星',
    time: sim.time,
    observableTime: sim.time + 10000,
    accuracyLabel: '几何估计',
  },
]);
await task;
const eventTime = sim.time + 10000;
$('.planet-events').children[0].onclick();
assert.equal(sim.time, eventTime);
assert.equal(sim.paused, true);
assert.deepEqual(JSON.parse(JSON.stringify(routes.at(-1))), [
  'solar',
  { target: 'Jupiter', system: 'Jupiter' },
]);
ui.open('Mars');
task = $('[data-event-search]').onclick();
eventSearches.at(-1).resolve([{ body: 'Sun', title: '日食', time: sim.time }]);
await task;
$('.planet-events').children[0].onclick();
assert.equal(routes.at(-1)[1].body, 'Sun');
assert.equal(routes.at(-1)[0].name, '北京');
ui.open('Mars');
$('[data-compare]').value = 'layer';
$('[data-layer-b]').value = 'geology';
$('[data-fov]').value = '45';
$('[data-photo]').onclick();
assert.ok(drawn.some((s) => s.includes('Viking credit')));
assert.ok(
  drawn.some((s) => s.includes('USGS geology credit')),
  'both exported columns retain their own attribution'
);
assert.ok(
  drawn.filter((s) => s.includes('UTC+8')).length >= 4,
  'both on-image captions and footer dates are exported'
);
const pending = $('[data-event-search]').onclick();
const cancelled = eventSearches.at(-1);
ui.close();
cancelled.resolve([{ body: 'Mars', title: 'stale', time: sim.time }]);
await pending;
assert.equal(sim.api.controls.enabled, true);
assert.equal(canvas.parentNode.children.includes(canvas), true);
ui.dispose();
console.log(
  'Planetary observatory: realtime preset races, cancellation, date drafts, shared clock, event destinations, dual-column photo dates/sources and control restoration passed.'
);
