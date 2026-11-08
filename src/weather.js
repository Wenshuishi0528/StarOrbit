import { startupStatus } from './startup-status.js';
import { saveSkyCultureScreenshot } from './sky-culture-screenshot.js';
import { fetchResource, blobHash } from './resource-fetch.js';
import { ResourceRecovery, recoverableDownload } from './resource-recovery.js';
import { presetWeatherSettings } from './environment-presets.js';
import { mountResourcePanel } from './resource-panel.js';
import { WEB_BUILD } from './runtime-assets.js';
import { normalizeGeographySettings, syncGeographyControls } from './geography-settings.js';
import { normalizeStarChartSettings, syncStarChartControls } from './star-chart-settings.js';
import { validateRotation } from './spacecraft-attitude.js';
import { inspectCloudBitmap, requireCloudQuality } from './cloud-quality.js';
import { prepareGithubCloud } from './cloud-mask-repair.js';
import {
  cloudProvider,
  selectCloud,
  validateNASA,
  completeNASA,
  retireNASA,
  protectedCloudIds,
  cloudUnavailableReason,
  GITHUB_CLOUD_UNAVAILABLE,
} from './cloud-source.js';
import {
  CLOUD_PNG,
  LIVE_CLOUD_PROCESSING,
  CLOUD_MAX_BYTES,
  CLOUD_SNAPSHOT_MAX_BYTES,
  cloudChannel,
  cloudDecodeSize,
  cloudTone,
  fixedCloudField,
  textureChannel,
} from './cloud-texture.js';
import { OrbitRepository, orbitSource } from './orbit-repository.js';
import * as THREE from 'three';
import { t, errorText, onLanguageChange } from './i18n.js';
import { WeatherCache } from './weather-cache.js';
import { manualCloudUsable, cloudWarnings } from './cloud-manual.js';
import { versionKey } from './cloud-history-data.js';
import { CloudLibrary, cloudTitle } from './cloud-library.js';
import { validateAurora, auroraPixels, selectSnapshot, seedNumber, clamp } from './weather-math.js';
import { DEFAULT_MISSION, mission, bindOrbit, validatePose } from './missions.js';
import { validateOrbit } from './orbit.js';
const $ = (id) => document.getElementById(id),
  fmt = (x) =>
    Number.isFinite(x)
      ? new Date(x).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
      : t('观测时间未提供');
