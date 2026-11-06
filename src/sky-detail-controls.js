import { t, setText, getLanguage } from './i18n.js';
import { getXuntianTarget } from './xuntian-catalog.js';
import { normalizeSkyDetailSource, resolveSkyDetailSource } from './sky-detail-plan.js';

const $ = (id) => document.getElementById(id);
const SOURCE_LABELS = {
  auto: '自动',
  galaxy: '原银河背景',
  dss: 'DSS 光学',
  panstarrs: 'Pan-STARRS 光学',
  recent: '近期精选（JWST 红外）',
};
const SOURCE_NOTES = {
  auto: '自动选用巡天与近期精选影像；未覆盖区域保留原银河背景。',
  galaxy: '沿用当前银河与星表显示，不加载局部巡天影像。',
  dss: 'DSS 为历史摄影巡天的光学彩色合成。',
  panstarrs: 'Pan-STARRS 为 i / r / g 光学波段合成，并非全天天区覆盖。',
  recent: '近期精选是有限天区的 JWST 红外合成影像，并非肉眼自然色。',
};
export function skyDetailTarget(env) {
  const p = env.skyDetail.providers.find((p) => p.tiles && p.center);
  const target = p && getXuntianTarget(p.id, getLanguage());
  return target ? { ...target, fov: 0.035 } : null;
}
export function skyDetailText(status) {
  const source = normalizeSkyDetailSource(status?.source);
  if (source === 'galaxy') return t('原银河背景 · 沿用当前星空显示');
  if (!status?.enabled) return t('高清星空已关闭');
  if (status.fallback === 'outside-coverage')
    return t(
      source === 'recent'
        ? '此天区没有近期精选影像，显示原银河背景'
        : '此视场超出 Pan-STARRS 覆盖范围，显示原银河背景'
    );
  if (
    status.fallback === 'unavailable' ||
    (status.requested && !status.ready && !status.loading && status.failed)
  )
    return t('所选影像不可用，显示原银河背景');
  if (!status.requested)
    return source === 'auto'
      ? t('放大后自动加载高清天区')
      : t('放大后加载 {source}，当前显示原银河背景', { source: t(SOURCE_LABELS[source]) });
  const progress = t('高清天区 {ready}/{total}', { ready: status.ready, total: status.requested });
  const state = status.complete ? t('已就绪') : status.loading ? t('加载中') : t('保留可用底图');
  return `${t(SOURCE_LABELS[source])} · ${progress} · ${state}`;
}
export function skyDetailCredits(status) {
  const source = normalizeSkyDetailSource(status?.source);
  return [
    t(SOURCE_NOTES[source]),
    ...(status?.sources || []).map(
      (p) => `${t(p.title)} · ${p.observed}\n${t(p.bands)}\n${p.credit}`
    ),
  ].join('\n\n');
}

export function applySkyDetailSource(env, value, { save = true } = {}) {
  const source = normalizeSkyDetailSource(value);
  env.settings.skyDetailSource = source;
  env.settings.skyDetail = source !== 'galaxy';
  env.skyDetail.setSource(source);
  env.skyDetail.setEnabled(
    env.settings.skyDetail &&
      env.settings.stars !== false &&
      env.settings.milky !== false &&
      (env.settings.starBrightness ?? 1) > 0
  );
  if (save) env.save();
  return source;
}

export function mountSkyDetailControls(env) {
  const boxes = ['skyDetailEnabled'].map($).filter(Boolean),
    selects = ['skyDetailSource', 'xtSkyDetailSource'].map($).filter(Boolean);
  function sync() {
    const source = resolveSkyDetailSource(env.settings),
      disabled = env.settings.stars === false || env.settings.milky === false;
    env.settings.skyDetailSource = source;
    env.settings.skyDetail = source !== 'galaxy';
    env.skyDetail.setSource(source);
    for (const box of boxes) {
      box.checked = env.settings.skyDetail;
      box.disabled = disabled;
    }
    for (const select of selects) {
      select.value = source;
      select.disabled = disabled;
      select.title = t(
        disabled ? '开启星空与银河后可切换影像' : '主画面、巡天取景和照片共用此影像选择'
      );
    }
  }
  const choose = (source) => {
    applySkyDetailSource(env, source);
    sync();
  };
  for (const box of boxes)
    box.onchange = () =>
      choose(
        box.checked
          ? env.settings.skyDetailSource === 'galaxy'
            ? 'auto'
            : env.settings.skyDetailSource
          : 'galaxy'
      );
  for (const select of selects) select.onchange = () => choose(select.value);
  const observe = () => {
    choose('recent');
    env.sim.xuntian?.observeSkyDetail?.();
  };
  for (const id of ['viewSkyDetail', 'xtSkyDetailTarget']) if ($(id)) $(id).onclick = observe;
  sync();
  let last = -Infinity;
  return {
    update() {
      if (performance.now() - last < 500) return;
      last = performance.now();
      sync();
      for (const id of ['viewSkyDetail', 'xtSkyDetailTarget'])
        if ($(id)) $(id).disabled = env.sim.missionId !== 'tiangong';
      const status = env.skyDetail.status('main');
      const message =
        env.settings.stars === false || env.settings.milky === false
          ? t('开启星空与银河后可切换影像')
          : env.settings.starBrightness === 0
            ? t('星空亮度为零')
            : skyDetailText(status);
      if ($('skyDetailStatus')?.textContent !== message && $('skyDetailStatus'))
        setText('skyDetailStatus', message);
      const credits = $('skyDetailCredits');
      if (credits) {
        const text = skyDetailCredits(status);
        if (credits.textContent !== text) credits.textContent = text;
      }
    },
  };
}

