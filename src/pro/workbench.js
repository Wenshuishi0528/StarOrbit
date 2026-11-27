import {
  defaultMission,
  observationMission,
  validateMission,
  replayAt,
  fields,
  DAY,
} from './mission.js';
import { createScene } from './scene.js';
import { makePlot } from './plots.js';
import { makeResidualPlot } from './residual-plot.js';
import { OEM_MAX_BYTES, parseOem, writeOem } from './oem.js';
import { forceFields, validateForces } from './orbit-propagation.js';
import { writeEngineeringCsv, writeObservationCsv } from './products.js';
import { observationFields } from './observation-config.js';
import {
  createObservationEditor,
  createObservationReport,
  observationClock,
} from './observation-ui.js';
import { runInWorker } from './solver-client.js';
import { translate, languages } from './labels.js';

const $ = (id) => document.getElementById(id),
  key = 'starorbit-pro-mission-v1';
const missionFileLimit = 32 * 1024 * 1024;
const savedInDatabase = '@indexeddb';
function readPref(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
let lang = readPref('starorbit-pro-language') || readPref('tiangong-language-v1') || 'zh';
if (!languages.includes(lang)) lang = 'zh';
const t = (k) => translate(lang, k);
const el = (tag, cls, txt) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (txt !== undefined) node.textContent = txt;
  return node;
};
const tr = (node, k) => {
  node.dataset.t = k;
  node.textContent = t(k);
  return node;
};
const button = (txt, fn) => {
  const b = el('button', '', txt);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
};
const hhmm = (min) =>
  [Math.floor(min / 60), min % 60].map((v) => String(v).padStart(2, '0')).join(':');
const clock = observationClock;
const fmt = (n, u) => n.toFixed(1) + ' ' + u;
const instant = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
function referenceInstant(ms) {
  const whole = Math.floor(ms),
    micros = Math.round((ms - whole) * 1000);
  if (!micros || micros === 1000) return instant(whole + (micros === 1000 ? 1 : 0));
  return (
    new Date(whole).toISOString().slice(0, -1) +
    String(micros).padStart(3, '0').replace(/0+$/, '') +
    'Z'
  );
}
const precise = (value, unit, signed = false) => {
  const number = new Intl.NumberFormat(lang, {
    maximumSignificantDigits: 4,
    signDisplay: signed ? 'exceptZero' : 'auto',
    notation: value !== 0 && Math.abs(value) < 0.001 ? 'scientific' : 'standard',
  }).format(value);
  return number + ' ' + unit;
};
let result = null,
  plan = 0,
  edit = 0,
  sec = 0,
  mode = 'orbit',
  playing = null,
  selectedEvent = null,
  observationSelection = null,
  dirty = false,
  draftExported = false,
  busy = false,
  stored = false;
let scene = null,
  activeRun = null,
  lastError = null,
  cancelled = false,
  notice = '',
  peakSelected = false,
  fileTicket = 0;
let reference = null,
  referenceName = '',
  referenceText = '';
