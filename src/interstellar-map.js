import { t, onLanguageChange } from './i18n.js';
import { formatStellarDistance } from './interstellar-math.js';
import {
  galacticVector,
  mapProjection,
  clampMapRadius,
  fittedMapRadius,
  nearestMapHit,
  mapHitCandidates,
  createMapTrail,
} from './interstellar-map-math.js';

const STORE = 'starorbit-interstellar-map-v1';
const css = `
.interstellar-map{padding:0;margin:0;box-sizing:border-box;position:absolute;right:18px;bottom:28px;width:320px;max-width:calc(100% - 24px);max-height:calc(100% - 42px);z-index:6;background:linear-gradient(145deg,#0b2034f2,#050d19f5);border:1px solid #75b9d655;border-radius:16px;box-shadow:0 12px 44px #0007;color:#d7e8f0;font:12px/1.5 system-ui;overflow:auto;isolation:isolate}
.interstellar-map .map-header{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid #79bdda22}.interstellar-map .map-header strong{flex:1;letter-spacing:.07em;color:#efd8aa}.interstellar-map button,.interstellar-map select{font:inherit;color:#cee3ed;background:#173044;border:1px solid #7cacc63b;border-radius:6px;cursor:pointer;padding:5px 7px;min-height:30px}.interstellar-map button[aria-pressed=true]{background:#28617b;border-color:#87dcf4;color:white}.interstellar-map button:focus-visible,.interstellar-map select:focus-visible,.interstellar-map canvas:focus-visible{outline:2px solid #8ae3ff;outline-offset:-2px}.interstellar-map button:hover{background:#28516a}.interstellar-map .map-controls{display:flex;gap:5px;flex-wrap:wrap;padding:9px 12px 0}.interstellar-map select{min-width:0;flex:1}.interstellar-map canvas{width:100%;aspect-ratio:1;display:block;touch-action:none;cursor:grab}.interstellar-map canvas:active{cursor:grabbing}.interstellar-map .map-readout{padding:0 13px 10px;font-variant-numeric:tabular-nums}.interstellar-map [data-picks]{padding:8px 0;display:flex;gap:4px;flex-wrap:wrap;border-top:1px solid #79bdda44}.interstellar-map [data-picks] strong{width:100%;color:#a9cbdc}.interstellar-map .map-target{display:block;color:#f1d9a4;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.interstellar-map .map-sub{color:#94b3c8;font-size:11px}.interstellar-map .map-actions{display:flex;gap:5px;margin-top:7px}.interstellar-map .map-options{padding:0 12px 10px;color:#9eb8ca}.interstellar-map .map-options summary{cursor:pointer}.interstellar-map .map-options label{display:block;margin:5px 0}.interstellar-map .map-options p{margin:6px 0}.interstellar-map.expanded{width:min(640px,calc(100% - 36px));max-height:calc(100% - 42px);overflow:auto}.interstellar-map.expanded canvas{max-height:calc(100vh - 355px);min-height:180px;aspect-ratio:auto;height:min(510px,50vh)}.interstellar-map.collapsed{width:auto}.interstellar-map.collapsed .map-body{display:none}.interstellar-map.collapsed .map-header{border:0}.interstellar-map [hidden]{display:none!important}@media(max-width:700px){.interstellar-map{width:232px;right:8px;bottom:84px;max-height:calc(100% - 100px);font-size:11px}.interstellar-map .map-header{padding:7px 9px}.interstellar-map .map-controls{padding:7px 8px 0}.interstellar-map button,.interstellar-map select{padding:4px;min-height:30px}.interstellar-map.expanded{width:calc(100% - 16px);max-height:calc(100% - 110px)}.interstellar-map .map-readout{padding:0 9px 8px}}
.interstellar-map.simple{width:230px}.interstellar-map.simple .map-header{padding:7px 9px}.interstellar-map.simple .map-header strong{letter-spacing:0}.interstellar-map.simple [data-expand],.interstellar-map.simple [data-center],.interstellar-map.simple [data-fit],.interstellar-map.simple [data-side],.interstellar-map.simple .map-options,.interstellar-map.simple .map-scale,.interstellar-map.simple .map-height,.interstellar-map.simple [data-look],.interstellar-map.simple [data-go]{display:none}.interstellar-map.simple .map-body{display:flex;flex-wrap:wrap}.interstellar-map.simple .map-controls{padding:7px 0 0 8px;gap:4px}.interstellar-map.simple .map-readout{width:100%;padding:0 9px 8px}.interstellar-map.simple .map-actions{justify-content:flex-end;margin-top:4px}.interstellar-map.simple .map-distance{font-size:11px}.interstellar-map.simple.collapsed .map-body{display:none}
`;

