import {
  cloudJSON,
  historyAPI,
  historySelection,
  downloadHistory,
  mergeCloudVersions,
  versionCatalog,
  versionKey,
} from './cloud-history-data.js';
import { WEB_BUILD } from './runtime-assets.js';
import { CLOUD_MAX_BYTES, LIVE_CLOUD_PROCESSING } from './cloud-texture.js';
import { t } from './i18n.js';
import { downloadLiveCloud } from './live-cloud.js';
import { downloadGdpsCloud } from './gdps-cloud.js';

export const cloudDate = (r) =>
  Number.isFinite(r?.time) && r.time > 0 && r.time < 8.64e15
    ? new Date(r.time).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
    : t('观测时间未提供');
export function cloudTitle(r) {
  if (r?.provider === 'satcorps') return 'NASA · ' + cloudDate(r);
  if (r?.provider === 'himawari') return t('向日葵-9') + ' · ' + cloudDate(r);
  if (r?.provider === 'gdps') return 'ECCC GDPS · ' + t('预报有效 {time}', { time: cloudDate(r) });
  if (r?.provider === 'gmgsi') return 'NOAA GMGSI · ' + cloudDate(r);
  if (r?.processing !== LIVE_CLOUD_PROCESSING) return t('GitHub 旧云图') + ' · ' + cloudDate(r);
  const timestamp = r.time
    ? cloudDate(r)
    : t('保存于 {time}', { time: cloudDate({ time: r.downloaded || r.record?.downloaded }) });
  return 'Live Cloud Maps · ' + timestamp;
}
export const cloudError = (e) =>
  ['NotFoundError', 'NotReadableError'].includes(e.name)
    ? t('浏览器云图副本无法读取，请重新下载或导入快照。')
    : e.name === 'TimeoutError'
      ? t('请求超时，请重试；已有数据已保留')
      : /Failed to fetch|Load failed|NetworkError/i.test(e.message || '')
        ? t('连接失败，请检查网络后重试；已保存云图仍可使用')
        : e.message || String(e);

function sameCloud(a, b) {
  return Boolean(
    a &&
      b &&
      a.sha256 === b.sha256 &&
      a.time === b.time &&
      (a.provider || 'github') === (b.provider || 'github') &&
      (a.provider !== 'gdps' || a.forecastRun === b.forecastRun)
  );
}
async function readCurrentCopy(weather, selected) {
  const current = await weather.cache.get(selected.id);
  if (
    !sameCloud(current, selected) ||
    current.kind !== 'cloud' ||
    !current.blob ||
    current.blob.size > CLOUD_MAX_BYTES
  )
    throw Error('云图记录已改变');
  // WebKit's IndexedDB Blob can lose its backing file after another write.
  // Own these verified bytes until the renderer, preview or export is finished.
  const blob = new Blob([await current.blob.arrayBuffer()], { type: current.blob.type });
  if ((await weather.checkedCloudHash(blob)) !== current.sha256) throw Error('云图文件校验失败');
  return { ...current, provider: current.provider || 'github', blob };
}

