import * as THREE from 'three';
import { birthdayCardInscription, birthdaySkyView } from './birthday-card-render.js';
import { birthdaySkyFrame } from './birthday-sky-frame.js';
import { createXuntianViewRenderer } from './xuntian-view-render.js';
import { getSkyCulture } from './sky-cultures.js';
import { normalizeStarChartSettings } from './star-chart-settings.js';
import { ConstellationArt } from './constellation-art.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const font = '"Songti SC", "Noto Serif CJK SC", "STSong", serif';

export function birthdayBackLayout({ count, layout, width }) {
  if (count !== 1 && count !== 2) throw Error('请选择一个或两个生日天区');
  const dual = count === 2,
    pure = layout === 'sky';
  const w = Math.round(clamp(Number(width) || (dual ? 2400 : 1800), 800, 3840));
  const h = Math.round(w * (pure ? (dual ? 0.58 : 0.75) : dual ? 0.625 : 4 / 3));
  const scale = w / (dual ? 2400 : 1800),
    W = w / scale,
    H = h / scale;
  const margin = pure ? 24 : 48,
    gap = dual ? 28 : 0;
  const panelWidth = (W - margin * 2 - gap) / count;
  const y = pure ? 24 : dual ? 210 : 240;
  const panelHeight = H - y - (pure ? 94 : dual ? 160 : 210);
  return {
    width: w,
    height: h,
    scale,
    W,
    H,
    pure,
    dual,
    panels: Array.from({ length: count }, (_, i) => ({
      x: margin + i * (panelWidth + gap),
      y,
      w: panelWidth,
      h: panelHeight,
    })),
  };
}

export function birthdayBackSettings(options, culture) {
  const names = options.backLabels !== false;
  return normalizeStarChartSettings({
    skyCulture: culture,
    starChartEnabled: true,
    starLabels: names,
    catalogStarLabels: false,
    solarSystemLabels: names,
    constellationNames: names,
    constellationLines: options.showLines !== false,
    constellationArt: options.backArtwork === true,
    chineseSymbolArt: false,
    constellationBoundaries: false,
    equatorialGrid: false,
    eclipticLine: false,
    deepSkyObjects: false,
    starLabelDensity: 0.52,
    westernArtBrightness: options.brightness?.western ?? 1,
    chineseArtBrightness: options.brightness?.chinese ?? 1,
  });
}

function fittedText(ctx, value, x, y, size, width, color = '#eee2cc') {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  while (size > 12 && ctx.measureText(value).width > width) ctx.font = `${--size}px ${font}`;
  ctx.fillText(value, x, y);
}

function locate(environment, item) {
  const target = getSkyCulture(item.culture).asterisms.find((x) => x.targetId === item.targetId);
  const frame = environment.constellationArt?.cultures
    .get(item.culture)
    ?.frames.find((x) => x.record.imageId === item.artworkId);
  if (!target || !frame) throw Error('生日背面对应的天区暂不可用');
  return { item, target, frame };
}

function abortable(work, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason || new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
    Promise.resolve(work)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', stop));
  });
}

