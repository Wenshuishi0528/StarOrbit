import { t, setText, getLanguage } from './i18n.js';
import { skyOfflineResourceList } from './sky-offline-controls.js';
import { getXuntianTarget } from './xuntian-catalog.js';
import {
  normalizeSkyDetailSource,
  normalizeWebbBackground,
  photographicSkyBase,
  resolveSkyDetailSource,
} from './sky-detail-plan.js';
import { pointMainCameraAtSky } from './sky-camera-pointing.js';
import { cameraAxes, lookDirection } from './xuntian-pointing.js';

const $ = (id) => document.getElementById(id);
const artworkSource = (source) => source === 'recent' || source === 'hubble';
const SOURCE_LABELS = {
  auto: '自动',
  galaxy: '原银河背景',
  blank: '空白',
  dss: 'DSS 光学',
  panstarrs: 'Pan-STARRS 光学',
  recent: '韦伯红外（JWST）',
  hubble: '哈勃望远镜',
};
const SOURCE_NOTES = {
  auto: '自动选择光学巡天和韦伯影像。',
  galaxy: '沿用当前银河与星表显示，不加载局部巡天影像。',
  dss: 'DSS 为历史摄影巡天的光学彩色合成。',
  panstarrs: 'Pan-STARRS 为 i / r / g 光学波段合成，并非全天天区覆盖。',
  recent: '韦伯望远镜拍摄的红外合成影像只覆盖局部天区。',
  hubble: '哈勃影像按观测画幅叠加在底图上。',
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
  const hasArtwork = source === 'hubble' ? status.hasHubbleTiles : status.hasWebbTiles;
  const photographic = photographicSkyBase(source, status.webbBackground);
  if (
    status.backgroundOutsideCoverage ||
    (source === 'panstarrs' && status.fallback === 'outside-coverage')
  ) {
    const note = t('Pan-STARRS 未覆盖此天区');
    if (!hasArtwork) return note;
    return skyDetailProgress(status, source) + ' · ' + note;
  }
  if (artworkSource(source) && status.fallback === 'outside-coverage')
    return (
      t('此天区没有已定位的作品') +
      ' · ' +
      t('此天区显示 {source} 底图', {
        source: t(SOURCE_LABELS[status.webbBackground] || SOURCE_LABELS.galaxy),
      })
    );
  if (
    status.fallback === 'unavailable' ||
    (status.requested && !status.ready && !status.loading && status.failed)
  )
    return t(photographic ? '影像暂不可用，缺失区域留黑' : '所选影像不可用，显示原银河背景');
  if (!status.requested && status.loading) return t('加载中');
  if (!status.requested && photographic)
    return t(SOURCE_LABELS[source]) + ' · ' + t('高清天区 {ready}/{total}', { ready: 0, total: 0 });
  if (!status.requested)
    return source === 'auto'
      ? t('放大后自动加载高清天区')
      : t('放大后加载 {source}，当前显示原银河背景', { source: t(SOURCE_LABELS[source]) });
  const message =
    artworkSource(source) && hasArtwork === false && status.ready
      ? t('此天区显示 {source} 底图', { source: t(SOURCE_LABELS[status.webbBackground]) })
      : skyDetailProgress(status, source);
  return status.opticalCoverage === 'partial'
    ? message + ' · ' + t('Pan-STARRS 仅覆盖部分视场')
    : message;
}
function skyDetailProgress(status, source) {
  const progress = t('高清天区 {ready}/{total}', { ready: status.ready, total: status.requested });
  const state = status.complete ? t('已就绪') : status.loading ? t('加载中') : t('保留可用底图');
  return `${t(SOURCE_LABELS[source])} · ${progress} · ${state}`;
}
export function updateHubbleCredit(link, status) {
  if (!link) return;
  const work = status?.sources?.find((p) => p.id.startsWith('hubble-'));
  if (!work) {
    link.hidden = true;
    return;
  }
  if (link.getAttribute('href') !== work.sourceUrl) {
    link.href = work.sourceUrl;
    link.textContent = work.credit;
  }
  link.hidden = false;
}

export function skyDetailCredits(status) {
  const source = normalizeSkyDetailSource(status?.source);
  return [
    t(SOURCE_NOTES[source]),
    ...(status?.sources || []).map(
      (p) => `${[t(p.title), p.observed].filter(Boolean).join(' · ')}\n${t(p.bands)}\n${p.credit}`
    ),
  ].join('\n\n');
}