const SOURCE = {
  cloud: CLOUD_PNG,
  aurora: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
  orbit: 'https://en.cmse.gov.cn/news/202107/t20210722_48418.html',
};
const names = {
  cloud: '云图',
  aurora: '极光',
  orbit: '轨道',
  assets: '内置素材',
  'cloud-preview': 'VIIRS 旧试验',
};
const saveFile = (blob, name) => {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
export class Weather {
  constructor(env) {
    this.env = env;
    this.sim = env.sim;
    this.cache = new WeatherCache();
    this.items = [];
    this.active = {};
    this.tokens = { cloud: 0, aurora: 0 };
    this.messages = {};
    this.busy = false;
    this.lastUI = 0;
    this.lastHistory = 0;
    this.lastFrame = performance.now();
    this.frames = 0;
    this.fpsStart = this.lastFrame;
    this.fps = 60;
    this.pendingRecords = new Set();
    this.jobs = new Map();
    this.resourceStates = {};
    this.historyDirty = this.choicesDirty = true;
    this.settings = {
      autoClean: true,
      resourceChecks: {},
      cloud: 'builtin',
      aurora: 'off',
      cloudHistory: 'auto',
      auroraHistory: 'auto',
      seed: 'StarOrbit',
      auroraStrength: 1.4,
      limit: 200,
      adaptive: true,
      exposure: 1.15,
      volume: false,
      motion: true,
    };
    try {
      Object.assign(
        this.settings,
        JSON.parse(localStorage.getItem('tiangong-weather-settings-v1')) || {}
      );
    } catch {}
    this.sim.orbits = new OrbitRepository(this.sim, this, this.settings);
    delete this.settings.orbitRecord;
    delete this.settings.orbitRecords;
    // Legacy scene/preset readers use these accessors; persistence lives in OrbitRepository.
    Object.defineProperties(this.settings, {
      orbitRecord: {
        get: () => this.sim.orbits.selected,
        set: (v) => {
          this.sim.orbits.selected = v;
        },
      },
      orbitRecords: { get: () => this.sim.orbits.records },
    });
    for (const kind of ['cloud', 'aurora'])
      if (
        ![
          'builtin',
          'off',
          'latest',
          'history',
          'local',
          ...(kind === 'cloud' ? ['satcorps'] : []),
        ].includes(this.settings[kind])
      )
        this.settings[kind] = kind === 'cloud' ? 'builtin' : 'off';
    this.settings.limit = clamp(Number(this.settings.limit) || 200, 20, 2000);
    this.settings.auroraStrength = clamp(
      Number.isFinite(Number(this.settings.auroraStrength))
        ? Number(this.settings.auroraStrength)
        : 1.4,
      0,
      4
    );
    this.settings.seed = String(this.settings.seed).slice(0, 80);
    this.settings.exposure = clamp(Number(this.settings.exposure) || 1.15, 0.3, 2.5);
    // Background suspension is not a low-performance sample. Keep the simulation clock intact.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.fpsStart = performance.now();
        this.frames = 0;
        this.fastWindows = 0;
      }
    });
    this.settings.autoClean = this.settings.autoClean !== false;
    if (!this.settings.resourceChecks || typeof this.settings.resourceChecks !== 'object')
      this.settings.resourceChecks = {};
    if (!['satcorps', 'github'].includes(this.settings.cloudDownloadProvider))
      this.settings.cloudDownloadProvider =
        this.settings.cloud === 'satcorps' ? 'satcorps' : WEB_BUILD ? 'github' : 'satcorps';
    this.cloudLibrary = new CloudLibrary(this);
    this.resourcePanel = mountResourcePanel(this);
    this.recovery = new ResourceRecovery({
      run: (key, attempt) => this.retryResource(key, attempt),
      onState: (key, state) => {
        const current = this.resourceStates[key] || this.settings.resourceChecks[key] || {};
        this.resourceStates[key] = { ...current, ...state };
        this.settings.resourceChecks[key] = this.resourceStates[key];
        this.save();
        this.render();
      },
    });
    window.addEventListener('online', () => this.recovery.reconnect());
    this.bind();
    this.sync();
    this.ready = this.restore();
    this.ready.then(async () => {
      await this.nasaRestore?.catch(() => {});
      this.restoreRecovery();
    });
    onLanguageChange(() => {
      this.historyDirty = this.choicesDirty = true;
      this.render();
      this.renderPresets();
    });
  }
  async restore() {
    try {
      startupStatus('weather', 'Cloud cache open');
      const retired = await retireNASA(this.cache);
      if (retired.includes(this.settings.cloudHistory)) {
        this.settings.cloudHistory = 'auto';
        if (this.settings.cloud === 'history') this.settings.cloud = 'satcorps';
        this.sync();
      }
      await this.reload();
      if (
        this.settings.cloud === 'history' &&
        this.items.find((r) => r.id === this.settings.cloudHistory)?.provider === 'viirs'
      ) {
        this.settings.cloud = 'builtin';
        this.settings.cloudHistory = 'auto';
        this.sync();
        this.messages.cloud =
          'VIIRS 扫描试验不符合完整全球云图要求，已切回内置云图；旧数据保留在其他数据历史中';
      }
      startupStatus('weather', 'Cloud cache validation');
      await this.migrateCloudCache();
      startupStatus('weather', 'Orbit cache restore');
      this.normalizeCloudSelection();
      this.sync();
      await this.sim.orbits.restore();
      this.save();
      startupStatus('weather', null);
    } catch (e) {
      this.messages.cache = e.message;
    }
    this.render();
    // Shared server resources restore independently of model/orbit readiness.
    this.nasaRestore = this.restoreCloudLibrary().catch((e) => {
      this.messages.cloud = e.message;
      this.setResourceState('cloud', 'satcorps', { phase: 'error', message: e.message });
    });
  }
  restoreTextures() {
    // Called after the first scene update, with saved time and final quality in place.
    // Optional images must never hold model/orbit startup behind a decode.
    return (this.textureRestore ??= Promise.allSettled(
      ['cloud', 'aurora'].map((k) => this.apply(k).catch((e) => this.fail(k, e)))
    ));
  }
  save() {
    this.sim.orbits.save();
    try {
      localStorage.setItem('tiangong-weather-settings-v1', JSON.stringify(this.settings));
    } catch {}
  }
  normalizeCloudSelection(time = this.sim.time) {
    const s = this.settings;
    if (
      ['satcorps', 'latest'].includes(s.cloud) ||
      (s.cloud === 'history' && s.cloudHistory === 'auto')
    ) {
      const candidate = selectCloud(this.items, s.cloud, time, s.cloudHistory);
      const record =
        s.cloud === 'history' && candidate && Math.abs(candidate.time - time) > 6 * 3600e3
          ? null
          : candidate;
      s.cloud = record ? 'history' : 'builtin';
      s.cloudHistory = record?.id || 'auto';
    }
  }
  sync() {
    this.choicesDirty = true;
    for (const k of ['cloud', 'aurora']) $(k + 'Source').value = this.settings[k];
    $('volumeClouds').checked = this.settings.volume;
    $('cloudMotion').checked = this.settings.motion;
    $('weatherSeed').value = this.settings.seed;
    $('auroraStrength').value = this.settings.auroraStrength;
    $('cacheLimit').value = this.settings.limit;
    $('autoCleanCache').checked = this.settings.autoClean;
    $('adaptiveEffects').checked = this.settings.adaptive;
    $('earthExposure').value = this.settings.exposure;
    this.env.api.renderer.toneMappingExposure = this.settings.exposure;
  }
  bind() {
    for (const k of ['cloud', 'aurora']) {
      $(k + 'Source').onchange = () =>
        this.setSource(k, $(k + 'Source').value).catch((e) => this.fail(k, e));
      $(k + 'History').onchange = () =>
        this.setSource(k, 'history', $(k + 'History').value).catch((e) => this.fail(k, e));
    }
    for (const [id, key] of [
      ['volumeClouds', 'volume'],
      ['cloudMotion', 'motion'],
    ])
      $(id).onchange = () => {
        this.settings[key] = $(id).checked;
        this.save();
      };
    $('weatherSeed').oninput = () => {
      this.settings.seed = $('weatherSeed').value.slice(0, 80);
      this.save();
    };
    $('newWeatherSeed').onclick = () => {
      this.settings.seed = String(crypto.getRandomValues(new Uint32Array(1))[0]);
      $('weatherSeed').value = this.settings.seed;
      this.save();
    };
    $('auroraStrength').oninput = () => {
      this.settings.auroraStrength = Number($('auroraStrength').value);
      this.save();
    };
    $('adaptiveEffects').onchange = () => {
      this.settings.adaptive = $('adaptiveEffects').checked;
      this.save();
    };
    $('earthExposure').oninput = () => {
      this.settings.exposure = Number($('earthExposure').value);
      this.env.api.renderer.toneMappingExposure = this.settings.exposure;
      this.save();
    };
    $('updateCloudSource').onclick = () => this.resourcePanel.openCloud();
    $('updateEnvironment').onclick = () => this.updateAll();
    $('clearEnvironment').onclick = () => {
      if (this.busy) return;
      $('cacheDialog').showModal();
    };
    $('closeCacheDialog').onclick = () => $('cacheDialog').close();
    $('confirmClearCache').onclick = () => this.clear().catch((e) => this.fail('cache', e));
    $('cacheLimit').onchange = async () => {
      this.settings.limit = clamp(Number($('cacheLimit').value) || 200, 20, 2000);
      $('cacheLimit').value = this.settings.limit;
      this.save();
      try {
        await this.trim();
      } catch (e) {
        this.fail('cache', e);
      }
    };
    $('autoCleanCache').onchange = async () => {
      this.settings.autoClean = $('autoCleanCache').checked;
      this.save();
      try {
        await this.trim();
      } catch (e) {
        this.fail('cache', e);
      }
    };
    document.querySelector('[data-memory-key=downloads]').addEventListener('toggle', () => {
      if (this.resourcePanel.active && document.querySelector('[data-memory-key=downloads]').open)
        this.renderHistory();
    });
    $('importSnapshot').onchange = async (e) => {
      try {
        const f = e.target.files[0];
        if (f) await this.importFile(f);
      } catch (err) {
        this.fail('cache', err);
      } finally {
        e.target.value = '';
      }
    };
    $('photoMode').onclick = () => {
      document.body.classList.toggle('photo-mode');
      $('photoExit').hidden = !document.body.classList.contains('photo-mode');
    };
    $('photoExit').onclick = () => {
      document.body.classList.remove('photo-mode');
      $('photoExit').hidden = true;
    };
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $('photoExit').click();
      }
    });
    $('save4K').onclick = () => this.capture();
    $('saveEnvironmentPreset').onclick = () => this.savePreset();
    $('loadEnvironmentPreset').onclick = () =>
      this.loadPreset().catch((e) => this.fail('cache', e));
    $('deleteEnvironmentPreset').onclick = () => {
      const presets = this.presets();
      presets.splice(Number($('environmentPresets').value), 1);
      localStorage.setItem('tiangong-environment-presets-v1', JSON.stringify(presets));
      this.renderPresets();
    };
    this.renderPresets();
  }
  fail(k, e) {
    this.messages[k] = {
      key: '未更新，保留已有数据：{error}',
      params: { error: e.message || String(e) },
    };
    this.render();
  }
  async reload() {
    this.items = await this.cache.all();
    const total = this.items.reduce((n, r) => n + r.size, 0);
    this.cacheReport = {
      ...this.cacheReport,
      totalBytes: total,
      overBudget: total > this.settings.limit * 1048576,
    };
    this.historyDirty = this.choicesDirty = true;
    this.render();
  }
  protectedIds(extra = []) {
    return [
      ...new Set(
        [
          ...this.presets().flatMap((p) => [
            p.settings?.orbitRecord,
            p.settings?.cloudHistory,
            p.settings?.auroraHistory,
          ]),
          ...protectedCloudIds(this.items),
          ...this.pendingRecords,
          ...Object.values(this.pendingApply || {}).map((request) => request.recordId),
          ...Object.values(this.active),
          ...Object.values(this.settings.orbitRecords || {}),
          ...['cloud', 'aurora']
            .filter((k) => this.settings[k] === 'history')
            .map((k) => this.settings[k + 'History']),
          ...extra,
        ].filter((x) => x && x !== 'none' && x !== 'auto')
      ),
    ];
  }
  async trim(extra = []) {
    this.cacheReport = await this.cache.trim(
      this.settings.limit * 1048576,
      this.protectedIds(extra),
      this.settings.autoClean
    );
    if (this.cacheReport?.removedIds?.length) {
      for (const id of this.cacheReport.removedIds) this.thumbnails?.delete(id);
      await this.reload();
    } else this.render();
    return this.cacheReport;
  }
  async fetch(url, max = 16e6, options = {}) {
    return fetchResource(url, { max, ...options });
  }
  async store(kind, blob, extra = {}) {
    const hash = extra.contentHash || (await blobHash(blob));
    delete extra.contentHash;
    const id =
      kind +
      '-' +
      (kind === 'orbit' ? (extra.missionId || this.sim.missionId) + '-' : '') +
      (extra.archiveKey ? extra.archiveKey + '-' : '') +
      (extra.provider === 'satcorps' ? 'satcorps-' + extra.time + '-' : '') +
      hash;
    const existing = this.items.find(
      (x) =>
        x.id === id ||
        (extra.archiveKey &&
          x.kind === kind &&
          x.sha256 === hash &&
          x.provider === extra.provider &&
          x.time === extra.time &&
          (extra.provider !== 'viirs' || x.period === extra.period) &&
          (extra.provider !== 'gdps' || x.forecastRun === extra.forecastRun))
    );
    if (existing) {
      const updated = {
        ...existing,
        ...extra,
        blob,
        size: blob.size,
        sha256: hash,
        favorite: existing.favorite || extra.favorite === true,
      };
      await this.cache.put(updated);
      Object.assign(existing, updated);
      this.messages[kind] = '已是最新可用数据';
      return existing;
    }
    const record = {
      id,
      kind,
      ...(kind === 'orbit' ? { missionId: extra.missionId || this.sim.missionId } : {}),
      blob,
      size: blob.size,
      sha256: hash,
      downloaded: Date.now(),
      time: null,
      favorite: false,
      source: SOURCE[kind],
      ...extra,
    };
    this.pendingRecords.add(id);
    try {
      await this.cache.put(record);
    } catch (error) {
      // Recover only disposable history on real quota pressure; active/favourite data remain intact.
      if (error.name !== 'QuotaExceededError' || !this.settings.autoClean) {
        this.pendingRecords.delete(id);
        throw error;
      }
      try {
        await this.cache.trim(
          Math.max(0, this.items.reduce((n, r) => n + r.size, 0) - blob.size),
          this.protectedIds()
        );
        await this.reload();
        await this.cache.put(record);
      } catch (retryError) {
        this.pendingRecords.delete(id);
        throw retryError;
      }
    }
    try {
      await this.reload();
      await this.trim([id]);
      this.messages[kind] = '更新成功';
      return record;
    } catch (error) {
      this.pendingRecords.delete(id);
      throw error;
    }
  }
  resourceKey(kind, provider) {
    return kind === 'cloud'
      ? 'cloud:' + (provider || this.settings.cloudDownloadProvider)
      : kind === 'orbit'
        ? 'orbit:' + (provider || this.sim.missionId)
        : kind;
  }
  resourceState(kind, provider) {
    const key = this.resourceKey(kind, provider);
    return this.resourceStates[key] || this.settings.resourceChecks[key] || { phase: 'idle' };
  }
  isUpdating(kind, provider) {
    const key = this.resourceKey(kind, provider);
    return (
      this.jobs.has(key) || (key === 'cloud:satcorps' && !!(this.nasaWatch || this.nasaRestoreTask))
    );
  }
  latestRecord(kind, provider) {
    if (kind === 'cloud') provider ??= this.settings.cloudDownloadProvider;
    const id = provider || this.sim.missionId;
    return kind === 'cloud'
      ? selectCloud(this.items, provider === 'satcorps' ? 'satcorps' : 'latest', this.sim.time)
      : selectSnapshot(
          this.items.filter((r) => kind !== 'orbit' || (r.missionId || DEFAULT_MISSION) === id),
          kind,
          'latest'
        );
  }
  setResourceState(kind, provider, state) {
    const key = this.resourceKey(kind, provider);
    this.resourceStates[key] = { ...this.resourceState(kind, provider), ...state };
    this.render();
  }
  async setSource(kind, mode, history = this.settings[kind + 'History']) {
    if (kind === 'cloud' && mode === 'latest') {
      this.sync();
      throw Object.assign(Error(GITHUB_CLOUD_UNAVAILABLE), { retryable: false });
    }
    if (kind === 'cloud' && mode === 'history' && history !== 'auto') {
      const record = this.items.find((r) => r.id === history);
      if (!record || (!completeNASA(record) && !manualCloudUsable(record))) {
        this.choicesDirty = true;
        this.sync();
        this.render();
        throw Object.assign(
          Error(record ? cloudUnavailableReason(record) : '此云图副本已移除，请从云图库重新选择'),
          { retryable: false }
        );
      }
    }
    const previous = { mode: this.settings[kind], history: this.settings[kind + 'History'] };
    this.settings[kind] = mode;
    this.settings[kind + 'History'] = history;
    this.sync();
    try {
      await this.apply(kind);
      this.save();
      this.historyDirty = true;
      this.render();
    } catch (error) {
      if (this.settings[kind] === mode && this.settings[kind + 'History'] === history) {
        this.settings[kind] = previous.mode;
        this.settings[kind + 'History'] = previous.history;
        this.sync();
        this.save();
        await this.apply(kind);
      }
      throw error;
    }
  }
  async useLatest(kind, provider) {
    const record = this.latestRecord(kind, provider);
    if (!record) throw Error('尚无已下载数据，请先检查更新或导入快照');
    if (kind === 'orbit') {
      this.acceptOrbit(
        validateOrbit(JSON.parse(await record.blob.text())),
        record.id,
        provider || this.sim.missionId
      );
    } else if (kind === 'cloud') await this.useRecord(record);
    else await this.setSource(kind, 'latest');
    this.historyDirty = true;
    await this.trim();
    this.render();
  }
  retryResource(key, attempt) {
    if (this.sim.sceneBusy || this.sim.missions?.busy) {
      this.recovery.queue(key, attempt, Date.now() + 5000);
      return;
    }
    const [kind, provider] = key.split(':');
    return this.updateResource(kind, { provider, recoveryAttempt: attempt });
  }
  restoreRecovery() {
    for (const [key, saved] of Object.entries(this.settings.resourceChecks)) {
      if (key.startsWith('cloud:')) continue;
      const state = this.resourceStates[key] || saved;
      if (
        !this.recovery.pending.has(key) &&
        saved.recovery &&
        ['error', 'partial'].includes(state.phase) &&
        state.retryable !== false &&
        Date.now() - (state.checkedAt || 0) < 86400000
      ) {
        this.recovery.queue(key, saved.retryAttempt || 1, saved.retryAt || undefined);
      }
    }
  }
  updateResource(kind, { provider, recoveryAttempt = 0 } = {}) {
    provider =
      kind === 'cloud'
        ? provider || this.settings.cloudDownloadProvider
        : kind === 'orbit'
          ? provider || this.sim.missionId
          : undefined;
    const key = this.resourceKey(kind, provider);
    if (this.jobs.has(key)) return this.jobs.get(key);
    if (this.sim.sceneBusy || this.sim.missions?.busy)
      return Promise.reject(Error('正在恢复场景…'));
    this.recovery?.cancel(key, !recoveryAttempt);
    const run = async () => {
      await this.ready;
      const before = new Set(this.items.map((r) => r.id));
      this.setResourceState(kind, provider, {
        phase: 'checking',
        message: '检查中…',
        checkSummary: null,
      });
      const retrySelection =
        kind === 'orbit'
          ? (recoveryAttempt && this.resourceState(kind, provider).retrySelection) ||
            this.sim.orbits.selection(provider)
          : undefined;
      try {
        let record, outcome;
        if (kind === 'cloud') {
          record = await this.updateCloud(provider);
          outcome = record ? this.lastCloudOutcome?.[provider] : null;
        }
        if (kind === 'aurora') record = await this.updateAurora();
        if (kind === 'orbit') {
          if (!orbitSource(provider)) throw Error('此任务没有在线轨道源，请导入轨道文件');
          const r = await this.sim.orbits.update(provider, retrySelection);
          record = r?.record;
          outcome = r;
        }
        if (kind !== 'orbit') await this.apply(kind);
        await this.trim(record ? [record.id] : []);
        const phase =
          outcome?.status === 'partial'
            ? 'partial'
            : outcome?.status === 'unchanged' ||
                (!outcome?.status && record && before.has(record.id))
              ? 'unchanged'
              : 'updated';
        const state = {
          phase,
          checkedAt: outcome?.checkedAt || Date.now(),
          message:
            outcome?.message ||
            (phase === 'unchanged'
              ? '已是最新可用数据'
              : phase === 'partial'
                ? '检查未完成，保留已有数据'
                : '已下载新版本'),
          recordId: record?.id,
          retryable: !!outcome?.retryable,
          checkSummary: outcome?.checkSummary,
        };
        this.resourceStates[key] = state;
        this.settings.resourceChecks[key] = state;
        this.settings.checked = Date.now();
        this.save();
        if (phase === 'partial' && state.retryable) this.recovery?.queue(key, recoveryAttempt + 1);
        return { status: phase, record };
      } catch (error) {
        const timeout = ['AbortError', 'TimeoutError'].includes(error.name),
          network =
            /Failed to fetch|Load failed|NetworkError|network request failed|^HTTP \d{3}$/i.test(
              error.message || ''
            );
        const hint = timeout
          ? '请求超时，已有数据已保留；请稍后重试。'
          : network
            ? WEB_BUILD
              ? '数据源暂不可访问或不允许网页直接读取；可使用桌面版更新或导入文件。已有数据已保留。'
              : '数据源暂不可访问，请检查网络或稍后重试。已有数据已保留。'
            : null;
        const state = {
          phase: 'error',
          checkedAt: Date.now(),
          message: hint || {
            key: '未更新，保留已有数据：{error}',
            params: { error: error.message || String(error) },
          },
          retryable: recoverableDownload(error),
          retrySelection,
        };
        this.resourceStates[key] = state;
        this.settings.resourceChecks[key] = state;
        this.save();
        if (state.retryable) this.recovery?.queue(key, recoveryAttempt + 1);
        throw hint ? new Error(hint, { cause: error }) : error;
      } finally {
        for (const r of this.items)
          if (
            !before.has(r.id) &&
            r.kind === kind &&
            (kind !== 'orbit' || (r.missionId || DEFAULT_MISSION) === provider) &&
            (kind !== 'cloud' || cloudProvider(r) === provider)
          )
            this.pendingRecords.delete(r.id);
        this.jobs.delete(key);
        this.busy = this.jobs.size > 0 || !!this.nasaWatch || !!this.nasaRestoreTask;
        this.render();
      }
    };
    this.busy = true;
    const promise = Promise.resolve().then(run);
    this.jobs.set(key, promise);
    this.render();
    return promise;
  }
  async updateAll() {
    if (this.sim.sceneBusy || this.sim.missions?.busy) return;
    const jobs = [['aurora'], ['orbit', { provider: this.sim.missionId }]];
    // Metadata, aurora and orbit are independent. A slow catalog cannot stall the others.
    await Promise.allSettled([
      Promise.resolve().then(() => this.resourcePanel?.refreshCloudVersions?.()),
      ...jobs.map(([kind, options]) => this.updateResource(kind, options)),
    ]);
    this.render();
  }
  async updateAurora() {
    const cached = this.latestRecord('aurora'),
      response = await this.fetch(SOURCE.aurora, 3e6, {
        cached,
        onProgress: (p) => this.downloadProgress('aurora', undefined, p),
      });
    if (response.unchanged) return cached;
    const hash = await blobHash(response.blob),
      existing = this.items.find(
        (r) => r.kind === 'aurora' && (r.sha256 === hash || r.id.endsWith(hash))
      );
    if (existing) {
      existing.sha256 = hash;
      existing.http = response.http;
      await this.cache.put(existing);
      return existing;
    }
    this.setResourceState('aurora', undefined, { phase: 'processing', message: '正在校验数据…' });
    const value = validateAurora(JSON.parse(await response.blob.text()));
    if (cached && value.time < cached.time) throw Error('来源返回了较旧的数据，保留当前版本');
    return this.store('aurora', response.blob, {
      time: value.time,
      observed: value.observed,
      resolution: '360×181',
      http: response.http,
      contentHash: hash,
    });
  }
  downloadProgress(kind, provider, { received, total }) {
    this.progressTimes ??= {};
    const key = this.resourceKey(kind, provider),
      now = performance.now();
    if (now - (this.progressTimes[key] || 0) < 300 && received !== total) return;
    this.progressTimes[key] = now;
    this.setResourceState(kind, provider, {
      phase: 'downloading',
      message: {
        key: total ? '已下载 {received} / {total} MB' : '已下载 {received} MB',
        params: { received: (received / 1048576).toFixed(1), total: (total / 1048576).toFixed(1) },
      },
    });
  }
  orbitRecordFor(id) {
    return this.sim.orbits.records[id] ?? null;
  }
  orbitForMission(id) {
    return this.sim.orbits.resolve(id);
  }
  acceptOrbit(data, recordId, id) {
    this.historyDirty = true;
    return this.sim.orbits.accept(data, recordId, id);
  }
  useOrbit(data, notify = true) {
    return this.sim.orbits.use(data, notify);
  }
  async restoreCloudLibrary() {
    if (WEB_BUILD || !/^https?:$/.test(location.protocol)) return;
    await this.cloudLibrary.restore();
  }
  async nasaCall(path, method = 'GET') {
    const response = await fetch('/api/cloud/satcorps/' + path, {
      method,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw Object.assign(Error('NASA 本地资源服务暂不可用'), {
        retryable: response.status >= 500,
      });
    const job = await response.json();
    if (job.cache || job.diskCache) this.serverCache = job.cache || job.diskCache;
    return job;
  }
  restoreNASA() {
    if (WEB_BUILD || !/^https?:$/.test(location.protocol)) return Promise.resolve();
    if (this.nasaRestoreTask) return this.nasaRestoreTask;
    this.busy = true;
    this.setResourceState('cloud', 'satcorps', {
      phase: 'processing',
      message: '正在恢复本机云图…',
    });
    const task = Promise.resolve().then(() => this.restoreNASARun());
    this.nasaRestoreTask = task;
    const finish = () => {
      if (this.nasaRestoreTask === task) this.nasaRestoreTask = null;
      this.busy = this.jobs.size > 0 || !!this.nasaWatch;
      this.render();
    };
    task.then(finish, finish);
    return task;
  }
  async restoreNASARun() {
    if (WEB_BUILD || !/^https?:$/.test(location.protocol)) return;
    const job = await this.nasaCall('status');
    if (job.state === 'running') return this.watchNASA(job);
    let record;
    try {
      if (job.result) {
        record = await this.acceptNASA(job);
        await this.apply('cloud');
        await this.trim([record.id]);
      }
      if (job.state === 'error')
        this.setResourceState('cloud', 'satcorps', {
          phase: 'error',
          checkedAt: job.checkedAt,
          message: job.error || 'NASA 云图更新失败',
          retryable: job.retryable,
          checkSummary: job.checkSummary,
        });
      else if (job.result?.checkedAt)
        this.setResourceState('cloud', 'satcorps', {
          phase: job.result.updateStatus || 'unchanged',
          checkedAt: job.result.checkedAt,
          message: job.result.updateMessage,
          retryable: job.result.retryable,
          checkSummary: job.result.checkSummary,
        });
      else
        this.setResourceState('cloud', 'satcorps', {
          phase: 'idle',
          checkedAt: null,
          message: record ? '已恢复本机下载的云图' : '尚未检查',
        });
      if (
        (job.retryable || job.result?.retryable) &&
        Date.now() - (job.checkedAt || job.result?.checkedAt || 0) < 86400000
      )
        this.recovery?.queue(
          'cloud:satcorps',
          this.settings.resourceChecks['cloud:satcorps']?.retryAttempt || 1,
          this.settings.resourceChecks['cloud:satcorps']?.retryAt || undefined
        );
    } finally {
      if (record) this.pendingRecords.delete(record.id);
    }
  }
  watchNASA(job) {
    if (this.nasaWatch) return this.nasaWatch;
    const run = async () => {
      const deadline = Date.now() + 20 * 60e3;
      let record;
      try {
        while (job.state === 'running') {
          this.messages.cloud = job.status || 'NASA 云图下载中…';
          this.setResourceState('cloud', 'satcorps', {
            phase: 'downloading',
            message: this.nasaProgress(job.status),
            checkSummary: null,
          });
          if (Date.now() > deadline)
            throw Object.assign(Error('NASA 下载超时，已有云图已保留'), { retryable: true });
          await new Promise((resolve) => setTimeout(resolve, document.hidden ? 8000 : 2500));
          job = await this.nasaCall('status');
        }
        if (job.state === 'error')
          throw Object.assign(Error(job.error || 'NASA 云图更新失败'), {
            retryable: job.retryable,
          });
        if (!job.result) throw Error('NASA 云图暂不可用');
        try {
          record = await this.acceptNASA(job);
        } catch {
          job = await this.nasaCall('status');
          if (job.state === 'error' || !job.result)
            throw Object.assign(Error(job.error || 'NASA 云图暂不可用'), {
              retryable: job.retryable,
            });
          record = await this.acceptNASA(job);
        }
        await this.apply('cloud');
        await this.trim([record.id]);
        if (!this.jobs.has('cloud:satcorps')) {
          this.setResourceState('cloud', 'satcorps', {
            phase: job.result.updateStatus || 'unchanged',
            checkedAt: job.result.checkedAt,
            message: job.result.updateMessage,
            retryable: job.result.retryable,
            checkSummary: job.result.checkSummary,
          });
          if (job.result.retryable) this.recovery?.queue('cloud:satcorps');
        }
        return record;
      } catch (error) {
        if (!this.jobs.has('cloud:satcorps')) {
          const retryable = recoverableDownload(error);
          this.setResourceState('cloud', 'satcorps', {
            phase: 'error',
            checkedAt: job.checkedAt || Date.now(),
            message: error.message,
            retryable,
          });
          if (retryable) this.recovery?.queue('cloud:satcorps');
        }
        throw error;
      } finally {
        if (record) this.pendingRecords.delete(record.id);
      }
    };
    this.busy = true;
    this.nasaWatch = run().finally(() => {
      this.nasaWatch = null;
      this.busy = this.jobs.size > 0 || !!this.nasaRestoreTask;
      this.render();
    });
    return this.nasaWatch;
  }
  nasaProgress(message) {
    for (const prefix of [
      '检查 NASA 全球与极区覆盖 · ',
      '该候选未通过检查，继续查找 · ',
      '下载 NASA 云层字段 ',
    ])
      if (message?.startsWith(prefix))
        return { key: prefix + '{detail}', params: { detail: message.slice(prefix.length) } };
    return message || 'NASA 云图下载中…';
  }
  async updateNASA() {
    if (WEB_BUILD || !/^https?:$/.test(location.protocol))
      throw Error('请用桌面启动器打开软件后下载 NASA 云图');
    if (this.nasaRestoreTask) await this.nasaRestoreTask.catch(() => {});
    if (this.nasaWatch) return this.nasaWatch;
    const job = await this.nasaCall('update', 'POST');
    if (job.state === 'running') return this.watchNASA(job);
    if (job.state === 'error')
      throw Object.assign(Error(job.error || 'NASA 云图更新失败'), { retryable: job.retryable });
    if (!job.result) throw Error('NASA 云图暂不可用');
    return this.acceptNASA(job);
  }
  async checkedCloudHash(blob) {
    this.cloudHashes ??= new WeakMap();
    if (!this.cloudHashes.has(blob)) this.cloudHashes.set(blob, blobHash(blob));
    try {
      return await this.cloudHashes.get(blob);
    } catch (error) {
      this.cloudHashes.delete(blob);
      throw error;
    }
  }
  async migrateCloudCache() {
    const records = this.items
      .filter(
        (r) => r.kind === 'cloud' && cloudProvider(r) === 'satcorps' && r.quality?.schema !== 1
      )
      .sort((a, b) => (b.time || b.downloaded) - (a.time || a.downloaded));
    if (!records.length) return;
    const wasBusy = this.busy;
    this.busy = true;
    for (const record of records) this.pendingRecords.add(record.id);
    let accepted = 0,
      rejected = 0;
    try {
      for (const record of records) {
        try {
          if ((await this.checkedCloudHash(record.blob)) !== record.sha256)
            throw Object.assign(Error('缓存文件校验失败'), { reason: 'cache-integrity' });
          const quality = await this.validateCloud(record.blob);
          validateNASA({ ...record, quality });
          record.quality = quality;
          accepted++;
        } catch (error) {
          record.quality = error.quality || {
            schema: 1,
            status: 'rejected',
            reasons: [error.reason || 'legacy-validation-failed'],
            metrics: {},
            detail: error.message,
          };
          rejected++;
        }
        try {
          await this.cache.put(record);
        } catch {
          this.messages.cache = '云图质量检查结果暂时无法保存，下次启动将重新检查';
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      this.messages.cloud = `旧 NASA 云图已重新检查：${accepted} 份通过，${rejected} 份未通过；历史文件已保留`;
      // A concurrent trim may have reloaded fresh IndexedDB clones while validation
      // was yielding. Apply only the persisted reports, including failed writes.
      await this.reload();
      this.historyDirty = this.choicesDirty = true;
    } finally {
      for (const record of records) this.pendingRecords.delete(record.id);
      this.busy = wasBusy || this.jobs.size > 0 || !!this.nasaWatch || !!this.nasaRestoreTask;
      this.render();
    }
  }
  async acceptNASA(job) {
    if (!job.result) throw Error(job.error || 'NASA 云图暂不可用');
    const meta = validateNASA(job.result),
      existing = this.items.find(
        (r) =>
          r.kind === 'cloud' &&
          cloudProvider(r) === 'satcorps' &&
          r.sha256 === meta.sha256 &&
          r.time === meta.time
      );
    this.lastCloudOutcome ??= {};
    this.lastCloudOutcome.satcorps = {
      status: meta.updateStatus || (existing ? 'unchanged' : 'updated'),
      checkedAt: meta.checkedAt,
      message: meta.updateMessage,
      retryable: meta.retryable,
      checkSummary: meta.checkSummary,
    };
    if (meta.updateMessage) this.messages.cloud = meta.updateMessage;
    if (existing) {
      // Persisted metadata is not proof that IndexedDB still holds the right bytes.
      // Hash each immutable Blob once per session before trusting a restored record.
      let intact = false;
      try {
        intact = (await this.checkedCloudHash(existing.blob)) === meta.sha256;
      } catch {}
      if (intact) {
        const favorite = existing.favorite;
        Object.assign(existing, meta, { favorite, archiveOnly: false });
        await this.cache.put(existing);
        return existing;
      }
    }
    const { blob } = await this.fetch(
      '/api/cloud/satcorps/image?sha256=' + meta.sha256,
      CLOUD_MAX_BYTES,
      { onProgress: (p) => this.downloadProgress('cloud', 'satcorps', p) }
    );
    this.setResourceState('cloud', 'satcorps', { phase: 'processing', message: '正在校验数据…' });
    const digest = await this.checkedCloudHash(blob);
    if (digest !== meta.sha256) throw Error('NASA 云图校验失败，请重新下载');
    await this.validateCloud(blob);
    const row = await this.store('cloud', blob, { ...meta, contentHash: digest });
    if (meta.updateMessage) this.messages.cloud = meta.updateMessage;
    return row;
  }
  async updateCloud(provider = this.settings.cloudDownloadProvider) {
    if (provider === 'satcorps')
      throw Object.assign(Error('请在云图版本列表中选择下载'), { retryable: false });
    throw Object.assign(Error(GITHUB_CLOUD_UNAVAILABLE), { retryable: false });
  }
  async validateCloud(blob, alpha = false) {
    if (alpha) {
      const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
      if (![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => header[i] === v))
        throw Error('云图格式无效');
    }
    const image = await createImageBitmap(blob);
    try {
      if (image.width !== 8192 || image.height !== 4096) throw Error('云图尺寸无效');
      return requireCloudQuality(await inspectCloudBitmap(image));
    } finally {
      image.close();
    }
  }
  bindCloud() {
    this.env.uniforms.cloudTone.value = this.cloudTexture
      ? (this.cloudTexture.userData.cloudTone ?? cloudTone(this.cloudRecord))
      : 0;
    this.env.uniforms.cloudMap.value =
      this.cloudTexture || this.env.builtinCloud || this.env.fallback;
    this.env.uniforms.cloudChannel.value = this.cloudTexture
      ? (this.cloudTexture.userData.cloudChannel ?? textureChannel(this.cloudRecord))
      : 0;
  }
  async texture(record, isStale = () => false) {
    if (record.kind === 'aurora') {
      const d = auroraPixels(JSON.parse(await record.blob.text()));
      const tex = new THREE.DataTexture(d, 360, 181, THREE.RedFormat);
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      return tex;
    }
    const decode = async () => {
      if (isStale()) return null;
      if (record.sha256 && (await this.checkedCloudHash(record.blob)) !== record.sha256)
        throw Object.assign(Error('云图缓存完整性校验失败，请重新下载'), {
          code: 'CLOUD_CACHE_INTEGRITY',
        });
      let bitmap = await createImageBitmap(record.blob, {
        imageOrientation: 'flipY',
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
      try {
        const size = cloudDecodeSize(
          bitmap.width,
          bitmap.height,
          this.env.quality,
          this.env.api.renderer.capabilities.maxTextureSize
        );
        let tex;
        if (cloudTone(record) === 1) {
          const { output, width, height } = await prepareGithubCloud(
            bitmap,
            cloudChannel(record),
            size
          );
          tex = new THREE.DataTexture(output, width, height, THREE.RedFormat);
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.userData.cloudChannel = 0;
          tex.userData.cloudTone = 0;
        } else {
          if (size.width !== bitmap.width) {
            bitmap.close();
            bitmap = await createImageBitmap(record.blob, {
              imageOrientation: 'flipY',
              premultiplyAlpha: 'none',
              colorSpaceConversion: 'none',
              resizeWidth: size.width,
              resizeHeight: size.height,
              resizeQuality: 'high',
            });
          }
          if (cloudChannel(record) === 'validity') {
            const width = bitmap.width,
              height = bitmap.height,
              output = new Uint8Array(width * height * 4),
              strip = 64,
              canvas = new OffscreenCanvas(width, strip),
              ctx = canvas.getContext('2d', { willReadFrequently: true });
            for (let y = 0; y < height; y += strip) {
              if (isStale()) {
                bitmap.close();
                canvas.width = 1;
                return null;
              }
              const rows = Math.min(strip, height - y);
              ctx.clearRect(0, 0, width, strip);
              ctx.drawImage(bitmap, 0, y, width, rows, 0, 0, width, rows);
              const row = ctx.getImageData(0, 0, width, rows).data;
              for (let x = 0; x < row.length; x += 4) {
                const i = y * width * 4 + x,
                  a = row[x + 3];
                output[i] = output[i + 1] = output[i + 2] = Math.round((row[x] * a) / 255);
                output[i + 3] = a;
              }
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
            bitmap.close();
            canvas.width = 1;
            tex = new THREE.DataTexture(output, width, height, THREE.RGBAFormat);
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.userData.cloudChannel = textureChannel(record);
          } else tex = new THREE.Texture(bitmap);
        }
        tex.flipY = false;
        tex.colorSpace = THREE.NoColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.anisotropy = Math.min(
          this.env.quality === 'high' ? 16 : 4,
          this.env.api.renderer.capabilities.getMaxAnisotropy()
        );
        tex.needsUpdate = true;
        return tex;
      } catch (error) {
        bitmap.close();
        throw error;
      }
    };
    const pending = (this.cloudDecodeTask || Promise.resolve()).catch(() => {}).then(decode);
    this.cloudDecodeTask = pending;
    try {
      return await pending;
    } finally {
      if (this.cloudDecodeTask === pending) this.cloudDecodeTask = null;
    }
  }

  release(k) {
    const tex = this[k + 'Texture'];
    if (tex) {
      tex.dispose();
      tex.image?.close?.();
      this[k + 'Texture'] = null;
    }
    this.active[k] = null;
  }
  async apply(k) {
    const mode = this.settings[k];
    let record = null;
    if (k === 'cloud' && mode === 'latest') this.messages.cloud = GITHUB_CLOUD_UNAVAILABLE;
    if (['latest', 'history', 'satcorps'].includes(mode)) {
      record =
        k === 'cloud'
          ? selectCloud(this.items, mode, this.sim.time, this.settings[k + 'History'])
          : selectSnapshot(this.items, k, mode, this.sim.time, this.settings[k + 'History']);
      if (k === 'cloud' && !record && mode !== 'latest')
        this.messages.cloud = '没有通过质量检查的匹配云图，当前使用内置云图；旧档保留供预览和导出';
      if (
        record &&
        mode === 'history' &&
        this.settings[k + 'History'] === 'auto' &&
        Math.abs(record.time - this.sim.time) > 6 * 3600e3
      )
        record = null;
    }
    this.pendingApply ??= {};
    const key = record ? record.id + '|' + (k === 'cloud' ? this.env.quality : '') : mode + '|none';
    if (this.pendingApply[k]?.key === key && this.pendingApply[k].token === this.tokens[k])
      return this.pendingApply[k].promise;
    const token = ++this.tokens[k],
      run = async () => {
        if (
          record &&
          this.active[k] === record.id &&
          !(k === 'cloud' && this.cloudTier !== this.env.quality)
        ) {
          if (k === 'cloud') this.bindCloud();
          this.status(k);
          return;
        }
        if (record) {
          const stale = () => token !== this.tokens[k];
          let tex;
          try {
            tex = await this.texture(record, stale);
          } catch (error) {
            // A disk-backed IDB handle can also expire while restoring the saved
            // selection or changing quality. Only this optional texture waits for repair.
            const fileError =
              ['NotFoundError', 'NotReadableError'].includes(error.name) ||
              error.code === 'CLOUD_CACHE_INTEGRITY';
            if (k !== 'cloud' || !fileError || !this.cloudLibrary) throw error;
            if (stale()) return;
            await this.nasaRestore?.catch(() => {});
            if (stale()) return;
            const row = this.cloudLibrary.saved.find((item) => item.record?.id === record.id);
            if (!row) throw error;
            record = await this.cloudLibrary.ensureRecord(row);
            if (stale()) return;
            tex = await this.texture(record, stale);
          }
          if (!tex) return;
          if (stale()) {
            tex.dispose();
            tex.image?.close?.();
            return;
          }
          this.release(k);
          this[k + 'Texture'] = tex;
          this.active[k] = record.id;
          this.cloudTier = this.env.quality;
          if (k === 'cloud') this.cloudRecord = record;
        } else {
          const had = !!this.active[k];
          this.release(k);
          if (!had && this.appliedMode?.[k] === mode) {
            this.status(k);
            return;
          }
        }
        this.appliedMode ??= {};
        this.appliedMode[k] = mode;
        this.historyDirty = true;
        if (k === 'cloud') this.bindCloud();
        else this.env.auroraUniforms.auroraMap.value = this.auroraTexture || this.env.fallback;
        this.render();
      };
    const promise = run(),
      request = { key, promise, token, recordId: record?.id };
    this.pendingApply[k] = request;
    try {
      return await promise;
    } finally {
      if (this.pendingApply[k] === request) delete this.pendingApply[k];
    }
  }
  async validateManualCloud(record, { fromLocalLibrary = false } = {}) {
    if (record.provider === 'viirs' || record.kind === 'cloud-preview')
      throw Error('VIIRS 扫描预览不是完整全球合成云图，请选择 NASA 全球版本');
    const blob = record.blob;
    if (!blob || blob.size > CLOUD_MAX_BYTES) throw Error('云图文件无效或过大');
    const digest = await this.checkedCloudHash(blob);
    if (record.sha256 && digest !== record.sha256) {
      const stored = this.items.find((r) => r.id === record.id);
      if (stored?.blob === blob) stored.integrityFailed = true;
      throw Error('云图文件校验失败，请重新下载');
    }
    if (
      ['satcorps', 'gmgsi', 'himawari'].includes(record.provider) &&
      (!Number.isFinite(record.time) ||
        record.time <= 0 ||
        record.time > Date.now() + 300000 ||
        !(record.coverage > 0 && record.coverage <= 1))
    )
      throw Error('此版本没有有效观测数据或日期无效');
    if (
      record.provider === 'gdps' &&
      (!Number.isFinite(record.forecastRun) ||
        record.forecastRun <= 0 ||
        record.forecastRun > Date.now() + 300000 ||
        !Number.isFinite(record.time) ||
        record.time < record.forecastRun ||
        record.time - record.forecastRun > 10 * 86400000)
    )
      throw Error('预报起报或有效时间无效');
    const image = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
    try {
      if (image.width > 8192 || image.width < 1024 || image.height * 2 !== image.width)
        throw Error('云图格式或尺寸不支持');
      const width = 256,
        height = width / 2,
        c = new OffscreenCanvas(width, height),
        ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      let validPixels = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) validPixels++;
      const noaa = record.provider === 'gmgsi',
        cropped = record.processing === LIVE_CLOUD_PROCESSING;
      if (noaa || cropped) {
        if (record.channel !== 'validity' || (cropped && record.provider !== 'github'))
          throw Error('云图通道无效');
        if (noaa && (image.width !== 4096 || image.height !== 2048)) throw Error('云图尺寸无效');
        // Allow one downsampled cell at the edge of the valid latitude band.
        const polarRows = Math.floor((height * (90 - (noaa ? 60 : 67.5))) / 180) - 1,
          edge = polarRows * width * 4;
        for (let i = 3; i < edge; i += 4)
          if (pixels[i] || pixels[pixels.length - edge + i]) throw Error('云图极区校验失败');
      }
      if (fixedCloudField(record)) {
        const isRegional = record.provider === 'himawari';
        if (record.channel !== 'validity' || image.width !== (isRegional ? 4096 : 2400))
          throw Error('云图格式或尺寸不支持');
        if (isRegional) {
          // The back of the globe cannot be observed from Himawari at 140.7°E.
          // Use a conservative margin at the limb of the downsampled validation mask.
          const rad = Math.PI / 180;
          for (let y = 0; y < height; y++) {
            const cosLat = Math.cos((90 - (180 * (y + 0.5)) / height) * rad);
            for (let x = 0; x < width; x++) {
              const fromSatellite =
                cosLat * Math.cos(((360 * (x + 0.5)) / width - 180 - 140.7) * rad);
              if (fromSatellite < 0.1 && pixels[(y * width + x) * 4 + 3])
                throw Error('向日葵云图覆盖范围无效');
            }
          }
        }
      }
      if (!validPixels) throw Error('此版本没有可加载的数据');
      // Desktop sidecars bind the converter's QA to these exact PNG bytes.
      // Import still screens the actual pixels independently of snapshot metadata.
      const certified =
        fromLocalLibrary && record.quality?.schema === 1 && record.quality.sha256 === digest;
      const quality =
        record.provider === 'satcorps' && !certified
          ? await inspectCloudBitmap(image)
          : record.quality;
      return {
        sha256: digest,
        quality,
        manualValidation: { schema: 1, sha256: digest, validPixels },
        warnings: cloudWarnings({ ...record, quality }),
      };
    } finally {
      image.close();
    }
  }
  async useRecord(record) {
    if (
      (!['cloud', 'cloud-preview'].includes(record.kind) && this.busy) ||
      this.sim.sceneBusy ||
      this.sim.missions?.busy
    )
      throw Error('数据正在更新，请稍后重试');
    if (['cloud', 'cloud-preview'].includes(record.kind)) {
      this.pendingRecords.add(record.id);
      try {
        // Selecting a verified image is a read. Rewriting the same IDB Blob here
        // can invalidate its file handle while another canvas is still using it.
        if (!manualCloudUsable(record)) {
          Object.assign(record, await this.validateManualCloud(record));
          await this.cache.put(record);
        }
        const index = this.items.findIndex((item) => item.id === record.id);
        if (index >= 0) this.items[index] = record;
        else await this.reload();
        await this.setSource('cloud', 'history', record.id);
      } finally {
        this.pendingRecords.delete(record.id);
      }
    } else if (record.kind === 'orbit') {
      const id = record.missionId || DEFAULT_MISSION;
      if (id !== this.sim.missionId) throw Error('请先切换到此轨道所属任务');
      this.acceptOrbit(validateOrbit(JSON.parse(await record.blob.text())), record.id, id);
    } else await this.setSource(record.kind, 'history', record.id);
    this.historyDirty = true;
    await this.trim();
    this.render();
  }
  async removeRecords(ids) {
    const selected = new Set(ids),
      current = this.active.orbit;
    for (const kind of ['cloud', 'aurora']) {
      if (selected.has(this.active[kind]) || selected.has(this.pendingApply?.[kind]?.recordId))
        ++this.tokens[kind];
      if (selected.has(this.active[kind])) {
        this.release(kind);
        if (kind === 'cloud') this.bindCloud();
        else this.env.auroraUniforms.auroraMap.value = this.env.fallback;
      }
    }
    for (const [id, key] of Object.entries(this.sim.orbits.records))
      if (selected.has(key)) this.sim.orbits.records[id] = null;
    for (const id of ids) {
      await this.cache.remove(id);
      this.thumbnails?.delete(id);
    }
    if (selected.has(current)) {
      this.useOrbit(this.sim.bundledOrbit);
      this.active.orbit = null;
    }
    this.save();
    await this.reload();
    await Promise.allSettled(['cloud', 'aurora'].map((k) => this.apply(k)));
  }
  async clear() {
    if (this.busy) throw Error('数据正在更新，请稍后重试');
    const selected = [...document.querySelectorAll('[data-clear-kind]:checked')].map(
        (x) => x.dataset.clearKind
      ),
      include = $('clearFavorites').checked;
    if (!WEB_BUILD && selected.includes('cloud') && /^https?:$/.test(location.protocol)) {
      try {
        const response = await this.nasaCall('clear', 'POST');
        if (response.cleared === false) throw Error('云图正在下载，请完成后清理');
        this.serverCache = { bytes: 0, count: 0 };
      } catch (error) {
        if (error.message.includes('正在下载')) throw error;
        this.messages.cache = '本机云图服务未连接，仅清理浏览器缓存';
      }
    }
    for (const key of [...(this.recovery?.pending.keys() || [])])
      if (selected.includes(key.split(':')[0])) this.recovery.cancel(key);
    await this.removeRecords(
      this.items
        .filter(
          (r) =>
            (selected.includes(r.kind) ||
              (r.kind === 'cloud-preview' && selected.includes('cloud'))) &&
            (!r.favorite || include)
        )
        .map((r) => r.id)
    );
    $('cacheDialog').close();
    this.messages.cache = '缓存已清理，组合和设置已保留';
    this.render();
  }
  async remove(id) {
    if (this.busy) throw Error('数据正在更新，请稍后重试');
    const item = this.items.find((r) => r.id === id);
    if (!item || item.favorite) return;
    await this.removeRecords([id]);
    this.render();
  }
  async exportRecord(record) {
    const bytes = new Uint8Array(await record.blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192)
      s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const { blob, ...meta } = record;
    saveFile(
      new Blob([JSON.stringify({ format: 'tiangong-weather-1', meta, base64: btoa(s) })], {
        type: 'application/json',
      }),
      'StarOrbit-' + record.kind + '-' + record.id.slice(-8) + '.json'
    );
  }
  async importFile(file, { cloudOnly = false } = {}) {
    if (this.sim.sceneBusy || this.sim.missions?.busy) throw Error('正在恢复场景…');
    const missionId = this.sim.missionId;
    if (file.size > CLOUD_SNAPSHOT_MAX_BYTES) throw Error('快照文件超过 96 MiB');
    const x = JSON.parse(await file.text());
    if (cloudOnly && x.meta?.kind !== 'cloud') throw Error('请选择全球云图快照');
    if (
      x.format !== 'tiangong-weather-1' ||
      !['cloud', 'cloud-preview', 'aurora', 'orbit'].includes(x.meta?.kind) ||
      typeof x.base64 !== 'string'
    )
      throw Error('无效快照文件');
    const k = x.meta.kind;

    const bytes = Uint8Array.from(atob(x.base64), (c) => c.charCodeAt(0)),
      blob = new Blob([bytes], {
        type: ['cloud', 'cloud-preview'].includes(k)
          ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
            ? 'image/png'
            : 'image/jpeg'
          : 'application/json',
      });
    let time = null,
      observed = null,
      nasa = {};
    if (k === 'aurora') {
      const v = validateAurora(JSON.parse(await blob.text()));
      time = v.time;
      observed = v.observed;
    } else if (k === 'orbit') {
      const v = bindOrbit(validateOrbit(JSON.parse(await blob.text())), missionId);
      if (x.meta.missionId !== undefined && x.meta.missionId !== missionId)
        throw Error('轨道属于其他任务');
      time = Date.parse(v.created) || v.rows[0][0];
    } else {
      // Imported acceptance flags are not authority: check the actual pixels again.
      nasa = { ...x.meta, ...(await this.validateManualCloud({ ...x.meta, blob })) };
    }
    const record = await this.store(k, blob, {
      ...(k === 'orbit' ? { missionId } : {}),
      time,
      observed,
      source: '导入快照',
      favorite: true,
      ...(k === 'cloud'
        ? { integrityFailed: false, channel: cloudChannel(x.meta), provider: cloudProvider(x.meta) }
        : {}),
      ...Object.fromEntries(
        Object.entries(nasa).filter(([key]) =>
          [
            'provider',
            'time',
            'observedStart',
            'observedEnd',
            'resolution',
            'nativeResolution',
            'channel',
            'coverage',
            'polarCoverage',
            'footprint',
            'release',
            'source',
            'sources',
            'sha256',
            'quality',
            'manualValidation',
            'warnings',
            'date',
            'period',
            'processing',
            'attribution',
            'publishedAt',
            'createdAt',
            'sceneEnd',
            'latitudeLimit',
            'featherDegrees',
            'pngEncoding',
            'maxOpacityError',
            'rawBytes',
            'downloadBytes',
            'forecastRun',
            'productType',
            'slot',
            'licenseURL',
          ].includes(key)
        )
      ),
      ...(['cloud', 'cloud-preview'].includes(k)
        ? { archiveKey: versionKey(nasa), archiveOnly: false }
        : {}),
    });
    try {
      // store() already persisted favorite. A second write would replace the
      // backing file just read by reload() before setSource() can decode it.
      if (k !== 'orbit')
        await this.setSource(k === 'cloud-preview' ? 'cloud' : k, 'history', record.id);
      else this.acceptOrbit(validateOrbit(JSON.parse(await blob.text())), record.id, missionId);
      await this.trim();
      this.render();
    } finally {
      this.pendingRecords.delete(record.id);
    }
  }
  async preview(image, record) {
    this.previewQueue = (this.previewQueue || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (!image.isConnected) return;
        this.thumbnails ??= new Map();
        let blob = this.thumbnails.get(record.id);
        if (!blob) {
          const bitmap = await createImageBitmap(record.blob, {
            resizeWidth: 512,
            resizeHeight: 256,
            resizeQuality: 'high',
          });
          try {
            const canvas = new OffscreenCanvas(512, 256),
              ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            if (cloudChannel(record) === 'alpha') {
              const im = ctx.getImageData(0, 0, 512, 256);
              for (let i = 0; i < im.data.length; i += 4) {
                im.data[i] = im.data[i + 1] = im.data[i + 2] = im.data[i + 3];
                im.data[i + 3] = 255;
              }
              ctx.putImageData(im, 0, 0);
            }
            blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
          } finally {
            bitmap.close();
          }
          this.thumbnails.set(record.id, blob);
          if (this.thumbnails.size > 12)
            this.thumbnails.delete(this.thumbnails.keys().next().value);
        }
        if (!image.isConnected) return;
        const url = URL.createObjectURL(blob);
        this.previewURLs.add(url);
        image.onload = image.onerror = () => {
          URL.revokeObjectURL(url);
          this.previewURLs.delete(url);
        };
        image.src = url;
      })
      .catch(() => {});
    return this.previewQueue;
  }
  render() {
    if (!$('weatherHistory')) return;
    const historyContext = this.sim.missionId + '|' + this.active.orbit;
    if (historyContext !== this.historyContext) {
      this.historyContext = historyContext;
      this.historyDirty = true;
    }
    const total = this.items.reduce((n, x) => n + x.size, 0);
    $('cacheUsage').textContent =
      t('缓存 {size} MB / {limit} MB · {count} 份', {
        size: (total / 1048576).toFixed(1),
        limit: this.settings.limit,
        count: this.items.length,
      }) +
      (total > this.settings.limit * 1048576
        ? t(
            this.settings.autoClean
              ? ' · 收藏／当前使用／可靠云图备份超出预算，未自动删除'
              : ' · 已超出上限，自动清理已关闭'
          )
        : '') +
      (this.cache.persistent ? '' : t(' · 当前浏览器仅支持临时缓存'));
    $('lastDataCheck').textContent =
      t('上次检查') + ': ' + (this.settings.checked ? fmt(this.settings.checked) : t('尚未检查'));
    $('dataUpdates').replaceChildren();
    for (const k of ['cloud', 'aurora', 'orbit', 'assets', 'cache'])
      if (this.messages[k]) {
        const p = document.createElement('p');
        p.className = 'small';
        p.textContent =
          (names[k] ? t(names[k]) + ': ' : '') +
          (typeof this.messages[k] === 'object'
            ? t(this.messages[k].key, this.messages[k].params)
            : errorText(this.messages[k]));
        $('dataUpdates').append(p);
      }
    for (const id of ['clearEnvironment', 'confirmClearCache', 'importSnapshot'])
      $(id).disabled = this.busy;
    $('updateEnvironment').disabled = this.busy;
    for (const kind of ['cloud', 'aurora']) this.status(kind);
    if (this.choicesDirty) this.renderChoices();
    if (
      this.historyDirty &&
      this.resourcePanel?.active &&
      document.querySelector('[data-memory-key=downloads]').open
    )
      this.renderHistory();
    this.resourcePanel?.render();
  }
  renderChoices() {
    this.choicesDirty = false;
    for (const k of ['cloud', 'aurora']) {
      const sel = $(k + 'History');
      sel.replaceChildren(new Option(t('跟随模拟时间（±6小时）'), 'auto'));
      for (const r of this.items
        .filter((x) => x.kind === k && x.provider !== 'viirs')
        .sort((a, b) => b.downloaded - a.downloaded)) {
        const option = new Option(
          (k === 'cloud'
            ? cloudProvider(r) === 'satcorps'
              ? 'NASA · '
              : cloudProvider(r) === 'gmgsi'
                ? 'NOAA · '
                : cloudProvider(r) === 'himawari'
                  ? t('向日葵-9') + ' · '
                  : cloudProvider(r) === 'gdps'
                    ? 'GDPS · '
                    : 'Live Cloud Maps · '
            : '') +
            fmt(r.time) +
            (r.time ? '' : ' · ' + t('下载') + ' ' + fmt(r.downloaded)) +
            (k === 'cloud' && !completeNASA(r) && !manualCloudUsable(r)
              ? ' · ' + t('未通过质量检查')
              : ''),
          r.id
        );
        option.disabled = k === 'cloud' && !completeNASA(r) && !manualCloudUsable(r);
        sel.add(option);
      }
      sel.value = this.settings[k + 'History'];
      if (sel.selectedIndex < 0) {
        const missing = new Option(t('快照已删除'), this.settings[k + 'History']);
        missing.disabled = true;
        sel.add(missing);
        sel.value = this.settings[k + 'History'];
      }
      sel.disabled = this.settings[k] !== 'history';
      this.status(k);
    }
  }
  renderHistory() {
    if (!this.historyDirty) return;
    this.historyDirty = false;
    this.previewURLs ??= new Set();
    for (const url of this.previewURLs) URL.revokeObjectURL(url);
    this.previewURLs.clear();
    const list = $('weatherHistory');
    list.replaceChildren();
    for (const r of this.items
      .filter(
        (r) =>
          r.kind !== 'cloud' &&
          (!this.historyFilter || this.historyFilter === 'all' || r.kind === this.historyFilter)
      )
      .sort((a, b) => b.downloaded - a.downloaded)) {
      const card = document.createElement('div');
      card.className = 'snapshot-card';
      const text = document.createElement('p');
      text.className = 'small';
      text.textContent = `${t(names[r.kind])}${r.kind === 'orbit' ? ' · ' + t(mission(r.missionId || DEFAULT_MISSION)?.name || r.missionId) : ''} · ${fmt(r.time)}\n${t('下载')} ${fmt(r.downloaded)} · ${(r.size / 1048576).toFixed(1)} MB\n${r.source}`;
      card.append(text);
      if (r.kind === 'cloud-preview')
        text.textContent += '\n旧扫描试验，非完整全球云图，不支持加载到地球';
      if (['cloud', 'cloud-preview'].includes(r.kind)) {
        if (r.kind === 'cloud' && !completeNASA(r))
          text.textContent += '\n' + cloudUnavailableReason(r);
        const image = document.createElement('img');
        image.alt = t('云图预览');
        image.loading = 'lazy';
        image.width = 512;
        image.height = 256;
        card.append(image);
        this.preview(image, r);
      }
      const buttons = document.createElement('div');
      buttons.className = 'angle-actions';
      for (const [label, fn] of [
        ['使用此版本', () => this.useRecord(r)],
        [
          r.favorite ? '取消收藏' : '收藏',
          async () => {
            r.favorite = !r.favorite;
            await this.cache.put(r);
            await this.reload();
          },
        ],
        ['导出', () => this.exportRecord(r)],
        ['删除', () => this.remove(r.id)],
      ]) {
        const b = document.createElement('button');
        b.textContent = t(label);
        b.disabled =
          (label === '使用此版本' && r.kind === 'cloud-preview') ||
          (label === '删除' && r.favorite) ||
          (label === '使用此版本' && r.kind === 'cloud' && !completeNASA(r)) ||
          (label === '使用此版本' &&
            r.kind === 'orbit' &&
            (r.missionId || DEFAULT_MISSION) !== this.sim.missionId);
        if (label === '使用此版本' && Object.values(this.active).includes(r.id)) {
          b.textContent = t('正在使用');
          b.disabled = true;
        }
        b.onclick = () => Promise.resolve(fn()).catch((e) => this.fail('cache', e));
        buttons.append(b);
      }
      card.append(buttons);
      list.append(card);
    }
  }
  status(k) {
    const mode = this.settings[k],
      r = this.items.find((x) => x.id === this.active[k]);
    let s = t(
      mode === 'local'
        ? '本地生成'
        : mode === 'off'
          ? '已关闭'
          : mode === 'builtin'
            ? '内置静态云图'
            : r
              ? k === 'aurora'
                ? 'NOAA 极光预测'
                : r.provider === 'gdps'
                  ? '模式云量预报'
                  : '卫星合成云图'
              : '没有匹配快照，使用内置云图／关闭极光'
    );
    if (r)
      s +=
        '\n' +
        t(k === 'aurora' || r.provider === 'gdps' ? '预测有效时间' : '观测时间') +
        ': ' +
        fmt(r.time) +
        '\n' +
        t('下载') +
        ': ' +
        fmt(r.downloaded) +
        (r.time
          ? '\n' +
            t('与模拟时间相差 {hours} 小时', {
              hours: (Math.abs(this.sim.time - r.time) / 3600e3).toFixed(1),
            })
          : '');
    if (k === 'cloud' && mode === 'satcorps' && !r)
      s = t('尚无通过质量检查的 NASA 云图，当前显示内置云图');
    if (k === 'cloud' && mode === 'latest' && !r)
      s = GITHUB_CLOUD_UNAVAILABLE + '；当前显示内置云图';
    if (k === 'cloud' && r && cloudProvider(r) === 'satcorps')
      s +=
        '\nNASA · ' +
        r.resolution +
        '\n' +
        t('观测范围') +
        ': ' +
        fmt(r.observedStart) +
        ' — ' +
        fmt(r.observedEnd) +
        '\n' +
        t('有效反演像素') +
        ': ' +
        (100 * r.coverage).toFixed(2) +
        '%';
    if (k === 'cloud' && r) s = cloudTitle(r) + '\n' + s;
    $(k + 'DataStatus').textContent = s;
    return s;
  }
  get waitingForRegionalCloud() {
    return (
      !this.active.cloud &&
      this.settings.cloud === 'history' &&
      this.items.some((r) => r.id === this.settings.cloudHistory && r.provider === 'himawari')
    );
  }
  update(q) {
    const e = this.env,
      s = this.settings,
      u = e.uniforms,
      a = e.auroraUniforms,
      timestamp = q?.t ?? this.sim.time;
    u.weatherTime.value = a.weatherTime.value = (timestamp - Date.UTC(2026, 0, 1)) / 3600e3;
    u.seed.value = a.seed.value = seedNumber(s.seed);
    u.cloudMode.value = s.cloud === 'local' ? 1 : 0;
    const cloudRecord = this.items.find((x) => x.id === this.active.cloud);
    u.cloudMotion.value = e.quality === 'high' && s.motion && !fixedCloudField(cloudRecord) ? 1 : 0;
    u.motionTime.value = cloudRecord
      ? clamp((timestamp - (cloudRecord.time ?? cloudRecord.downloaded)) / 3600e3, -6, 6)
      : 6 * Math.sin(u.weatherTime.value * 0.04);
    const hideClouds = s.cloud === 'off' || this.waitingForRegionalCloud;
    if (hideClouds) u.cloudAmount.value = 0;
    e.volumeClouds.visible = e.volumeClouds.visible && !hideClouds;
    e.aurora.visible =
      s.aurora === 'local' || (['latest', 'history'].includes(s.aurora) && !!this.auroraTexture);
    a.useData.value = s.aurora === 'local' ? 0 : 1;
    a.strength.value = s.auroraStrength;
    e.aurora.quaternion.copy(e.earth.quaternion);
    const now = performance.now();
    this.frames++;
    if (now - this.fpsStart > 2500) {
      this.fps = (this.frames * 1000) / (now - this.fpsStart);
      this.frames = 0;
      this.fpsStart = now;
      if (!s.adaptive) {
        this.lowEffects = false;
        this.fastWindows = 0;
      } else if (this.fps < 24) {
        this.lowEffects = true;
        this.fastWindows = 0;
      } else if (this.fps > 38) {
        this.fastWindows = (this.fastWindows || 0) + 1;
        if (this.fastWindows >= 2) this.lowEffects = false;
      } else this.fastWindows = 0;
      const desired = e.quality === 'high' ? 32 : e.quality === 'standard' ? 16 : 8,
        steps = this.lowEffects ? Math.min(e.quality === 'high' ? 24 : 12, desired) : desired;
      e.atmosphere.material.uniforms.steps.value = steps;
      e.uniforms.cloudSteps.value = this.lowEffects ? 16 : 28;
      $('performanceStatus').textContent = t('{fps} FPS', { fps: this.fps.toFixed(0) });
    }
    if (now - this.lastUI > 1000) {
      if (s.cloud === 'satcorps' && cloudRecord && !completeNASA(cloudRecord))
        this.apply('cloud').catch((err) => this.fail('cloud', err));
      this.status('cloud');
      this.status('aurora');
      $('weatherSimTime').textContent = t('模拟时间') + ': ' + fmt(timestamp);
      this.lastUI = now;
    }
    if (now - this.lastHistory > 1500) {
      this.lastHistory = now;
      for (const k of ['cloud', 'aurora'])
        if (s[k] === 'history' && s[k + 'History'] === 'auto')
          this.apply(k).catch((err) => this.fail(k, err));
    }
  }
  presets() {
    try {
      return JSON.parse(localStorage.getItem('tiangong-environment-presets-v1')) || [];
    } catch {
      return [];
    }
  }
  renderPresets() {
    const sel = $('environmentPresets');
    sel.replaceChildren();
    for (const [i, p] of this.presets().entries()) sel.add(new Option(p.name, String(i)));
    $('loadEnvironmentPreset').disabled = $('deleteEnvironmentPreset').disabled =
      !sel.options.length;
  }
  savePreset() {
    const p = this.presets(),
      api = this.env.api,
      sim = this.sim;
    p.push({
      missionId: sim.missionId,
      pose: sim.missions.state.pose,
      rotation: sim.missions.state.rotation,
      name: ($('environmentPresetName').value.trim() || 'Earth ' + (p.length + 1)).slice(0, 60),
      time: sim.time,
      view: sim.view,
      settings: { ...presetWeatherSettings(this.settings), orbitRecord: this.sim.orbits.selected },
      environment: { ...this.env.settings },
      phenomena: { ...this.env.phenomena.settings },
      cameraUp: api.camera.up.toArray(),
      cameraFov: api.camera.fov,
      cameraZoom: api.camera.zoom,
      spaceUp: sim.spaceCamera.up.toArray(),
      spaceFov: sim.spaceCamera.fov,
      spaceZoom: sim.spaceCamera.zoom,
      camera: api.camera.position.toArray(),
      target: api.controls.target.toArray(),
      spaceCamera: sim.spaceCamera.position.toArray(),
      spaceTarget: sim.orbitControls.target.toArray(),
    });
    localStorage.setItem('tiangong-environment-presets-v1', JSON.stringify(p));
    this.renderPresets();
  }
  async loadPreset() {
    if (this.sim.sceneBusy || this.sim.missions.busy || this.busy) throw Error('正在恢复场景…');
    this.sim.sceneBusy = true;
    this.sim.missions.syncUI();
    try {
      return await this.restorePreset();
    } finally {
      this.sim.sceneBusy = false;
      this.sim.missions.syncUI();
      this.sim.sessionMemory?.save();
    }
  }
  async restorePreset() {
    const p = this.presets()[Number($('environmentPresets').value)];
    if (!p) return;
    await this.sim.missions.switchTo(p.missionId || DEFAULT_MISSION, { fromScene: true });
    this.sim.missions.state.rotation = validateRotation(p.rotation, p.time, {
      enabled: !!mission(this.sim.missionId).spinRpm,
    });
    if (p.pose) {
      this.sim.missions.state.pose = validatePose(p.pose);
      this.sim.missions.applyPose();
    }
    this.env.phenomena.restore(p.phenomena);
    const record = this.items.find(
        (r) =>
          r.id === p.settings.orbitRecord &&
          r.kind === 'orbit' &&
          (r.missionId || DEFAULT_MISSION) === this.sim.missionId
      ),
      previous = this.active.orbit || null;
    if (record) {
      this.useOrbit(validateOrbit(JSON.parse(await record.blob.text())), false);
      this.active.orbit = record.id;
    } else if (!p.settings.orbitRecord || p.settings.orbitRecord === 'none') {
      this.useOrbit(p.settings.orbitRecord === 'none' ? null : this.sim.bundledOrbit, false);
      this.active.orbit = null;
    } else this.env.api.toast('收藏的轨道缓存已删除，已保留当前轨道。');
    Object.assign(this.settings, presetWeatherSettings(p.settings));
    this.normalizeCloudSelection(p.time);
    this.settings.orbitRecord = record
      ? record.id
      : p.settings.orbitRecord === 'none'
        ? 'none'
        : p.settings.orbitRecord
          ? previous
          : null;
    this.sync();
    this.save();
    for (const key of [
      'quality',
      'exposure',
      'cloudOpacity',
      'starBrightness',
      'stars',
      'milky',
      'moon',
      'clouds',
      'groundTrack',
    ])
      if (Object.hasOwn(p.environment, key)) this.env.settings[key] = p.environment[key];
    this.env.settings.cloudNightVisible = p.environment.cloudNightVisible === true;
    Object.assign(
      this.env.settings,
      normalizeStarChartSettings(p.environment),
      normalizeGeographySettings(p.environment)
    );
    this.env.save();
    await this.env.setQuality(p.environment.quality);
    await this.env.setSkyStyle();
    for (const [id, k] of [
      ['showMoon', 'moon'],
      ['showStars', 'stars'],
      ['showClouds', 'clouds'],
      ['cloudNightVisible', 'cloudNightVisible'],
      ['showMilky', 'milky'],
      ['groundTrack', 'groundTrack'],
    ])
      $(id).checked = this.env.settings[k];
    syncStarChartControls(this.env.settings);
    syncGeographyControls(this.env.settings);
    $('skyExposure').value = this.env.settings.exposure;
    $('cloudOpacity').value = this.env.settings.cloudOpacity;
    $('starBrightness').value = this.env.settings.starBrightness;
    this.sim.seek(p.time);
    this.sim.setView(p.view);
    this.env.api.controls.stopMotion();
    this.env.api.camera.up.fromArray(p.cameraUp || [0, 0, 1]).normalize();
    this.env.api.camera.fov = p.cameraFov || 38;
    this.env.api.camera.zoom = p.cameraZoom || 1;
    this.env.api.camera.updateProjectionMatrix();
    this.env.api.camera.position.fromArray(p.camera);
    this.env.api.controls.target.fromArray(p.target);
    this.env.api.controls.update();
    this.sim.orbitControls.stopMotion();
    this.sim.spaceCamera.up.fromArray(p.spaceUp || [0, 0, 1]).normalize();
    this.sim.spaceCamera.fov = p.spaceFov || 38;
    this.sim.spaceCamera.zoom = p.spaceZoom || 1;
    this.sim.spaceCamera.updateProjectionMatrix();
    this.sim.spaceCamera.position.fromArray(p.spaceCamera);
    this.sim.orbitControls.target.fromArray(p.spaceTarget);
    this.sim.orbitControls.update();
    await Promise.allSettled(['cloud', 'aurora'].map((k) => this.apply(k)));
  }
  capture() {
    const { renderer, camera } = this.env.api,
      size = renderer.getSize(new THREE.Vector2()),
      ratio = renderer.getPixelRatio(),
      aspect = camera.aspect;
    try {
      const max = renderer.capabilities.maxTextureSize,
        w = Math.min(3840, max, Math.floor(max * aspect)),
        h = Math.round(w / aspect);
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      this.sim.render();
      saveSkyCultureScreenshot(
        renderer.domElement,
        this.env,
        'StarOrbit-Earth-' + new Date(this.sim.time).toISOString().replaceAll(':', '-') + '.png',
        () => this.sim.api.toast(t('照片未能保存'))
      );
    } finally {
      renderer.setPixelRatio(ratio);
      renderer.setSize(size.x, size.y, false);
    }
  }
}
