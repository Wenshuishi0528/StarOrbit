import { LIVE_CLOUD_PROCESSING } from './cloud-texture.js';
import { mergeCloudVersions, versionKey } from './cloud-history-data.js';
import { cloudWarnings } from './cloud-manual.js';
import { cloudTitle, cloudDate, cloudError } from './cloud-library.js';
import { nasaCoverage, nasaCoverageEstimate, nasaMostlyGlobal } from './cloud-source.js';
import { t, onLanguageChange } from './i18n.js';

const css = `.cloud-history>.library-current{margin:10px 20px 0;flex-shrink:0}.cloud-history .library-current p{font-size:12px;line-height:1.45;margin:3px 0}.cloud-history .library-current details{font-size:13px}.cloud-history .library-current summary{cursor:pointer}.cloud-history .library-current .history-buttons{margin:8px 0 0}.cloud-history{box-sizing:border-box;width:min(1180px,97vw);height:92dvh;max-width:none;max-height:none;padding:0;background:#0b1826;color:#e4eff8;border:1px solid #385267;border-radius:14px}.cloud-history::backdrop{background:#020a13b8;backdrop-filter:blur(3px)}.cloud-history[open]{display:flex;flex-direction:column}.cloud-history header{position:static;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #32485e;gap:12px}.cloud-history h2{margin:0;font-size:20px}.cloud-history p{line-height:1.6;color:#b6cadb;margin:6px 0}.cloud-history .version-body{padding:16px 20px;overflow:auto;min-height:0}.cloud-history .history-controls,.cloud-history .history-buttons,.cloud-history .library-tabs{display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin:12px 0}.cloud-history label{display:flex;gap:7px;align-items:center}.cloud-history button,.cloud-history input,.cloud-history select{font:inherit;width:auto;min-height:38px;max-width:100%;flex:none}.cloud-history input[type=month]{color-scheme:dark;min-width:145px}.cloud-history .version-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:18px;margin-top:14px}.cloud-history .version-list{max-height:47dvh;overflow:auto;border:1px solid #30465a;border-radius:8px}.cloud-history .version-row{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #30465a;border-radius:0;background:#102336;padding:12px;line-height:1.6;white-space:normal}.cloud-history .version-row[aria-pressed=true]{background:#194658;box-shadow:inset 3px 0 #7ddfee}.cloud-history .version-row span{display:block;font-size:13px;color:#aac4d8;overflow-wrap:anywhere}.cloud-history .version-row .warning{color:#f1cc8c}.cloud-history .version-detail{min-width:0}.cloud-history .history-preview{display:block;width:100%;aspect-ratio:2;object-fit:contain;background:repeating-conic-gradient(#213344 0% 25%,#172836 0% 50%) 0 0/20px 20px;border:1px solid #32485e;border-radius:6px}.cloud-history [role=status]{white-space:pre-line;overflow-wrap:anywhere;font-size:13px}.cloud-history .coverage-metadata{white-space:pre-line}.cloud-history h3{font-size:16px;margin:0 0 10px}.cloud-history .version-warning{color:#f1cc8c;font-size:13px;white-space:pre-line}.cloud-history .library-current,.cloud-history .library-task{border:1px solid #345467;border-radius:9px;padding:12px 15px;background:#102b39}.cloud-history .library-current strong{display:block;color:#b3f0eb;font-size:16px}.cloud-history .library-current .history-buttons{margin-bottom:0}.cloud-history .library-task{margin-top:12px;background:#112537}.cloud-history .library-task[data-state=error]{border-color:#7e5142}.cloud-history .library-tabs{border-bottom:1px solid #32485e;padding-bottom:12px}.cloud-history .library-tabs [aria-pressed=true]{background:#245365;border-color:#6eabb7}.cloud-history .library-empty{padding:16px}.cloud-history .library-storage{font-size:13px}.cloud-history .download-cost{font-size:13px;color:#a9c1d5}.cloud-history [hidden]{display:none!important}.cloud-history button:focus-visible,.cloud-history select:focus-visible,.cloud-history input:focus-visible{outline:2px solid #83dcec;outline-offset:2px}@media(max-width:760px){.cloud-history{width:100vw;height:100dvh;border-radius:0}.cloud-history header,.cloud-history .version-body{padding:12px}.cloud-history .version-layout{grid-template-columns:1fr}.cloud-history .version-list{max-height:30dvh}.cloud-history .history-controls label{flex-wrap:wrap}.cloud-history .history-buttons{gap:7px}.cloud-history .history-buttons button{font-size:13px}.cloud-history header button{font-size:13px}}`;

