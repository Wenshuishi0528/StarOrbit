import { t } from './i18n.js';
import { equatorial } from './environment-math.js';
import { cameraAxes, lookDirection } from './xuntian-pointing.js';
import { pointMainCameraAtSky } from './sky-camera-pointing.js';
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
    !!sim.current &&
    !sim.freeFlight?.active &&
    !sim.sceneBusy &&
    !sim.missions?.busy &&
    (context !== 'xuntian' || sim.missionId === 'tiangong');

  function locate(entry, context, savedView) {
    if (!canLocate(entry, context)) return false;
    const direction = equatorial(entry.raDeg, entry.decDeg);
    if (context === 'xuntian') {
      const target = {
        id: entry.id,
        type: 'deep-sky',
        direction,
        fov: entry.fov,
        name: entry.title,
      };
      if (!sim.xuntian?.observeTarget(target, { savedView })) return false;
    } else {
      pointMainCameraAtSky(sim, direction);
    }
    if (entry.source === 'recent') skyDetail.setArtwork(entry.providerId);
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
    const view = {
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

  const browser = mountSkyImageGallery({
    providers: skyDetail.providers,
    works: WEBB_ARTWORKS,
    onLocate: locate,
    canLocate,
    onSave: saveEntry,
    canSave: (entry) =>
      Number.isFinite(entry.raDeg) &&
      Number.isFinite(entry.decDeg) &&
      (entry.kind !== 'work' || !!providerFor(entry)?.plate),
    getSavedPreview: (entry) => skyDetail.offline.get('thumbnail:' + entry.source + ':' + entry.id),
  });
  for (const [id, context] of [
    ['xtSkyImageBrowse', 'xuntian'],
    ['skyImageBrowse', 'main'],
    ['skyChartBrowse', 'main'],
  ]) {
    $(id).onclick = () =>
      browser.open({
        context,
        source: env.settings.skyDetailSource === 'recent' ? 'recent' : undefined,
      });
  }
  $('xtSaveSkyField').onclick = (event) => {
    const id = sim.xuntian?.skyViewId;
    const plan = id && skyDetail.offline.planCurrent(id);
    if (plan) openSkyOfflineDownload(env, plan, { opener: event.currentTarget });
    else $('xtSkyDetailStatus').textContent = t('当前天区没有可下载的影像');
  };
  env.openOfflineSkyField = (record) => {
    const view = record.view;
    if (!view?.forward) return false;
    const [x, y, z] = view.forward;
    const source = record.source === 'webb' ? 'recent' : record.source;
    return locate(
      {
        id: record.targetId || record.id,
        title: record.title,
        providerId: record.providerId,
        source,
        raDeg: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
        decDeg: (Math.asin(Math.min(1, Math.max(-1, z))) * 180) / Math.PI,
        fov: view.fovY,
      },
      sim.missionId === 'tiangong' ? 'xuntian' : 'main',
      view
    );
  };
  return browser;
}
