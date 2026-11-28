import { mountAimMarker } from './aim-marker.js';
import { flightText as ft } from './flight-controls-copy.js';
import { onLanguageChange } from './i18n.js';

export function mountFlightCameraWindow(onAction) {
  const root = document.createElement('section');
  root.id = 'freeFlightCameraWindow';
  root.hidden = true;
  root.setAttribute('aria-labelledby', 'ff-camera-title');
  root.innerHTML = `<div class="ff-camera-heading"><h3 id="ff-camera-title"></h3><button type="button" data-close-camera>×</button></div>
    <div class="ff-camera-frame"><canvas></canvas><span class="ff-camera-center aim-marker-centered" aria-hidden="true"></span><p data-camera-idle></p></div>
    <div class="ff-camera-footer"><span data-camera-craft></span><button type="button" data-camera-main></button></div><div class="ff-camera-marker"></div>`;
  document.body.append(root);
  mountAimMarker({
    marker: root.querySelector('.ff-camera-center'),
    host: root.querySelector('.ff-camera-marker'),
    profile: 'camera',
  });
  const canvas = root.querySelector('canvas'),
    idle = root.querySelector('[data-camera-idle]');
  const main = root.querySelector('[data-camera-main]'),
    close = root.querySelector('[data-close-camera]');
  const title = root.querySelector('h3'),
    craft = root.querySelector('[data-camera-craft]');
  let activeId = '',
    lastFrame = -Infinity;
  function translate() {
    title.textContent = ft('对接相机');
    canvas.setAttribute('aria-label', title.textContent);
    main.textContent = ft('放到主画面');
    close.setAttribute('aria-label', ft('关闭'));
    idle.textContent = ft('接口已锁定');
  }
  translate();
  onLanguageChange(translate);
  close.onclick = () => onAction('preview');
  main.onclick = () => onAction('view', 'port');
  return {
    update(state) {
      const hidden = !state || !state.preview || state.view === 'port';
      if (hidden !== root.hidden || state?.selectedId !== activeId) lastFrame = -Infinity;
      root.hidden = hidden;
      if (hidden) return;
      activeId = state.selectedId;
      const docked = state.phase === 'docked';
      idle.hidden = !docked;
      main.disabled = docked;
      root.dataset.docked = String(docked);
      const name = state.crafts.find((ship) => ship.id === activeId)?.label || '';
      if (craft.textContent !== name) craft.textContent = name;
    },
    draw(scene, background) {
      if (root.hidden || document.hidden) return;
      const now = performance.now();
      if (now - lastFrame < 100) return;
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      if (!width || !height) return;
      const scale = Math.min(devicePixelRatio || 1, 1.5, 480 / width, 320 / height);
      const w = Math.max(1, Math.round(width * scale)),
        h = Math.max(1, Math.round(height * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      scene.drawPreview(canvas, background);
      lastFrame = now;
    },
  };
}
