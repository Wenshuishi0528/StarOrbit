import { PHOTO_ASPECT } from './exposure-lab-math.js';
import { PILOT_KEY_AXES, pilotAxes } from './pilot-controls.js';

const motionCodes = new Set(Object.keys(PILOT_KEY_AXES));
const TURN_SPEED = 40,
  ROLL_SPEED = 50,
  MOVE_SPEED = 9;

// Only the opted-in, pointer-focused canvas owns movement keys. Releasing the
// canvas clears held keys and deltas before another control or dialog can use them.
export function mountExposureViewfinderControls({
  canvas,
  toggle,
  available,
  readFov,
  onMove,
  onIdle,
  onCapture,
  onState,
}) {
  let captured = false,
    pointer = null,
    lastX = 0,
    lastY = 0,
    dx = 0,
    dy = 0,
    frame = 0,
    lastWall = 0,
    dirty = false,
    disposed = false;
  const keys = new Set(),
    unsampled = new Set(),
    listeners = [];
  const listen = (target, event, fn, options) => {
    target.addEventListener(event, fn, options);
    listeners.push([target, event, fn, options]);
  };
  function publish() {
    const state = !toggle.checked ? 'off' : captured ? 'active' : 'ready';
    canvas.dataset.freeState = state;
    canvas.dataset.freeDragging = String(pointer !== null);
    onState(state);
  }
  function idle() {
    if (dirty) {
      dirty = false;
      onIdle();
    }
  }
  function release(settle = true) {
    const id = pointer;
    pointer = null;
    captured = false;
    keys.clear();
    unsampled.clear();
    dx = dy = 0;
    lastWall = 0;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    if (document.activeElement === canvas) canvas.blur();
    if (settle) idle();
    else dirty = false;
    publish();
  }
  function schedule() {
    if (!frame && captured) {
      if (!lastWall) lastWall = performance.now();
      frame = requestAnimationFrame(step);
    }
  }
  function step(now) {
    frame = 0;
    if (!captured) return;
    if (document.hidden || document.activeElement !== canvas || !available()) {
      release(false);
      return;
    }
    const dt = Math.min(0.06, Math.max(0, now - lastWall) / 1000);
    lastWall = now;
    const box = canvas.getBoundingClientRect(),
      fov = readFov();
    const horizontalFov =
      (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * PHOTO_ASPECT) * 180) / Math.PI;
    const axes = pilotAxes(keys),
      yaw = axes.yaw * TURN_SPEED * dt - (dx * horizontalFov) / Math.max(1, box.width);
    const pitch = axes.pitch * TURN_SPEED * dt - (dy * fov) / Math.max(1, box.height),
      roll = axes.roll * ROLL_SPEED * dt;
    const f = axes.forward,
      u = axes.up,
      r = axes.right;
    const metres = (MOVE_SPEED * dt) / Math.max(1, Math.hypot(f, u, r));
    dx = dy = 0;
    unsampled.clear();
    if (yaw || pitch || roll || f || u || r) {
      dirty = true;
      onMove({ yaw, pitch, roll, forward: f * metres, lift: u * metres, right: r * metres });
    }
    if (keys.size) schedule();
    else {
      lastWall = 0;
      if (pointer === null) idle();
    }
  }
  listen(toggle, 'change', () => {
    release(false);
    if (toggle.checked && available()) onIdle();
  });
  listen(canvas, 'pointerdown', (e) => {
    if (!toggle.checked || !available() || !e.isPrimary || e.button !== 0 || pointer !== null)
      return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    const entering = !captured;
    captured = true;
    pointer = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(pointer);
    publish();
    if (entering) onCapture();
  });
  listen(canvas, 'pointermove', (e) => {
    if (pointer === null || pointer !== e.pointerId || !captured) return;
    dx += e.clientX - lastX;
    dy += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    e.preventDefault();
    schedule();
  });
  function finishDrag(e) {
    if (pointer === null || pointer !== e.pointerId) return;
    if (e.type === 'pointerup') {
      dx += e.clientX - lastX;
      dy += e.clientY - lastY;
    }
    const id = pointer;
    pointer = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    publish();
    if (dx || dy || keys.size) schedule();
    else if (!frame) idle();
  }
  listen(canvas, 'pointerup', finishDrag);
  listen(canvas, 'lostpointercapture', finishDrag);
  listen(canvas, 'pointercancel', () => release());
  listen(canvas, 'keydown', (e) => {
    if (!captured || e.target !== canvas || e.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      release();
      return;
    }
    if (e.metaKey || e.altKey || (e.ctrlKey && !e.code.startsWith('Control'))) {
      release();
      return;
    }
    if (!motionCodes.has(e.code)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!keys.has(e.code)) unsampled.add(e.code);
    keys.add(e.code);
    schedule();
  });
  listen(canvas, 'keyup', (e) => {
    if (!captured || !keys.has(e.code)) return;
    e.preventDefault();
    e.stopPropagation();
    // A complete tap can fall between two animation frames. Integrate its short
    // movement before dropping the key, once only even with OS repeat events.
    if (unsampled.has(e.code)) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      step(Math.max(performance.now(), lastWall + 16));
    }
    keys.delete(e.code);
    unsampled.delete(e.code);
    if (!keys.size && pointer === null && !frame) idle();
  });
  listen(canvas, 'blur', () => {
    if (captured) release();
  });
  listen(
    document,
    'pointerdown',
    (e) => {
      if (captured && e.target !== canvas) release();
    },
    true
  );
  listen(window, 'blur', () => {
    if (captured) release(false);
  });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) release(false);
  });
  canvas.tabIndex = -1;
  publish();
  return {
    release,
    refresh() {
      if (!disposed) publish();
    },
    get captured() {
      return captured;
    },
    dispose() {
      disposed = true;
      release(false);
      for (const [target, event, fn, options] of listeners)
        target.removeEventListener(event, fn, options);
    },
  };
}
