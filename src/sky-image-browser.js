import { t } from './i18n.js';
import { equatorial } from './environment-math.js';
import { cameraAxes, lookDirection } from './xuntian-pointing.js';
import { frameSkyArtwork, pointMainCameraAtSky } from './sky-camera-pointing.js';
import { applySkyDetailSource } from './sky-detail-controls.js';
import { mountSkyImageGallery } from './sky-image-gallery.js';
import { openSkyOfflineDownload } from './sky-offline-controls.js';
import { WEBB_ARTWORKS } from './webb-gallery.js';

const $ = (id) => document.getElementById(id);

export function mountSkyImageBrowser(env) {
  const { sim, skyDetail } = env;
  const providerFor = (entry) => skyDetail.providers.find((p) => p.id === entry.providerId);
  const canLocate = (entry, context) =>
    Number.isFinite(entry.raDeg) &&
    Number.isFinite(entry.decDeg) &&
    (entry.kind !== 'work' || !!providerFor(entry)) &&
    (context === 'ground' ? sim.worldExplorer?.canAimStarImage(entry) : !!sim.current) &&
    !sim.freeFlight?.active &&
    !sim.sceneBusy &&
    !sim.missions?.busy &&
    (context !== 'xuntian' || sim.missionId === 'tiangong');

  function locate(entry, context, savedView) {
    if (!canLocate(entry, context)) return false;
    const direction = equatorial(entry.raDeg, entry.decDeg);
    const provider = providerFor(entry);
    if (context === 'ground') {
      const field = entry.work && frameSkyArtwork(provider, direction, 1, entry.fov, true);
      return sim.worldExplorer.aimStarImage(entry, field?.fovY);
    }
    const framing =
      savedView ||
      (entry.work &&
        frameSkyArtwork(
          provider,
          direction,
          context === 'xuntian' ? 1.6 : sim.api.camera.aspect,
          entry.fov
        ));
    if (context === 'xuntian') {
      const target = {
        id: entry.id,
        type: 'deep-sky',
        direction,
        fov: framing?.fovY ?? entry.fov,
        name: entry.title,
      };
      if (!sim.xuntian?.observeTarget(target, { savedView: framing })) return false;
    } else {
      if (sim.xuntian?.active) sim.xuntian.close();
      pointMainCameraAtSky(sim, direction, framing);
    }
    if (context === 'xuntian') {
      env.skyDetailControls.setFinderSelection(entry.source, {
        artworkId: entry.providerId,
        savedPyramidOrder: entry.savedPyramidOrder,
      });
      sim.dirty = true;
      return true;
    }
    if (entry.source === 'recent' || entry.source === 'hubble')
      skyDetail.setArtwork(entry.providerId, entry.savedPyramidOrder);
    env.settings.stars = true;
    env.settings.milky = true;
    for (const id of ['showStars', 'showMilky']) $(id).checked = true;
    applySkyDetailSource(env, entry.source);
    env.setSkyStyle();
    sim.dirty = true;
    return true;
  }

  function saveEntry(entry, context, thumbnailBlob) {
    const direction = equatorial(entry.raDeg, entry.decDeg);
    const view = entry.work
      ? { ...frameSkyArtwork(providerFor(entry), direction, 1.6, entry.fov), pixelHeight: 1024 }
      : {
          ...cameraAxes(lookDirection(direction)),
          fovY: entry.fov,
          aspect: 1.6,
          pixelHeight: 1024,
        };
    const info = {
      id: entry.id,
      targetId: entry.id,
      title: entry.title,
      view,
      thumbnailKey: 'thumbnail:' + entry.source + ':' + entry.id,
      thumbnailBlob,
      thumbnailUrl: entry.work?.thumbnailUrl,
    };
    const plan =
      entry.kind === 'work'
        ? skyDetail.offline.planArtwork({ ...info, provider: providerFor(entry) })
        : skyDetail.offline.planField({ ...info, source: entry.source });
    if (!plan) return t('当前天区没有可下载的影像');
    openSkyOfflineDownload(env, plan, { opener: document.activeElement });
  }

  // 哈勃作品随档案按需加载：首次打开图集前加载，完成后并入作品列表。
  let works = WEBB_ARTWORKS;
  function loadHubble() {
    return skyDetail.loadHubble().then((archive) => {
      if (archive && works === WEBB_ARTWORKS) works = [...WEBB_ARTWORKS, ...archive.artworks];
      return archive;
    });
  }
  const browser = mountSkyImageGallery({
    providers: () => skyDetail.providers,
    works: () => works,
    onLocate: locate,
    canLocate,
    onSave: saveEntry,
    canSave: (entry) =>
      Number.isFinite(entry.raDeg) &&
      Number.isFinite(entry.decDeg) &&
      (entry.kind !== 'work' || !!providerFor(entry)?.plate),
    getSavedPreview: (entry) => skyDetail.offline.get('thumbnail:' + entry.source + ':' + entry.id),
  });
  // 打开图集前等待哈勃档案；加载失败时仍打开其余影像，下次打开再重试。
  const openGallery = browser.open;
  browser.open = (options = {}) => {
    const opener = options.opener || document.activeElement;
    return loadHubble().then(() => openGallery({ ...options, opener }));
  };
  for (const [id, context] of [
    ['xtSkyImageBrowse', 'xuntian'],
    ['skyImageBrowse', 'main'],
    ['skyChartBrowse', 'main'],
  ]) {
    $(id).onclick = () => {
      const chosen =
        context === 'xuntian'
          ? env.skyDetailControls.finderSelection().source
          : env.settings.skyDetailSource;
      browser.open({
        context,
        source: ['recent', 'hubble'].includes(chosen) ? chosen : undefined,
      });
    };
  }
  $('xtSaveSkyField').onclick = (event) => {
    const id = sim.xuntian?.skyViewId;
    const plan = id && skyDetail.offline.planCurrent(id);
    if (plan) openSkyOfflineDownload(env, plan, { opener: event.currentTarget });
    else $('xtSkyDetailStatus').textContent = t('当前天区没有可下载的影像');
  };
  // 哈勃离线影像需要档案中的影像源（用于原生分辨率与层级判断），先加载档案再定位。
  env.openOfflineSkyField = (record) =>
    record.source === 'hubble' && !skyDetail.hubbleArchive
      ? loadHubble().then(() => openOfflineField(record))
      : openOfflineField(record);
  function openOfflineField(record) {
    const view = record.view;
    if (!view?.forward) return false;
    const [x, y, z] = view.forward;
    const source = record.source === 'webb' ? 'recent' : record.source;
    return locate(
      {
        id: record.targetId || record.id,
        title: record.title,
        providerId: record.providerId,
        savedPyramidOrder:
          providerFor(record)?.nativeImage && !record.nativeImage ? record.order : undefined,
        source,
        raDeg: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
        decDeg: (Math.asin(Math.min(1, Math.max(-1, z))) * 180) / Math.PI,
        fov: view.fovY,
      },
      sim.missionId === 'tiangong' ? 'xuntian' : 'main',
      view
    );
  }
  return browser;
}