const quickSources = {
  github: {
    title: 'Live Cloud Maps · GitHub',
    info: '每 3 小时发布一次，画面可能重复。8K 云图保留至南北纬 67.5°，其外显示内置云图。',
  },
  gmgsi: {
    title: 'NOAA GMGSI · 长波红外',
    local: true,
    info: '每小时更新，4K 红外拼图覆盖南北纬 60° 之间。冷云更明显，缺测处显示内置云图。',
  },
  himawari: {
    title: '向日葵-9 · 亚太云分类',
    local: true,
    info: '约每 10 分钟扫描东亚和西太平洋。仅显示观测到的云，覆盖外露出地表。',
  },
  gdps: {
    title: '加拿大 GDPS · 全球云量预报',
    info: '约 15 公里分辨率，覆盖两极。下载最新起报中最接近当前时刻的总云量预报。',
  },
};

export function mountCloudHistory(w) {
  const library = w.cloudLibrary;
  let dialog,
    sheet,
    body,
    current,
    currentNote,
    modeButtons,
    savedTab,
    globalTab,
    globalInfo,
    newTab,
    filters,
    sourceBar,
    sourceSelect,
    quickPanel,
    quickInfo,
    quickDownload,
    layout,
    month,
    day,
    refreshButton,
    stopCatalog,
    catalogStatus,
    coverageFilter,
    taskPanel,
    taskStatus,
    cancelButton,
    retryButton,
    taskView,
    status,
    list,
    detailTitle,
    image,
    detailMeta,
    warning,
    license,
    download,
    apply,
    favorite,
    exportButton,
    remove,
    count;
  let view = 'saved',
    selectedKey = null,
    selectedBase = null,
    rows = [],
    opener,
    previewURL = null,
    previewSerial = 0,
    previewKey = null,
    previewError = '',
    listSignature = '',
    actionBusy = false,
    message = '',
    disposed = false;
  const labels = new Map(),
    node = (tag, parent, text) => {
      const e = document.createElement(tag);
      if (text) {
        const label = document.createTextNode(t(text));
        e.append(label);
        labels.set(label, text);
      }
      parent.append(e);
      return e;
    };
  const button = (parent, text, fn) => {
    const e = node('button', parent, text);
    e.type = 'button';
    e.onclick = fn;
    return e;
  };
  const selected = () => rows.find((r) => r.key === selectedKey);
  const rowMeta = (r) => ({ ...r, ...r.diskRecord, ...r.record });
  const coverageLabel = (r) => {
    const complete = nasaCoverage(r);
    if (complete !== 'unknown')
      return t(complete === 'global' ? '全球覆盖 · 含两极' : '局部覆盖 / 存在缺测');
    const estimate = nasaCoverageEstimate(r);
    if (estimate)
      return t(
        nasaMostlyGlobal(r)
          ? '基本全球 · 约 {percent}%（预核验）'
          : '局部覆盖 · 约 {percent}%（预核验）',
        { percent: (estimate.coverage * 100).toFixed(1) }
      );
    return t(
      ['queued', 'running'].includes(r.coverageCheck?.state)
        ? '正在自动核查覆盖…'
        : r.coverageCheck?.state === 'error'
          ? '覆盖核查暂未完成'
          : '覆盖尚未核验'
    );
  };
  function revoke() {
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
  }
  async function preview(row) {
    if (!dialog.open) return;
    const key = row && (row.record?.sha256 || row.diskRecord?.sha256);
    if (key === previewKey) {
      if (row) image.alt = cloudTitle(row);
      return;
    }
    previewKey = key;
    previewError = '';
    const serial = ++previewSerial;
    revoke();
    image.hidden = true;
    if (!key) return;
    try {
      let blob;
      if (row.record && !row.record.integrityFailed) {
        try {
          const bitmap = await createImageBitmap(row.record.blob, {
            resizeWidth: 1024,
            resizeHeight: 512,
            resizeQuality: 'high',
          });
          try {
            const canvas = new OffscreenCanvas(1024, 512);
            canvas.getContext('2d').drawImage(bitmap, 0, 0);
            blob = await canvas.convertToBlob({ type: 'image/png' });
          } finally {
            bitmap.close();
          }
        } catch (error) {
          if (!row.diskRecord) throw error;
        }
      }
      if (!blob && row.diskRecord) {
        const meta = row.diskRecord;
        ({ blob } = await w.fetch(
          '/api/cloud/library/image?' +
            new URLSearchParams({ name: meta.disk, sha256: meta.sha256, preview: '1' }),
          4e6
        ));
      }
      if (serial !== previewSerial || !dialog.open || !blob) return;
      previewURL = URL.createObjectURL(blob);
      image.src = previewURL;
      image.alt = cloudTitle(row);
      image.hidden = false;
    } catch (e) {
      if (serial === previewSerial) {
        previewError = t('预览暂不可用') + '：' + cloudError(e);
        detailMeta.textContent += '\n' + previewError;
      }
    }
  }
  function render() {
    if (!dialog || disposed) return;
    for (const [element, key] of labels) if (element.isConnected) element.nodeValue = t(key);
    current.textContent = library.currentText;
    currentNote.textContent = library.current
      ? t('下载与模拟时间相互独立；当前固定使用此版本。')
      : t('选择已保存云图后，点击“使用此云图”即可切换。');
    if (w.env.settings?.clouds === false)
      currentNote.textContent += ' ' + t('云层目前已隐藏，可在地球设置中开启。');
    for (const [mode, b] of modeButtons) {
      b.setAttribute('aria-pressed', String(w.settings.cloud === mode));
      b.disabled = !!library.using || actionBusy;
    }
    savedTab.setAttribute('aria-pressed', String(view === 'saved'));
    globalTab.setAttribute('aria-pressed', String(view === 'global'));
    newTab.setAttribute('aria-pressed', String(view === 'catalog'));
    const globalRows = library.saved.filter((r) => nasaCoverage(rowMeta(r)) === 'global');
    globalTab.textContent = t('NASA 全球覆盖（{count}）', { count: globalRows.length });
    globalInfo.hidden = view !== 'global';
    const quick = view === 'catalog' && sourceSelect.value !== 'satcorps';
    sourceBar.hidden = view !== 'catalog';
    filters.hidden = view !== 'catalog' || quick;
    quickPanel.hidden = !quick;
    layout.hidden = quick;
    const source = quickSources[sourceSelect.value],
      unavailable = Boolean(source?.local && !library.local);
    quickInfo.textContent = source
      ? t(source.info) + (unavailable ? ' ' + t('此图源需要桌面本机服务。') : '')
      : '';
    quickDownload.disabled = library.downloading || unavailable;
    const catalog = library.catalog;
    if (view === 'catalog' && catalog.month === month.value) {
      const choices = JSON.stringify(catalog.dates || []);
      if (day.dataset.choices !== choices) {
        const value = day.value;
        day.replaceChildren(new Option(t('最近发布'), ''));
        for (const date of catalog.dates || []) day.add(new Option(date, date));
        day.value = [...day.options].some((o) => o.value === value) ? value : '';
        day.dataset.choices = choices;
      }
    }
    refreshButton.disabled = catalog.state === 'checking';
    stopCatalog.hidden = catalog.state !== 'checking';
    catalogStatus.hidden = view !== 'catalog' || quick;
    catalogStatus.textContent = catalog.message || t('选择月份并查询可下载的官方云图。');
    const checks = catalog.items?.map((item) => item.coverageCheck).filter(Boolean) || [];
    if (checks.length)
      catalogStatus.textContent +=
        '\n' +
        t('自动覆盖核查：{done}/{total} 已完成 · {pending} 等待或核查中', {
          done: checks.filter((c) => c.state === 'ready').length,
          total: checks.length,
          pending: checks.filter((c) => ['queued', 'running'].includes(c.state)).length,
        });
    if (catalog.coveragePollError) catalogStatus.textContent += '\n' + catalog.coveragePollError;
    const task = library.task;
    taskPanel.hidden = task.state === 'idle';
    taskPanel.dataset.state = task.state;
    taskStatus.textContent =
      (task.date
        ? task.date +
          ' ' +
          (String(task.hour).includes(':')
            ? task.hour
            : String(task.hour).padStart(2, '0') + ':00') +
          ' UTC\n'
        : '') + (task.message || '');
    cancelButton.hidden = !library.downloading;
    cancelButton.textContent = t(task.state === 'cancelling' ? '重试取消下载' : '取消下载');
    retryButton.hidden =
      !['error', 'cancelled'].includes(task.state) || (!task.date && !quickSources[task.provider]);
    taskView.hidden = task.state !== 'ready';
    const remote = view === 'catalog' && catalog.month === month.value ? catalog.items : [];
    rows = quick
      ? []
      : mergeCloudVersions(remote, w.items, library.disk).filter(
          (r) =>
            r.provider !== 'viirs' &&
            (view === 'global'
              ? !!(r.record || r.diskRecord) && nasaCoverage(rowMeta(r)) === 'global'
              : view === 'saved'
                ? !!(r.record || r.diskRecord)
                : r.provider === 'satcorps' &&
                  (!day.value || new Date(r.time).toISOString().slice(0, 10) === day.value) &&
                  (coverageFilter.value !== 'global' || nasaMostlyGlobal(rowMeta(r))))
        );
    if (!rows.some((r) => r.key === selectedKey))
      selectedKey =
        rows.find(
          (r) => selectedBase && versionKey(r) === selectedBase && r.record?.id === task.recordId
        )?.key ||
        rows.find((r) => r.record?.id === w.active.cloud)?.key ||
        rows[0]?.key ||
        null;
    const row = selected();
    selectedBase = row ? versionKey(row) : null;
    count.textContent =
      t('已保存 {count} 份云图', { count: library.saved.length }) +
      (library.libraryError ? ' · ' + t('本机图库暂未连接') : '');
    const signature = JSON.stringify([
      view,
      coverageFilter.value,
      checks.map((c) => c.state),
      rows.map((r) => [
        r.key,
        r.record?.id,
        r.record?.favorite,
        r.record?.integrityFailed,
        r.diskRecord?.disk,
        nasaCoverage(rowMeta(r)),
        rowMeta(r).coverageCheck,
        rowMeta(r).quality,
        w.active.cloud === r.record?.id,
        r.key === selectedKey,
      ]),
    ]);
    if (signature !== listSignature) {
      listSignature = signature;
      list.replaceChildren();
      if (!rows.length) {
        const p = document.createElement('p');
        p.className = 'library-empty';
        p.textContent = t(
          view === 'global'
            ? '已保存云图中尚无核验为全球覆盖的 NASA 版本。这不代表官方档案没有全球图；未下载时次的覆盖尚未知。'
            : view === 'saved'
              ? '还没有保存的云图。可下载新云图，或导入已有快照。'
              : coverageFilter.value === 'global'
                ? checks.some((c) => ['queued', 'running'].includes(c.state))
                  ? '正在筛选，符合条件的版本会自动出现在这里。'
                  : '本次已核查版本中，尚无符合条件的云图。'
                : '暂无可列出的版本。可更换月份或重试查询；已保存云图仍可使用。'
        );
        list.append(p);
      }
      for (const r of rows) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = cloudTitle(r);
        b.className = 'version-row';
        b.dataset.key = r.key;
        b.setAttribute('aria-pressed', String(r.key === selectedKey));
        b.onclick = () => {
          selectedKey = r.key;
          message = '';
          render();
        };
        const meta = rowMeta(r),
          info = document.createElement('span');
        info.textContent = [
          w.active.cloud === r.record?.id ? t('当前使用') : '',
          r.record || r.diskRecord ? t('已保存') : t('可下载'),
          r.record?.favorite ? t('已收藏') : '',
          meta.provider === 'satcorps' ? coverageLabel(meta) : '',
          meta.size ? (meta.size / 1e6).toFixed(1) + ' MB' : '',
        ]
          .filter(Boolean)
          .join(' · ');
        b.append(info);
        const hints = cloudWarnings(meta);
        if (hints.length) {
          const warn = document.createElement('span');
          warn.className = 'warning';
          warn.textContent = hints.join('；');
          b.append(warn);
        }
        list.append(b);
      }
    }
    const r = row?.record,
      meta = row ? rowMeta(row) : null,
      sceneBusy = !!(w.sim.sceneBusy || w.sim.missions?.busy),
      loading = !!library.using || actionBusy;
    detailTitle.textContent = row ? cloudTitle(row) : t('选择一份云图');
    detailMeta.textContent = row
      ? [
          meta.resolution || '8192×4096',
          meta.size ? (meta.size / 1e6).toFixed(2) + ' MB' : '',
          row.diskRecord ? t('本机已保存') : '',
          r ? t('此浏览器已保存') : '',
          !r && !row.diskRecord ? t('官方已发布，尚未下载') : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : t('预览和操作会显示在这里。');
    warning.textContent = row
      ? cloudWarnings(meta)
          .map((x) => t(x))
          .join('\n')
      : '';
    if (meta?.provider === 'satcorps') {
      const percent = (value) =>
        Number.isFinite(value) && value >= 0 && value <= 1 ? (100 * value).toFixed(2) + '%' : '—';
      detailMeta.textContent += '\n' + coverageLabel(meta);
      const estimated = nasaCoverageEstimate(meta);
      if (estimated)
        detailMeta.textContent +=
          '\n' +
          t('预核验覆盖：全球 {global} · 北极 {north} · 南极 {south}', {
            global: percent(estimated.coverage),
            north: percent(estimated.polarCoverage.north),
            south: percent(estimated.polarCoverage.south),
          });
      if (meta.coverageCheck?.state === 'error')
        warning.textContent += '\n' + t('覆盖检查未完成，可点击“查询可下载版本”重试。');
      if (Number.isFinite(meta.coverage))
        detailMeta.textContent +=
          '\n' +
          t('有效覆盖：全球 {global} · 北极 {north} · 南极 {south}', {
            global: percent(meta.coverage),
            north: percent(meta.polarCoverage?.north),
            south: percent(meta.polarCoverage?.south),
          });
      if (meta.footprint)
        detailMeta.textContent +=
          '\n' +
          t('观测足迹：全球 {global} · 北极 {north} · 南极 {south}', {
            global: percent(meta.footprint?.global),
            north: percent(meta.footprint?.north),
            south: percent(meta.footprint?.south),
          });
      if (meta.quality?.status === 'rejected')
        warning.textContent =
          t('覆盖范围与图像质量分别核验：此图有质量提示，请先预览。') + '\n' + warning.textContent;
    }
    if (meta?.processing === LIVE_CLOUD_PROCESSING)
      warning.textContent += '\n' + t('观测时间未提供') + ' · Contains modified EUMETSAT data';
    if (meta?.provider === 'gmgsi' || meta?.provider === 'himawari') {
      if (meta.observedEnd)
        detailMeta.textContent +=
          ' · ' +
          t('观测范围') +
          ' ' +
          cloudDate({ time: meta.observedStart }) +
          ' – ' +
          cloudDate({ time: meta.observedEnd });
      warning.textContent +=
        '\n' +
        (meta.attribution ||
          (meta.provider === 'gmgsi' ? 'NOAA/NESDIS GMGSI' : 'JMA / NOAA NESDIS'));
    }
    license.hidden = meta?.provider !== 'gdps';
    if (meta?.provider === 'gdps') {
      detailMeta.textContent +=
        ' · ' + t('起报 {time}', { time: cloudDate({ time: meta.forecastRun }) });
      warning.textContent +=
        '\n' + (meta.attribution || 'Data Source: Environment and Climate Change Canada');
    }
    if (r?.integrityFailed) warning.textContent = t('浏览器副本损坏，请重新读取本机图或重新下载。');
    download.hidden =
      row?.provider !== 'satcorps' ||
      !row ||
      !!(r && !r.integrityFailed) ||
      (!!row.diskRecord && !r?.integrityFailed);
    download.disabled = !library.local || library.downloading || loading || !row;
    download.textContent = t(r?.integrityFailed ? '重新下载' : '下载云图');
    apply.hidden = !row || (!r && !row.diskRecord);
    apply.disabled =
      loading ||
      sceneBusy ||
      (!!r?.integrityFailed && !row.diskRecord) ||
      (!!r && w.active.cloud === r.id);
    apply.textContent = t(
      library.using === row?.key
        ? '正在加载…'
        : r && w.active.cloud === r.id
          ? '当前使用'
          : '使用此云图'
    );
    favorite.disabled = exportButton.disabled = loading || !row || (!r && !row.diskRecord);
    favorite.textContent = t(r?.favorite ? '取消收藏' : '收藏保留');
    remove.hidden = !r && !row?.diskRecord;
    remove.disabled =
      loading ||
      sceneBusy ||
      library.downloading ||
      !!library.removing ||
      w.busy ||
      (!r && !row?.diskRecord);
    status.textContent = message || library.libraryError || '';
    preview(row);
    if (previewError) detailMeta.textContent += '\n' + previewError;
  }
  async function action(fn) {
    if (actionBusy) return;
    actionBusy = true;
    message = '';
    render();
    try {
      await fn();
    } catch (e) {
      message = cloudError(e);
    } finally {
      actionBusy = false;
      render();
    }
  }
  function showSaved() {
    view = 'saved';
    listSignature = '';
    render();
  }
  function refresh(force = false) {
    if (!dialog) create();
    return library.refreshCatalog(month.value, day.value, force);
  }
  function showCatalog() {
    view = 'catalog';
    message = '';
    render();
    if (
      sourceSelect.value === 'satcorps' &&
      (library.catalog.month !== month.value || library.catalog.state === 'idle')
    )
      refresh();
  }
  function selectCurrent() {
    showSaved();
    selectedKey = library.saved.find((r) => r.record?.id === w.active.cloud)?.key || selectedKey;
    render();
  }
  function create() {
    sheet = node('style', document.head);
    sheet.textContent = css;
    dialog = node('dialog', document.body);
    dialog.id = 'cloudHistoryDialog';
    dialog.className = 'cloud-history';
    dialog.setAttribute('aria-labelledby', 'cloudHistoryTitle');
    const header = node('header', dialog);
    node('h2', header, '云图库').id = 'cloudHistoryTitle';
    button(header, '返回模拟器', () => dialog.close());
    const summary = node('section', dialog);
    summary.className = 'library-current';
    node('p', summary, '当前使用');
    current = node('strong', summary);
    current.id = 'cloudLibraryCurrent';
    currentNote = node('p', summary);
    const modes = node('div', summary);
    modes.className = 'history-buttons';
    modeButtons = new Map();
    const setMode = (mode) =>
      action(async () => {
        await w.setSource('cloud', mode);
        message = t('云图显示已切换');
      });
    modeButtons.set(
      'builtin',
      button(modes, '内置云图', () => setMode('builtin'))
    );
    button(modes, '查看当前版本', selectCurrent);
    const other = node('details', modes);
    node('summary', other, '其他显示方式');
    const otherButtons = node('div', other);
    otherButtons.className = 'history-buttons';
    for (const [mode, label] of [
      ['local', '本地生成'],
      ['off', '关闭云图'],
    ])
      modeButtons.set(
        mode,
        button(otherButtons, label, () => setMode(mode))
      );
    body = node('div', dialog);
    body.className = 'version-body';
    taskPanel = node('section', body);
    taskPanel.className = 'library-task';
    taskStatus = node('p', taskPanel);
    taskStatus.id = 'cloudDownloadStatus';
    taskStatus.setAttribute('role', 'status');
    const taskActions = node('div', taskPanel);
    taskActions.className = 'history-buttons';
    cancelButton = button(taskActions, '取消下载', () => library.cancel());
    cancelButton.id = 'historyCancel';
    retryButton = button(taskActions, '重试下载', () =>
      library
        .download({
          provider: library.task.provider || 'satcorps',
          date: library.task.date,
          slot: library.task.hour,
          revision: library.task.revision,
        })
        .catch(() => {})
    );
    taskView = button(taskActions, '查看已下载云图', () => {
      showSaved();
      selectedKey = library.completedRow?.key;
      render();
    });
    const tabs = node('div', body);
    tabs.className = 'library-tabs';
    tabs.setAttribute('aria-label', t('云图库视图'));
    savedTab = button(tabs, '已保存云图', showSaved);
    savedTab.id = 'cloudSavedTab';
    globalTab = button(tabs, 'NASA 全球覆盖', () => {
      view = 'global';
      message = '';
      listSignature = '';
      render();
    });
    globalTab.id = 'cloudGlobalTab';
    newTab = button(tabs, '下载新云图', showCatalog);
    newTab.id = 'cloudDownloadTab';
    const importFile = node('input', tabs);
    importFile.type = 'file';
    importFile.accept = '.json';
    importFile.hidden = true;
    importFile.id = 'importCloudVersion';
    button(tabs, '导入云图快照', () => importFile.click());
    importFile.onchange = () => {
      const file = importFile.files[0];
      if (file)
        action(async () => {
          try {
            await w.importFile(file, { cloudOnly: true });
            showSaved();
            message = t('快照已导入并使用');
          } finally {
            importFile.value = '';
          }
        });
    };
    count = node('p', body);
    count.className = 'library-storage';
    globalInfo = node(
      'p',
      body,
      '这里单列已下载或导入且覆盖达标的 NASA 云图。全球有效覆盖至少 99.5%，南北极各至少 99%，观测足迹也须达标；少量缺测仍可能存在。质量提示单独保留，新增下载会自动归类。'
    );
    globalInfo.id = 'cloudGlobalInfo';
    sourceBar = node('div', body);
    sourceBar.className = 'history-controls';
    const sourceLabel = node('label', sourceBar, '图源');
    sourceSelect = node('select', sourceLabel);
    sourceSelect.id = 'cloudDownloadSource';
    for (const [key, source] of Object.entries({
      ...quickSources,
      satcorps: { title: 'NASA SatCORPS · 历史时次' },
    })) {
      const option = node('option', sourceSelect, source.title);
      option.value = key;
    }
    sourceSelect.value = 'github';
    sourceSelect.onchange = () => {
      message = '';
      listSignature = '';
      if (sourceSelect.value !== 'satcorps') library.cancelCatalog();
      showCatalog();
    };
    quickPanel = node('section', body);
    quickInfo = node('p', quickPanel);
    quickDownload = button(quickPanel, '下载最新一帧', () =>
      library.download({ provider: sourceSelect.value }).catch(() => {})
    );
    quickDownload.id = 'cloudQuickDownload';
    filters = node('div', body);
    filters.className = 'history-controls';
    let label = node('label', filters, '月份');
    month = node('input', label);
    month.id = 'historyMonth';
    month.type = 'month';
    month.value = month.max = new Date().toISOString().slice(0, 7);
    label = node('label', filters, '可用日期');
    day = node('select', label);
    day.id = 'historyDate';
    day.add(new Option(t('最近发布'), ''));
    label = node('label', filters, '覆盖筛选');
    coverageFilter = node('select', label);
    coverageFilter.id = 'historyCoverageFilter';
    for (const [value, text] of [
      ['all', '全部版本'],
      ['global', '基本覆盖全球（≥95%）'],
    ]) {
      const option = node('option', coverageFilter, text);
      option.value = value;
    }
    coverageFilter.value = 'all';
    coverageFilter.onchange = () => {
      listSignature = '';
      render();
    };
    const coverageNote = node(
      'p',
      filters,
      '目录加载后自动检查有效观测覆盖，先显示结果再决定下载。基本全球：面积覆盖至少95%，南北极各至少85%；预核验结果为估算。'
    );
    coverageNote.className = 'download-cost';
    refreshButton = button(filters, '查询可下载版本', () => refresh(true));
    refreshButton.id = 'historyRefresh';
    stopCatalog = button(filters, '停止查询', () => library.cancelCatalog());
    catalogStatus = node('p', body);
    catalogStatus.id = 'historyCatalogStatus';
    catalogStatus.setAttribute('role', 'status');
    const cost = node(
      'p',
      filters,
      '单份需下载并转换科学数据，最多约 220 MB，可能需要数分钟。下载完成后再选择使用。'
    );
    cost.className = 'download-cost';
    status = node('p', body);
    status.id = 'historyStatus';
    status.setAttribute('role', 'status');
    layout = node('div', body);
    layout.className = 'version-layout';
    list = node('div', layout);
    list.className = 'version-list';
    list.id = 'cloudArchiveList';
    list.setAttribute('aria-label', t('可选云图版本'));
    const detail = node('section', layout);
    detail.className = 'version-detail';
    detailTitle = node('h3', detail);
    detailMeta = node('p', detail);
    detailMeta.className = 'coverage-metadata';
    image = node('img', detail);
    image.className = 'history-preview';
    image.hidden = true;
    warning = node('p', detail);
    warning.className = 'version-warning';
    license = node('a', detail, '加拿大气象数据许可');
    license.href = 'https://eccc-msc.github.io/open-data/licence/readme_en/';
    license.target = '_blank';
    license.rel = 'noopener noreferrer';
    license.hidden = true;
    const actions = node('div', detail);
    actions.className = 'history-buttons';
    download = button(actions, '下载云图', () => {
      const row = selected();
      if (row) library.download(row).catch(() => {});
    });
    download.id = 'historyDownload';
    apply = button(actions, '使用此云图', () =>
      action(async () => {
        await library.use(selected());
        message = t('已使用云图：{version}', { version: library.currentText });
      })
    );
    apply.id = 'historyApply';
    favorite = button(actions, '收藏保留', () =>
      action(async () => {
        const r = await library.ensureRecord(selected());
        r.favorite = !r.favorite;
        await w.cache.put(r);
        await w.reload();
        message = t(r.favorite ? '已收藏，自动清理会保留此版本。' : '已取消收藏。');
      })
    );
    exportButton = button(actions, '导出快照', () =>
      action(async () => w.exportRecord(await library.ensureRecord(selected())))
    );
    remove = button(actions, '删除此云图', () =>
      action(async () => {
        const row = selected();
        if (!row) return;
        const active = row.record && w.active.cloud === row.record.id;
        const prompt =
          t(
            row.diskRecord
              ? '删除“{version}”？将删除浏览器副本和本机云图库文件。'
              : '删除“{version}”？将删除此浏览器保存的副本。',
            { version: cloudTitle(row) }
          ) +
          (active ? '\n' + t('当前正在使用此云图，删除前将切换为内置静态云图。') : '') +
          (row.record?.favorite ? '\n' + t('此版本已收藏，确认后仍会删除。') : '');
        if (!confirm(prompt)) return;
        await library.remove(row);
        message = t('此云图已删除。');
      })
    );
    remove.id = 'historyRemove';
    month.onchange = () => {
      day.replaceChildren(new Option(t('最近发布'), ''));
      delete day.dataset.choices;
      refresh();
    };
    day.onchange = () => refresh();
    dialog.addEventListener('keydown', (e) => e.stopPropagation());
    dialog.addEventListener('close', () => {
      ++previewSerial;
      previewKey = null;
      revoke();
      image.hidden = true;
      const target = opener?.checkVisibility?.()
        ? opener
        : document.getElementById('updateCloudSource');
      target?.focus();
      w.sim.lastWall = performance.now();
    });
  }
  const unsubscribe = library.subscribe(render),
    unlanguage = onLanguageChange(() => {
      listSignature = '';
      render();
    });
  return {
    open() {
      if (!dialog) create();
      opener = document.activeElement;
      view = 'saved';
      selectedKey = null;
      message = '';
      if (!dialog.open) dialog.showModal();
      body.scrollTop = 0;
      render();
      library.loadSaved().catch((e) => {
        message = cloudError(e);
        render();
      });
    },
    refresh: () => refresh(),
    render,
    dispose() {
      disposed = true;
      unsubscribe();
      unlanguage();
      ++previewSerial;
      revoke();
      dialog?.remove();
      sheet?.remove();
    },
  };
}
