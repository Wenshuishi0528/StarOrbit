const margin = 8;
const clamp = (value, min, max) => Math.max(Math.min(min, max), Math.min(value, max));
const directions = ['w', 'e', 'n', 's', 'nw', 'ne', 'sw', 'se'];

// Use screen pixels so dragging an edge keeps its opposite edge in place.
export function resizeBounds(rect, edge, dx, dy, viewport, minimum = { width: 160, height: 72 }) {
  const maxX = Math.max(margin + 1, viewport.width - margin);
  const maxY = Math.max(margin + 1, viewport.height - margin);
  let left = clamp(rect.left, margin, maxX - 1);
  let top = clamp(rect.top, margin, maxY - 1);
  let right = clamp(rect.right, left + 1, maxX);
  let bottom = clamp(rect.bottom, top + 1, maxY);
  if (edge.includes('w')) left = clamp(left + dx, margin, Math.max(margin, right - minimum.width));
  if (edge.includes('e')) right = clamp(right + dx, left + minimum.width, maxX);
  if (edge.includes('n')) top = clamp(top + dy, margin, Math.max(margin, bottom - minimum.height));
  if (edge.includes('s')) bottom = clamp(bottom + dy, top + minimum.height, maxY);
  return { left, top, width: right - left, height: bottom - top };
}

function makeButton(className, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  if (label) button.textContent = label;
  return button;
}

const headerSelector = [
  '.help-heading-row',
  '.xt-heading',
  '.ff-head',
  '.pilot-guide-heading',
  '.ff-camera-heading',
  '.sky-tool-heading',
  '.an-heading',
  '.minimap-heading',
  '.music-panel-heading',
  '.event-heading',
  '.event-detail-heading',
  '.map-header',
  '.ground-scope-bar',
  '.ground-location-map-heading',
  '.gsm-heading',
  '.flight-lab-head',
  '.ff-launch-head',
  '.obs-journal-head',
  '.sig-head',
  '.survey-product-head',
  '.resource-heading',
  '.version-heading',
  '.birthday-head',
].join(',');

