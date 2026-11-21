import { getLanguage, onLanguageChange, t } from './i18n.js';
import { createGroundSitePicker } from './ground-site-map.js';
import { createSiteMapImagery } from './ground-site-map-imagery.js';
import {
  clamp,
  wrap,
  locationMapFrame,
  projectLocation,
  locationMapScale,
} from './ground-site-map-projection.js';
export {
  locationMapFrame,
  projectLocation,
  locationMapScale,
  locationMapImageRects,
} from './ground-site-map-projection.js';

export function mountGroundLocationMap({ host, environment, onPick, search, onPickerChange }) {
  const root = document.createElement('div');
  root.className = 'ground-location-map';
  root.setAttribute('role', 'region');
  root.innerHTML = `<style>
.ground-location-map{position:absolute;z-index:5;right:18px;bottom:180px;width:242px;padding:0;box-sizing:border-box;border:1px solid #456477;border-radius:10px;background:#0c1927ed;box-shadow:0 6px 24px #0006;overflow:hidden;color:#dceaf2;font:11px/1.4 system-ui}
.ground-location-map[hidden]{display:none}.ground-location-map .ground-location-map-heading{position:static;inset:auto;width:auto;height:auto;min-height:0;box-sizing:border-box;display:flex;align-items:center;padding:4px 6px;gap:4px}.ground-location-map button{padding:3px 7px;min-width:27px;font:inherit;border:0;background:transparent;color:#dceaf2;cursor:pointer}.ground-location-map button:hover{background:#294253}.ground-location-map button[data-map-toggle]{flex:1;text-align:left;color:#ead6ae}.ground-location-map canvas{display:block;cursor:zoom-in;width:100%;height:160px}.ground-location-map .ground-location-map-caption{padding:5px 8px;font-variant-numeric:tabular-nums;white-space:nowrap}.ground-location-map.is-collapsed canvas,.ground-location-map.is-collapsed .ground-location-map-caption{display:none}.ground-location-map.is-collapsed{width:fit-content;max-width:245px}.ground-location-map.is-collapsed [data-map-out],.ground-location-map.is-collapsed [data-map-in]{display:none}
@media(max-width:700px){.ground-location-map{right:8px;width:190px;font-size:10px}.ground-location-map canvas{height:128px}.ground-location-map .ground-location-map-caption{padding:4px 6px}.ground-location-map.is-collapsed{width:fit-content}}
</style><div class="ground-location-map-heading"><button type="button" data-map-toggle aria-expanded="true"></button><button type="button" data-map-open aria-haspopup="dialog">⤢</button><button type="button" data-map-out>−</button><button type="button" data-map-in>+</button></div><canvas tabindex="0" role="button" aria-haspopup="dialog"></canvas><div class="ground-location-map-caption"></div>`;
  host.append(root);
  const canvas = root.querySelector('canvas');
  const caption = root.querySelector('.ground-location-map-caption'),
    toggle = root.querySelector('[data-map-toggle]');
  let picker;
  const imagery = createSiteMapImagery(environment, () => picker?.repaint());
  const places = (environment.geography?.items || []).filter(
    (p) =>
      (p.kind === 'city' || p.kind === 'capital' || p.kind === 'landform') &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon)
  );
  let site = null,
    heading = 0,
    fov = 65,
    widthKm = 80,
    collapsed = false;
  let lastDraw = -Infinity,
    disposed = false;
  function translate() {
    root.setAttribute('aria-label', t('位置地图'));
    toggle.textContent = (collapsed ? '▸ ' : '▾ ') + t('位置地图');
    toggle.title = t(collapsed ? '展开位置地图' : '收起位置地图');
    root.querySelector('[data-map-in]').title = root.querySelector('[data-map-in]').ariaLabel =
      t('放大地图');
    root.querySelector('[data-map-out]').title = root.querySelector('[data-map-out]').ariaLabel =
      t('缩小地图');
    const openButton = root.querySelector('[data-map-open]');
    openButton.title = t('打开选点大图');
    openButton.setAttribute('aria-label', openButton.title);
    canvas.title = openButton.title;
    canvas.setAttribute('aria-label', openButton.title);
    picker?.translate();
    lastDraw = -Infinity;
  }
  const offLanguage = onLanguageChange(translate);
  function position() {
    const guide = host.querySelector('.world-key-guide');
    const guideHeight =
      guide && !guide.hidden && guide.getClientRects().length
        ? host.getBoundingClientRect().bottom - guide.getBoundingClientRect().top + 10
        : 40;
    // On small screens the map stays above the keyboard guide, with room below
    // the upper toolbar. Collapse remains available without covering the left panel.
    root.style.bottom =
      Math.max(
        40,
        Math.min(guideHeight, Math.max(40, host.clientHeight - root.offsetHeight - 58))
      ) + 'px';
  }
  function draw() {
    if (disposed || root.hidden || !site) return;
    position();
    caption.textContent = `${site.latitude.toFixed(4)}°, ${wrap(site.longitude).toFixed(4)}° · ${Math.round(site.height || 0)} m`;
    if (collapsed || picker?.open) return;
    const frame = locationMapFrame(
      site,
      widthKm,
      canvas.clientWidth || 240,
      canvas.clientHeight || 160
    );
    renderMap(canvas, frame);
  }
  function renderMap(target, frame, selection = null) {
    const context = target.getContext('2d');
    if (!context) return;
    const { width, height } = frame;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (
      target.width !== Math.round(width * ratio) ||
      target.height !== Math.round(height * ratio)
    ) {
      target.width = Math.round(width * ratio);
      target.height = Math.round(height * ratio);
    }
    context.setTransform(target.width / width, 0, 0, target.height / height, 0, 0);
    imagery.draw(context, frame, !!selection);
    context.fillStyle = selection ? '#05111b12' : '#05111b35';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = '#d6e6ec26';
    context.lineWidth = 0.6;
    for (const fraction of [0.25, 0.5, 0.75]) {
      context.beginPath();
      context.moveTo(width * fraction, 0);
      context.lineTo(width * fraction, height);
      context.stroke();
      context.beginPath();
      context.moveTo(0, height * fraction);
      context.lineTo(width, height * fraction);
      context.stroke();
    }
    const marker = selection
      ? projectLocation(frame, selection.candidate.latitude, selection.candidate.longitude)
      : { x: width / 2, y: height / 2 };
    const language = getLanguage(),
      occupied = [{ x: marker.x - 10, y: marker.y - 10, w: 20, h: 20 }];
    const candidates = places
      .map((p) => ({ p, ...projectLocation(frame, p.lat, p.lon) }))
      .filter((p) => p.x > 8 && p.x < width - 8 && p.y > 14 && p.y < height - 22)
      .sort(
        (a, b) =>
          (a.p.kind === 'landform' ? 3 : a.p.cityTier || 1) -
            (b.p.kind === 'landform' ? 3 : b.p.cityTier || 1) ||
          Math.hypot(a.x - width / 2, a.y - height / 2) -
            Math.hypot(b.x - width / 2, b.y - height / 2)
      );
    context.font = '11px system-ui';
    context.textBaseline = 'middle';
    context.lineWidth = 3;
    let labels = 0;
    for (const p of candidates) {
      const name = p.p[language] || p.p.en || p.p.zh;
      if (!name) continue;
      const textWidth = Math.min(width - 16, context.measureText(name).width);
      const box = { x: clamp(p.x + 16, 4, width - textWidth - 4), y: p.y - 7, w: textWidth, h: 14 };
      if (
        occupied.some(
          (b) =>
            box.x < b.x + b.w + 4 &&
            box.x + box.w + 4 > b.x &&
            box.y < b.y + b.h + 3 &&
            box.y + box.h + 3 > b.y
        )
      )
        continue;
      occupied.push(box);
      context.fillStyle = '#e8edf0';
      context.beginPath();
      context.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#06111ddd';
      context.strokeText(name, box.x, p.y, textWidth);
      context.fillText(name, box.x, p.y, textWidth);
      if (++labels >= (selection ? Math.min(32, Math.ceil((width * height) / 20000)) : 6)) break;
    }
    if (selection) {
      const observer = projectLocation(
        frame,
        selection.observer.latitude,
        selection.observer.longitude
      );
      context.beginPath();
      context.arc(observer.x, observer.y, 4, 0, 2 * Math.PI);
      context.fillStyle = '#a0edf2';
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = '#183543';
      context.stroke();
      context.beginPath();
      context.arc(marker.x, marker.y, 8, 0, 2 * Math.PI);
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        context.moveTo(marker.x + dx * 5, marker.y + dy * 5);
        context.lineTo(marker.x + dx * 14, marker.y + dy * 14);
      }
      context.strokeStyle = '#372b18';
      context.lineWidth = 4;
      context.stroke();
      context.strokeStyle = '#ffdb83';
      context.lineWidth = 2;
      context.stroke();
    } else {
      const angle = ((heading - 90) * Math.PI) / 180,
        half = (clamp(fov, 15, 100) * Math.PI) / 360;
      context.fillStyle = '#6de4ff60';
      context.strokeStyle = '#8aeaff';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(width / 2, height / 2);
      context.arc(width / 2, height / 2, 27, angle - half, angle + half);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(width / 2, height / 2);
      context.lineTo(width / 2 + Math.cos(angle) * 23, height / 2 + Math.sin(angle) * 23);
      context.stroke();
      context.beginPath();
      context.arc(width / 2, height / 2, 4, 0, Math.PI * 2);
      context.fillStyle = '#c6f8ff';
      context.fill();
      context.strokeStyle = '#062332';
      context.stroke();
    }
    context.font = 'bold 11px system-ui';
    context.fillStyle = '#f1f6f8';
    context.strokeStyle = '#06111d';
    context.lineWidth = 3;
    context.strokeText('N ↑', width - 31, 13);
    context.fillText('N ↑', width - 31, 13);
    const scale = locationMapScale(frame, selection ? 95 : 58),
      label =
        scale.kilometres >= 1
          ? `${scale.kilometres} km`
          : `${Math.round(scale.kilometres * 1000)} m`;
    context.strokeStyle = '#06111d';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(9, height - 10);
    context.lineTo(9 + scale.pixels, height - 10);
    context.stroke();
    context.strokeStyle = '#f1f6f8';
    context.lineWidth = 2;
    context.stroke();
    context.font = '10px system-ui';
    context.strokeStyle = '#06111d';
    context.lineWidth = 3;
    context.strokeText(label, 9, height - 21);
    context.fillText(label, 9, height - 21);
  }
  function openPicker(initial = site, options) {
    if (disposed || !initial) return false;
    picker ??= createGroundSitePicker({
      host,
      draw: renderMap,
      imagery,
      search,
      onPick,
      onPickerChange,
    });
    return picker.show(initial, options);
  }
  root.querySelector('[data-map-open]').onclick = canvas.onclick = () => openPicker();
  canvas.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };
  toggle.onclick = () => {
    collapsed = !collapsed;
    root.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    translate();
    draw();
  };
  root.querySelector('[data-map-in]').onclick = () => {
    widthKm = clamp(widthKm / 2, 2, 12000);
    draw();
  };
  root.querySelector('[data-map-out]').onclick = () => {
    widthKm = clamp(widthKm * 2, 2, 12000);
    draw();
  };
  translate();
  return {
    root,
    openPicker,
    closePicker() {
      picker?.close();
    },
    get pickerOpen() {
      return !!picker?.open;
    },
    update(next, azimuth = 0, fieldOfView = 65) {
      if (disposed || !next || !Number.isFinite(next.latitude + next.longitude)) return;
      site = { ...next };
      heading = Number(azimuth) || 0;
      fov = Number(fieldOfView) || 65;
      const now = performance.now();
      if (now - lastDraw < 250) return;
      lastDraw = now;
      draw();
    },
    setVisible(value) {
      root.hidden = !value;
      if (value) {
        lastDraw = -Infinity;
        draw();
      }
    },
    dispose() {
      disposed = true;
      offLanguage();
      picker?.dispose();
      imagery.dispose();
      root.remove();
    },
  };
}
