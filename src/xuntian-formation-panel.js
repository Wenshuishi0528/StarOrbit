import { onLanguageChange, t } from './i18n.js';

const css = `
.xt-formation{border-top:1px solid #294351;color:#d7e8ef;font-size:12px}.xt-formation summary{cursor:pointer;padding:7px 0;color:#bdd8df;font-weight:600}
.xt-formation p{margin:3px 0 5px;color:#a9bdc7;line-height:1.45}.xt-formation canvas{display:block;width:100%;height:145px;background:#091823;border:1px solid #2d4a55;border-radius:5px;touch-action:none;cursor:crosshair}
.xt-formation .xt-offsets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-top:5px}.xt-formation label{min-width:0;color:#aec4cc;font-size:11px;display:grid;gap:2px}
.xt-formation input[type=number]{min-width:0!important;width:100%!important;max-width:none!important;padding:4px!important}.xt-formation input[type=range]{box-sizing:border-box;width:100%;max-width:none;padding:0!important;margin:4px 0 1px;accent-color:#8ae6cd}
.xt-formation button{font:inherit}.xt-formation .xt-controls{display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap}.xt-formation .xt-result{color:#a3dfd0;font-variant-numeric:tabular-nums}.xt-formation .xt-result[data-limit=true]{color:#f7bd85}
`;
const axes = ['沿轨（米）', '侧向（米）', '径向外（米）'];
const fmt = (n) => Math.round(n * 10) / 10;
export function mountXuntianFormationPanel(host, formation) {
  const root = document.createElement('details');
  root.className = 'xt-formation';
  root.dataset.testid = 'xuntian-formation';
  host.append(root);
  const node = (tag, parent) => {
    const e = document.createElement(tag);
    parent.append(e);
    return e;
  };
  const sheet = node('style', root);
  sheet.textContent = css;
  const summary = node('summary', root),
    hint = node('p', root),
    canvas = node('canvas', root);
  canvas.tabIndex = 0;
  canvas.dataset.formation = 'map';
  const fields = node('div', root);
  fields.className = 'xt-offsets';
  const numeric = axes.map((_, i) => {
    const l = node('label', fields),
      title = node('span', l),
      field = node('input', l);
    field.type = 'number';
    field.step = '.1';
    field.dataset.formation = ['along', 'cross', 'radial'][i];
    field.onchange = () => {
      if (field.value === '') {
        refresh();
        return;
      }
      const next = formation.getOffset();
      next[i] = field.valueAsNumber;
      formation.setOffset(next);
      refresh();
    };
    field.onblur = refresh;
    return { title, field };
  });
  const height = node('input', root);
  height.type = 'range';
  height.step = '.5';
  height.dataset.formation = 'height';
  height.oninput = () => {
    const next = formation.getOffset();
    next[2] = Number(height.value);
    formation.setOffset(next);
  };
  const controls = node('div', root);
  controls.className = 'xt-controls';
  const result = node('small', controls);
  result.className = 'xt-result';
  const reset = node('button', controls);
  reset.type = 'button';
  reset.dataset.formation = 'reset';
  reset.onclick = () => formation.restoreSuggested();
  let region = null,
    drag = null;
  function draw(state) {
    if (!root.open) return;
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(w * ratio),
      ch = Math.round(h * ratio);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(cw / w, 0, 0, ch / h, 0, 0);
    ctx.fillStyle = '#091823';
    ctx.fillRect(0, 0, w, h);
    const points = [state.offset, state.suggested],
      xSpan = Math.max(160, state.extent * 1.15, ...points.map((p) => Math.abs(p[0]) * 1.15));
    const ySpan = Math.max(100, state.extent * 0.7, ...points.map((p) => Math.abs(p[1]) * 1.15));
    const scale = Math.min((w - 36) / (2 * xSpan), (h - 29) / (2 * ySpan)),
      cx = w / 2,
      cy = h / 2;
    if (drag === null || !region) region = { cx, cy, scale };
    const { cx: ox, cy: oy, scale: k } = region;
    const xy = (p) => [ox + p[0] * k, oy - p[1] * k];
    ctx.strokeStyle = '#29404e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(6, oy);
    ctx.lineTo(w - 6, oy);
    ctx.moveTo(ox, 5);
    ctx.lineTo(ox, h - 5);
    ctx.stroke();
    for (const shape of formation.mapShapes()) {
      const p = shape.map(xy);
      ctx.beginPath();
      for (let i = 0; i < 8; i++)
        for (const bit of [1, 2, 4])
          if (!(i & bit)) {
            ctx.moveTo(...p[i]);
            ctx.lineTo(...p[i | bit]);
          }
      ctx.strokeStyle = '#7e9baa';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    const here = xy(state.offset),
      start = [ox, oy];
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = '#91b2b8';
    ctx.beginPath();
    ctx.moveTo(...start);
    ctx.lineTo(...here);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#eac583';
    ctx.beginPath();
    ctx.arc(...start, 3.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#92ebda';
    ctx.beginPath();
    ctx.arc(...here, 4.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#c5e6df';
    ctx.fillText(t('巡天'), Math.min(w - 35, here[0] + 7), Math.max(13, here[1] - 4));
    ctx.fillStyle = '#9bb6c0';
    ctx.textAlign = 'right';
    ctx.fillText(t('沿轨 +'), w - 6, h - 6);
    ctx.textAlign = 'left';
    ctx.fillText(t('侧向 +'), 7, 12);
  }
  function refresh() {
    const state = formation.getState();
    for (const [i, { field }] of numeric.entries()) {
      if (document.activeElement !== field || state.constrained)
        field.value = String(fmt(state.offset[i]));
      field.disabled = !state.available;
    }
    const bound =
      Math.ceil(Math.max(160, state.extent * 1.3, Math.abs(state.offset[2]) * 1.2) / 20) * 20;
    height.min = String(-bound);
    height.max = String(bound);
    height.value = String(state.offset[2]);
    height.disabled = reset.disabled = !state.available;
    result.textContent = !state.available
      ? t('当前没有独立飞行的巡天')
      : t(state.constrained ? '接近站体保护范围，间距 {m} 米' : '两器参考点间距 {m} 米', {
          m: fmt(Math.hypot(...state.offset)),
        });
    result.dataset.limit = String(state.constrained);
    canvas.setAttribute('aria-disabled', String(!state.available));
    draw(state);
  }
  function translate() {
    summary.textContent = t('伴飞位置');
    hint.textContent = t(
      '拖动平面图调整沿轨与侧向距离，用滑条调整径向高度。站体及太阳翼附近保留保护间距。'
    );
    for (const [i, item] of numeric.entries()) item.title.textContent = t(axes[i]);
    height.setAttribute('aria-label', t('径向外（米）'));
    canvas.setAttribute('aria-label', t('巡天伴飞位置图，方向键沿轨或侧向移动'));
    reset.textContent = t('恢复建议站位');
    refresh();
  }
  function move(e) {
    if (!region) return;
    const b = canvas.getBoundingClientRect(),
      p = formation.getOffset();
    p[0] = (e.clientX - b.left - region.cx) / region.scale;
    p[1] = (region.cy - (e.clientY - b.top)) / region.scale;
    formation.setOffset(p);
  }
  canvas.onpointerdown = (e) => {
    if (drag !== null || e.button !== 0 || !formation.getState().available) return;
    e.preventDefault();
    drag = e.pointerId;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    move(e);
  };
  canvas.onpointermove = (e) => {
    if (drag === e.pointerId) move(e);
  };
  const end = () => {
    drag = null;
    refresh();
  };
  canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = end;
  canvas.onkeydown = (e) => {
    const index = ['ArrowLeft', 'ArrowRight'].includes(e.key)
      ? 0
      : ['ArrowDown', 'ArrowUp'].includes(e.key)
        ? 1
        : -1;
    if (index < 0) return;
    e.preventDefault();
    const next = formation.getOffset();
    next[index] += (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
    formation.setOffset(next);
  };
  root.addEventListener('toggle', refresh);
  const resize = new ResizeObserver(refresh);
  resize.observe(canvas);
  const unsubscribe = formation.subscribe(refresh),
    offLanguage = onLanguageChange(translate);
  translate();
  return {
    refresh,
    dispose() {
      unsubscribe();
      offLanguage();
      resize.disconnect();
      root.remove();
    },
  };
}
