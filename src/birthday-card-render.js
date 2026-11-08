import * as THREE from 'three';
import hipStars from '../assets/stars.json';
import { getSkyCulture } from './sky-cultures.js';
import { equatorial } from './environment-math.js';
import { constellationArtMesh } from './constellation-art-math.js';
import { ConstellationArtLayer } from './constellation-art-layer.js';

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const unit = (a) => {
  const length = Math.hypot(...a);
  return a.map((value) => value / length);
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const font = '"Songti SC", "Noto Serif CJK SC", "STSong", serif';
const sans = '"PingFang SC", "Microsoft YaHei", sans-serif';
const skyStars = hipStars.map(([id, ra, dec, mag, bv]) => ({
  id,
  mag,
  bv: Number(bv),
  direction: equatorial(ra, dec),
}));
const credit = {
  western:
    'Illustration: Johan Meuris / Stellarium · Free Art License. Star chart: d3-celestial · BSD-3-Clause.',
  chinese:
    'Chinese star data: Stellarium · CC BY-SA 4.0. Modern AI-assisted artwork: StarOrbit · CC BY-NC 4.0.',
};

export function configureBirthdayArtworkRenderer(renderer) {
  renderer.setPixelRatio(1);
  // ConstellationArtLayer deliberately preserves destination alpha. Clear to
  // opaque black so its additive RGB survives canvas drawImage; screen blending
  // below makes this black background neutral against the card's navy field.
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
}

export function birthdayCardInscription(options) {
  const sender = String(options.sender || '').trim();
  if ([...sender].length > 40) throw Error('赠送人姓名请控制在 40 字以内');
  const giftDate = String(options.giftDate || '').trim();
  if (giftDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(giftDate);
    const [year, month, day] = match ? match.slice(1).map(Number) : [];
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (!match || year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1])
      throw Error('请选择有效的赠予日期');
  }
  const formatDate = (value) => String(value || '').replaceAll('-', ' · ');
  const pure = options.layout === 'sky';
  return {
    sender,
    giftDate,
    birthday: pure ? '' : `生辰 ${formatDate(options.date)}`,
    signature: pure
      ? ''
      : [sender ? `来自 ${sender}` : '', giftDate ? formatDate(giftDate) : '']
          .filter(Boolean)
          .join('  ·  '),
  };
}

