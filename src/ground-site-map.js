import { getLanguage, t } from './i18n.js';
import {
  anchoredSitePickerFrame,
  clamp,
  locationAtPixel,
  sitePickerFrame,
} from './ground-site-map-projection.js';

const css = `
.ground-site-map{box-sizing:border-box;position:fixed;inset:0;margin:auto;padding:0;width:min(1140px,calc(100vw - 40px));height:min(760px,calc(100dvh - 46px));max-width:none;max-height:none;overflow:hidden;border:1px solid #557085;border-radius:14px;background:#0c1a28;color:#e9f0f5;box-shadow:0 16px 70px #0009;font:14px/1.4 system-ui;color-scheme:dark}
.ground-site-map:not([open]){display:none}.ground-site-map[open]{display:grid;grid-template-rows:auto minmax(0,1fr) auto}.ground-site-map::backdrop{background:#020912b8}
.ground-site-map *{box-sizing:border-box}.ground-site-map .gsm-heading,.ground-site-map .gsm-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 16px}.ground-site-map .gsm-heading{border-bottom:1px solid #334859}.ground-site-map h2{margin:0;color:#ebd9b5;font:600 18px/1.25 system-ui}.ground-site-map button,.ground-site-map input{font:inherit;color:#e1edf5;border:1px solid #405c70;background:#172c3d;border-radius:6px;padding:7px 10px}.ground-site-map button{cursor:pointer}.ground-site-map button:hover{background:#29495e}.ground-site-map button:focus-visible,.ground-site-map input:focus-visible,.ground-site-map canvas:focus-visible{outline:2px solid #88dae8;outline-offset:-2px}.ground-site-map .gsm-close{font-size:22px;line-height:1;width:32px;height:32px;padding:0;background:transparent}
.ground-site-map .gsm-body{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(210px,26%)}.ground-site-map .gsm-viewport{position:relative;min-width:0;min-height:0;background:#142937;isolation:isolate;overflow:hidden}.ground-site-map .gsm-viewport canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}.ground-site-map .gsm-viewport canvas.is-panning{cursor:grabbing}.ground-site-map .gsm-tools{position:absolute;left:12px;top:12px;display:flex;gap:4px}.ground-site-map .gsm-tools button{width:34px;height:34px;padding:0;line-height:1;font-size:19px;background:#0d2030e8;box-shadow:0 1px 5px #03101980}.ground-site-map .gsm-cursor{position:absolute;right:8px;bottom:7px;background:#0a192dd9;color:#d4e8ed;font:11px/1.4 system-ui;font-variant-numeric:tabular-nums;padding:3px 6px;border-radius:3px;pointer-events:none}.ground-site-map .gsm-cursor span{color:#a5c0d1}
.ground-site-map .gsm-panel{border-left:1px solid #334859;min-width:0;overflow:auto;padding:14px;background:#122231;display:flex;flex-direction:column;gap:14px}.ground-site-map .gsm-panel form{margin:0}.ground-site-map .gsm-panel label{display:block;font-size:12px;color:#b8cddd;margin:0}.ground-site-map .gsm-search-row{display:flex;gap:5px;margin-top:4px}.ground-site-map .gsm-search-row input{min-width:0;flex:1}.ground-site-map .gsm-pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}.ground-site-map .gsm-pair input{width:100%;margin-top:4px;min-width:0}.ground-site-map .gsm-coord-button{width:100%;margin:6px 0 0}.ground-site-map .gsm-results{display:grid;gap:4px;max-height:clamp(80px,24vh,205px);overflow:auto}.ground-site-map .gsm-results:empty,.ground-site-map .gsm-status:empty{display:none}.ground-site-map .gsm-results button{text-align:left;font-size:12px;overflow-wrap:anywhere}.ground-site-map .gsm-results small{display:block;color:#a8bdcb;font-variant-numeric:tabular-nums}.ground-site-map .gsm-hint,.ground-site-map .gsm-credit,.ground-site-map .gsm-status{font-size:12px;color:#a6bdcb;line-height:1.5;margin:0}.ground-site-map .gsm-credit{font-size:10px;margin-top:auto}.ground-site-map .gsm-status{color:#f0d5a3}
.ground-site-map .gsm-actions{border-top:1px solid #334859;background:#102030}.ground-site-map .gsm-choice{min-width:0;flex:1;display:grid;gap:1px}.ground-site-map .gsm-choice span{color:#eed6a3;font-size:11px}.ground-site-map .gsm-choice output{font-size:13px;font-variant-numeric:tabular-nums;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.ground-site-map .gsm-actions [data-picker-confirm]{font-weight:600;background:#99dce4;color:#0d2531;border-color:#99dce4}
@media(max-width:690px) and (min-height:501px){.ground-site-map{width:calc(100vw - 12px);height:calc(100dvh - 14px);border-radius:9px}.ground-site-map .gsm-body{grid-template-columns:1fr;grid-template-rows:minmax(130px,1fr) auto}.ground-site-map .gsm-panel{max-height:min(36dvh,240px);display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start;gap:8px 12px;padding:8px 10px;border-left:0;border-top:1px solid #334859}.ground-site-map .gsm-query{grid-column:1;grid-row:1}.ground-site-map .gsm-coords{grid-column:2;grid-row:1 / span 2}.ground-site-map .gsm-results,.ground-site-map .gsm-status{grid-column:1}.ground-site-map .gsm-hint,.ground-site-map .gsm-credit{grid-column:1 / -1}.ground-site-map .gsm-results{max-height:90px}.ground-site-map .gsm-heading,.ground-site-map .gsm-actions{gap:7px;padding:7px 9px}.ground-site-map .gsm-actions button,.ground-site-map .gsm-panel button,.ground-site-map input{padding:6px;font-size:12px}.ground-site-map .gsm-pair{gap:3px}}
@media(max-height:500px){.ground-site-map{width:calc(100vw - 8px);height:calc(100dvh - 8px);border-radius:6px}.ground-site-map .gsm-heading,.ground-site-map .gsm-actions{padding:5px 9px}.ground-site-map .gsm-panel{padding:8px;gap:8px}.ground-site-map .gsm-body{grid-template-columns:minmax(0,1fr) minmax(155px,30%)}}
`;

