import { PILOT_KEY_AXES } from './pilot-controls.js';

// Wheel deltas may be expressed in pixels, lines, or pages. Trackpad pinch
// arrives as a Ctrl+pixel wheel in browsers without touch pointer events.
export function scopeWheelLogDelta(event, height = 1) {
  if (!Number.isFinite(event?.deltaY)) return 0;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, height) : 1;
  return -event.deltaY * unit * (event.ctrlKey && !event.deltaMode ? 0.01 : 0.002);
}

// The telescope owns steering only while its eyepiece is focused.
export function mountScopeInput(
  canvas,
  { nudge, zoom, field, cameraField, roll = () => {}, logZoom = false }
) {
  const held = new Map(),
    points = new Map();
  const events = new AbortController(),
    doc = canvas.ownerDocument || document,
    win = doc.defaultView || window;
  const listen = (target, name, handler, options) =>
    target.addEventListener(name, handler, { ...options, signal: events.signal });
  const rolls = Object.fromEntries(
    Object.entries(PILOT_KEY_AXES)
      .filter(([, axis]) => axis[0] === 'roll')
      .map(([key, [, sign]]) => [key, sign])
  );
  const directions = {
    ...Object.fromEntries(
      Object.entries(PILOT_KEY_AXES)
        .filter(([, axis]) => ['pitch', 'yaw'].includes(axis[0]))
        .map(([key, [axis, sign]]) => [key, axis === 'pitch' ? [0, sign] : [-sign, 0]])
    ),
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  };
  let gestureScale = null;
  const clear = () => {
    held.clear();
    for (const id of points.keys())
      if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    points.clear();
    gestureScale = null;
    canvas.classList.remove('dragging');
  };
  listen(canvas, 'pointerdown', (e) => {
    if (e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    points.set(e.pointerId, [e.clientX, e.clientY]);
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
    e.preventDefault();
  });
  listen(canvas, 'pointermove', (e) => {
    const old = points.get(e.pointerId);
    if (!old) return;
    const next = [e.clientX, e.clientY];
    if (points.size === 2) {
      const other = Array.from(points).find(([id]) => id !== e.pointerId)[1];
      const before = Math.hypot(old[0] - other[0], old[1] - other[1]),
        after = Math.hypot(next[0] - other[0], next[1] - other[1]);
      if (before > 6 && after > 6) zoom(Math.log(after / before) * (logZoom ? 1 : 0.2));
    } else if (points.size === 1) {
      const dx = old[0] - next[0],
        dy = next[1] - old[1],
        height = Math.max(1, canvas.clientHeight);
      if (dx || dy) {
        if (cameraField) {
          const degree = Math.PI / 180,
            tangent = (2 * Math.tan((cameraField() * degree) / 2)) / height;
          const right = Math.atan(dx * tangent);
          nudge(right / degree, Math.atan(dy * tangent * Math.cos(right)) / degree);
        } else {
          const scale = field() / height;
          nudge(dx * scale, dy * scale);
        }
      }
    }
    points.set(e.pointerId, next);
  });
  const end = (e) => {
    points.delete(e.pointerId);
    if (!points.size) canvas.classList.remove('dragging');
  };
  for (const k of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(canvas, k, end);
  listen(
    canvas,
    'wheel',
    (e) => {
      e.preventDefault();
      if (logZoom && e.ctrlKey && (gestureScale !== null || points.size > 1)) return;
      const delta = logZoom
        ? scopeWheelLogDelta(e, canvas.clientHeight)
        : -Math.sign(e.deltaY) * 0.035;
      if (delta) zoom(delta);
    },
    { passive: false }
  );
  if (logZoom) {
    listen(
      canvas,
      'gesturestart',
      (e) => {
        e.preventDefault();
        gestureScale = e.scale > 0 ? e.scale : 1;
      },
      { passive: false }
    );
    listen(
      canvas,
      'gesturechange',
      (e) => {
        e.preventDefault();
        if (gestureScale !== null && e.scale > 0) {
          if (points.size < 2) zoom(Math.log(e.scale / gestureScale));
          gestureScale = e.scale;
        }
      },
      { passive: false }
    );
    listen(canvas, 'gestureend', () => {
      gestureScale = null;
    });
  }
  listen(canvas, 'keydown', (e) => {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      canvas.blur();
      return;
    }
    if (directions[e.code] || rolls[e.code]) {
      e.preventDefault();
      e.stopPropagation();
      if (!held.has(e.code)) held.set(e.code, false);
    }
  });
  listen(canvas, 'keyup', (e) => {
    const direction = directions[e.code],
      rotation = rolls[e.code];
    if (!direction && !rotation) return;
    // A quick tap can begin and end between two animation frames, especially
    // when rendering Earth. Only supply a discrete step if no frame handled it.
    if (held.get(e.code) === false && doc.activeElement === canvas) {
      if (direction) {
        const step = Math.min(2, field() * 0.045);
        nudge(direction[0] * step, direction[1] * step);
      } else roll(rotation * 5);
    }
    held.delete(e.code);
    e.stopPropagation();
  });
  listen(canvas, 'blur', clear);
  listen(win, 'blur', clear);
  listen(doc, 'visibilitychange', clear);
  return {
    clear,
    dispose() {
      events.abort();
      clear();
    },
    step(dt) {
      if (!held.size || dt <= 0 || doc.activeElement !== canvas) return;
      const [x, y, r] = Array.from(held.keys()).reduce(
        ([a, b, c], k) => [
          a + (directions[k]?.[0] || 0),
          b + (directions[k]?.[1] || 0),
          c + (rolls[k] || 0),
        ],
        [0, 0, 0]
      );
      for (const key of held.keys()) held.set(key, true);
      if (r) roll(r * 60 * dt);
      if (x || y) {
        const s = (field() * 0.65 * dt) / Math.hypot(x, y);
        nudge(x * s, y * s);
      }
    },
  };
}
