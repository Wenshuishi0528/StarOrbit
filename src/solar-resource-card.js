import { t, errorText } from './i18n.js';
import { SOLAR_CHANNELS } from './solar-data.js';

const node = (tag, className, parent) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  parent?.append(element);
  return element;
};
const mib = (bytes) => (Math.max(0, Number(bytes) || 0) / 1048576).toFixed(1);
const time = (value) => {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed)
    ? new Date(parsed)
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, ' UTC')
    : t('来源未提供观测时间');
};
const css = `.resource-dialog .resource-solar-card{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:18px}
.resource-dialog .resource-solar-card>.resource-card-heading,.resource-dialog .resource-solar-card>.resource-card-actions,.resource-dialog .resource-solar-card>.resource-progress,.resource-dialog .resource-solar-card>.resource-message,.resource-dialog .resource-solar-card>.resource-hint{grid-column:1/-1}
.resource-dialog .resource-solar-card>.resource-source{grid-column:auto}
.resource-dialog .resource-solar-card select{width:100%;min-width:0;max-width:none;background:#102b3d}
.resource-dialog .resource-solar-card a{color:#98dcf0}
@media(max-width:560px){.resource-dialog .resource-solar-card{grid-template-columns:1fr}.resource-dialog .resource-solar-card>.resource-source,.resource-dialog .resource-solar-card>.resource-fact{grid-column:1/-1}}`;

