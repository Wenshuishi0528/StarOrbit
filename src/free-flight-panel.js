import { onLanguageChange, t } from './i18n.js';
import { FREE_FLIGHT_RCS_DEFAULTS, FREE_FLIGHT_RCS_RANGES } from './free-flight-vessels.js';
import { FREE_FLIGHT_LIMITS, FREE_FLIGHT_DOCKING_RANGES } from './free-flight-physics.js';
import { PILOT_CODES } from './pilot-controls.js';

const groups = {
  translation: [
    ['forward', 'KeyH', '前进 H', 0, 1],
    ['back', 'KeyN', '后退 N', 0, -1],
    ['left', 'KeyJ', '左移 J', 1, -1],
    ['right', 'KeyL', '右移 L', 1, 1],
    ['up', 'KeyK', '上移 K', 2, 1],
    ['down', 'KeyI', '下移 I', 2, -1],
  ],
  rotation: [
    ['pitchUp', 'KeyS', '抬头 S', 1, 1],
    ['pitchDown', 'KeyW', '低头 W', 1, -1],
    ['yawLeft', 'KeyA', '左偏航 A', 2, 1],
    ['yawRight', 'KeyD', '右偏航 D', 2, -1],
    ['rollLeft', 'KeyQ', '左滚转 Q', 0, 1],
    ['rollRight', 'KeyE', '右滚转 E', 0, -1],
  ],
};
const controls = new Map();
for (const [group, axes] of Object.entries(groups)) {
  for (const [id, , label, axis, sign] of axes)
    controls.set(id, { group, code: PILOT_CODES[id], label, axis, sign });
}
controls.set('brake', { label: '按住相对制动（需 RCS）' });
const keyToControl = new Map(
  [...controls].filter(([, def]) => def.code).map(([id, { code }]) => [code, id])
);
const keyToAction = new Map([
  ['KeyR', 'rcs-toggle'],
  ['KeyT', 'damping'],
  ['CapsLock', 'fine'],
]);
const phaseNames = {
  docked: '已停靠',
  departing: '正在退离',
  free: '自由飞行',
  collision: '发生碰撞',
};

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const whole = Math.max(0, Math.floor(seconds));
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}
function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}
function setPressed(node, pressed) {
  const value = String(!!pressed);
  if (node.getAttribute('aria-pressed') !== value) node.setAttribute('aria-pressed', value);
}
function visibility(node, hidden) {
  if (node.hidden !== hidden) node.hidden = hidden;
}
function disable(node, disabled) {
  if (node.disabled !== disabled) node.disabled = disabled;
}
function readValue(value, digits, unit) {
  return Number.isFinite(value) ? value.toFixed(digits) + ' ' + unit : '—';
}
function instructions(state) {
  if (state.message) return t(state.message);
  if (!state.crafts?.length) return t('当前组合没有可驾驶的飞船。');
  if (state.phase === 'collision') return t('可从安全点重试，或载入已保存的任务。');
  if (state.paused) return t('时间已暂停。继续后可操纵飞船。');
  if (state.phase === 'docked') return t('选择停靠的飞船，点「离站」开始绕飞。');
  if (state.phase === 'departing') return t('飞船正在沿接口轴退离。');
  if (state.approach) return t('正在辅助回接。手动操纵可接管飞船。');
  if (state.hold) return t('飞船正在保持相对位置。');
  return state.canDock
    ? t('已进入接口前方，可手动接近或辅助回接。')
    : t('松开推力后会继续漂移；返回时对准原接口。');
}