export function applySkyDetailSource(env, value, { save = true } = {}) {
  const source = normalizeSkyDetailSource(value);
  env.settings.skyDetailSource = source;
  env.settings.skyDetail = source !== 'galaxy';
  env.skyDetail.setSource(source, env.settings.webbBackground);
  env.skyDetail.setEnabled(
    env.settings.skyDetail &&
      env.settings.stars !== false &&
      (env.settings.milky !== false ||
        !!photographicSkyBase(source, env.settings.webbBackground)) &&
      (env.settings.starBrightness ?? 1) > 0
  );
  if (save) env.save();
  return source;
}

export function mountSkyDetailControls(env) {
  const finderKey = 'starorbit-xuntian-sky-v1';
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(finderKey));
  } catch {}
  const finder = {
    source: normalizeSkyDetailSource(saved?.source ?? resolveSkyDetailSource(env.settings)),
    background: normalizeWebbBackground(saved?.background ?? env.settings.webbBackground),
    artworks: { ...(saved ? saved.artworks : env.skyDetail.artworkBySource) },
    orders: { ...saved?.orders },
  };
  function saveFinder() {
    try {
      localStorage.setItem(finderKey, JSON.stringify(finder));
    } catch {}
  }
  if (!saved) saveFinder();
  function finderSelection() {
    return {
      source: finder.source,
      background: finder.background,
      artworkId: artworkSource(finder.source) ? finder.artworks[finder.source] || null : null,
      savedPyramidOrder: finder.orders[finder.source],
    };
  }
  function setFinderSelection(source, options = {}) {
    finder.source = normalizeSkyDetailSource(source);
    if (options.background !== undefined)
      finder.background = normalizeWebbBackground(options.background);
    if (artworkSource(finder.source) && options.artworkId !== undefined) {
      finder.artworks[finder.source] = options.artworkId;
      finder.orders[finder.source] = options.savedPyramidOrder;
    }
    saveFinder();
    sync();
    env.sim.dirty = true;
  }
  const boxes = ['skyDetailEnabled'].map($).filter(Boolean),
    backgrounds = ['webbBackground'].map($).filter(Boolean),
    selects = ['skyDetailSource'].map($).filter(Boolean);
  function sync() {
    const source = resolveSkyDetailSource(env.settings),
      disabled = env.settings.stars === false;
    env.settings.skyDetailSource = source;
    env.settings.skyDetail = source !== 'galaxy';
    env.skyDetail.setSource(source, env.settings.webbBackground);
    if ($('viewSkyDetail')) $('viewSkyDetail').hidden = source === 'hubble';
    if ($('xtSkyDetailTarget')) $('xtSkyDetailTarget').hidden = finder.source === 'hubble';
    if ($('xtSkyDetailSource')) {
      $('xtSkyDetailSource').value = finder.source;
      $('xtSkyDetailSource').disabled = disabled;
      $('xtSkyDetailSource').title = t(
        disabled ? '开启星空后可切换影像' : '巡天取景与巡天照片使用此图源'
      );
    }
    if ($('xtWebbBackground')) {
      $('xtWebbBackground').parentElement.hidden = !artworkSource(finder.source);
      $('xtWebbBackground').disabled = disabled;
      $('xtWebbBackground').value = finder.background;
    }
    for (const select of backgrounds) {
      select.parentElement.hidden = !artworkSource(source);
      select.value = env.settings.webbBackground ?? 'galaxy';
      select.disabled = disabled;
    }
    for (const box of boxes) {
      box.checked = env.settings.skyDetail;
      box.disabled = disabled;
    }
    for (const select of selects) {
      select.value = source;
      select.disabled = disabled;
      select.title = t(disabled ? '开启星空后可切换影像' : '主画面使用此图源');
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
  for (const select of backgrounds)
    select.onchange = () => {
      env.settings.webbBackground = select.value;
      sync();
      env.save();
      env.sim.dirty = true;
    };
  if ($('xtSkyDetailSource'))
    $('xtSkyDetailSource').onchange = () => setFinderSelection($('xtSkyDetailSource').value);
  if ($('xtWebbBackground'))
    $('xtWebbBackground').onchange = () =>
      setFinderSelection(finder.source, { background: $('xtWebbBackground').value });
  if ($('xtSkyDetailTarget'))
    $('xtSkyDetailTarget').onclick = () => env.sim.xuntian?.observeSkyDetail?.();
  if ($('viewSkyDetail'))
    $('viewSkyDetail').onclick = () => {
      const target = skyDetailTarget(env);
      if (!target) return;
      env.skyDetail.setArtwork('jwst-carina-2022');
      choose('recent');
      pointMainCameraAtSky(env.sim, target.direction, {
        ...cameraAxes(lookDirection(target.direction)),
        fovY: target.fov,
      });
    };
  sync();
  let last = -Infinity;
  return {
    finderSelection,
    setFinderSelection,
    update() {
      if (performance.now() - last < 500) return;
      last = performance.now();
      sync();
      if ($('xtSkyDetailTarget'))
        $('xtSkyDetailTarget').disabled = env.sim.missionId !== 'tiangong';
      const status = env.skyDetail.status('main');
      const message =
        env.settings.stars === false
          ? t('开启星空后可切换影像')
          : env.settings.starBrightness === 0
            ? t('星空亮度为零')
            : skyDetailText(status);
      if ($('skyDetailStatus')?.textContent !== message && $('skyDetailStatus'))
        setText('skyDetailStatus', message);
      updateHubbleCredit($('mainHubbleCredit'), status);
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
  const renderOffline = skyOfflineResourceList(env, card, closeResources);
  const sources = card.querySelector('[data-sky-sources]');
  const sourceRows = [];
  for (const p of env.skyDetail.providers.filter((p) => !p.plate)) {
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
      '普通浏览按视野加载，临时缓存最多 1 GB。手动保存的影像在此管理。'
    );
    view.textContent = t('查看宇宙悬崖');
    view.disabled = env.sim.missionId !== 'tiangong';
    clear.textContent = t('清理星空缓存');
    if (updating || performance.now() - last < 2000) return;
    last = performance.now();
    updating = true;
    renderOffline();
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
    blank: 'Blank sky',
    dss: 'DSS2 optical colour composite',
    panstarrs: 'Pan-STARRS i/r/g optical composite',
    recent: 'Webb infrared (JWST)',
    hubble: 'Hubble Space Telescope',
  };
  const sources = status.sources || [];
  const lines = [
    `Sky imagery selected: ${labels[source]}`,
    ...(artworkSource(source)
      ? [`Background selected: ${labels[status.webbBackground || 'galaxy']}`]
      : []),
    ...sources.map((p) => `${[p.id, p.observed, p.credit].filter(Boolean).join(' · ')}`),
  ];
  if (!sources.length) {
    lines.push(
      photographicSkyBase(source, status.webbBackground)
        ? 'Rendered: blank sky in the absence of selected imagery'
        : 'Rendered: original Milky Way / catalogue background'
    );
    if (status.fallback === 'outside-coverage')
      lines.push('Selected image does not cover this field');
    else if (source !== 'galaxy')
      lines.push('Selected image unavailable or not loaded at this field of view');
  }
  if (status.opticalCoverage === 'partial') lines.push('Pan-STARRS covers part of this field');
  for (const p of sources.filter((p) => p.tiles)) {
    lines.push('JWST NIRCam · Infrared colour composite · Reprojected by StarOrbit');
    lines.push(`${p.sourceUrl.replace(/^https?:\/\//, '')} · ${p.license}`);
  }
  for (const p of sources.filter((p) => p.plate)) {
    lines.push(p.bands);
    lines.push(p.sourceUrl.replace(/^https?:\/\//, ''));
  }
  if (status.requested && !status.complete)
    lines.push('HD tiles incomplete · available imagery retained');
  return lines;
}

export function paintSkyDetailCaption(canvas, status, bottomInset = 0) {
  let lines = skyDetailCaptionLines(status);
  if (!lines.length) return 0;
  const ctx = canvas.getContext('2d'),
    size = Math.max(11, Math.round(canvas.width / 120));
  ctx.save();
  ctx.font = `${size}px sans-serif`;
  if (status?.sources?.some((p) => p.id.startsWith('hubble-'))) {
    lines = lines.flatMap((line) => {
      const wrapped = [''];
      for (const word of String(line).split(/\s+/)) {
        const i = wrapped.length - 1;
        const next = wrapped[i] ? wrapped[i] + ' ' + word : word;
        if (wrapped[i] && ctx.measureText(next).width > canvas.width - 16) wrapped.push(word);
        else wrapped[i] = next;
      }
      return wrapped;
    });
  }
  const bottom = Math.max(0, canvas.height - Math.max(0, Number(bottomInset) || 0)),
    height = Math.min(bottom, lines.length * (size + 5) + 10),
    top = bottom - height;
  if (!height) {
    ctx.restore();
    return 0;
  }
  ctx.fillStyle = 'rgba(2,8,15,.76)';
  ctx.fillRect(0, top, canvas.width, height);
  ctx.fillStyle = '#d0dce8';
  lines.forEach((line, i) =>
    ctx.fillText(line, 8, top + size + 5 + i * (size + 5), canvas.width - 16)
  );
  ctx.restore();
  return height;
}
