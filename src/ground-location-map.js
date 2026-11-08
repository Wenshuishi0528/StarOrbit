import { getLanguage, onLanguageChange, t } from './i18n.js';

const KM_PER_DEGREE = (Math.PI * 6371.0088) / 180;
const wrap = (longitude) => ((((longitude + 180) % 360) + 360) % 360) - 180;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// A north-up local equirectangular map. Longitude wraps at the date line;
// a bounded parallel scale keeps the geographic overview finite at the poles.
export function locationMapFrame(site, widthKm = 80, width = 240, height = 160) {
  const latitude = clamp(Number(site.latitude) || 0, -90, 90);
  const longitude = wrap(Number(site.longitude) || 0);
  const parallel = Math.max(0.02, Math.cos((latitude * Math.PI) / 180));
  const longitudeSpan = Math.min(
    360,
    clamp(Number(widthKm) || 80, 2, 12000) / (KM_PER_DEGREE * parallel)
  );
  const actualWidthKm = longitudeSpan * KM_PER_DEGREE * parallel;
  const latitudeSpan = (actualWidthKm * height) / width / KM_PER_DEGREE;
  return {
    latitude,
    longitude,
    width,
    height,
    longitudeSpan,
    latitudeSpan,
    west: longitude - longitudeSpan / 2,
    east: longitude + longitudeSpan / 2,
    south: latitude - latitudeSpan / 2,
    north: latitude + latitudeSpan / 2,
    kmPerPixel: actualWidthKm / width,
  };
}
export function projectLocation(frame, latitude, longitude) {
  return {
    x: frame.width * (0.5 + wrap(longitude - frame.longitude) / frame.longitudeSpan),
    y: frame.height * (0.5 - (latitude - frame.latitude) / frame.latitudeSpan),
  };
}
export function locationMapScale(frame, targetPixels = 58) {
  const wanted = frame.kmPerPixel * targetPixels;
  const power = 10 ** Math.floor(Math.log10(wanted));
  const kilometres = ([5, 2, 1].find((step) => step * power <= wanted) || 1) * power;
  return { kilometres, pixels: kilometres / frame.kmPerPixel };
}
// Source bounds are WGS84 west/south/east/north and source pixels are north-up.
// Return clipped rectangles instead of drawing a huge, mostly offscreen globe.
export function locationMapImageRects(frame, bounds) {
  const [west, south, east, north] = bounds;
  if (!(east > west && north > south)) return [];
  const out = [];
  const centralShift = 360 * Math.round((frame.longitude - (west + east) / 2) / 360);
  for (const shift of [centralShift - 360, centralShift, centralShift + 360]) {
    const w = Math.max(frame.west, west + shift),
      e = Math.min(frame.east, east + shift);
    const s = Math.max(frame.south, south),
      n = Math.min(frame.north, north);
    if (e <= w || n <= s) continue;
    out.push({
      source: [
        (w - west - shift) / (east - west),
        (north - n) / (north - south),
        (e - w) / (east - west),
        (n - s) / (north - south),
      ],
      target: [
        ((w - frame.west) / frame.longitudeSpan) * frame.width,
        ((frame.north - n) / frame.latitudeSpan) * frame.height,
        ((e - w) / frame.longitudeSpan) * frame.width,
        ((n - s) / frame.latitudeSpan) * frame.height,
      ],
    });
  }
  return out;
}