// The controller owns all session state. Input is a held command, never a velocity.
export function mountFreeFlightPanel({
  host = document.body,
  inputSurface = null,
  onAction,
  onInput,
}) {
  const root = document.createElement('section');
  root.id = 'freeFlightPanel';
  root.hidden = true;
  root.tabIndex = -1;
  root.setAttribute('aria-labelledby', 'ffPanelTitle');
  root.innerHTML = `
  <div class="ff-head"><h2 id="ffPanelTitle" data-ft="自由飞行"></h2><button type="button" data-flight-action="exit" data-ft="返回观察"></button></div>
  <div class="ff-content">
   <label class="ff-craft"><span data-ft="驾驶飞船"></span><select data-flight-select></select></label>
   <div class="ff-status"><strong data-flight-status></strong><span class="ff-clock" data-flight-read="elapsed"></span></div>
   <dl class="ff-meters">
    <div><dt data-ft="接口距离"></dt><dd data-flight-read="range"></dd></div>
    <div><dt data-ft="闭合速度"></dt><dd data-flight-read="closing"></dd></div>
    <div><dt data-ft="对准误差"></dt><dd data-flight-read="angle"></dd></div>
   </dl>
   <div class="ff-primary-actions">
    <button type="button" class="ff-primary" data-flight-action="undock" data-ft="离站"></button>
    <button type="button" class="ff-primary" data-flight-action="dock"></button>
    <button type="button" data-flight-action="hold"></button>
    <button type="button" data-flight-action="pause"></button>
   </div>
   <p class="ff-tip" role="status" data-flight-message></p>
   <div class="ff-view">
    <button type="button" data-flight-action="view" data-flight-view="external" data-ft="外部视角"></button>
    <button type="button" data-flight-action="view" data-flight-view="port" data-ft="对接相机"></button>
    <button type="button" data-flight-action="photo" data-ft="拍照"></button>
   </div>
   <label class="ff-craft"><span data-ft="镜头目标"></span><select data-flight-camera></select></label>
   <div class="ff-display" aria-label="Flight display">
    <button type="button" data-flight-action="navball" data-ft="导航球"></button>
    <button type="button" data-flight-action="trail" data-ft="历史轨迹"></button>
    <button type="button" data-flight-action="fine" aria-keyshortcuts="CapsLock" data-ft="精细操纵 ×0.2 · Caps Lock"></button>
    <button type="button" data-flight-action="rcs-toggle" aria-keyshortcuts="R" data-ft="RCS 推进器 · R"></button>
    <button type="button" data-flight-action="damping" aria-keyshortcuts="T" data-ft="SAS 稳姿 · T"></button>
   </div>
   <p class="ff-tip" data-ft="SAS 只稳定姿态；平移制动需要 RCS。"></p>
   <details class="ff-settings"><summary data-ft="RCS 推力设置"></summary>
    <p data-ft="只调整当前飞船，随飞行任务保存。精细操纵使用设定值的 20%。"></p>
    <form data-flight-rcs-form>
     <label><span data-ft="平移加速度"></span><input type="number" data-flight-rcs="acceleration" required><span>m/s²</span></label>
     <label><span data-ft="角加速度"></span><input type="number" data-flight-rcs="angularAcceleration" required><span>°/s²</span></label>
     <label><span data-ft="SAS 辅助转速上限"></span><input type="number" data-flight-rcs="maxAngularRate" required><span>°/s</span></label>
     <div><button type="submit" data-ft="应用参数"></button><button type="button" data-flight-action="rcs-reset" data-ft="恢复默认推力"></button></div>
    </form>
   </details>
   <details class="ff-settings"><summary data-ft="对接容差设置"></summary>
    <p data-ft="本次任务的所有飞船共用。接口捕获允许一定误差，船体和太阳翼碰撞仍会检查。"></p>
    <form data-flight-docking-form>
     <label><span data-ft="最大横向偏差"></span><input type="number" data-flight-limit="captureLateral" required><span>m</span></label>
     <label><span data-ft="最大姿态偏差"></span><input type="number" data-flight-limit="captureAngle" required><span>°</span></label>
     <label><span data-ft="最大接触速度"></span><input type="number" data-flight-limit="captureSpeed" required><span>m/s</span></label>
     <label><span data-ft="最大横向速度"></span><input type="number" data-flight-limit="captureLateralSpeed" required><span>m/s</span></label>
     <label><span data-ft="最大接触转速"></span><input type="number" data-flight-limit="captureAngularSpeed" required><span>°/s</span></label>
     <div><button type="submit" data-ft="应用容差"></button><button type="button" data-flight-action="docking-reset" data-ft="恢复默认容差"></button></div>
    </form>
   </details>
   <details class="ff-inputs"><summary data-ft="飞船操纵键"></summary>
    <div class="ff-thrusters" data-flight-group="translation"></div>
    <div class="ff-thrusters" data-flight-group="rotation"></div>
    <button type="button" class="ff-brake" data-flight-control="brake" data-ft="按住相对制动（需 RCS）"></button>
   </details>
   <div class="ff-storage">
    <button type="button" data-flight-action="save" data-ft="保存任务"></button>
    <button type="button" data-flight-action="resume" data-ft="载入存档"></button>
    <button type="button" data-flight-action="restore" data-ft="回到安全点"></button>
   </div>
  </div>`;
  host.append(root);
  const find = (selector) => root.querySelector(selector);
  const cameraSelector = find('[data-flight-camera]'),
    selector = find('[data-flight-select]'),
    status = find('[data-flight-status]'),
    tip = find('[data-flight-message]');
  const details = find('.ff-inputs'),
    meters = find('.ff-meters'),
    rcsForm = find('[data-flight-rcs-form]');
  const rcsFields = [...root.querySelectorAll('[data-flight-rcs]')];
  for (const field of rcsFields) {
    const range = FREE_FLIGHT_RCS_RANGES[field.dataset.flightRcs];
    field.min = range.min;
    field.max = range.max;
    field.step = 'any';
  }
  const dockingForm = find('[data-flight-docking-form]'),
    limitFields = [...root.querySelectorAll('[data-flight-limit]')];
  const limitScale = (key) => (key === 'captureAngularSpeed' ? 180 / Math.PI : 1);
  for (const field of limitFields) {
    const key = field.dataset.flightLimit,
      range = FREE_FLIGHT_DOCKING_RANGES[key],
      scale = limitScale(key);
    field.min = (range.min * scale).toFixed(4);
    field.max = (range.max * scale).toFixed(4);
    field.step = 'any';
  }
  const read = Object.fromEntries(
    [...root.querySelectorAll('[data-flight-read]')].map((el) => [el.dataset.flightRead, el])
  );
  const buttons = Object.fromEntries(
    [...root.querySelectorAll('[data-flight-action]')].map((el) => [el.dataset.flightAction, el])
  );
  const views = [...root.querySelectorAll('[data-flight-view]')];
  for (const [group, axes] of Object.entries(groups)) {
    const pad = find('[data-flight-group="' + group + '"]');
    for (const [id, , key] of axes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.flightControl = id;
      button.dataset.ft = key;
      pad.append(button);
    }
  }
  const keys = new Map(),
    pointers = new Map(),
    buttonsByKey = new Map(
      [...root.querySelectorAll('[data-flight-control]')].map((el) => [
        el.dataset.flightControl,
        el,
      ])
    );
  const abort = new AbortController(),
    options = { signal: abort.signal };
  let current = null,
    craftSignature = '',
    previousInput = '',
    lastManual = null,
    rcsSignature = '',
    limitSignature = '',
    cameraSignature = '';
  const focus = () => root.focus({ preventScroll: true });
  function sendInput({ clear = false } = {}) {
    const active = new Set([...keys.values(), ...pointers.values()]);
    const translation = [0, 0, 0],
      rotation = [0, 0, 0];
    for (const id of active) {
      const def = controls.get(id);
      if (def?.group && (def.group !== 'translation' || current?.rcsEnabled !== false))
        (def.group === 'translation' ? translation : rotation)[def.axis] += def.sign;
    }
    for (const [id, el] of buttonsByKey) setPressed(el, active.has(id));
    const brake = active.has('brake') && current?.rcsEnabled !== false;
    const temporarySas = active.has('temporarySas'),
      signature = [...translation, ...rotation, Number(brake), Number(temporarySas)].join(',');
    if (signature === previousInput && !clear) return;
    previousInput = signature;
    onInput({ translation, rotation, brake, temporarySas }, { clear });
  }
  function clearInput() {
    keys.clear();
    pointers.clear();
    sendInput({ clear: true });
  }
  const canFly = () =>
    !root.hidden && current && !current.paused && ['departing', 'free'].includes(current.phase);
  function update(state) {
    if (!state) return;
    const previous = current;
    current = state;
    if (
      !canFly() ||
      previous?.selectedId !== state.selectedId ||
      previous?.rcsEnabled !== state.rcsEnabled
    )
      clearInput();
    if (root.hidden) return;
    if (root.dataset.phase !== state.phase) root.dataset.phase = state.phase || '';
    if (root.dataset.paused !== String(!!state.paused))
      root.dataset.paused = String(!!state.paused);
    const crafts = state.crafts || [],
      signature = JSON.stringify(crafts.map(({ id, label }) => [id, label]));
    if (signature !== craftSignature) {
      selector.replaceChildren(...crafts.map(({ label, id }) => new Option(label, id)));
      craftSignature = signature;
    }
    if (selector.value !== state.selectedId) selector.value = state.selectedId ?? '';
    disable(selector, !crafts.length);
    const cameraOptions = [
      { id: 'active', label: t('当前驾驶飞船') },
      { id: 'station', label: t('中国空间站') },
      ...crafts.map((craft) => ({ id: 'ship:' + craft.id, label: craft.label })),
      { id: 'all', label: t('全部航天器') },
    ];
    const cameraKey = JSON.stringify(cameraOptions);
    if (cameraKey !== cameraSignature) {
      cameraSelector.replaceChildren(
        ...cameraOptions.map(({ label, id }) => new Option(label, id))
      );
      cameraSignature = cameraKey;
    }
    cameraSelector.value = state.cameraTarget || 'active';
    cameraSelector.disabled = state.view === 'port';
    cameraSelector.title = t(
      state.view === 'port' ? '对接相机固定跟随当前驾驶飞船' : '只切换镜头，不切换驾驶飞船'
    );
    const flying = state.phase === 'departing' || state.phase === 'free',
      docked = state.phase === 'docked',
      paused = !!state.paused;
    setText(status, t(phaseNames[state.phase] || '自由飞行'));
    setText(tip, instructions(state));
    setText(read.elapsed, formatTime(state.elapsed));
    visibility(meters, !flying && state.phase !== 'collision');
    if (!meters.hidden) {
      setText(read.range, readValue(state.range, 1, 'm'));
      setText(read.closing, readValue(state.closing, 2, 'm/s'));
      setText(read.angle, readValue(state.angle, 1, '°'));
    }
    visibility(buttons.undock, !docked);
    disable(buttons.undock, !state.selectedId || paused);
    visibility(buttons.dock, !flying);
    visibility(buttons.hold, !flying);
    disable(
      buttons.dock,
      paused || state.rcsEnabled === false || (!state.approach && !state.canDock)
    );
    setPressed(buttons.dock, state.approach);
    setText(buttons.dock, t(state.approach ? '取消回接' : '辅助回接'));
    disable(buttons.hold, paused || state.rcsEnabled === false || state.phase === 'departing');
    setPressed(buttons.hold, state.hold);
    setText(buttons.hold, t(state.hold ? '解除保持' : '保持位置'));
    setText(buttons.pause, t(paused ? '继续飞行' : '暂停飞行'));
    setPressed(buttons.pause, paused);
    for (const button of views) {
      setPressed(button, button.dataset.flightView === state.view);
      button.disabled = docked && button.dataset.flightView === 'port';
    }
    setPressed(buttons.navball, state.navball !== false);
    setPressed(buttons.trail, state.trail !== false);
    setPressed(buttons.fine, state.fine);
    setPressed(buttons.damping, state.effectiveSas ?? state.angularDamping !== false);
    buttons.damping.title = t('F 按住临时切换 SAS，松开恢复。');
    setPressed(buttons['rcs-toggle'], state.rcsEnabled !== false);
    const nextRcs = JSON.stringify([state.selectedId, state.rcs]);
    if (nextRcs !== rcsSignature) {
      for (const field of rcsFields)
        field.value = (state.rcs ?? FREE_FLIGHT_RCS_DEFAULTS)[field.dataset.flightRcs];
      rcsSignature = nextRcs;
    }
    const nextLimits = JSON.stringify(state.dockingLimits);
    if (nextLimits !== limitSignature) {
      for (const field of limitFields) {
        const key = field.dataset.flightLimit;
        field.value = Number(
          ((state.dockingLimits ?? FREE_FLIGHT_LIMITS)[key] * limitScale(key)).toFixed(4)
        );
      }
      limitSignature = nextLimits;
    }
    disable(buttons.resume, !state.hasSave);
    disable(buttons.restore, !state.hasCheckpoint);
    visibility(details, !flying);
    const manual = canFly(),
      manualSignature = String(manual) + ':' + String(state.rcsEnabled !== false);
    if (lastManual !== manualSignature) {
      for (const [id, el] of buttonsByKey) {
        const thruster = id === 'brake' || controls.get(id).group === 'translation';
        el.disabled = !manual || (thruster && state.rcsEnabled === false);
      }
      lastManual = manualSignature;
    }
  }
  function translate() {
    for (const el of root.querySelectorAll('[data-ft]')) setText(el, t(el.dataset.ft));
    if (current) update(current);
  }
  const unsubscribe = onLanguageChange(translate);
  translate();
  cameraSelector.addEventListener(
    'change',
    () => {
      clearInput();
      onAction('camera-target', cameraSelector.value);
      focus();
    },
    options
  );
  selector.addEventListener(
    'change',
    () => {
      clearInput();
      onAction('select', selector.value);
      focus();
    },
    options
  );
  rcsForm.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      clearInput();
      if (!rcsForm.reportValidity()) return;
      onAction(
        'rcs',
        Object.fromEntries(rcsFields.map((field) => [field.dataset.flightRcs, Number(field.value)]))
      );
      rcsSignature = '';
      if (current) update(current);
      focus();
    },
    options
  );
  dockingForm.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      clearInput();
      if (!dockingForm.reportValidity()) return;
      onAction(
        'docking-limits',
        Object.fromEntries(
          limitFields.map((field) => [
            field.dataset.flightLimit,
            Number(field.value) / limitScale(field.dataset.flightLimit),
          ])
        )
      );
      limitSignature = '';
      if (current) update(current);
      focus();
    },
    options
  );
  root.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('[data-flight-action]');
      if (!button || button.disabled) return;
      const action = button.dataset.flightAction;
      if (action === 'rcs-reset') rcsSignature = '';
      if (action === 'docking-reset') limitSignature = '';
      if (['exit', 'restore', 'resume', 'pause', 'dock', 'hold'].includes(action)) clearInput();
      onAction(action, button.dataset.flightView);
      if (!root.hidden && event.detail > 0) focus();
    },
    options
  );
  function pointerEnd(event) {
    if (pointers.delete(event.pointerId)) sendInput();
  }
  root.addEventListener(
    'pointerdown',
    (event) => {
      const button = event.target.closest('[data-flight-control]');
      if (!button || !canFly() || button.disabled || event.button !== 0) return;
      event.preventDefault();
      pointers.set(event.pointerId, button.dataset.flightControl);
      button.setPointerCapture(event.pointerId);
      focus();
      sendInput();
    },
    options
  );
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    root.addEventListener(name, pointerEnd, options);
  function keyDown(event) {
    if (
      root.hidden ||
      !current ||
      event.isComposing ||
      event.altKey ||
      event.metaKey ||
      event.ctrlKey
    )
      return;
    const target = event.target;
    if (target?.closest?.('input,select,textarea,[contenteditable="true"],dialog,summary')) return;
    if (
      target !== document.body &&
      target !== inputSurface &&
      !root.contains(target) &&
      !target?.closest?.('#freeFlightInstruments')
    )
      return;
    const action = keyToAction.get(event.code);
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) onAction(action);
      return;
    }
    if (!canFly()) return;
    const activation = event.code === 'Space' || event.code === 'Enter';
    const button = target?.closest?.('button');
    const id =
      activation && button
        ? button.dataset.flightControl
        : event.code === 'KeyF'
          ? 'temporarySas'
          : keyToControl.get(event.code);
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    if (buttonsByKey.get(id)?.disabled) return;
    if (!keys.has(event.code)) {
      keys.set(event.code, id);
      sendInput();
    }
  }
  function keyUp(event) {
    if (!keys.delete(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    sendInput();
  }
  const capture = { signal: abort.signal, capture: true };
  window.addEventListener('keydown', keyDown, capture);
  window.addEventListener('keyup', keyUp, capture);
  window.addEventListener('blur', clearInput, options);
  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target;
      if (
        target !== inputSurface &&
        (target?.closest?.('input,select,textarea,[contenteditable="true"],dialog,summary') ||
          !root.contains(target))
      )
        clearInput();
    },
    options
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) clearInput();
    },
    options
  );
  inputSurface?.addEventListener(
    'pointerdown',
    () => {
      if (!root.hidden) focus();
    },
    options
  );
  details.open = window.matchMedia('(pointer:coarse)').matches;
  return {
    root,
    update,
    clearInput,
    show(state) {
      root.hidden = false;
      update(state);
      focus();
    },
    hide() {
      clearInput();
      root.hidden = true;
    },
    dispose() {
      clearInput();
      abort.abort();
      unsubscribe();
      root.remove();
    },
  };
}