const forceFlags = ['drag', 'srp', 'thirdBody'];
const forceUsage = {
  massKg: ['drag', 'srp'],
  dragAreaM2: ['drag'],
  cd: ['drag'],
  densityScale: ['drag'],
  srpAreaM2: ['srp'],
  cr: ['srp'],
};
const orbitalElements = [
  'perigeeKm',
  'apogeeKm',
  'inclinationDeg',
  'raanDeg',
  'argPerigeeDeg',
  'anomalyDeg',
];
function translated() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  for (const node of document.querySelectorAll('[data-t]')) node.textContent = t(node.dataset.t);
  for (const node of document.querySelectorAll('[data-aria]'))
    node.setAttribute('aria-label', t(node.dataset.aria));
  $('lang').value = lang;
  document.title = t('brand') + ' · StarOrbit';
}
function field(parent, label, input, unit) {
  const wrap = el('label', 'field'),
    caption = el('span');
  caption.append(tr(el('span'), label));
  if (unit) caption.append(el('small', '', ' · ' + unit));
  wrap.append(caption, input);
  parent.append(wrap);
  return input;
}
for (const [container, names] of Object.entries({
  orbitFields: orbitalElements,
  powerFields: [
    'arrayM2',
    'efficiency',
    'capacityWh',
    'initialWh',
    'reserveWh',
    'busW',
    'chargeEff',
    'dischargeEff',
  ],
  thermalFields: [
    'initialC',
    'coldC',
    'hotC',
    'radiatorM2',
    'outerJK',
    'boardJK',
    'conductance',
    'absorptance',
    'emissivity',
  ],
  forceFields: Object.keys(forceFields),
})) {
  for (const name of names) {
    const input = el('input');
    input.type = 'number';
    input.id = name;
    input.step = 'any';
    const [, min, max, unit] = (container === 'forceFields' ? forceFields : fields)[name];
    input.min = min;
    input.max = max;
    input.required = true;
    field($(container), name, input, unit);
  }
}
for (const name of forceFlags) {
  const label = el('label', 'force-option'),
    input = el('input');
  input.id = name;
  input.type = 'checkbox';
  label.append(input, tr(el('span'), name));
  $('forceFlags').append(label);
}
function updateOrbitControls() {
  const source = $('trajectoryMode').value,
    fromElements = source === 'elements',
    replay = source === 'oemReplay';
  for (const option of $('trajectoryMode').options)
    option.disabled = option.value !== 'elements' && !reference;
  $('elementsSection').hidden = !fromElements;
  $('forceSection').hidden = replay;
  for (const [name, flags] of Object.entries(forceUsage)) {
    const active = flags.some((flag) => $(flag).checked);
    $(name).disabled = replay || !active;
    $(name).closest('.field').hidden = !active;
  }
  $('sourceHint').textContent = t(source + 'Help');
  $('oemInfo').hidden = !reference;
}
function describeReference() {
  if (!reference) {
    $('segmentList').replaceChildren();
    updateOrbitControls();
    return;
  }
  $('oemName').textContent = referenceName;
  $('oemObject').textContent = [reference.objectName, reference.objectId, reference.originator]
    .filter(Boolean)
    .join(' · ');
  $('oemMetadata').textContent =
    `OEM ${reference.version} · ${reference.frame} / ${reference.timeSystem}`;
  $('oemCoverage').textContent =
    referenceInstant(reference.startMs) + ' – ' + referenceInstant(reference.stopMs);
  const segments = reference.segments;
  $('adoptOemEpoch').disabled = firstUsableMillisecond() === null;
  $('oemSegments').hidden = segments.length <= 1;
  $('segmentCount').textContent = t('usableSegments') + ' · ' + segments.length;
  if ($('oemSegments').open) describeSegments();
  updateOrbitControls();
}
function describeSegments() {
  if (!reference || !$('oemSegments').open) return;
  $('segmentList').textContent = reference.segments
    .map(
      (segment) =>
        `${referenceInstant(segment.startMs)} – ${referenceInstant(segment.stopMs)} · ${segment.interpolation} ${segment.degree}`
    )
    .join('\n');
}
$('oemSegments').addEventListener('toggle', describeSegments);
function setReference(name, text, parsed) {
  referenceName = name;
  referenceText = text;
  reference = parsed;
  $('segmentList').replaceChildren();
  describeReference();
}
function firstUsableMillisecond() {
  for (const segment of reference.segments) {
    const rounded = Math.ceil(segment.startMs);
    if (rounded <= segment.stopMs) return rounded;
  }
  return null;
}
function adoptEpoch() {
  const epoch = reference && firstUsableMillisecond();
  if (epoch !== null) $('epochUtc').value = instant(epoch).slice(0, -1);
}
function planButtons(parent, fn) {
  for (const [i, letter] of ['A', 'B'].entries()) {
    const b = button('', () => fn(i));
    b.dataset.plan = i;
    b.append(tr(el('span'), 'plan'), document.createTextNode(' ' + letter));
    parent.append(b);
  }
}
function press(parent, attr, value) {
  for (const b of parent.querySelectorAll('button'))
    b.setAttribute('aria-pressed', String(b.dataset[attr] === String(value)));
}
planButtons($('editTabs'), (i) => {
  edit = i;
  showEditor();
});
planButtons($('replayTabs'), (i) => {
  plan = i;
  selectedEvent = null;
  observationSelection = null;
  stop();
  showTime(true);
});
function showEditor() {
  press($('editTabs'), 'plan', edit);
  [0, 1].forEach((i) => ($('editor' + i).hidden = i !== edit));
}
function addWindow(i, start = '', end = '') {
  const row = el('div', 'window-row');
  for (const [k, value] of [
    ['start', start],
    ['end', end],
  ]) {
    const inp = el('input');
    inp.value = value;
    inp.dataset.aria = k;
    inp.setAttribute('aria-label', t(k));
    inp.placeholder = 'HH:MM';
    inp.maxLength = 5;
    if (k === 'end') row.append(el('span', '', '–'));
    row.append(inp);
  }
  const remove = button('×', () => {
    row.remove();
    markDirty();
  });
  remove.dataset.aria = 'remove';
  remove.setAttribute('aria-label', t('remove'));
  row.append(remove);
  $('windows' + i).append(row);
}
function buildEditors() {
  for (let i = 0; i < 2; i++) {
    const editor = el('div');
    editor.id = 'editor' + i;
    $('planForms').append(editor);
    const text = el('input');
    text.id = 'planName' + i;
    text.maxLength = 60;
    field(editor, 'planName', text);
    const sel = el('select');
    sel.id = 'pointing' + i;
    for (const k of ['sun', 'zenith', 'nadir']) {
      const opt = tr(el('option'), k);
      opt.value = k;
      sel.append(opt);
    }
    field(editor, 'pointing', sel);
    const power = el('input');
    power.id = 'payloadW' + i;
    power.type = 'number';
    power.min = 0;
    power.max = 200;
    power.step = 'any';
    field(editor, 'payloadW', power, 'W');
    editor.append(tr(el('span', 'window-label'), 'windows'));
    const rows = el('div');
    rows.id = 'windows' + i;
    editor.append(rows);
    const add = tr(
      button('', () => {
        addWindow(i);
        markDirty();
        $('windows' + i)
          .lastElementChild.querySelector('input')
          .focus();
      }),
      'add'
    );
    add.className = 'add-window';
    editor.append(add);
  }
}
function fill(m) {
  const trajectory = m.trajectory ?? { mode: 'elements', name: '', oemText: '' };
  const forces = validateForces(m.forces);
  const parsed = trajectory.oemText ? parseOem(trajectory.oemText) : null;
  $('craftName').value = m.spacecraft.name;
  $('parameterSource').value = m.spacecraft.parameterSource;
  $('epochUtc').value = m.epochUtc.slice(0, -1);
  $('gravity').value = m.gravity;
  $('trajectoryMode').value = trajectory.mode;
  for (const flag of forceFlags) $(flag).checked = forces[flag];
  for (const name of Object.keys(forceFields)) $(name).value = forces[name];
  setReference(trajectory.name, trajectory.oemText, parsed);
  for (const k of Object.keys(fields)) $(k).value = m.spacecraft[k];
  m.plans.forEach((p, i) => {
    $('planName' + i).value = p.name;
    $('pointing' + i).value = p.pointing;
    $('payloadW' + i).value = p.payloadW;
    $('windows' + i).replaceChildren();
    p.windows.forEach(([a, b]) => addWindow(i, hhmm(a), hhmm(b)));
  });
  observationEditor.fill(m.observation);
  showEditor();
}
function parseMinute(s) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(s)) throw new RangeError('windows');
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}
function readForm() {
  const s = { name: $('craftName').value, parameterSource: $('parameterSource').value };
  for (const k of Object.keys(fields)) s[k] = $(k).valueAsNumber;
  const source = $('trajectoryMode').value;
  if (
    source !== 'elements' &&
    (orbitalElements.some(
      (k) => !Number.isFinite(s[k]) || s[k] < fields[k][1] || s[k] > fields[k][2]
    ) ||
      s.perigeeKm > s.apogeeKm)
  ) {
    for (const k of orbitalElements) s[k] = result?.mission.spacecraft[k] ?? fields[k][0];
  }
  const forces = {};
  for (const flag of forceFlags) forces[flag] = $(flag).checked;
  for (const [key, [fallback, min, max]] of Object.entries(forceFields)) {
    let value = $(key).valueAsNumber;
    if ($(key).disabled && (!Number.isFinite(value) || value < min || value > max))
      value = result?.mission.forces?.[key] ?? fallback;
    forces[key] = value;
  }
  const raw = $('epochUtc').value,
    observation = observationEditor.read();
  return validateMission({
    schemaVersion: 1,
    epochUtc: raw + (raw.length === 16 ? ':00Z' : 'Z'),
    gravity: $('gravity').value,
    forces,
    trajectory: { mode: source, name: referenceName, oemText: referenceText },
    spacecraft: s,
    ...(observation ? { observation } : {}),
    plans: [0, 1].map((i) => ({
      name: $('planName' + i).value,
      pointing: $('pointing' + i).value,
      payloadW: $('payloadW' + i).valueAsNumber,
      windows: [...$('windows' + i).children].map((row) =>
        [...row.querySelectorAll('input')].map((n) => parseMinute(n.value.trim()))
      ),
    })),
  });
}
function status() {
  $('runTop').disabled = busy;
  $('run').disabled = busy;
  $('import').disabled = busy;
  $('observationExample').disabled = busy;
  $('export').disabled = busy;
  $('cancelRun').hidden = !activeRun;
  $('runTop').hidden = !!activeRun;
  for (const id of ['resultFile', 'exportOem', 'exportCsv'])
    $(id).disabled = busy || dirty || !result;
  $('exportObservationCsv').disabled = busy || dirty || !result?.observationAccess;
  const state = busy ? 'running' : notice || (dirty ? 'dirty' : result ? 'complete' : 'ready');
  $('solved').textContent = t(state);
  $('solved').classList.toggle('pending', dirty || busy);
  $('runStatus').textContent = t(state === 'complete' ? (stored ? 'saved' : 'unsaved') : state);
}
function markDirty() {
  dirty = true;
  draftExported = false;
  notice = '';
  $('formError').hidden = true;
  status();
}
function renderError(e) {
  const k = e.message === 'windows' ? 'timeRange' : e.message,
    range = fields[k] ?? forceFields[k] ?? observationFields[k];
  $('formError').textContent =
    t('error') +
    ' · ' +
    t(k) +
    (range ? ' (' + range[1] + ' – ' + range[2] + ' ' + range[3] + ')' : '') +
    (typeof e.detail === 'string' && e.detail ? ' · ' + e.detail : '');
  return k;
}
function showError(e) {
  lastError = e;
  const k = renderError(e);
  $('formError').hidden = false;
  document.querySelector('aside').classList.add('expanded');
  updateMobile();
  if ($(k)?.closest('details')) $(k).closest('details').open = true;
  if (k.startsWith('oem') || k === 'trajectoryMode') $('trajectorySettings').open = true;
  if (k === 'dragAltitude') $('forceSection').open = true;
  if (observationFields[k] || k.startsWith('observation') || k === 'delaySec') {
    const input =
      $('obs' + k[0].toUpperCase() + k.slice(1)) ??
      {
        observationTarget: $('obsTargetName'),
        observationStation: $('obsStationName'),
        observationCadence: $('obsCadenceSec'),
      }[k];
    if (input?.closest('details')) input.closest('details').open = true;
  }
  $('formError').scrollIntoView({ block: 'nearest' });
}
const seek = (value) => {
  sec = Math.max(0, Math.min(DAY, Math.round(value / result.stepSeconds) * result.stepSeconds));
  selectedEvent = null;
  peakSelected = false;
  observationSelection = null;
  showTime();
};
function jumpObservation(event) {
  stop();
  if (event.plan !== null) {
    plan = edit = event.plan;
    showEditor();
  }
  selectedEvent = null;
  peakSelected = false;
  observationSelection = event;
  sec = Math.max(0, Math.min(result.durationSec, event.sec));
  mode = 'orbit';
  showTime(true);
  $('replay').scrollIntoView({ block: 'nearest' });
  $('replay').focus({ preventScroll: true });
}
const energyPlot = makePlot($('charts'), 'batteryWh', seek),
  heatPlot = makePlot($('charts'), 'boardC', seek);
