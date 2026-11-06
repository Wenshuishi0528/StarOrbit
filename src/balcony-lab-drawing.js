import stars from '../assets/stars.json';
import names from '../assets/star-chart.json';
import { equatorial } from './environment-math.js';
import { unit } from './orbit.js';
import { getLanguage, t } from './i18n.js';
import { compassDirection } from './pass-display.js';
import {
  angularSeparation,
  azimuthOffset,
  diskPoint,
  diskSurface,
  groundBasis,
  horizonHeight,
  observationState,
  reverseCamera,
  stellarAngles,
} from './balcony-lab-geometry.js';

const limit = (v, min, max) => Math.max(min, Math.min(max, v));
const TAU = 2 * Math.PI;
let catalog;
function skyCatalog() {
  if (catalog) return catalog;
  const named = new Map(names.stars.map((star) => [star.id, star]));
  catalog = stars
    .filter((entry) => entry[3] <= 5.5)
    .map(([id, ra, dec, mag, bv]) => ({
      vector: equatorial(ra, dec),
      mag,
      name: named.get(id),
      color: Number(bv) > 0.85 ? '#ffdfb3' : Number(bv) < 0.12 ? '#b9d9ff' : '#e5eaff',
    }));
  return catalog;
}
function prepare(canvas) {
  const rect = canvas.getBoundingClientRect(),
    w = rect.width,
    h = rect.height;
  if (w < 2 || h < 2) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1),
    width = Math.round(w * dpr),
    height = Math.round(h * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(width / w, 0, 0, height / h, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '12px system-ui, sans-serif';
  return { ctx, w, h };
}
function path(ctx, points, stroke, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}
function disc(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}
function outlinedText(ctx, label, x, y, color) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#102031';
  ctx.strokeText(label, x, y);
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
}
export function skyProjection(w, h, centre) {
  const span = w < 440 ? 115 : 155,
    top = 22,
    floor = h - 38,
    height = floor - top;
  return {
    span,
    x: (az) => w / 2 + (azimuthOffset(az, centre) * w) / span,
    y: (el) => floor - (el * height) / 90,
    bearing: (x) => centre + (x / w - 0.5) * span,
    elevation: (y) => (90 * (floor - y)) / height,
  };
}

