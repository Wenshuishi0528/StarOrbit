import { createWindowSizer } from './window-sizing.js';

export const FLOATING_WINDOWS_KEY = 'starorbit-floating-windows-v1';
const MARGIN = 8;
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const interactive =
  'button,a,input,select,textarea,summary,[contenteditable="true"],[role="slider"]';
const definitions = [
  { id: 'telemetry', selector: '#telemetry', handle: '.clock' },
  { id: 'orbitMinimap', selector: '#orbitMinimap', handle: '.minimap-heading' },
  { id: 'xuntianScope', selector: '#xuntianScope', handle: '.xt-heading' },
  { id: 'musicWidget', selector: '#musicWidget', grip: 'music' },
  { id: 'musicPanel', selector: '#musicPanel', handle: '.music-panel-heading', flow: true },
  { id: 'dfh1Panel', selector: '#dfh1Panel', handle: '.music-panel-heading', flow: true },
  { id: 'musicVolumePanel', selector: '#musicVolumePanel', grip: 'inline', flow: true },
  {
    id: 'eventTimeline',
    selector: '#eventTimeline',
    handle: '.event-heading',
    grip: 'inline',
    flow: true,
  },
  {
    id: 'orbitEventDetail',
    selector: '#orbitEventDetail',
    handle: '.event-detail-heading',
    grip: 'inline',
  },
  {
    id: 'helpPanel',
    selector: '#helpPanel',
    handle: '.help-heading',
    enabled: (root) => !root.classList.contains('guiding'),
  },
  { id: 'attitudeNavballPanel', selector: '#attitudeNavballPanel', handle: '.an-heading' },
  { id: 'freeFlightPanel', selector: '#freeFlightPanel', handle: '.ff-head', flow: true },
  { id: 'spacecraftKeyGuide', selector: '#spacecraftKeyGuide', handle: '.pilot-guide-heading' },
  { id: 'freeFlightKeyGuide', selector: '#freeFlightKeyGuide', handle: '.pilot-guide-heading' },
  { id: 'interstellarKeyGuide', selector: '#interstellarKeyGuide', handle: '.pilot-guide-heading' },
  {
    id: 'freeFlightCameraWindow',
    selector: '#freeFlightCameraWindow',
    handle: '.ff-camera-heading',
  },
  { id: 'skyLocationWindow', selector: '#skyLocationWindow', handle: '.sky-tool-heading' },
  { id: 'skyObjectWindow', selector: '#skyObjectWindow', handle: '.sky-tool-heading' },
  { id: 'groundScope', selector: '.ground-scope-window', handle: '.ground-scope-bar' },
  {
    id: 'groundLocation',
    selector: '.ground-location-map',
    handle: '.ground-location-map-heading',
  },
  { id: 'interstellarMap', selector: '.interstellar-map', handle: '.map-header' },
  { id: 'interstellarPanel', selector: '.interstellar-panel', handle: 'h3' },
  { id: 'groundPanel', selector: '.world-ground-panel', sizingOnly: true },
  { id: 'solarPanel', selector: '.solar-world-panel', handle: 'h3' },
  { id: 'planetPanel', selector: '.planet-panel', sizingOnly: true },
  {
    id: 'flightNavigation',
    selector: '#freeFlightInstruments .ffi-navigation',
    handle: 'h3',
    flow: true,
  },
  {
    id: 'flightDocking',
    selector: '#freeFlightInstruments .ffi-docking',
    handle: 'h3',
    flow: true,
  },
];

