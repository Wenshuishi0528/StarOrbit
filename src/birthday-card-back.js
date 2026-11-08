import * as THREE from 'three';
import { birthdayCardInscription, birthdaySkyView } from './birthday-card-render.js';
import { birthdaySkyFrame } from './birthday-sky-frame.js';
import { createXuntianViewRenderer } from './xuntian-view-render.js';
import { getSkyCulture } from './sky-cultures.js';
import { normalizeStarChartSettings } from './star-chart-settings.js';
import { ConstellationArt } from './constellation-art.js';
import { SkyDetail } from './sky-detail.js';
import { skyDetailView } from './sky-detail-plan.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const font = '"Songti SC", "Noto Serif CJK SC", "STSong", serif';

// The back has one sky field; only the optional paper size follows the front.
export function birthdayBackLayout(options = {}) {
  const format = options.backFormat || 'landscape';
  let width = 2400,
    height = 1500;
  if (format === 'portrait') {
    width = 1800;
    height = 2400;
  }
  if (format === 'match') {
    const dual = options.mode === 'dual',
      pure = options.layout === 'sky';
    width = dual ? 2400 : 1800;
    height = pure ? (dual ? 1392 : 1350) : dual ? 1500 : 2400;
  }
  const scale = width / 2400,
    W = width / scale,
    H = height / scale;
  return {
    width,
    height,
    scale,
    W,
    H,
    pure: options.backText === false,
    panels: [{ x: 0, y: 0, w: W, h: H }],
  };
}

export function birthdayBackSettings(options, culture) {
  return normalizeStarChartSettings({
    skyCulture: culture,
    starChartEnabled: true,
    starLabels: options.backLabels === true,
    catalogStarLabels: false,
    solarSystemLabels: options.backPlanets !== false,
    constellationNames: options.backNames !== false,
    constellationLines: options.backLines !== false,
    constellationArt: options.backArtwork === true,
    chineseSymbolArt: false,
    constellationBoundaries: false,
    equatorialGrid: options.backGrid === true,
    eclipticLine: options.backEcliptic === true,
    deepSkyObjects: options.backDeepSky === true,
    starLabelDensity: options.backDensity ?? 0.35,
    westernArtBrightness: options.backArtBrightness ?? 1,
    chineseArtBrightness: options.backArtBrightness ?? 1,
  });
}

export function birthdayBackView(frame, target, aspect, options = {}) {
  const view = birthdaySkyView(frame, target, aspect);
  const finite = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  view.fovY = clamp(
    Math.max(28, view.fovY) / clamp(finite(options.backZoom, 1), 0.65, 2.5),
    8,
    120
  );
  const rotate = (axis, angle) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), angle);
    for (const key of ['right', 'up', 'forward'])
      view[key] = new THREE.Vector3(...view[key]).applyQuaternion(q).toArray();
  };
  rotate(view.up, (clamp(finite(options.backPanX, 0), -1, 1) * view.fovY * Math.PI) / 360);
  rotate(view.right, (clamp(finite(options.backPanY, 0), -1, 1) * view.fovY * Math.PI) / 360);
  rotate(view.forward, (clamp(finite(options.backRotation, 0), -180, 180) * Math.PI) / 180);
  return view;
}

export function birthdayBackTarget(options) {
  if (options.items) {
    if (options.items.length !== 1) throw Error('背面请选择一片天区');
    return options.items[0];
  }
  return options.backCulture === 'chinese' ? options.mansion : options.western;
}

