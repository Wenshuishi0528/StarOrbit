import { onLanguageChange } from './i18n.js';
import { flightText as ft } from './flight-controls-copy.js';
import { PILOT_CODES } from './pilot-controls.js';

const guides = {
  spacecraft: ['spacecraftKeyGuide', '航天器操控键'],
  'free-flight': ['freeFlightKeyGuide', '飞船操纵键'],
  interstellar: ['interstellarKeyGuide', '星际穿梭操控键'],
};
// Column/row positions follow the hands on a QWERTY keyboard. The actual code
// comes from the same bindings used by the three flight controllers.
const orientation = [
  ['rollLeft', '左滚转', 1, 1],
  ['pitchDown', '低头', 2, 1],
  ['rollRight', '右滚转', 3, 1],
  ['yawLeft', '左偏航', 1, 2],
  ['pitchUp', '抬头', 2, 2],
  ['yawRight', '右偏航', 3, 2],
];
const movement = [
  ['down', '向下', 3, 1],
  ['forward', '前进', 1, 2],
  ['left', '向左', 2, 2],
  ['up', '向上', 3, 2],
  ['right', '向右', 4, 2],
  ['back', '后退', 1, 3],
];

export function mountPilotKeyGuide({ mode, host = document.body, takeControl, onVisibility }) {
  const [id, title] = guides[mode];
  const stellar = mode === 'interstellar';
  const root = document.createElement('section');
  root.className = 'pilot-key-guide';
  root.id = id;
  root.hidden = true;
  root.tabIndex = -1;
  root.setAttribute('aria-labelledby', id + '-title');
  root.innerHTML = `<div class="pilot-guide-heading"><h3 id="${id}-title"></h3><button type="button" data-key-close>×</button></div>
    <div class="pilot-guide-content"><div class="pilot-guide-groups"></div><div class="pilot-guide-switches"></div>
    <p class="pilot-guide-tip"></p><button type="button" data-key-focus></button></div>`;
  host.append(root);
  const heading = root.querySelector('h3');
  const close = root.querySelector('[data-key-close]');
  const focus = root.querySelector('[data-key-focus]');
  const tip = root.querySelector('.pilot-guide-tip');
  const switches = root.querySelector('.pilot-guide-switches');
  const labels = new Map([[heading, title]]);
  const keys = new Map();
  const lit = new Set();
  const triggers = new Set();
  const abort = new AbortController();
  const events = { signal: abort.signal };
  let lastTrigger = null,
    rcs = true,
    ready = true,
    armed = false;

  function keycap(container, code, caption, column, row) {
    const cell = document.createElement('span'),
      key = document.createElement('kbd');
    const action = document.createElement('span');
    cell.className = 'pilot-guide-key';
    cell.dataset.keyCode = code;
    key.textContent =
      code === 'Escape' ? 'Esc' : code === 'CapsLock' ? 'Caps Lock' : code.replace(/^Key/, '');
    labels.set(action, caption);
    cell.append(key, action);
    if (column) {
      cell.style.gridColumn = column;
      cell.style.gridRow = row;
    }
    container.append(cell);
    keys.set(code, cell);
  }
  for (const [name, positions] of [
    [stellar ? '转动视线' : '转动飞船', orientation],
    [stellar ? '移动视点' : '平移飞船', movement],
  ]) {
    const group = document.createElement('div'),
      caption = document.createElement('h4');
    const grid = document.createElement('div');
    grid.className = 'pilot-guide-grid';
    labels.set(caption, name);
    group.append(caption, grid);
    root.querySelector('.pilot-guide-groups').append(group);
    for (const [action, label, col, row] of positions)
      keycap(grid, PILOT_CODES[action], label, col, row);
  }
  if (stellar) {
    keycap(switches, 'Space', '立即停止');
    keycap(switches, 'Escape', '停止并交还键盘');
  } else {
    keycap(switches, 'KeyR', 'RCS');
    keycap(switches, 'KeyT', 'SAS');
    keycap(switches, 'KeyF', '临时切换 SAS');
    keycap(switches, 'CapsLock', '精调');
    if (mode === 'spacecraft') keycap(switches, 'Escape', '交还键盘');
  }
  function status() {
    const help = stellar
      ? ft('按住 H 前进，空格立即停下。') + ' ' + ft('拖动星空转头，滚轮改变视场。')
      : ft(rcs ? '飞船松开推力后会继续漂移。' : '平移需要 RCS，按 R 开启。');
    if (tip.textContent !== help) tip.textContent = help;
    const label = ft(armed ? '键盘已接管' : '接管键盘');
    if (focus.textContent !== label) focus.textContent = label;
    focus.disabled = !ready;
    root.dataset.translation = String(stellar || rcs);
  }
  function translate() {
    for (const [node, label] of labels) node.textContent = ft(label);
    for (const trigger of triggers) trigger.textContent = ft('操控键');
    close.setAttribute('aria-label', ft('关闭'));
    status();
  }
  function clear() {
    for (const code of lit) keys.get(code).classList.remove('is-pressed');
    lit.clear();
  }
  function show(visible, { trigger, focusPage = false, remember = true } = {}) {
    if (trigger) lastTrigger = trigger;
    root.hidden = !visible;
    for (const button of triggers) button.setAttribute('aria-expanded', String(visible));
    if (!visible) clear();
    if (visible && focusPage) root.focus({ preventScroll: true });
    if (remember) onVisibility?.(visible);
  }
  function dismiss() {
    const returnFocus = root.contains(document.activeElement);
    show(false);
    if (returnFocus) lastTrigger?.focus({ preventScroll: true });
  }
  close.addEventListener('click', dismiss, events);
  root.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }
    },
    events
  );
  focus.addEventListener('click', () => takeControl(), events);
  document.addEventListener(
    'starorbit:open-controls',
    (event) => {
      if ((event.detail?.mode ?? 'spacecraft') === mode)
        show(true, { trigger: document.activeElement, focusPage: true });
    },
    events
  );
  const unsubscribe = onLanguageChange(translate);
  translate();
  return {
    root,
    show,
    clear,
    bind(trigger) {
      triggers.add(trigger);
      lastTrigger ??= trigger;
      trigger.setAttribute('aria-controls', id);
      trigger.setAttribute('aria-expanded', String(!root.hidden));
      trigger.textContent = ft('操控键');
      trigger.addEventListener(
        'click',
        () => {
          if (root.hidden) show(true, { trigger, focusPage: true });
          else dismiss();
        },
        events
      );
    },
    press(code, down) {
      if (root.hidden || !keys.has(code) || lit.has(code) === down) return;
      if (down) lit.add(code);
      else lit.delete(code);
      keys.get(code).classList.toggle('is-pressed', down);
    },
    update(next) {
      if (ready === next.ready && armed === next.armed && rcs === (next.rcs ?? true)) return;
      ready = next.ready;
      armed = next.armed;
      rcs = next.rcs ?? true;
      if (!armed) clear();
      status();
    },
    dispose() {
      abort.abort();
      unsubscribe();
      root.remove();
    },
  };
}
