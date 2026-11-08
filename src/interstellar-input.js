import * as THREE from 'three';
import { PILOT_KEY_AXES, pilotAxes } from './pilot-controls.js';

export function createInterstellarInput({
  canvas,
  camera,
  onNavigate = () => {},
  onWheel = () => {},
}) {
  const doc = canvas.ownerDocument,
    win = doc.defaultView,
    keys = new Set(),
    taps = new Set(),
    listeners = [];
  const previousTabIndex = canvas.getAttribute('tabindex');
  canvas.tabIndex = 0;
  let pointer = null,
    x = 0,
    y = 0;
  const listen = (target, event, callback, options) => {
    target.addEventListener(event, callback, options);
    listeners.push(() => target.removeEventListener(event, callback, options));
  };
  const stop = () => {
    keys.clear();
    taps.clear();
    const id = pointer;
    pointer = null;
    if (id !== null && canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  };
  listen(canvas, 'keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (PILOT_KEY_AXES[e.code] || e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Space') {
        keys.clear();
        taps.clear();
      } else {
        keys.add(e.code);
        if (!e.repeat) taps.add(e.code);
      }
      onNavigate(e.code === 'Space');
    }
    if (e.code === 'Escape') {
      stop();
      onNavigate(true);
      canvas.blur();
    }
  });
  listen(win, 'keyup', (e) => keys.delete(e.code));
  listen(canvas, 'blur', () => {
    stop();
    onNavigate(true);
  });
  listen(win, 'blur', () => {
    stop();
    onNavigate(true);
  });
  listen(doc, 'visibilitychange', () => {
    if (doc.hidden) {
      stop();
      onNavigate(true);
    }
  });
  listen(canvas, 'pointerdown', (e) => {
    if (e.button !== 0 || e.isPrimary === false) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    onNavigate(false);
    pointer = e.pointerId;
    x = e.clientX;
    y = e.clientY;
    canvas.setPointerCapture?.(pointer);
  });
  listen(canvas, 'pointermove', (e) => {
    if (pointer !== e.pointerId) return;
    const angularScale = Math.min(1, camera.fov / 65);
    camera.rotateY(-(e.clientX - x) * 0.003 * angularScale);
    camera.rotateX(-(e.clientY - y) * 0.003 * angularScale);
    x = e.clientX;
    y = e.clientY;
  });
  listen(canvas, 'pointerup', (event) => {
    if (pointer !== event.pointerId) return;
    const id = pointer;
    pointer = null;
    if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  });
  listen(canvas, 'pointercancel', stop);
  listen(canvas, 'lostpointercapture', () => {
    pointer = null;
  });
  listen(
    canvas,
    'wheel',
    (e) => {
      e.preventDefault();
      onWheel(e.deltaY);
    },
    { passive: false }
  );
  const direction = new THREE.Vector3();
  return {
    update(dt) {
      if (doc.hidden || doc.activeElement !== canvas) {
        keys.clear();
        taps.clear();
      }
      const a = pilotAxes(new Set([...keys, ...taps])),
        turn = Math.min(0.1, Math.max(0, dt)) * 0.75 * Math.min(1, camera.fov / 65);
      if (dt > 0) taps.clear();
      camera.rotateX(a.pitch * turn);
      camera.rotateY(a.yaw * turn);
      camera.rotateZ(-a.roll * turn);
      return direction
        .set(a.right, a.up, -a.forward)
        .normalize()
        .applyQuaternion(camera.quaternion)
        .toArray();
    },
    stop,
    dispose() {
      stop();
      listeners.forEach((remove) => remove());
      if (previousTabIndex === null) canvas.removeAttribute('tabindex');
      else canvas.setAttribute('tabindex', previousTabIndex);
    },
  };
}
