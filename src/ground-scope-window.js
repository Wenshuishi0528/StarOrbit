import * as THREE from 'three';
import { targetEdges } from './survey-live-geometry.js';
import { t } from './i18n.js';
import { mountScopeInput } from './xuntian-input.js';

// The transparent frame sits over the corresponding viewport of the shared WebGL canvas.
export function mountGroundScopeWindow({ stage, panel, onLayout, onClose, onAim, onPhoto }) {
  const root = document.createElement('div');
  root.setAttribute('role', 'region');
  root.className = 'ground-scope-window';
  root.hidden = true;
  root.innerHTML = `<div class="ground-scope-bar"><strong>地面望远镜</strong><button data-scope-expand>展开取景</button><button data-scope-close>收镜</button></div>
    <div class="ground-scope-well"><div class="ground-scope-frame" tabindex="0" role="group" aria-label="望远镜取景"></div></div>
    <footer><output data-scope-hud></output><div class="ground-scope-actions"><button data-scope-aim-main>对准主画面</button><button data-scope-wide>广角寻星</button><button data-scope-photo>拍照</button></div></footer>`;
  const guide = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  guide.classList.add('ground-scope-guide');
  guide.setAttribute('aria-hidden', 'true');
  const outline = document.createElementNS(guide.namespaceURI, 'path');
  outline.id = 'ground-scope-guide-outline';
  const defs = document.createElementNS(guide.namespaceURI, 'defs');
  defs.append(outline);
  guide.append(defs);
  // Stroke the same short segments twice for contrast. An SVG blur allocates
  // an intermediate surface as large as the finder while it is moving.
  for (const layer of ['halo', 'line']) {
    const use = document.createElementNS(guide.namespaceURI, 'use');
    use.setAttribute('href', '#' + outline.id);
    use.classList.add(layer);
    guide.append(use);
  }
  stage.append(guide, root);
  const node = (s) => root.querySelector(s),
    frame = node('.ground-scope-frame'),
    hud = node('[data-scope-hud]');
  frame.append(panel.overlay);
  const center = document.createElement('span');
  center.className = 'ground-aim-origin';
  const marker = document.createElement('span');
  center.setAttribute('aria-hidden', 'true');
  center.append(marker);
  frame.append(center);
  const guideCenter = document.createElement('span');
  guideCenter.className = 'ground-guide-aim-origin';
  guideCenter.setAttribute('aria-hidden', 'true');
  guideCenter.hidden = true;
  const projected = document.createElement('span');
  guideCenter.append(projected);
  guide.after(guideCenter);
  panel.mountMarkers(marker, projected);
  const input = mountScopeInput(frame, {
    nudge: (x, y) => panel.nudge(x, y),
    zoom: (delta) => panel.zoom(delta),
    field: () => panel.field,
    cameraField: () => panel.cameraField(frame.clientWidth, frame.clientHeight),
    roll: (deg) => panel.roll(deg),
    logZoom: true,
  });
  let layout = '';
  node('[data-scope-expand]').onclick = () => onLayout(layout === 'dock' ? 'expanded' : 'dock');
  node('[data-scope-close]').onclick = onClose;
  node('[data-scope-wide]').onclick = () => panel.wide();
  node('[data-scope-aim-main]').onclick = onAim;
  node('[data-scope-photo]').onclick = onPhoto;
  function refresh() {
    node('[data-scope-expand]').textContent = t(layout === 'expanded' ? '收起取景' : '展开取景');
    node('[data-scope-expand]').setAttribute('aria-expanded', String(layout === 'expanded'));
    root.setAttribute('aria-label', t('地面望远镜'));
  }
  const dir = new THREE.Vector3();
  function updateGuide(mainCamera, scopeCamera, diameter = 0) {
    guideCenter.hidden = true;
    const w = stage.clientWidth,
      h = stage.clientHeight;
    const fw = frame.clientWidth,
      fh = frame.clientHeight;
    if (!(w > 0 && h > 0 && fw > 0 && fh > 0)) {
      outline.removeAttribute('d');
      return;
    }
    const corners = [];
    const ray = (x, y) =>
      dir.set(x, y, 0).unproject(scopeCamera).sub(scopeCamera.position).toArray();
    if (diameter > 0) {
      for (let i = 0; i < 48; i++) {
        const angle = (i * Math.PI) / 24,
          dx = Math.cos(angle),
          dy = Math.sin(angle);
        const radius = Math.min(diameter / 2, fw / (2 * Math.abs(dx)), fh / (2 * Math.abs(dy)));
        corners.push(ray((2 * dx * radius) / fw, (2 * dy * radius) / fh));
      }
    } else corners.push(ray(-1, 1), ray(1, 1), ray(1, -1), ray(-1, -1));
    const axis = (x, y, z) => dir.set(x, y, z).applyQuaternion(mainCamera.quaternion).toArray();
    const axes = { right: axis(1, 0, 0), up: axis(0, 1, 0), forward: axis(0, 0, -1) };
    // Clip before perspective division. At the side of the finder, even a
    // normal field can otherwise produce a dashed path millions of pixels long.
    const edges = targetEdges({ corners }, axes, mainCamera.getEffectiveFOV(), mainCamera.aspect);
    const point = ([x, y]) => (x * w).toFixed(1) + ' ' + (y * h).toFixed(1);
    const path = edges.map(([a, b]) => 'M' + point(a) + 'L' + point(b));
    dir.fromArray(ray(0, 0)).applyMatrix4(mainCamera.matrixWorldInverse);
    if (dir.z < 0) {
      dir.applyMatrix4(mainCamera.projectionMatrix);
      if (Math.abs(dir.x) < 1 && Math.abs(dir.y) < 1) {
        const x = ((1 + dir.x) * w) / 2,
          y = ((1 - dir.y) * h) / 2;
        guideCenter.style.left = x + 'px';
        guideCenter.style.top = y + 'px';
        guideCenter.hidden = false;
      }
    }
    const d = path.join(' ');
    if (outline.getAttribute('d') !== d) outline.setAttribute('d', d);
  }
  return {
    frame,
    hud,
    input,
    refresh,
    updateGuide,
    get layout() {
      return layout;
    },
    setLayout(next) {
      layout = next;
      root.hidden = !next;
      root.classList.toggle('expanded', next === 'expanded');
      stage.classList.toggle('has-ground-scope', Boolean(next));
      stage.classList.toggle('ground-scope-expanded', next === 'expanded');
      if (!next) {
        input.clear();
        hud.textContent = '';
      }
      outline.removeAttribute('d');
      guideCenter.hidden = true;
      refresh();
    },
    clearGuide() {
      guideCenter.hidden = true;
      if (outline.hasAttribute('d')) outline.removeAttribute('d');
    },
    dispose() {
      input.dispose?.();
      root.remove();
      guide.remove();
      guideCenter.remove();
    },
  };
}
