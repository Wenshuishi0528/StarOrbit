import { getLanguage, onLanguageChange } from './i18n.js';
import { lastObserver, rememberObserver } from './observer-settings.js';
import { validateObserver } from './pass-prediction.js';
import { lunarObservation, lunarFeatureState, lunarEvents } from './lunar-math.js';
import { LUNAR_FEATURES, lunarFeatureText } from './lunar-features.js';
import { LUNAR_PLACES, getLunarPlace } from './lunar-place-catalog.js';
import { mountLunarPlaceControls } from './lunar-place-controls.js';
import { mountLunarGeologyViewer } from './lunar-geology-viewer.js';
import { createLunarRenderer } from './lunar-renderer.js';
import { lunarUI } from './lunar-ui-copy.js';
import { lunarStyle } from './lunar-lab-style.js';
import {
  normalizeLunarPreferences,
  validLunarTime,
  parseLunarUTC,
  lunarUTCInput,
  lunarResolution,
  LUNAR_MIN_TIME,
  LUNAR_MAX_TIME,
  LUNAR_DAY,
} from './lunar-state.js';
const STORAGE = 'starorbit-lunar-v1';
export function mountLunarLab(container, sim) {
  const root = document.createElement('section');
  root.className = 'lunar-lab';
  container.append(root);
  const style = document.createElement('style');
  style.textContent = lunarStyle;
  root.append(style);
  const ui = (k) => lunarUI(k, getLanguage()),
    copy = (f) =>
      typeof f.name === 'object'
        ? lunarFeatureText(f, getLanguage())
        : {
            name: getLanguage() === 'zh' ? f.nameZh || f.name : f.name,
            hint:
              f.kind === 'landing'
                ? getLanguage() === 'zh'
                  ? f.nameZh || f.name
                  : f.name
                : f.featureTypeLabel || f.name,
          };
  const make = (tag, parent, className = '') => {
    const e = document.createElement(tag);
    e.className = className;
    parent.append(e);
    return e;
  };
  const translated = [];
  function text(tag, parent, key, className = '') {
    const e = make(tag, parent, className);
    translated.push([e, key]);
    return e;
  }
  const button = (parent, key, fn) => {
    const e = text('button', parent, key);
    e.type = 'button';
    e.onclick = fn;
    return e;
  };
  function field(parent, key, type) {
    const label = make('label', parent);
    text('span', label, key);
    const input = make('input', label);
    input.type = type;
    input.dataset.lunar = key;
    return input;
  }
  let prefs = normalizeLunarPreferences();
  try {
    prefs = normalizeLunarPreferences(JSON.parse(localStorage.getItem(STORAGE)));
  } catch {}
  let site = lastObserver() || { name: '北京', latitude: 39.9042, longitude: 116.4074, height: 50 };
  let time = validLunarTime(sim.current?.t) ? sim.current.t : Date.now(),
    baseTime = time,
    frame = null,
    events = null,
    viewer = null,
    visible = false,
    disposed = false,
    running = false,
    raf = 0,
    lastWall = 0,
    lastPaint = -Infinity,
    captureBusy = false,
    graphicsReady = false,
    navigating = false;
  let selected =
    LUNAR_FEATURES.find((f) => f.id === prefs.feature) ||
    getLunarPlace(prefs.feature) ||
    LUNAR_FEATURES[0];
  if (!Number.isFinite(selected.latitude) || !Number.isFinite(selected.longitude))
    selected = LUNAR_FEATURES[0];
  let mapPlaces = [],
    landingPlaces = [];
  const refreshPlaces = () => {
    const localized = LUNAR_PLACES.map((p) => ({ ...p, localizedName: copy(p).name }));
    mapPlaces = localized.filter((p) => p.kind === 'feature');
    landingPlaces = localized.filter((p) => p.kind === 'landing');
  };
  refreshPlaces();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const persist = () => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ ...prefs, feature: selected.id }));
    } catch {}
  };
  const intro = make('div', root, 'lunar-intro'),
    heading = make('div', intro);
  make('div', heading, 'lunar-eyebrow').textContent = 'STARORBIT / LUNAR';
  text('p', heading, 'intro');
  const modes = make('div', intro, 'lunar-modes');
  const observe = button(modes, 'observe', () => setMode('observe')),
    atlas = button(modes, 'atlas', () => setMode('atlas'));
  const layout = make('div', root, 'lunar-layout'),
    left = make('div', layout),
    right = make('div', layout, 'lunar-sidebar');
  const visual = make('div', left, 'lunar-visual'),
    canvas = make('canvas', visual),
    badge = make('div', visual, 'lunar-badge'),
    failure = text('div', visual, 'graphicsError', 'lunar-failure');
  failure.hidden = true;
  const actions = make('div', left, 'lunar-actions');
  button(actions, 'reset', () => viewer?.resetView());
  const retryLayer = button(actions, 'retryLayer', () =>
    viewer?.retryGeology()?.then(() => paint())
  );
  retryLayer.hidden = true;
  const capture = button(actions, 'capture', captureImage);
  capture.disabled = true;
  const finder = button(actions, 'finder', async () => {
    if (navigating) return;
    navigating = true;
    finder.disabled = true;
    stop();
    try {
      if (!(await sim.flightLab.observeLunarTarget())) status.textContent = ui('error');
    } catch {
      status.textContent = ui('error');
    } finally {
      navigating = false;
      finder.disabled = false;
    }
  });
  const warning = make('p', left, 'lunar-warning'),
    viewNote = make('p', left, 'lunar-note lunar-viewport-note');
  const metrics = make('div', left, 'lunar-metrics'),
    metricNodes = {};
  for (const key of [
    'phase',
    'distance',
    'diameter',
    'altitude',
    'azimuth',
    'libration',
    'ra',
    'dec',
  ]) {
    const card = make('div', metrics, 'lunar-metric');
    text('small', card, key);
    metricNodes[key] = make('strong', card);
  }
  const eventCard = make('section', left, 'lunar-card');
  text('h4', eventCard, 'events');
  button(eventCard, 'calculate', calculateEvents);
  const eventList = make('div', eventCard, 'lunar-events');
  text('p', eventCard, 'eventNote', 'lunar-note');
  text('p', left, 'finderNote', 'lunar-note');
  text('p', left, 'exportNote', 'lunar-note');
  const sources = make('details', left);
  text('summary', sources, 'sources');
  text('p', sources, 'mapNote', 'lunar-note');
  for (const [name, url] of [
    ['NASA / LRO / LOLA', 'https://svs.gsfc.nasa.gov/4720/'],
    ['IAU / USGS', 'https://planetarynames.wr.usgs.gov/'],
    ['Astronomy Engine', 'https://github.com/cosinekitty/astronomy'],
  ]) {
    const a = make('a', sources);
    a.textContent = name + ' ↗ ';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  const clockCard = make('section', right, 'lunar-card');
  text('h4', clockCard, 'clock');
  const date = make('input', clockCard);
  date.type = 'datetime-local';
  date.step = '1';
  date.min = '1900-01-01T00:00';
  date.max = '2100-12-31T23:59:59';
  date.dataset.lunar = 'date';
  date.oninput = () => stop(false);
  date.onchange = () => {
    try {
      setTime(parseLunarUTC(date.value));
    } catch {
      status.textContent = ui('error');
    }
  };
  const timeActions = make('div', clockCard, 'lunar-actions');
  button(timeActions, 'applyTime', () => {
    try {
      setTime(parseLunarUTC(date.value));
    } catch {
      status.textContent = ui('error');
    }
  });
  button(timeActions, 'now', () => setTime(Date.now()));
  button(timeActions, 'mainTime', () => {
    if (validLunarTime(sim.current?.t)) setTime(sim.current.t);
    else status.textContent = ui('error');
  });
  const steps = make('div', clockCard, 'lunar-actions');
  button(steps, 'previous', () => setTime(time - LUNAR_DAY));
  button(steps, 'next', () => setTime(time + LUNAR_DAY));
  const play = button(clockCard, 'play', () => {
    if (running) {
      stop();
      return;
    }
    baseTime = time;
    running = true;
    lastWall = 0;
    events = null;
    eventList.replaceChildren();
    updatePlay();
    schedule();
  });
  const seek = make('input', clockCard, 'lunar-timeline');
  seek.type = 'range';
  seek.min = 0;
  seek.max = 30;
  seek.step = 0.01;
  seek.value = 0;
  seek.oninput = () => {
    stop();
    setTime(baseTime + Number(seek.value) * LUNAR_DAY, false);
  };
  const timeCaption = make('div', clockCard, 'lunar-progress-label');
  text('p', clockCard, 'clockNote', 'lunar-note');
  const siteCard = make('details', right, 'lunar-card');
  text('summary', siteCard, 'site');
  const siteFields = make('div', siteCard, 'lunar-site-fields');
  const latitude = field(siteFields, 'latitude', 'number'),
    longitude = field(siteFields, 'longitude', 'number'),
    height = field(siteCard, 'height', 'number');
  latitude.min = -90;
  latitude.max = 90;
  longitude.min = -180;
  longitude.max = 180;
  height.min = -500;
  height.max = 9000;
  latitude.step = longitude.step = 'any';
  height.step = 'any';
  const siteActions = make('div', siteCard, 'lunar-actions');
  button(siteActions, 'apply', () => {
    try {
      if ([latitude, longitude, height].some((e) => e.value.trim() === '')) throw Error();
      site = validateObserver({
        name: `${latitude.value}°, ${longitude.value}°`,
        latitude: Number(latitude.value),
        longitude: Number(longitude.value),
        height: Number(height.value),
      });
      rememberObserver(site);
      stop();
      events = null;
      eventList.replaceChildren();
      paint();
      status.textContent = '';
    } catch {
      status.textContent = ui('error');
    }
  });
  button(siteActions, 'savedSite', () => {
    const saved = lastObserver();
    if (!saved) {
      status.textContent = ui('noSite');
      return;
    }
    site = saved;
    fillSite();
    stop();
    events = null;
    eventList.replaceChildren();
    paint();
  });
  const layerCard = make('section', right, 'lunar-card');
  const layerLabel = make('label', modes, 'lunar-layer-choice');
  const layer = make('select', layerLabel);
  for (const id of ['natural', 'elevation', 'geology']) {
    const option = text('option', layer, id);
    option.value = id;
  }
  layer.value = prefs.layer;
  layer.onchange = () => {
    prefs.layer = layer.value;
    if (prefs.layer === 'geology') prefs.mode = 'atlas';
    persist();
    paint();
  };
  const reliefLabel = make('label', layerCard);
  text('span', reliefLabel, 'relief');
  const relief = make('select', reliefLabel);
  for (const [id, key] of [
    [1, 'actual'],
    [8, 'enhanced'],
  ]) {
    const option = text('option', relief, key);
    option.value = id;
  }
  relief.value = prefs.relief;
  relief.onchange = () => {
    prefs.relief = Number(relief.value);
    persist();
    paint();
  };
  const scale = make('div', layerCard);
  make('div', scale, 'lunar-scale');
  const scaleText = make('div', scale, 'lunar-scale-labels');
  make('span', scaleText).textContent = '−10 km';
  make('span', scaleText).textContent = '0';
  make('span', scaleText).textContent = '+10 km';
  const placesCard = make('section', right, 'lunar-card');
  const placeControls = mountLunarPlaceControls(placesCard, {
    places: LUNAR_PLACES.filter((p) => p.kind === 'feature'),
    landingSites: LUNAR_PLACES.filter((p) => p.kind === 'landing'),
    language: getLanguage(),
    placesEnabled: prefs.labels,
    landingsEnabled: prefs.landings,
    density: prefs.placeDensity,
    onSelect(place) {
      if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return;
      selected = place;
      setMode('atlas');
      viewer?.focusFeature(place);
      visual.scrollIntoView({ block: 'center', behavior: 'auto' });
      persist();
    },
    onChange(settings) {
      prefs.labels = settings.placesEnabled;
      prefs.landings = settings.landingsEnabled;
      prefs.placeDensity = settings.density;
      persist();
      paint();
    },
  });
  const geologyCard = make('details', left, 'lunar-card lunar-geology-card');
  text('summary', geologyCard, 'geologyPoster');
  const geologyBody = make('div', geologyCard);
  let geologyViewer = null;
  geologyCard.ontoggle = () => {
    if (geologyCard.open && !geologyViewer)
      geologyViewer = mountLunarGeologyViewer(geologyBody, {
        assets: sim.environment.assets.lunarGeology,
        language: getLanguage(),
      });
  };
  const featureCard = make('section', right, 'lunar-card');
  text('h4', featureCard, 'explore');
  const featureLabel = make('label', featureCard);
  text('span', featureLabel, 'feature');
  const featureSelect = make('select', featureLabel);
  featureSelect.onchange = () => {
    selected = LUNAR_FEATURES.find((f) => f.id === featureSelect.value) || selected;
    persist();
    paint();
  };
  const featureInfo = make('p', featureCard, 'lunar-feature-info');
  button(featureCard, 'focus', () => {
    setMode('atlas');
    viewer?.focusFeature(selected);
  });
  const games = make('div', featureCard, 'lunar-actions');
  button(games, 'terminator', () => {
    if (!frame) return;
    const candidates = LUNAR_FEATURES.map((f) => ({ f, s: lunarFeatureState(frame, f) }))
      .filter(({ s }) => s.visible && s.solarAltitudeDeg >= 5 && s.solarAltitudeDeg <= 25)
      .sort((a, b) => Math.abs(a.s.solarAltitudeDeg - 12) - Math.abs(b.s.solarAltitudeDeg - 12));
    if (!candidates.length) {
      status.textContent = ui('noTerminator');
      return;
    }
    selected = candidates[0].f;
    featureSelect.value = selected.id;
    prefs.layer = 'natural';
    layer.value = prefs.layer;
    setMode('atlas');
    viewer?.focusFeature(selected);
    persist();
  });
  button(games, 'farSide', () => {
    selected = LUNAR_FEATURES.find((f) => Math.abs(f.longitude) > 100) || selected;
    featureSelect.value = selected.id;
    setMode('atlas');
    viewer?.focusFeature(selected);
    persist();
  });
  const pickText = make('p', featureCard, 'lunar-note');
  const status = make('div', right, 'lunar-status');
  status.setAttribute('role', 'status');
  const resolutionCard = make('details', left, 'lunar-card'),
    resolutionSummary = make('summary', resolutionCard),
    apertureLabel = make('label', resolutionCard),
    apertureCaption = make('span', apertureLabel),
    aperture = make('input', apertureLabel),
    resolution = make('p', resolutionCard, 'lunar-note');
  aperture.type = 'range';
  aperture.min = 30;
  aperture.max = 500;
  aperture.step = 5;
  aperture.value = prefs.aperture;
  aperture.oninput = () => {
    prefs.aperture = Number(aperture.value);
    paint();
  };
  aperture.onchange = persist;
  function fillSite() {
    latitude.value = site.latitude;
    longitude.value = site.longitude;
    height.value = site.height;
  }
  function updatePlay() {
    play.textContent = ui(running ? 'pause' : 'play');
    play.setAttribute('aria-pressed', String(running));
  }
  function stop(paintFinal = true) {
    const wasRunning = running;
    running = false;
    lastWall = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    updatePlay();
    if (paintFinal && wasRunning && visible && !disposed) paint();
  }
  function setTime(value, anchor = true) {
    if (!validLunarTime(value)) {
      stop();
      status.textContent = ui('error');
      return;
    }
    if (anchor) {
      stop();
      baseTime = value;
    }
    time = value;
    events = null;
    eventList.replaceChildren();
    status.textContent = '';
    paint();
  }
  function setMode(value) {
    if (value === 'observe' && prefs.layer === 'geology') {
      prefs.layer = 'natural';
      layer.value = 'natural';
    }
    prefs.mode = value;
    persist();
    paint();
  }
  const formatTime = (value) =>
    value == null
      ? ui('none')
      : new Date(value).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  function calculateEvents() {
    stop();
    try {
      events = lunarEvents(time, site);
      showEvents();
      status.textContent = '';
    } catch {
      status.textContent = ui('error');
    }
  }
  function showEvents() {
    eventList.replaceChildren();
    if (!events) return;
    for (const [key, value] of [
      ['rise', events.riseTimeMs],
      ['set', events.setTimeMs],
      ['transit', events.transitTimeMs],
    ]) {
      const row = make('div', eventList, 'lunar-event');
      make('span', row).textContent = ui(key);
      make('strong', row).textContent = formatTime(value);
    }
    for (const e of events.phases) {
      const b = make('button', eventList, 'lunar-event');
      b.type = 'button';
      make('span', b).textContent = ui(['new', 'first', 'full', 'last'][e.phase]);
      make('strong', b).textContent = formatTime(e.timeMs);
      b.onclick = () => setTime(e.timeMs);
    }
  }
  function renderOptions() {
    return {
      frame,
      mode: prefs.mode,
      layer: prefs.layer,
      relief: prefs.mode === 'observe' ? 1 : prefs.relief,
      labels: prefs.labels,
      feature: { ...selected, localizedName: copy(selected).name },
      features: LUNAR_FEATURES.map((f) => ({ ...f, localizedName: copy(f).name })),
      places: mapPlaces,
      placeDensity: prefs.placeDensity,
      landingSites: prefs.landings ? landingPlaces : [],
    };
  }
  let lastSelectedId = null;
  function paint() {
    if (disposed) return;
    if (selected.id !== lastSelectedId) {
      lastSelectedId = selected.id;
      placeControls.setSelection(selected);
      featureSelect.value = LUNAR_FEATURES.some((f) => f.id === selected.id) ? selected.id : '';
      if (featureSelect.options[0]?.value === '')
        featureSelect.options[0].textContent = copy(selected).name;
    }
    try {
      frame = lunarObservation(time, site);
    } catch {
      status.textContent = ui('error');
      return;
    }
    date.value = lunarUTCInput(time);
    seek.value = Math.max(0, Math.min(30, (time - baseTime) / LUNAR_DAY));
    timeCaption.textContent = formatTime(time);
    observe.setAttribute('aria-pressed', String(prefs.mode === 'observe'));
    atlas.setAttribute('aria-pressed', String(prefs.mode === 'atlas'));
    relief.disabled = prefs.mode === 'observe';
    relief.value = prefs.mode === 'observe' ? 1 : prefs.relief;
    scale.hidden = prefs.layer !== 'elevation';
    badge.textContent =
      ui(prefs.mode === 'atlas' ? 'atlasBadge' : 'observe') +
      ' · ' +
      ui(prefs.layer) +
      (prefs.mode === 'atlas' && prefs.relief === 8 ? ' · ×8' : '');
    viewNote.textContent = ui(
      prefs.layer === 'geology'
        ? 'geologyNote'
        : prefs.mode === 'observe'
          ? 'observeNote'
          : 'atlasNote'
    );
    warning.textContent =
      `${site.latitude.toFixed(3)}°N · ${site.longitude.toFixed(3)}°E · ${site.height} m — ` +
      ui(frame.geometricAltitudeDeg < 0 ? 'below' : 'above');
    metricNodes.phase.textContent =
      (frame.illuminatedFraction * 100).toFixed(1) +
      '% · ' +
      ui(frame.waxing ? 'waxing' : 'waning');
    metricNodes.distance.textContent =
      Math.round(frame.distanceKm).toLocaleString(getLanguage()) + ' km';
    metricNodes.diameter.textContent = (frame.angularDiameterDeg * 60).toFixed(2) + '′';
    metricNodes.altitude.textContent = frame.geometricAltitudeDeg.toFixed(2) + '°';
    metricNodes.azimuth.textContent = frame.azimuthDeg.toFixed(2) + '°';
    metricNodes.ra.textContent = frame.rightAscensionHours.toFixed(4) + ' h';
    metricNodes.dec.textContent = frame.declinationDeg.toFixed(3) + '°';
    metricNodes.libration.textContent =
      frame.geocentricLibration.longitude.toFixed(2) +
      '° / ' +
      frame.geocentricLibration.latitude.toFixed(2) +
      '°';
    const f = lunarFeatureState(frame, selected),
      c = copy(selected);
    featureInfo.textContent =
      c.hint +
      '\n' +
      selected.latitude.toFixed(2) +
      '°N · ' +
      selected.longitude.toFixed(2) +
      '°E\n' +
      ui(f.visible ? 'visible' : 'hidden') +
      ' · ' +
      ui(f.sunlit ? 'light' : 'dark') +
      '\n' +
      ui('sunAltitude') +
      ' ' +
      f.solarAltitudeDeg.toFixed(1) +
      '°';
    const r = lunarResolution(prefs.aperture, frame.distanceKm);
    apertureCaption.textContent = ui('aperture') + ' ' + prefs.aperture + ' mm';
    resolution.textContent =
      ui('resolutionNote') + ' ' + r.arcsec.toFixed(2) + '″ ≈ ' + r.km.toFixed(2) + ' km';
    if (visible && viewer)
      try {
        viewer.render(renderOptions());
        const health = viewer.getStatus();
        graphicsReady = health.ready;
        capture.disabled = !graphicsReady || captureBusy;
        const layerError =
          prefs.layer === 'geology' ? health.geology === 'error' : health.texture === 'error';
        const layerLoading = prefs.layer === 'geology' && health.geology !== 'ready' && !layerError;
        retryLayer.hidden = !(prefs.layer === 'geology' && layerError);
        failure.textContent = ui(layerLoading ? 'loading' : 'graphicsError');
        failure.hidden =
          health.context === 'ready' && health.terrain !== 'error' && !layerError && !layerLoading;
        visual.classList.toggle('lunar-unavailable', !failure.hidden);
        if (!failure.hidden) stop();
      } catch {
        failure.hidden = false;
        capture.disabled = true;
      }
  }
  function schedule() {
    if (!raf && visible && !disposed && !document.hidden) raf = requestAnimationFrame(tick);
  }
  function tick(wall) {
    raf = 0;
    if (!visible || disposed || document.hidden) return;
    if (running) {
      const dt = lastWall ? Math.min(0.1, (wall - lastWall) / 1000) : 0;
      time = Math.min(time + dt * LUNAR_DAY, baseTime + 30 * LUNAR_DAY, LUNAR_MAX_TIME);
      if (time >= baseTime + 30 * LUNAR_DAY || time >= LUNAR_MAX_TIME) {
        running = false;
        updatePlay();
      }
      lastWall = wall;
    }
    if (wall - lastPaint >= 100 || !running) {
      paint();
      lastPaint = wall;
    }
    if (running) schedule();
  }
  async function captureImage() {
    if (!viewer || !graphicsReady || captureBusy || !frame) return;
    captureBusy = true;
    capture.disabled = true;
    stop();
    const capturedTime = time,
      capturedMode = ui(prefs.mode === 'atlas' ? 'atlasBadge' : 'observe'),
      capturedLayer = ui(prefs.layer),
      capturedRelief = prefs.mode === 'observe' ? 1 : prefs.relief,
      capturedSite = { ...site };
    try {
      viewer.render(renderOptions());
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height + (prefs.layer === 'geology' ? 142 : 116);
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#07121e';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(canvas, 0, 0);
      if (viewer.annotationCanvas)
        ctx.drawImage(viewer.annotationCanvas, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#d5e6f2';
      ctx.font = '13px sans-serif';
      const lines = [
        `StarOrbit · ${ui('title')} · ${capturedMode} · ${capturedLayer} · ×${capturedRelief}`,
        formatTime(capturedTime) +
          ` · ${capturedSite.latitude}°N, ${capturedSite.longitude}°E · ${capturedSite.height} m`,
        'Simulation, not live imagery · NASA / GSFC / SVS / LRO / LOLA',
        'StarOrbit / Wenshuishi · Software CC BY-NC 4.0 · Image sources retain their credits',
      ];
      lines.forEach((line, i) =>
        ctx.fillText(line, 14, canvas.height + 23 + i * 25, out.width - 28)
      );
      if (prefs.layer === 'geology')
        ctx.fillText(
          'Geologic map: Ji et al. (2022), IGCAS · CC BY 4.0 · DOI 10.12176/03.99.02797 · Reprojected',
          14,
          canvas.height + 118,
          out.width - 28
        );
      const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
      if (!blob) throw Error();
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download =
        'StarOrbit_Moon_' + new Date(capturedTime).toISOString().replace(/[:.]/g, '-') + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      status.textContent = ui('error');
    } finally {
      captureBusy = false;
      capture.disabled = !graphicsReady || !failure.hidden;
    }
  }
  function translate() {
    refreshPlaces();
    placeControls.setLanguage(getLanguage());
    geologyViewer?.setLanguage(getLanguage());
    for (const [e, k] of translated) e.textContent = ui(k);
    date.setAttribute('aria-label', ui('clock'));
    canvas.setAttribute('aria-label', ui('title'));
    seek.setAttribute('aria-label', ui('play'));
    layer.setAttribute('aria-label', ui('surfaceLayer'));
    relief.setAttribute('aria-label', ui('relief'));
    featureSelect.setAttribute('aria-label', ui('feature'));
    for (const [input, key] of [
      [latitude, 'latitude'],
      [longitude, 'longitude'],
      [height, 'height'],
    ])
      input.setAttribute('aria-label', ui(key));
    aperture.setAttribute('aria-label', ui('aperture'));
    resolutionSummary.textContent = ui('resolution');
    featureSelect.replaceChildren();
    const customOption = make('option', featureSelect);
    customOption.value = '';
    customOption.disabled = true;
    customOption.textContent = copy(selected).name;
    lastSelectedId = null;
    for (const f of LUNAR_FEATURES) {
      const o = make('option', featureSelect);
      o.value = f.id;
      o.textContent = copy(f).name;
    }
    featureSelect.value = selected.id;
    updatePlay();
    showEvents();
    paint();
  }
  function suspend() {
    visible = false;
    stop();
    persist();
  }
  const onVisibility = () => {
    if (document.hidden) stop();
    else if (visible) schedule();
  };
  const onReduced = () => {
    if (reduced.matches) stop();
  };
  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', onReduced);
  const unsubscribe = onLanguageChange(translate);
  fillSite();
  translate();
  return {
    setObservation({ time: nextTime, site: nextSite }) {
      if (nextSite) {
        site = { ...nextSite };
        fillSite();
      }
      setTime(nextTime);
    },
    resume() {
      visible = true;
      if (!viewer)
        try {
          status.textContent = ui('loading');
          viewer = createLunarRenderer(canvas, {
            assets: sim.environment.assets,
            onInvalidate: schedule,
            onPick: (point) => {
              pickText.textContent = `${point.latitude.toFixed(2)}°N · ${point.longitude.toFixed(2)}°E · ${point.elevationKm.toFixed(2)} km`;
            },
          });
          Promise.resolve(viewer.ready)
            .then((health) => {
              if (disposed) return;
              graphicsReady = health.ready;
              capture.disabled = !graphicsReady;
              status.textContent = graphicsReady ? '' : ui('error');
              paint();
            })
            .catch(() => {
              if (!disposed) status.textContent = ui('error');
            });
        } catch {
          failure.hidden = false;
          capture.disabled = true;
        }
      paint();
    },
    deactivate: suspend,
    pause: suspend,
    dispose() {
      suspend();
      disposed = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onReduced);
      placeControls.dispose();
      geologyViewer?.dispose();
      viewer?.dispose();
      root.remove();
    },
  };
}