export function createInterstellarMap({
  host,
  catalog,
  getState,
  name,
  onSelect,
  onLook,
  onTravel,
  onStop,
}) {
  const root = document.createElement('section');
  root.className = 'interstellar-map';
  root.setAttribute('aria-label', t('星际导航图'));
  root.innerHTML = `<style>${css}</style><div class="map-header"><strong data-text="星际导航图"></strong><button data-layout></button><button data-expand></button><button data-collapse></button></div><div class="map-body"><div class="map-controls"><button data-mode="2d">2D</button><button data-mode="3d">3D</button><select data-center aria-label="地图中心"><option value="self" data-text="跟随自己"></option><option value="sun" data-text="以太阳为中心"></option><option value="target" data-text="查看目标"></option></select><button data-reset data-text="复位"></button></div><div class="map-controls"><button data-zoom-in aria-label="放大地图">＋</button><button data-zoom-out aria-label="缩小地图">−</button><button data-fit data-text="适合范围"></button><button data-side data-text="侧视"></button></div><canvas tabindex="0" aria-label="星际地图：点击选择，拖动旋转，滚轮缩放"></canvas><div class="map-readout"><div data-picks hidden></div><span class="map-target"></span><div class="map-distance"></div><div class="map-sub map-scale"></div><div class="map-sub map-height"></div><div class="map-sub map-reference"></div><div class="map-actions"><button data-look data-text="看向目标"></button><button data-go data-text="前往恒星"></button><button data-stop data-text="停止"></button></div></div><details class="map-options"><summary data-text="地图显示"></summary><label><input type="checkbox" data-auto><span data-text="自动范围"></span></label><label><input type="checkbox" data-trail checked><span data-text="航迹"></span></label><label><input type="checkbox" data-lines><span data-text="所选星图连线"></span></label><label><input type="checkbox" data-names checked><span data-text="恒星名称"></span></label><button data-clear data-text="清除航迹"></button><p data-text="金色：太阳与目标 · 青色：自己与视线 · 紫色：移动方向"></p><p data-text="参考轴：银心方向、银经90°、银北；以地图中心为原点。恒星使用J2000目录位置。"></p><p data-text="点击只选中；拖动旋转三维图，滚轮调整范围，空格停止航行。"></p></details></div>`;
  host.append(root);
  const $ = (s) => root.querySelector(s),
    canvas = $('canvas'),
    ctx = canvas.getContext('2d');
  const format = (v) => formatStellarDistance(Math.abs(v), t);
  let mode = '3d',
    centerMode = 'self',
    radius = 20,
    yaw = -0.55,
    pitch = 0.55,
    side = false;
  let simple = true,
    expanded = false,
    collapsed = false,
    auto = false,
    elapsed = 1,
    disposed = false,
    drag = null;
  let bookmarkPreview = null,
    lastSelected = null;
  let lastSignature = '',
    renderCount = 0;
  let hits = [],
    drawn = 0,
    lastRenderMs = 0,
    center = [0, 0, 0],
    actualRadius = radius;
  const trail = createMapTrail(),
    listeners = [];
  const listen = (el, type, fn, options) => {
    el.addEventListener(type, fn, options);
    listeners.push(() => el.removeEventListener(type, fn, options));
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (saved) {
      mode = saved.mode === '2d' ? '2d' : '3d';
      centerMode = ['self', 'sun', 'target'].includes(saved.center) ? saved.center : 'self';
      radius = clampMapRadius(saved.radius);
      collapsed = saved.collapsed === true;
      simple = saved.simple !== false;
      auto = saved.auto === true;
    }
  } catch {}
  function persist() {
    try {
      localStorage.setItem(
        STORE,
        JSON.stringify({ mode, center: centerMode, radius, collapsed, auto, simple })
      );
    } catch {}
  }
  function refresh() {
    $('[data-picks]').hidden = true;
    root.classList.toggle('simple', simple);
    root.classList.toggle('expanded', expanded && !simple);
    $('[data-layout]').textContent = t(simple ? '完整版' : '简易版');
    $('[data-layout]').setAttribute('aria-label', t(simple ? '切换到完整版' : '切换到简易版'));
    root.classList.toggle('collapsed', collapsed);
    root.querySelectorAll('[data-text]').forEach((el) => {
      el.textContent = t(el.dataset.text);
    });
    root.setAttribute('aria-label', t('星际导航图'));
    for (const key of [
      '地图中心',
      '放大地图',
      '缩小地图',
      '星际地图：点击选择，拖动旋转，滚轮缩放',
    ]) {
      const selector = {
        '地图中心': '[data-center]',
        '放大地图': '[data-zoom-in]',
        '缩小地图': '[data-zoom-out]',
        '星际地图：点击选择，拖动旋转，滚轮缩放': 'canvas',
      }[key];
      $(selector).setAttribute('aria-label', t(key));
    }
    $('[data-expand]').textContent = t(expanded ? '缩小' : '展开');
    $('[data-collapse]').textContent = t(collapsed ? '显示' : '收起');
    $('[data-collapse]').setAttribute('aria-expanded', String(!collapsed));
    $('[data-expand]').setAttribute('aria-expanded', String(expanded));
    root
      .querySelectorAll('[data-mode]')
      .forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.mode === mode)));
    $('[data-side]').hidden = mode !== '2d';
    $('[data-side]').setAttribute('aria-pressed', String(side));
    $('[data-center]').value = centerMode;
    $('[data-auto]').checked = auto;
    elapsed = 1;
  }
  const offLanguage = onLanguageChange(refresh);
  const change = () => {
    refresh();
    persist();
  };
  root.querySelectorAll('[data-mode]').forEach((el) => {
    el.onclick = () => {
      mode = el.dataset.mode;
      change();
    };
  });
  $('[data-center]').onchange = (e) => {
    centerMode = e.target.value;
    change();
  };
  $('[data-layout]').onclick = () => {
    simple = !simple;
    change();
  };
  $('[data-expand]').onclick = () => {
    expanded = !expanded;
    collapsed = false;
    change();
  };
  $('[data-collapse]').onclick = () => {
    collapsed = !collapsed;
    change();
  };
  $('[data-side]').onclick = () => {
    side = !side;
    change();
  };
  $('[data-reset]').onclick = () => {
    yaw = -0.55;
    pitch = 0.55;
    side = false;
    centerMode = 'self';
    change();
  };
  function starPosition(i) {
    return Array.from(catalog.positions.subarray(i * 3, i * 3 + 3));
  }
  function fit() {
    const s = getState(),
      c = getCenter(s);
    radius = fittedMapRadius(c, [s.position, targetPosition(s)]);
    change();
  }
  function zoom(factor) {
    radius = clampMapRadius(actualRadius * factor);
    auto = false;
    change();
  }
  $('[data-zoom-in]').onclick = () => zoom(1 / 1.5);
  $('[data-zoom-out]').onclick = () => zoom(1.5);
  $('[data-fit]').onclick = fit;
  $('[data-auto]').onchange = (e) => {
    auto = e.target.checked;
    change();
  };
  $('[data-look]').onclick = () => onLook(previewBookmark(getState()) || null);
  $('[data-go]').onclick = () => onTravel(previewBookmark(getState()) || null);
  $('[data-stop]').onclick = onStop;
  $('[data-clear]').onclick = () => {
    trail.reset();
    elapsed = 1;
  };
  for (const key of ['trail', 'lines', 'names'])
    $(`[data-${key}]`).onchange = () => {
      elapsed = 1;
    };
  // Keep map gestures in this panel; the flight canvas must never receive them.
  listen(root, 'keydown', (e) => {
    if (e.code === 'Space' && !['INPUT', 'SELECT'].includes(e.target.tagName)) {
      e.preventDefault();
      onStop();
    }
    e.stopPropagation();
  });
  listen(canvas, 'keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Equal', 'Minus'].includes(e.code)) {
      e.preventDefault();
      if (e.code === 'Equal') zoom(1 / 1.5);
      else if (e.code === 'Minus') zoom(1.5);
      else {
        yaw += e.code === 'ArrowLeft' ? -0.12 : e.code === 'ArrowRight' ? 0.12 : 0;
        pitch = Math.max(
          -1.5,
          Math.min(1.5, pitch + (e.code === 'ArrowUp' ? 0.12 : e.code === 'ArrowDown' ? -0.12 : 0))
        );
        elapsed = 1;
      }
    }
  });
  listen(
    canvas,
    'wheel',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoom(Math.exp(Math.max(-1, Math.min(1, e.deltaY * 0.002))));
    },
    { passive: false }
  );
  listen(canvas, 'pointerdown', (e) => {
    if (e.button !== 0 || e.isPrimary === false) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw, pitch, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  listen(canvas, 'pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (mode === '3d' && drag.moved) {
      yaw = drag.yaw + dx * 0.008;
      pitch = Math.max(-1.5, Math.min(1.5, drag.pitch + dy * 0.008));
      elapsed = 1;
    }
  });
  listen(canvas, 'pointerup', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const click = !drag.moved;
    drag = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (click) {
      const r = canvas.getBoundingClientRect(),
        x = e.clientX - r.left,
        y = e.clientY - r.top;
      const choices = mapHitCandidates(hits, x, y),
        picker = $('[data-picks]');
      const select = (hit) => {
        if (hit?.kind === 'star') {
          bookmarkPreview = null;
          onSelect(hit.index);
        }
        if (hit?.kind === 'bookmark') bookmarkPreview = hit.index;
        picker.hidden = true;
        elapsed = 1;
      };
      picker.replaceChildren();
      if (choices.length > 1) {
        const title = document.createElement('strong');
        title.textContent = t('选择重叠目标');
        picker.append(title);
        for (const hit of choices) {
          const button = document.createElement('button');
          button.textContent =
            hit.kind === 'bookmark'
              ? '◆ ' + getState().bookmarks[hit.index].name
              : '★ ' + name(hit.index);
          button.onclick = () => select(hit);
          picker.append(button);
        }
        const close = document.createElement('button');
        close.textContent = '×';
        close.setAttribute('aria-label', t('关闭'));
        close.onclick = () => {
          picker.hidden = true;
        };
        picker.append(close);
        picker.hidden = false;
      } else select(choices[0] || nearestMapHit(hits, x, y));
    }
  });
  for (const event of ['pointercancel', 'lostpointercapture'])
    listen(canvas, event, () => {
      drag = null;
    });
  function previewBookmark(s) {
    return s.selected === lastSelected ? s.bookmarks[bookmarkPreview] : undefined;
  }
  function targetPosition(s) {
    return previewBookmark(s)?.position || starPosition(s.selected);
  }
  function getCenter(s) {
    return centerMode === 'sun'
      ? [0, 0, 0]
      : centerMode === 'target'
        ? targetPosition(s)
        : [...s.position];
  }
  function draw(s) {
    const started = performance.now(),
      box = canvas.getBoundingClientRect();
    if (box.width < 1 || box.height < 1 || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1),
      w = box.width,
      h = box.height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (lastSelected !== s.selected) bookmarkPreview = null;
    lastSelected = s.selected;
    center = getCenter(s);
    if (auto) radius = fittedMapRadius(center, [s.position, targetPosition(s)]);
    actualRadius = radius;
    const r = Math.min(w, h) * 0.39,
      ox = w / 2,
      oy = h / 2;
    const projectGal = (v) => {
      const p = mapProjection(v, mode, side, yaw, pitch);
      return { x: ox + p[0] * r, y: oy - p[1] * r, z: p[2] };
    };
    const project = (p) => projectGal(galacticVector(p.map((v, i) => (v - center[i]) / radius)));
    const gradient = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 1.25);
    gradient.addColorStop(0, '#16334b70');
    gradient.addColorStop(1, '#07111d00');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    function path(points, color, width = 1, dash = []) {
      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    function text(value, x, y, color = '#8baec5', align = 'left') {
      ctx.font = '11px system-ui';
      ctx.textAlign = align;
      ctx.fillStyle = color;
      ctx.fillText(value, x, y);
    }
    function ring(axis, scale, color) {
      const p = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2,
          v = [0, 0, 0];
        v[(axis + 1) % 3] = Math.cos(a) * scale;
        v[(axis + 2) % 3] = Math.sin(a) * scale;
        p.push(projectGal(v));
      }
      path(p, color);
    }
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#70b7d550';
    ctx.lineWidth = 1;
    ctx.stroke();
    ring(side && mode === '2d' ? 1 : 2, 1, '#69adcc66');
    ring(side && mode === '2d' ? 1 : 2, 0.5, '#69adcc2b');
    if (mode === '3d') {
      ring(0, 1, '#69adcc26');
      ring(1, 1, '#69adcc26');
    }
    const axes = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      axisNames = ['银心方向', '银经90°', '银北'];
    axes.forEach((v, i) => {
      if (mode === '2d' && (side ? i === 1 : i === 2)) return;
      const a = projectGal(v.map((n) => n * 0.93)),
        b = projectGal(v.map((n) => -n * 0.93));
      path([a, b], '#71a8c12a', 1);
      text(t(axisNames[i]), Math.max(42, Math.min(w - 42, a.x)), a.y - 5, '#7397ae', 'center');
    });
    hits = [];
    drawn = 0;
    const showNames = $('[data-names]').checked;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.clip();
    if ($('[data-trail]').checked && trail.points.length > 1)
      path(trail.points.map(project), '#5ae1dc70', 1.4);
    const me = project(s.position),
      target = project(targetPosition(s));
    path([me, target], '#e8c37a70', 1, [4, 5]);
    if (s.flightTarget) path([me, project(s.flightTarget)], '#bc9ef3bb', 1.5, [2, 4]);
    const highlightFormation = $('[data-lines]').checked && s.formation;
    const candidates = [],
      visible = [];
    for (let i = 1; i < catalog.count; i++) {
      const k = i * 3;
      if (
        (catalog.positions[k] - center[0]) ** 2 +
          (catalog.positions[k + 1] - center[1]) ** 2 +
          (catalog.positions[k + 2] - center[2]) ** 2 <=
        radius ** 2
      )
        visible.push(i);
    }
    const density = Math.min(1, Math.sqrt((expanded ? 800 : 220) / Math.max(1, visible.length)));
    for (const i of visible) {
      const k = i * 3,
        delta = [
          catalog.positions[k] - center[0],
          catalog.positions[k + 1] - center[1],
          catalog.positions[k + 2] - center[2],
        ];
      const p = projectGal(galacticVector(delta.map((v) => v / radius))),
        bv = catalog.photometry[k + 1];
      const size = Math.max(
        0.55,
        Math.max(1, Math.min(2.6, 2.5 - catalog.photometry[k] * 0.12)) * density
      );
      ctx.globalAlpha =
        (mode === '3d' ? 0.45 + (0.45 * (p.z + 1)) / 2 : 0.7) * Math.max(0.2, density);
      ctx.fillStyle = bv > 0.9 ? '#ffce96' : bv > 0.4 ? '#fff0d0' : '#b3daff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
      hits.push({ ...p, kind: 'star', index: i });
      drawn++;
      if (showNames && catalog.photometry[k] < 3 && i !== s.selected)
        candidates.push({ i, p, rank: catalog.photometry[k] });
    }
    ctx.globalAlpha = 1;
    if (highlightFormation) {
      for (const [a, b] of s.formation.segments)
        path([project(starPosition(a)), project(starPosition(b))], '#edcd8dcc', 1.5);
      for (const i of s.formation.members) {
        const position = starPosition(i);
        if (Math.hypot(...position.map((v, k) => v - center[k])) > radius) continue;
        const p = project(position);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.7, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe4ad';
        ctx.fill();
      }
    }
    ctx.restore();
    const occupied = [];
    function label(value, p, color, force = false) {
      const x = Math.max(8, Math.min(w - 8, p.x));
      let y = Math.max(16, Math.min(h - 28, p.y));
      if (force) {
        for (
          let attempt = 0;
          attempt < 10 && occupied.some((q) => Math.abs(q.x - x) < 80 && Math.abs(q.y - y) < 16);
          attempt++
        )
          y = Math.max(
            16,
            Math.min(h - 28, p.y + (attempt % 2 ? -1 : 1) * (Math.floor(attempt / 2) + 1) * 17)
          );
      }
      if (!force && occupied.some((q) => Math.abs(q.x - x) < 80 && Math.abs(q.y - y) < 18)) return;
      occupied.push({ x, y });
      text(value, x, y, color, x > w * 0.67 ? 'right' : 'left');
    }
    function marker(position, labelText, color, kind, index, symbol = 'circle') {
      let p = project(position),
        dx = p.x - ox,
        dy = p.y - oy,
        len = Math.hypot(dx, dy),
        outside = Math.hypot(...position.map((v, i) => v - center[i])) > radius;
      if (outside) {
        if (len < 1e-8) {
          dx = 0;
          dy = -1;
          len = 1;
        }
        p = { x: ox + (dx / len) * r, y: oy + (dy / len) * r };
        const a = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(a);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-5, -4);
        ctx.lineTo(-5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (symbol === 'diamond') {
          ctx.moveTo(p.x, p.y - 5);
          ctx.lineTo(p.x + 5, p.y);
          ctx.lineTo(p.x, p.y + 5);
          ctx.lineTo(p.x - 5, p.y);
          ctx.closePath();
        } else ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (kind) hits.unshift({ ...p, kind, index });
      label(labelText, { x: p.x + 8, y: p.y - 9 }, color, true);
      return p;
    }
    (s.bookmarks || []).forEach((b, i) =>
      marker(b.position, b.name, '#8fd1bd', 'bookmark', i, 'diamond')
    );
    marker([0, 0, 0], t('太阳'), '#e7c27e', 'star', 0);
    if (s.selected !== 0)
      marker(starPosition(s.selected), name(s.selected), '#ffe1a4', 'star', s.selected);
    const observer = marker(s.position, t('自己'), '#73e8f2', null, null, 'diamond');
    function arrow(direction, color, length, dash = []) {
      const d = mapProjection(galacticVector(direction), mode, side, yaw, pitch),
        norm = Math.hypot(d[0], d[1]);
      if (norm < 1e-8) return;
      const x = d[0] / norm,
        y = -d[1] / norm,
        tip = { x: observer.x + x * length, y: observer.y + y * length };
      path([observer, tip], color, 1.8, dash);
      path(
        [
          { x: tip.x - x * 5 - y * 3, y: tip.y - y * 5 + x * 3 },
          tip,
          { x: tip.x - x * 5 + y * 3, y: tip.y - y * 5 - x * 3 },
        ],
        color,
        1.8
      );
    }
    arrow(s.forward, '#73e8f2', 23);
    if (Math.hypot(...s.velocity) > 1e-12) arrow(s.velocity, '#c49bff', 34, [3, 3]);
    if (highlightFormation && showNames) {
      for (const i of s.formation.members) {
        if (i === s.selected) continue;
        const position = starPosition(i);
        if (Math.hypot(...position.map((v, k) => v - center[k])) > radius) continue;
        const p = project(position);
        label(name(i), { x: p.x + 6, y: p.y - 6 }, '#e8cf9c');
      }
    }
    for (const c of highlightFormation
      ? []
      : candidates.sort((a, b) => a.rank - b.rank).slice(0, 80)) {
      if (occupied.length > (expanded ? 30 : 12)) break;
      const n = name(c.i);
      if (n.startsWith('HIP ')) continue;
      label(n, { x: c.p.x + 5, y: c.p.y - 5 }, '#9fbfd3');
    }
    text(`${t('半径')} ${format(radius)}`, 12, h - 12, '#9bbacc');
    text(`${drawn.toLocaleString()} ${t('颗')}`, w - 12, h - 12, '#7da0b9', 'right');
    const bookmark = s.bookmarks[bookmarkPreview];
    $('.map-target').textContent = bookmark?.name || name(s.selected);
    $('[data-go]').textContent = t(bookmark ? '恢复航点' : '前往恒星');
    $('.map-distance').textContent =
      `${t('距观察者 {distance}', { distance: format(Math.hypot(...targetPosition(s).map((v, i) => v - s.position[i]))) })} · ${t('距太阳')} ${format(Math.hypot(...s.position))}`;
    $('.map-scale').textContent =
      `${t('最近已收录恒星')} ${name(s.nearest)} · ${format(s.nearestDistance)}`;
    const z = galacticVector(targetPosition(s).map((v, i) => v - center[i]))[2];
    $('.map-height').textContent = `${t('目标相对参考平面')} ${z >= 0 ? '+' : '−'}${format(z)}`;
    $('.map-reference').textContent = s.referenceView
      ? t('主画面为太阳视角参考；地图显示实际位置')
      : '';
    lastRenderMs = performance.now() - started;
    renderCount++;
  }
  refresh();
  return {
    root,
    resetTrail: () => trail.reset(),
    update(dt) {
      if (disposed) return;
      const s = getState();
      trail.update(s.position, dt, radius);
      if (collapsed || document.hidden) return;
      elapsed += dt;
      if (elapsed < 0.05) return;
      const forced = elapsed >= 1;
      elapsed = 0;
      const signature = [
        ...s.position,
        ...s.forward,
        ...s.velocity,
        s.selected,
        s.nearest,
        s.referenceView,
        s.culture,
        s.formation?.id,
        ...s.bookmarks.map((b) => `${b.name}:${b.position.join(',')}`),
        canvas.clientWidth,
        canvas.clientHeight,
        window.devicePixelRatio,
      ].join('|');
      if (!forced && signature === lastSignature) return;
      draw(s);
      lastSignature = signature;
    },
    status: () => ({
      mode,
      centerMode,
      simple,
      radius,
      center: [...center],
      expanded,
      collapsed,
      auto,
      drawn,
      trailPoints: trail.points.length,
      lastRenderMs,
      renderCount,
      hits: hits.map((h) => ({ x: h.x, y: h.y, index: h.index, kind: h.kind })),
    }),
    dispose() {
      disposed = true;
      offLanguage();
      listeners.forEach((off) => off());
      persist();
      root.remove();
      hits = [];
      trail.reset();
    },
  };
}
