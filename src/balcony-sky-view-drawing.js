import stars from '../assets/stars.json' with { type: 'json' };
import names from '../assets/star-chart.json' with { type: 'json' };
import { getLanguage, t } from './i18n.js';
import { equatorial } from './environment-math.js';
import { dot, earthAxes, sunPosition } from './orbit.js';
import { lookAngles } from './pass-prediction.js';
import { compassDirection } from './pass-display.js';
import { groundBasis, horizonHeight, observationState } from './balcony-lab-geometry.js';
import { projectSky, skyAngles, skyDirection, skyRay } from './balcony-sky-view-math.js';

const DEG = Math.PI / 180,
  TAU = Math.PI * 2;
const limit = (v, min, max) => Math.max(min, Math.min(max, v));
let catalog;
function groundStars(frame, time) {
  if (!catalog) {
    const named = new Map(names.stars.map((star) => [star.id, star]));
    catalog = stars
      .filter((row) => row[3] <= 5.5)
      .map(([id, ra, dec, mag, bv]) => ({
        vector: equatorial(ra, dec),
        mag,
        name: named.get(id),
        color: Number(bv) > 0.85 ? '#ffdfb3' : Number(bv) < 0.12 ? '#b9d9ff' : '#e5eaff',
      }));
  }
  const basis = groundBasis(frame, time);
  return catalog.map((star) => {
    const dir = basis.map((axis) => dot(star.vector, axis));
    return { star, dir, ...skyAngles(dir) };
  });
}