async function galaxyFor(environment, renderer, signal) {
  // Borrow the exact software panorama when present. If the main view has it
  // disabled, load a private cube without toggling its settings or load ticket.
  if (environment.galaxyTexture?.image?.length === 6)
    return { texture: environment.galaxyTexture, owned: false };
  const max = renderer.capabilities.maxCubemapSize;
  const level = max >= 2048 && environment.assets?.sky?.[8] ? 8 : 4;
  const urls = environment.assets?.sky?.[level];
  if (max < 1024 || !urls?.length) throw Error('银河背景暂不可用，请待星空资源加载后重试');
  const texture = await new THREE.CubeTextureLoader().loadAsync(urls);
  if (signal.aborted) {
    texture.dispose();
    signal.throwIfAborted();
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return { texture, owned: true };
}

/** Existing software sky camera, frozen at the birthday epoch, in a private
 * capture context. Main time, camera, culture and display settings stay intact. */
export async function renderBirthdayBack(options) {
  const environment = options.environment || options.env || options.sim?.environment;
  const renderer = options.renderer || options.sim?.api?.renderer;
  if (!environment || !renderer) throw Error('星空场景尚未就绪');
  const supplied =
    options.items ||
    (options.mode === 'western'
      ? [options.western]
      : options.mode === 'chinese'
        ? [options.mansion]
        : [options.western, options.mansion]);
  if (!Array.isArray(supplied) || supplied.some((x) => !x)) throw Error('请先计算生日天区');
  const items = structuredClone(supplied);
  const frozen = {
    ...options,
    items,
    date: String(options.date || ''),
    time: String(options.time || ''),
    utcOffset: Number(options.utcOffset ?? 8),
    name: String(options.name || '').trim(),
    sender: String(options.sender || '').trim(),
    giftDate: String(options.giftDate || ''),
    brightness: structuredClone(options.brightness || {}),
  };
  if ([...frozen.name].length > 40) throw Error('姓名或昵称请控制在 40 字以内');
  const inscription = birthdayCardInscription(frozen);
  const layout = birthdayBackLayout({
    count: items.length,
    layout: frozen.layout,
    width: frozen.width,
  });
  const entries = items.map((item) => locate(environment, item));
  const plans = entries.map((entry, i) => {
    const box = layout.panels[i];
    const view = birthdaySkyView(entry.frame, entry.target, box.w / box.h);
    // A little surrounding sky gives small asterisms context while preserving
    // the same fixed ICRS axes and all of the target's registered footprint.
    view.fovY = Math.max(28, view.fovY);
    const chartSettings = birthdayBackSettings(frozen, entry.item.culture);
    const frame = birthdaySkyFrame({
      date: frozen.date,
      time: frozen.time,
      utcOffset: frozen.utcOffset,
      view,
      culture: entry.item.culture,
      targetId: entry.item.targetId,
      chartSettings,
      language: frozen.language || 'zh',
    });
    frame.photoNames =
      frozen.backLabels !== false || frozen.showLines !== false || frozen.backArtwork === true;
    return { ...entry, box, view, captureFrame: frame };
  });
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const signal = controller.signal;
  const timer = setTimeout(abort, 60000);
  let galaxy, capture, privateArt;
  const stopCapture = () => capture?.dispose();
  signal.addEventListener('abort', stopCapture);
  try {
    signal.throwIfAborted();
    await abortable(document.fonts?.ready, signal);
    galaxy = await abortable(galaxyFor(environment, renderer, signal), signal);
    signal.throwIfAborted();
    if (frozen.backArtwork === true) {
      const records = (culture) =>
        entries.filter((x) => x.item.culture === culture).map((x) => x.frame.record);
      privateArt = new ConstellationArt(
        { images: records('western') },
        { chinese: { images: records('chinese') } }
      );
    }
    const skyEnvironment = Object.assign(Object.create(environment), {
      galaxyTexture: galaxy.texture,
      skyDetail: null,
      constellationArt: privateArt || null,
      settings: { ...environment.settings, stars: true, milky: true, exposure: 'cinematic' },
    });
    const sim = { api: { ...options.sim?.api, renderer }, environment: skyEnvironment };
    const canvas = document.createElement('canvas');
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('浏览器无法生成生日背面');
    ctx.fillStyle = '#030813';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const plan of plans) {
      signal.throwIfAborted();
      if (privateArt) {
        const state = await abortable(
          privateArt.prepare('birthday-back-' + plan.item.targetId, plan.view, true, 15000, {
            culture: plan.item.culture,
            asterisms: true,
            symbols: false,
            focusTargetId: plan.item.targetId,
          }),
          signal
        );
        if (!state.complete || state.ready !== 1) throw Error('生日背面插画加载失败，请重试');
      }
      const captureCanvas = document.createElement('canvas');
      capture = createXuntianViewRenderer(sim, captureCanvas, { skyOnly: true });
      try {
        const width = Math.round(plan.box.w * layout.scale);
        const blob = await abortable(capture.capture(plan.captureFrame, { width }), signal);
        signal.throwIfAborted();
        const bitmap = await createImageBitmap(blob);
        try {
          signal.throwIfAborted();
          const box = plan.box,
            s = layout.scale;
          ctx.drawImage(bitmap, box.x * s, box.y * s, box.w * s, box.h * s);
          ctx.save();
          ctx.scale(s, s);
          ctx.strokeStyle = 'rgba(196,174,129,.3)';
          ctx.lineWidth = 1;
          ctx.strokeRect(box.x, box.y, box.w, box.h);
          if (!layout.pure) {
            const shade = ctx.createLinearGradient(0, box.y, 0, box.y + 115);
            shade.addColorStop(0, 'rgba(1,6,15,.85)');
            shade.addColorStop(1, 'rgba(1,6,15,0)');
            ctx.fillStyle = shade;
            ctx.fillRect(box.x, box.y, box.w, 115);
            ctx.textAlign = 'center';
            fittedText(
              ctx,
              plan.item.zh +
                (plan.item.fullName ? ' · ' + plan.item.fullName : ' · ' + plan.item.en),
              box.x + box.w / 2,
              box.y + 51,
              layout.dual ? 33 : 43,
              box.w - 90
            );
          }
          ctx.restore();
        } finally {
          bitmap.close();
        }
      } finally {
        capture.dispose();
        capture = null;
      }
    }
    ctx.save();
    ctx.scale(layout.scale, layout.scale);
    ctx.textAlign = 'center';
    const { W, H, dual, pure } = layout;
    if (!pure) {
      fittedText(
        ctx,
        frozen.name ? `致 ${frozen.name} · 星河留影` : '星河留影',
        W / 2,
        dual ? 86 : 100,
        dual ? 40 : 48,
        W - 180
      );
      const moment = plans[0].captureFrame.moment;
      const offset = frozen.utcOffset >= 0 ? '+' + frozen.utcOffset : String(frozen.utcOffset);
      const timeLabel = moment?.localTime || frozen.time || '20:00';
      fittedText(
        ctx,
        `${inscription.birthday}  ${timeLabel}  UTC${offset}`,
        W / 2,
        dual ? 144 : 165,
        dual ? 24 : 28,
        W - 180,
        '#adbacb'
      );
      if (inscription.signature)
        fittedText(ctx, inscription.signature, W / 2, H - 104, dual ? 26 : 30, W - 200, '#c4b393');
    }
    fittedText(
      ctx,
      'StarOrbit · NASA/Goddard SVS · Ernie Wright · ESA/Gaia/DPAC · d3-celestial',
      W / 2,
      H - 57,
      dual ? 15 : 17,
      W - 100,
      '#8292a7'
    );
    ctx.restore();
    signal.throwIfAborted();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('生日背面图片生成失败');
    signal.throwIfAborted();
    return {
      canvas,
      blob,
      metadata: {
        side: 'back',
        width: layout.width,
        height: layout.height,
        layout: pure ? 'sky' : 'card',
        date: frozen.date,
        epoch: plans[0].captureFrame.q.t,
        moment: plans[0].captureFrame.moment,
        targetIds: items.map((x) => x.targetId),
        name: frozen.name,
        sender: inscription.sender,
        giftDate: inscription.giftDate,
        source:
          'StarOrbit sky-only Xuntian capture; NASA SVS 4851 panorama; birthday-epoch solar system',
      },
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    signal.removeEventListener('abort', stopCapture);
    capture?.dispose();
    privateArt?.dispose();
    if (galaxy?.owned) galaxy.texture.dispose();
  }
}