export function drawBalconySky(
  canvas,
  {
    point,
    time,
    sunElevation = point?.sunElevation ?? 0,
    segments,
    profile,
    frame,
    centre,
    craftName,
  }
) {
  const surface = prepare(canvas);
  if (!surface) return null;
  const { ctx, w, h } = surface,
    view = skyProjection(w, h, centre),
    { x, y } = view;
  const light = limit((sunElevation + 17) / 21, 0, 1),
    dark = limit((-sunElevation + 1) / 11, 0, 1);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `rgb(${6 + 30 * light},${15 + 55 * light},${34 + 78 * light})`);
  grad.addColorStop(0.66, `rgb(${17 + 44 * light},${36 + 70 * light},${64 + 74 * light})`);
  grad.addColorStop(1, `rgb(${44 + 80 * light},${56 + 57 * light},${75 + 38 * light})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const atmosphere = ctx.createRadialGradient(w * 0.51, h * 1.16, 0, w * 0.51, h * 1.16, w * 0.78);
  atmosphere.addColorStop(0, `rgba(255,165,117,${0.12 + 0.21 * light})`);
  atmosphere.addColorStop(1, 'transparent');
  ctx.fillStyle = atmosphere;
  ctx.fillRect(0, 0, w, h);
  const basis = groundBasis(frame, time),
    labels = [];
  let nearest = null;
  for (const star of skyCatalog()) {
    const q = stellarAngles(star.vector, basis);
    if (q.elevation <= horizonHeight(profile, q.azimuth)) continue;
    const name = star.name?.[getLanguage()] || star.name?.en;
    if (point && name && star.mag < 2.4 && dark > 0.5) {
      const angle = angularSeparation(point, q);
      if (!nearest || nearest.angle > angle) nearest = { name, angle };
    }
    const px = x(q.azimuth),
      py = y(q.elevation);
    if (px < 0 || px > w) continue;
    const alpha = limit(
      (1.05 - star.mag * 0.115) * dark * Math.min(1, (q.elevation + 8) / 22),
      0,
      1
    );
    if (alpha < 0.06) continue;
    ctx.globalAlpha = alpha;
    disc(ctx, px, py, limit(1.55 - star.mag * 0.18, 0.48, 2.1), star.color);
    if (star.mag < 0.5) {
      ctx.globalAlpha = alpha * 0.26;
      disc(ctx, px, py, 3.4, star.color);
    }
    ctx.globalAlpha = 1;
    if (name && star.mag < 2.3 && alpha > 0.34) labels.push({ x: px, y: py, name });
  }
  // Magnitude order gives bright stars label priority. Retain separation from the marker.
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const occupied = [],
    spotX = point ? x(point.azimuth) : Infinity,
    spotY = point ? y(point.elevation) : Infinity;
  for (const item of labels) {
    const px = item.x + 5,
      py = item.y - 5,
      ww = ctx.measureText(item.name).width;
    if (
      px < 38 ||
      px + ww > w - 12 ||
      py < 18 ||
      Math.hypot(px - spotX, py - spotY) < 42 ||
      occupied.some(
        (box) => px < box.x + box.width + 6 && px + ww > box.x - 6 && Math.abs(box.y - py) < 16
      )
    )
      continue;
    occupied.push({ x: px, y: py, width: ww });
    outlinedText(ctx, item.name, px, py, '#c0d1e1');
  }
  for (const el of [15, 30, 60]) {
    const py = y(el);
    ctx.setLineDash([2, 6]);
    path(
      ctx,
      [
        [0, py],
        [w, py],
      ],
      'rgba(175,209,233,.19)'
    );
    ctx.setLineDash([]);
    ctx.fillStyle = '#9fafc1';
    ctx.fillText(el + '°', 9, py - 4);
  }
  const edge = [];
  for (let px = 0; px < w; px += 2) edge.push([px, y(horizonHeight(profile, view.bearing(px)))]);
  edge.push([w, y(horizonHeight(profile, view.bearing(w)))]);
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (const p of edge) ctx.lineTo(...p);
  ctx.lineTo(w, h);
  ctx.closePath();
  const land = ctx.createLinearGradient(0, h * 0.45, 0, h);
  land.addColorStop(0, '#192739');
  land.addColorStop(1, '#07121f');
  ctx.fillStyle = land;
  ctx.fill();
  path(ctx, edge, '#81959d', 1.25);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let az = 0; az < 360; az += 15) {
    const px = x(az);
    if (px < 20 || px > w - 20) continue;
    const isMain = az % 45 === 0;
    ctx.strokeStyle = isMain ? '#899ca8' : '#536576';
    ctx.beginPath();
    ctx.moveTo(px, h - 25);
    ctx.lineTo(px, h - (isMain ? 32 : 29));
    ctx.stroke();
    if (isMain) {
      ctx.fillStyle = '#c3cbd5';
      ctx.fillText(t(compassDirection(az)), px, h - 9);
    }
  }
  for (const { a, b, state } of segments) {
    const ax = x(a.azimuth),
      bx = x(b.azimuth);
    if (Math.abs(ax - bx) > w) continue;
    ctx.setLineDash(state.candidate ? [] : [3, 4]);
    path(
      ctx,
      [
        [ax, y(a.elevation)],
        [bx, y(b.elevation)],
      ],
      state.candidate ? '#7febde' : state.blocked ? '#697c8a' : '#9aabc2',
      state.candidate ? 2.5 : 1.4
    );
  }
  ctx.setLineDash([]);
  if (point && spotX >= 0 && spotX <= w) {
    const state = observationState(point, profile),
      color = state.candidate ? '#b1ffee' : '#e5b988';
    if (state.candidate) {
      const glow = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, 17);
      glow.addColorStop(0, '#d9fff4');
      glow.addColorStop(0.16, '#68e3c7b0');
      glow.addColorStop(1, '#61e7c900');
      ctx.fillStyle = glow;
      ctx.fillRect(spotX - 18, spotY - 18, 36, 36);
      disc(ctx, spotX, spotY, 2.5, '#fff');
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.setLineDash(state.candidate ? [] : [3, 4]);
    ctx.beginPath();
    ctx.arc(spotX, spotY, 10, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      path(
        ctx,
        [
          [spotX + dx * 13, spotY + dy * 13],
          [spotX + dx * 18, spotY + dy * 18],
        ],
        color
      );
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const width = ctx.measureText(craftName).width;
    outlinedText(
      ctx,
      craftName,
      limit(spotX + 15, 6, w - width - 6),
      limit(spotY - 11, 15, h - 40),
      color
    );
  }
  return nearest;
}

export function earthTexture(image) {
  if (!image?.naturalWidth) return null;
  try {
    const tile = document.createElement('canvas');
    tile.width = 720;
    tile.height = 360;
    const ctx = tile.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, 720, 360);
    return ctx.getImageData(0, 0, 720, 360);
  } catch {
    return null;
  }
}
export function drawOrbitDisk(canvas, fixed, frame, texture, cache, time) {
  const surface = prepare(canvas);
  if (!surface) return;
  const { ctx, w, h } = surface,
    camera = reverseCamera(fixed),
    radius = Math.min(w * 0.4, h * 0.42),
    cx = w * 0.5,
    cy = h * 0.5 + 1;
  ctx.fillStyle = '#091725';
  ctx.fillRect(0, 0, w, h);
  if (!cache.raster || cache.texture !== texture || Math.abs(cache.time - time) > 3000) {
    const n = 144;
    cache.raster ??= document.createElement('canvas');
    cache.raster.width = cache.raster.height = n;
    const raster = cache.raster.getContext('2d'),
      pixels = raster.createImageData(n, n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const xx = ((i + 0.5) / n) * 2 - 1,
          yy = 1 - ((j + 0.5) / n) * 2,
          loc = diskSurface(camera, xx, yy);
        if (!loc) continue;
        const lon = Math.atan2(loc[1], loc[0]),
          lat = Math.asin(limit(loc[2], -1, 1)),
          out = (j * n + i) * 4;
        const shade = 0.48 + 0.48 * Math.sqrt(Math.max(0, 1 - xx * xx - yy * yy));
        if (texture) {
          const tx = Math.floor((lon / (2 * Math.PI) + 0.5) * texture.width) % texture.width;
          const ty = limit(
              Math.floor((0.5 - lat / Math.PI) * texture.height),
              0,
              texture.height - 1
            ),
            k = (ty * texture.width + tx) * 4;
          for (let ch = 0; ch < 3; ch++)
            pixels.data[out + ch] = texture.data[k + ch] * shade + [8, 17, 28][ch];
        } else {
          const grid = Math.min(Math.abs(Math.sin(lon * 18)), Math.abs(Math.sin(lat * 18))) < 0.08;
          const color = grid ? [64, 107, 129] : [26, 65, 89];
          for (let ch = 0; ch < 3; ch++) pixels.data[out + ch] = color[ch] * shade;
        }
        pixels.data[out + 3] = 255;
      }
    raster.putImageData(pixels, 0, 0);
    cache.time = time;
    cache.texture = texture;
  }
  ctx.drawImage(cache.raster, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.strokeStyle = '#7db5c1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([2, 4]);
  path(
    ctx,
    [
      [cx - radius, cy],
      [cx + radius, cy],
    ],
    'rgba(222,238,240,.3)'
  );
  path(
    ctx,
    [
      [cx, cy - radius],
      [cx, cy + radius],
    ],
    'rgba(222,238,240,.3)'
  );
  ctx.setLineDash([]);
  const target = diskPoint(camera, unit(frame.position)),
    siteX = cx + target.x * radius,
    siteY = cy - target.y * radius;
  disc(ctx, cx, cy, 2.5, '#fff');
  if (target.visible) {
    ctx.setLineDash([3, 3]);
    path(
      ctx,
      [
        [cx, cy],
        [siteX, siteY],
      ],
      '#cfdeb2'
    );
    ctx.setLineDash([]);
    disc(ctx, siteX, siteY, 5.5, '#102330');
    disc(ctx, siteX, siteY, 3.4, '#ffd099');
  }
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#a9c3ce';
  ctx.fillText(t('北'), cx, Math.max(11, cy - radius - 6));
}
