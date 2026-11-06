import { t, errorText } from './i18n.js';
import { ELEVATION_SOURCE } from './earth-elevation-source.js';

const $ = (id) => document.getElementById(id);
const write = (node, value) => {
  if (node.textContent !== value) node.textContent = value;
};
const mib = (value) => (Math.max(0, Number(value) || 0) / 1048576).toFixed(1);

export function earthElevationText(status) {
  if (!status?.enabled) return t('真实地形已关闭');
  if (!status.baseReady)
    return t(status.loading ? '正在准备全球地形…' : '全球地形未能载入，可重试');
  if (!status.requested) return t('真实高度 1× · 全球粗地形');
  const progress = t('局部地形 {ready}/{total}', {
    ready: status.ready,
    total: status.requested,
  });
  const state = status.complete
    ? t('已就绪')
    : status.loading
      ? t('加载中')
      : t('保留可用地形与全球底座');
  return `${t('真实高度 1×')} · ${progress} · ${state}`;
}

export function mountEarthElevationControls(env) {
  const manager = env.elevation,
    checkbox = $('earthElevation'),
    details = $('earthElevationInfo'),
    retry = $('earthElevationRetry'),
    clear = $('earthElevationClearCache');
  let lastRender = -Infinity,
    lastCache = -Infinity,
    readingCache = false,
    cacheEpoch = 0,
    cacheStats = null,
    cacheFailed = false,
    operation = '',
    message = '',
    failure = '';

  function update(force = false) {
    const now = performance.now();
    if (!force && now - lastRender < 300) return;
    lastRender = now;
    const status = manager.status('main');
    checkbox.checked = env.settings.earthElevation === true;
    retry.disabled = !!operation || !checkbox.checked || !!status.loading;
    clear.disabled = !!operation;
    write(
      $('earthElevationStatus'),
      operation === 'clear' ? t('正在清理地形缓存…') : earthElevationText(status)
    );
    const error = failure || status.error || '';
    $('earthElevationError').hidden = !error;
    write($('earthElevationError'), error ? errorText(String(error)) : '');
    $('earthElevationMessage').hidden = !message;
    write($('earthElevationMessage'), message ? t(message) : '');
    const cache = $('earthElevationCache');
    if (cacheStats) {
      write(
        cache,
        [
          t('地形缓存 {size} / 128 MiB · 网格 {geometry} MiB', {
            size: mib(cacheStats.bytes),
            geometry: mib(status.gpuBytes),
          }),
          cacheStats.persistent === false ? t('当前使用临时内存缓存') : '',
        ]
          .filter(Boolean)
          .join('\n')
      );
    } else write(cache, t(cacheFailed ? '暂时无法读取地形缓存用量' : '正在读取地形缓存用量…'));

    // The closed disclosure needs no disk reads. Ignore a read that began
    // before a clear, so its old usage cannot replace the new cache state.
    if (!details.open || operation || readingCache || now - lastCache < 2000) return;
    lastCache = now;
    readingCache = true;
    const epoch = cacheEpoch;
    Promise.resolve()
      .then(() => manager.cache.stats())
      .then((value) => {
        if (epoch !== cacheEpoch) return;
        cacheStats = value;
        cacheFailed = false;
      })
      .catch(() => {
        if (epoch === cacheEpoch) cacheFailed = true;
      })
      .finally(() => {
        readingCache = false;
        update(true);
      });
  }

  checkbox.onchange = () => {
    env.settings.earthElevation = checkbox.checked;
    manager.setEnabled(checkbox.checked);
    message = failure = '';
    env.save();
    update(true);
  };
  async function act(kind) {
    if (operation) return;
    operation = kind;
    message = failure = '';
    if (kind === 'clear') {
      cacheEpoch++;
      cacheStats = null;
    }
    update(true);
    try {
      const result = await (kind === 'clear' ? manager.clearCache() : manager.retry());
      if (result === false)
        throw Error(t(kind === 'clear' ? '地形缓存清理未完成，可重试' : '地形操作未完成，请重试'));
      message = kind === 'clear' ? '地形缓存已清理' : '已重试当前视野的高程';
    } catch (error) {
      failure = error?.message || t('地形操作未完成，请重试');
    } finally {
      // A user may switch terrain off while a clear awaits IndexedDB.
      if (kind === 'clear') manager.setEnabled(env.settings.earthElevation === true);
      operation = '';
      lastCache = -Infinity;
      update(true);
    }
  }
  retry.onclick = () => act('retry');
  clear.onclick = () => act('clear');
  details.addEventListener('toggle', () => {
    if (details.open) {
      lastCache = -Infinity;
      update(true);
    }
  });
  update(true);
  return { update };
}

export function elevationCaptionLines(status) {
  if (!status?.enabled || status.visible !== true) return [];
  const lines = [
    'Real elevation · vertical scale 1× · EGM2008',
    'Global base: NOAA NCEI ETOPO 2022 · CC0-1.0',
  ];
  const local = status.renderedTiles ?? status.ready ?? 0;
  if (local > 0) {
    lines.push('Local relief: Copernicus DEM GLO-30 2023_1 · mainly 2011–2015 observations');
    if (ELEVATION_SOURCE.credit) lines.push(ELEVATION_SOURCE.credit);
    if (ELEVATION_SOURCE.liability) lines.push(ELEVATION_SOURCE.liability);
  } else lines.push('Coarse global terrain; no local elevation detail in this frame');
  if (status.requested && !status.complete)
    lines.push('Local elevation incomplete · available terrain and global base retained');
  return lines;
}

export function paintElevationCaption(canvas, status, bottomInset = 0) {
  const sourceLines = elevationCaptionLines(status);
  if (!sourceLines.length) return 0;
  const ctx = canvas.getContext('2d'),
    size = Math.max(11, Math.round(canvas.width / 120)),
    bottom = Math.max(0, canvas.height - Math.max(0, Number(bottomInset) || 0));
  if (!bottom) return 0;
  ctx.save();
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const lines = [];
  for (const text of sourceLines) {
    let line = '';
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > canvas.width - 16) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  const height = Math.min(bottom, lines.length * (size + 5) + 10),
    top = bottom - height;
  ctx.beginPath();
  ctx.rect(0, top, canvas.width, height);
  ctx.clip();
  ctx.fillStyle = 'rgba(2,8,15,.76)';
  ctx.fillRect(0, top, canvas.width, height);
  ctx.fillStyle = '#d0dce8';
  lines.forEach((line, i) =>
    ctx.fillText(line, 8, top + size + 5 + i * (size + 5), canvas.width - 16)
  );
  ctx.restore();
  return height;
}