function travel(size, viewport, margin = MARGIN) {
  const available = Math.max(0, finite(viewport) - Math.max(0, finite(size)));
  const minimum = Math.min(margin, available / 2);
  return { minimum, span: Math.max(0, available - 2 * minimum) };
}
export function clampFloatingPosition(rect, viewport) {
  const horizontal = travel(rect.width, viewport.width),
    vertical = travel(rect.height, viewport.height);
  return {
    left: clamp(finite(rect.left), horizontal.minimum, horizontal.minimum + horizontal.span),
    top: clamp(finite(rect.top), vertical.minimum, vertical.minimum + vertical.span),
  };
}
export function normalizeFloatingPosition(rect, viewport) {
  const position = clampFloatingPosition(rect, viewport),
    horizontal = travel(rect.width, viewport.width),
    vertical = travel(rect.height, viewport.height);
  return {
    x: horizontal.span ? (position.left - horizontal.minimum) / horizontal.span : 0,
    y: vertical.span ? (position.top - vertical.minimum) / vertical.span : 0,
  };
}
export function restoreFloatingPosition(position, rect, viewport) {
  const horizontal = travel(rect.width, viewport.width),
    vertical = travel(rect.height, viewport.height);
  return {
    left: horizontal.minimum + clamp(finite(position.x), 0, 1) * horizontal.span,
    top: vertical.minimum + clamp(finite(position.y), 0, 1) * vertical.span,
  };
}
export function sanitizeFloatingLayout(value) {
  const clean = { version: 1, windows: {} };
  if (value?.version !== 1 || !value.windows || typeof value.windows !== 'object') return clean;
  for (const id of Object.keys(value.windows)) {
    if (!definitions.some((entry) => entry.id === id) && !/^dialog-[\w-]{1,100}$/.test(id))
      continue;
    const position = value.windows[id];
    if (
      position &&
      Number.isFinite(position.x) &&
      Number.isFinite(position.y) &&
      position.x >= 0 &&
      position.x <= 1 &&
      position.y >= 0 &&
      position.y <= 1
    ) {
      clean.windows[id] = { x: position.x, y: position.y };
      for (const name of ['compact', 'wide', 'compactLarge', 'wideLarge']) {
        const input = position.sizes?.[name];
        if (!input) continue;
        const size = {};
        for (const axis of ['width', 'height']) {
          if (Number.isFinite(input[axis]) && input[axis] > 0 && input[axis] <= 32000)
            size[axis] = input[axis];
        }
        if (Object.keys(size).length) (clean.windows[id].sizes ??= {})[name] = size;
      }
    }
  }
  return clean;
}

