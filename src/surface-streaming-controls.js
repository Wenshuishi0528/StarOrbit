import { t, errorText, onLanguageChange } from './i18n.js';

export function normalizeSurfaceStreamingSettings(value = {}) {
  const range = (key, fallback) =>
    Number.isFinite(value?.[key])
      ? Math.max(20, Math.min(400, Math.round(value[key] / 10) * 10))
      : fallback;
  return {
    surfaceStreaming: typeof value?.surfaceStreaming === 'boolean' ? value.surfaceStreaming : true,
    surfaceImageryRangeKm: range('surfaceImageryRangeKm', 120),
    surfaceElevationRangeKm: range('surfaceElevationRangeKm', 160),
  };
}
export function applySurfaceStreamingSettings(env) {
  const s = env.settings;
  env.cityTerrain?.configureStreaming?.({
    enabled: s.surfaceStreaming,
    rangeKm: s.surfaceImageryRangeKm,
  });
  env.elevation?.configureStreaming?.({ rangeKm: s.surfaceElevationRangeKm });
}
const mib = (n) => (Math.max(0, n || 0) / 1048576).toFixed(1);

// Mounted in the main data library and every shared Earth settings panel.
// Only Environment owns the settings, managers and persistent caches.
export function mountSurfaceStreamingControls(host, env) {
  const root = document.createElement('details');
  root.className = 'surface-streaming-controls';
  root.innerHTML = `<summary data-stream-text="地表加载与缓存"></summary>
    <label><input type="checkbox" data-stream-setting="surfaceStreaming"> <span data-stream-text="随视野自动加载卫星影像"></span></label>
    <label><span data-stream-text="卫星影像加载半径（km）"></span><output data-stream-value="surfaceImageryRangeKm"></output><input type="range" min="20" max="400" step="10" data-stream-setting="surfaceImageryRangeKm"></label>
    <label><span data-stream-text="高程细节加载半径（km）"></span><output data-stream-value="surfaceElevationRangeKm"></output><input type="range" min="20" max="400" step="10" data-stream-setting="surfaceElevationRangeKm"></label>
    <p class="resource-hint" data-stream-text="根据高度和视野分级加载：近处精细，远处连续覆盖。已缓存影像也用于主页地球。"></p>
    <p class="resource-hint" data-stream-status role="status"></p><p class="resource-hint" data-stream-cache></p>
    <div class="resource-card-actions"><button type="button" data-stream-action="imagery" data-stream-text="清理漫游影像缓存"></button><button type="button" data-stream-action="elevation" data-stream-text="清理高程缓存"></button><button type="button" data-stream-action="resume" data-stream-text="继续加载当前视野"></button></div>
    <p class="resource-hint" data-stream-message role="status"></p>`;
  host.append(root);
  let disposed = false,
    busy = false,
    reading = false,
    lastRead = -Infinity,
    epoch = 0;
  let cacheText = '';
  function translate() {
    root
      .querySelectorAll('[data-stream-text]')
      .forEach((el) => (el.textContent = t(el.dataset.streamText)));
    for (const el of root.querySelectorAll('input[type="range"]'))
      el.setAttribute(
        'aria-label',
        t(
          el.dataset.streamSetting === 'surfaceImageryRangeKm'
            ? '卫星影像加载半径（km）'
            : '高程细节加载半径（km）'
        )
      );
    refresh();
  }
  function refresh() {
    if (disposed) return;
    for (const el of root.querySelectorAll('[data-stream-setting]')) {
      const key = el.dataset.streamSetting;
      if (el.type === 'checkbox') el.checked = env.settings[key];
      else if (document.activeElement !== el) el.value = env.settings[key];
      const output = root.querySelector(`[data-stream-value="${key}"]`);
      if (output) output.textContent = ` ${env.settings[key]} km`;
    }
    root.querySelectorAll('button').forEach((b) => (b.disabled = busy));
    const status = env.cityTerrain?.status()?.streaming;
    root.querySelector('[data-stream-status]').textContent =
      status?.paused || env.elevation?.status()?.streamingPaused
        ? t('缓存已清理；移动到新区域或点击继续加载。')
        : status?.preparing
          ? t('正在准备视野内的卫星影像…')
          : !env.settings.surfaceStreaming
            ? t('自动加载已关闭，继续显示已缓存影像。')
            : t('移动时按需加载，影像与高程分别缓存。');
    const active = [...(env.cityTerrain?.views.values() || [])]
      .filter((view) => view.input)
      .sort((a, b) => b.priority - a.priority)[0];
    const imagery = env.cityTerrain?.status(active?.id);
    if (imagery?.requested)
      root.querySelector('[data-stream-status]').textContent +=
        ` · ${imagery.ready}/${imagery.requested}`;
    if (status?.error)
      root.querySelector('[data-stream-status]').textContent += ' · ' + errorText(status.error);
    root.querySelector('[data-stream-cache]').textContent = cacheText;
    if (!root.open || busy || reading || performance.now() - lastRead < 2500) return;
    reading = true;
    lastRead = performance.now();
    const generation = epoch;
    Promise.all([env.cityTerrain.cache.stats(), env.elevation.cache.stats()])
      .then(([images, heights]) => {
        if (disposed || generation !== epoch) return;
        cacheText = t('卫星影像缓存 {images} MiB · 高程缓存 {heights} MiB', {
          images: mib(images.bytes),
          heights: mib(heights.bytes),
        });
        if (images.persistent === false || heights.persistent === false)
          cacheText += ' · ' + t('当前使用临时内存缓存');
        root.querySelector('[data-stream-cache]').textContent = cacheText;
      })
      .catch(() => {})
      .finally(() => (reading = false));
  }
  root.addEventListener('input', (event) => {
    const key = event.target.dataset.streamSetting;
    if (!key) return;
    const output = root.querySelector(`[data-stream-value="${key}"]`);
    if (output) output.textContent = ` ${event.target.value} km`;
  });
  root.addEventListener('change', (event) => {
    const key = event.target.dataset.streamSetting;
    if (!key) return;
    env.settings[key] =
      event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value);
    Object.assign(env.settings, normalizeSurfaceStreamingSettings(env.settings));
    applySurfaceStreamingSettings(env);
    env.save();
    refresh();
  });
  root.addEventListener('click', async (event) => {
    const kind = event.target.dataset.streamAction;
    if (!kind || busy) return;
    busy = true;
    epoch++;
    const message = root.querySelector('[data-stream-message]');
    message.textContent = '';
    refresh();
    try {
      if (kind === 'imagery') await env.cityTerrain.clearStreaming();
      else if (kind === 'elevation') {
        const success = await env.elevation.clearCache({ pauseUntilMove: true });
        if (success === false) throw Error('地形缓存清理未完成，可重试');
      } else {
        env.cityTerrain.resumeStreaming();
        env.elevation.resumeStreaming?.();
      }
      message.textContent = t(
        kind === 'resume'
          ? '已继续加载当前视野'
          : kind === 'imagery'
            ? '漫游影像缓存已清理，离线城市包保留。'
            : '地形缓存已清理'
      );
    } catch (error) {
      message.textContent = errorText(error.message);
    } finally {
      busy = false;
      lastRead = -Infinity;
      cacheText = '';
      refresh();
    }
  });
  root.addEventListener('toggle', () => {
    if (root.open) {
      lastRead = -Infinity;
      refresh();
    }
  });
  const off = onLanguageChange(translate);
  translate();
  return {
    root,
    refresh,
    dispose() {
      disposed = true;
      epoch++;
      off();
      root.remove();
    },
  };
}