/** Separate gnomonic camera for a commemorative chart, never an orbit epoch. */
export function birthdaySkyView(frame, target, aspect = 1.5) {
  const forward = [...frame.center];
  const right = unit(cross(forward, Math.abs(forward[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1]));
  const up = unit(cross(right, forward));
  const mesh = constellationArtMesh(frame, 16),
    directions = [];
  for (let i = 0; i < mesh.positions.length; i += 3)
    directions.push(Array.from(mesh.positions.slice(i, i + 3)));
  for (const path of target.lines || [])
    for (const [ra, dec] of path) directions.push(equatorial(ra, dec));
  for (const star of target.members || []) directions.push(equatorial(star.ra, star.dec));
  let tangent = 0.03;
  for (const direction of directions) {
    const z = dot(direction, forward);
    if (z <= 0.05) throw Error('目标天区跨度过大，暂不能生成生日卡');
    tangent = Math.max(
      tangent,
      Math.abs(dot(direction, right) / z) / aspect,
      Math.abs(dot(direction, up) / z)
    );
  }
  tangent *= 1.12;
  return { forward, right, up, aspect, fovY: (2 * Math.atan(tangent) * 180) / Math.PI };
}

export function projectBirthdayStar(direction, view, width, height) {
  const z = dot(direction, view.forward);
  if (z <= 0) return null;
  const tangent = Math.tan((view.fovY * Math.PI) / 360);
  return [
    width * (0.5 + dot(direction, view.right) / z / tangent / view.aspect / 2),
    height * (0.5 - dot(direction, view.up) / z / tangent / 2),
  ];
}

function roundRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function text(ctx, value, x, y, size, color = '#eadbbf', family = sans, maxWidth) {
  value = String(value || '');
  ctx.fillStyle = color;
  ctx.font = `${size}px ${family}`;
  if (maxWidth) {
    while (size > 12 && ctx.measureText(value).width > maxWidth) {
      size -= 1;
      ctx.font = `${size}px ${family}`;
    }
  }
  ctx.fillText(value, x, y);
}

function paragraph(ctx, value, x, y, width, size, lineHeight, maxLines, color, family = sans) {
  ctx.font = `${size}px ${family}`;
  const lines = [];
  let line = '';
  for (const char of String(value || '')) {
    if (char === '\n' || (line && ctx.measureText(line + char).width > width)) {
      lines.push(line);
      line = char === '\n' ? '' : char;
    } else line += char;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  lines.forEach((row, index) => text(ctx, row, x, y + index * lineHeight, size, color, family));
  return lines.length;
}

// Personal wishes are never silently shortened. Fit the entire text into the
// reserved footer; reject pathological line-break input rather than lose words.
export function fitBirthdayWish(ctx, value, width, initialSize, height) {
  value = String(value || '');
  if ([...value].length > 120) throw Error('祝福语请控制在 120 字以内');
  for (let size = initialSize; size >= 18; size--) {
    ctx.font = `${size}px ${font}`;
    const lines = [];
    let line = '';
    for (const char of value) {
      if (char === '\n' || (line && ctx.measureText(line + char).width > width)) {
        lines.push(line);
        line = char === '\n' ? '' : char;
      } else line += char;
    }
    if (line) lines.push(line);
    const lineHeight = size * 1.5;
    if (lines.length * lineHeight <= height) return { lines, size, lineHeight };
  }
  throw Error('祝福语换行过多，请减少换行后再生成');
}

function wishParagraph(ctx, value, x, y, width, initialSize, height, color) {
  const { lines, size, lineHeight } = fitBirthdayWish(ctx, value, width, initialSize, height);
  lines.forEach((row, index) => text(ctx, row, x, y + index * lineHeight, size, color, font));
}

function background(ctx, width, height) {
  ctx.fillStyle = '#060c16';
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(
    width * 0.4,
    height * 0.44,
    0,
    width * 0.5,
    height * 0.5,
    width * 0.85
  );
  glow.addColorStop(0, '#172c42');
  glow.addColorStop(0.55, '#0b1728');
  glow.addColorStop(1, '#060c16');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function stellarField(ctx, box, view, target, lines, brightness) {
  const { x, y, w, h } = box;
  ctx.save();
  ctx.translate(x, y);
  roundRect(ctx, 0, 0, w, h, w * 0.025);
  ctx.clip();
  const memberIDs = new Set(target.primaryMemberHips || target.lineMemberHips || []);
  const members = new Map(
    (target.members || []).filter((star) => memberIDs.has(star.id)).map((star) => [star.id, star])
  );
  const all = [...skyStars];
  for (const [id, star] of members)
    if (!all.some((candidate) => candidate.id === id))
      all.push({ ...star, direction: equatorial(star.ra, star.dec) });
  const ratio = w / 1100;
  for (const star of all) {
    const point = projectBirthdayStar(star.direction, view, w, h);
    if (
      !point ||
      point[0] < 0 ||
      point[0] > w ||
      point[1] < 0 ||
      point[1] > h ||
      (star.mag > 7.4 && !memberIDs.has(star.id))
    )
      continue;
    const major = memberIDs.has(star.id),
      radius = clamp((5.9 - star.mag) * 0.25 + 0.65, 0.34, 2.2) * ratio;
    const alpha = major ? 0.95 : clamp((8.1 - star.mag) * 0.105, 0.15, 0.78);
    ctx.fillStyle = star.bv > 0.8 ? `rgba(246,209,161,${alpha})` : `rgba(206,224,249,${alpha})`;
    if (star.mag < 2 || (major && star.mag < 5)) {
      const halo = ctx.createRadialGradient(...point, 0, ...point, radius * 6);
      halo.addColorStop(0, 'rgba(208,225,255,.28)');
      halo.addColorStop(1, 'rgba(208,225,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(...point, radius * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8ebd5';
    }
    ctx.beginPath();
    ctx.arc(...point, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (lines) {
    ctx.strokeStyle = 'rgba(221,198,153,.42)';
    ctx.lineWidth = Math.max(0.65, ratio * 0.95);
    for (const path of target.lines || []) {
      ctx.beginPath();
      let started = false;
      for (const [ra, dec] of path) {
        const point = projectBirthdayStar(equatorial(ra, dec), view, w, h);
        if (!point) {
          started = false;
          continue;
        }
        if (started) ctx.lineTo(...point);
        else ctx.moveTo(...point);
        started = true;
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function locate(environment, item) {
  const culture = item.culture === 'chinese' ? 'chinese' : 'western';
  const target = getSkyCulture(culture).asterisms.find(
    (candidate) => candidate.targetId === item.targetId
  );
  const frames = environment?.constellationArt?.cultures.get(culture)?.frames || [];
  const frame =
    frames.find((candidate) => candidate.record.imageId === item.artworkId) ||
    frames.find(
      (candidate) =>
        candidate.record.kind !== 'symbols' &&
        (candidate.record.targetIds?.includes(item.targetId) ||
          candidate.record.constellationIds?.includes(item.targetId?.split(':').pop()))
    );
  if (!target || !frame?.record.url) throw Error('生日卡对应的星图或插画暂不可用');
  return { item, target, frame, culture };
}

/**
 * Produces the preview and PNG together. The caller must download this same blob,
 * not rerender against mutable inputs. No simulation/culture state is changed.
 */
export async function renderBirthdayCard(options) {
  const environment = options.environment || options.env;
  const mode = options.mode || 'dual';
  const supplied =
    options.items ||
    (mode === 'western'
      ? [options.western]
      : mode === 'chinese'
        ? [options.mansion]
        : [options.western, options.mansion]);
  if (
    !Array.isArray(supplied) ||
    !supplied.length ||
    supplied.length > 2 ||
    supplied.some((item) => !item)
  )
    throw Error('请先计算有效的生日星座与星宿');
  // Freeze plain content before the first fetch; environment is read only for assets.
  const items = supplied.map((item) => structuredClone(item));
  const entries = items.map((item) => locate(environment, item));
  const dual = entries.length === 2,
    pure = options.layout === 'sky';
  const width = Math.round(clamp(Number(options.width) || (dual ? 2400 : 1800), 800, 3840));
  const height = Math.round(width * (pure ? (dual ? 0.58 : 0.75) : dual ? 0.625 : 4 / 3));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('浏览器无法生成生日卡');
  const name = String(options.name || '').trim();
  if ([...name].length > 40) throw Error('姓名或昵称请控制在 40 字以内');
  const date = String(options.date || '');
  const inscription = birthdayCardInscription(options);
  const blessings = structuredClone(options.blessings || {});
  const brightness = structuredClone(options.brightness ?? options.artBrightness ?? {});
  const showExplanation = options.showExplanation !== false;
  const showBlessing = options.showBlessing !== false;
  const showLines = options.showLines !== false;
  const controller = new AbortController();
  const signal = controller.signal;
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 30000);
  let renderer;
  const loaded = [];
  try {
    await document.fonts?.ready;
    for (const entry of entries) {
      signal.throwIfAborted();
      loaded.push({ ...entry, ...(await environment.constellationArt.load(entry.frame, signal)) });
    }
    signal.throwIfAborted();
    background(ctx, width, height);
    const s = width / (dual ? 2400 : 1800);
    ctx.save();
    ctx.scale(s, s);
    const W = width / s,
      H = height / s;
    ctx.strokeStyle = 'rgba(205,176,126,.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, 35, 35, W - 70, H - 70, 24);
    ctx.stroke();
    ctx.textAlign = 'center';
    if (!pure) {
      text(
        ctx,
        'S T A R O R B I T   /   星 河 生 辰',
        W / 2,
        dual ? 94 : 128,
        dual ? 19 : 22,
        '#af9e81'
      );
      text(
        ctx,
        name ? `致 ${name}` : '星河为你而来',
        W / 2,
        dual ? 158 : 225,
        dual ? 37 : 50,
        '#f2e7d2',
        font,
        W - 200
      );
      text(ctx, inscription.birthday, W / 2, dual ? 207 : 290, dual ? 21 : 27, '#a9b7c6');
    }
    if (dual) {
      ctx.beginPath();
      ctx.moveTo(W / 2, pure ? 90 : 290);
      ctx.lineTo(W / 2, H - 130);
      ctx.strokeStyle = 'rgba(205,176,126,.22)';
      ctx.stroke();
    }
    ctx.restore();
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    configureBirthdayArtworkRenderer(renderer);
    const camera = new THREE.Camera();
    for (let index = 0; index < loaded.length; index++) {
      signal.throwIfAborted();
      const entry = loaded[index],
        { item, culture, target, frame } = entry;
      const cx = dual ? (index ? 1780 : 620) : 900;
      const box = pure
        ? { x: dual ? index * 1200 + 85 : 85, y: 80, w: dual ? 1030 : 1630, h: H - 210 }
        : {
            x: dual ? index * 1160 + 110 : 120,
            y: dual ? 435 : 560,
            w: dual ? 1020 : 1560,
            h: dual ? 610 : 1070,
          };
      const pixelBox = Object.fromEntries(
        Object.entries(box).map(([key, value]) => [key, value * s])
      );
      const view = birthdaySkyView(frame, target, box.w / box.h);
      // Same shader and registered mesh as main/finder views. Stars below use
      // precisely the same camera axes, tangent and viewport dimensions.
      const proxy = {
        update: () => [{ ...entry, born: performance.now() - 1000 }],
        status: () => ({ ready: 1 }),
        release() {},
      };
      const layer = new ConstellationArtLayer(proxy, 'birthday');
      try {
        renderer.setSize(Math.round(pixelBox.w), Math.round(pixelBox.h), false);
        layer.update(view, true, { culture, asterisms: true, symbols: false });
        const level = typeof brightness === 'number' ? brightness : brightness[culture];
        const gain = Number.isFinite(level) ? clamp(level, 0, 2) : 1;
        for (const mesh of layer.meshes.values())
          mesh.material.uniforms.opacity.value = clamp(
            (frame.record.opacity ?? 0.22) * 2.5 * gain,
            0,
            1
          );
        renderer.render(layer.scene, camera);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(renderer.domElement, pixelBox.x, pixelBox.y, pixelBox.w, pixelBox.h);
        ctx.restore();
        stellarField(ctx, pixelBox, view, target, showLines, gain);
      } finally {
        layer.dispose();
      }
      ctx.save();
      ctx.scale(s, s);
      ctx.textAlign = 'center';
      if (!pure) {
        const cn = culture === 'chinese';
        text(
          ctx,
          cn ? '中 国 传 统 值 日 星 宿' : '西 方 生 日 星 座',
          cx,
          dual ? 291 : 373,
          dual ? 18 : 23,
          '#a8916a'
        );
        text(
          ctx,
          item.zh,
          cx,
          dual ? 359 : 466,
          dual ? 65 : 94,
          '#f2e5cc',
          font,
          dual ? 920 : 1440
        );
        const subtitle = cn
          ? `${item.fullName}  ·  ${item.themeName}第${['', '一', '二', '三', '四', '五', '六', '七'][item.orderInTheme]}宿`
          : item.en;
        text(
          ctx,
          subtitle,
          cx,
          dual ? 404 : 523,
          dual ? 22 : 30,
          '#b8aa92',
          sans,
          dual ? 910 : 1450
        );
        ctx.beginPath();
        ctx.moveTo(cx - 65, dual ? 1091 : 1698);
        ctx.lineTo(cx + 65, dual ? 1091 : 1698);
        ctx.strokeStyle = '#a88d63';
        ctx.lineWidth = 1.3;
        ctx.stroke();
        if (showExplanation)
          paragraph(
            ctx,
            item.description,
            cx,
            dual ? 1140 : 1760,
            dual ? 920 : 1400,
            dual ? 24 : 30,
            dual ? 37 : 48,
            dual ? 2 : 3,
            '#b4c0cc'
          );
        if (showBlessing) {
          const wish = blessings[culture] ?? blessings[item.id] ?? item.blessings?.[0] ?? '';
          wishParagraph(
            ctx,
            wish,
            cx,
            dual ? 1260 : 1995,
            dual ? 910 : 1410,
            dual ? 32 : 47,
            dual ? 132 : 235,
            '#e8d4b0'
          );
        }
      }
      ctx.restore();
    }
    ctx.save();
    ctx.scale(s, s);
    ctx.textAlign = 'center';
    if (inscription.signature)
      text(ctx, inscription.signature, W / 2, H - 104, dual ? 26 : 30, '#c4b393', font, W - 200);
    const credits = [...new Set(entries.map((entry) => credit[entry.culture]))];
    credits.forEach((row, i) =>
      text(ctx, row, W / 2, H - 61 + i * 19, dual ? 14 : 16, '#748294', sans, W - 110)
    );
    ctx.restore();
    signal.throwIfAborted();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('生日卡图片生成失败');
    signal.throwIfAborted();
    return {
      canvas,
      blob,
      metadata: {
        width,
        height,
        date,
        name,
        sender: inscription.sender,
        giftDate: inscription.giftDate,
        layout: pure ? 'sky' : 'card',
        targetIds: entries.map((entry) => entry.target.targetId),
        frame: 'ICRS/J2000 commemorative composition; not a birth-time horizon view',
        credits,
      },
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
    for (const entry of loaded) {
      entry.texture.dispose();
      entry.image.close();
    }
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
