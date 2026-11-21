import * as THREE from 'three';
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
  guide.append(outline);
  stage.append(guide, root);
  const node = (s) => root.querySelector(s),
    frame = node('.ground-scope-frame'),
    hud = node('[data-scope-hud]');
  frame.append(panel.overlay);
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
    const w = stage.clientWidth,
      h = stage.clientHeight;
    const fw = frame.clientWidth,
      fh = frame.clientHeight;
    const projection = [];
    let previous = false;
    const add = (x, y) => {
      dir.set(x, y, 0).unproject(scopeCamera).sub(scopeCamera.position);
      dir.applyMatrix4(mainCamera.matrixWorldInverse);
      if (dir.z >= -1e-7) {
        previous = false;
        return;
      }
      dir.applyMatrix4(mainCamera.projectionMatrix);
      const px = ((1 + dir.x) * w) / 2,
        py = ((1 - dir.y) * h) / 2;
      if (!Number.isFinite(px + py)) {
        previous = false;
        return;
      }
      projection.push((previous ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1));
      previous = true;
    };
    if (diameter > 0) {
      for (let i = 0; i <= 48; i++) {
        const a = (i * Math.PI) / 24;
        const dx = Math.cos(a),
          dy = Math.sin(a);
        const radius = Math.min(diameter / 2, fw / (2 * Math.abs(dx)), fh / (2 * Math.abs(dy)));
        add((dx * radius * 2) / fw, (dy * radius * 2) / fh);
      }
    } else {
      const corners = [
        [-1, 1],
        [1, 1],
        [1, -1],
        [-1, -1],
        [-1, 1],
      ];
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 9; j++) {
          const a = corners[i],
            b = corners[i + 1];
          add(a[0] + ((b[0] - a[0]) * j) / 8, a[1] + ((b[1] - a[1]) * j) / 8);
        }
    }
    // A cross remains visible when a high-power field is smaller than a screen pixel.
    previous = false;
    add(0, 0);
    if (previous && Math.abs(dir.x) < 1 && Math.abs(dir.y) < 1) {
      const x = ((1 + dir.x) * w) / 2,
        y = ((1 - dir.y) * h) / 2;
      projection.push(`M${x - 7} ${y}h4m6 0h4M${x} ${y - 7}v4m0 6v4`);
    }
    outline.setAttribute('d', projection.join(' '));
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
      refresh();
    },
    clearGuide() {
      if (outline.hasAttribute('d')) outline.removeAttribute('d');
    },
    dispose() {
      input.dispose?.();
      root.remove();
      guide.remove();
    },
  };
}