export function requireBirthdaySurvey(status) {
  if (
    !status?.complete ||
    status.source !== 'dss' ||
    !status.sources?.some((p) => p.id === 'dss-color')
  )
    throw Error('DSS 影像尚未完整加载，请重试或选择银河背景');
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
  const supplied = [birthdayBackTarget(options)];
  if (supplied.some((x) => !x)) throw Error('请先计算生日天区');
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
  const inscription = birthdayCardInscription({
    ...frozen,
    layout: frozen.backText === false ? 'sky' : 'card',
  });
  const layout = birthdayBackLayout(frozen);
  const entries = items.map((item) => locate(environment, item));
  const plans = entries.map((entry, i) => {
    const box = layout.panels[i];
    const view = birthdayBackView(entry.frame, entry.target, box.w / box.h, frozen);
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
    frame.photoNames = true;
    frame.skyBrightness = clamp(Number(frozen.backSkyBrightness ?? 1), 0.1, 2);
    frame.skyExposure = frozen.backBackground === 'dss' ? 'view' : 'cinematic';
    return { ...entry, box, view, captureFrame: frame };
  });
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const signal = controller.signal;
  const timer = setTimeout(abort, 60000);
  let galaxy, capture, privateArt, privateSky;
  const stopCapture = () => capture?.dispose();
  signal.addEventListener('abort', stopCapture);
  try {
    signal.throwIfAborted();
    await abortable(document.fonts?.ready, signal);
    if (frozen.backBackground !== 'dss')
      galaxy = await abortable(galaxyFor(environment, renderer, signal), signal);
    else
      privateSky = new SkyDetail(environment.assets?.skyDetail, { source: 'dss', wideField: true });
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
      galaxyTexture: galaxy?.texture || null,
      skyDetail: privateSky || null,
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
      if (privateSky) {
        const size = { aspect: plan.view.aspect, h: Math.round(plan.box.h * layout.scale) };
        const state = await abortable(
          privateSky.prepare(
            'birthday-photo-prefetch',
            skyDetailView(plan.captureFrame, size),
            true,
            45000
          ),
          signal
        );
        requireBirthdaySurvey(state);
      }
      const captureCanvas = document.createElement('canvas');
      capture = createXuntianViewRenderer(sim, captureCanvas, { skyOnly: true, captions: false });
      try {
        const width = Math.round(plan.box.w * layout.scale);
        const blob = await abortable(capture.capture(plan.captureFrame, { width }), signal);
        signal.throwIfAborted();
        if (privateSky) requireBirthdaySurvey(capture.photoSkyStatus());
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
    const { W, H, pure } = layout;
    // Soft edge shading leaves the central sky unobstructed, like a photographic postcard.
    const shadeHeight = pure ? 100 : 430;
    const shade = ctx.createLinearGradient(0, H - shadeHeight, 0, H);
    shade.addColorStop(0, 'rgba(2,7,15,0)');
    shade.addColorStop(1, 'rgba(2,7,15,.94)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, H - shadeHeight, W, shadeHeight);
    ctx.textAlign = 'left';
    const item = items[0],
      moment = plans[0].captureFrame.moment;
    if (!pure) {
      fittedText(ctx, 'STARORBIT  /  星河留影', 90, H - 275, 22, W - 180, '#c6b793');
      fittedText(ctx, item.zh + ' · ' + (item.fullName || item.en), 90, H - 185, 64, W - 180);
      const offset = moment.utcOffset >= 0 ? '+' + moment.utcOffset : String(moment.utcOffset);
      fittedText(
        ctx,
        `${inscription.birthday}  ${moment.localTime}  UTC${offset}`,
        90,
        H - 125,
        25,
        W - 180,
        '#c0cbd8'
      );
      const signature = [frozen.name ? `致 ${frozen.name}` : '', inscription.signature]
        .filter(Boolean)
        .join('  /  ');
      if (signature) fittedText(ctx, signature, 90, H - 78, 25, W - 180, '#d4c6ab');
    }
    ctx.textAlign = 'center';
    if (item.culture === 'chinese' || frozen.backArtwork)
      fittedText(
        ctx,
        item.culture === 'chinese'
          ? 'Chinese sky: Stellarium · CC BY-SA 4.0' +
              (frozen.backArtwork ? ' / Artwork: StarOrbit · CC BY-NC 4.0' : '')
          : 'Artwork: Johan Meurisse / Stellarium · Free Art License',
        W / 2,
        H - 48,
        16,
        W - 100,
        '#99a6b7'
      );
    fittedText(
      ctx,
      frozen.backBackground === 'dss'
        ? 'StarOrbit · DSS colored / CDS / STScI · ESA/Gaia/DPAC · d3-celestial'
        : 'StarOrbit · NASA/Goddard SVS · Ernie Wright · ESA/Gaia/DPAC · d3-celestial',
      W / 2,
      H - 26,
      16,
      W - 100,
      '#99a6b7'
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
        layout: pure ? 'sky' : 'postcard',
        culture: items[0].culture,
        background: frozen.backBackground || 'galaxy',
        date: frozen.date,
        epoch: plans[0].captureFrame.q.t,
        moment: plans[0].captureFrame.moment,
        targetIds: items.map((x) => x.targetId),
        name: frozen.name,
        sender: inscription.sender,
        giftDate: inscription.giftDate,
        source:
          'StarOrbit sky-only Xuntian capture; ' +
          (frozen.backBackground === 'dss' ? 'DSS colored HiPS' : 'NASA SVS 4851 panorama') +
          '; birthday-epoch solar system',
      },
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    signal.removeEventListener('abort', stopCapture);
    capture?.dispose();
    privateArt?.dispose();
    privateSky?.dispose();
    if (galaxy?.owned) galaxy.texture.dispose();
  }
}