function outlined(ctx, label, x, y, color) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(5,18,31,.86)';
  ctx.strokeText(label, x, y);
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
}
function line(ctx, view, vectors, color, width = 1, dash = []) {
  ctx.beginPath();
  let started = false;
  for (const v of vectors) {
    const p = projectSky(v, view);
    if (!p) {
      started = false;
      continue;
    }
    if (started) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
    started = true;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
}
const elevations = [-60, -30, 0, 30, 60];
const circles = elevations.map((e) =>
  Array.from({ length: 181 }, (_, i) => skyDirection(i * 2, e))
);
const meridians = Array.from({ length: 8 }, (_, i) =>
  Array.from({ length: 91 }, (_, j) => skyDirection(i * 45, -90 + j * 2))
);
function dotStar(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function colorSky(ray, profile, day, transparentGround) {
  const el = Math.asin(limit(ray[2], -1, 1)) / DEG;
  if (el < 0) {
    const d = limit(-el / 75, 0, 1);
    return transparentGround
      ? [19 - 9 * d, 21 - 8 * d, 42 - 12 * d]
      : [22 - 12 * d, 36 - 17 * d, 42 - 16 * d];
  }
  const az = (Math.atan2(ray[0], ray[1]) / DEG + 360) % 360,
    obstacle = horizonHeight(profile, az);
  if (el <= obstacle && obstacle > 0) return [30, 49, 57];
  const horizon = Math.exp(-Math.max(el, 0) / 20),
    air = 0.46 + 0.54 * horizon;
  return [
    6 + 28 * day + 22 * horizon + 18 * day * horizon,
    16 + 50 * day * air + 22 * horizon,
    34 + 79 * day * air + 31 * horizon,
  ];
}

// Reuse the background and horizontal star vectors while a pointer moves
// against an unchanged observation time. Rays for the bitmap, guides, picks
// and stars all use the same projection and the very same local sky basis.
export function createSkyPainter(canvas) {
  const backdrop = document.createElement('canvas'),
    back = backdrop.getContext('2d');
  let ground = [],
    starFrame,
    starTime,
    skyline,
    skylinePoints = [],
    backgroundKey = '',
    backgroundProfile;
  function fillBackdrop(view, day, profile, transparentGround) {
    const { width: w, height: h } = view,
      sw = Math.max(1, Math.round(Math.min(250, w / 2))),
      sh = Math.max(1, Math.round((sw * h) / w));
    const key = [
      view.mode,
      sw,
      sh,
      view.scale,
      ...view.forward,
      ...view.up,
      Math.round(day * 96),
      transparentGround,
    ].join('|');
    if (key === backgroundKey && backgroundProfile === profile) return;
    backgroundKey = key;
    backgroundProfile = profile;
    if (backdrop.width !== sw || backdrop.height !== sh) {
      backdrop.width = sw;
      backdrop.height = sh;
    }
    const img = back.createImageData(sw, sh),
      bits = img.data;
    for (let y = 0, offset = 0; y < sh; y++)
      for (let x = 0; x < sw; x++, offset += 4) {
        const ray = skyRay(((x + 0.5) / sw) * w, ((y + 0.5) / sh) * h, view);
        const color =
          ray && (view.mode === 'sphere' || ray[2] >= 0)
            ? colorSky(ray, profile, day, transparentGround)
            : [7, 15, 26];
        bits[offset] = color[0];
        bits[offset + 1] = color[1];
        bits[offset + 2] = color[2];
        bits[offset + 3] = 255;
      }
    back.putImageData(img, 0, 0);
  }
  return function draw(data, view, pose, belowHorizon = true) {
    const { point, time, frame, profile, segments, craftName } = data;
    const w = view.width,
      h = view.height,
      ctx = canvas.getContext('2d');
    if (!ctx || w < 2 || h < 2) return null;
    const ratio = Math.min(2, window.devicePixelRatio || 1),
      cw = Math.max(1, Math.round(w * ratio)),
      ch = Math.max(1, Math.round(h * ratio));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    ctx.setTransform(cw / w, 0, 0, ch / h, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.textBaseline = 'alphabetic';
    let solar = point?.sunElevation ?? data.sunElevation;
    if (!Number.isFinite(solar)) {
      const sun = sunPosition(time);
      solar = lookAngles(
        earthAxes(time).map((axis) => dot(axis, sun)),
        frame
      ).elevation;
    }
    const day = limit((solar + 17) / 21, 0, 1),
      dark = limit((-solar + 1) / 11, 0, 1);
    const transparentGround = view.mode === 'sphere' && belowHorizon;
    fillBackdrop(view, day, profile, transparentGround);
    ctx.drawImage(backdrop, 0, 0, w, h);
    ctx.save();
    if (view.mode === 'hemisphere') {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, view.radius, 0, TAU);
      ctx.clip();
    }
    if (frame !== starFrame || time !== starTime) {
      starFrame = frame;
      starTime = time;
      ground = groundStars(frame, time);
    }
    if (skyline !== profile) {
      skyline = profile;
      const az = [
        ...new Set([...Array.from({ length: 181 }, (_, i) => i * 2), ...profile.map(([a]) => a)]),
      ].sort((a, b) => a - b);
      skylinePoints = az.map((a) => skyDirection(a, horizonHeight(profile, a)));
    }
    const marker = point ? skyDirection(point.azimuth, point.elevation) : null,
      spot = marker ? projectSky(marker, view) : null,
      labels = [];
    let near = null;
    for (const { dir, star, elevation, azimuth } of ground) {
      const below = elevation < 0 && transparentGround;
      if (!below && elevation <= horizonHeight(profile, azimuth)) continue;
      const name = star.name?.[getLanguage()] || star.name?.en;
      if (!below && marker && name && star.mag < 2.4 && dark > 0.5) {
        const angle = Math.acos(limit(dot(marker, dir), -1, 1)) / DEG;
        if (!near || angle < near.angle) near = { name, angle };
      }
      // Below the horizon this is a teaching view of the celestial sphere:
      // map the actual stars independently of above-ground daylight extinction.
      const weight = below ? 0.77 : dark * Math.min(1, (elevation + 8) / 22);
      const alpha = limit((1.05 - star.mag * 0.115) * weight, 0, 1);
      if (alpha < 0.06) continue;
      const p = projectSky(dir, view);
      if (!p || p.x < 0 || p.y < 0 || p.x > w || p.y > h) continue;
      ctx.globalAlpha = alpha;
      dotStar(ctx, p.x, p.y, limit(1.5 - star.mag * 0.18, 0.48, 2.1), star.color);
      if (star.mag < 0.5) {
        ctx.globalAlpha = alpha * 0.2;
        dotStar(ctx, p.x, p.y, 3.3, star.color);
      }
      if (name && alpha > 0.35 && star.mag < 2) labels.push({ ...p, name });
    }
    ctx.globalAlpha = 1;
    for (const [i, e] of elevations.entries()) {
      if (view.mode === 'hemisphere' && e < 0) continue;
      line(
        ctx,
        view,
        circles[i],
        e === 0 ? '#849b9f' : 'rgba(169,197,213,.23)',
        e === 0 ? 1.15 : 0.8,
        e === 0 ? [] : [2, 6]
      );
    }
    for (const meridian of meridians)
      line(ctx, view, meridian, 'rgba(148,186,204,.24)', 0.8, [2, 6]);
    if (profile.length) line(ctx, view, skylinePoints, '#a4b7af', 1.35);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let az = 0; az < 360; az += 45) {
      const cardinal = az % 90 === 0,
        p = projectSky(skyDirection(az, cardinal ? 4 : 7), view);
      if (!p || p.x < 10 || p.x > w - 10 || p.y < 9 || p.y > h - 7) continue;
      outlined(ctx, t(compassDirection(az)), p.x, p.y + 3, cardinal ? '#e2e5d9' : '#a8bcc0');
    }
    const zenith = projectSky([0, 0, 1], view),
      nadir = projectSky([0, 0, -1], view);
    if (zenith && zenith.x > 25 && zenith.x < w - 25 && zenith.y > 16 && zenith.y < h - 6)
      outlined(ctx, t('天顶'), zenith.x, zenith.y - 7, '#a3bbc2');
    if (nadir && nadir.x > 22 && nadir.x < w - 22 && nadir.y > 14 && nadir.y < h - 9)
      outlined(ctx, t('天底'), nadir.x, nadir.y - 7, '#b7c8be');
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const occupied = [];
    for (const item of labels) {
      const x = item.x + 5,
        y = item.y - 5,
        ww = ctx.measureText(item.name).width;
      if (
        x < 5 ||
        x + ww > w - 7 ||
        y < 15 ||
        y > h - 14 ||
        (spot && Math.hypot(x - spot.x, y - spot.y) < 40) ||
        occupied.some((q) => Math.abs(y - q.y) < 14 && x < q.x + q.w + 7 && x + ww > q.x - 7)
      )
        continue;
      outlined(ctx, item.name, x, y, '#b1c4d4');
      occupied.push({ x, y, w: ww });
    }
    for (const { a, b, state } of segments) {
      const start = skyDirection(a.azimuth, a.elevation),
        end = skyDirection(b.azimuth, b.elevation);
      // Fragment long, near-zenith segments to follow the shorter great-circle arc.
      const count = Math.max(1, Math.ceil(Math.acos(limit(dot(start, end), -1, 1)) / (2 * DEG))),
        samples = [];
      for (let i = 0; i <= count; i++) {
        const f = i / count,
          v = start.map((x, j) => x + (end[j] - x) * f),
          n = Math.hypot(...v);
        if (n > 0) samples.push(v.map((x) => x / n));
      }
      line(
        ctx,
        view,
        samples,
        state.candidate ? '#7febde' : state.blocked ? '#85999b' : '#9cabc2',
        state.candidate ? 2.4 : 1.35,
        state.candidate ? [] : [3, 4]
      );
    }
    if (spot && spot.x >= 0 && spot.x <= w && spot.y >= 0 && spot.y <= h) {
      const state = observationState(point, profile),
        color = state.candidate ? '#b3fff2' : '#ffca8f';
      if (state.candidate) {
        const glow = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, 15);
        glow.addColorStop(0, '#edfff7');
        glow.addColorStop(0.19, '#79ebd9af');
        glow.addColorStop(1, '#63dfc800');
        ctx.fillStyle = glow;
        ctx.fillRect(spot.x - 15, spot.y - 15, 30, 30);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(state.candidate ? [] : [3, 4]);
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 9, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      const name = state.blocked ? craftName + ' · ' + t('遮挡') : craftName,
        weight = ctx.measureText(name).width;
      outlined(
        ctx,
        name,
        limit(spot.x + 12, 5, w - weight - 6),
        limit(spot.y - 10, 16, h - 9),
        color
      );
    }
    ctx.restore();
    if (view.mode === 'hemisphere') {
      ctx.strokeStyle = '#6a828b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, view.radius, 0, TAU);
      ctx.stroke();
    }
    if (view.mode === 'sphere') {
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const msg = t(transparentGround ? '地平线以下 · 天球透视' : '地平线以下 · 天体不可见'),
        pad = ctx.measureText(msg).width / 2 + 8;
      const positions = [
        [w / 2, h - 12],
        [w / 2, h * 0.8],
        [pad, h / 2],
        [w - pad, h / 2],
        [w / 2, 22],
      ];
      const groundTag = positions.find(([x, y]) => skyRay(x, y, view)[2] < -0.07);
      if (groundTag) outlined(ctx, msg, groundTag[0], groundTag[1], '#cad8c8');
    }
    // Keep a fixed orientation readout even when the current target is out of frame.
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const poleLabel = pose.elevation > 89.95 ? '天顶' : pose.elevation < -89.95 ? '天底' : null;
    const attitude = poleLabel
      ? t(poleLabel) + ' ' + Math.round(pose.elevation) + '°'
      : t(compassDirection(pose.azimuth)) +
        ' ' +
        Math.round(pose.azimuth) +
        '° / ' +
        Math.round(pose.elevation) +
        '°';
    const labelWidth = ctx.measureText(attitude).width;
    ctx.fillStyle = 'rgba(6,17,27,.8)';
    ctx.fillRect(5, 5, labelWidth + 12, 21);
    ctx.fillStyle = '#b9d7dd';
    ctx.fillText(attitude, 11, 19);
    return near;
  };
}
