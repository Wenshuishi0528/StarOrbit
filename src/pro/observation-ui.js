import { defaultObservation, observationFields } from './observation-config.js';

const $ = (id) => document.getElementById(id);
const keyPart = (key) => key[0].toUpperCase() + key.slice(1);
const controlId = (key) => 'obs' + keyPart(key);
const numericGroups = {
  obsAcquisition: [
    'maxOffNadirDeg',
    'minSunElevationDeg',
    'settlingSec',
    'cadenceSec',
    'exposureSec',
  ],
  obsResources: ['rawMB', 'storeMB', 'downlinkMbps', 'cameraW', 'processorW', 'radioW'],
  obsFilterModel: [
    'processingSec',
    'outputFraction',
    'usefulFraction',
    'usefulKeep',
    'otherKeep',
    'seed',
  ],
};
const siteKeys = ['name', 'latDeg', 'lonDeg', 'heightM'];
const siteBounds = {
  latDeg: [0, -90, 90, '°'],
  lonDeg: [0, -180, 180, '°'],
  heightM: [0, -500, 9000, 'm'],
};
const numericKeys = [...Object.values(numericGroups).flat(), 'minStationElevationDeg'];

export function createObservationEditor({ field, el }) {
  function numeric(parent, key, id, spec) {
    const input = el('input');
    input.type = 'number';
    input.id = id;
    input.min = spec[1];
    input.max = spec[2];
    input.step = key === 'seed' ? '1' : 'any';
    input.required = true;
    field(parent, key, input, spec[3]);
  }
  function stringInput(parent, key, id, limit) {
    const input = el('input');
    input.id = id;
    input.maxLength = limit;
    field(parent, key, input);
  }
  for (const site of ['target', 'station']) {
    const box = el('fieldset', 'obs-site'),
      legend = el('legend');
    legend.dataset.t = 'obs' + keyPart(site);
    const grid = el('div', 'form-grid');
    box.append(legend);
    $('obsSites').append(box);
    const prefix = controlId(site);
    stringInput(box, 'obsSiteName', prefix + 'Name', 60);
    box.append(grid);
    for (const key of siteKeys.slice(1)) numeric(grid, key, prefix + keyPart(key), siteBounds[key]);
    if (site === 'station')
      numeric(
        grid,
        'minStationElevationDeg',
        controlId('minStationElevationDeg'),
        observationFields.minStationElevationDeg
      );
  }
  for (const [id, keys] of Object.entries(numericGroups)) {
    for (const key of keys) numeric($(id), key, controlId(key), observationFields[key]);
  }
  stringInput($('obsSourceField'), 'obsParameterSource', controlId('parameterSource'), 300);
  for (const i of [0, 1]) {
    const group = el('div', 'obs-strategy');
    group.id = 'obsStrategy' + i;
    const select = el('select');
    select.id = 'obsMode' + i;
    for (const mode of ['raw', 'filter']) {
      const option = el('option');
      option.value = mode;
      option.dataset.t = 'obsMode' + keyPart(mode);
      select.append(option);
    }
    field(group, 'obsStrategy', select);
    numeric(group, 'delaySec', 'obsDelay' + i, [0, 0, 86400, 's']);
    const hint = el('p', 'field-note');
    hint.dataset.t = 'obsDelayHelp';
    group.append(hint);
    $('editor' + i).prepend(group);
  }
  function sync() {
    const enabled = $('observationEnabled').checked;
    $('observationFields').hidden = !enabled;
    for (const i of [0, 1]) $('obsStrategy' + i).hidden = !enabled;
  }
  $('observationEnabled').addEventListener('input', sync);
  function fill(config) {
    const o = config ?? defaultObservation();
    $('observationEnabled').checked = Boolean(config);
    for (const site of ['target', 'station']) {
      for (const k of siteKeys) $(controlId(site) + keyPart(k)).value = o[site][k];
    }
    for (const k of numericKeys) $(controlId(k)).value = o[k];
    $(controlId('parameterSource')).value = o.parameterSource;
    o.strategies.forEach((s, i) => {
      $('obsMode' + i).value = s.mode;
      $('obsDelay' + i).value = s.delaySec;
    });
    sync();
  }
  function read() {
    if (!$('observationEnabled').checked) return undefined;
    const o = {};
    for (const site of ['target', 'station']) {
      const prefix = controlId(site);
      o[site] = { name: $(prefix + 'Name').value };
      for (const k of siteKeys.slice(1)) o[site][k] = $(prefix + keyPart(k)).valueAsNumber;
    }
    for (const k of numericKeys) o[k] = $(controlId(k)).valueAsNumber;
    o.parameterSource = $(controlId('parameterSource')).value;
    o.strategies = [0, 1].map((i) => ({
      mode: $('obsMode' + i).value,
      delaySec: $('obsDelay' + i).valueAsNumber,
    }));
    return o;
  }
  return { fill, read };
}

