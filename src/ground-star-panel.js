import { bindSkyReading } from './sky-reading-view.js';
import { nudgeGroundScope } from './ground-camera-pointing.js';
import { mountAimMarker, drawAimMarker } from './aim-marker.js';
import { projectRay, rayInView, skyAngles } from './sky-location-math.js';
import { skyText } from './sky-tool-language.js';
import { t, getLanguage } from './i18n.js';
import { equatorial } from './environment-math.js';
import { galleryCoordinates } from './sky-image-index.js';
import { skyDetailText, skyDetailCredits } from './sky-detail-controls.js';
import { openSkyOfflineDownload } from './sky-offline-controls.js';
import { normalizeWebbBackground } from './sky-detail-plan.js';
import { SURVEY_FIELDS } from './survey-lab-math.js';
import { identifyCelestialCrosshair } from './celestial-crosshair.js';
import { xuntianCatalogComplete } from './xuntian-catalog.js';
import { crosshairDistanceText } from './xuntian-distance.js';
import { wrapRoll } from './xuntian-ground-target.js';
import { scopeWheelLogDelta } from './xuntian-input.js';
import {
  createGroundStargazing,
  GROUND_TELESCOPE,
  nextGroundAstronomicalDusk,
} from './ground-stargazing.js';
import {
  GROUND_FIELD_MIN,
  GROUND_FIELD_MAX,
  GROUND_SCOPE_DETAIL,
  groundPresetField,
  groundFieldAtZoom,
  groundZoomAtField,
  groundScopeOptics,
} from './ground-scope-optics.js';
import { createGroundStarInstrument } from './ground-star-instrument.js';
import { groundScopeBodyLabels, paintGroundScopeBodyLabels } from './ground-scope-labels.js';
import { satelliteFacetLabel } from './satellite-catalog.js';
import {
  createGroundSatelliteOverlay,
  paintGroundSatellites,
  GROUND_SATELLITE_LEVELS,
  DEFAULT_SATELLITE_ELEVATION,
} from './ground-star-satellites.js';

export const starPanelMarkup = `
<div class="ground-mode-pair" role="group" aria-label="地表观测方式">
  <button data-ground-walk aria-pressed="true">地表漫游</button><button data-ground-stars aria-pressed="false">星星观察</button>
</div>
<button type="button" data-ground-deploy>在此架设望远镜</button>
<section data-star-panel hidden>
  <div class="ground-star-site"><button data-star-site-toggle aria-expanded="false">观测地点</button><span data-star-site></span></div>
  <label for="groundStarSearch">观测目标</label>
  <input id="groundStarSearch" type="search" autocomplete="off" placeholder="搜索月球、织女星、M31…">
  <div data-star-results class="star-results"></div>
  <div class="star-current"><strong data-star-name></strong><span data-star-target-alt></span></div>
  <div data-star-reading></div>
  <div class="star-action-row"><button data-star-aim>对准目标</button><button data-star-track aria-pressed="false">跟踪目标</button><button data-star-recommend>推荐星野</button></div>
  <label for="groundStarLens">目镜</label>
  <select id="groundStarLens"><option value="finder">广角寻星 · 60°</option><option value="25">25 mm · 24×</option><option value="10">10 mm · 60×</option><option value="6">6 mm · 100×</option><option value="custom" hidden>连续视场</option><option data-star-frame value="frame" hidden>影像画幅</option></select>
  <label for="groundStarFov">视场</label><div class="star-angle"><input id="groundStarFov" type="range" min="0" max="1000" step="any"><output for="groundStarFov" data-star-fov-output></output></div>
  <label for="groundStarSource">参考图源</label>
  <div class="ground-star-pair"><select id="groundStarSource" data-star-source><option value="natural">仅星表与银河</option><option value="auto">自动</option><option value="dss">DSS 光学</option><option value="panstarrs">Pan-STARRS</option><option value="recent">韦伯红外（JWST）</option><option value="hubble">哈勃望远镜</option></select><button data-star-gallery>浏览星空影像与资料</button></div>
  <div data-star-background-row hidden><label for="groundStarBackground">底图</label><select id="groundStarBackground" data-star-background><option value="galaxy">原银河背景</option><option value="dss">DSS 光学</option><option value="panstarrs">Pan-STARRS</option><option value="blank">空白</option></select></div>
  <details class="star-options" data-star-imagery><summary>影像来源与波段</summary>
    <p data-star-source-status></p><p data-star-credit></p><div data-star-source-links></div>
    <button type="button" data-star-download>下载当前天区</button><p data-star-download-notice role="status"></p>
  </details>
  <details class="star-options"><summary>卫星标注</summary>
    <label class="check"><input data-star-satellites type="checkbox"> 显示卫星</label>
    <label for="groundStarScope">标注范围</label><select id="groundStarScope"><option value="all">全部卫星</option><option value="regular">常规卫星</option><option value="internet">低轨互联网星座</option></select>
    <label for="groundStarLabels">标注密度</label><select id="groundStarLabels"><option value="compact">精简</option><option value="standard">标准</option><option value="detailed">详细</option></select>
    <p data-star-density-hint></p>
    <label for="groundStarMinAlt">最低仰角</label><div class="star-angle"><input id="groundStarMinAlt" type="range" min="0" max="85" step="1"><output data-star-min-output></output></div>
    <details data-star-filters><summary><span>按目录筛选</span> <small data-star-filter-count hidden></small></summary>
      <label for="groundStarObjectType">目标类型</label><select id="groundStarObjectType" data-star-filter="objectType"><option value="">全部</option></select>
      <label for="groundStarPurpose">用途</label><select id="groundStarPurpose" data-star-filter="purpose"><option value="">全部</option></select>
      <label for="groundStarOwner">运营国家或组织</label><select id="groundStarOwner" data-star-filter="owner"><option value="">全部</option></select>
      <label for="groundStarDecade">发射年代</label><select id="groundStarDecade" data-star-filter="decade"><option value="">全部</option></select>
      <button type="button" data-star-clear-filters>清除筛选</button>
    </details>
    <p data-star-sat-status></p><details data-star-listed hidden><summary>视野内的卫星</summary><ul data-star-list></ul></details>
  </details>
  <details data-star-mount class="star-options"><summary>望远镜与指向</summary>
    <canvas data-star-model tabindex="0" aria-label="随指向转动的地面望远镜"></canvas>
    <p data-star-optics></p>
    <label for="groundStarAperture">有效口径</label><div class="star-angle"><input id="groundStarAperture" type="range" min="20" max="200" step="1"><output for="groundStarAperture" data-star-aperture-output></output></div>
    <label for="groundStarEV">曝光补偿</label><div class="star-angle"><input id="groundStarEV" type="range" min="-4" max="4" step=".1"><output for="groundStarEV" data-star-ev-output></output></div>
    <label for="groundStarRoll">画幅旋转</label><div class="star-angle"><input id="groundStarRoll" type="range" min="-180" max="180" step=".1"><output for="groundStarRoll" data-star-roll-output></output><button type="button" data-star-roll-reset>归零</button></div>
    <label for="groundStarMagnitude">恒星显示极限</label><select id="groundStarMagnitude" aria-describedby="groundStarMagNote"><option value="auto">自动</option><option value="3">3 mag</option><option value="5">5 mag</option><option value="6.5">6.5 mag</option><option value="8">8 mag</option></select>
    <p id="groundStarMagNote"><span>星等越小，星越亮。</span> <span data-star-mag-reference hidden>筛选作用于参考影像上叠加的星表点。</span></p>
    <div class="pair"><div><label for="groundStarAz">方位角 °</label><input id="groundStarAz" type="number" min="0" max="360" step="any"></div><div><label for="groundStarAlt">仰角 °</label><input id="groundStarAlt" type="number" min="0" max="90" step="any"></div></div>
    <div class="star-action-row"><button data-star-manual>转到此方向</button><button data-star-aim-main>对准主画面中心</button></div>
    <p class="star-crosshair"><span>十字线所指</span><strong data-star-crosshair></strong><small data-star-crosshair-detail></small></p>
  </details>
  <div data-ground-marker-settings></div>
  <details class="star-options"><summary>目镜拍照</summary>
    <label for="groundStarPhotoWidth">照片宽度</label><select id="groundStarPhotoWidth" data-star-photo-width><option value="0">当前画面尺寸</option><option value="1280">1280 px</option><option value="1920">1920 px</option><option value="3840">3840 px</option></select>
    <label class="check"><input type="checkbox" data-star-photo-annotations> 包含标注</label><button type="button" data-star-photo>拍照</button>
  </details>
  <button data-star-night hidden>前往天文暮光结束时</button>
  <p data-star-notice role="status"></p>
</section>`;