export function mountGroundLocationMap({ host, environment }) {
  const root = document.createElement('div');
  root.className = 'ground-location-map';
  root.setAttribute('role', 'region');
  root.innerHTML = `<style>
.ground-location-map{position:absolute;z-index:5;right:18px;bottom:180px;width:242px;padding:0;box-sizing:border-box;border:1px solid #456477;border-radius:10px;background:#0c1927ed;box-shadow:0 6px 24px #0006;overflow:hidden;color:#dceaf2;font:11px/1.4 system-ui}
.ground-location-map[hidden]{display:none}.ground-location-map .ground-location-map-heading{position:static;inset:auto;width:auto;height:auto;min-height:0;box-sizing:border-box;display:flex;align-items:center;padding:4px 6px;gap:4px}.ground-location-map button{padding:3px 7px;min-width:27px;font:inherit;border:0;background:transparent;color:#dceaf2;cursor:pointer}.ground-location-map button:hover{background:#294253}.ground-location-map button[data-map-toggle]{flex:1;text-align:left;color:#ead6ae}.ground-location-map canvas{display:block;width:100%;height:160px}.ground-location-map .ground-location-map-caption{padding:5px 8px;font-variant-numeric:tabular-nums;white-space:nowrap}.ground-location-map.is-collapsed canvas,.ground-location-map.is-collapsed .ground-location-map-caption{display:none}.ground-location-map.is-collapsed{width:160px}
@media(max-width:700px){.ground-location-map{right:8px;width:190px;font-size:10px}.ground-location-map canvas{height:128px}.ground-location-map .ground-location-map-caption{padding:4px 6px}.ground-location-map.is-collapsed{width:145px}}
</style><div class="ground-location-map-heading"><button type="button" data-map-toggle aria-expanded="true"></button><button type="button" data-map-out>−</button><button type="button" data-map-in>+</button></div><canvas></canvas><div class="ground-location-map-caption"></div>`;
  host.append(root);
  const canvas = root.querySelector('canvas'),
    context = canvas.getContext('2d');
  const caption = root.querySelector('.ground-location-map-caption'),
    toggle = root.querySelector('[data-map-toggle]');
  const scratch = document.createElement('canvas');
  scratch.width = scratch.height = 512;
  const scratchContext = scratch.getContext('2d');
  const thumbnails = new Map();
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
    canvas.setAttribute('aria-label', t('位置地图'));
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
  function drawGeoImage(image, bounds, frame, source = [0, 0, image.width, image.height]) {
    for (const rectangle of locationMapImageRects(frame, bounds)) {
      const s = rectangle.source;
      context.drawImage(
        image,
        source[0] + s[0] * source[2],
        source[1] + s[1] * source[3],
        s[2] * source[2],
        s[3] * source[3],
        ...rectangle.target
      );
    }
  }
  function thumbnail(key, entry, manager, allowCreate) {
    let stored = thumbnails.get(key);
    if (stored?.entry !== entry || stored?.data !== manager.texture.image.data) {
      if (!allowCreate) return null;
      const data = manager.texture.image.data;
      if (!data || data.length < (entry.layer + 1) * 512 * 512 * 4) return null;
      const rgba = new Uint8ClampedArray(
        data.buffer,
        data.byteOffset + entry.layer * 512 * 512 * 4,
        512 * 512 * 4
      );
      scratchContext.putImageData(new ImageData(rgba, 512, 512), 0, 0);
      const image = document.createElement('canvas');
      image.width = image.height = 256;
      image.getContext('2d').drawImage(scratch, 0, 0, 256, 256);
      stored = { entry, data, image };
      thumbnails.delete(key);
      thumbnails.set(key, stored);
      while (thumbnails.size > 24) thumbnails.delete(thumbnails.keys().next().value);
    } else {
      thumbnails.delete(key);
      thumbnails.set(key, stored);
    }
    return stored.image;
  }
  function draw() {
    if (disposed || root.hidden || !site) return;
    position();
    caption.textContent = `${site.latitude.toFixed(4)}°, ${wrap(site.longitude).toFixed(4)}° · ${Math.round(site.height || 0)} m`;
    if (collapsed || !context) return;
    const width = canvas.clientWidth || 240,
      height = canvas.clientHeight || 160;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#152c3b';
    context.fillRect(0, 0, width, height);
    const frame = locationMapFrame(site, widthKm, width, height);
    const base = environment.uniforms?.dayMap?.value?.image;
    if (base?.width > 1 && base?.height > 1) {
      try {
        drawGeoImage(base, [-180, -90, 180, 90], frame);
      } catch {
        /* Source may be switching. */
      }
    }
    const manager = environment.cityTerrain;
    let created = 0;
    const visible = [...(manager?.entries || [])]
      .filter(([, entry]) => locationMapImageRects(frame, entry.bounds).length)
      .sort(
        (a, b) =>
          Number(!manager.cities.get(a[1].cityId)?.streaming) -
            Number(!manager.cities.get(b[1].cityId)?.streaming) || a[1].z - b[1].z
      );
    if (manager?.enabled)
      for (const [key, entry] of visible) {
        const cached =
          thumbnails.get(key)?.entry === entry &&
          thumbnails.get(key)?.data === manager.texture.image.data;
        const image = thumbnail(key, entry, manager, created < 2);
        if (!cached && image) created++;
        if (image) drawGeoImage(image, entry.bounds, frame, [2, 2, 252, 252]);
      }
    context.fillStyle = '#05111b35';
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
    const language = getLanguage(),
      occupied = [{ x: width / 2 - 10, y: height / 2 - 10, w: 20, h: 20 }];
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
      if (++labels >= 6) break;
    }
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
    context.font = 'bold 11px system-ui';
    context.fillStyle = '#f1f6f8';
    context.strokeStyle = '#06111d';
    context.lineWidth = 3;
    context.strokeText('N ↑', width - 31, 13);
    context.fillText('N ↑', width - 31, 13);
    const scale = locationMapScale(frame),
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
      thumbnails.clear();
      scratch.width = scratch.height = 1;
      root.remove();
    },
  };
}