const markup = `<style>${css}</style>
<div class="gsm-heading"><h2 data-label="精准地图选点"></h2><button class="gsm-close" type="button" data-picker-close>×</button></div>
<div class="gsm-body"><div class="gsm-viewport"><canvas data-picker-canvas tabindex="0"></canvas>
<div class="gsm-tools"><button type="button" data-picker-in>+</button><button type="button" data-picker-out>−</button><button type="button" data-picker-recenter>⌖</button></div>
<div class="gsm-cursor"><span data-picker-cursor-label></span> <output data-picker-cursor aria-live="off"></output></div></div>
<div class="gsm-panel"><form class="gsm-query"><label data-label="城市或地理名称" for="ground-site-map-search"></label><div class="gsm-search-row"><input id="ground-site-map-search" type="search" autocomplete="off" data-picker-search><button type="submit" data-label="搜索"></button></div></form>
<div class="gsm-results" data-picker-results></div><p class="gsm-status" role="status" data-picker-status></p>
<form class="gsm-coords" novalidate><div class="gsm-pair"><label><span data-label="纬度 °"></span><input data-picker-lat type="number" min="-90" max="90" step="any" inputmode="decimal"></label><label><span data-label="经度 °"></span><input data-picker-lon type="number" min="-180" max="180" step="any" inputmode="decimal"></label></div><button type="submit" class="gsm-coord-button" data-label="使用此坐标"></button></form>
<p class="gsm-hint" data-label="点击选点，拖动平移，滚轮或双指缩放。"></p><p class="gsm-credit" data-label="地名：Natural Earth / 天地图；在线搜索：Photon · © OpenStreetMap contributors。"></p></div></div>
<div class="gsm-actions"><div class="gsm-choice"><span data-label="候选地点"></span><output data-picker-candidate></output></div><button type="button" data-picker-cancel data-label="取消"></button><button type="button" data-picker-confirm data-label="确认地点"></button></div>`;

