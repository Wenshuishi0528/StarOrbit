import * as THREE from 'three';
import { Equator, Horizon, Observer } from 'astronomy-engine';
import atlas from '../assets/geography/atlas.json';
import { createGroundState, normalizeGroundSite } from './ground-world-math.js';
import { createGroundWorldInput } from './ground-world-input.js';
import {
  createSharedWorldEarth,
  groundRenderPose,
  mountWorldEarthControls,
} from './shared-world-earth.js';
import { mountGroundLocationMap } from './ground-location-map.js';
import { createGroundSurface } from './ground-world-surface.js';
import { createGroundSky } from './ground-world-sky.js';
import { createSolarWorld } from './solar-world.js';
import { createInterstellarWorld } from './interstellar-world.js';
import {
  readWorldSkySettings,
  applyWorldSkySettings,
  mountWorldSkyControls,
} from './shared-world-sky.js';
import { AU_LY } from './interstellar-math.js';
import { lastObserver } from './observer-settings.js';
import { dateTimeText, dateTimeValue, stepDateTime } from './date-time-input.js';
import { t, getLanguage, onLanguageChange, errorText } from './i18n.js';

import { clampTime } from './orbit.js';
import { ELEVATION_SOURCE } from './earth-elevation-source.js';
import { skyCulturePhotoCredit } from './sky-culture-caption.js';

const KEY = 'starorbit-world-v1';
const css = `
.world-explorer{position:fixed;inset:0;z-index:1000;padding:0;border:0;background:#030811;color:#e8eff7;font:14px system-ui;display:flex;flex-direction:column}
.world-explorer[hidden]{display:none}.world-bar{position:relative;height:auto;flex-shrink:0;justify-content:flex-start;display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 20px;background:#0b1420;border-bottom:1px solid #294052;z-index:5}.world-bar strong{color:#eed5a3;letter-spacing:2px;margin-right:16px}.world-bar input{width:190px}.world-bar button.active{background:#334e62;color:#ffe4ae}.world-explorer button,.world-explorer select,.world-explorer input{font:inherit;color:#e2edf8;background:#172737;border:1px solid #345065;border-radius:6px;padding:7px 10px}.world-explorer button{cursor:pointer}.world-explorer button:hover{background:#294359}.world-stage{flex:1;min-height:0;position:relative;overflow:hidden}.world-stage>canvas{position:absolute;inset:0;width:100%;height:100%;outline:0}.world-stage>canvas:focus{box-shadow:inset 0 0 0 1px #7399ae}.world-ground-panel{position:absolute;bottom:auto;top:18px;left:18px;width:280px;max-height:calc(100% - 115px);overflow:auto;padding:18px;background:#0b1623e8;border:1px solid #385065;border-radius:12px;z-index:4;backdrop-filter:blur(16px)}.world-ground-panel[hidden]{display:none}.world-ground-panel h3{margin:0 0 14px;color:#eed5a3}.world-ground-panel label{display:block;margin:12px 0 5px;color:#a8bdcf}.world-ground-panel label.check{display:flex;align-items:center;gap:8px}.world-ground-panel input:not([type=checkbox]),.world-ground-panel select{box-sizing:border-box;width:100%}.world-ground-panel .pair{display:flex;gap:8px}.world-ground-panel .pair>input{min-width:0;flex:1}.world-ground-panel .pair>button{flex-shrink:0;white-space:nowrap}.world-ground-panel .pair>div{width:50%}.world-ground-panel details{margin-top:15px}.world-ground-panel summary{cursor:pointer;color:#d7c39d}.world-results button{display:block;width:100%;text-align:left;margin-top:6px;font-size:12px}.world-hud{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);padding:10px 22px;background:#08121dcc;border:1px solid #385065;border-radius:25px;white-space:pre-line;text-align:center;z-index:3;pointer-events:none;font-variant-numeric:tabular-nums}.world-credit{position:absolute;bottom:5px;right:12px;font-size:10px;color:#b5c4ce;max-width:80%;text-align:right;z-index:3;pointer-events:none}.world-labels{position:absolute;inset:0;pointer-events:none;z-index:2}.world-labels span{position:absolute;color:#e5d9ba;font-size:12px;text-shadow:0 1px 4px #000;transform:translate(-50%,-50%)}.world-panel-toggle{position:absolute;right:18px;top:18px;z-index:5}.world-ground-panel p{font-size:12px;line-height:1.6;color:#a8bdcf}.world-ground-panel canvas{width:100%;height:125px;border-radius:6px;cursor:crosshair}.world-entry{display:flex;gap:8px;margin:10px 0}.world-entry button{flex:1}.world-ground-panel .world-entry{flex-wrap:wrap}.world-ground-panel .world-entry button{min-width:40%;font-size:12px}.world-key-guide{position:absolute;right:18px;bottom:40px;z-index:5;background:#0b1623dd;border:1px solid #385065;border-radius:10px;padding:10px 14px;color:#b8ccdf;font:12px/1.9 system-ui}.world-key-guide[hidden]{display:none}.world-key-guide summary{cursor:pointer;color:#ead6ae}.world-key-guide kbd{font:inherit;color:#edf4fa}@media(max-width:700px){.world-key-guide{bottom:105px;right:8px;font-size:10px;max-width:45%;padding:6px}}
@media(max-width:700px){.world-bar{gap:5px;padding:7px;font-size:12px}.world-bar strong{display:none}.world-bar input{width:150px}.world-ground-panel{width:230px;top:8px;left:8px;padding:12px}.world-hud{font-size:11px;max-width:85%;bottom:26px}.world-credit{font-size:8px}.solar-world-panel{max-width:210px}}
`;
const fold = (s) =>
  String(s || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[\s市]/g, '');