// One overlay supplies the edge handles to the currently selected window, including native dialogs.
export function createWindowSizer({ begin, apply, commit, cancel, reset, allowed, t }) {
  let current = null,
    gesture = null,
    overlay = null,
    controls = null;
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const viewport = () => ({ width: innerWidth, height: innerHeight });

  function sync() {
    if (!current) return;
    const { root } = current;
    if (!root.isConnected || !root.getClientRects().length || !allowed(current)) {
      close();
      return;
    }
    const rect = root.getBoundingClientRect();
    Object.assign(overlay.style, {
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
    controls.setAttribute('aria-label', t('调整窗口大小'));
    controls.children[0].textContent = t('紧凑');
    controls.children[1].textContent = t('展开窗口');
    controls.children[2].textContent = t('复位');
    controls.children[3].textContent = t('完成');
    const handle = current.sizeButton;
    handle.title = t('拖动边缘或角调整大小，方向键微调，Esc 完成。');
    handle.setAttribute('aria-label', t('完成调整大小'));
  }
  function endGesture(abandon = false) {
    if (!gesture || !current) return;
    const { handle, pointerId, snapshot } = gesture;
    gesture = null;
    if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
    if (abandon) cancel(current, snapshot);
    else commit(current);
    sync();
  }
  function close(focus = false) {
    if (!current) return;
    const previous = current;
    if (gesture) endGesture(false);
    current = null;
    overlay?.remove();
    overlay = controls = null;
    previous.sizeButton.setAttribute('aria-pressed', 'false');
    previous.sizeButton.setAttribute('aria-label', t('调整窗口大小'));
    previous.sizeButton.title = t('调整窗口大小');
    if (focus && previous.root.isConnected) previous.sizeButton.focus({ preventScroll: true });
  }
  function open(record) {
    if (current === record) return close(true);
    close();
    if (!allowed(record)) return;
    current = record;
    record.sizeButton.setAttribute('aria-pressed', 'true');
    overlay = document.createElement('div');
    overlay.className = 'floating-size-overlay';
    for (const edge of directions) {
      const handle = document.createElement('span');
      handle.dataset.sizeEdge = edge;
      handle.setAttribute('aria-hidden', 'true');
      handle.onpointerdown = (event) => {
        if (event.button !== 0 || event.isPrimary === false || gesture) return;
        event.preventDefault();
        event.stopPropagation();
        gesture = {
          edge,
          handle,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          rect: record.root.getBoundingClientRect(),
          snapshot: begin(record),
        };
        handle.setPointerCapture(event.pointerId);
      };
      handle.onlostpointercapture = () => endGesture(true);
      overlay.append(handle);
    }
    controls = document.createElement('div');
    controls.className = 'floating-size-presets';
    controls.setAttribute('role', 'group');
    for (const fraction of [0.45, 0.9]) {
      const button = makeButton('');
      button.onclick = () => {
        const view = viewport(),
          rect = record.root.getBoundingClientRect();
        const width = Math.min(
          view.width - 2 * margin,
          Math.max(220, Math.round(view.width * fraction))
        );
        const height = Math.min(
          view.height - 2 * margin,
          Math.max(120, Math.round(view.height * fraction))
        );
        begin(record);
        apply(
          record,
          {
            left: clamp(rect.left, margin, view.width - margin - width),
            top: clamp(rect.top, margin, view.height - margin - height),
            width,
            height,
          },
          'se'
        );
        commit(record);
        sync();
      };
      controls.append(button);
    }
    const restore = makeButton(''),
      done = makeButton('');
    restore.onclick = () => {
      reset(record);
      sync();
    };
    done.onclick = () => close(true);
    controls.append(restore, done);
    overlay.append(controls);
    (record.root.closest('dialog[open]') || document.body).append(overlay);
    sync();
    record.sizeButton.focus({ preventScroll: true });
  }
  function install(record) {
    const root = record.root;
    const button = makeButton('floating-size-button', '⤡');
    button.setAttribute('aria-pressed', 'false');
    const header = root.querySelector(headerSelector);
    if (header && !header.closest('button,summary')) {
      const last = header.lastElementChild;
      header.insertBefore(button, last?.tagName === 'BUTTON' ? last : null);
    } else {
      button.classList.add('floating-size-corner');
      root.append(button);
    }
    button.onclick = (event) => {
      event.stopPropagation();
      open(record);
    };
    record.sizeButton = button;
  }
  function update(record) {
    if (!record.root.contains(record.sizeButton)) {
      if (current === record) close();
      install(record);
    }
    const button = record.sizeButton;
    button.disabled = !allowed(record);
    if (record !== current) {
      button.title = t('调整窗口大小');
      button.setAttribute('aria-label', button.title);
    }
  }
  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerId !== gesture?.pointerId) return;
      const { edge, rect, x, y } = gesture;
      event.preventDefault();
      apply(
        current,
        resizeBounds(rect, edge, event.clientX - x, event.clientY - y, viewport()),
        edge
      );
      sync();
    },
    { ...options, passive: false }
  );
  window.addEventListener(
    'pointerup',
    (event) => {
      if (event.pointerId === gesture?.pointerId) endGesture();
    },
    options
  );
  window.addEventListener(
    'pointercancel',
    (event) => {
      if (event.pointerId === gesture?.pointerId) endGesture(true);
    },
    options
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (current && !overlay.contains(event.target) && !current.sizeButton.contains(event.target))
        close();
    },
    { ...options, capture: true }
  );
  window.addEventListener(
    'blur',
    () => {
      endGesture(true);
      close();
    },
    options
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (!current || !(event.key === 'Escape' || event.target === current.sizeButton)) return;
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        event.preventDefault();
        endGesture(true);
        close(true);
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Home') {
        reset(current);
        sync();
        return;
      }
      const step = event.shiftKey ? 40 : 8;
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const delta = step * (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1);
      const rect = current.root.getBoundingClientRect(),
        view = viewport();
      const edge = horizontal
        ? rect.right + delta > view.width - margin
          ? 'w'
          : 'e'
        : rect.bottom + delta > view.height - margin
          ? 'n'
          : 's';
      const sign = ['w', 'n'].includes(edge) ? -1 : 1;
      begin(current);
      apply(
        current,
        resizeBounds(
          rect,
          edge,
          horizontal ? sign * delta : 0,
          horizontal ? 0 : sign * delta,
          view
        ),
        edge
      );
      commit(current);
      sync();
    },
    { ...options, capture: true }
  );
  return {
    install,
    update,
    sync,
    close,
    dispose() {
      close();
      controller.abort();
    },
  };
}