const residualPlot = makeResidualPlot($('residualPlot'), (value) => {
  stop();
  seek(value);
});
function stop() {
  if (playing) clearInterval(playing);
  playing = null;
  $('play').textContent = '▶';
  $('play').setAttribute('aria-label', t('play'));
}
function showTime(focus = false) {
  if (!result) return;
  const energyEvent =
    selectedEvent?.dataset.kind === 'lowBattery' && Boolean(result.mission.observation);
  const state = replayAt(
      result,
      plan,
      sec,
      observationSelection || energyEvent ? { exactOrbit: true } : undefined
    ),
    current = result.mission.plans[plan],
    utc = instant(Math.round(state.t));
  press($('replayTabs'), 'plan', plan);
  press($('cameraTabs'), 'mode', mode);
  $('activePlan').textContent = (plan ? 'B' : 'A') + ' · ' + current.name;
  $('activePlan').style.color = plan ? 'var(--b)' : 'var(--a)';
  $('utcClock').textContent = utc.slice(11, -1);
  $('utcDate').textContent = utc.slice(0, 10) + ' UTC';
  $('elapsed').textContent = observationClock(state.timeSec);
  $('time').value = state.timeSec;
  const replay = result.mission.trajectory?.mode === 'oemReplay';
  const usedForces = replay
    ? []
    : forceFlags.filter((flag) => result.mission.forces?.[flag]).map((flag) => t(flag + 'Short'));
  $('sceneStamp').textContent = [
    'EME2000',
    t(replay ? 'oemReplay' : result.mission.gravity),
    ...usedForces,
  ].join(' / ');
  const devices = result.plans[plan].observationSamples;
  const values = {
    altitude: fmt(state.altitudeKm, 'km'),
    sunlight: Math.round(state.env.illumination * 100) + ' %',
    incidence: fmt(state.incidenceDeg, '°'),
    generation: fmt(state.availableW, 'W'),
    demand: fmt(state.demandW, 'W'),
    battery: fmt(state.batteryWh, 'Wh'),
    board: fmt(state.boardC, '°C'),
    [devices ? 'obsScheduledPayload' : 'payload']: t(state.payloadOn ? 'on' : 'off'),
  };
  if (devices) {
    values.obsOnboard = fmt(state.observation.storedMB, 'MB');
    values.obsDeviceDraw = fmt(state.observation.activeW, 'W');
  }
  $('readouts').replaceChildren(
    ...Object.entries(values).map(([k, v]) => {
      const r = el('div');
      r.append(el('dt', '', t(k)), el('dd', 'value', v));
      return r;
    })
  );
  scene?.update(result, state, mode, focus, {
    referencePeak: peakSelected,
    observationFocus: observationSelection?.focus ?? null,
  });
  energyPlot.seek(state.timeSec);
  heatPlot.seek(state.timeSec);
  residualPlot.seek(state.timeSec);
  for (const b of $('eventRows').querySelectorAll('button'))
    b.setAttribute('aria-pressed', String(b === selectedEvent));
  $('eventDetail').hidden = !selectedEvent && !peakSelected && !observationSelection;
  if (observationSelection) {
    const e = observationSelection,
      epoch = Date.parse(result.mission.epochUtc);
    const context = [
      e.plan === null ? '' : e.plan === 0 ? 'A' : 'B',
      e.id === null ? '' : '#' + e.id,
      t(e.stage),
    ].filter(Boolean);
    if (e.focus) {
      context.push(result.mission.observation[e.focus].name);
      const range = Number($('scene').dataset.observationRangeKm);
      if (Number.isFinite(range)) context.push(t('obsSlantRange') + ' ' + fmt(range, 'km'));
    }
    $('eventDetail').dataset.observationSec = e.sec;
    $('eventDetail').textContent =
      context.join(' · ') +
      '  |  ' +
      t('obsEventUtc') +
      ' ' +
      instant(epoch + Math.round(e.sec * 1000)) +
      '  |  ' +
      t('obsSampleUtc') +
      ' ' +
      instant(epoch + Math.round((state.sampleSec ?? state.timeSec) * 1000));
  } else delete $('eventDetail').dataset.observationSec;
  if (selectedEvent) {
    $('eventDetail').textContent = selectedEvent.dataset.detail;
    if (energyEvent)
      $('eventDetail').textContent +=
        '  |  ' +
        t('obsEventUtc') +
        ' ' +
        utc +
        '  |  ' +
        t('obsSampleUtc') +
        ' ' +
        instant(Date.parse(result.mission.epochUtc) + state.sampleSec * 1000);
  }
  if (peakSelected) {
    const c = result.orbitComparison;
    $('eventDetail').textContent =
      t('peakResidual') +
      ' · ' +
      precise(c.maxM, 'm') +
      '  |  ' +
      ['R', 'T', 'N'].map((axis, i) => axis + ' ' + precise(c.peakRtnM[i], 'm', true)).join(' · ') +
      '  |  ' +
      t('peakSceneKey');
  }
}
function renderComparison() {
  const data = result.orbitComparison,
    m = result.mission;
  $('comparisonTable').hidden = !data;
  $('residualHistory').hidden = !data;
  $('replayPeak').hidden = !data;
  residualPlot.set(data?.series ?? null, result.stepSeconds, sec, data?.intervals ?? []);
  if (!data) {
    $('residuals').replaceChildren();
    const source = m.trajectory;
    $('comparisonState').textContent = t(
      source?.mode === 'oemReplay'
        ? 'comparisonReplay'
        : source?.oemText
          ? 'comparisonNoCommon'
          : 'comparisonEmpty'
    );
    return;
  }
  const facts = [
    data.referenceName,
    'T+ ' + clock(data.startSec) + ' – ' + clock(data.endSec),
    data.count + ' / ' + result.orbit.length + ' ' + t('gridSamples'),
  ];
  if (data.intervals.length > 1) facts.push(t('usableSegments') + ' ×' + data.intervals.length);
  if (Number.isFinite(data.rmsVelocityMps))
    facts.push(t('velocityRms') + ' ' + precise(data.rmsVelocityMps, 'm/s'));
  if (data.native?.count)
    facts.push(
      t('nativeRms') + ' ' + precise(data.native.rmsM, 'm') + ' (' + data.native.count + ')'
    );
  $('comparisonState').textContent = facts.join(' · ');
  const rows = [
    ['rms', data.rmsM, data.rmsRtnM],
    ['atPeak', data.maxM, data.peakRtnM],
  ].map(([label, norm, axes]) => {
    const row = el('tr'),
      heading = el('th', '', t(label));
    heading.scope = 'row';
    row.append(
      heading,
      el('td', 'value', precise(norm, 'm')),
      ...axes.map((value) => el('td', 'value', precise(value, 'm', label === 'atPeak')))
    );
    return row;
  });
  $('residuals').replaceChildren(...rows);
}
function report() {
  const m = result.mission,
    s = m.spacecraft;
  $('missionTitle').textContent =
    s.name + '  ·  ' + m.epochUtc.slice(0, 10) + '  ' + m.epochUtc.slice(11, -1) + ' UTC  ·  24 h';
  renderComparison();
  observationReport.render(result);
  energyPlot.set(result, t('battery') + ' · Wh', [s.reserveWh]);
  heatPlot.set(result, t('board') + ' · °C', [s.coldC, s.hotC]);
  $('summary').replaceChildren(
    ...result.plans.map((p, i) => {
      const row = el('tr'),
        metrics = p.metrics;
      const label = el('td', i ? 'b' : 'a', (i ? 'B' : 'A') + ' · ' + m.plans[i].name);
      row.append(
        label,
        ...[
          fmt(metrics.minBatteryWh, 'Wh'),
          metrics.minBoardC.toFixed(1) + ' – ' + fmt(metrics.peakBoardC, '°C'),
          fmt(metrics.solarUsedWh, 'Wh'),
          fmt(metrics.unservedWh, 'Wh'),
        ].map((v) => el('td', '', v))
      );
      return row;
    })
  );
  const events = result.plans
    .flatMap((p, i) => p.events.map((e) => ({ e, i })))
    .sort((a, b) => a.e.startSec - b.e.startSec || a.i - b.i);
  const priorEvent = selectedEvent?.dataset;
  $('eventCount').textContent = String(events.length);
  $('eventRows').replaceChildren(
    ...events.map(({ e, i }) => {
      const row = button('', () => {
        stop();
        plan = i;
        edit = i;
        showEditor();
        sec = e.startSec;
        mode = 'craft';
        selectedEvent = row;
        peakSelected = false;
        observationSelection = null;
        showTime(true);
        $('replay').scrollIntoView({ block: 'nearest' });
        $('replay').focus({ preventScroll: true });
      });
      row.className = 'event-row';
      row.dataset.start = e.startSec;
      row.dataset.plan = i;
      row.dataset.kind = e.kind;
      if (
        priorEvent &&
        priorEvent.start === String(e.startSec) &&
        priorEvent.plan === String(i) &&
        priorEvent.kind === e.kind
      )
        selectedEvent = row;
      const utc = new Date(Date.parse(m.epochUtc) + Math.round(e.startSec * 1000)).toISOString(),
        end = e.endSec === null ? '24:00:00' : clock(e.endSec);
      const unit = e.kind === 'lowBattery' ? 'Wh' : '°C';
      row.dataset.detail =
        (i ? 'B' : 'A') +
        ' · ' +
        t(e.kind) +
        '  |  ' +
        t('limitLine') +
        ' ' +
        fmt(e.limit, unit) +
        '  |  ' +
        t('extreme') +
        ' ' +
        fmt(e.extreme, unit) +
        '  |  T+ ' +
        clock(e.startSec) +
        ' – ' +
        end;
      row.title = utc + ' · ' + row.dataset.detail;
      row.append(
        el('span', 'value', clock(e.startSec)),
        el('span', i ? 'b' : 'a', (i ? 'B' : 'A') + ' · ' + m.plans[i].name),
        el('span', '', t(e.kind)),
        el('span', 'value', fmt(e.extreme, e.kind === 'lowBattery' ? 'Wh' : '°C')),
        el('span', 'arrow', '↗')
      );
      return row;
    })
  );
  if (!events.length) $('eventRows').append(el('p', 'empty', t('empty')));
  else {
    const headers = el('div', 'event-row event-labels');
    for (const k of ['T+', 'plan', 'events', 'extreme']) headers.append(el('span', '', t(k)));
    $('eventRows').prepend(headers);
  }
  showTime(true);
  status();
}
// The common case stays compatible with the original single localStorage record.
// Larger reference files can exceed that quota while still fitting in IndexedDB.
function databaseMission(action, value) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('starorbit-pro-files', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('missions');
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('storage'));
    open.onsuccess = () => {
      const db = open.result,
        tx = db.transaction('missions', action === 'read' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('missions');
      const request = action === 'read' ? store.get(key) : store.put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error('storage'));
      };
    };
  });
}
async function saveMission(m) {
  try {
    localStorage.setItem(key, JSON.stringify(m));
    return true;
  } catch {}
  try {
    await databaseMission('write', m);
    try {
      localStorage.setItem(key, savedInDatabase);
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
    const marker = readPref(key);
    return !marker || marker === savedInDatabase;
  } catch {
    return false;
  }
}
async function restoreMission() {
  try {
    const text = readPref(key);
    const m = text && text !== savedInDatabase ? JSON.parse(text) : await databaseMission('read');
    if (m) return validateMission(m);
  } catch {}
  return defaultMission();
}
async function solve(m) {
  if (busy) return;
  busy = true;
  ++fileTicket;
  cancelled = false;
  notice = '';
  stop();
  $('form').inert = true;
  $('formError').hidden = true;
  status();
  try {
    activeRun = runInWorker(m);
    status();
    const completed = await activeRun.promise;
    if (cancelled) return;
    activeRun = null;
    status();
    const persisted = await saveMission(completed.mission);
    result = completed;
    stored = persisted;
    plan = 0;
    sec = 0;
    mode = 'orbit';
    selectedEvent = null;
    peakSelected = false;
    observationSelection = null;
    dirty = false;
    report();
  } catch (e) {
    if (!cancelled) {
      dirty = true;
      notice = 'runFailed';
      showError(e);
    }
  } finally {
    if (cancelled) notice = 'runCancelled';
    activeRun = null;
    busy = false;
    $('form').inert = false;
    status();
  }
}
function download(text, file, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a');
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function updateMobile() {
  const open = document.querySelector('aside').classList.contains('expanded');
  mobile.textContent = t(open ? 'close' : 'edit');
  mobile.setAttribute('aria-expanded', String(open));
}
const mobile = button('', () => {
  document.querySelector('aside').classList.toggle('expanded');
  updateMobile();
});
mobile.className = 'mobile-config';
document.querySelector('.rail-title').append(mobile);
buildEditors();
const observationEditor = createObservationEditor({ field, el });
const observationReport = createObservationReport({
  el,
  t,
  onJump: jumpObservation,
  onLimit(i, event) {
    const selector =
      'button[data-plan="' +
      i +
      '"][data-kind="' +
      event.kind +
      '"][data-start="' +
      event.startSec +
      '"]';
    $('eventRows').querySelector(selector)?.click();
  },
});
translated();
updateMobile();
try {
  scene = createScene(
    $('scene'),
    $('earthTexture').textContent.trim(),
    $('nightTexture').textContent.trim()
  );
} catch {
  tr($('sceneError'), 'webgl');
  $('sceneError').hidden = false;
}
$('form').addEventListener('input', (e) => {
  if (e.target === $('oemFile')) return;
  if (e.target === $('trajectoryMode') || forceFlags.includes(e.target.id)) updateOrbitControls();
  markDirty();
});
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    solve(readForm());
  } catch (err) {
    showError(err);
  }
});
$('lang').onchange = () => {
  lang = $('lang').value;
  try {
    localStorage.setItem('starorbit-pro-language', lang);
  } catch {}
  translated();
  describeReference();
  if (!$('formError').hidden && lastError) renderError(lastError);
  updateMobile();
  if (result) report();
  else status();
};
$('cameraTabs').onclick = (e) => {
  const b = e.target.closest('[data-mode]');
  if (b) {
    mode = b.dataset.mode;
    showTime(true);
  }
};
$('time').oninput = () => {
  if (result) {
    stop();
    seek(Number($('time').value));
  }
};
$('play').onclick = () => {
  if (!result) return;
  if (playing) {
    stop();
    return;
  }
  if (sec >= DAY) seek(0);
  $('play').textContent = 'Ⅱ';
  $('play').setAttribute('aria-label', t('pause'));
  playing = setInterval(() => {
    seek(sec + 30);
    if (sec === DAY) stop();
  }, 120);
};
$('export').onclick = () => {
  try {
    download(JSON.stringify(readForm()), 'starorbit-mission-v1.json', 'application/json');
    draftExported = true;
  } catch (e) {
    showError(e);
  }
};
$('resultFile').onclick = () => {
  if (result && !dirty && !busy)
    download(JSON.stringify(result), 'starorbit-result-v1.json', 'application/json');
};
$('exportOem').onclick = () => {
  if (result && !dirty && !busy)
    try {
      download(writeOem(result), 'starorbit-trajectory.oem', 'text/plain;charset=utf-8');
    } catch (e) {
      showError(e);
    }
};
$('exportCsv').onclick = () => {
  if (result && !dirty && !busy)
    try {
      download(writeEngineeringCsv(result), 'starorbit-engineering.csv', 'text/csv;charset=utf-8');
    } catch (e) {
      showError(e);
    }
};
$('exportObservationCsv').onclick = () => {
  if (result?.observationAccess && !dirty && !busy) {
    try {
      download(writeObservationCsv(result), 'starorbit-observations.csv', 'text/csv;charset=utf-8');
    } catch (e) {
      showError(e);
    }
  }
};
$('cancelRun').onclick = () => {
  if (activeRun) {
    cancelled = true;
    activeRun.cancel();
  }
};
$('replayPeak').onclick = () => {
  if (!result?.orbitComparison) return;
  stop();
  selectedEvent = null;
  observationSelection = null;
  peakSelected = true;
  sec = result.orbitComparison.maxSec;
  mode = 'craft';
  showTime(true);
  $('replay').scrollIntoView({ block: 'nearest' });
  $('replay').focus({ preventScroll: true });
};
$('loadOem').onclick = () => $('oemFile').click();
$('oemFile').onchange = async () => {
  const file = $('oemFile').files[0];
  $('oemFile').value = '';
  if (!file || busy) return;
  const ticket = ++fileTicket;
  try {
    if (file.size > OEM_MAX_BYTES) throw new Error('oemSize');
    const data = await file.text();
    if (ticket !== fileTicket) return;
    const parsed = parseOem(data);
    setReference(file.name, data, parsed);
    markDirty();
  } catch (e) {
    if (ticket === fileTicket) showError(e);
  }
};
$('adoptOemEpoch').onclick = () => {
  adoptEpoch();
  markDirty();
};
$('removeOem').onclick = () => {
  ++fileTicket;
  $('trajectoryMode').value = 'elements';
  setReference('', '', null);
  markDirty();
};
$('referenceExample').onclick = () => {
  ++fileTicket;
  try {
    const data = $('proReferenceExample').textContent.trim(),
      parsed = parseOem(data);
    setReference('CSS-BACC-20261019.oem', data, parsed);
    $('trajectoryMode').value = 'oemInitial';
    adoptEpoch();
    updateOrbitControls();
    markDirty();
  } catch (e) {
    showError(e);
  }
};
function stageObservationExample() {
  ++fileTicket;
  fill(observationMission());
  markDirty();
  notice = 'obsExamplePending';
  status();
}
$('observationExample').onclick = () => {
  if (busy) return;
  if (dirty && !draftExported) $('obsExampleDialog').showModal();
  else stageObservationExample();
};
$('obsExampleCancel').onclick = () => $('obsExampleDialog').close();
$('obsExampleConfirm').onclick = () => {
  $('obsExampleDialog').close();
  stageObservationExample();
};
$('import').onclick = () => $('file').click();
$('file').onchange = async () => {
  const file = $('file').files[0];
  $('file').value = '';
  if (!file || busy) return;
  const ticket = ++fileTicket;
  try {
    if (file.size > missionFileLimit) throw new Error('missionSize');
    let obj;
    try {
      obj = JSON.parse(await file.text());
    } catch {
      throw new Error('invalidFile');
    }
    if (ticket !== fileTicket) return;
    const m = validateMission(obj);
    fill(m);
    markDirty();
    await solve(m);
  } catch (e) {
    if (ticket === fileTicket) showError(e);
  }
};
async function start() {
  busy = true;
  $('form').inert = true;
  status();
  let initial = await restoreMission();
  try {
    fill(initial);
  } catch {
    initial = defaultMission();
    fill(initial);
  }
  busy = false;
  await solve(initial);
}
start();