// One owner for the library and long-running download, independent of its dialog.
// Weather.active is the sole authority for the image that actually reached the renderer.
export class CloudLibrary {
  constructor(weather) {
    this.w = weather;
    this.disk = [];
    this.listeners = new Set();
    this.libraryError = '';
    this.catalog = { state: 'idle', items: [], dates: [], month: '', date: '', message: '' };
    this.catalogs = new Map();
    this.task = { state: 'idle', message: '' };
    this.taskGeneration = 0;
    this.using = null;
  }
  get local() {
    return !WEB_BUILD && typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
  }
  get current() {
    return this.w.items.find((r) => r.kind === 'cloud' && r.id === this.w.active.cloud);
  }
  get currentText() {
    const r = this.current;
    if (!r && this.w.waitingForRegionalCloud) return t('向日葵云图尚未载入');
    return r
      ? cloudTitle(r)
      : t(
          this.w.settings.cloud === 'local'
            ? '本地生成'
            : this.w.settings.cloud === 'off'
              ? '云图已关闭'
              : '内置静态云图'
        );
  }
  get saved() {
    return mergeCloudVersions([], this.w.items, this.disk).filter((r) => r.provider !== 'viirs');
  }
  get completedRow() {
    const { recordId, result } = this.task,
      rows = this.saved;
    if (recordId) {
      const exact = rows.find((r) => r.record?.id === recordId);
      if (exact) return exact;
    }
    if (result?.sha256)
      return rows.find(
        (r) =>
          r.provider === result.provider && r.time === result.time && r.sha256 === result.sha256
      );
  }
  get downloading() {
    return ['running', 'cancelling'].includes(this.task.state);
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  notify() {
    for (const fn of this.listeners) fn();
    this.w.resourcePanel?.render();
  }
  async loadSaved() {
    const generation = (this.savedGeneration = (this.savedGeneration || 0) + 1);
    await this.w.reload();
    if (this.local) {
      try {
        const data = await cloudJSON('library');
        if (generation !== this.savedGeneration) return this.saved;
        this.disk = data.items || [];
        this.libraryError = '';
        this.w.serverCache = {
          count: this.disk.length,
          bytes: this.disk.reduce((n, r) => n + (r.size || 0), 0),
        };
      } catch (e) {
        if (generation !== this.savedGeneration) return this.saved;
        this.libraryError = cloudError(e);
      }
    }
    this.notify();
    return this.saved;
  }
  refreshCatalog(month, date = '', force = false) {
    if (this.catalogPromise && this.catalog.month === month && this.catalog.date === date && !force)
      return this.catalogPromise;
    this.stopCoveragePolling();
    this.catalogController?.abort();
    const controller = new AbortController();
    this.catalogController = controller;
    const query = month + '|' + date,
      previous = this.catalogs.get(query);
    this.catalog = {
      ...(previous || { items: [], dates: [] }),
      month,
      date,
      state: 'checking',
      message: t('正在查询可下载云图…'),
    };
    this.notify();
    const run = async () => {
      try {
        if (!this.local) throw Error(t('NASA 下载需要桌面本机服务；可在此导入已有云图快照。'));
        const data = await versionCatalog('satcorps', month, date, force, controller.signal);
        if (controller.signal.aborted) return;
        this.catalog = { ...data, month, date, state: 'ready', message: data.message };
        this.catalogs.set(query, this.catalog);
        this.startCoveragePolling(month, date);
      } catch (e) {
        if (this.catalogController !== controller) return;
        this.catalog = {
          ...this.catalog,
          state: controller.signal.aborted ? 'idle' : 'error',
          message: controller.signal.aborted ? t('已停止目录查询') : cloudError(e),
        };
      } finally {
        if (this.catalogController === controller) {
          this.catalogPromise = null;
          this.catalogController = null;
          this.notify();
        }
      }
    };
    const promise = Promise.resolve().then(run);
    this.catalogPromise = promise;
    return promise;
  }
  stopCoveragePolling() {
    clearTimeout(this.coverageTimer);
    this.coverageController?.abort();
    this.coverageController = null;
  }
  startCoveragePolling(month, date) {
    this.stopCoveragePolling();
    if (
      !this.local ||
      !this.catalog.items.some((item) => ['queued', 'running'].includes(item.coverageCheck?.state))
    )
      return;
    const controller = (this.coverageController = new AbortController());
    let failures = 0;
    const poll = async () => {
      try {
        const data = await cloudJSON(
          'coverage?' + new URLSearchParams({ month, ...(date ? { date } : {}) }),
          { signal: controller.signal }
        );
        if (
          controller.signal.aborted ||
          this.coverageController !== controller ||
          this.catalog.month !== month ||
          this.catalog.date !== date
        )
          return;
        const checked = new Map((data.items || []).map((item) => [item.key, item.coverageCheck]));
        this.catalog.items = this.catalog.items.map((item) =>
          checked.has(item.key) ? { ...item, coverageCheck: checked.get(item.key) } : item
        );
        this.catalog.coverageStatus = data.coverageStatus;
        this.catalog.coveragePollError = '';
        this.catalogs.set(month + '|' + date, this.catalog);
        failures = 0;
        this.notify();
        if (
          !this.catalog.items.some((item) =>
            ['queued', 'running'].includes(item.coverageCheck?.state)
          )
        )
          return;
      } catch (error) {
        if (controller.signal.aborted || this.coverageController !== controller) return;
        this.catalog.coveragePollError = cloudError(error);
        this.notify();
        if (++failures >= 3) return;
      }
      this.coverageTimer = setTimeout(poll, failures ? 6000 : 3000);
      this.coverageTimer.unref?.();
    };
    this.coverageTimer = setTimeout(poll, 1500);
    this.coverageTimer.unref?.();
  }
  cancelCatalog() {
    this.stopCoveragePolling();
    this.catalogController?.abort();
  }
  async restore() {
    const generation = this.taskGeneration;
    await this.loadSaved();
    if (!this.local) return;
    try {
      const job = await historyAPI('status');
      if (this.taskGeneration !== generation || this.downloadPromise || this.cancelPromise) return;
      if (['running', 'cancelling'].includes(job.state)) {
        const selected = {
          ...historySelection(job.provider || 'satcorps', job.date, job.hour),
          revision: job.revision,
        };
        this.download(selected, { resumeJob: job }).catch(() => {});
      } else if (job.state === 'ready') {
        this.task = { ...job, state: 'ready', message: t('上次下载已完成，云图保存在本机图库。') };
        this.notify();
      } else if (['error', 'cancelled'].includes(job.state)) {
        this.task = { ...job, message: job.error || t('已取消下载') };
        this.notify();
      }
    } catch (e) {
      if (this.taskGeneration === generation) {
        this.libraryError = cloudError(e);
        this.notify();
      }
    }
  }
  download(row, { resumeJob } = {}) {
    if (this.removing) return Promise.reject(Error(t('正在删除云图，请稍候')));
    if (this.downloadPromise) return this.downloadPromise;
    if (this.task.state === 'cancelling')
      return Promise.reject(Error(t('正在确认下载已停止，请稍候或重试取消')));
    const provider = row.provider || 'satcorps',
      browserDownload = ['github', 'gdps'].includes(provider);
    if (!browserDownload && !this.local)
      return Promise.reject(Error(t('此图源需要桌面本机服务。')));
    const generation = ++this.taskGeneration;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.task = {
      state: 'running',
      provider,
      date: row.date,
      hour: row.slot ?? row.hour,
      id: resumeJob?.id || (browserDownload ? null : crypto.randomUUID().replaceAll('-', '')),
      message: t(resumeJob ? '已接回本机下载进度…' : '正在连接所选云图…'),
    };
    const onProgress = (message) => {
      if (this.taskGeneration !== generation || signal.aborted) return;
      this.task.message = message;
      this.notify();
    };
    const run = async () => {
      try {
        let record;
        if (browserDownload) {
          const download = provider === 'gdps' ? downloadGdpsCloud : downloadLiveCloud;
          record = await download(this.w, { signal, onProgress });
        } else {
          const latest = ['gmgsi', 'himawari'].includes(provider);
          const frame =
            latest && !row.date ? await cloudJSON(provider + '/latest', { signal }) : row;
          signal.throwIfAborted();
          const selection = historySelection(
            provider,
            frame.date,
            String(frame.slot ?? frame.hour)
          );
          selection.requestId = this.task.id;
          if (latest) selection.revision = frame.createdAt || frame.revision;
          Object.assign(this.task, {
            date: selection.date,
            hour: selection.slot,
            time: selection.time,
            revision: selection.revision,
            serverRequested: true,
          });
          record = await downloadHistory(selection, this.w, onProgress, {
            signal,
            resumeJob,
            onJob: (id) => {
              if (this.taskGeneration === generation) this.task.id = id;
            },
            onState: (job) => {
              if (this.taskGeneration === generation) this.task.startedAt = job.startedAt;
            },
          });
        }
        if (this.taskGeneration === generation)
          this.task = {
            ...this.task,
            state: 'ready',
            recordId: record.id,
            message: t('下载完成，已加入云图库；点击“使用此云图”才会切换画面。'),
          };
        await this.loadSaved();
        return record;
      } catch (e) {
        if (
          this.taskGeneration === generation &&
          (this.task.state !== 'cancelling' || !this.task.serverRequested)
        )
          this.task = {
            ...this.task,
            state: e.name === 'AbortError' ? 'cancelled' : 'error',
            message:
              e.name === 'AbortError' ? t('已取消下载；当前使用的云图不变。') : cloudError(e),
          };
        // The service may have finished saving even if the browser transfer failed.
        await this.loadSaved();
        throw e;
      } finally {
        if (this.downloadPromise === promise) {
          this.controller = null;
          this.downloadPromise = null;
          this.w.jobs.delete('cloud:versions');
        }
        this.w.busy = this.w.jobs.size > 0 || !!this.w.nasaWatch || !!this.w.nasaRestoreTask;
        this.w.render();
        this.notify();
      }
    };
    const promise = Promise.resolve().then(run);
    this.downloadPromise = promise;
    this.w.jobs.set('cloud:versions', promise);
    this.w.busy = true;
    this.w.render();
    this.notify();
    return promise;
  }
  cancel() {
    if (this.cancelPromise) return this.cancelPromise;
    if (!this.downloading) return Promise.resolve();
    const target = {
        id: this.task.id,
        date: this.task.date,
        hour: this.task.hour,
        revision: this.task.revision,
      },
      generation = this.taskGeneration;
    this.task.state = 'cancelling';
    this.task.message = t('正在停止下载…');
    this.controller?.abort();
    this.notify();
    if (!this.task.serverRequested) {
      // An in-browser fetch or a NOAA directory lookup has no server job to stop.
      // Keep the slot occupied until the operation has released its buffers.
      return this.downloadPromise.catch(() => {});
    }
    const run = async () => {
      try {
        const stop = async (id) => {
          const value = await cloudJSON('history/cancel?' + new URLSearchParams({ id }), {
            method: 'POST',
          });
          if (!value.cancelled) throw Error(t('停止状态尚未确认'));
        };
        await stop(target.id);
        const job = await historyAPI('status');
        if (this.taskGeneration !== generation) return;
        if (
          ['running', 'cancelling'].includes(job.state) &&
          (job.provider || 'satcorps') === this.task.provider &&
          job.date === target.date &&
          job.hour === target.hour &&
          (!target.revision || (job.revision || 0) >= target.revision)
        )
          await stop(job.id);
        if (this.taskGeneration === generation)
          this.task = {
            ...this.task,
            state: 'cancelled',
            message: t('已取消下载；当前云图和已保存版本保留。'),
          };
      } catch (e) {
        if (this.taskGeneration === generation)
          this.task.message = t('尚未确认停止下载，请重试取消。') + ' ' + cloudError(e);
      } finally {
        this.cancelPromise = null;
        this.notify();
      }
    };
    const promise = Promise.resolve().then(run);
    this.cancelPromise = promise;
    return promise;
  }
  async ensureRecord(row) {
    const previous = row.record,
      meta = row.diskRecord;
    if (previous) {
      let copy;
      try {
        try {
          copy = await readCurrentCopy(this.w, previous);
        } catch (e) {
          if (!['NotFoundError', 'NotReadableError'].includes(e.name)) throw e;
          copy = await readCurrentCopy(this.w, previous);
        }
      } catch (error) {
        if (!sameCloud(meta, previous))
          throw Error(t('浏览器云图副本无法读取，请重新下载或导入快照。'), { cause: error });
      }
      if (copy) {
        const repaired = copy.integrityFailed;
        copy.integrityFailed = false;
        const hasSidecar =
          !copy.manualValidation && sameCloud(meta, copy) && meta.quality?.sha256 === copy.sha256;
        if (hasSidecar)
          Object.assign(
            copy,
            await this.w.validateManualCloud(
              { ...copy, quality: meta.quality },
              { fromLocalLibrary: true }
            )
          );
        // Persist a newly validated legacy map once. Its saved selection must
        // still be eligible after a restart; normal switches do not rewrite it.
        if (hasSidecar || repaired) await this.w.cache.put(copy);
        return copy;
      }
    }
    if (!meta) throw Error(t('请先下载此云图'));
    const { blob } = await this.w.fetch(
      '/api/cloud/library/image?' + new URLSearchParams({ name: meta.disk, sha256: meta.sha256 }),
      CLOUD_MAX_BYTES,
      { timeout: 60000 }
    );
    const checked = await this.w.validateManualCloud(
      { ...meta, blob, kind: 'cloud' },
      { fromLocalLibrary: true }
    );
    const record = await this.w.store('cloud', blob, {
      ...meta,
      ...checked,
      integrityFailed: false,
      archiveKey: versionKey(meta),
      archiveOnly: false,
    });
    this.w.pendingRecords.delete(record.id);
    return record;
  }
  async use(row) {
    if (this.using || this.removing) throw Error(t('正在加载云图，请稍候'));
    this.using = row.key;
    this.notify();
    try {
      const record = await this.ensureRecord(row);
      await this.w.useRecord(record);
      return record;
    } finally {
      this.using = null;
      this.notify();
    }
  }
  async remove(row) {
    if (!row || (!row.record && !row.diskRecord)) throw Error(t('请先选择已保存的云图'));
    if (
      this.removing ||
      this.using ||
      this.downloading ||
      this.w.busy ||
      this.w.sim.sceneBusy ||
      this.w.sim.missions?.busy
    )
      throw Error(t('数据正在更新，请稍后重试'));
    const identity = row.record || row.diskRecord;
    const records = this.w.items.filter(
      (item) => item.kind === 'cloud' && sameCloud(item, identity)
    );
    // Recheck the selected identity; stale UI must not remove a replaced record.
    if (row.record && !records.some((item) => item.id === row.record.id))
      throw Error(t('云图版本已改变，请刷新图库后重试'));
    const disks = this.disk.filter((item) => sameCloud(item, identity));
    if (row.diskRecord && !disks.some((item) => item.disk === row.diskRecord.disk))
      throw Error(t('云图版本已改变，请刷新图库后重试'));
    const ids = records.map((item) => item.id);
    this.removing = row.key;
    this.savedGeneration = (this.savedGeneration || 0) + 1;
    ++this.taskGeneration; // A delayed startup status cannot restore this completion card.
    this.notify();
    try {
      if (
        ids.includes(this.w.active.cloud) ||
        ids.includes(this.w.settings.cloudHistory) ||
        ids.includes(this.w.pendingApply?.cloud?.recordId)
      )
        await this.w.setSource('cloud', 'builtin', 'auto');
      for (const disk of disks) {
        const result = await cloudJSON(
          'library/delete?' +
            new URLSearchParams({
              name: disk.disk,
              sha256: disk.sha256,
              provider: disk.provider,
              time: String(disk.time),
            }),
          { method: 'POST' }
        );
        if (!result.deleted) throw Error(t('云图文件删除失败，请刷新图库后重试'));
      }
      // Manual deletion may include favourites/recent versions. Do not use
      // Weather.remove(), whose guards serve ordinary cache-retention actions.
      if (ids.length) await this.w.removeRecords(ids);
      if (ids.includes(this.task.recordId) || sameCloud(this.task.result, identity))
        this.task = { state: 'idle', message: '' };
      this.w.render();
    } finally {
      this.removing = null;
      await this.loadSaved();
    }
  }
  dispose() {
    this.stopCoveragePolling();
    this.catalogController?.abort();
    this.listeners.clear();
  }
}