export function mountSkyDetailResourceCard({ env, parent, closeResources }) {
  const card = document.createElement('article');
  card.className = 'resource-card resource-solar-card';
  card.dataset.resource = 'sky-detail';
  card.innerHTML = `<div class="resource-card-heading"><h3></h3><span class="resource-badge">AVIF / JPEG</span></div>
    <p class="resource-hint" data-sky-policy></p><p class="resource-message" data-sky-cache role="status"></p>
    <div class="resource-source" data-sky-sources></div><div class="resource-card-actions">
    <button type="button" id="resourceViewSkyDetail"></button><button type="button" id="clearSkyDetailCache"></button></div>`;
  parent.append(card);
  const sources = card.querySelector('[data-sky-sources]');
  const sourceRows = [];
  for (const p of env.skyDetail.providers) {
    const line = document.createElement('p'),
      link = document.createElement('a');
    link.href = p.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `${p.title} · ${p.observed}`;
    const description = document.createTextNode('');
    line.append(link, description);
    sourceRows.push({ p, link, description });
    line.style.whiteSpace = 'pre-line';
    sources.append(line);
  }
  const view = card.querySelector('#resourceViewSkyDetail'),
    clear = card.querySelector('#clearSkyDetailCache');
  let disposed = false,
    updating = false,
    last = -Infinity,
    message = '';
  view.onclick = () => {
    closeResources();
    env.sim.xuntian?.observeSkyDetail?.();
  };
  clear.onclick = async () => {
    clear.disabled = true;
    const ok = await env.skyDetail.clear();
    message = t(ok ? '高清星空缓存已清理' : '磁盘缓存清理失败，内存已释放');
    clear.disabled = false;
    last = -Infinity;
    render();
  };
  function render() {
    if (disposed) return;
    for (const { p, link, description } of sourceRows) {
      link.textContent = `${t(p.title)} · ${p.observed}`;
      description.textContent = `\n${t(p.bands)}\n${p.credit} · ${p.license}`;
    }
    card.querySelector('h3').textContent = t('高清星空数据');
    card.querySelector('[data-sky-policy]').textContent = t(
      '主画面、巡天取景和照片共用。按需下载；磁盘最多 1 GB，新增纹理最多 64 MiB。韦布为红外合成，巡天底图为历史观测。'
    );
    view.textContent = t('查看宇宙悬崖');
    view.disabled = env.sim.missionId !== 'tiangong';
    clear.textContent = t('清理星空缓存');
    if (updating || performance.now() - last < 2000) return;
    last = performance.now();
    updating = true;
    env.skyDetail.cache
      .stats()
      .then((s) => {
        if (disposed) return;
        const gpu = env.skyDetail.status('main');
        card.querySelector('[data-sky-cache]').textContent = [
          message,
          t('缓存 {size} MB · 纹理 {gpu} MiB', {
            size: (s.bytes / 1e6).toFixed(1),
            gpu: (gpu.gpuBytes / 1048576).toFixed(1),
          }),
          !s.persistent ? t('浏览器未提供持久缓存，本次使用有界内存缓存。') : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .finally(() => {
        updating = false;
      });
  }
  return {
    render,
    dispose() {
      disposed = true;
      card.remove();
    },
  };
}

export function skyDetailCaptionLines(status) {
  const source = normalizeSkyDetailSource(status?.source);
  const visible = status?.skyVisible ?? status?.active ?? status?.requested > 0;
  if (!visible || (source === 'auto' && !status?.requested)) return [];
  const labels = {
    auto: 'Automatic',
    galaxy: 'Original Milky Way background',
    dss: 'DSS2 optical colour composite',
    panstarrs: 'Pan-STARRS i/r/g optical composite',
    recent: 'Recent selection: JWST infrared composite',
  };
  const sources = status.sources || [];
  const lines = [
    `Sky imagery selected: ${labels[source]}`,
    ...sources.map((p) => `${p.id} · ${p.observed} · ${p.credit}`),
  ];
  if (!sources.length) {
    lines.push('Rendered: original Milky Way / catalogue background');
    if (status.fallback === 'outside-coverage')
      lines.push('Selected image does not cover this field');
    else if (source !== 'galaxy')
      lines.push('Selected image unavailable or not loaded at this field of view');
  }
  for (const p of sources.filter((p) => p.tiles)) {
    lines.push('JWST NIRCam · Infrared colour composite · Reprojected by StarOrbit');
    lines.push(`${p.sourceUrl.replace(/^https?:\/\//, '')} · ${p.license}`);
  }
  if (status.requested && !status.complete)
    lines.push('HD tiles incomplete · available imagery retained');
  return lines;
}

export function paintSkyDetailCaption(canvas, status, bottomInset = 0) {
  const lines = skyDetailCaptionLines(status);
  if (!lines.length) return 0;
  const ctx = canvas.getContext('2d'),
    size = Math.max(11, Math.round(canvas.width / 120));
  const bottom = Math.max(0, canvas.height - Math.max(0, Number(bottomInset) || 0)),
    height = Math.min(bottom, lines.length * (size + 5) + 10),
    top = bottom - height;
  if (!height) return 0;
  ctx.save();
  ctx.font = `${size}px sans-serif`;
  ctx.fillStyle = 'rgba(2,8,15,.76)';
  ctx.fillRect(0, top, canvas.width, height);
  ctx.fillStyle = '#d0dce8';
  lines.forEach((line, i) =>
    ctx.fillText(line, 8, top + size + 5 + i * (size + 5), canvas.width - 16)
  );
  ctx.restore();
  return height;
}
