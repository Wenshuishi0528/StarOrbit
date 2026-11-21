import { PILOT_KEY_AXES, pilotAxes } from './pilot-controls.js';
import {
  createGroundState,
  normalizeGroundSite,
  stepGroundMotion,
  wrapGroundAzimuth,
  GROUND_SPEEDS,
  groundSpeedLimit,
} from './ground-world-math.js';

// The active canvas owns navigation; text fields and inactive views never do.
// The application drives update(realElapsedSeconds) from its existing frame loop.
export function createGroundWorldInput({
  canvas,
  state = createGroundState(),
  sampleHeight,
  getFov = () => 65,
  enabled = () => true,
  fixedSite = () => false,
  restrictPitchToSky = fixedSite,
  onManualPoint = () => {},
  onChange = () => {},
}) {
  const doc = canvas.ownerDocument,
    win = doc.defaultView;
  const keys = new Set(),
    taps = new Set(),
    listeners = [];
  const tabIndex = canvas.getAttribute('tabindex');
  if (tabIndex === null) canvas.tabIndex = 0;
  let pointer = null,
    lastX = 0,
    lastY = 0,
    pointerLook,
    keyLook,
    disposed = false;
  const listen = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    listeners.push(() => target.removeEventListener(type, fn, options));
  };
  const active = () => !disposed && enabled() && !doc.hidden && doc.activeElement === canvas;
  function beginLook() {
    return { overPole: false, canCrossZenith: state.elevation === 90 };
  }
  function turnObserver(yaw, pitch, gesture) {
    const overPole = gesture.overPole;
    let angle = (overPole ? 180 - state.elevation : state.elevation) + pitch;
    if (restrictPitchToSky()) angle = Math.max(0, Math.min(180, angle));
    // A drag arriving at the zenith stops there. A new drag starting there may
    // pass through, while reversing the current drag moves away immediately.
    if (!gesture.canCrossZenith) angle = overPole ? Math.max(90, angle) : Math.min(90, angle);
    const wrapped = wrapGroundAzimuth(angle + 90) - 90;
    const nextOverPole = wrapped === 90 || wrapped === -90 ? overPole : wrapped > 90;
    state.azimuth = wrapGroundAzimuth(state.azimuth + yaw + (nextOverPole === overPole ? 0 : 180));
    state.elevation = wrapped > 90 ? 180 - wrapped : wrapped;
    state.rollDegrees = 0;
    gesture.overPole = nextOverPole;
    if (state.elevation !== 90) gesture.canCrossZenith = false;
  }
  function stop() {
    keys.clear();
    taps.clear();
    keyLook = null;
    state.velocity = [0, 0, 0];
    state.speedMps = 0;
    const id = pointer;
    pointer = null;
    if (id !== null && canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  }
  listen(canvas, 'keydown', (event) => {
    if (!active() || event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.code === 'Escape') {
      stop();
      canvas.blur();
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      stop();
      return;
    }
    if (!PILOT_KEY_AXES[event.code]) return;
    event.preventDefault();
    event.stopPropagation();
    keys.add(event.code);
    if (!event.repeat) taps.add(event.code);
  });
  listen(win, 'keyup', (event) => {
    keys.delete(event.code);
    if (PILOT_KEY_AXES[event.code]?.[0] === 'pitch') keyLook = null;
  });
  listen(canvas, 'blur', stop);
  listen(win, 'blur', stop);
  listen(doc, 'visibilitychange', () => {
    if (doc.hidden) stop();
  });
  listen(canvas, 'pointerdown', (event) => {
    if (!enabled() || disposed || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    pointer = event.pointerId;
    pointerLook = beginLook();
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture?.(pointer);
  });
  listen(canvas, 'pointermove', (event) => {
    if (pointer !== event.pointerId || !active()) return;
    const dx = event.clientX - lastX,
      dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (!dx && !dy) return;
    onManualPoint();
    const scale = 0.16 * (getFov() / 65);
    if (fixedSite()) {
      turnObserver(dx * scale, -dy * scale, pointerLook);
    } else {
      state.azimuth = wrapGroundAzimuth(state.azimuth + dx * scale);
      state.elevation = Math.max(-89.5, Math.min(89.5, state.elevation - dy * scale));
    }
    onChange(state);
  });
  const endPointer = (event) => {
    if (pointer !== event.pointerId) return;
    const id = pointer;
    pointer = null;
    if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  };
  listen(canvas, 'pointerup', endPointer);
  listen(canvas, 'pointercancel', () => stop());
  listen(canvas, 'lostpointercapture', () => {
    pointer = null;
  });
  return {
    state,
    update(dt) {
      if (disposed || !enabled()) {
        stop();
        return state;
      }
      if (!active()) {
        keys.clear();
        taps.clear();
        state.velocity = [0, 0, 0];
      }
      const held = new Set([...keys, ...taps]);
      const axes = pilotAxes(held),
        turnScale = getFov() / 65;
      if (fixedSite()) {
        axes.forward = axes.right = axes.up = 0;
        if (!axes.pitch) keyLook = null;
        if (axes.yaw || axes.pitch) {
          onManualPoint();
          const step = turnScale * 45 * Math.min(dt, 0.25);
          keyLook ??= beginLook();
          turnObserver(-axes.yaw * step, axes.pitch * step, keyLook);
        }
        axes.yaw = 0;
        axes.pitch = 0;
      }
      axes.yaw *= turnScale;
      axes.pitch *= turnScale;
      stepGroundMotion(state, axes, dt, sampleHeight);
      if (dt > 0) taps.clear();
      onChange(state);
      return state;
    },
    setSite(site) {
      stop();
      state.site = normalizeGroundSite(site);
      state.terrainHeight = null;
      state.terrainReady = false;
      stepGroundMotion(state, {}, 0, sampleHeight);
      onChange(state);
      return state;
    },
    setMode(mode) {
      stop();
      state.mode = mode === 'free' ? 'free' : 'grounded';
      stepGroundMotion(state, {}, 0, sampleHeight);
      onChange(state);
    },
    setSpeed(speed) {
      if (!Object.hasOwn(GROUND_SPEEDS, speed)) return;
      state.speed = speed;
      const magnitude = Math.hypot(...state.velocity),
        cap = groundSpeedLimit(state);
      if (magnitude > cap) state.velocity = state.velocity.map((v) => (v * cap) / magnitude);
      state.speedMps = Math.hypot(...state.velocity);
      onChange(state);
    },
    stop,
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      listeners.forEach((remove) => remove());
      if (tabIndex === null) canvas.removeAttribute('tabindex');
      else canvas.setAttribute('tabindex', tabIndex);
    },
  };
}