/** A view of the shared observation store: it owns no image cache or textures. */
export function mountSolarResourceCard({
  sim,
  store = sim.environment?.solarObservations,
  parent,
  closeResources,
}) {
  const sheet = node('style', '', document.head);
  sheet.textContent = css;
  const card = node('article', 'resource-card resource-solar-card', parent);
  card.dataset.resource = 'solar';
  const head = node('div', 'resource-card-heading', card),
    title = node('h3', '', head),
    badge = node('span', 'resource-badge', head);
  const source = node('label', 'resource-source', card),
    sourceLabel = node('span', '', source),
    channel = node('select', '', source);
  channel.id = 'resourceSolarChannel';
  for (const item of SOLAR_CHANNELS) {
    const option = node('option', '', channel);
    option.value = item.id;
  }
  const quality = node('label', 'resource-source', card),
    qualityLabel = node('span', '', quality),
    resolution = node('select', '', quality);
  resolution.id = 'resourceSolarResolution';
  for (const size of [1024, 2048]) {
    const option = node('option', '', resolution);
    option.value = String(size);
    option.textContent = size + ' × ' + size;
  }
  const buttons = node('div', 'resource-card-actions', card);
  const update = node('button', 'primary', buttons),
    view = node('button', 'resource-use', buttons),
    importButton = node('button', '', buttons),
    exportButton = node('button', '', buttons);
  for (const button of [update, view, importButton, exportButton]) button.type = 'button';
  update.id = 'updateSolarObservation';
  view.id = 'viewSolarObservation';
  importButton.id = 'importSolarObservation';
  exportButton.id = 'exportSolarObservation';
  const file = node('input', '', card);
  file.type = 'file';
  file.accept = '.json,application/json';
  file.hidden = true;
  file.id = 'solarObservationFile';
  const fact = () => {
    const wrap = node('dl', 'resource-fact', card);
    return { label: node('dt', '', wrap), value: node('dd', '', wrap) };
  };
  const current = fact(),
    dates = fact();
  const progress = node('progress', 'resource-progress', card);
  progress.hidden = true;
  progress.setAttribute('aria-hidden', 'true');
  const message = node('p', 'resource-message', card);
  message.setAttribute('role', 'status');
  const hint = node('p', 'resource-hint', card),
    official = node('a', 'resource-hint', card);
  official.href = 'https://sdo.gsfc.nasa.gov/data/';
  official.target = '_blank';
  official.rel = 'noopener noreferrer';
  const cacheNote = node('p', 'resource-cache-note');
  cacheNote.id = 'solarCacheUsage';
  let disposed = false,
    working = false,
    localError = '';
  const run = async (action) => {
    if (working || disposed) return;
    localError = '';
    working = true;
    render();
    try {
      await action();
    } catch (error) {
      localError = error?.message || String(error);
    } finally {
      working = false;
      render();
    }
  };
  channel.onchange = () => {
    const selected = channel.value;
    run(() => store.setChannel(selected));
  };
  resolution.onchange = () => {
    const selected = Number(resolution.value);
    run(() => store.setResolution(selected));
  };
  update.onclick = () =>
    run(() => {
      const state = store.snapshot();
      return store.update(state.channel, { resolution: state.resolution });
    });
  view.onclick = () =>
    run(async () => {
      if (sim.missionId !== 'tiangong' || !sim.xuntian?.observeSolar)
        throw Error('请切换到中国空间站任务后使用巡天观测太阳。');
      const { channel: selected } = store.snapshot();
      await closeResources();
      if ((await sim.xuntian.observeSolar({ channel: selected })) === false)
        sim.api.toast('请切换到中国空间站任务后使用巡天观测太阳。');
    });
  importButton.onclick = () => file.click();
  file.onchange = () =>
    run(async () => {
      const selected = file.files?.[0];
      try {
        if (selected) await store.importSnapshot(selected);
      } finally {
        file.value = '';
      }
    });
  exportButton.onclick = () =>
    run(async () => {
      const { record, channel: selected } = store.snapshot();
      if (!record) throw Error('尚未下载本波段');
      const blob = await store.exportSnapshot(record),
        url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download =
        'StarOrbit-SDO-' +
        selected +
        '-' +
        String(record.observedAt || 'unknown-time').replace(/[^\w-]/g, '-') +
        '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
  function render() {
    if (disposed) return;
    const state = store.snapshot(),
      record = state.record,
      loading = !!state.loading,
      error = localError || state.error;
    title.textContent = t('太阳观测');
    sourceLabel.textContent = t('SDO 观测波段');
    qualityLabel.textContent = t('下载分辨率');
    for (const [i, item] of SOLAR_CHANNELS.entries())
      channel.options[i].textContent = t(item.labelKey);
    channel.value = state.channel;
    resolution.value = String(state.resolution);
    channel.disabled = resolution.disabled = working;
    badge.dataset.phase = error ? 'error' : loading ? 'downloading' : record ? 'updated' : 'idle';
    badge.textContent = t(
      error
        ? '操作失败'
        : loading
          ? '正在下载…'
          : record
            ? state.stale
              ? '较早的观测图'
              : '已保存观测图'
            : '尚未下载'
    );
    update.textContent = t(
      loading ? '更新进行中…' : state.canUpdate ? '更新所选波段' : '桌面版可在线更新'
    );
    update.disabled = !state.canUpdate || loading || working;
    view.textContent = t('在巡天中查看太阳');
    view.disabled =
      working ||
      sim.missionId !== 'tiangong' ||
      !sim.xuntian?.observeSolar ||
      !!(sim.sceneBusy || sim.missions?.busy);
    importButton.textContent = t('导入太阳快照');
    exportButton.textContent = t('导出太阳快照');
    importButton.disabled = working || loading;
    exportButton.disabled = working || !record;
    current.label.textContent = t('当前观测图');
    dates.label.textContent = t('获取与模拟时间');
    current.value.textContent = record
      ? [
          'NASA / SDO',
          t('观测时间') + '：' + time(record.observedAt),
          record.width +
            ' × ' +
            record.height +
            ' · ' +
            mib(record.blob?.size || record.size) +
            ' MiB',
        ].join('\n')
      : t('尚未下载本波段');
    const dateLines = [];
    if (record)
      dateLines.push(
        t(record.origin === 'import' ? '快照原始下载时间' : '下载') + '：' + time(record.fetchedAt)
      );
    dateLines.push(t('模拟时间') + '：' + time(sim.time));
    const observed = Date.parse(record?.observedAt),
      difference = Math.abs(sim.time - observed) / 3600000;
    if (record && Number.isFinite(difference))
      dateLines.push(t('与模拟时间相差 {hours} 小时', { hours: difference.toFixed(1) }));
    dates.value.textContent = dateLines.join('\n');
    progress.hidden = !loading;
    message.textContent = error
      ? errorText(String(error))
      : loading
        ? t('正在下载所选波段，已有观测图继续保留。')
        : record
          ? t('数据与资源和巡天共用这份观测图；模拟时间不会生成新的太阳活动。')
          : t('查看太阳优先使用已保存影像；缺失时尝试载入该波段。网页版可导入太阳快照。');
    const notes = [
      state.canUpdate
        ? t('仅更新所选波段；AIA 图像使用紫外观测的伪彩显示。')
        : t('网页版可导入桌面版导出的太阳快照；在线更新需要桌面启动器的本机服务。'),
    ];
    if (sim.missionId !== 'tiangong') notes.push(t('请切换到中国空间站任务后使用巡天观测太阳。'));
    hint.textContent = notes.join('\n');
    official.textContent = t('打开 NASA / SDO 官方观测图 ↗');
    cacheNote.textContent = t(
      '独立太阳缓存：{count} 帧 · {size} MiB；每波段仅保留最新 1 帧，总上限 32 MiB，不计入云图与轨道缓存。',
      { count: state.cacheCount || 0, size: mib(state.cacheBytes) }
    );
    if (state.persistent === false) cacheNote.textContent += ' ' + t('当前浏览器仅支持临时缓存');
  }
  const unsubscribe = store.subscribe(render);
  render();
  return {
    card,
    cacheNote,
    render,
    focus() {
      card.scrollIntoView({ block: 'nearest' });
      channel.focus({ preventScroll: true });
    },
    dispose() {
      disposed = true;
      unsubscribe?.();
      card.remove();
      cacheNote.remove();
      sheet.remove();
    },
  };
}