// Milliseconds are meaningful at acquisition and contact boundaries. Replay is
// independently quantised to the mission's orbit/electrothermal sample grid.
export function observationClock(seconds) {
  const ms = Math.round(seconds * 1000),
    hour = Math.floor(ms / 3600000),
    minute = Math.floor(ms / 60000) % 60,
    second = Math.floor(ms / 1000) % 60;
  const base = [hour, minute, second].map((n) => String(n).padStart(2, '0')).join(':');
  return ms % 1000 ? base + '.' + String(ms % 1000).padStart(3, '0') : base;
}

export function createObservationReport({ el, t, onJump, onLimit }) {
  const pageSize = 8;
  let result = null,
    page = 0,
    selected = null,
    pairs = [],
    visible = [];
  const metric = (v, d = 1) =>
    Number.isFinite(v)
      ? v.toLocaleString(document.documentElement.lang, { maximumFractionDigits: d })
      : '—';
  const minutes = (v) => (Number.isFinite(v) ? metric(v / 60, 2) + ' min' : '—');
  const createButton = (label, fn, cls = '') => {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const statusName = (s) => t('obsStatus' + keyPart(s));
  const reasonName = (s) => t('obsReason' + keyPart(s));
  function jumpButton(sec, plan, focus, stage, id) {
    const b = createButton(
      observationClock(sec),
      () => onJump({ sec, plan, focus, stage, id }),
      'obs-jump value'
    );
    b.dataset.eventSec = sec;
    b.dataset.plan = plan;
    b.dataset.focus = focus ?? 'none';
    b.dataset.stage = stage;
    b.setAttribute('aria-label', t(stage) + ' · T+ ' + observationClock(sec));
    return b;
  }
  function windows() {
    const access = result.observationAccess;
    const chart = $('obsCoverageChart');
    chart.replaceChildren();
    for (const site of ['target', 'station']) {
      const row = el('div', 'obs-coverage-row'),
        track = el('div', 'obs-coverage-track ' + site);
      row.append(
        el('span', '', t(site === 'target' ? 'obsTargetWindows' : 'obsStationWindows')),
        track
      );
      for (const w of access[site + 'Windows']) {
        const range = observationClock(w.startSec) + ' – ' + observationClock(w.endSec);
        const marker = createButton(
          '',
          () =>
            onJump({ plan: null, sec: w.peakSec, focus: site, stage: 'obsWindowPeak', id: null }),
          'obs-window-marker'
        );
        marker.dataset.focus = site;
        marker.dataset.eventSec = w.peakSec;
        marker.title =
          t('obs' + keyPart(site)) +
          ' · T+ ' +
          range +
          ' · ' +
          t('obsElevation') +
          ' ' +
          metric(w.peakElevationDeg) +
          '°';
        marker.setAttribute('aria-label', marker.title);
        marker.style.left = (w.startSec / result.durationSec) * 100 + '%';
        marker.style.width = ((w.endSec - w.startSec) / result.durationSec) * 100 + '%';
        track.append(marker);
      }
      chart.append(row);
    }
    const scale = el('div', 'obs-coverage-row'),
      ticks = el('div', 'obs-coverage-ticks');
    for (const tick of ['0h', '6h', '12h', '18h', '24h']) ticks.append(el('span', '', tick));
    scale.append(el('span', 'meta', 'T+'), ticks);
    chart.append(scale);
    $('obsWindows').replaceChildren(
      ...['target', 'station'].map((site) => {
        const group = el('section'),
          list = el('ol', 'obs-window-list'),
          items = access[site + 'Windows'];
        group.append(el('h4', '', t('obs' + keyPart(site)) + ' · ' + items.length));
        for (const [index, w] of items.entries()) {
          const li = el('li');
          li.append(
            el('span', 'meta', String(index + 1)),
            jumpButton(w.startSec, null, site, 'obsWindowStart', null),
            el('span', 'meta', '–'),
            jumpButton(w.endSec, null, site, 'obsWindowEnd', null),
            el('span', 'meta', t('obsElevation') + ' ' + metric(w.peakElevationDeg) + '°')
          );
          list.append(li);
        }
        if (items.length) group.append(list);
        else group.append(el('p', 'obs-empty', t('obsNoWindows')));
        return group;
      })
    );
  }
  function accounting() {
    const m = result.plans.map((p) => p.observation.metrics);
    const config = result.mission.observation;
    $('obsAssumptions').textContent = [
      t('obsSyntheticSeed') + ' ' + config.seed,
      config.parameterSource,
    ]
      .filter(Boolean)
      .join(' · ');
    const header = el('tr');
    header.append(el('th', '', t('obsQuantity')), el('th', 'a', 'A'), el('th', 'b', 'B'));
    $('obsAccountingHead').replaceChildren(header);
    const rows = [
      ['capturedCount', ''],
      ['usefulCapturedCount', ''],
      ['deliveredCount', ''],
      ['discardedCount', ''],
      ['overflowCount', ''],
      ['powerMissedCount', ''],
      ['pendingCount', ''],
      ['meanLatencySec', 's'],
      ['generatedMB', 'MB'],
      ['overflowMB', 'MB'],
      ['filterFreedMB', 'MB'],
      ['sentMB', 'MB'],
      ['finalStoredMB', 'MB'],
      ['cameraWh', 'Wh'],
      ['processorWh', 'Wh'],
      ['radioWh', 'Wh'],
      ['unservedDeviceWh', 'Wh'],
    ];
    $('obsAccountingRows').replaceChildren(
      ...rows.map(([key, unit]) => {
        const tr = el('tr');
        tr.append(
          el('th', '', t('obsMetric' + keyPart(key)) + (unit ? ' · ' + unit : '')),
          ...m.map((v) => el('td', 'value', metric(v[key], 3)))
        );
        return tr;
      })
    );
  }
  function eventRow(list, label, start, end, focus, info, plan, image) {
    if (!Number.isFinite(start)) return;
    const row = el('li'),
      details = el('div', 'obs-event-times');
    details.append(jumpButton(start, plan, focus, label, image.id));
    if (Number.isFinite(end) && end !== start)
      details.append(el('span', 'meta', '–'), jumpButton(end, plan, focus, label, image.id));
    row.append(el('span', '', t(label)), details);
    if (info) row.append(el('small', 'meta', info));
    list.append(row);
  }
  function timeline(image, i) {
    const group = el('section', 'obs-trace'),
      strategy = result.plans[i].observation.strategy;
    group.dataset.plan = i;
    group.append(el('h4', i ? 'b' : 'a', (i ? 'B' : 'A') + ' · ' + result.mission.plans[i].name));
    const verdict = el(
      'p',
      'obs-outcome',
      statusName(image.status) + (image.reason ? ' · ' + reasonName(image.reason) : '')
    );
    group.append(
      verdict,
      el(
        'p',
        'meta',
        t('obsMode' + keyPart(strategy.mode)) +
          ' · ' +
          t('obsSent') +
          ' ' +
          metric(image.sentMB) +
          ' MB · ' +
          t('obsRemaining') +
          ' ' +
          metric(image.remainingMB) +
          ' MB'
      )
    );
    const events = el('ol', 'obs-event-list');
    eventRow(events, 'obsPlannedExposure', image.startSec, image.endSec, 'target', '', i, image);
    eventRow(
      events,
      'obsCaptureActual',
      image.captureStartSec,
      image.captureEndSec ?? image.captureStopSec,
      'target',
      '',
      i,
      image
    );
    for (const part of image.processSegments)
      eventRow(
        events,
        'obsProcessing',
        part.startSec,
        part.endSec,
        null,
        metric(part.workSec, 3) + ' s',
        i,
        image
      );
    eventRow(events, 'obsReady', image.readySec, null, null, '', i, image);
    for (const part of image.transferSegments) {
      const info =
        t('obsContact') +
        ' ' +
        (part.stationWindowIndex + 1) +
        ' · ' +
        metric(part.sentMB, 3) +
        ' MB';
      eventRow(events, 'obsTransfer', part.startSec, part.endSec, 'station', info, i, image);
    }
    if (image.status === 'delivered')
      eventRow(
        events,
        'obsDelivery',
        image.deliveredSec,
        null,
        'station',
        t('obsLatency') + ' ' + minutes(image.latencySec),
        i,
        image
      );
    else if (image.status === 'filteredOut')
      eventRow(events, 'obsDiscard', image.processEndSec, null, null, '', i, image);
    else if (image.status === 'storageOverflow')
      eventRow(events, 'obsOverflow', image.captureEndSec, null, 'target', '', i, image);
    else if (image.status === 'capturePower')
      eventRow(
        events,
        'obsCaptureStopped',
        image.captureStopSec ?? image.startSec,
        null,
        'target',
        '',
        i,
        image
      );
    else eventRow(events, 'obsCutoff', result.durationSec, null, null, '', i, image);
    group.append(events);
    return group;
  }
  function drawImages() {
    const maxPage = Math.max(0, Math.ceil(visible.length / pageSize) - 1);
    page = Math.min(page, maxPage);
    const shown = visible.slice(page * pageSize, (page + 1) * pageSize);
    if (!shown.some((pair) => pair[0].id === selected)) selected = shown[0]?.[0].id ?? null;
    const rows = shown.map((pair) => {
      const image = pair[0],
        row = el('tr');
      row.dataset.selected = String(image.id === selected);
      const id = el('td'),
        choose = createButton(
          '#' + image.id,
          () => {
            selected = image.id;
            drawImages();
            $('obsImageRows').querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
          },
          'obs-image-button'
        );
      choose.dataset.imageId = image.id;
      choose.setAttribute('aria-pressed', String(image.id === selected));
      id.append(choose);
      row.append(
        id,
        el('td', 'value', observationClock(image.startSec)),
        el('td', '', t(image.useful ? 'obsUseful' : 'obsOther')),
        ...pair.map((v) =>
          el('td', v.status === 'delivered' ? 'obs-delivered' : '', statusName(v.status))
        )
      );
      return row;
    });
    $('obsImageRows').replaceChildren(...rows);
    $('obsImageTable').hidden = !shown.length;
    $('obsNoRows').hidden = Boolean(shown.length);
    $('obsNoRows').textContent = t(pairs.length ? 'obsNoMatches' : 'obsNoImages');
    $('obsPage').hidden = visible.length <= pageSize;
    $('obsPrev').disabled = page === 0;
    $('obsNext').disabled = page === maxPage;
    $('obsPageCount').textContent =
      page * pageSize + 1 + '–' + (page * pageSize + shown.length) + ' / ' + visible.length;
    $('obsImageDetail').hidden = !shown.length;
    const pair = shown.find((p) => p[0].id === selected);
    $('obsTimelines').replaceChildren();
    if (!pair) return;
    $('obsImageTitle').textContent =
      t('obsImage') + ' #' + selected + ' · ' + t(pair[0].useful ? 'obsUseful' : 'obsOther');
    $('obsTimelines').append(...pair.map(timeline));
  }
  function filterImages() {
    const f = $('obsFilter').value;
    visible = pairs.filter(
      ([a, b]) =>
        f === 'all' ||
        (f === 'useful' && a.useful) ||
        (f === 'different' && (a.status !== b.status || a.reason !== b.reason)) ||
        (f === 'undelivered' && (a.status !== 'delivered' || b.status !== 'delivered'))
    );
    drawImages();
  }
  $('obsPrev').onclick = () => {
    page = Math.max(0, page - 1);
    drawImages();
  };
  $('obsNext').onclick = () => {
    page++;
    drawImages();
  };
  $('obsFilter').onchange = () => {
    page = 0;
    filterImages();
  };
  function render(data) {
    const changed = data !== result;
    result = data;
    const o = result.mission.observation,
      access = result.observationAccess;
    $('observationReport').hidden = !o;
    if (!o) {
      pairs = [];
      visible = [];
      return;
    }
    if (changed) {
      page = 0;
      selected = null;
      $('obsFilter').value = 'all';
      const second = new Map(result.plans[1].observation.images.map((img) => [img.id, img]));
      pairs = result.plans[0].observation.images.map((img) => [img, second.get(img.id)]);
    }
    $('obsMissionSites').textContent = o.target.name + ' → ' + o.station.name;
    $('obsSummary').replaceChildren(
      ...result.plans.map((p, i) => {
        const m = p.observation.metrics,
          tr = el('tr');
        tr.dataset.plan = i;
        const name = el(
          'th',
          i ? 'b' : 'a',
          (i ? 'B' : 'A') + ' · ' + result.mission.plans[i].name
        );
        name.append(el('small', 'meta', t('obsMode' + keyPart(p.observation.strategy.mode))));
        const values = {
          obsUsefulDelivered: m.usefulDeliveredCount + ' / ' + m.usefulCapturedCount,
          obsMeanLatency: minutes(m.meanUsefulLatencySec),
          minBattery: metric(p.metrics.minBatteryWh, 2) + ' Wh',
          obsPeakTemp: metric(p.metrics.peakBoardC, 2) + ' °C',
          obsPeakStore: metric(m.peakStoredMB) + ' / ' + metric(o.storeMB) + ' MB',
        };
        tr.append(
          name,
          ...Object.entries(values).map(([key, v]) => {
            const cell = el('td', 'value', v);
            cell.dataset.label = t(key);
            const kind = { minBattery: 'lowBattery', obsPeakTemp: 'hotBoard' }[key];
            const crossing = kind && p.events.find((event) => event.kind === kind);
            if (crossing) {
              const action = createButton(
                t('obsFirstCrossing') + ' ↗',
                () => onLimit(i, crossing),
                'obs-crossing'
              );
              action.dataset.limitKind = kind;
              action.title = t('obsFirstCrossing') + ' · T+ ' + observationClock(crossing.startSec);
              cell.append(action);
            }
            return cell;
          })
        );
        return tr;
      })
    );
    const diagnostics = [
      t('obsTargetWindows') + ' ' + access.targetWindows.length,
      t('obsOpportunities') + ' ' + access.opportunities.length,
      t('obsStationWindows') + ' ' + access.stationWindows.length,
    ];
    if (!access.targetWindows.length) diagnostics.push(t('obsNoTarget'));
    else if (!access.opportunities.length) diagnostics.push(t('obsTooShort'));
    if (!access.stationWindows.length) diagnostics.push(t('obsNoStation'));
    if (
      result.plans.some((p) =>
        p.observation.images.some((img) => img.reason === 'contactCapacityAtCutoff')
      )
    )
      diagnostics.push(t('obsCapacityLimit'));
    $('obsDiagnostic').textContent = diagnostics.join(' · ');
    windows();
    accounting();
    filterImages();
  }
  return { render };
}