// Existing layout remains untouched until a window is moved. Keeping every
// root in its original DOM parent preserves mode visibility and all controls.
export function installFloatingWindows({ t, onLanguageChange, storageKey = FLOATING_WINDOWS_KEY }) {
  let layout = sanitizeFloatingLayout(null);
  try {
    layout = sanitizeFloatingLayout(JSON.parse(localStorage.getItem(storageKey)));
  } catch {}
  const records = new Map(),
    abort = new AbortController(),
    options = { signal: abort.signal };
  const lock = document.getElementById('lockFloatingWindows'),
    resetButton = document.getElementById('resetFloatingWindows');
  const properties = [
    '--floating-left',
    '--floating-top',
    '--floating-width',
    '--floating-max-height',
    '--floating-layer',
  ];
  const instrumentRoot = document.getElementById('freeFlightInstruments');
  let drag = null,
    frame = 0,
    disposed = false,
    discovery = null,
    layer = 12;
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
  const isLocked = () => !!lock?.checked;
  const notify = () => document.dispatchEvent(new Event('floating-window-layout'));
  const sizeMode = (root) =>
    (window.innerWidth <= 760 ? 'compact' : 'wide') +
    (root.matches('.expanded,.dock-large,.compact-expanded') ? 'Large' : '');
  const sizer = createWindowSizer({
    t,
    allowed: (record) => enabled(record) && !isLocked(),
    begin(record) {
      raise(record);
      return structuredClone(layout.windows[record.definition.id] || null);
    },
    apply(record, rect, edge) {
      const id = record.definition.id;
      const saved = (layout.windows[id] ??= { x: 0, y: 0 });
      const sizes = (saved.sizes ??= {});
      const size = (sizes[sizeMode(record.root)] ??= {});
      if (/[we]/.test(edge)) size.width = rect.width;
      if (/[ns]/.test(edge)) size.height = rect.height;
      applySize(record, size);
      place(record, rect, { measure: false });
      Object.assign(
        saved,
        normalizeFloatingPosition(record.root.getBoundingClientRect(), viewport())
      );
      notify();
    },
    commit() {
      save();
      schedule();
    },
    cancel(record, previous) {
      if (previous) layout.windows[record.definition.id] = previous;
      else delete layout.windows[record.definition.id];
      refreshRecord(record);
    },
    reset(record) {
      delete layout.windows[record.definition.id];
      restoreStyle(record);
      save();
      notify();
    },
  });
  function applySize(record, size) {
    for (const axis of ['width', 'height']) {
      const key = '--floating-user-' + axis;
      record.root.toggleAttribute('data-user-' + axis, !!size?.[axis]);
      if (size?.[axis]) record.root.style.setProperty(key, size[axis] + 'px');
      else record.root.style.removeProperty(key);
    }
  }
  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {}
  };
  function enabled(record) {
    return !record.definition.enabled || record.definition.enabled(record.root);
  }
  function restoreStyle(record, { keepLayer = false } = {}) {
    const { root } = record;
    applySize(record, null);
    root.removeAttribute('data-floating-moved');
    root.removeAttribute('data-floating-width');
    root.removeAttribute('data-floating-constrained');
    if (!keepLayer) root.removeAttribute('data-floating-raised');
    for (const property of properties) {
      if (keepLayer && property === '--floating-layer') continue;
      const value = record.originalProperties[property];
      if (value) root.style.setProperty(property, value);
      else root.style.removeProperty(property);
    }
  }
  function raise(record) {
    const next = String(++layer);
    for (const root of [
      record.root,
      record.root.parentElement?.closest('[data-floating-window],#freeFlightInstruments'),
    ].filter(Boolean)) {
      root.style.setProperty('--floating-layer', next);
      root.setAttribute('data-floating-raised', '');
    }
  }
  function naturalSize(record) {
    const { root } = record,
      moved = root.hasAttribute('data-floating-moved');
    root.removeAttribute('data-floating-moved');
    const rect = root.getBoundingClientRect();
    if (rect.width && rect.height) {
      record.naturalHeight = rect.height;
      const max = getComputedStyle(root).maxHeight;
      root.style.setProperty('--floating-max-height', max === 'none' ? '100000px' : max);
      if (record.definition.flow) {
        root.style.setProperty('--floating-width', rect.width + 'px');
        root.setAttribute('data-floating-width', '');
      }
    }
    if (moved) root.setAttribute('data-floating-moved', '');
    return rect;
  }
  function place(record, position, { measure = true } = {}) {
    const { root } = record;
    if (measure) naturalSize(record);
    root.setAttribute('data-floating-moved', '');
    const rect = root.getBoundingClientRect(),
      bounded = clampFloatingPosition(
        { width: rect.width, height: rect.height, left: position.left, top: position.top },
        viewport()
      );
    root.style.setProperty('--floating-left', bounded.left + 'px');
    root.style.setProperty('--floating-top', bounded.top + 'px');
    root.toggleAttribute(
      'data-floating-constrained',
      record.naturalHeight > window.innerHeight - 2 * MARGIN
    );
  }
  function refreshRecord(record) {
    if (drag?.record === record) return;
    const { root } = record,
      saved = layout.windows[record.definition.id];
    if (!enabled(record)) {
      restoreStyle(record);
      return;
    }
    if (!root.getClientRects().length) return;
    if (saved) {
      applySize(record, saved.sizes?.[sizeMode(root)]);
      const natural = naturalSize(record);
      if (!natural.width || !natural.height) return;
      root.setAttribute('data-floating-moved', '');
      const rect = root.getBoundingClientRect();
      place(record, restoreFloatingPosition(saved, rect, viewport()), { measure: false });
    } else if (root.parentElement?.closest('[data-floating-moved]')) {
      // A playlist or event popover still attached to a moved parent may open
      // beyond an edge. Keep it reachable without saving a new user placement.
      restoreStyle(record, { keepLayer: true });
      const rect = root.getBoundingClientRect(),
        bounded = clampFloatingPosition(rect, viewport());
      if (Math.abs(rect.left - bounded.left) > 0.5 || Math.abs(rect.top - bounded.top) > 0.5)
        place(record, bounded);
    } else restoreStyle(record, { keepLayer: true });
  }
  function updateHandles() {
    document.body.classList.toggle('floating-windows-locked', isLocked());
    for (const record of records.values()) {
      sizer.update(record);
      for (const handle of record.handles) {
        const unavailable = isLocked() || !enabled(record);
        handle.title = t(
          unavailable ? '窗口位置已锁定' : '拖动移动窗口；Alt + 方向键微调，Alt + Home 复位。'
        );
        handle.setAttribute('aria-disabled', String(unavailable));
        if (handle.classList.contains('floating-drag-grip'))
          handle.setAttribute('aria-label', t('移动窗口'));
      }
    }
    sizer.sync();
  }
  function schedule() {
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (disposed) return;
      for (const record of records.values()) refreshRecord(record);
      updateHandles();
      notify();
    });
  }
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  const mutations = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
  function finish(cancelled = false) {
    if (!drag) return;
    const current = drag;
    drag = null;
    const { record, handle, pointerId } = current;
    record.root.classList.remove('floating-is-dragging');
    try {
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    } catch {}
    if (!current.active) return;
    record.suppressClick = performance.now() + 350;
    if (cancelled) {
      restoreStyle(record);
      refreshRecord(record);
    } else {
      savePosition(record);
      save();
    }
    for (const other of records.values()) if (other !== record) refreshRecord(other);
    notify();
  }
  function savePosition(record) {
    const id = record.definition.id;
    layout.windows[id] = {
      ...layout.windows[id],
      ...normalizeFloatingPosition(record.root.getBoundingClientRect(), viewport()),
    };
  }
  function pointerDown(event, record, handle) {
    if (
      drag ||
      isLocked() ||
      !enabled(record) ||
      event.button !== 0 ||
      event.isPrimary === false ||
      event.target.closest(interactive)
    )
      return;
    const rect = record.root.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    raise(record);
    event.preventDefault();
    event.stopPropagation();
    drag = {
      record,
      handle,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
      active: false,
    };
    handle.focus({ preventScroll: true });
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {}
  }
  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (!drag.active && Math.hypot(dx, dy) < 4) return;
    if (!drag.active) {
      drag.active = true;
      drag.record.root.classList.add('floating-is-dragging');
      naturalSize(drag.record);
    }
    event.preventDefault();
    event.stopPropagation();
    place(drag.record, { left: drag.left + dx, top: drag.top + dy }, { measure: false });
  }
  function keyDown(event, record) {
    if (
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isLocked() ||
      !enabled(record) ||
      event.target.closest(interactive)
    )
      return;
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (event.code !== 'Home' && !directions[event.code]) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Home') {
      delete layout.windows[record.definition.id];
      restoreStyle(record);
    } else {
      raise(record);
      const rect = record.root.getBoundingClientRect(),
        delta = directions[event.code],
        step = event.shiftKey ? 40 : 8;
      place(record, { left: rect.left + delta[0] * step, top: rect.top + delta[1] * step });
      savePosition(record);
    }
    save();
    notify();
  }
  function register(definition, root) {
    const container = definition.handle ? root.querySelector(definition.handle) : root;
    if (!container) return false;
    const record = {
      definition,
      root,
      handles: [],
      originalHandles: [],
      injected: null,
      suppressClick: 0,
      originalProperties: Object.fromEntries(
        properties.map((key) => [key, root.style.getPropertyValue(key)])
      ),
    };
    if (definition.grip) {
      const grip = document.createElement('span');
      grip.className =
        'floating-drag-grip' + (definition.grip === 'music' ? ' floating-music-grip' : '');
      grip.textContent = '⠿';
      grip.setAttribute('role', 'button');
      container.prepend(grip);
      record.injected = grip;
      record.handles.push(grip);
    }
    if (definition.handle) record.handles.push(container);
    for (const handle of record.handles) {
      record.originalHandles.push({
        handle,
        attributes: Object.fromEntries(
          ['title', 'tabindex', 'aria-disabled', 'aria-keyshortcuts'].map((key) => [
            key,
            handle.getAttribute(key),
          ])
        ),
      });
      handle.setAttribute('data-floating-handle', '');
      if (!handle.hasAttribute('tabindex')) handle.tabIndex = 0;
      handle.setAttribute(
        'aria-keyshortcuts',
        'Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Home'
      );
      handle.addEventListener(
        'pointerdown',
        (event) => pointerDown(event, record, handle),
        options
      );
      handle.addEventListener('keydown', (event) => keyDown(event, record), options);
      handle.addEventListener(
        'click',
        (event) => {
          if (performance.now() < record.suppressClick && !event.target.closest(interactive)) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        },
        { ...options, capture: true }
      );
    }
    root.setAttribute('data-floating-window', definition.id);
    sizer.install(record);
    records.set(definition.id, record);
    resize?.observe(root);
    mutations?.observe(root, { attributes: true, attributeFilter: ['hidden', 'class', 'open'] });
    return true;
  }
  const candidates = definitions
    .map((def) => def.selector)
    .concat('dialog')
    .join(',');
  function registerRoot(root) {
    if (root.hasAttribute('data-floating-window')) return false;
    let definition = definitions.find((def) => root.matches(def.selector));
    if (!definition && root.tagName === 'DIALOG') {
      const key = root.id || root.getAttribute('aria-labelledby') || root.classList[0];
      if (!key) return false;
      definition = { id: 'dialog-' + key.replace(/[^\w-]/g, '-'), sizingOnly: true };
    }
    if (!definition) return false;
    const previous = records.get(definition.id);
    if (previous?.root.isConnected) return false;
    return register(definition, root);
  }
  function discover() {
    for (const root of document.querySelectorAll(candidates)) registerRoot(root);
  }
  function reset() {
    finish(true);
    sizer.close();
    layout = { version: 1, windows: {} };
    for (const record of records.values()) restoreStyle(record);
    instrumentRoot?.removeAttribute('data-floating-raised');
    instrumentRoot?.style.removeProperty('--floating-layer');
    layer = 12;
    save();
    notify();
  }
  discover();
  // World views and native dialogs are mounted on demand and can be recreated.
  if (typeof MutationObserver === 'function') {
    discovery = new MutationObserver((changes) => {
      let changed = false;
      for (const change of changes) {
        for (const element of change.addedNodes) {
          if (element.nodeType !== 1 || !element.isConnected) continue;
          if (element.matches(candidates)) changed = registerRoot(element) || changed;
          if (element.childElementCount)
            for (const root of element.querySelectorAll(candidates))
              changed = registerRoot(root) || changed;
        }
      }
      for (const [id, record] of records) {
        if (!record.root.isConnected) {
          resize?.unobserve(record.root);
          records.delete(id);
          changed = true;
        } else if (!record.sizeButton.isConnected) {
          sizer.update(record);
          changed = true;
        }
      }
      if (changed) schedule();
    });
    discovery.observe(document.body, { childList: true, subtree: true });
  }
  document.addEventListener('pointermove', pointerMove, { ...options, passive: false });
  document.addEventListener(
    'pointerup',
    (event) => {
      if (event.pointerId === drag?.pointerId) finish();
    },
    options
  );
  document.addEventListener(
    'pointercancel',
    (event) => {
      if (event.pointerId === drag?.pointerId) finish(true);
    },
    options
  );
  document.addEventListener(
    'lostpointercapture',
    (event) => {
      if (event.pointerId === drag?.pointerId) finish(true);
    },
    options
  );
  window.addEventListener('blur', () => finish(true), options);
  window.addEventListener('resize', schedule, options);
  lock?.addEventListener(
    'change',
    () => {
      finish(true);
      updateHandles();
    },
    options
  );
  resetButton?.addEventListener('click', reset, options);
  mutations?.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const unsubscribe = onLanguageChange?.(updateHandles);
  updateHandles();
  schedule();
  return {
    refresh() {
      discover();
      updateHandles();
      schedule();
    },
    reset,
    resizeWindow(id, change, { anchor = 'left' } = {}) {
      const record = records.get(id);
      if (!record || !record.root.getClientRects().length) {
        change();
        return;
      }
      const before = record.root.getBoundingClientRect();
      change();
      // A collapsed panel should keep its title under the pointer, including
      // windows whose untouched CSS originally anchored them to the bottom.
      const after = record.root.getBoundingClientRect();
      place(record, {
        left: anchor === 'right' ? before.right - after.width : before.left,
        top: before.top,
      });
      savePosition(record);
      save();
      notify();
    },
    dispose() {
      if (disposed) return;
      finish(true);
      disposed = true;
      abort.abort();
      resize?.disconnect();
      mutations?.disconnect();
      discovery?.disconnect();
      sizer.dispose();
      unsubscribe?.();
      if (frame) cancelAnimationFrame(frame);
      for (const record of records.values()) {
        restoreStyle(record);
        record.root.removeAttribute('data-floating-window');
        for (const { handle, attributes } of record.originalHandles) {
          handle.removeAttribute('data-floating-handle');
          for (const [key, value] of Object.entries(attributes))
            value === null ? handle.removeAttribute(key) : handle.setAttribute(key, value);
        }
        record.injected?.remove();
        record.sizeButton?.remove();
      }
      document.body.classList.remove('floating-windows-locked');
      instrumentRoot?.removeAttribute('data-floating-raised');
      instrumentRoot?.style.removeProperty('--floating-layer');
    },
  };
}