const valid = (p) =>
  p &&
  Number.isFinite(p.latitude) &&
  Math.abs(p.latitude) <= 90 &&
  Number.isFinite(p.longitude) &&
  Math.abs(p.longitude) <= 180;
const coordText = (p) => p.latitude.toFixed(5) + '°, ' + p.longitude.toFixed(5) + '°';

export function createGroundSitePicker({ host, draw, imagery, search, onPick, onPickerChange }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'ground-site-map';
  dialog.innerHTML = markup;
  host.append(dialog);
  const $ = (selector) => dialog.querySelector(selector);
  const item = (key) => $('[data-picker-' + key + ']');
  const canvas = item('canvas'),
    lat = item('lat'),
    lon = item('lon'),
    query = item('search');
  const pointers = new Map();
  let frame,
    start,
    candidate,
    pick,
    previousFocus,
    cursor = null,
    raf = 0,
    timer = 0,
    observer,
    refreshTimer;
  let open = false,
    dirty = false,
    composing = false,
    request = null,
    statusKey = '';
  let choiceKey = '',
    rows = [],
    moved = false,
    origin = null;

  function frameAtSize() {
    const { width, height } = canvas.getBoundingClientRect();
    return sitePickerFrame(frame, frame.verticalKmPerPixel, width || 1, height || 1);
  }
  function renderCursor() {
    const geo = cursor && locationAtPixel(frame, cursor);
    item('cursor-label').textContent = t(geo ? '光标坐标' : '地图中心');
    item('cursor').textContent = geo && !valid(geo) ? '—' : coordText(geo || frame);
  }
  function renderChoice() {
    const name = choiceKey ? t(choiceKey) : candidate.name;
    item('candidate').textContent = [name, coordText(candidate)].filter(Boolean).join(' · ');
    item('candidate').title = item('candidate').textContent;
  }
  function repaint() {
    if (!open || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!open) return;
      frame = frameAtSize();
      draw(canvas, frame, { candidate, observer: start });
      renderCursor();
    });
  }
  function replan() {
    if (!open) return;
    repaint();
    clearTimeout(timer);
    imagery.pause();
    timer = setTimeout(() => {
      if (open) imagery.update(frameAtSize(), Math.min(2, window.devicePixelRatio || 1));
    }, 140);
  }
  function status(key = '') {
    statusKey = key;
    item('status').textContent = key ? t(key) : '';
  }
  function setCandidate(site, { center = false, key = '' } = {}) {
    if (!valid(site)) return;
    choiceKey = key;
    candidate = {
      name: site.name || '',
      latitude: site.latitude,
      longitude: site.longitude,
      height: Number.isFinite(site.height) ? site.height : 0,
    };
    lat.value = String(Number(candidate.latitude.toFixed(8)));
    lon.value = String(Number(candidate.longitude.toFixed(8)));
    dirty = false;
    status();
    renderChoice();
    if (center) {
      const scale = Math.min(frame.verticalKmPerPixel, 60 / frame.width);
      frame = sitePickerFrame(candidate, scale, frame.width, frame.height);
      cursor = null;
      replan();
    } else repaint();
  }
  function renderRows() {
    const list = item('results');
    list.replaceChildren();
    for (const site of rows) {
      const button = document.createElement('button'),
        coords = document.createElement('small');
      button.type = 'button';
      button.textContent = site.name || t('自定义地点');
      coords.textContent = coordText(site);
      button.append(coords);
      button.onclick = () => {
        cancelSearch();
        rows = [];
        renderRows();
        setCandidate(site, { center: true });
      };
      list.append(button);
    }
  }
  function cancelSearch() {
    request?.abort();
    request = null;
  }
  async function lookup(online) {
    cancelSearch();
    const q = query.value.trim();
    if (!q || !search) {
      rows = [];
      renderRows();
      status();
      return;
    }
    const controller = new AbortController(),
      language = getLanguage();
    request = controller;
    const current = () => open && request === controller && !controller.signal.aborted;
    const run = (remote) => search(q, { online: remote, signal: controller.signal, language });
    const setRows = (result) => {
      rows = (result || []).filter(valid).slice(0, 14);
      renderRows();
    };
    if (online) status('正在搜索地点…');
    try {
      const results = await run(online);
      if (!current()) return;
      setRows(results);
      status(online && !rows.length ? '未找到匹配地点' : '');
    } catch {
      if (!current()) return;
      if (online) {
        try {
          const builtIn = await run(false);
          if (!current()) return;
          setRows(builtIn);
        } catch {
          if (!current()) return;
        }
      }
      status(online ? '在线地名暂不可用，仍可使用内置地名和坐标' : '未找到匹配地点');
    }
  }
  function chooseCoordinates() {
    const site = { latitude: lat.valueAsNumber, longitude: lon.valueAsNumber };
    if (!valid(site)) {
      status('坐标无效');
      (Number.isFinite(site.latitude) && Math.abs(site.latitude) <= 90 ? lon : lat).focus();
      return false;
    }
    setCandidate(site, { center: true, key: '自定义地点' });
    return true;
  }
  function confirm() {
    if (!open || (dirty && !chooseCoordinates())) return;
    const site = { ...candidate, name: choiceKey ? t(choiceKey) : candidate.name };
    const commit = pick;
    close();
    commit?.(site);
  }
  function close() {
    if (!open) return;
    open = false;
    cancelSearch();
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    raf = 0;
    observer?.disconnect();
    clearInterval(refreshTimer);
    for (const id of pointers.keys())
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    pointers.clear();
    canvas.classList.remove('is-panning');
    imagery.close();
    pick = null;
    dialog.close();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    onPickerChange?.(false);
  }
  function translate() {
    dialog.setAttribute('aria-label', t('精准地图选点'));
    for (const node of dialog.querySelectorAll('[data-label]'))
      node.textContent = t(node.dataset.label);
    for (const [key, label] of [
      ['close', '取消'],
      ['in', '放大地图'],
      ['out', '缩小地图'],
      ['recenter', '重新居中'],
      ['canvas', '点击世界地图选择地点'],
    ]) {
      const node = item(key);
      node.title = t(label);
      node.setAttribute('aria-label', node.title);
    }
    if (!open) return;
    status(statusKey);
    renderChoice();
    renderCursor();
    if (query.value.trim()) lookup(false);
    repaint();
  }

  item('close').onclick = item('cancel').onclick = close;
  item('confirm').onclick = confirm;
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('keydown', (event) => {
    // Keep worldwide shortcuts and other open tools from consuming this dialog's keys.
    event.stopPropagation();
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      close();
    }
  });
  $('.gsm-query').onsubmit = (event) => {
    event.preventDefault();
    if (!composing) lookup(true);
  };
  query.oncompositionstart = () => {
    composing = true;
  };
  query.oncompositionend = () => {
    composing = false;
    lookup(false);
  };
  query.oninput = () => {
    if (!composing) lookup(false);
  };
  lat.oninput = lon.oninput = () => {
    dirty = true;
  };
  $('.gsm-coords').onsubmit = (event) => {
    event.preventDefault();
    chooseCoordinates();
  };
  item('recenter').onclick = () => {
    frame = sitePickerFrame(candidate, frame.verticalKmPerPixel, frame.width, frame.height);
    cursor = null;
    replan();
  };

  function point(event) {
    const r = canvas.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }
  function middle() {
    const [a, b] = pointers.values();
    return b
      ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) }
      : a;
  }
  function transform(from, to, zoom = 1) {
    const anchor = locationAtPixel(frame, from);
    frame = anchoredSitePickerFrame(frame, anchor, to, frame.verticalKmPerPixel * zoom);
    replan();
  }
  function zoomBy(zoom) {
    const center = { x: frame.width / 2, y: frame.height / 2 };
    transform(center, center, zoom);
  }
  item('in').onclick = () => zoomBy(1 / 1.65);
  item('out').onclick = () => zoomBy(1.65);
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const wheel = point(event);
      // Chrome rounds wheel coordinates to whole pixels but pointer movement
      // retains fractions. Keep the last pointer sample when it matches.
      const at = cursor && Math.hypot(cursor.x - wheel.x, cursor.y - wheel.y) < 1 ? cursor : wheel;
      const pixels =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame.height : 1);
      cursor = at;
      transform(at, at, Math.exp(clamp(pixels * (event.ctrlKey ? 0.011 : 0.002), -1.5, 1.5)));
    },
    { passive: false }
  );
  canvas.onpointerdown = (event) => {
    if (event.button !== 0 || pointers.size >= 2) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const at = point(event);
    pointers.set(event.pointerId, at);
    canvas.setPointerCapture(event.pointerId);
    if (pointers.size === 1) {
      origin = at;
      moved = false;
    } else moved = true;
  };
  canvas.onpointermove = (event) => {
    const at = point(event);
    cursor = at;
    if (!pointers.has(event.pointerId)) {
      renderCursor();
      return;
    }
    const before = middle();
    pointers.set(event.pointerId, at);
    const after = middle();
    if (!moved && Math.hypot(at.x - origin.x, at.y - origin.y) < 5) {
      renderCursor();
      return;
    }
    const from = moved ? before : origin;
    moved = true;
    canvas.classList.add('is-panning');
    transform(
      from,
      after,
      before.distance && after.distance ? before.distance / after.distance : 1
    );
  };
  function release(event, cancelled) {
    if (!pointers.has(event.pointerId)) return;
    if (!cancelled && !moved && pointers.size === 1) {
      const at = point(event);
      if (Math.hypot(at.x - origin.x, at.y - origin.y) < 5) {
        const site = locationAtPixel(frame, at);
        if (valid(site)) setCandidate(site, { key: '地图选点' });
      }
    }
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!pointers.size) canvas.classList.remove('is-panning');
    if (event.pointerType === 'touch') {
      cursor = null;
      renderCursor();
    }
  }
  canvas.onpointerup = (event) => release(event, false);
  canvas.onpointercancel = canvas.onlostpointercapture = (event) => release(event, true);
  canvas.onpointerleave = () => {
    if (!pointers.size) {
      cursor = null;
      renderCursor();
    }
  };
  canvas.onkeydown = (event) => {
    const center = { x: frame.width / 2, y: frame.height / 2 };
    const arrows = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [1, 0], ArrowRight: [-1, 0] };
    if (arrows[event.key]) {
      event.preventDefault();
      const [x, y] = arrows[event.key];
      transform(center, {
        x: center.x + (x * frame.width) / 5,
        y: center.y + (y * frame.height) / 5,
      });
    } else if (['-', '+', '='].includes(event.key)) {
      event.preventDefault();
      zoomBy(event.key === '-' ? 1.65 : 1 / 1.65);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setCandidate(locationAtPixel(frame, center), { key: '地图选点' });
    }
  };

  return {
    get open() {
      return open;
    },
    show(site, options) {
      if (!valid(site)) return false;
      if (open) close();
      previousFocus = document.activeElement;
      start = { ...site };
      pick = options?.onPick || onPick;
      cursor = null;
      composing = false;
      query.value = '';
      rows = [];
      renderRows();
      translate();
      dialog.showModal();
      open = true;
      onPickerChange?.(true);
      const w = canvas.clientWidth || 600,
        h = canvas.clientHeight || 400;
      frame = sitePickerFrame(site, 80 / w, w, h);
      setCandidate(site);
      canvas.focus({ preventScroll: true });
      observer ??= new ResizeObserver(replan);
      observer.observe(canvas);
      imagery.sourceChanged();
      // Pick up the main view's newly resident tiles and restored offline city
      // metadata even when the user leaves the pointer still.
      refreshTimer = setInterval(() => {
        if (!pointers.size && imagery.sourceChanged()) replan();
      }, 900);
      replan();
      return true;
    },
    close,
    repaint,
    translate,
    dispose() {
      close();
      dialog.remove();
    },
  };
}