const bound = (x, min, max) => Math.max(min, Math.min(max, x));
const opticalSteps = ['finder', ...GROUND_TELESCOPE.eyepiecesMm.map(String)];
const sources = ['natural', 'auto', 'dss', 'panstarrs', 'recent', 'hubble'];
const levels = Object.keys(GROUND_SATELLITE_LEVELS);
const setText = (element, value) => {
  if (element.textContent !== value) element.textContent = value;
};
const fieldNumber = (n) => Number(n.toFixed(n < 0.1 ? 3 : 2)).toString();

export function mountGroundStarPanel({
  host,
  stage,
  sim,
  state,
  saved,
  persist,
  onMode,
  onSiteToggle,
  onPhoto = () => {},
  onAimFromMain = () => {},
  onViewChange = () => {},
}) {
  const $ = (selector) => host.querySelector(selector);
  const targetArticle = bindSkyReading($('[data-star-reading]'));
  const control = createGroundStargazing();
  let aimMarker = null;
  const date = () => sim.time;
  const culture = () => sim.environment.settings.skyCulture;
  const filterBox = $('[data-star-filters]');
  const filterPickers = [...filterBox.querySelectorAll('[data-star-filter]')];
  const magnitudePicker = $('#groundStarMagnitude');
  const savedLimit = Number(saved?.starMagnitudeLimit);
  const ocular = opticalSteps.includes(saved?.ocular) ? saved.ocular : 'finder';
  const prefs = {
    ocular,
    fieldDeg: Number.isFinite(saved?.fieldDeg)
      ? bound(saved.fieldDeg, GROUND_FIELD_MIN, GROUND_FIELD_MAX)
      : groundPresetField(ocular),
    apertureMm: Number.isFinite(saved?.apertureMm) ? bound(saved.apertureMm, 20, 200) : 80,
    exposureEV: Number.isFinite(saved?.exposureEV) ? bound(saved.exposureEV, -4, 4) : 0,
    source: sources.includes(saved?.source) ? saved.source : 'natural',
    background: normalizeWebbBackground(
      saved?.background ?? sim.environment.settings.webbBackground
    ),
    artworkBySource: Object.fromEntries(
      ['recent', 'hubble']
        .filter((source) => typeof saved?.artworkBySource?.[source] === 'string')
        .map((source) => [source, saved.artworkBySource[source]])
    ),
    photoWidth: [1280, 1920, 3840].includes(saved?.photoWidth) ? saved.photoWidth : 0,
    photoAnnotations: saved?.photoAnnotations !== false,
    starMagnitudeLimit: [...magnitudePicker.options].some((o) => o.value === String(savedLimit))
      ? savedLimit
      : null,
    satellites: saved?.satellites !== false,
    satelliteScope: ['regular', 'internet', 'all'].includes(saved?.satelliteScope)
      ? saved.satelliteScope
      : 'all',
    satelliteFilters: Object.fromEntries(
      filterPickers.map((select) => {
        const field = select.dataset.starFilter,
          value = saved?.satelliteFilters?.[field];
        return [field, typeof value === 'string' || Number.isFinite(value) ? String(value) : ''];
      })
    ),
    labelLevel: levels.includes(saved?.labelLevel) ? saved.labelLevel : 'standard',
    minElevation: Number.isFinite(saved?.minElevation)
      ? bound(saved.minElevation, 0, 85)
      : DEFAULT_SATELLITE_ELEVATION,
  };
  const mask = document.createElement('canvas');
  mask.className = 'ground-eye-overlay';
  mask.setAttribute('aria-hidden', 'true');
  mask.hidden = true;
  stage.append(mask);
  const ctx = mask.getContext('2d');
  const result = $('[data-star-results]'),
    search = $('#groundStarSearch');
  const lens = $('#groundStarLens'),
    source = $('[data-star-source]'),
    background = $('[data-star-background]'),
    fovInput = $('#groundStarFov'),
    aperture = $('#groundStarAperture'),
    ev = $('#groundStarEV'),
    rotation = $('#groundStarRoll'),
    level = $('#groundStarLabels');
  const satelliteCheck = $('[data-star-satellites]'),
    minAlt = $('#groundStarMinAlt');
  const scopePicker = $('#groundStarScope');
  scopePicker.value = prefs.satelliteScope;
  const modelDetails = $('[data-star-mount]'),
    queryBox = $('[data-star-notice]'),
    azimuthInput = $('#groundStarAz'),
    elevationInput = $('#groundStarAlt');
  let aimDraft = false;
  azimuthInput.oninput = elevationInput.oninput = () => {
    aimDraft = true;
  };
  let active = false,
    reading = null,
    satelliteLayer = null,
    model = null;
  let lastRefresh = -Infinity,
    searchStamp = null,
    lastHud = '';
  let resultKey = '',
    siteOpen = false,
    showAllResults = false;
  let listKey = '',
    lastFrame = null,
    centerInfo = null,
    recommendedId = '';
  let effectiveMagnitudeLimit = null;
  let displayedFacets = null,
    facetLanguage = '',
    sourceLinkKey = '';
  source.value = prefs.source;
  background.value = prefs.background;
  state.rollDegrees = wrapRoll(state.rollDegrees);
  aperture.value = prefs.apertureMm;
  ev.value = prefs.exposureEV;
  $('[data-star-photo-width]').value = String(prefs.photoWidth);
  $('[data-star-photo-annotations]').checked = prefs.photoAnnotations;
  magnitudePicker.value =
    prefs.starMagnitudeLimit === null ? 'auto' : String(prefs.starMagnitudeLimit);
  syncLens();
  syncOpticsControls();
  syncSourceControls();
  level.value = prefs.labelLevel;
  satelliteCheck.checked = prefs.satellites;
  minAlt.value = prefs.minElevation;
  $('[data-ground-walk]').onclick = () => onMode(false);
  $('[data-ground-deploy]').onclick = () => onMode(true, 'dock');
  $('[data-ground-stars]').onclick = () => onMode(true, 'expanded');
  $('[data-star-site-toggle]').onclick = () => {
    siteOpen = !siteOpen;
    $('[data-star-site-toggle]').setAttribute('aria-expanded', String(siteOpen));
    onSiteToggle(siteOpen);
  };
  const targetName = (target) => (target?.type === 'sky-field' ? t(target.name) : target?.name);
  function targetMagnitude(row, compact = false) {
    const value = row?.magnitude ?? row?.target?.magnitude;
    if (!Number.isFinite(value)) return '';
    const magnitude = value.toLocaleString(getLanguage(), { maximumFractionDigits: 2 });
    if (compact)
      return t('{value} 等', { value: (row.target.type === 'solar' ? '≈' : '') + magnitude });
    return t(row.target.type === 'solar' ? '视星等约 {value}' : '视星等 {value}', {
      value: magnitude,
    });
  }
  function refreshResults(force = false) {
    if (!active) return;
    const site = state.site,
      q = search.value.trim();
    // Recommendations and altitudes change with the observer and simulation clock.
    const stamp = [
      Math.floor(date() / 10000),
      site.latitude.toFixed(4),
      site.longitude.toFixed(4),
      q,
      getLanguage(),
      culture(),
      showAllResults,
      // Chinese names join the search index when the catalogue first loads.
      xuntianCatalogComplete(),
    ].join('|');
    if (!force && stamp === searchStamp) return;
    searchStamp = stamp;
    const rows = control
      .search(q, site, date(), getLanguage(), culture())
      .slice(0, q || showAllResults ? 7 : 3);
    const key =
      JSON.stringify(
        rows.map((row) => [
          row.target.id,
          row.target.name,
          Math.round(row.elevation),
          row.aboveHorizon,
          targetMagnitude(row),
        ])
      ) + getLanguage();
    if (key === resultKey) return;
    resultKey = key;
    result.replaceChildren(
      ...rows.map((row) => {
        const { target, elevation, aboveHorizon } = row;
        const button = document.createElement('button'),
          name = document.createElement('span'),
          altitude = document.createElement('small');
        name.textContent = target.name;
        altitude.textContent = [
          targetMagnitude(row, true),
          (aboveHorizon ? '' : t('地平线下') + ' · ') + Math.round(elevation) + '°',
        ]
          .filter(Boolean)
          .join(' · ');
        button.append(name, altitude);
        button.onclick = () => {
          control.select(target);
          control.aim(state.site, date(), state, true);
          setText(queryBox, '');
          refreshReading();
          onViewChange();
          persist();
        };
        return button;
      })
    );
    if (!rows.length) result.textContent = t('没有找到匹配的目标');
  }
  search.oninput = () => refreshResults(true);
  search.onfocus = () => {
    showAllResults = true;
    refreshResults(true);
  };
  let persistTimer = null;
  function saveAfterGesture() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist();
    }, 180);
  }
  function field() {
    return prefs.fieldDeg;
  }
  function lensCaption() {
    if (lens.value === 'finder') return t('广角寻星');
    if (lens.value === 'frame') return t('影像画幅');
    return lens.value === 'custom'
      ? t('连续视场')
      : GROUND_TELESCOPE.tubeMm / Number(lens.value) + '×';
  }
  function syncLens(frame = false) {
    const preset = opticalSteps.find((step) => Math.abs(groundPresetField(step) - field()) < 1e-10);
    lens.value = frame ? 'frame' : preset || 'custom';
    lens.querySelector('[value="custom"]').hidden = lens.value !== 'custom';
    $('[data-star-frame]').hidden = !frame;
    fovInput.value = String(1000 * groundZoomAtField(field()));
    const angle = fieldNumber(field()) + '°';
    fovInput.setAttribute('aria-valuetext', angle);
    setText($('[data-star-fov-output]'), angle);
  }
  function setField(value, frame = false) {
    if (!Number.isFinite(value) || value <= 0) return field();
    prefs.fieldDeg = bound(value, GROUND_FIELD_MIN, GROUND_FIELD_MAX);
    syncLens(frame);
    if (opticalSteps.includes(lens.value)) prefs.ocular = lens.value;
    onViewChange();
    saveAfterGesture();
    return field();
  }
  function zoom(deltaLog) {
    if (!Number.isFinite(deltaLog)) return field();
    return setField(bound(field() * Math.exp(-deltaLog), GROUND_FIELD_MIN, GROUND_FIELD_MAX));
  }
  function syncOpticsControls() {
    for (const [input, output, value] of [
      [aperture, '[data-star-aperture-output]', prefs.apertureMm + ' mm'],
      [
        ev,
        '[data-star-ev-output]',
        (prefs.exposureEV > 0 ? '+' : '') + fieldNumber(prefs.exposureEV) + ' EV',
      ],
      [rotation, '[data-star-roll-output]', fieldNumber(state.rollDegrees) + '°'],
    ]) {
      setText($(output), value);
      input.setAttribute('aria-valuetext', value);
    }
    rotation.value = String(state.rollDegrees);
  }
  function setRoll(degrees) {
    state.rollDegrees = wrapRoll(degrees);
    syncOpticsControls();
    onViewChange();
    saveAfterGesture();
  }
  function nudge(rightDegrees, upDegrees) {
    if (![rightDegrees, upDegrees].every(Number.isFinite) || (!rightDegrees && !upDegrees)) return;
    const next = nudgeGroundScope(state, rightDegrees, upDegrees, field());
    control.manual(state, next.azimuth, next.elevation);
    state.rollDegrees = next.rollDegrees;
    onViewChange();
    saveAfterGesture();
  }
  lens.onchange = () => {
    const desired = groundPresetField(lens.value);
    if (desired) setField(desired);
  };
  fovInput.oninput = () => setField(groundFieldAtZoom(Number(fovInput.value) / 1000));
  function applyOptics() {
    prefs.apertureMm = aperture.valueAsNumber;
    prefs.exposureEV = ev.valueAsNumber;
    syncOpticsControls();
    onViewChange();
    saveAfterGesture();
  }
  aperture.oninput = ev.oninput = applyOptics;
  rotation.oninput = () => setRoll(rotation.valueAsNumber);
  $('[data-star-roll-reset]').onclick = () => setRoll(0);
  magnitudePicker.onchange = () => {
    prefs.starMagnitudeLimit =
      magnitudePicker.value === 'auto' ? null : Number(magnitudePicker.value);
    effectiveMagnitudeLimit = null;
    refreshReading();
    onViewChange();
    persist();
  };
  function syncSourceControls() {
    $('[data-star-background-row]').hidden = !['recent', 'hubble'].includes(prefs.source);
    $('[data-star-mag-reference]').hidden = prefs.source === 'natural';
    $('[data-star-download]').disabled = prefs.source === 'natural';
  }
  function updateSourceInfo() {
    const details = $('[data-star-imagery]');
    if (!details.open) return;
    const live = sim.environment.skyDetail.status(GROUND_SCOPE_DETAIL);
    const selected = prefs.source === 'natural' ? 'galaxy' : prefs.source;
    const status = live?.source === selected ? live : { source: selected, enabled: true };
    setText($('[data-star-source-status]'), skyDetailText(status));
    setText($('[data-star-credit]'), skyDetailCredits(status));
    const links = new Map(
      (status.sources || [])
        .filter((provider) => /^https?:\/\//i.test(provider.sourceUrl))
        .map((provider) => [provider.sourceUrl, t(provider.title || provider.id)])
    );
    const key = JSON.stringify([...links]);
    if (key !== sourceLinkKey) {
      sourceLinkKey = key;
      $('[data-star-source-links]').replaceChildren(
        ...Array.from(links, ([url, title]) => {
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = title;
          return link;
        })
      );
    }
  }
  $('[data-star-imagery]').ontoggle = updateSourceInfo;
  source.onchange = () => {
    prefs.source = source.value;
    syncSourceControls();
    setText(queryBox, '');
    setText($('[data-star-download-notice]'), '');
    onViewChange();
    updateSourceInfo();
    persist();
  };
  background.onchange = () => {
    prefs.background = normalizeWebbBackground(background.value);
    onViewChange();
    persist();
  };
  $('[data-star-download]').onclick = (event) => {
    const env = sim.environment;
    const entry = env.skyDetail.views.get(GROUND_SCOPE_DETAIL);
    const choice = entry?.view.detailSelection;
    // Before the new view's first render an old field may still own tiles.
    const plan =
      choice?.source === prefs.source &&
      choice.background === prefs.background &&
      (!['recent', 'hubble'].includes(prefs.source) ||
        (choice.artworkId || null) === (prefs.artworkBySource[prefs.source] || null)) &&
      env.skyDetail.offline.planCurrent(GROUND_SCOPE_DETAIL, prefs.source);
    setText($('[data-star-download-notice]'), plan ? '' : t('当前天区没有可下载的影像'));
    if (plan) openSkyOfflineDownload(env, plan, { opener: event.currentTarget });
  };
  $('[data-star-photo-width]').onchange = (e) => {
    prefs.photoWidth = Number(e.target.value);
    persist();
  };
  $('[data-star-photo-annotations]').onchange = (e) => {
    prefs.photoAnnotations = e.target.checked;
    persist();
  };
  $('[data-star-photo]').onclick = () => onPhoto();
  $('[data-star-aim-main]').onclick = () => {
    control.release();
    onAimFromMain();
    syncMountInputs();
    refreshReading();
    onViewChange();
    persist();
  };
  function recommend() {
    if (!active) return false;
    const visible = SURVEY_FIELDS.map((field) => {
      const target = {
        id: 'ground-field:' + field.id,
        type: 'sky-field',
        name: field.name,
        direction: field.center,
      };
      return control.observe(target, state.site, date());
    })
      .filter((row) => row?.aboveHorizon)
      .sort((a, b) => b.elevation - a.elevation);
    if (!visible.length) {
      setText(queryBox, t('此时没有位于地平线上的推荐星野。'));
      return false;
    }
    const higher = visible.filter((row) => row.elevation >= 15);
    const rows = higher.length ? higher : visible;
    const index = rows.findIndex((row) => row.target.id === recommendedId);
    const target = rows[(index + 1) % rows.length].target;
    recommendedId = target.id;
    control.select(target);
    control.aim(state.site, date(), state, true);
    setField(3.5);
    setText(queryBox, '');
    refreshReading();
    return true;
  }
  $('[data-star-recommend]').onclick = recommend;
  function syncFilterOptions() {
    if (!filterBox.open || !satelliteLayer?.facets) return;
    const facets = satelliteLayer.facets,
      lang = getLanguage();
    if (facets === displayedFacets && lang === facetLanguage) return;
    displayedFacets = facets;
    facetLanguage = lang;
    const numbers = new Intl.NumberFormat(lang);
    for (const select of filterPickers) {
      const field = select.dataset.starFilter,
        selected = prefs.satelliteFilters[field];
      const options = (facets[field] || []).map(({ value, count }) => {
        const name = satelliteFacetLabel(field, value, lang, t);
        return new Option(name + ' · ' + numbers.format(count), String(value));
      });
      // A changed catalogue can temporarily have no objects in a saved
      // category. Keep the choice visible so the observer can clear it.
      if (selected && !options.some((option) => option.value === selected))
        options.push(new Option(satelliteFacetLabel(field, selected, lang, t) + ' · 0', selected));
      select.replaceChildren(new Option(t('全部'), ''), ...options);
      select.value = selected;
    }
  }
  function syncSatelliteControls() {
    const enabled = prefs.satellites;
    scopePicker.disabled = !enabled;
    level.disabled = !enabled;
    minAlt.disabled = !enabled;
    for (const select of filterPickers) select.disabled = !enabled;
    const chosen = Object.values(prefs.satelliteFilters).filter(Boolean).length;
    const count = $('[data-star-filter-count]');
    count.hidden = !chosen;
    setText(count, chosen ? t('已选 {count} 项', { count: chosen }) : '');
    $('[data-star-clear-filters]').disabled = !enabled || !chosen;
    setText($('[data-star-min-output]'), prefs.minElevation + '°');
    const { markers, labels } = GROUND_SATELLITE_LEVELS[prefs.labelLevel];
    setText(
      $('[data-star-density-hint]'),
      t('最多 {markers} 个标识、{labels} 个名称。', { markers, labels }) +
        (prefs.satelliteScope === 'all' ? ' ' + t('标注位满时优先显示常规卫星。') : '')
    );
    minAlt.setAttribute('aria-valuetext', prefs.minElevation + '°');
    syncFilterOptions();
  }
  const filterChanged = () => {
    syncSatelliteControls();
    lastRefresh = -Infinity;
    persist();
  };
  for (const select of filterPickers)
    select.onchange = () => {
      prefs.satelliteFilters[select.dataset.starFilter] = select.value;
      filterChanged();
    };
  filterBox.ontoggle = syncFilterOptions;
  $('[data-star-clear-filters]').onclick = () => {
    for (const select of filterPickers) {
      prefs.satelliteFilters[select.dataset.starFilter] = '';
      select.value = '';
    }
    // Drop any zero-count options retained for the previous selection.
    displayedFacets = null;
    filterChanged();
  };
  satelliteCheck.onchange = () => {
    prefs.satellites = satelliteCheck.checked;
    if (!prefs.satellites) {
      satelliteLayer?.dispose();
      satelliteLayer = null;
    }
    syncSatelliteControls();
    persist();
  };
  minAlt.oninput = () => {
    prefs.minElevation = Number(minAlt.value);
    syncSatelliteControls();
  };
  minAlt.onchange = persist;
  scopePicker.onchange = () => {
    prefs.satelliteScope = scopePicker.value;
    syncSatelliteControls();
    lastRefresh = -Infinity;
    persist();
  };
  level.onchange = () => {
    prefs.labelLevel = level.value;
    syncSatelliteControls();
    persist();
  };
  $('[data-star-gallery]').onclick = (e) =>
    sim.environment.skyImageBrowser.open({
      context: 'ground',
      opener: e.currentTarget,
      source: source.value === 'natural' ? undefined : source.value,
    });
  $('[data-star-aim]').onclick = () => {
    control.aim(state.site, date(), state, false);
    refreshReading();
    onViewChange();
    persist();
  };
  $('[data-star-track]').onclick = () => {
    if (control.tracking) control.release();
    else control.aim(state.site, date(), state, true);
    refreshReading();
    onViewChange();
    persist();
  };
  $('[data-star-manual]').onclick = () => {
    const az = azimuthInput.valueAsNumber,
      el = elevationInput.valueAsNumber;
    if (!(az >= 0 && az <= 360) || !control.manual(state, az, el)) {
      setText(queryBox, t('方位角取 0–360°，仰角取 0–90°。'));
      return;
    }
    aimDraft = false;
    setText(queryBox, '');
    refreshReading();
    onViewChange();
    persist();
  };
  $('[data-star-night]').onclick = () => {
    const dusk = nextGroundAstronomicalDusk(state.site, date());
    if (dusk !== null) {
      sim.seek(dusk);
      setText(queryBox, '');
      refreshResults(true);
    } else setText(queryBox, t('当地未来三天没有天文暮光结束时刻。'));
  };
  function syncMountInputs() {
    aimDraft = false;
    azimuthInput.value = state.azimuth.toFixed(2);
    elevationInput.value = state.elevation.toFixed(2);
  }
  // A details toggle is queued. Populate before opening so a delayed event
  // cannot overwrite a direction that the observer has just typed.
  modelDetails.querySelector('summary').onclick = () => {
    if (!modelDetails.open) syncMountInputs();
  };
  modelDetails.ontoggle = () => {
    if (!modelDetails.open) {
      model?.dispose();
      model = null;
    }
  };
  function refreshReading() {
    if (!active) return;
    reading = control.update(state.site, date(), state);
    if (Math.abs(rotation.valueAsNumber - state.rollDegrees) > 0.051) syncOpticsControls();
    if (
      modelDetails.open &&
      !aimDraft &&
      ![azimuthInput, elevationInput].includes(document.activeElement)
    )
      syncMountInputs();
    const target = reading.target,
      obs = reading.observation,
      tracking = reading.tracking;
    const starLimit = prefs.starMagnitudeLimit ?? effectiveMagnitudeLimit;
    const outsideMagnitudeLimit =
      target?.type === 'star' &&
      Number.isFinite(starLimit) &&
      Number.isFinite(obs?.magnitude) &&
      obs.magnitude > starLimit;
    setText($('[data-star-name]'), targetName(target) || t('自由指向'));
    targetArticle.set(target, culture());
    setText(
      $('[data-star-target-alt]'),
      obs
        ? [
            (obs.aboveHorizon ? t('仰角') : t('地平线下')) + ' ' + obs.elevation.toFixed(1) + '°',
            targetMagnitude(obs),
            outsideMagnitudeLimit ? t('暗于当前星等上限') : '',
          ]
            .filter(Boolean)
            .join(' · ')
        : ''
    );
    $('[data-star-mag-reference]').hidden = source.value === 'natural';
    $('[data-star-aim]').disabled = !obs?.aboveHorizon;
    const track = $('[data-star-track]');
    track.disabled = !obs?.aboveHorizon;
    track.setAttribute('aria-pressed', String(tracking));
    setText(track, t(tracking ? '停止跟踪' : '跟踪目标'));
    setText(
      $('[data-star-optics]'),
      t('折射式 · 有效口径 {aperture} mm · 焦距 {focal} mm', {
        aperture: prefs.apertureMm,
        focal: GROUND_TELESCOPE.tubeMm,
      }) +
        (opticalSteps.slice(1).includes(lens.value)
          ? ' · ' +
            t('出瞳') +
            ' ' +
            fieldNumber((prefs.apertureMm * Number(lens.value)) / GROUND_TELESCOPE.tubeMm) +
            ' mm'
          : '')
    );
    setText(
      $('[data-star-site]'),
      (state.site.name && t(state.site.name)) ||
        [state.site.latitude.toFixed(2) + '°', state.site.longitude.toFixed(2) + '°'].join(', ')
    );
  }
  function setActive(value) {
    if (active === value) return;
    active = value;
    $('[data-star-panel]').hidden = !value;
    $('[data-ground-deploy]').hidden = value;
    mask.hidden = !value;
    $('[data-ground-stars]').setAttribute('aria-pressed', String(value));
    $('[data-ground-walk]').setAttribute('aria-pressed', String(!value));
    siteOpen = false;
    $('[data-star-site-toggle]').setAttribute('aria-expanded', 'false');
    host.classList.toggle('ground-stargazing', value);
    if (value) {
      syncMountInputs();
      syncOpticsControls();
      control.select(null);
      search.value = '';
      showAllResults = false;
      lastRefresh = -Infinity;
      searchStamp = null;
      resultKey = '';
      listKey = '';
      lastHud = '';
      setText(queryBox, '');
      syncSatelliteControls();
      refreshResults(true);
      refreshReading();
    } else {
      control.select(null);
      modelDetails.open = false;
      model?.dispose();
      model = null;
      if (previewFrame) cancelAnimationFrame(previewFrame);
      previewFrame = 0;
      satelliteLayer?.dispose();
      satelliteLayer = null;
      reading = null;
      effectiveMagnitudeLimit = null;
      lastFrame = centerInfo = null;
      sim.environment.skyDetail.release(GROUND_SCOPE_DETAIL);
      syncLens();
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
        persist();
      }
    }
  }
  function observationTarget(entry) {
    if (!Number.isFinite(entry.raDeg) || !Number.isFinite(entry.decDeg)) return null;
    return {
      id: entry.id,
      type: 'deep-sky',
      name: entry.title,
      direction: equatorial(entry.raDeg, entry.decDeg),
    };
  }
  function canAim(entry) {
    const target = observationTarget(entry);
    return !!(active && target && control.observe(target, state.site, date())?.aboveHorizon);
  }
  function aimImage(entry, framing) {
    if (!canAim(entry)) return false;
    control.select(observationTarget(entry));
    if (!control.aim(state.site, date(), state, true)) return false;
    source.value = sources.includes(entry.source) ? entry.source : 'dss';
    prefs.source = source.value;
    if (entry.providerId && ['hubble', 'recent'].includes(source.value))
      prefs.artworkBySource[source.value] = entry.providerId;
    setField(framing || entry.fov || 1, true);
    syncSourceControls();
    setText(queryBox, '');
    refreshReading();
    persist();
    return true;
  }
  let opticalCache = null,
    finderEnhanced = false,
    previewFrame = 0;
  function opticsFor(width, height) {
    if (
      !opticalCache ||
      opticalCache.width !== width ||
      opticalCache.height !== height ||
      opticalCache.field !== field() ||
      opticalCache.aperture !== prefs.apertureMm ||
      opticalCache.ev !== prefs.exposureEV
    ) {
      opticalCache = {
        width,
        height,
        field: field(),
        aperture: prefs.apertureMm,
        ev: prefs.exposureEV,
        value: groundScopeOptics(field(), width, height, prefs.apertureMm, prefs.exposureEV),
      };
    }
    return opticalCache.value;
  }
  function updateMount() {
    if (!active || !modelDetails.open || !$('[data-star-model]').getClientRects().length) return;
    const renderer = sim.api.renderer;
    // The little instrument model uses the shared renderer. Wait until the
    // independent eyepiece has finished any offscreen render or readback.
    if (renderer.getRenderTarget()) {
      if (!previewFrame)
        previewFrame = requestAnimationFrame(() => {
          previewFrame = 0;
          if (!renderer.getRenderTarget()) updateMount();
        });
      return;
    }
    model ??= createGroundStarInstrument(renderer, $('[data-star-model]'));
    model.update(state.azimuth, state.elevation);
  }
  function avoidRects(elements, width, height) {
    let bounds;
    const rects = [];
    for (const item of elements) {
      if (!item || item.hidden) continue;
      let { x, y, w, h } = item;
      if (item.getBoundingClientRect) {
        bounds ??= mask.getBoundingClientRect();
        const r = item.getBoundingClientRect();
        x = r.left - bounds.left;
        y = r.top - bounds.top;
        w = r.width;
        h = r.height;
      }
      if (w > 0 && h > 0 && x < width && x + w > 0 && y < height && y + h > 0)
        rects.push({ x, y, w, h });
    }
    return rects;
  }
  function sampleSatellites(width, height, status, blocked, reserved) {
    if (!prefs.satellites || !status?.camera || !reading) return [];
    satelliteLayer ??= createGroundSatelliteOverlay(sim);
    return satelliteLayer.sample({
      time: date(),
      site: state.site,
      camera: status.camera,
      width,
      height,
      frame: reading.sky.frame,
      minElevation: prefs.minElevation,
      labelLevel: prefs.labelLevel,
      satelliteScope: prefs.satelliteScope,
      filters: prefs.satelliteFilters,
      reserved,
      circleRadius: opticsFor(width, height).eyeCircleDiameter / 2,
      blocked,
    });
  }
  function sampleAnnotations(width, height, status, blocked, reserved) {
    const mark = aimMarker?.settings;
    const size = mark && mark.shape !== 'hidden' ? mark.size + 6 : 0;
    const labelExclusions = size
      ? [...reserved, { x: (width - size) / 2, y: (height - size) / 2, w: size, h: size }]
      : reserved;
    const names = groundScopeBodyLabels({
      status,
      width,
      height,
      radius: opticsFor(width, height).eyeCircleDiameter / 2,
      bodies: reading?.sky.bodies || [],
      trackedBody: reading?.tracking && reading.target?.body,
      reserved: labelExclusions,
      hidden(row, x, y) {
        if (!blocked) return false;
        return blocked((2 * x) / width - 1, 1 - (2 * y) / height) !== false;
      },
    });
    const rows = sampleSatellites(width, height, status, blocked, [
      ...labelExclusions,
      ...names.map(({ rect }) => rect),
    ]);
    return { names, rows };
  }
  function drawOverlay(context, width, height, annotations) {
    const x = width / 2,
      y = height / 2,
      radius = opticsFor(width, height).eyeCircleDiameter / 2;
    context.save();
    if (radius > 0) {
      context.fillStyle = '#02060b';
      context.beginPath();
      context.rect(0, 0, width, height);
      context.arc(x, y, radius, 0, 2 * Math.PI, true);
      context.fill('evenodd');
      context.beginPath();
      context.arc(x, y, radius, 0, 2 * Math.PI);
      context.strokeStyle = '#82989eaa';
      context.lineWidth = 1;
      context.stroke();
      context.clip();
    }
    if (annotations) {
      paintGroundScopeBodyLabels(context, annotations.names);
      paintGroundSatellites(context, annotations.rows);
    }
    context.restore();
  }
  function photoOverlay({ width, height, annotations = prefs.photoAnnotations, status, blocked }) {
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(width));
    output.height = Math.max(1, Math.round(height));
    // Preserve angular label/reticle size for a larger exposure of the same frame.
    const logicalH = lastFrame?.height || output.height;
    const scale = output.height / logicalH,
      logicalW = output.width / scale;
    const c = output.getContext('2d');
    c.scale(scale, scale);
    const content = annotations
      ? sampleAnnotations(
          logicalW,
          logicalH,
          status || lastFrame?.status,
          blocked || lastFrame?.blocked,
          []
        )
      : null;
    drawOverlay(c, logicalW, logicalH, content);
    if (content && aimMarker) drawAimMarker(c, logicalW / 2, logicalH / 2, aimMarker.settings);
    return output;
  }
  function identifyCentre(
    status,
    width,
    height,
    rows,
    blocked,
    x = 0,
    y = 0,
    candidates = null,
    sample = reading
  ) {
    const view = status.view;
    const direction = view?.forward && (x || y ? rayInView(view, x, y) : view.forward);
    const angles = direction ? skyAngles(direction) : { ra: sample.raDeg, dec: sample.decDeg };
    const coordinates = 'J2000 · ' + galleryCoordinates(angles.ra, angles.dec);
    let hit, terrain;
    if (!view?.forward) hit = { kind: 'unavailable', name: '—' };
    else if (blocked && (terrain = blocked(x, y)) === null)
      hit = { kind: 'unavailable', name: '—' };
    else if (terrain) hit = { kind: 'terrain', name: t('地形') };
    else {
      const sat = rows
        .map((row) => ({
          row,
          distance: Math.hypot(row.x - ((1 + x) * width) / 2, row.y - ((1 - y) * height) / 2),
        }))
        .filter((item) => item.distance <= 5)
        .sort((a, b) => a.distance - b.distance)[0]?.row;
      if (sat) hit = { kind: 'satellite', id: sat.id, name: t(sat.name), detail: t(sat.status) };
      else {
        const terrainHides = (ray) => {
          if (!blocked || ray === direction) return false;
          const p = projectRay(view, ray);
          return !p || blocked(...p) !== false;
        };
        const showStars = finderEnhanced || status.night > 0 || (status.dss?.ready || 0) > 0;
        hit = identifyCelestialCrosshair({
          direction,
          fovY: view.fovY,
          displayHeight: height,
          bodies: [...sample.sky.bodies].sort((a, b) => a.distanceKm - b.distanceKm),
          language: getLanguage(),
          settings: { skyCulture: culture(), deepSkyObjects: showStars, deepSkyScope: 'all' },
          showStars,
          limitMagnitude: status.starMagnitudeLimit,
          // Ground's point-source layer contains Hipparcos/Gaia; Tycho cutout
          // stars belong to the orbit instrument's separate detector.
          includeStar: (star) => star.source !== 'tycho',
          blocked: terrainHides,
          candidates,
        });
      }
    }
    const name = hit.name || t('未匹配到天体');
    const detail = [
      hit.detail,
      hit.identifier !== name ? hit.identifier : null,
      Number.isFinite(hit.magnitude)
        ? t('视星等 {value}', { value: fieldNumber(hit.magnitude) })
        : '',
      hit.category,
      hit.withinDisc ? t('准星落在天体圆面内') : '',
      hit.region ? t('位于 {name} 天区', { name: hit.region.name }) : '',
      ['star', 'solar'].includes(hit.kind) ? crosshairDistanceText(hit, t) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return { ...hit, name, detail, coordinates, text: name + ' · ' + coordinates };
  }
  function paint({
    wall = performance.now(),
    width,
    height,
    status,
    blocked,
    hud,
    reserved,
    photoframe = false,
    annotations = true,
  }) {
    if (photoframe) return photoOverlay({ width, height, status, blocked, annotations });
    if (!active || !(width > 0 && height > 0) || !status) return;
    const ratio = bound(window.devicePixelRatio || 1, 1, 2);
    const pw = Math.round(width * ratio),
      ph = Math.round(height * ratio);
    if (mask.width !== pw || mask.height !== ph) {
      mask.width = pw;
      mask.height = ph;
    }
    ctx.setTransform(pw / width, 0, 0, ph / height, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const refresh =
      wall - lastRefresh >= 240 || lastFrame?.width !== width || lastFrame.height !== height;
    const rects = refresh ? avoidRects(reserved || [hud], width, height) : lastFrame.rects;
    const content = annotations ? sampleAnnotations(width, height, status, blocked, rects) : null;
    const rows = content?.rows || [];
    drawOverlay(ctx, width, height, content);
    lastFrame = { width, height, status, blocked, rows, rects, time: date(), sample: reading };
    updateMount();
    if (!refresh) return;
    lastRefresh = wall;
    effectiveMagnitudeLimit = status.starMagnitudeLimit;
    setText(
      magnitudePicker.options[0],
      prefs.starMagnitudeLimit === null && Number.isFinite(status.starMagnitudeLimit)
        ? t('自动（{value} 等）', {
            value: status.starMagnitudeLimit.toLocaleString(getLanguage(), {
              maximumFractionDigits: 1,
            }),
          })
        : t('自动')
    );
    refreshReading();
    refreshResults();
    centerInfo = identifyCentre(status, width, height, rows, blocked);
    const crosshair = $('[data-star-crosshair]');
    crosshair.dataset.kind = centerInfo.kind;
    crosshair.dataset.target = centerInfo.id || '';
    setText(crosshair, centerInfo.name);
    setText($('[data-star-crosshair-detail]'), centerInfo.detail);
    updateSourceInfo();
    const sat = satelliteLayer?.status;
    syncFilterOptions();
    setText(
      $('[data-star-sat-status]'),
      sat
        ? prefs.satelliteScope === 'internet' && sat.internetTotal === 0
          ? t('当前轨道目录中还没有低轨互联网卫星。')
          : sat.total === 0 && Object.values(prefs.satelliteFilters).some(Boolean)
            ? t('没有符合筛选的卫星。')
            : t('视野内 {visible} · 已标名 {labels} · 轨道目录 {total}', {
                visible: sat.visible,
                labels: sat.labels,
                total: sat.total,
              }) +
              (sat.loading ? ' · ' + t('正在载入轨道') : '') +
              (sat.outOfRange ? ' · ' + t('超出轨道时段') + ' ' + sat.outOfRange : '')
        : ''
    );
    const listed = $('[data-star-listed]');
    listed.hidden = !rows.length;
    // A low-frequency text list also makes canvas labels accessible to screen readers.
    if (rows.length && listed.open) {
      const lines = rows.map((row) => {
        const parts = [t(row.name), t(row.status), Math.round(row.elevation) + '°'];
        let source = '';
        if (prefs.labelLevel === 'detailed' && Number.isFinite(row.magnitude)) {
          const mag = row.magnitude.toLocaleString(getLanguage(), {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          });
          parts.push(t('估算视星等 {mag}', { mag }));
          if (row.photometrySource) source = t('数据来源') + ' · ' + row.photometrySource;
        } else if (
          prefs.labelLevel === 'detailed' &&
          row.illumination >= 0.01 &&
          !row.photometrySource
        )
          parts.push(t('缺少光度标定'));
        return { text: parts.join(' · '), source };
      });
      const key = JSON.stringify(lines);
      if (key !== listKey) {
        listKey = key;
        $('[data-star-list]').replaceChildren(
          ...lines.map(({ text, source }) => {
            const li = document.createElement('li');
            li.textContent = text;
            if (source) li.title = source;
            return li;
          })
        );
      }
    }
    $('[data-star-night]').hidden = status.sunAltitude <= -18;
    const timeLabel = t(
      status.sunAltitude >= 0 ? '白昼' : status.sunAltitude > -18 ? '暮光' : '夜空'
    );
    const orientation =
      t('方位') +
      ' ' +
      reading.azimuth.toFixed(1) +
      '°  ·  ' +
      t('仰角') +
      ' ' +
      reading.elevation.toFixed(1) +
      '°';
    lastHud = [
      reading.tracking ? targetName(reading.target) : null,
      timeLabel,
      lensCaption(),
      fieldNumber(field()) + '°',
      orientation,
    ]
      .filter(Boolean)
      .join('  ·  ');
    if (hud) setText(hud, lastHud + '\n' + t('十字线所指') + ' · ' + centerInfo.text);
  }
  return {
    prefs,
    mountMarkers(marker, projected) {
      aimMarker = mountAimMarker({
        marker,
        mirrors: [projected],
        host: $('[data-ground-marker-settings]'),
        profile: 'ground',
        title: '瞄准标记',
      });
    },
    skyView(frame = lastFrame, inScope = true) {
      if (!active || !frame?.status?.view || !frame.sample) return null;
      const { width, height, status, sample } = frame;
      return {
        ...status.view,
        width,
        height,
        culture: culture(),
        zenith: sample.sky.frame.basis[2],
        circleDiameter: inScope ? opticsFor(width, height).eyeCircleDiameter : 0,
        foreground: inScope ? centerInfo?.kind : null,
        opticalFov: inScope ? field() : status.view.fovY,
      };
    },
    skyHit(x, y, candidates, frame = lastFrame, inScope = true) {
      if (!active || !frame?.sample) return null;
      const { width, height, rows, status, blocked, sample } = frame;
      const diameter = inScope ? opticsFor(width, height).eyeCircleDiameter : 0;
      if (diameter > 0 && Math.hypot(x * width, y * height) > diameter)
        return { kind: 'outside', name: skyText('outside') };
      const maskAt = blocked && ((px, py) => blocked(px, py, false));
      return identifyCentre(status, width, height, rows || [], maskAt, x, y, candidates, sample);
    },
    canPointTarget(target) {
      return active && !!control.observe(target, state.site, date())?.aboveHorizon;
    },
    pointTarget(target, track) {
      if (!active || !control.observe(target, state.site, date())?.aboveHorizon) return false;
      control.select(target);
      if (!control.aim(state.site, date(), state, track)) return false;
      setText(queryBox, '');
      refreshReading();
      onViewChange();
      persist();
      return true;
    },
    setActive,
    canAim,
    aimImage,
    paint,
    photoOverlay,
    nudge,
    zoom,
    roll: (delta) => setRoll(state.rollDegrees + delta),
    fov: (degrees) => (degrees === undefined ? field() : setField(degrees)),
    wide: () => setField(GROUND_TELESCOPE.finderFovDeg),
    recommend,
    get centerInfo() {
      return centerInfo;
    },
    get active() {
      return active;
    },
    get field() {
      return field();
    },
    cameraField(width, height) {
      return width > 0 && height > 0 ? opticsFor(width, height).fov : field();
    },
    get reading() {
      return reading;
    },
    get overlay() {
      return mask;
    },
    get caption() {
      return [
        lastHud,
        source.selectedOptions[0]?.textContent,
        prefs.apertureMm + ' mm',
        prefs.exposureEV + ' EV',
        t('画幅旋转') + ' ' + fieldNumber(state.rollDegrees) + '°',
      ]
        .filter(Boolean)
        .join(' · ');
    },
    tick() {
      reading = control.update(state.site, date(), state);
      return reading;
    },
    view(settings, w, h) {
      finderEnhanced = settings.finderEnhanced === true;
      const optics = opticsFor(w, h);
      return {
        ...settings,
        ...optics,
        stargazing: true,
        apertureMm: prefs.apertureMm,
        exposureEV: prefs.exposureEV,
        starMagnitudeLimit: prefs.starMagnitudeLimit ?? optics.autoMagnitudeLimit,
        referenceSource: prefs.source === 'natural' ? null : prefs.source,
        referenceArtwork: prefs.artworkBySource[prefs.source] || null,
        referenceBackground: prefs.background,
        seeThroughTerrain: false,
        appearance: finderEnhanced ? 'galaxy' : 'natural',
      };
    },
    includes(x, y, w, h) {
      const stop = opticsFor(w, h).eyeCircleDiameter;
      return !stop || Math.hypot((x * w) / 2, (y * h) / 2) < stop / 2 - 14;
    },
    manual() {
      control.release();
    },
    wheel(delta) {
      return zoom(
        scopeWheelLogDelta(
          typeof delta === 'number' ? { deltaY: delta } : delta,
          lastFrame?.height || mask.clientHeight || 1
        )
      );
    },
    refresh() {
      if (active) {
        control.localize(getLanguage(), culture());
        syncSatelliteControls();
        syncOpticsControls();
        updateSourceInfo();
        refreshResults(true);
        refreshReading();
        lastRefresh = -Infinity;
      }
    },
    resetSite() {
      if (active) {
        control.release();
        searchStamp = null;
        centerInfo = null;
        lastRefresh = -Infinity;
        setText(queryBox, '');
        refreshResults(true);
        refreshReading();
      }
    },
    dispose() {
      setActive(false);
      aimMarker?.dispose();
      mask.remove();
    },
  };
}