export function searchWorldPlaces(query, language = 'zh') {
  const key = fold(query);
  if (!key) return [];
  return atlas.labels
    .map((p) => ({
      p,
      score: Math.min(
        ...[p.zh, p.en, p.fr, p.ru]
          .filter(Boolean)
          .map((n) =>
            fold(n) === key ? 0 : fold(n).startsWith(key) ? 1 : fold(n).includes(key) ? 2 : 9
          )
      ),
    }))
    .filter((x) => x.score < 9)
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)
    .map(({ p }) => ({
      name: p[language] || p.zh || p.en,
      latitude: p.lat,
      longitude: p.lon,
      height: 0,
    }));
}

export function installWorldExplorer(sim) {
  const { renderer, controls } = sim.api,
    canvas = renderer.domElement;
  const originalParent = canvas.parentNode;
  let previousControlsEnabled = controls.enabled;
  const renderSize = new THREE.Vector2();
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  const host = document.createElement('section');
  host.className = 'world-explorer';
  host.hidden = true;
  host.setAttribute('aria-label', t('地表、太阳系与星际'));
  host.innerHTML = `<header class="world-bar"><strong>STARORBIT · 世界</strong><button data-mode="ground">地表观测</button><button data-mode="solar">太阳系</button><button data-mode="stellar">星际穿梭</button><label>UTC+8 <input data-time aria-label="世界时间（UTC+8）" placeholder="YYYY-MM-DD HH:mm:ss"></label><button data-jump>跳转</button><button data-play>暂停</button><select data-speed aria-label="时间速度"><option value="1">1×</option><option value="60">1 分钟/秒</option><option value="3600">1 小时/秒</option><option value="86400">1 天/秒</option><option value="-3600">倒放 1 小时/秒</option></select><button data-now>现在</button><button data-photo>拍照</button><button data-exit>返回轨道</button></header><div class="world-stage"><div class="world-labels"></div><button class="world-panel-toggle">地点与画面</button><aside class="world-ground-panel"><h3>地表观测</h3><label>城市或地理名称</label><div class="pair"><input data-search aria-label="城市或地理名称" placeholder="北京、珠穆朗玛峰…"><button data-search-online>搜索</button></div><div class="world-results"></div><details><summary>坐标与地图选点</summary><div class="pair"><div><label>纬度 °</label><input data-lat type="number" min="-90" max="90" step=".00001"></div><div><label>经度 °</label><input data-lon type="number" min="-180" max="180" step=".00001"></div></div><button data-locate>到达此处</button><canvas data-map width="560" height="280" aria-label="点击世界地图选择地点"></canvas></details><div class="world-entry"><button data-altitude="ground">回到地面</button><button data-altitude="10000">高空</button><button data-altitude="400000">近地轨道</button><button data-altitude="20000000">完整地球</button></div><label data-height-label>海拔（米）</label><input data-height type="number" value="1.7" step=".1" min=".2" max="1000"><label>移动速度</label><select data-move-speed><option value="slow">慢速 · 2 m/s</option><option value="normal" selected>自动 · 随高度加速</option><option value="fast">快速 · 随高度加速</option></select><div class="pair" style="margin-top:12px"><button data-save>收藏地点</button><select data-bookmarks aria-label="收藏地点"><option value="">我的地点</option></select></div><details open><summary>天空与标注</summary><label>观察效果</label><select data-appearance><option value="natural">自然天空</option><option value="galaxy">银河增强</option><option value="dss">DSS 巡天影像</option></select><label><input type="checkbox" data-see-through-terrain> 透过地形看星空</label><div data-shared-sky></div><label>视场</label><input data-fov type="range" min=".006" max="100" step=".001" value="65"></details><div data-shared-earth></div><details><summary>操控与数据</summary><p>点击画面后操作：H / N 前后，J / L 左右，K 上升、I 下降；W 低头、S 抬头，A / D 转向。拖动鼠标看向四周，滚轮缩放。持续按住平滑加速，松开减速。</p><p data-surface-status></p><p>地形：ETOPO 2022 / Copernicus GLO-30。银河与 DSS 为历史影像，日月行星按所选时刻显示。</p><p>地名：Natural Earth / 天地图；在线搜索：Photon · © OpenStreetMap contributors。</p></details><p data-message role="status"></p></aside><div class="world-hud"></div><div class="world-credit"></div><details class="world-key-guide" open><summary>移动键位</summary><div><kbd>H / N</kbd> 前后　<kbd>J / L</kbd> 左右　<kbd>K / I</kbd> 升降<br><kbd>W / S</kbd> 俯仰　<kbd>A / D</kbd> 转向　<kbd>空格</kbd> 停止<br>拖动转向 · 滚轮缩放 · 持续按住加速</div></details></div>`;
  document.body.append(host);
  const $ = (s) => host.querySelector(s),
    stage = $('.world-stage'),
    panel = $('.world-ground-panel'),
    labelRoot = $('.world-labels'),
    hud = $('.world-hud'),
    credit = $('.world-credit');
  const locationMap = mountGroundLocationMap({ host: stage, environment: sim.environment });
  locationMap.setVisible(false);
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(KEY));
  } catch {}
  function safeSite(site) {
    try {
      if (
        !site ||
        ![site.latitude, site.longitude, site.height].every(Number.isFinite) ||
        Math.abs(site.longitude) > 180 ||
        site.height < -12000 ||
        site.height > 100000000
      )
        return null;
      return normalizeGroundSite(site);
    } catch {
      return null;
    }
  }
  const state = createGroundState({
    site: safeSite(saved?.site) ||
      lastObserver() || { name: t('北京'), latitude: 39.9042, longitude: 116.4074, height: 50 },
    mode: 'free',
    speed: saved?.navigation?.speed,
    azimuth: Number.isFinite(saved?.navigation?.azimuth) ? saved.navigation.azimuth : 180,
    elevation: Number.isFinite(saved?.navigation?.elevation) ? saved.navigation.elevation : 15,
    eyeHeight: Number.isFinite(saved?.navigation?.eyeHeight)
      ? Math.max(0.2, Math.min(1000, saved.navigation.eyeHeight))
      : 1.7,
  });
  let mode = null,
    sky = null,
    surface = null,
    groundEarth = null,
    input = null,
    solar = null,
    stellar = null,
    stellarPose = null,
    groundScene = null,
    groundCamera = null,
    light = null,
    ambient = null,
    lastClock = 0,
    request = null,
    disposed = false,
    heightFlight = null;
  let bookmarks = Array.isArray(saved?.bookmarks)
    ? saved.bookmarks.slice(0, 30).map(safeSite).filter(Boolean)
    : [];
  const settings = {
    ...readWorldSkySettings(sim.environment),
    appearance: 'natural',
    fov: 65,
    seeThroughTerrain: saved?.settings?.seeThroughTerrain === true,
  };
  if (['natural', 'galaxy', 'dss'].includes(saved?.settings?.appearance))
    settings.appearance = saved.settings.appearance;
  for (const [key, min, max] of [['fov', 0.006, 100]])
    if (Number.isFinite(saved?.settings?.[key]))
      settings[key] = Math.max(min, Math.min(max, saved.settings[key]));
  for (const key of ['appearance', 'fov']) $(`[data-${key}]`).value = settings[key];
  $('[data-see-through-terrain]').checked = settings.seeThroughTerrain;
  $('[data-see-through-terrain]').onchange = (e) => {
    settings.seeThroughTerrain = e.target.checked;
    lastLabels = 0;
    persist();
  };
  const skyControls = mountWorldSkyControls($('[data-shared-sky]'), sim.environment, {
    onChange: () => {
      Object.assign(settings, readWorldSkySettings(sim.environment));
      persist();
    },
  });
  skyControls.root.open = true;
  const earthControls = mountWorldEarthControls($(`[data-shared-earth]`), sim.environment);
  $('[data-move-speed]').value = state.speed;
  const entries = document.createElement('div');
  entries.className = 'world-entry';
  entries.innerHTML =
    '<button type="button">地表观测</button><button type="button">太阳系</button><button type="button">星际穿梭</button>';
  document.getElementById('viewMode').closest('.row').after(entries);
  entries.children[0].onclick = () => open('ground');
  entries.children[1].onclick = () => open('solar');
  entries.children[2].onclick = () => open('stellar');
  const staticLabels = [],
    staticAttributes = [];
  for (const root of [host, entries]) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode,
        key = node.nodeValue.trim();
      if (/[\u3400-\u9fff]/u.test(key) && !node.parentElement.closest('style,script'))
        staticLabels.push({ node, key });
    }
    for (const el of root.querySelectorAll('[aria-label],[placeholder]'))
      for (const attr of ['aria-label', 'placeholder']) {
        const key = el.getAttribute(attr);
        if (key && /[\u3400-\u9fff]/u.test(key)) staticAttributes.push({ el, attr, key });
      }
  }
  function translate() {
    for (const { node, key } of staticLabels) if (node.isConnected) node.nodeValue = t(key);
    for (const { el, attr, key } of staticAttributes) el.setAttribute(attr, t(key));
    host.setAttribute('aria-label', t('地表、太阳系与星际'));
    refreshBookmarks();
    syncSite();
  }
  const offLanguage = onLanguageChange(translate);
  translate();

  function persist() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          site: state.site,
          bookmarks,
          navigation: {
            mode: state.mode,
            speed: state.speed,
            azimuth: state.azimuth,
            elevation: state.elevation,
            eyeHeight: state.eyeHeight,
          },
          settings,
        })
      );
    } catch {}
  }
  function refreshBookmarks() {
    const list = $('[data-bookmarks]');
    list.replaceChildren(new Option(t('我的地点'), ''));
    bookmarks.forEach((p, i) =>
      list.add(
        new Option(p.name || `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`, String(i))
      )
    );
  }
  refreshBookmarks();
  function syncSite() {
    for (const [key, value] of [
      ['lat', state.site.latitude],
      ['lon', state.site.longitude],
      ['height', state.site.height],
    ]) {
      const node = $(`[data-${key}]`);
      if (document.activeElement !== node) node.value = value.toFixed(key === 'height' ? 1 : 5);
    }
    $('[data-height-label]').textContent = t('海拔（米）');
    $('[data-height]').min = '-12000';
    $('[data-height]').max = '100000000';
  }
  function locate(candidate) {
    const site = safeSite(candidate);
    if (!site) {
      $('[data-message]').textContent = t('坐标无效');
      return;
    }
    heightFlight = null;
    request?.abort();
    request = null;
    // Position requests carry MSL altitude; attach to the new terrain before setting eye height.
    surface?.update(site, sim.time);
    if (
      ![site.latitude, site.longitude].every(Number.isFinite) ||
      Math.abs(site.latitude) > 90 ||
      Math.abs(site.longitude) > 180
    ) {
      $('[data-message]').textContent = t('坐标无效');
      return;
    }
    input?.setSite(site);
    if (!input) state.site = { ...site };
    syncSite();
    persist();
    $('[data-message]').textContent = site.name || t('自定义地点');
  }
  function results(rows) {
    const box = $('.world-results');
    box.replaceChildren();
    for (const site of rows) {
      const b = document.createElement('button');
      b.textContent = `${site.name} · ${site.latitude.toFixed(3)}°, ${site.longitude.toFixed(3)}°`;
      b.onclick = () => {
        locate(site);
        box.replaceChildren();
      };
      box.append(b);
    }
  }
  $('[data-search]').oninput = () => {
    request?.abort();
    request = null;
    results(searchWorldPlaces($('[data-search]').value, getLanguage()));
  };
  $('[data-search-online]').onclick = async () => {
    const query = $('[data-search]').value.trim();
    if (!query) return;
    request?.abort();
    const controller = (request = new AbortController());
    $('[data-message]').textContent = t('正在搜索地点…');
    try {
      const r = await fetch(
        'https://photon.komoot.io/api/?limit=7&q=' + encodeURIComponent(query),
        { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) }
      );
      if (!r.ok) throw Error();
      const data = await r.json();
      if (controller !== request || controller.signal.aborted || disposed || !mode) return;
      const online = (Array.isArray(data.features) ? data.features : [])
        .filter(
          (f) =>
            f?.properties && f?.geometry?.type === 'Point' && f.geometry.coordinates?.length >= 2
        )
        .map((f) => ({
          name: [f.properties.name, f.properties.city, f.properties.country]
            .filter((v, i, a) => v && a.indexOf(v) === i)
            .join(' · '),
          longitude: f.geometry.coordinates[0],
          latitude: f.geometry.coordinates[1],
          height: 0,
        }))
        .map(safeSite)
        .filter(Boolean);
      results([...searchWorldPlaces(query, getLanguage()), ...online].slice(0, 14));
      $('[data-message]').textContent = t('选择地点，或输入精确坐标');
    } catch (e) {
      if (
        e.name === 'AbortError' ||
        controller !== request ||
        controller.signal.aborted ||
        disposed ||
        !mode
      )
        return;
      results(searchWorldPlaces(query, getLanguage()));
      $('[data-message]').textContent = t('在线地名暂不可用，仍可使用内置地名和坐标');
    }
  };
  $('[data-search]').onkeydown = (e) => {
    if (e.key === 'Enter') $('[data-search-online]').click();
  };
  $('[data-locate]').onclick = () => {
    if (!$('[data-lat]').value.trim() || !$('[data-lon]').value.trim()) {
      $('[data-message]').textContent = t('坐标无效');
      return;
    }
    locate({
      name: t('自定义地点'),
      latitude: Number($('[data-lat]').value),
      longitude: Number($('[data-lon]').value),
      height: state.site.height,
    });
  };
  const map = $('[data-map]'),
    ctx = map.getContext('2d');
  ctx.fillStyle = '#102739';
  ctx.fillRect(0, 0, 560, 280);
  ctx.strokeStyle = '#527c8b';
  for (const c of atlas.countries)
    for (const part of c.parts || [])
      for (const ring of part.rings || []) {
        ctx.beginPath();
        ring.forEach(([lon, lat], i) =>
          ctx[i ? 'lineTo' : 'moveTo'](((lon + 180) / 360) * 560, ((90 - lat) / 180) * 280)
        );
        ctx.stroke();
      }
  map.onclick = (e) => {
    const r = map.getBoundingClientRect();
    locate({
      name: t('地图选点'),
      latitude: 90 - ((e.clientY - r.top) / r.height) * 180,
      longitude: ((e.clientX - r.left) / r.width) * 360 - 180,
      height: 0,
    });
  };
  $('[data-height]').onchange = (e) => {
    const h = e.target.valueAsNumber;
    if (!Number.isFinite(h) || h < -12000 || h > 100000000) {
      syncSite();
      return;
    }
    heightFlight = null;
    input?.stop();
    state.site.height = h;
    state.terrainReady = false;
    input?.update(0);
    syncSite();
    persist();
  };
  panel.querySelectorAll('[data-altitude]').forEach(
    (button) =>
      (button.onclick = () => {
        input?.stop();
        heightFlight = { from: state.site.height, target: button.dataset.altitude, elapsed: 0 };
        state.elevation = button.dataset.altitude === 'ground' ? 5 : -89.5;
        canvas.focus();
      })
  );
  $('[data-move-speed]').onchange = (e) => {
    input?.setSpeed(e.target.value);
    persist();
  };
  $('[data-save]').onclick = () => {
    const site = { ...state.site };
    if (!site.name) site.name = `${site.latitude.toFixed(4)}°, ${site.longitude.toFixed(4)}°`;
    const existing = bookmarks.findIndex(
      (p) =>
        Math.abs(p.latitude - site.latitude) < 1e-6 && Math.abs(p.longitude - site.longitude) < 1e-6
    );
    if (existing >= 0) bookmarks.splice(existing, 1);
    bookmarks.push(site);
    bookmarks = bookmarks.slice(-30);
    refreshBookmarks();
    persist();
  };
  $('[data-bookmarks]').onchange = (e) => {
    if (e.target.value !== '') locate(bookmarks[Number(e.target.value)]);
  };
  for (const key of ['appearance', 'fov']) {
    $(`[data-${key}]`).onchange = (e) => {
      settings[key] = key === 'fov' ? Number(e.target.value) : e.target.value;
      if (key === 'appearance' && settings.appearance === 'dss')
        applyWorldSkySettings(sim.environment, { source: 'dss' });
      if (key === 'appearance' && settings.appearance === 'galaxy') {
        sim.environment.settings.milky = true;
        sim.environment.save();
      }
      syncSkyUI();
      persist();
    };
  }
  function syncSkyUI() {
    skyControls.refresh();
    earthControls.refresh();
  }
  let timeDraft = false;
  $('[data-time]').oninput = () => {
    timeDraft = true;
  };
  $('[data-jump]').onclick = () => {
    const time = dateTimeValue($('[data-time]').value, '24');
    if (Number.isFinite(time)) {
      sim.seek(time);
      timeDraft = false;
      $('[data-message]').textContent = '';
    } else $('[data-message]').textContent = t('请输入有效日期时间');
  };
  $('[data-time]').onkeydown = (e) => {
    if (e.key === 'Enter') {
      $('[data-jump]').click();
      return;
    }
    if (
      e.altKey ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey ||
      e.isComposing ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
    )
      return;
    const field = e.target,
      parts = [...field.value.matchAll(/[+-]?\d{4,6}|\d{2}/g)];
    if (parts.length !== 6) return;
    const cursor = field.selectionStart ?? 0;
    let part = parts.findIndex((p, i) => cursor < p.index + p[0].length + (i === 5 ? 1 : 0));
    if (part < 0) part = 5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      part = Math.max(0, Math.min(5, part + (e.key === 'ArrowRight' ? 1 : -1)));
    else {
      const next = stepDateTime(field.value, '24', part, e.key === 'ArrowUp' ? 1 : -1);
      if (next === null) return;
      field.value = next;
      timeDraft = true;
    }
    e.preventDefault();
    const updated = [...field.value.matchAll(/[+-]?\d{4,6}|\d{2}/g)];
    field.setSelectionRange(updated[part].index, updated[part].index + updated[part][0].length);
  };
  $('[data-play]').onclick = () => {
    const pause = sim.mode === 'real' || !sim.paused;
    if (sim.mode === 'real') sim.seek(sim.time);
    sim.paused = pause;
    sim.timeUI();
  };
  $('[data-now]').onclick = () => {
    timeDraft = false;
    sim.realTime();
  };
  $('[data-speed]').onchange = (e) => {
    const speed = Number(e.target.value);
    if (![1, 60, 3600, 86400, -3600].includes(speed)) return;
    sim.mode = 'custom';
    sim.speed = speed;
    sim.paused = false;
    sim.timeUI();
  };
  $('[data-exit]').onclick = close;
  host.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => open(b.dataset.mode)));
  $('.world-panel-toggle').onclick = () => (panel.hidden = !panel.hidden);
  const wheel = (e) => {
    if (mode !== 'ground') return;
    e.preventDefault();
    settings.fov = Math.max(0.006, Math.min(100, settings.fov * Math.exp(e.deltaY * 0.001)));
    $('[data-fov]').value = settings.fov;
  };
  canvas.addEventListener('wheel', wheel, { passive: false });
  const cancelHeightFlight = (e) => {
    if (
      mode === 'ground' &&
      (/^Key[HNIJKLWASD]$/.test(e.code) || e.code === 'Space' || e.type === 'pointerdown')
    )
      heightFlight = null;
  };
  canvas.addEventListener('keydown', cancelHeightFlight);
  canvas.addEventListener('pointerdown', cancelHeightFlight);
  function destroyView() {
    input?.dispose();
    input = null;
    groundEarth?.dispose();
    groundEarth = null;
    surface?.dispose();
    surface = null;
    sky?.dispose();
    sky = null;
    solar?.dispose();
    solar = null;
    if (stellar) stellarPose = stellar.snapshot();
    stellar?.dispose();
    stellar = null;
    labelRoot.replaceChildren();
    groundScene = null;
  }
  function open(next, options = {}) {
    if (disposed || mode === next || !['ground', 'solar', 'stellar'].includes(next)) return;
    sim.planetaryObservatory?.close();
    request?.abort();
    request = null;
    persist();
    sim.mainFlight?.stop();
    if (!mode) {
      host.hidden = false;
      stage.prepend(canvas);
      previousControlsEnabled = controls.enabled;
      controls.stopMotion?.();
      controls.enabled = false;
      sim.environment.cityTerrain.setView('main', null, 1, true);
      for (const manager of [
        sim.environment.elevation,
        sim.environment.skyDetail,
        sim.environment.constellationArt,
      ])
        manager?.release('main');
    }
    heightFlight = null;
    Object.assign(settings, readWorldSkySettings(sim.environment));
    syncSkyUI();
    const departure = next === 'stellar' && mode === 'solar' ? solar.navigationPose() : null;
    const solarArrival = next === 'solar' && mode === 'stellar' ? stellar.snapshot() : null;
    destroyView();
    mode = next;
    locationMap.setVisible(next === 'ground');
    panel.hidden = next !== 'ground';
    $('.world-panel-toggle').hidden = next !== 'ground';
    hud.hidden = next !== 'ground';
    $('.world-key-guide').hidden = next !== 'ground';
    credit.hidden = next !== 'ground';
    host
      .querySelectorAll('[data-mode]')
      .forEach((b) => b.classList.toggle('active', b.dataset.mode === next));
    if (next === 'ground') {
      sim.environment.elevation.setEnabled(true);
      groundScene = new THREE.Scene();
      groundCamera = new THREE.PerspectiveCamera(65, 1, 0.15, 800000);
      groundCamera.up.set(0, 0, 1);
      light = new THREE.DirectionalLight(0xfff3dc, 3);
      ambient = new THREE.HemisphereLight(0x8ab5e2, 0x2a251e, 0.7);
      groundScene.add(light, ambient);
      groundEarth = createSharedWorldEarth({
        environment: sim.environment,
        renderer,
        id: 'world-ground-earth',
      });
      surface = createGroundSurface({ environment: sim.environment, scene: groundScene });
      sky = createGroundSky({ environment: sim.environment, renderer });
      input = createGroundWorldInput({
        canvas,
        state,
        sampleHeight: (lat, lon) => surface.heightAt(lat, lon),
        getFov: () => settings.fov,
        enabled: () => mode === 'ground',
      });
      syncSite();
    } else if (next === 'stellar') {
      stellar = createInterstellarWorld({
        renderer,
        host: stage,
        environment: sim.environment,
        getTime: () => sim.time,
        onSolar: () => open('solar'),
        onGround: () => open('ground'),
        initialPose: departure
          ? { ...departure, position: departure.position.map((v) => v * AU_LY) }
          : stellarPose,
      });
    } else
      solar = createSolarWorld({
        renderer,
        host: stage,
        getTime: () => sim.time,
        getSite: () => state.site,
        onGround: () => open('ground'),
        initialTarget: options.target,
        onObserve: (body) => {
          close();
          sim.planetaryObservatory?.open(body);
        },
        getEarthTexture: () => sim.environment.uniforms.dayMap.value,
        getMoonTexture: () => sim.environment.moon.texture,
        assets: sim.environment.assets,
        environment: sim.environment,
      });
    if (next === 'solar' && solarArrival)
      solar.restoreNavigationPose({
        ...solarArrival,
        position: solarArrival.position.map((v) => v / AU_LY),
      });
    if (next === 'solar' && options.system) solar.setView(`system:${options.system}`);
    timeDraft = false;
    $('[data-time]').value = dateTimeText(sim.time, '24');
    canvas.focus();
  }
  function close() {
    if (!mode) return;
    request?.abort();
    request = null;
    persist();
    destroyView();
    mode = null;
    host.hidden = true;
    originalParent.prepend(canvas);
    controls.stopMotion?.();
    controls.enabled = previousControlsEnabled;
    sim.lastWall = performance.now();
    sim.dirty = true;
    sim.snap = true;
    sim.timeUI();
  }
  const tmp = new THREE.Vector3();
  function paintLabels(labels) {
    labelRoot.replaceChildren();
    let count = 0;
    for (const row of labels) {
      if (count >= 45) break;
      tmp.fromArray(row.direction);
      if (tmp.dot(new THREE.Vector3(0, 0, -1).applyQuaternion(groundCamera.quaternion)) <= 0)
        continue;
      const point = tmp
        .clone()
        .multiplyScalar(100000)
        .add(groundCamera.position)
        .project(groundCamera);
      if (Math.abs(point.x) > 0.95 || Math.abs(point.y) > 0.92) continue;
      if (!settings.seeThroughTerrain && groundEarth.terrainBlocksScreen(point.x, point.y))
        continue;
      const el = document.createElement('span');
      el.textContent = row.text;
      el.style.left = (point.x * 0.5 + 0.5) * stage.clientWidth + 'px';
      el.style.top = (-point.y * 0.5 + 0.5) * stage.clientHeight + (row.offsetY || 0) + 'px';
      labelRoot.append(el);
      count++;
    }
  }
  let lastLabels = 0;
  function tick(wall, dt) {
    if (!mode) return;
    sim.lastWall = wall;
    if (sim.mode === 'real') sim.time = Date.now();
    else if (!sim.paused) {
      const next = sim.time + Math.max(0, Math.min(0.25, dt)) * sim.speed * 1000;
      sim.time = clampTime(next);
      if (sim.time !== next) sim.paused = true;
    }
    const w = stage.clientWidth,
      h = stage.clientHeight;
    if (w < 1 || h < 1) return;
    renderer.getSize(renderSize);
    if (renderSize.x !== w || renderSize.y !== h) renderer.setSize(w, h, false);
    const auto = renderer.autoClear,
      exposure = renderer.toneMappingExposure;
    renderer.autoClear = false;
    renderer.toneMappingExposure = 1;
    try {
      if (mode === 'stellar') {
        stellar.resize(w, h);
        renderer.clear();
        stellar.update(sim.time, dt);
      } else if (mode === 'solar') {
        solar.resize(w, h);
        renderer.clear();
        solar.update(sim.time, dt);
      } else {
        if (heightFlight) {
          heightFlight.elapsed += Math.min(0.1, dt);
          const u = Math.min(1, heightFlight.elapsed / 3),
            ease = u * u * (3 - 2 * u);
          const floor = surface.heightAt(state.site.latitude, state.site.longitude) ?? 0;
          const target =
            heightFlight.target === 'ground' ? floor + 1.7 : Number(heightFlight.target);
          const offset = 12001;
          state.site.height =
            Math.exp(
              Math.log(heightFlight.from + offset) * (1 - ease) + Math.log(target + offset) * ease
            ) - offset;
          if (u === 1) heightFlight = null;
        }
        surface.update(state.site, sim.time);
        input.update(dt);
        surface.update(state.site, sim.time);
        Object.assign(settings, readWorldSkySettings(sim.environment));
        const status = sky.update(state.site, sim.time, state, settings, w, h);
        locationMap.update(state.site, state.azimuth, settings.fov);
        groundCamera.near = Math.max(0.1, Math.min(1000, state.site.height * 0.00001));
        groundCamera.far = Math.max(30000000, state.site.height + 20000000);
        groundCamera.position.set(0, 0, state.site.height);
        groundCamera.quaternion.copy(sky.camera.quaternion);
        groundCamera.aspect = w / h;
        groundCamera.fov = settings.fov;
        groundCamera.updateProjectionMatrix();
        groundCamera.updateMatrixWorld();
        light.position.fromArray(status.sunDirection).multiplyScalar(10000);
        light.intensity = Math.max(0, Math.min(3, status.sunAltitude / 5));
        ambient.intensity = 0.025 + Math.max(0, Math.min(0.7, (status.sunAltitude + 12) / 40));
        sky.render();
        const earthPose = groundRenderPose(state.site, sim.time, groundCamera.quaternion);
        groundEarth.update({
          time: sim.time,
          ...earthPose,
          fov: settings.fov,
          aspect: w / h,
          width: w,
          height: h,
          nearPatch: surface.getPatch(),
        });
        renderer.clearDepth();
        groundEarth.render({ seeThroughTerrain: settings.seeThroughTerrain });
        if (wall - lastLabels > 250) {
          paintLabels(status.labels);
          lastLabels = wall;
        }
        hud.textContent = `${state.site.name || t('地表')}  ·  ${state.site.latitude.toFixed(4)}°, ${state.site.longitude.toFixed(4)}°\n${t('海拔')} ${state.site.height.toFixed(1)} m  ·  ${state.speedMps.toFixed(1)} m/s  ·  ${t('方位')} ${state.azimuth.toFixed(1)}°  /  ${t('仰角')} ${state.elevation.toFixed(1)}°`;
        const s = surface.status();
        $('[data-surface-status]').textContent =
          (s.detailed
            ? t('局部高程已就绪')
            : s.pending
              ? t('正在加载局部高程')
              : t('全球高程底座')) + (s.lastError ? ' · ' + s.lastError : '');
        credit.textContent =
          'StarOrbit · ' +
          (settings.appearance === 'dss' ? 'DSS / CDS / STScI' : 'NASA/Goddard SVS · Gaia') +
          ' · ETOPO 2022 / Copernicus DEM';
      }
    } catch (error) {
      $('[data-message]').textContent = errorText(error.message);
      console.error('World view', error);
    } finally {
      renderer.autoClear = auto;
      renderer.toneMappingExposure = exposure;
    }
    if (wall - lastClock > 250) {
      if (mode === 'ground') {
        syncSite();
        syncSkyUI();
      }
      if (!timeDraft && document.activeElement !== $('[data-time]'))
        $('[data-time]').value = dateTimeText(sim.time, '24');
      $('[data-play]').textContent = t(sim.paused ? '播放' : '暂停');
      lastClock = wall;
    }
  }
  $('[data-photo]').onclick = () => {
    const photoMode = mode,
      photoTime = sim.time;
    if (!photoMode) return;
    try {
      const output = document.createElement('canvas');
      output.width = canvas.width;
      output.height = canvas.height;
      const c = output.getContext('2d');
      c.drawImage(canvas, 0, 0);
      // DOM labels use the same projected positions as the live scene. Include
      // their actual transformed bounds so exports retain both cultures' names.
      const bounds = stage.getBoundingClientRect(),
        sx = output.width / bounds.width,
        sy = output.height / bounds.height;
      c.save();
      c.scale(sx, sy);
      c.textBaseline = 'top';
      c.shadowColor = '#000';
      c.shadowBlur = 4;
      const selector =
        photoMode === 'ground'
          ? '.world-labels span'
          : photoMode === 'stellar'
            ? '.interstellar-labels span'
            : '.solar-world-labels span';
      for (const node of stage.querySelectorAll(selector)) {
        const rect = node.getBoundingClientRect(),
          style = getComputedStyle(node);
        if (
          node.hidden ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          rect.width === 0 ||
          rect.height === 0
        )
          continue;
        c.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        c.fillStyle = style.color;
        c.fillText(node.textContent, rect.left - bounds.left, rect.top - bounds.top);
      }
      c.restore();
      const sources = [
        photoMode === 'ground'
          ? credit.textContent
          : photoMode === 'stellar'
            ? 'StarOrbit · Hipparcos / van Leeuwen 2007 · J2000 · d3-celestial · Stellarium CC BY-SA 4.0 · NASA/Goddard SVS'
            : 'StarOrbit · Astronomy Engine',
      ];
      const skyId =
        photoMode === 'ground'
          ? 'ground-world'
          : photoMode === 'solar'
            ? 'solar-world-sky'
            : 'interstellar-world';
      const worldSettings = sim.environment.settings;
      const detailStatus = sim.environment.skyDetail.status(skyId + '-detail');
      for (const provider of detailStatus.sources || [])
        sources.push(`${provider.id} · ${provider.observed} · ${provider.credit}`);
      const cultural = skyCulturePhotoCredit(
        sim.environment.constellationArt?.status(skyId + '-art'),
        worldSettings,
        worldSettings.starChartEnabled,
        photoTime
      );
      if (cultural?.ready && cultural.caption) sources.push(cultural.caption);
      if (cultural?.referenceCaption) sources.push(cultural.referenceCaption);
      const earthId =
        photoMode === 'ground'
          ? 'world-ground-earth'
          : photoMode === 'solar'
            ? 'solar-world-earth'
            : 'interstellar-earth';
      for (const city of sim.environment.cityTerrain.status(earthId).sources || [])
        sources.push(
          [city.name?.zh || city.name || city.id, city.credit || city.attribution]
            .filter(Boolean)
            .join(' · ')
        );
      if (photoMode === 'ground' && surface.status().tiles) sources.push(ELEVATION_SOURCE.credit);
      const size = Math.max(11, Math.round(output.width / 150)),
        padding = Math.max(12, Math.round(output.width / 100)),
        lines = [];
      c.font = `${size}px system-ui`;
      for (const text of sources) {
        let line = '';
        for (const word of text.split(/\s+/)) {
          const next = line ? line + ' ' + word : word;
          if (line && c.measureText(next).width > output.width - padding * 2) {
            lines.push(line);
            line = word;
          } else line = next;
        }
        if (line) lines.push(line);
      }
      const footerHeight = padding * 2 + (size + 4) * lines.length + size * 2;
      const top = output.height - footerHeight;
      c.fillStyle = '#07111ddd';
      c.fillRect(0, top, output.width, footerHeight);
      c.textBaseline = 'top';
      c.fillStyle = '#f0e3c8';
      c.font = `${Math.round(size * 1.5)}px system-ui`;
      c.fillText(
        `StarOrbit · ${photoMode === 'ground' ? state.site.name || t('地表') : photoMode === 'stellar' ? stellar.caption : t('太阳系')} · ${dateTimeText(photoTime, '24')} UTC+8`,
        padding,
        top + padding,
        output.width - padding * 2
      );
      c.fillStyle = '#c5d2dc';
      c.font = `${size}px system-ui`;
      lines.forEach((line, i) =>
        c.fillText(line, padding, top + padding + size * 2 + i * (size + 4))
      );
      output.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a'),
          url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `StarOrbit-${photoMode}-${photoTime}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }, 'image/png');
    } catch (error) {
      $('[data-message]').textContent = errorText(error.message);
    }
  };
  return {
    get active() {
      return !!mode;
    },
    open,
    get ground() {
      return mode === 'ground'
        ? { state, surface, camera: groundCamera, earth: groundEarth, settings }
        : null;
    },
    get interstellar() {
      return stellar;
    },
    openGround(site, options = {}) {
      open('ground');
      locate(site);
      if (['Sun', 'Moon'].includes(options.body)) {
        const date = new Date(sim.time);
        const observer = new Observer(state.site.latitude, state.site.longitude, state.site.height);
        const eq = Equator(options.body, date, observer, true, true);
        const horizon = Horizon(date, observer, eq.ra, eq.dec, 'normal');
        state.azimuth = horizon.azimuth;
        state.elevation = Math.max(-89.5, Math.min(89.5, horizon.altitude));
      }
      if (Number.isFinite(options.fov)) {
        settings.fov = Math.max(0.006, Math.min(100, options.fov));
        $('[data-fov]').value = settings.fov;
      }
    },
    get site() {
      return { ...state.site };
    },
    close,
    tick,
    dispose() {
      close();
      disposed = true;
      request?.abort();
      offLanguage();
      skyControls.dispose();
      earthControls.dispose();
      locationMap.dispose();
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('keydown', cancelHeightFlight);
      canvas.removeEventListener('pointerdown', cancelHeightFlight);
      entries.remove();
      host.remove();
      style.remove();
    },
  };
}
