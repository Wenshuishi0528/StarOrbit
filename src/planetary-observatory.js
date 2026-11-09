import { installEarthObservationControls } from './earth-observation-controls.js';
import { sampleElevationBase } from './earth-elevation-math.js';
import { createPlanetaryRenderer } from './planetary-renderer.js';
import { findPlanetaryEvents, planetaryComparisonDates } from './planetary-events.js';
import { MARS_FEATURES } from './mars-catalog.js';
import { searchWorldPlaces } from './world-explorer.js';
import atlas from '../assets/geography/atlas.json';
import geologyLegend from '../assets/mars/geology-legend.json';
import { lastObserver, rememberObserver } from './observer-settings.js';
import { dateTimeText, dateTimeValue, stepDateTime } from './date-time-input.js';
import { t, getLanguage, onLanguageChange } from './i18n.js';

const bodies = { Earth: '地球', Mars: '火星', Sun: '太阳', Moon: '月球' };
const layerNames = {
  visible: '可见光',
  dayIR: '白昼热红外',
  nightIR: '夜间热红外',
  elevation: '高程',
  geology: '地质',
  day: '日间地表',
  night: '夜间灯光',
};
const css = `.planet-observatory{position:fixed;inset:0;padding:0;border:0;z-index:1001;display:flex;flex-direction:column;background:#030810;color:#dce7ee;font:13px/1.5 system-ui}.planet-observatory[hidden],.planet-observatory [hidden]{display:none!important}.planet-observatory button,.planet-observatory select,.planet-observatory input{font:inherit;color:inherit;background:#162737;border:1px solid #395164;border-radius:7px;padding:7px 9px;box-sizing:border-box}.planet-observatory button{cursor:pointer}.planet-observatory button:hover{background:#2a4256}.planet-observatory button:disabled{opacity:.5;cursor:wait}.planet-bar{position:relative;height:auto;flex-shrink:0;justify-content:flex-start;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 18px;background:#0b1420;border-bottom:1px solid #273a4a;z-index:5}.planet-bar strong{color:#ead7ad;letter-spacing:2px;margin-right:auto}.planet-bar input{width:185px}.planet-workspace{display:flex;flex:1;min-height:0}.planet-observatory .planet-panel{position:relative;inset:auto;border-radius:0;border:0;visibility:visible;width:288px;flex-shrink:0;overflow:auto;padding:20px;background:#0b1420;border-right:1px solid #273a4a;box-sizing:border-box}.planet-panel h2{font-size:24px;letter-spacing:4px;font-weight:500;color:#f0dfba;margin:0 0 3px}.planet-panel .kicker{color:#7593a9;font-size:10px;letter-spacing:2px}.planet-panel label{display:block;margin-top:13px;margin-bottom:5px;color:#a2b7c9}.planet-panel select,.planet-panel input:not([type=checkbox]){width:100%}.planet-panel .check{display:flex;align-items:center;gap:6px;margin:10px 0}.planet-panel .pair{display:flex;gap:6px}.planet-panel .pair>*{min-width:0;flex:1}.planet-panel button{white-space:normal}.planet-panel[hidden]{display:none}.planet-panel details{border-top:1px solid #293d4c;margin-top:18px;padding-top:14px}.planet-panel summary{color:#dfc99d;cursor:pointer}.planet-panel p{font-size:12px;color:#9bb0c0;white-space:pre-line}.planet-stage{flex:1;min-width:0;position:relative;overflow:hidden}.planet-stage>canvas{position:absolute;inset:0;width:100%;height:100%}.planet-overlay{position:absolute;inset:0;pointer-events:none}.planet-label{position:absolute;transform:translate(7px,-50%);font-size:11px;color:#eee4cd;text-shadow:0 1px 4px #000,0 0 5px #000;white-space:nowrap}.planet-label.cn{color:#ff6d64}.planet-label:before{content:'·';font-size:18px;margin-right:3px}.planet-label.cn:before{content:'★';font-size:13px}.planet-captions{position:absolute;top:18px;left:0;right:0;display:flex;pointer-events:none;z-index:2}.planet-captions>div{flex:1;text-align:center;color:#cfdded;font:12px/1.6 system-ui;white-space:pre-line;text-shadow:0 1px 4px #000}.planet-readout{position:absolute;bottom:38px;left:50%;transform:translateX(-50%);background:#07111dc9;border:1px solid #3a50634d;border-radius:10px;padding:10px 20px;white-space:pre-line;text-align:center;pointer-events:none;max-width:85%;font-variant-numeric:tabular-nums}.planet-credit{position:absolute;bottom:7px;left:15px;right:15px;text-align:right;color:#8ba1b5;font-size:10px;pointer-events:none}.planet-results button,.planet-events button{display:block;width:100%;text-align:left;margin-top:7px}.planet-events button small{display:block;color:#9cb1c6;font-size:11px}.planet-status{color:#dfc99d!important;min-height:18px}.planet-stage.comparing:after{content:'';position:absolute;top:0;bottom:0;left:50%;width:1px;background:#74869b55;pointer-events:none}.planet-guide{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.planet-guide button{font-size:11px;padding:5px 7px}.planet-panel-toggle{display:none}@media(max-width:760px){.planet-bar{padding:7px;font-size:11px;gap:5px}.planet-bar strong{display:none}.planet-bar input{width:150px}.planet-bar label{display:flex;align-items:center;gap:3px}.planet-captions>div{min-width:0;font-size:10px;padding:0 4px;overflow-wrap:anywhere}.planet-observatory .planet-panel{position:absolute;left:0;top:0;bottom:0;z-index:4;width:255px;background:#0b1420ed;backdrop-filter:blur(12px)}.planet-workspace{position:relative}.planet-panel.folded{display:none}.planet-panel-toggle{display:block}.planet-readout{font-size:10px;bottom:45px}.planet-credit{font-size:8px}.planet-captions{top:12px;font-size:10px}}`;
export function installPlanetaryObservatory(sim) {
  const renderer = sim.api.renderer,
    canvas = renderer.domElement,
    originalParent = canvas.parentNode;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  const host = document.createElement('section');
  host.className = 'planet-observatory';
  host.hidden = true;
  host.innerHTML = `<header class="planet-bar"><strong>STARORBIT · OBSERVATORY</strong><button class="planet-panel-toggle" data-text="设置"></button><select data-body aria-label="天体观测"></select><label>UTC+8 <input data-time aria-label="观测时间"></label><button data-jump data-text="跳转"></button><button data-now data-text="现在"></button><button data-photo data-text="拍照"></button><button data-solar data-text="太阳系"></button><button data-exit data-text="返回轨道"></button></header><div class="planet-workspace"><aside class="planet-panel"><div class="kicker">EXPLORE · OBSERVE · DISCOVER</div><h2 data-title></h2><p data-intro></p><label data-text="观察方式"></label><select data-view><option value="explore" data-text="三维探索"></option><option value="observe" data-text="地球望远镜视角"></option></select><label data-text="表面图层"></label><select data-layer></select><label class="check"><input data-relief type="checkbox" checked><span data-text="真实地形"></span></label><label class="check"><input data-atlas type="checkbox"><span data-text="地图照明"></span></label><label class="check" data-cloud-row><input data-clouds type="checkbox" checked><span data-text="云图"></span></label><label class="check"><input data-labels type="checkbox" checked><span data-text="地名与着陆点"></span></label><div data-fov-row><label data-text="视场（角秒）"></label><input data-fov type="range" min="10" max="120" step="1" value="45"></div><div class="planet-guide"></div><label data-text="寻找地点"></label><input data-search aria-label="寻找地点"><div class="planet-results"></div><p data-selection></p><button data-ground data-text="在这里进入地表"></button><button data-weather data-text="云图资源库"></button><details><summary data-text="对比观察"></summary><label data-text="对比方式"></label><select data-compare><option value="off" data-text="关闭"></option><option value="layer" data-text="不同图层"></option><option value="date" data-text="不同日期 · 同一视场"></option></select><label data-text="右侧图层"></label><select data-layer-b></select><label>UTC+8</label><input data-time-b aria-label="对比时间"><button data-apply-b data-text="应用对比时间"></button><div data-date-presets class="planet-guide"></div></details><details><summary data-text="地球观测地点"></summary><label data-text="城市或地理名称"></label><input data-site-search aria-label="观测城市"><div data-site-results class="planet-results"></div><div class="pair"><label><span data-text="纬度 °"></span><input data-lat type="number" min="-90" max="90" step=".001"></label><label><span data-text="经度 °"></span><input data-lon type="number" min="-180" max="180" step=".001"></label></div><label data-text="海拔（米）"></label><input data-height type="number" min="-1000" max="100000" step="1"><button data-site-apply data-text="应用地点"></button><p data-site-name></p></details><details open><summary data-text="天文事件"></summary><select data-event-body aria-label="事件天体"><option value="Mars" data-text="火星冲"></option><option value="Sun" data-text="日食"></option><option value="Moon" data-text="月食"></option><option value="Jupiter" data-text="木星卫星现象"></option></select><button data-event-search data-text="查找可观测事件"></button><div class="planet-events"></div></details><details><summary data-text="图层与数据来源"></summary><p data-source></p><div data-legend></div></details><p class="planet-status" role="status"></p></aside><div class="planet-stage"><div class="planet-overlay"></div><div class="planet-captions"></div><div class="planet-readout"></div><div class="planet-credit"></div></div></div>`;
  document.body.append(host);
  const $ = (s) => host.querySelector(s),
    stage = $('.planet-stage'),
    panel = $('.planet-panel'),
    labels = $('.planet-overlay'),
    status = $('.planet-status');
  const earthObservation = installEarthObservationControls({
    host,
    environment: sim.environment,
    selectFeature,
  });
  Object.assign(layerNames, earthObservation.labels);
  const entry = document.createElement('button');
  entry.id = 'openPlanetaryObservatory';
  document.getElementById('toolbarActions')?.prepend(entry);
  entry.onclick = () => open('Mars');
  const marsEntry = document.getElementById('xtMarsExplore');
  if (marsEntry) marsEntry.onclick = () => open('Mars');
  const earthHeight = (longitude, latitude) =>
    sim.environment.elevation?.base
      ? (sampleElevationBase(sim.environment.elevation.base, longitude, latitude)?.heightMeters ??
        0)
      : 0;
  const earthFeatures = atlas.labels
    .filter((p) => p.kind !== 'ocean')
    .map((p) => ({ ...p, name: p.zh, nameEn: p.en, latitude: p.lat, longitude: p.lon }));
  let active = false,
    view = null,
    target = 'Mars',
    layer = 'visible',
    compareTime = sim.time + 30 * 86400000,
    selection = null,
    frames = null,
    eventRequest = null,
    presetRequest = null,
    wasControls = true,
    timeDraft = false,
    lastUI = 0,
    lastSettings = null;
  let site = lastObserver() ?? { name: '北京', latitude: 39.9042, longitude: 116.4074, height: 50 };
  const featureName = (f) =>
    getLanguage() === 'zh'
      ? (f.nameZh ?? f.name ?? f.nameEn)
      : (f[getLanguage()] ?? f.nameEn ?? f.en ?? f.name);
  const features = () => (target === 'Mars' ? MARS_FEATURES : earthFeatures);
  function message(text) {
    status.textContent = text;
  }
  function translate() {
    host.querySelectorAll('[data-text]').forEach((el) => (el.textContent = t(el.dataset.text)));
    entry.textContent = t('天体观测');
    const current = $('[data-body]').value;
    $('[data-body]').replaceChildren(
      ...Object.entries(bodies).map(([id, name]) => new Option(t(name), id))
    );
    $('[data-body]').value = current || target;
    earthObservation.translate();
    renderBody();
  }
  function syncSite() {
    for (const k of ['latitude', 'longitude', 'height'])
      $(`[data-${k === 'latitude' ? 'lat' : k === 'longitude' ? 'lon' : k}]`).value = site[k];
    $('[data-site-name]').textContent =
      site.name ?? `${site.latitude.toFixed(3)}°, ${site.longitude.toFixed(3)}°`;
  }
  function layers() {
    return target === 'Earth'
      ? ['day', 'night', ...Object.keys(earthObservation.labels)]
      : ['visible', 'dayIR', 'nightIR', 'elevation', 'geology'].filter(
          (id) => id === 'visible' || sim.environment.assets.mars?.layers?.[id]
        );
  }
  function renderBody() {
    $('[data-title]').textContent = t(bodies[target]);
    $('[data-body]').value = target;
    $('[data-intro]').textContent = t(
      target === 'Earth'
        ? '从轨道俯瞰家园，选一个地点走进地表。'
        : '沿峡谷与火山探索火星，也从地球看它随时间改变。'
    );
    for (const key of ['layer', 'layer-b']) {
      const el = $(`[data-${key}]`),
        old = el.value;
      el.replaceChildren(...layers().map((id) => new Option(t(layerNames[id]), id)));
      el.value = layers().includes(old)
        ? old
        : layers()[key === 'layer-b' ? Math.min(1, layers().length - 1) : 0];
    }
    layer = $('[data-layer]').value;
    $('[data-view]').disabled = target === 'Earth';
    if (target === 'Earth') $('[data-view]').value = 'explore';
    $('[data-fov-row]').hidden = target === 'Earth' || $('[data-view]').value !== 'observe';
    $('[data-cloud-row]').hidden = target !== 'Earth';
    $('[data-ground]').hidden = target !== 'Earth';
    $('[data-weather]').hidden = target !== 'Earth';
    const guide = $('.planet-guide');
    guide.replaceChildren();
    const chosen =
      target === 'Earth'
        ? [
            { name: '北京', latitude: 39.9042, longitude: 116.4074 },
            { name: '珠穆朗玛峰', latitude: 27.9881, longitude: 86.925 },
          ]
        : ['Olympus Mons', 'Valles Marineris', 'Jezero', 'Tianwen-1 / Zhurong']
            .map((name) => MARS_FEATURES.find((f) => f.nameEn === name))
            .filter(Boolean);
    for (const f of chosen) {
      const b = document.createElement('button');
      b.textContent = t(featureName(f));
      b.onclick = () => selectFeature(f);
      guide.append(b);
    }
    syncSite();
    showSource();
  }
  function selectFeature(f) {
    selection = f;
    $('[data-selection]').textContent =
      `${featureName(f) || t('已选地点')} · ${f.latitude.toFixed(3)}°, ${f.longitude.toFixed(3)}°${Number.isFinite(f.height) ? '\n' + t('高程概览值') + ' ' + Math.round(f.height).toLocaleString() + ' m' : ''}${f.description ? '\n' + t(f.description) : ''}`;
    $('[data-view]').value = 'explore';
    $('[data-fov-row]').hidden = true;
    view?.focus(f);
  }
  function layerSource(id) {
    if (target === 'Earth' && earthObservation.source(id)) return earthObservation.source(id);
    const info = sim.environment.assets.mars?.layers?.[id];
    const earthSource =
      document.getElementById(id === 'night' ? 'nightSource' : 'daySource')?.selectedOptions?.[0]
        ?.textContent ??
      sim.environment.settings?.[id === 'night' ? 'nightSource' : 'daySource'] ??
      '';
    return target === 'Earth'
      ? `${t(layerNames[id])} · ${earthSource} · NASA / NOAA / Natural Earth / ETOPO${$('[data-clouds]').checked ? '\n' + (sim.environment.weather?.status('cloud') ?? '') : ''}`
      : `${t(info?.label ?? layerNames[id])} · ${info?.credit ?? 'NASA / USGS / ASU'}${info?.description ? '\n' + t(info.description) : ''}`;
  }
  function showSource() {
    earthObservation.update(target, layer);
    const earth = target === 'Earth';
    const dateOption = $('[data-compare] option[value="date"]');
    if (dateOption) {
      dateOption.disabled = earth && !!sim.environment.assets.earthObservation?.layers?.[layer];
      dateOption.textContent = t(earth ? '不同照明时刻' : '不同日期 · 同一视场');
      if (dateOption.disabled && $('[data-compare]').value === 'date')
        $('[data-compare]').value = 'off';
    }
    for (const key of ['time-b', 'apply-b'])
      $(`[data-${key}]`).hidden =
        earth && !!sim.environment.assets.earthObservation?.layers?.[layer];
    const record = earth
      ? sim.environment.weather?.items?.find((r) => r.id === sim.environment.weather.active.cloud)
      : null;
    const ids = [layer];
    if ($('[data-compare]').value === 'layer') ids.push($('[data-layer-b]').value);
    const source = [...new Set(ids)].map(layerSource).join('\n\n');
    $('[data-source]').textContent = source;
    const legend = $('[data-legend]');
    legend.replaceChildren();
    if (earth) for (const id of [...new Set(ids)]) earthObservation.legend(id, legend);
    $('[data-cloud-row]').hidden =
      target !== 'Earth' ||
      (earth && ids.every((id) => !!sim.environment.assets.earthObservation?.layers?.[id]));
    $('[data-clouds]').disabled =
      earth && ids.every((id) => !!sim.environment.assets.earthObservation?.layers?.[id]);
    if (target === 'Mars' && ids.includes('geology'))
      for (const unit of geologyLegend.units) {
        const row = document.createElement('p'),
          swatch = document.createElement('span');
        swatch.style.cssText = `display:inline-block;width:12px;height:12px;margin-right:6px;background:${unit.color}`;
        row.append(swatch, document.createTextNode(unit.id + ' · ' + unit.label));
        legend.append(row);
      }
    if (target === 'Mars' && ids.includes('elevation'))
      for (const unit of sim.environment.assets.mars?.terrain?.colorLegend ?? []) {
        const row = document.createElement('p'),
          swatch = document.createElement('span');
        swatch.style.cssText = `display:inline-block;width:12px;height:12px;margin-right:6px;background:${unit.color}`;
        row.append(swatch, document.createTextNode(`${unit.meters.toLocaleString()} m`));
        legend.append(row);
      }
    $('.planet-credit').textContent = earth
      ? [...new Set(ids)]
          .map(
            (id) => sim.environment.assets.earthObservation?.layers?.[id]?.credit ?? 'NASA / NOAA'
          )
          .join(' · ')
      : source.replaceAll('\n', ' · ');
    return { source, record };
  }
  async function handoff(body) {
    close();
    const requestedTime = sim.time;
    if (body === 'Moon') {
      const panel = await sim.flightLab.open('lunar');
      panel?.setObservation?.({ time: requestedTime, site });
      return;
    }
    if (sim.missionId !== 'tiangong') await sim.missions.switchTo('tiangong');
    sim.xuntian.observeBody(body);
  }
  function open(body = 'Mars') {
    if (!['Earth', 'Mars'].includes(body)) {
      void handoff(body).catch((e) => sim.api.toast(e.message));
      return;
    }
    if (sim.sceneBusy || sim.missions?.busy) return;
    sim.flightLab?.close();
    sim.worldExplorer?.close();
    sim.mainFlight?.stop();
    if (!active) {
      wasControls = sim.api.controls.enabled;
      sim.api.controls.stopMotion?.();
      sim.api.controls.enabled = false;
      stage.prepend(canvas);
      host.hidden = false;
      active = true;
      view = createPlanetaryRenderer({
        renderer,
        environment: sim.environment,
        onPick: (pick) => selectFeature({ ...pick, name: t('已选地点') }),
        onMineralPick: (group) => {
          earthObservation.showSelection(group);
        },
      });
    }
    target = body;
    if (body === 'Earth') earthObservation.open();
    selection = null;
    frames = null;
    $('[data-selection]').textContent = '';
    $('[data-search]').value = '';
    $('.planet-results').replaceChildren();
    $('[data-site-results]').replaceChildren();
    panel.classList.toggle('folded', window.matchMedia?.('(max-width:760px)').matches ?? false);
    layer = body === 'Earth' ? 'day' : 'visible';
    $('[data-layer]').value = '';
    $('[data-layer-b]').value = '';
    $('[data-compare]').value = 'off';
    $('[data-view]').value = 'explore';
    labels.replaceChildren();
    $('.planet-events').replaceChildren();
    eventRequest?.abort();
    $('[data-event-search]').disabled = false;
    timeDraft = false;
    $('[data-time]').value = dateTimeText(sim.time, '24');
    compareTime = Math.min(Date.UTC(2101, 0, 1) - 1, sim.time + 30 * 86400000);
    $('[data-time-b]').value = dateTimeText(compareTime, '24');
    sim.environment.elevation?.setEnabled(true);
    renderBody();
    $('[data-event-search]').closest?.('details')?.removeAttribute('open');
    view.focus(body === 'Earth' ? site : { latitude: 18.65, longitude: -133.8 });
    message('');
    void comparisonPresets();
    canvas.focus();
  }
  function close() {
    if (!active) return;
    active = false;
    earthObservation.close();
    eventRequest?.abort();
    presetRequest?.abort();
    view?.dispose();
    view = null;
    labels.replaceChildren();
    originalParent.prepend(canvas);
    host.hidden = true;
    sim.api.controls.stopMotion?.();
    sim.api.controls.enabled = wasControls;
    sim.lastWall = performance.now();
    sim.dirty = true;
    sim.snap = true;
    sim.timeUI();
  }
  function jump() {
    const time = dateTimeValue($('[data-time]').value, '24');
    if (!Number.isFinite(time) || time < Date.UTC(1900, 0, 1) || time >= Date.UTC(2101, 0, 1)) {
      message(t('观测日期支持 1900—2100 年'));
      return;
    }
    sim.seek(time);
    sim.paused = true;
    timeDraft = false;
    $('[data-time]').value = dateTimeText(time, '24');
    invalidateEvents();
    message('');
    void comparisonPresets();
  }
  $('[data-time]').oninput = () => (timeDraft = true);
  function dateKeys(input, apply, draft) {
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        apply();
        return;
      }
      if (e.key === 'Escape') {
        input.value = dateTimeText(input === $('[data-time]') ? sim.time : compareTime, '24');
        draft?.(false);
        return;
      }
      if (
        !['ArrowUp', 'ArrowDown'].includes(e.key) ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.isComposing
      )
        return;
      const parts = [...input.value.matchAll(/\d+/g)];
      const index = parts.findIndex((p) => (input.selectionStart ?? 0) <= p.index + p[0].length);
      if (index < 0) return;
      const next = stepDateTime(input.value, '24', index, e.key === 'ArrowUp' ? 1 : -1);
      if (next === null) return;
      e.preventDefault();
      input.value = next;
      draft?.(true);
      const part = [...next.matchAll(/\d+/g)][index];
      input.setSelectionRange(part.index, part.index + part[0].length);
    };
  }
  dateKeys($('[data-time]'), jump, (value) => (timeDraft = value));
  $('[data-jump]').onclick = jump;
  $('[data-now]').onclick = () => {
    sim.realTime();
    timeDraft = false;
    $('[data-time]').value = dateTimeText(sim.time, '24');
    invalidateEvents();
    void comparisonPresets();
  };
  $('[data-body]').onchange = (e) => open(e.target.value);
  $('[data-exit]').onclick = close;
  $('[data-solar]').onclick = () => {
    const id = target;
    close();
    sim.worldExplorer.open('solar', { target: id });
  };
  $('[data-ground]').onclick = () => {
    const p = selection ?? site;
    close();
    sim.worldExplorer.openGround({
      ...p,
      name: featureName(p) || t('已选地点'),
      height: earthHeight(p.longitude, p.latitude),
    });
  };
  $('[data-weather]').onclick = () => sim.environment.weather.resourcePanel.openCloud();
  $('.planet-panel-toggle').onclick = () => panel.classList.toggle('folded');
  $('[data-layer]').onchange = (e) => {
    layer = e.target.value;
    showSource();
  };
  $('[data-clouds]').onchange = showSource;
  $('[data-layer-b]').onchange = showSource;
  $('[data-compare]').onchange = showSource;
  $('[data-view]').onchange = () => {
    $('[data-fov-row]').hidden = $('[data-view]').value !== 'observe' || target === 'Earth';
  };
  $('[data-apply-b]').onclick = () => {
    const time = dateTimeValue($('[data-time-b]').value, '24');
    if (!Number.isFinite(time) || time < Date.UTC(1900, 0, 1) || time >= Date.UTC(2101, 0, 1)) {
      message(t('观测日期支持 1900—2100 年'));
      return;
    }
    compareTime = time;
    $('[data-compare]').value = 'date';
    if (target === 'Mars') {
      $('[data-view]').value = 'observe';
      $('[data-fov-row]').hidden = false;
    }
    showSource();
    message('');
  };
  dateKeys($('[data-time-b]'), () => $('[data-apply-b]').onclick());
  function invalidateEvents() {
    eventRequest?.abort();
    $('[data-event-search]').disabled = false;
    $('.planet-events').replaceChildren();
  }
  $('[data-event-body]').onchange = () => {
    invalidateEvents();
    message('');
  };
  function siteChanged() {
    syncSite();
    rememberObserver(site);
    invalidateEvents();
    message('');
    void comparisonPresets();
  }
  function results(container, rows, choose) {
    container.replaceChildren();
    for (const f of rows) {
      const b = document.createElement('button');
      b.textContent = featureName(f);
      b.onclick = () => {
        choose(f);
        container.replaceChildren();
      };
      container.append(b);
    }
  }
  $('[data-search]').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    results(
      $('.planet-results'),
      q
        ? features()
            .filter((f) =>
              `${f.name} ${f.nameZh} ${f.nameEn} ${f.en} ${f.id}`.toLowerCase().includes(q)
            )
            .slice(0, 8)
        : [],
      selectFeature
    );
  };
  $('[data-site-search]').oninput = (e) =>
    results($('[data-site-results]'), searchWorldPlaces(e.target.value, getLanguage()), (p) => {
      site = { ...p, height: earthHeight(p.longitude, p.latitude) };
      siteChanged();
    });
  $('[data-site-apply]').onclick = () => {
    const latitude = Number($('[data-lat]').value),
      longitude = Number($('[data-lon]').value),
      height = Number($('[data-height]').value);
    if (
      ['lat', 'lon', 'height'].some((key) => !$(`[data-${key}]`).value.trim()) ||
      ![latitude, longitude, height].every(Number.isFinite) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 ||
      height < -1000 ||
      height > 100000
    ) {
      message(t('观测地点无效'));
      return;
    }
    site = {
      latitude,
      longitude,
      height,
      name:
        latitude === site.latitude && longitude === site.longitude
          ? site.name
          : `${latitude.toFixed(3)}°, ${longitude.toFixed(3)}°`,
    };
    siteChanged();
  };
  async function comparisonPresets() {
    const box = $('[data-date-presets]');
    box.replaceChildren();
    presetRequest?.abort();
    if (target !== 'Mars' || !active) return;
    const controller = new AbortController();
    presetRequest = controller;
    try {
      const requestedTime = sim.time;
      const rows = await planetaryComparisonDates({
        body: 'Mars',
        time: requestedTime,
        site: { ...site },
        signal: controller.signal,
      });
      if (!active || target !== 'Mars' || controller.signal.aborted || presetRequest !== controller)
        return;
      for (const row of rows.filter(
        (row) => row.time >= Date.UTC(1900, 0, 1) && row.time < Date.UTC(2101, 0, 1)
      )) {
        const b = document.createElement('button');
        b.textContent = t(row.label);
        b.onclick = () => {
          compareTime = row.time;
          $('[data-time-b]').value = dateTimeText(compareTime, '24');
          $('[data-compare]').value = 'date';
          $('[data-view]').value = 'observe';
          $('[data-fov-row]').hidden = false;
          showSource();
        };
        box.append(b);
      }
    } catch {}
  }
  $('[data-event-search]').onclick = async () => {
    eventRequest?.abort();
    const controller = new AbortController();
    eventRequest = controller;
    const button = $('[data-event-search]'),
      box = $('.planet-events');
    button.disabled = true;
    box.replaceChildren();
    message(t('正在计算天文事件…'));
    try {
      const rows = await findPlanetaryEvents({
        time: sim.time,
        site,
        body: $('[data-event-body]').value,
        limit: 5,
        signal: controller.signal,
      });
      if (!active || controller.signal.aborted || eventRequest !== controller) return;
      message(rows.length ? '' : t('这个时间窗口没有可观测事件'));
      for (const row of rows) {
        const b = document.createElement('button'),
          title = document.createElement('span'),
          detail = document.createElement('small');
        title.textContent = t(row.title);
        detail.textContent = `${dateTimeText(row.observableTime ?? row.time, '24').slice(0, -3)} UTC+8\n${t(row.description ?? '')}${row.accuracyLabel ? ' · ' + t(row.accuracyLabel) : ''}${row.ongoing ? ' · ' + t('进行中') : ''}`;
        b.append(title, detail);
        b.onclick = () => {
          const eventTime = row.observableTime ?? row.time;
          if (eventTime < Date.UTC(1900, 0, 1) || eventTime >= Date.UTC(2101, 0, 1)) {
            message(t('观测日期支持 1900—2100 年'));
            return;
          }
          sim.seek(eventTime);
          sim.paused = true;
          timeDraft = false;
          if (row.body === 'Mars') {
            open('Mars');
            $('[data-view]').value = 'observe';
            $('[data-fov-row]').hidden = false;
          } else {
            const eventSite = { ...site };
            close();
            if (row.body === 'Jupiter')
              sim.worldExplorer.open('solar', { target: 'Jupiter', system: 'Jupiter' });
            else sim.worldExplorer.openGround(eventSite, { body: row.body, fov: 5 });
          }
        };
        box.append(b);
      }
    } catch (e) {
      if (!controller.signal.aborted) message(t(e.message));
    } finally {
      if (eventRequest === controller) button.disabled = false;
    }
  };
  function settings() {
    return {
      target,
      layer,
      time: sim.time,
      site,
      view: $('[data-view]').value,
      fov: Number($('[data-fov]').value),
      atlas: $('[data-atlas]').checked,
      relief: $('[data-relief]').checked,
      clouds: $('[data-clouds]').checked,
      ...earthObservation.settings(),
    };
  }
  const labelMeasure = document.createElement('canvas').getContext('2d');
  labelMeasure.font = '11px system-ui';
  let lastOverlay = 0,
    lastEarthSource = '';
  function paint(w, h) {
    const s = settings(),
      mode = $('[data-compare]').value,
      b =
        mode === 'off'
          ? null
          : mode === 'date'
            ? { time: compareTime }
            : { layer: $('[data-layer-b]').value };
    frames = view.frame(s, b, w, h);
    lastSettings = s;
    stage.classList.toggle('comparing', !!b);
    const now = performance.now();
    if (now - lastOverlay < 100) return;
    lastOverlay = now;
    const captions = $('.planet-captions');
    captions.replaceChildren();
    for (const frame of [frames.a, frames.b].filter(Boolean)) {
      const el = document.createElement('div');
      const o = frame.settings.view === 'observe' ? frame.observation : null;
      el.textContent = `${t(layerNames[frame.settings.layer])} · ${frame.settings.target === 'Earth' && sim.environment.assets.earthObservation?.layers?.[frame.settings.layer]?.periodStart ? sim.environment.assets.earthObservation.layers[frame.settings.layer].periodStart + ' — ' + sim.environment.assets.earthObservation.layers[frame.settings.layer].periodEnd : frame.settings.target === 'Earth' && frame.settings.layer === 'earthElevation' ? 'ETOPO 2022' : dateTimeText(frame.settings.time, '24') + ' UTC+8'}${o ? '\n' + o.angularDiameterArcsec.toFixed(1) + '″ · ' + t('中央经线') + ' ' + o.centralMeridianEastDeg.toFixed(1) + '°E' : ''}`;
      captions.append(el);
    }
    const o = frames.a.settings.view === 'observe' ? frames.a.observation : null;
    $('.planet-readout').textContent = o
      ? `${t('距地球')} ${(o.earthDistanceKm / 1e6).toFixed(2)} ${t('百万千米')} · ${t('照亮比例')} ${(o.illuminatedFraction * 100).toFixed(1)}%\n${t('方位角')} ${o.azimuthDeg.toFixed(1)}° · ${t('高度角')} ${o.apparentAltitudeDeg.toFixed(1)}° · ${t(o.aboveHorizon ? '地平线上方' : '地平线下方')}`
      : `${t(bodies[target])} · ${t('点击地表选择地点')}\n${selection ? selection.latitude.toFixed(3) + '°, ' + selection.longitude.toFixed(3) + '°' : t('拖动旋转 · 滚轮缩放')}`;
    labels.replaceChildren();
    if ($('[data-labels]').checked) {
      const priority = (f) =>
        selection && f.latitude === selection.latitude && f.longitude === selection.longitude
          ? 0
          : target === 'Earth'
            ? (f.rank ?? 4) * 10 + ({ capital: 0, country: 1, city: 2, landform: 3 }[f.kind] ?? 4)
            : f.country === 'CN'
              ? 1
              : 2;
      const list = [
        ...(selection && (!selection.mineral || s.mineralVisible) ? [selection] : []),
        ...features().filter((f) => f !== selection),
      ].sort((a, b) => priority(a) - priority(b));
      for (const frame of [frames.a, frames.b].filter(Boolean)) {
        const occupied = [];
        for (const f of list) {
          if (occupied.length >= (frame.settings.view === 'observe' ? 8 : 24)) break;
          const p = view.project(f, frame);
          if (!p) continue;
          const width = labelMeasure.measureText(featureName(f)).width + 22;
          const box = { left: p.x + 5, right: p.x + width, top: p.y - 11, bottom: p.y + 11 };
          if (
            box.right > frame.rect.x + frame.rect.width - 8 ||
            box.top < 65 ||
            occupied.some(
              (q) =>
                box.left < q.right + 6 &&
                box.right + 6 > q.left &&
                box.top < q.bottom &&
                box.bottom > q.top
            )
          )
            continue;
          occupied.push(box);
          const el = document.createElement('span');
          el.className = 'planet-label' + (f.country === 'CN' ? ' cn' : '');
          el.textContent = featureName(f);
          el.style.left = p.x + 'px';
          el.style.top = p.y + 'px';
          labels.append(el);
        }
      }
    }
  }
  function tick(wall, dt = 0) {
    if (!active) return;
    sim.lastWall = wall;
    if (sim.mode === 'real') sim.time = Date.now();
    else if (!sim.paused) {
      const next = sim.time + Math.max(0, Math.min(0.25, dt)) * sim.speed * 1000;
      sim.time = Math.max(Date.UTC(1900, 0, 1), Math.min(Date.UTC(2101, 0, 1) - 1, next));
      if (sim.time !== next) sim.paused = true;
    }
    const w = Math.max(1, stage.clientWidth),
      h = Math.max(1, stage.clientHeight);
    if (
      canvas.clientWidth !== w ||
      canvas.clientHeight !== h ||
      canvas.width !== Math.round(w * renderer.getPixelRatio())
    )
      renderer.setSize(w, h, false);
    try {
      paint(w, h);
      if (wall - lastUI > 300) {
        if (!timeDraft && document.activeElement !== $('[data-time]'))
          $('[data-time]').value = dateTimeText(sim.time, '24');
        if (target === 'Earth') {
          const key = JSON.stringify([
            sim.environment.weather?.active.cloud,
            sim.environment.weather?.settings.cloud,
            sim.environment.settings?.daySource,
            sim.environment.settings?.nightSource,
          ]);
          if (key !== lastEarthSource) {
            lastEarthSource = key;
            showSource();
          }
        }
        if (view.error) message(t(view.error));
        lastUI = wall;
      }
    } catch (e) {
      message(t(e.message));
    }
  }
  $('[data-photo]').onclick = () => {
    if (!view || view.loading || earthObservation.loading) {
      message(t('图层加载中，请稍后拍照'));
      return;
    }
    lastOverlay = 0;
    tick(performance.now());
    const capturedTarget = target,
      capturedTime = sim.time;
    const output = document.createElement('canvas');
    output.width = canvas.width;
    const scale = canvas.width / stage.clientWidth;
    const snapshots = [frames.a, frames.b].filter(Boolean);
    const margin = 16 * scale,
      lineHeight = 17 * scale;
    // Each column owns its date, layer and source, including when comparing layers.
    const c = output.getContext('2d');
    c.font = `${11 * scale}px system-ui`;
    function wrap(text, width) {
      const lines = [];
      for (const paragraph of text.split('\n')) {
        let line = '';
        for (const char of paragraph) {
          if (line && c.measureText(line + char).width > width) {
            lines.push(line);
            line = '';
          }
          line += char;
        }
        if (line) lines.push(line);
      }
      return lines;
    }
    const columnWidth = output.width / snapshots.length;
    const notes = snapshots.map((frame) => [
      `${t(layerNames[frame.settings.layer])} · ${t('场景时刻')} ${dateTimeText(frame.settings.time, '24')} UTC+8`,
      ...(earthObservation.photoNote ? [earthObservation.photoNote] : []),
      ...wrap(layerSource(frame.settings.layer), columnWidth - margin * 2),
    ]);
    output.height =
      canvas.height +
      Math.ceil(105 * scale + Math.max(...notes.map((lines) => lines.length)) * lineHeight);
    c.fillStyle = '#07111d';
    c.fillRect(0, 0, output.width, output.height);
    c.drawImage(canvas, 0, 0);
    c.font = `${11 * scale}px system-ui`;
    c.textBaseline = 'middle';
    c.shadowColor = '#000';
    c.shadowBlur = 3 * scale;
    for (const el of labels.children) {
      c.fillStyle = el.classList.contains('cn') ? '#ff6d64' : '#eee4cd';
      c.fillText(
        (el.classList.contains('cn') ? '★ ' : '· ') + el.textContent,
        (parseFloat(el.style.left) + 7) * scale,
        parseFloat(el.style.top) * scale
      );
    }
    c.fillStyle = '#cfdded';
    c.textAlign = 'center';
    [...$('.planet-captions').children].forEach((caption, index) => {
      caption.textContent
        .split('\n')
        .forEach((line, n) =>
          c.fillText(
            line,
            columnWidth * (index + 0.5),
            (24 + 17 * n) * scale,
            columnWidth - margin * 2
          )
        );
    });
    c.shadowBlur = 0;
    c.textAlign = 'left';
    c.fillStyle = '#ead7ad';
    c.font = `${16 * scale}px system-ui`;
    c.fillText(`STARORBIT · ${t(bodies[capturedTarget])}`, margin, canvas.height + 22 * scale);
    c.fillStyle = '#a8bacb';
    c.font = `${11 * scale}px system-ui`;
    const siteText =
      capturedTarget === 'Earth'
        ? selection
          ? `${featureName(selection)} · ${selection.latitude.toFixed(3)}°, ${selection.longitude.toFixed(3)}°`
          : t('地球全球观测')
        : `${site.name ?? ''} ${site.latitude.toFixed(3)}°, ${site.longitude.toFixed(3)}° · ${site.height.toFixed(0)} m`;
    c.fillText(siteText, margin, canvas.height + 43 * scale, output.width - margin * 2);
    notes.forEach((lines, index) =>
      lines.forEach((line, n) =>
        c.fillText(
          line,
          index * columnWidth + margin,
          canvas.height + 65 * scale + n * lineHeight,
          columnWidth - margin * 2
        )
      )
    );
    snapshots.forEach((frame, i) =>
      earthObservation.paintLegend(
        c,
        frame.settings.layer,
        i * columnWidth + margin,
        output.height - 35 * scale,
        columnWidth - 2 * margin,
        scale
      )
    );
    output.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `StarOrbit-${capturedTarget}-${capturedTime}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, 'image/png');
  };
  const off = onLanguageChange(translate);
  translate();
  syncSite();
  return {
    get active() {
      return active;
    },
    open,
    close,
    tick,
    get state() {
      return { target, site, selection, settings: lastSettings };
    },
    dispose() {
      close();
      off();
      earthObservation.dispose();
      entry.remove();
      host.remove();
      style.remove();
    },
  };
}
