import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { PerspectiveCamera, Vector3 } from 'three';
import { createPassSampler, predictionSource } from '../src/pass-prediction.js';
import { orbitFromGP } from '../src/gp-orbit.js';

const bundle = await build({
  stdin: {
    contents:
      "export * from './src/ground-star-satellites.js'; export { groundCelestialFrame } from './src/ground-world-sky.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const {
  createGroundSatelliteOverlay,
  groundSatelliteSourceMode,
  paintGroundSatellites,
  GROUND_SATELLITE_LEVELS,
  groundSatelliteGroup,
  groundCelestialFrame,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);
const site = { latitude: 39.9042, longitude: 116.4074, height: 50 };
const css = { ...JSON.parse(readFileSync('assets/orbit.json')), missionId: 'tiangong' };
const dfh1 = JSON.parse(readFileSync('assets/spacecraft/dfh1-orbit.json'));
const sim = { missionId: 'tiangong', data: css, bundledOrbits: { tiangong: css, dfh1 } };
const time = Date.parse('2026-11-04T09:58:30Z'),
  width = 1024,
  height = 768;
const prediction = createPassSampler(predictionSource(css), site);
const pass = prediction(time),
  DEG = Math.PI / 180;
const close = (a, b, tolerance) => assert.ok(Math.abs(a - b) < tolerance, a + ' vs ' + b);
function ray(az, el) {
  return new Vector3(
    Math.sin(az * DEG) * Math.cos(el * DEG),
    Math.cos(az * DEG) * Math.cos(el * DEG),
    Math.sin(el * DEG)
  );
}
function aim(az, el, roll = 0, fov = 65, w = width, h = height) {
  const camera = new PerspectiveCamera(fov, w / h, 0.1, 50);
  camera.up.set(0, 0, 1);
  camera.lookAt(ray(az, el));
  camera.rotateZ(roll);
  camera.updateMatrixWorld();
  return camera;
}
const stage = { time, site, width, height, camera: aim(pass.azimuth, pass.elevation) };
const overlay = createGroundSatelliteOverlay(sim);
const cssRow = (options = {}) =>
  overlay.sample({ ...stage, ...options }).find((row) => row.id === 'tiangong');
const row = cssRow();
assert.ok(row.candidate && row.lines[1].includes('当地天色已暗'));
assert.equal(row.mode, 'catalog');
for (const key of ['azimuth', 'elevation', 'range']) close(row[key], pass[key], 1e-7);
close(row.sunElevation, pass.sunElevation, 0.00002);
close(row.x, width / 2, 1e-6);
close(row.y, height / 2, 1e-6);
assert.equal(row.alpha, 1);
assert.ok(row.rect);
assert.ok(cssRow({ labelLevel: 'detailed' }).lines[2].includes('459 km'));
assert.equal(cssRow({ labelLevel: 'compact' }).lines.length, 1);
assert.equal(cssRow({ minElevation: pass.elevation + 0.5 }), undefined);
assert.ok(
  cssRow({ minElevation: pass.elevation - 1.5 }).alpha > 0.49 &&
    cssRow({ minElevation: pass.elevation - 1.5 }).alpha < 0.51
);
let masked;
assert.equal(
  cssRow({
    blocked: (x, y) => {
      masked = [x, y];
      return true;
    },
  }),
  undefined
);
close(masked[0], 0, 1e-6);
close(masked[1], 0, 1e-6);
assert.equal(cssRow({ camera: aim(pass.azimuth + 180, -pass.elevation) }), undefined);
const tilted = aim(pass.azimuth + 10, pass.elevation - 5, 0.48);
const expected = ray(pass.azimuth, pass.elevation).project(tilted);
const turned = cssRow({ camera: tilted });
close(turned.x, ((expected.x + 1) * width) / 2, 1e-5);
close(turned.y, ((1 - expected.y) * height) / 2, 1e-5);
const offset = Math.hypot(turned.x - width / 2, turned.y - height / 2);
assert.equal(cssRow({ camera: tilted, circleRadius: offset - 1 }), undefined);
const atRim = cssRow({ camera: tilted, circleRadius: offset + 10 });
close(atRim.alpha, 0.5, 1e-6);
if (atRim.rect) {
  const { x, y, w, h } = atRim.rect;
  for (const a of [x, x + w])
    for (const b of [y, y + h]) assert.ok(Math.hypot(a - width / 2, b - height / 2) <= offset + 10);
}
const ocular = aim(pass.azimuth, pass.elevation, 0, 1);
assert.ok(
  Math.hypot(
    cssRow({ time: time + 125, camera: ocular }).x - width / 2,
    cssRow({ time: time + 125, camera: ocular }).y - height / 2
  ) > 5,
  'subsecond motion in the eyepiece'
);
const day = Date.parse('2026-11-04T06:43:30Z'),
  dayPass = prediction(day);
const overDay = cssRow({ time: day, camera: aim(dayPass.azimuth, dayPass.elevation) });
assert.ok(overDay && !overDay.candidate && overDay.status === '当地天光较亮');
const otherSite = { latitude: -33.8688, longitude: 151.2093, height: 50 };
assert.equal(cssRow({ site: otherSite }), undefined);
assert.equal(cssRow({ time: Date.parse('2050-01-01T00:00Z') }), undefined);
assert.equal(overlay.status.outOfRange, 2);
assert.ok(cssRow(), 'time seek returns at the exact original position');
const called = [];
const ctx = new Proxy(
  { globalAlpha: 1 },
  {
    get(obj, key) {
      return key in obj ? obj[key] : (...args) => called.push([key, ...args]);
    },
  }
);
paintGroundSatellites(ctx, [row]);
assert.deepEqual(
  called.filter(([fn]) => fn === 'fillText').map((call) => call[1]),
  row.lines
);
assert.ok(called.some(([fn]) => fn === 'restore'));

const dayMs = 86400000,
  last = css.rows.at(-1)[0];
assert.equal(groundSatelliteSourceMode(css, last + 14 * dayMs), 'estimated');
assert.equal(groundSatelliteSourceMode(css, last + 14 * dayMs + 1), 'outOfRange');
assert.equal(groundSatelliteSourceMode(null, time), 'missing');
const history = Date.parse('1970-04-25T12:29:00Z');
assert.equal(groundSatelliteSourceMode(dfh1, history), 'historical');
assert.equal(groundSatelliteSourceMode(dfh1, Date.parse('1970-04-24T12:00Z')), 'outOfRange');
assert.equal(
  groundSatelliteSourceMode(dfh1, Date.parse('1970-05-03T00:00:00+08:00')),
  'outOfRange'
);
assert.equal(groundSatelliteSourceMode(dfh1, Date.parse('1995-10-01T00:00:00Z')), 'outOfRange');
const historicalPass = createPassSampler(predictionSource(dfh1), site)(history);
const historical = overlay
  .sample({
    ...stage,
    time: history,
    camera: aim(historicalPass.azimuth, historicalPass.elevation),
  })
  .find((r) => r.id === 'dfh1');
assert.equal(historical.mode, 'historical');
assert.ok(historical.lines[1].includes('报载时刻重建'));
assert.equal(overlay.status.historical, 1);
assert.equal(overlay.status.outOfRange, 1);
const sunlitDfh = Date.parse('2026-11-01T21:59:56.410Z');
const dfhPass = createPassSampler(predictionSource(dfh1), site)(sunlitDfh);
const photometric = overlay
  .sample({
    ...stage,
    time: sunlitDfh,
    labelLevel: 'detailed',
    camera: aim(dfhPass.azimuth, dfhPass.elevation),
  })
  .find((r) => r.id === 'dfh1');
assert.ok(
  Number.isFinite(photometric.magnitude) && photometric.photometrySource.includes('McCants')
);
assert.ok(photometric.lines[2].includes('估算视星等 ' + photometric.magnitude.toFixed(1)));
assert.equal(cssRow().photometrySource, null);
const histCustom = { ...dfh1, rows: css.rows.map(([ms, ...r]) => [history + (ms - time), ...r]) };
assert.equal(groundSatelliteSourceMode(histCustom, history), 'catalog');
const future = last + 3600000;
assert.equal(groundSatelliteSourceMode(css, future), 'estimated');

// Compare the actual marker to independently published Skyfield/WGS84 test
// vectors. These 21 events fall beyond this GP table and exercise estimates.
const reference = JSON.parse(readFileSync('tests/reference/pass-skyfield.json'));
const refOverlay = createGroundSatelliteOverlay(
  { missionId: 'dfh1', data: orbitFromGP(reference.gp, 'dfh1') },
  {
    dfh1: { name: '东方红一号', center: 'EARTH', category: '卫星' },
  }
);
let maxAngle = 0,
  maxRange = 0;
for (const event of reference.events) {
  const actual = refOverlay.sample({
    ...stage,
    time: event.time,
    site: reference.observer,
    minElevation: 0,
    camera: aim(event.azimuth, event.elevation, 0, 1),
  })[0];
  assert.ok(actual && actual.mode === 'estimated');
  const truth = ray(event.azimuth, event.elevation);
  maxAngle = Math.max(maxAngle, truth.angleTo(new Vector3(...actual.direction)) / DEG);
  maxRange = Math.max(maxRange, Math.abs(event.range - actual.range));
}
assert.ok(
  maxAngle < 0.065 && maxRange < 1.2,
  'Skyfield 3D pointing and slant range in the short prediction window'
);
refOverlay.dispose();

const task = (name, category = '卫星') => ({ name, category, center: 'EARTH' });
const next = () => new Promise((resolve) => setImmediate(resolve));
const localCatalog = { custom: task('导入的卫星') };
let choice = { recordId: 'old', revision: 1 };
const pending = new Map();
let loads = 0;
const localSim = {
  missionId: 'elsewhere',
  bundledOrbits: {},
  orbits: {
    selection() {
      return choice;
    },
    selectionData() {
      loads++;
      return new Promise((resolve) => pending.set(choice.recordId, resolve));
    },
  },
};
const local = createGroundSatelliteOverlay(localSim, localCatalog);
assert.deepEqual(local.sample(stage), []);
await next();
assert.equal(local.status.loading, 1);
choice = { recordId: 'new', revision: 2 };
local.sample(stage);
await next();
assert.equal(loads, 2);
pending.get('new')({ data: css });
await next();
assert.equal(local.sample(stage)[0].name, '导入的卫星');
pending.get('old')({ data: null });
await next();
assert.equal(local.sample(stage).length, 1);
choice = { recordId: 'none', revision: 3 };
assert.deepEqual(local.sample(stage), []);
assert.equal(local.status.missing, 1);
assert.equal(loads, 2);
local.dispose();
assert.deepEqual(local.sample(stage), []);

// Synthetic compact catalogue exercises priority, density, levels and bounded
// discovery without downloading a third-party constellation of orbit records.
function sourceAt(frame, direction, epoch) {
  const position = frame.eye.map(
    (x, k) => x + 500 * frame.basis.reduce((sum, b, j) => sum + b[k] * direction[j], 0)
  );
  return {
    rows: Array.from({ length: 8 }, (_, i) => [epoch + (i - 3) * 1000, ...position, 0, 0, 0]),
  };
}
const wideWidth = 1800,
  wideHeight = 1200;
const wideCamera = aim(0, 62, 0, 54, wideWidth, wideHeight);
const frame = groundCelestialFrame(site, time);
const catalog = {},
  bundled = {};
const count = 1200;
for (let i = 0; i < count; i++) {
  const id = 'orb' + i;
  const ndcX = (((i * 47) % 97) / 96 - 0.5) * 1.7,
    ndcY = (((i * 71) % 79) / 78 - 0.5) * 1.7;
  const direction = new Vector3(ndcX, ndcY, 0.5).unproject(wideCamera).normalize().toArray();
  catalog[id] = task(i === 650 ? 'Station' : 'Sat ' + i, i === 650 ? '空间站' : '卫星');
  bundled[id] = sourceAt(frame, direction, time);
}
const dense = createGroundSatelliteOverlay(
  { missionId: 'orb1199', data: bundled.orb1199, bundledOrbits: bundled },
  catalog
);
const view = { ...stage, camera: wideCamera, width: wideWidth, height: wideHeight, frame };
for (const [labelLevel, limit] of Object.entries(GROUND_SATELLITE_LEVELS)) {
  let markers;
  for (let i = 0; i < Math.ceil(count / 16) + 4; i++) {
    markers = dense.sample({ ...view, labelLevel });
    assert.ok(
      dense.status.checked <= limit.markers + 17,
      'bounded ephemeris work per rendered frame'
    );
    assert.ok(markers.length <= limit.markers && dense.status.labels <= limit.labels);
    assert.equal(markers[0].id, 'orb1199');
  }
  assert.equal(markers[1].id, 'orb650', 'space station priority');
  assert.equal(markers.length, limit.markers);
  assert.ok(dense.status.labels > 0);
  const labels = markers.map((m) => m.rect).filter(Boolean);
  for (let i = 0; i < labels.length; i++)
    for (const b of labels.slice(i + 1)) {
      const a = labels[i];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    }
}
let totalProbes = 0;
for (let i = 0; i < 20; i++) {
  const probesBefore = totalProbes;
  const rows = dense.sample({
    ...view,
    labelLevel: 'detailed',
    blocked: () => {
      totalProbes++;
      return false;
    },
  });
  assert.ok(
    dense.status.terrainReads <= 8 && dense.status.terrainReads === totalProbes - probesBefore
  );
  assert.ok(rows.length <= totalProbes, 'never draw a previously untested terrain ray');
}
const afterSeek = dense.sample({
  ...view,
  time: time + 1000,
  labelLevel: 'detailed',
  blocked: () => true,
});
assert.equal(afterSeek.length, 0, 'seek clears terrain visibility without ghosts');
assert.ok(dense.status.terrainReads <= 8 && dense.status.terrainReads > 0);
assert.equal(dense.status.total, count);
assert.equal(
  dense.sample({ ...view, time: time + 50 * dayMs }).length,
  0,
  'seek drops all markers together'
);

// Input order matches a bulk import with a constellation first; both queues
// must discover targets immediately. Mid-session changes update the same layer.
for (const name of [
  'STARLINK-1255',
  'ONEWEB-0081',
  'QIANFAN-7',
  'HULIANWANG DIGUI-196',
  'KUIPER-00118',
  '星链-1255',
  '千帆-7',
])
  assert.equal(groundSatelliteGroup(task(name)), 'internet', name);
assert.equal(
  groundSatelliteGroup(task('我的卫星'), { gp: { OBJECT_NAME: 'ONEWEB-0081' } }),
  'internet'
);
assert.equal(groundSatelliteGroup({ ...task('新系统 A'), satelliteGroup: 'internet' }), 'internet');
assert.equal(
  groundSatelliteGroup({ ...task('STARLINK-1255'), satelliteGroup: 'regular' }),
  'regular'
);
for (const name of [
  'STARLINK DEB',
  'ONEWEB R/B',
  '通信卫星 1',
  '千帆火箭残骸',
  'Kuiper Belt Explorer',
])
  assert.equal(groundSatelliteGroup(task(name)), 'regular', name);

const mixedCatalog = {},
  mixedOrbits = {};
let regularReads = 0,
  networkReads = 0;
const watched = (orbit, network) => ({
  get rows() {
    if (network) networkReads++;
    else regularReads++;
    return orbit.rows;
  },
});
for (let i = 0; i < 12000; i++) {
  const id = 'net' + i;
  mixedCatalog[id] = {
    ...task('STARLINK-' + (21000 + i)),
    satelliteCatalog: {
      objectType: 'payload',
      purpose: 'communications',
      owner: 'US',
      launchDate: '2022-03-01',
    },
  };
  mixedOrbits[id] = watched(bundled['orb' + (i % count)], true);
}
for (let i = 0; i < 128; i++) {
  const id = 'standard' + i;
  mixedCatalog[id] = {
    ...task('Survey ' + i),
    satelliteCatalog: {
      objectType: 'payload',
      purpose: 'earth-observation',
      owner: i === 0 ? 'US' : 'CN',
      launchDate: i === 0 ? '2017-09-29' : '2022-03-01',
    },
  };
  mixedOrbits[id] = watched(bundled['orb' + ((i * 7) % count)], false);
}
const combined = createGroundSatelliteOverlay(
  { missionId: 'net0', data: mixedOrbits.net0, bundledOrbits: mixedOrbits },
  mixedCatalog
);
const mixedView = { ...view, width: 3600, height: 2400 };
let satRows = combined.sample({ ...mixedView, satelliteScope: 'regular' });
assert.ok(satRows.length > 0 && satRows.every((r) => r.group === 'regular'));
assert.equal(
  networkReads,
  0,
  'inactive group never reads propagator input; current mission respects scope'
);
assert.equal(combined.status.total, 128);
const facets = combined.facets;
const priorRegularReads = regularReads;
for (let i = 0; i < 4; i++) satRows = combined.sample({ ...mixedView, satelliteScope: 'internet' });
assert.equal(satRows.length, 24);
assert.ok(satRows.every((r) => r.group === 'internet') && satRows[0].id === 'net0');
assert.equal(regularReads, priorRegularReads);
assert.equal(combined.status.total, 12000);
for (const [labelLevel, limit] of Object.entries(GROUND_SATELLITE_LEVELS)) {
  for (let i = 0; i < 28; i++) {
    satRows = combined.sample({ ...mixedView, labelLevel });
    assert.ok(combined.status.checked <= limit.markers + 17);
  }
  assert.equal(satRows.length, limit.markers);
  assert.equal(combined.status.regularVisible, limit.markers - limit.mixedMarkers);
  assert.equal(combined.status.internetVisible, limit.mixedMarkers);
  assert.ok(combined.status.regularLabels >= limit.labels - limit.mixedLabels);
  assert.ok(combined.status.internetLabels > 0);
  assert.ok(combined.status.labels <= limit.labels);
}
assert.equal(combined.status.total, 12128);
assert.equal(combined.status.internetTotal, 12000);
assert.equal(combined.status.regularTotal, 128);
const filters = {
  purpose: 'earth-observation',
  objectType: 'payload',
  owner: 'US',
  decade: '2010',
};
satRows = combined.sample({ ...mixedView, filters });
assert.deepEqual(
  satRows.map((row) => row.id),
  ['standard0']
);
assert.equal(combined.status.total, 1);
filters.owner = 'CN';
assert.deepEqual(combined.sample({ ...mixedView, filters }), []);
assert.equal(combined.status.total, 0);
filters.decade = 2020;
assert.ok(combined.sample({ ...mixedView, filters }).every((r) => r.group === 'regular'));
assert.equal(combined.status.total, 127);
assert.equal(
  combined.facets,
  facets,
  'changing dimensions does not shrink available facet options'
);
const internetOnlyView = { ...mixedView, filters: { purpose: 'communications' } };
for (let i = 0; i < 8; i++) satRows = combined.sample(internetOnlyView);
assert.equal(satRows.length, 24, 'sparse mixed field lends all markers to internet spacecraft');
assert.equal(combined.status.internetLabels, 12, 'internet-only field also lends all name slots');
const single = combined.sample({
  ...mixedView,
  satelliteScope: 'regular',
  filters: { owner: 'US' },
  labelLevel: 'compact',
});
assert.equal(single.length, 1);
assert.equal(single[0].magnitude, null, 'unknown visual magnitude keeps the geometrical marker');
combined.dispose();
const sparseCatalog = {},
  sparseOrbits = {};
const behind = sourceAt(frame, ray(180, -55).toArray(), time);
for (let i = 0; i < 60; i++) {
  sparseCatalog['off' + i] = task('Science ' + i);
  sparseCatalog['in' + i] = task('STARLINK-' + (1000 + i));
  sparseOrbits['off' + i] = behind;
  sparseOrbits['in' + i] = bundled['orb' + i * 7];
}
const sparse = createGroundSatelliteOverlay(
  { missionId: 'off0', data: behind, bundledOrbits: sparseOrbits },
  sparseCatalog
);
for (let i = 0; i < 16; i++) satRows = sparse.sample(mixedView);
assert.equal(sparse.status.regularTotal, 60);
assert.equal(sparse.status.total, 120);
assert.equal(sparse.status.regularVisible, 0);
assert.equal(
  sparse.status.internetVisible,
  24,
  'all view may borrow when all regular orbits lie below this horizon'
);
assert.equal(sparse.status.internetLabels, 12);
sparse.dispose();

const midnight = Date.parse('2026-11-04T16:00Z'),
  midnightFrame = groundCelestialFrame(site, midnight);
const darkData = sourceAt(midnightFrame, ray(0, 75).toArray(), midnight);
const dark = createGroundSatelliteOverlay(
  { missionId: 'dark', data: darkData },
  { dark: task('Eclipsed') }
);
const darkRow = dark.sample({
  ...stage,
  time: midnight,
  camera: aim(0, 75),
  labelLevel: 'detailed',
  frame: midnightFrame,
})[0];
assert.ok(
  darkRow && !darkRow.candidate && darkRow.shadow === '全影' && darkRow.status === '目标在地影中'
);
assert.ok(darkRow.lines[1].includes('全影'));
assert.equal(darkRow.magnitude, null);
console.log(
  'ground satellite overlays: actual Beijing passages cross-checked; exact eyepiece projection, fade, lighting, time jumps, source changes and 12,128-source mixed catalogue, density and filter isolation passed'
);
