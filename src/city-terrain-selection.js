// Both layouts use the same rows and selection, including during periodic resource updates.
import { t } from './i18n.js';

export function mountCityTerrainSelection(list, remove, refresh) {
  const bar = document.createElement('div');
  bar.className = 'city-selection-bar';
  list.before(bar);
  function button(action) {
    const el = document.createElement('button');
    el.type = 'button';
    el.onclick = action;
    bar.append(el);
    return el;
  }
  const chosen = new Set(),
    inputs = new Map();
  let layout = 'cards',
    deleting = false,
    drag = null;
  try {
    if (localStorage.getItem('starorbit-city-layout') === 'list') layout = 'list';
  } catch {}
  function setLayout(value) {
    layout = value;
    try {
      localStorage.setItem('starorbit-city-layout', value);
    } catch {}
    paint();
  }
  const cards = button(() => setLayout('cards'));
  const compact = button(() => setLayout('list'));
  const select = button(() => {
    const selectAll = chosen.size < inputs.size;
    for (const [id, input] of inputs) mark(id, input, selectAll);
    paint();
  });
  const erase = button(async () => {
    const ids = [...chosen];
    if (
      deleting ||
      !ids.length ||
      !confirm(t('删除选中的 {count} 项地景？', { count: ids.length }))
    )
      return;
    report.textContent = '';
    deleting = true;
    paint();
    try {
      for (const id of ids) {
        await remove(id);
        forget(id);
      }
    } catch (error) {
      report.textContent = error.message;
    } finally {
      deleting = false;
      paint();
      refresh();
    }
  });
  const report = document.createElement('span');
  report.setAttribute('role', 'status');
  bar.append(report);
  function mark(id, input, on) {
    if (on) chosen.add(id);
    else chosen.delete(id);
    input.checked = on;
    input.closest('section').classList.toggle('city-selected', on);
  }
  function paint() {
    list.dataset.layout = layout;
    for (const [el, mode, key] of [
      [cards, 'cards', '卡片视图'],
      [compact, 'list', '列表视图'],
    ]) {
      el.textContent = t(key);
      el.setAttribute('aria-pressed', String(layout === mode));
    }
    select.textContent = t(chosen.size && chosen.size === inputs.size ? '取消全选' : '全选');
    select.disabled = deleting || !inputs.size;
    erase.textContent = t('删除所选（{count}）', { count: chosen.size });
    erase.disabled = deleting || !chosen.size;
    list.title = t('勾选地景，或按住鼠标拖过多项');
  }
  function chooseRow(el, on) {
    const id = el?.closest('[data-city]')?.dataset.city;
    const input = inputs.get(id);
    if (!input) return;
    mark(id, input, on ?? !chosen.has(id));
    paint();
    return input.checked;
  }
  list.onpointerdown = (e) => {
    if (
      deleting ||
      e.pointerType !== 'mouse' ||
      e.button !== 0 ||
      e.target.closest('button,input,details,a,label')
    )
      return;
    const on = chooseRow(e.target);
    if (on === undefined) return;
    e.preventDefault();
    drag = { id: e.pointerId, on, x: e.clientX, y: e.clientY };
    list.setPointerCapture(e.pointerId);
  };
  list.onpointermove = (e) => {
    if (drag?.id !== e.pointerId || !e.buttons) return;
    // Pointer events may skip whole rows during a fast sweep. Sample the path
    // in screen coordinates so the same gesture also follows a grid of cards.
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 16));
    let changed = false;
    for (let i = 1; i <= steps; i++) {
      const row = document
        .elementFromPoint(drag.x + (dx * i) / steps, drag.y + (dy * i) / steps)
        ?.closest('[data-city]');
      const id = row?.dataset.city;
      if (inputs.has(id) && list.contains(row) && chosen.has(id) !== drag.on) {
        mark(id, inputs.get(id), drag.on);
        changed = true;
      }
    }
    if (changed) paint();
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  list.onpointerup =
    list.onpointercancel =
    list.onlostpointercapture =
      () => {
        drag = null;
      };
  function forget(id) {
    inputs.delete(id);
    chosen.delete(id);
  }
  return {
    add(id, element) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'city-select';
      input.onchange = () => {
        mark(id, input, deleting ? chosen.has(id) : input.checked);
        paint();
      };
      const hitArea = document.createElement('label');
      hitArea.className = 'city-select-hit';
      hitArea.append(input);
      element.prepend(hitArea);
      inputs.set(id, input);
      return input;
    },
    forget,
    paint,
  };
}
