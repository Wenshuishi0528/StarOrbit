import { crosshairDistanceText } from './xuntian-distance.js';
import { Quaternion } from 'three';
import { t, getLanguage, onLanguageChange } from './i18n.js';
import { shortClock } from './time-format.js';
import { mountSurveyMission } from './survey-live-mission.js';
import { SURVEY_FIELDS } from './survey-lab-math.js';
import { dot, unit } from './orbit.js';
import {
  cityAnchor,
  createCityFinder,
  groundAttitude,
  opticalPose,
  orbitCarriedPose,
  orbitRelativePose,
  pinCrosshair,
  steerDetector,
  trackGround,
  wrapRoll,
} from './xuntian-ground-target.js';
import { sampleStationPin, stationPinDirection } from './xuntian-station-pin.js';
import {
  cameraAxes,
  clamp,
  earthInFront,
  focalLength,
  fovAtZoom,
  groundDirection,
  groundSunAltitude,
  sunlitGroundDirection,
  lookDirection,
  MAX_FOV,
  MIN_FOV,
  skyCoordinates,
  zoomAtFov,
} from './xuntian-pointing.js';
import { installXuntianFormation, mountXuntianFormationPanel } from './xuntian-formation.js';
import { aimAxes, attitudeQuaternion } from './xuntian-formation-math.js';
import { solarApparent } from './solar-system.js';
import { solarLabel, searchSolarTargets } from './solar-targets.js';
import { getXuntianTarget } from './xuntian-catalog.js';
import { createXuntianViewRenderer } from './xuntian-view-render.js';
import { earthMapSizes, PHOTO_WIDTHS, resolutionTag } from './xuntian-image-quality.js';
import { xuntianSkySource } from './xuntian-view-sky.js';
import { mountScopeInput } from './xuntian-input.js';
import { mountScopeSearch } from './xuntian-search.js';
import { makeScopeGuide } from './xuntian-guide.js';
import { normalizeStarChartSettings, syncStarChartControls } from './star-chart-settings.js';
import { mountXuntianSolarControls } from './xuntian-solar-controls.js';
import { skyDetailTarget, skyDetailText, skyDetailCredits } from './sky-detail-controls.js';
import { cityTerrainText } from './city-terrain-controls.js';

const $ = (id) => document.getElementById(id),
  KEY = 'starorbit-xuntian-instrument-v1',
  ASPECT = 1.6,
  DISCOVERY_FOV = 3.5,
  D = Math.PI / 180;
const modes = {
  free: '自由指向',
  pilot: '导航球操纵',
  station: '空间站',
  horizon: '地平线',
  nadir: '星下点',
  sunlit: '日照地表',
  city: '城市',
  'ground-pin': '固定地面点',
  'sky-pin': '固定星空方向',
  'station-pin': '固定站体点',
};
const recommended = [
  'pleiades',
  'cygnus',
  'orion',
  'sagittarius',
  'carina',
  'andromeda',
  'pegasus',
  'leo',
  'virgo',
];
const setText = (el, value) => {
  if (el.textContent !== value) el.textContent = value;
};
const visible = (sim) =>
  sim.missionId === 'tiangong' && sim.api.state.showXT && !!sim.api.groups.freeXT;

export function installXuntianScope(sim) {
  const panel = $('xuntianScope'),
    canvas = $('xtCanvas'),
    ocular = canvas.parentElement;
  let formation = null,
    guide = null,
    renderer = null,
    active = false,
    opened = false,
    mode = 'sky',
    named = null,
    fieldId = null,
    overviewArtworkId = null,
    field = DISCOVERY_FOV,
    aperture = 600,
    ev = 0,
    photoWidth = 1440,
    bookmark = null;
  let pose = new Quaternion(),
    desired = null,
    axes = cameraAxes(pose),
    optics = null,
    lastWall = null,
    lastDraw = -Infinity,
    interval = 80,
    lastResult = null,
    completedFrame = '',
    pausedFrame = '',
    assemblyRevision = 0,
    shadowTimer = 0;
  let capturing = false,
    unavailable = false,
    needsFrame = false,
    stationRefresh = false,
    nightCap = false,
    selectedAt = 0,
    locked = false,
    exterior = 'near';
  const stats = { frames: 0, lastRenderMs: 0 };
  let surveyMission,
    anchor = null,
    tracked = null,
    freePose = null,
    releaseNote = '',
    roll = 0,
    rollTimer = 0;
  const cities = createCityFinder(sim.environment.geography.items);
  try {
    const prefs = JSON.parse(localStorage.getItem(KEY)) || {};
    if (Number.isFinite(prefs.aperture)) aperture = clamp(prefs.aperture, 25, 2000);
    if (Number.isFinite(prefs.ev)) ev = clamp(prefs.ev, -3, 3);
    if (PHOTO_WIDTHS.includes(prefs.photoWidth)) photoWidth = prefs.photoWidth;
    $('xtNames').checked = !!prefs.previewNames;
    $('xtPhotoNames').checked = !!prefs.photoNames;
    $('xtShowGuide').checked = prefs.guide !== false;
    $('xtSkyCompass').checked = prefs.compass !== false;
  } catch {}
  const prefs = () => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          aperture,
          ev,
          photoWidth,
          previewNames: $('xtNames').checked,
          photoNames: $('xtPhotoNames').checked,
          guide: $('xtShowGuide').checked,
          compass: $('xtSkyCompass').checked,
        })
      );
    } catch {}
  };
  const setLens = (f) => {
    field = clamp(f, MIN_FOV, MAX_FOV);
    $('xtFocal').value = String(Math.round(zoomAtFov(field) * 1000));
    setText($('xtFocalLabel'), Math.round(focalLength(field)) + ' mm');
    lastDraw = -Infinity;
  };
  const setAperture = (a) => {
    aperture = clamp(a, 25, 2000);
    $('xtAperture').value = String(Math.round((Math.log(aperture / 25) / Math.log(80)) * 1000));
    setText($('xtApertureLabel'), Math.round(aperture) + ' mm');
    lastDraw = -Infinity;
  };
  const setEV = (value) => {
    ev = clamp(value, -3, 3);
    $('xtEV').value = ev;
    setText($('xtEVLabel'), (ev > 0 ? '+' : '') + Number(ev.toFixed(2)) + ' EV');
    lastDraw = -Infinity;
  };
  function actualAxes() {
    return cameraAxes(opticalPose(pose, roll));
  }
  function discardAnchor() {
    anchor = null;
    tracked = null;
    freePose = null;
    releaseNote = '';
  }
  function rememberFree(q = sim.current) {
    freePose = q ? orbitRelativePose(q, opticalPose(pose, roll)) : null;
  }
  function clearPilot() {
    if (mode !== 'pilot') return;
    mode = 'free';
    desired = null;
    locked = false;
    rememberFree();
    lastDraw = -Infinity;
    if (active) hud();
  }
  function beginExternalSteering() {
    overviewArtworkId = null;
    sim.mainFlight?.selectTarget?.('xuntian');
    sim.mainFlight?.endAttitudeControl?.('xuntian');
    clearPilot();
  }
  function setPilotAxes(inputAxes) {
    const pilotAxes = aimAxes(inputAxes);
    if (!pilotAxes || !visible(sim)) return false;
    ensureFormation();
    const changed = mode !== 'pilot';
    if (changed) {
      surveyMission?.clear();
      discardAnchor();
      named = null;
      fieldId = null;
      $('xtSearch').value = '';
    }
    mode = 'pilot';
    desired = null;
    locked = false;
    roll = 0;
    pose.copy(attitudeQuaternion(pilotAxes, true));
    axes = actualAxes();
    $('xtRoll').value = '0';
    setText($('xtRollLabel'), '0°');
    if (sim.current) optics = formation.update(sim.current, axes);
    if (changed) {
      lastDraw = -Infinity;
      pausedFrame = '';
      if (active) hud();
    }
    return true;
  }
  function updateFree(q) {
    if (!freePose) {
      rememberFree(q);
      return;
    }
    const carried = orbitCarriedPose(q, freePose);
    if (carried) pose.copy(opticalPose(carried, -roll));
  }
  function setRoll(value, remember = true) {
    if (remember) beginExternalSteering();
    if (mode === 'free' && sim.current) updateFree(sim.current);
    roll = wrapRoll(value);
    if (mode === 'free' && sim.current) rememberFree();
    $('xtRoll').value = String(Math.round(roll));
    setText($('xtRollLabel'), (roll > 0 ? '+' : '') + Math.round(roll) + '°');
    axes = actualAxes();
    if (formation && sim.current) optics = formation.update(sim.current, axes);
    lastDraw = -Infinity;
    pausedFrame = '';
    if (remember) {
      clearTimeout(rollTimer);
      rollTimer = setTimeout(prefs, 180);
    }
    if (active) hud();
  }
  function aim(direction, snap = false) {
    const next = lookDirection(direction, cameraAxes(pose).up);
    if (snap) {
      pose.copy(next);
      axes = actualAxes();
      desired = null;
      locked = true;
    } else {
      desired = next;
      locked = false;
    }
    lastDraw = -Infinity;
  }
  function saveSky() {
    if (mode === 'sky') bookmark = { pose: (desired || pose).clone(), named, fieldId, field };
  }
  function bodyNow(body) {
    const eye = optics?.eyeKm || sim.current?.position;
    if (!eye || !sim.current) return null;
    return solarApparent(sim.current, eye).find((entry) => entry.id === body);
  }
  function selectStar(target) {
    const nextCulture =
      target.type === 'asterism' ? 'chinese' : target.type === 'constellation' ? 'western' : null;
    if (nextCulture && sim.environment.settings.skyCulture !== nextCulture) {
      sim.environment.settings.skyCulture = nextCulture;
      syncStarChartControls(sim.environment.settings);
      sim.environment.save();
    }
    if (target.type === 'asterism') {
      sim.environment.skyCultureFocus = target.id;
      sim.skyCultureControls?.select?.(target.id);
    }
    beginExternalSteering();
    if (target.type !== 'solar' || target.body !== 'Sun') solarControls.ordinary();
    if (target.type === 'solar') {
      if (target.body === 'Earth') {
        observe('nadir');
        return;
      }
      const body = bodyNow(target.body);
      if (!body) return;
      saveSky();
      surveyMission?.clear();
      discardAnchor();
      mode = 'solar';
      named = target;
      fieldId = null;
      const diameter = (2 * body.radiusRad) / D;
      setLens(Math.max(MIN_FOV, diameter * (target.body === 'Saturn' ? 4.8 : 2.5)));
      aim(body.direction);
      selectedAt = performance.now();
      hud();
      canvas.focus({ preventScroll: true });
      return;
    }
    if (target.type === 'city') {
      selectCity(target);
      return;
    }
    surveyMission?.clear();
    discardAnchor();
    mode = 'sky';
    named = target;
    fieldId = null;
    setLens(target.fov);
    aim(target.direction);
    selectedAt = performance.now();
    hud();
    canvas.focus({ preventScroll: true });
  }
  function recommend(snap = false) {
    beginExternalSteering();
    solarControls.ordinary();
    surveyMission?.clear();
    discardAnchor();
    const eye = formation?.getOptics()?.eyeKm || sim.current?.position,
      station = formation?.stationTarget(ASPECT);
    const options = recommended.map((id) => SURVEY_FIELDS.find((f) => f.id === id));
    const qualifies = (f) =>
      !eye ||
      (!earthInFront(eye, f.center) &&
        dot(f.center, unit(eye)) > -0.16 &&
        (!sim.current?.sunDir || dot(sim.current.sunDir, f.center) < 0.8) &&
        (!station ||
          dot(station.direction, f.center) < Math.cos(Math.min(89, station.fov / 2 + 4) * D)));
    const valid = options.filter(qualifies),
      list = valid.length ? valid : options.filter((f) => !eye || !earthInFront(eye, f.center));
    const candidates = list.length ? list : options;
    const chosen =
      candidates[(candidates.findIndex((f) => f.id === fieldId) + 1) % candidates.length];
    mode = 'sky';
    named = null;
    fieldId = chosen.id;
    setLens(DISCOVERY_FOV);
    aim(chosen.center, snap);
    $('xtSearch').value = '';
    hud();
  }
  function selectCity(city) {
    beginExternalSteering();
    saveSky();
    surveyMission?.clear();
    anchor = cityAnchor(city);
    tracked = null;
    releaseNote = '';
    mode = 'city';
    named = null;
    fieldId = null;
    setLens(city.fov);
    desired = null;
    locked = false;
    lastDraw = -Infinity;
    selectedAt = performance.now();
    if (optics && sim.current) {
      tracked = trackGround(
        anchor,
        optics.eyeKm,
        sim.current,
        sim.environment.elevation?.heightAt(anchor.longitude, anchor.latitude) || 0
      );
      if (tracked) desired = groundAttitude(tracked, pose);
    }
    hud();
    canvas.focus({ preventScroll: true });
  }
  function releasePin(note = '') {
    beginExternalSteering();
    discardAnchor();
    releaseNote = note;
    mode = 'free';
    named = null;
    fieldId = null;
    desired = null;
    locked = false;
    rememberFree();
    $('xtSearch').value = '';
    lastDraw = -Infinity;
    hud();
  }
  function capturePin(now) {
    overviewArtworkId = null;
    const station = now && sim.current ? sampleStationPin(sim, now) : null;
    anchor = station
      ? { kind: 'station', point: station, up: cameraAxes(pose).up }
      : now && sim.current
        ? pinCrosshair(
            now.eyeKm,
            now.axes,
            pose,
            sim.current,
            renderer?.groundPick?.(now.eyeKm, now.axes, sim.current)
          )
        : { kind: 'sky', direction: [...actualAxes().forward] };
    mode = { ground: 'ground-pin', sky: 'sky-pin', station: 'station-pin' }[anchor.kind];
    tracked = null;
    releaseNote = '';
    named = null;
    fieldId = null;
    desired = null;
    locked = true;
  }
  function pinHere() {
    if (!sim.current || !optics) return;
    beginExternalSteering();
    const now = formation.update(sim.current, actualAxes());
    if (!now) return;
    saveSky();
    discardAnchor();
    capturePin(now);
    lastDraw = -Infinity;
    $('xtSearch').value = '';
    hud();
  }
  function togglePin() {
    if (mode === 'free') pinHere();
    else releasePin();
  }
  function manual(x, y) {
    beginExternalSteering();
    const keepPinned = mode !== 'free';
    if (!keepPinned && sim.current) updateFree(sim.current);
    discardAnchor();
    named = null;
    fieldId = null;
    desired = null;
    locked = false;
    steerDetector(pose, x, y, roll);
    axes = actualAxes();
    if (formation && sim.current) optics = formation.update(sim.current, axes);
    // Steering changes the fixed point, not the selected tracking behavior.
    // Re-sample after moving so a station edge can become a ground or sky lock.
    if (keepPinned) capturePin(optics);
    else {
      mode = 'free';
      rememberFree();
    }
    $('xtSearch').value = '';
    lastDraw = -Infinity;
    hud();
  }
  const input = mountScopeInput(canvas, {
    nudge: manual,
    zoom: (d) => setLens(fovAtZoom(zoomAtFov(field) + d)),
    roll: (delta) => setRoll(roll + delta),
    field: () => field,
  });
  const search = mountScopeSearch($('xtSearch'), $('xtResults'), {
    choose: selectStar,
    skyCulture: () => sim.environment.settings.skyCulture || 'western',
    cityFinder: cities,
    isBlocked: (d) => earthInFront(optics?.eyeKm || sim.current?.position, d),
    solarVisible: (id) => {
      const b = bodyNow(id);
      return b ? !earthInFront(optics?.eyeKm || sim.current.position, b.direction) : null;
    },
    cityVisible: (city) =>
      sim.current && (optics?.eyeKm || sim.current.position)
        ? trackGround(cityAnchor(city), optics?.eyeKm || sim.current.position, sim.current)?.visible
        : null,
  });
  const solarControls = mountXuntianSolarControls(sim, {
    onFrame: () => observeSolar(),
    invalidate() {
      lastDraw = -Infinity;
      pausedFrame = '';
      if (active) hud();
    },
  });
  function observeSolar({ channel = solarControls.channel } = {}) {
    if (sim.missionId !== 'tiangong') return false;
    open();
    if (!active) return false;
    solarControls.activate(channel);
    if (sim.current) {
      const target = searchSolarTargets('Sun', getLanguage()).find((item) => item.body === 'Sun');
      selectStar(target);
      setLens(0.9);
      $('xtSearch').value = target.name;
    }
    hud();
    canvas.focus({ preventScroll: true });
    return true;
  }
  function observeSkyDetail() {
    if (sim.missionId !== 'tiangong') return false;
    open();
    if (!active) return false;
    const target = skyDetailTarget(sim.environment);
    if (!target) return false;
    sim.environment.settings.skyDetail = true;
    sim.environment.settings.skyDetailSource = 'recent';
    sim.environment.settings.stars = true;
    sim.environment.settings.milky = true;
    for (const id of ['showStars', 'showMilky', 'skyDetailEnabled']) $(id).checked = true;
    for (const id of ['skyDetailSource', 'xtSkyDetailSource']) if ($(id)) $(id).value = 'recent';
    sim.environment.skyDetail.setSource('recent');
    sim.environment.skyDetail.setEnabled(true);
    sim.environment.save();
    sim.environment.setSkyStyle();
    selectStar(target);
    $('xtSearch').value = target.name;
    return true;
  }
  function targetForMode() {
    if (!optics || !sim.current) return null;
    if (mode === 'solar') {
      tracked = bodyNow(named.body);
      return tracked;
    }
    if (anchor?.kind === 'ground') {
      tracked = trackGround(
        anchor,
        optics.eyeKm,
        sim.current,
        sim.environment.elevation?.heightAt(anchor.longitude, anchor.latitude) || 0
      );
      return tracked;
    }
    if (anchor?.kind === 'station') {
      const direction = stationPinDirection(sim, optics, anchor.point);
      if (!direction) {
        releasePin('原站体部件已移除，固定已解除。');
        return null;
      }
      return { direction, up: anchor.up };
    }
    if (mode === 'station') return formation.stationTarget(ASPECT);
    if (mode === 'sunlit') {
      const dir = sunlitGroundDirection(optics.eyeKm, sim.current.sun);
      nightCap = !dir;
      return { direction: dir || groundDirection('nadir', optics.eyeKm, sim.current), fov: 28 };
    }
    if (mode === 'horizon' || mode === 'nadir')
      return {
        direction: groundDirection(mode, optics.eyeKm, sim.current),
        fov: mode === 'horizon' ? 30 : 20,
      };
    return null;
  }
  function observe(key) {
    beginExternalSteering();
    solarControls.ordinary();
    if (!optics) return;
    saveSky();
    surveyMission?.clear();
    discardAnchor();
    mode = key;
    stationRefresh = false;
    const target = targetForMode();
    if (!target) {
      restoreSky();
      return;
    }
    setLens(target.fov);
    aim(target.direction);
    hud();
  }
  function restoreSky() {
    beginExternalSteering();
    solarControls.ordinary();
    discardAnchor();
    if (!bookmark) {
      recommend();
      return;
    }
    mode = 'sky';
    named = bookmark.named;
    fieldId = bookmark.fieldId;
    setLens(bookmark.field);
    desired = bookmark.pose.clone();
    locked = false;
    $('xtSearch').value = named?.name || '';
    hud();
  }
  function crosshairHud() {
    const hit = unavailable ? null : lastResult?.identification,
      kind = hit?.kind || 'unavailable';
    let name = t('等待取景画面'),
      detail = '';
    const angle = (value) =>
      value >= 1 / 60 ? (value * 60).toFixed(1) + '′' : (value * 3600).toFixed(1) + '″';
    if (kind === 'earth') {
      name = t('地表落点');
      detail = hit.latitude.toFixed(4) + '°, ' + hit.longitude.toFixed(4) + '°';
      if (hit.city)
        detail +=
          ' · ' +
          t('距 {city} 市中心 {distance} km', {
            city: hit.city.name,
            distance: hit.city.distanceKm.toFixed(1),
          });
    } else if (kind === 'station') {
      name = t('空间站');
      detail = t('准星落在站体表面');
    } else if (kind === 'star') {
      name = hit.name;
      detail = t('恒星 · {identifier} · 距准星 {angle}', {
        identifier: hit.identifier,
        angle: angle(hit.angularDistanceDeg),
      });
    } else if (kind === 'deep-sky') {
      name = hit.name === hit.identifier ? hit.name : hit.name + ' · ' + hit.identifier;
      detail = hit.regionOnly
        ? t('位于 {name} 天区', { name: hit.name })
        : t('{category}方向 · 距目录中心 {angle}', {
            category: hit.category,
            angle: angle(hit.angularDistanceDeg),
          });
    } else if (kind === 'solar') {
      name = hit.name;
      detail = hit.withinDisc
        ? t('准星落在天体圆面内')
        : t('距准星 {angle}', { angle: angle(hit.angularDistanceDeg) });
    } else if (kind === 'sky') {
      name = t('未匹配到天体');
      detail = skyCoordinates(hit.direction);
    }
    if (hit?.region && kind !== 'deep-sky')
      detail += ' · ' + t('位于 {name} 天区', { name: hit.region.name });
    setText($('xtCrosshairName'), name);
    setText($('xtCrosshairDetail'), detail);
    const distance = crosshairDistanceText(hit, t);
    setText($('xtCrosshairDistance'), distance);
    $('xtCrosshairDistance').hidden = !distance;
    $('xtCrosshairDistance').title =
      hit?.distanceSource === 'hipparcos-2007'
        ? t('Hipparcos 2007 视差估计；视差相对误差不超过 10%。距离不随模拟年份外推。')
        : '';
    $('xtCrosshairReadout').dataset.kind = kind;
    $('xtCrosshairReadout').dataset.target = hit?.id || hit?.city?.id || '';
  }
  function hud() {
    crosshairHud();
    solarControls.render({
      targetingSun: mode === 'solar' && named?.body === 'Sun',
      crosshairSun: lastResult?.identification?.body === 'Sun',
      unavailable,
    });
    const lunarTarget = mode === 'solar' && named?.body === 'Moon';
    const lunarCrosshair = lastResult?.identification?.body === 'Moon';
    $('xtLunarDiscovery').hidden = unavailable || !(lunarTarget || lunarCrosshair);
    $('xtMarsDiscovery').hidden = unavailable || !((mode === 'solar' && named?.body === 'Mars') || lastResult?.identification?.body === 'Mars');
    const sky =
        mode === 'solar' ||
        mode === 'sky' ||
        mode === 'sky-pin' ||
        mode === 'free' ||
        mode === 'pilot',
      center = lastResult?.center,
      city = anchor?.cityId ? cities.get(anchor.cityId, getLanguage()) : null;
    if (active && surveyMission) surveyMission.paint(axes, field, sky, !unavailable && !capturing);
    const targetName =
      (mode === 'solar' ? solarLabel(named.body, getLanguage()) : null) ||
      city?.name ||
      (mode === 'sky'
        ? named?.name ||
          (fieldId ? t(SURVEY_FIELDS.find((f) => f.id === fieldId).name) : t('手动星野'))
        : t(modes[mode]));
    setText($('xtTarget'), targetName);
    $('xtReturn').hidden = mode === 'sky' || mode === 'free';
    $('xtRecommend').hidden = !sky;
    const below = anchor?.kind === 'ground' && tracked?.visible === false;
    const blocked = !!(
      below ||
      (locked &&
        ((sky && ['earth', 'station'].includes(center?.kind)) ||
          (anchor?.kind === 'ground' && center?.kind === 'station')))
    );
    const status = unavailable
      ? t('无轨道位置')
      : mode === 'sunlit' && nightCap
        ? t('当前可见地表均在夜侧')
        : below
          ? t('目标在地平线下')
          : !locked && desired
            ? t('正在转向…')
            : blocked
              ? t(center?.kind === 'earth' || below ? '地球遮挡' : '站体遮挡')
              : anchor
                ? t('固定跟踪中')
                : mode === 'pilot'
                  ? t('导航球操纵')
                  : mode === 'free'
                    ? t('随轨道转动')
                    : locked
                      ? t('已对准')
                      : t('自由指向');
    setText($('xtStatus'), status);
    $('xtStatus').dataset.blocked = String(blocked);
    const tracking = $('xtTrackingInfo'),
      detail =
        anchor?.kind === 'ground'
          ? t('目标 {lat}°, {lon}° · 斜距 {range} km', {
              lat: anchor.latitude.toFixed(3),
              lon: anchor.longitude.toFixed(3),
              range: tracked ? Math.round(tracked.range) : '—',
            })
          : mode === 'solar' && tracked
            ? t('视直径 {diam}″ · 亮面 {lit}%', {
                diam: (((tracked.radiusRad * 2) / D) * 3600).toFixed(1),
                lit: Math.round(tracked.illuminatedFraction * 100),
              })
            : releaseNote
              ? t(releaseNote)
              : '';
    tracking.hidden = !detail;
    setText(tracking, detail);
    const free = mode === 'free',
      pinButton = $('xtPin');
    pinButton.disabled = unavailable && free;
    pinButton.dataset.action = free ? 'pin' : 'free';
    setText(pinButton, t(free ? '固定十字线' : '随轨道转动'));
    $('xtLookBody').hidden = mode !== 'solar';
    $('xtLookBody').disabled = unavailable;
    $('xtPinHere').hidden = free || !!anchor;
    $('xtPinHere').disabled = unavailable;
    $('xtGroundQuick').disabled = unavailable;
    const coords =
      center?.kind === 'earth' && Number.isFinite(center.latitude)
        ? center.latitude.toFixed(2) + '°, ' + center.longitude.toFixed(2) + '°'
        : skyCoordinates(axes.forward);
    const sunAltitude = groundSunAltitude(center, sim.current),
      ground = $('xtIllumination');
    ground.hidden = unavailable || sunAltitude === null;
    if (!ground.hidden) {
      setText(ground, t(sunAltitude >= 0 ? '昼面' : sunAltitude > -6 ? '晨昏' : '夜面'));
      ground.title = t('地表太阳高度 {alt}°', { alt: sunAltitude.toFixed(1) });
    }
    const env = sim.environment,
      source = earthMapSizes(env),
      skySource = xuntianSkySource(env);
    const earth = source.loading
      ? t('地表加载中')
      : source.day === source.night || !source.night
        ? t('地表 {size}', { size: resolutionTag(source.day) })
        : t('昼 {day} / 夜 {night}', {
            day: resolutionTag(source.day),
            night: resolutionTag(source.night),
          });
    let skyTag =
      skySource.status === 'panorama'
        ? t('银河 {size}', {
            size: skySource.level ? skySource.level + 'K' : resolutionTag(skySource.sourceWidth),
          })
        : t(
            {
              loading: '银河加载中',
              failed: '银河底图不可用',
              unsupported: '程序银河',
              ordinary: skySource.presentation === 'photo' ? '摄影弱星空' : '程序银河',
              catalog: '星表',
              off: '星空背景关闭',
            }[skySource.status] || '星表'
          );
    if (skySource.showStars && skySource.gain === 0) skyTag += ' · ' + t('星空亮度为零');
    setText($('xtSkyDetailStatus'), skyDetailText(lastResult?.skyDetail));
    $('xtSkyDetailStatus').hidden = solarControls.enabled;
    if ($('xtSkyDetailControls')) $('xtSkyDetailControls').hidden = solarControls.enabled;
    $('xtSkyDetailInfo').hidden = solarControls.enabled;
    setText($('xtSkyDetailCredits'), skyDetailCredits(lastResult?.skyDetail));
    $('xtCityTerrain').hidden = solarControls.enabled || center?.kind !== 'earth';
    setText($('xtCityStatus'), cityTerrainText(lastResult?.cityTerrain));
    setText(
      $('xtSources'),
      solarControls.enabled
        ? solarControls.canCapture
          ? t('SDO 观测影像 · 当前画面 {width} × {height}', {
              width: canvas.width,
              height: canvas.height,
            })
          : t('SDO 观测影像 · 等待影像')
        : [
            earth,
            skyTag,
            canvas.dataset.xuntianFrame && canvas.dataset.xuntianFrame !== 'error'
              ? canvas.width + ' × ' + canvas.height
              : null,
          ]
            .filter(Boolean)
            .join(' · ')
    );
    const simulationTime = shortClock(sim.time) + ' UTC+8';
    setText(
      $('xtClock'),
      unavailable
        ? ''
        : solarControls.enabled
          ? t('模拟 {time}', { time: simulationTime })
          : simulationTime
    );
    setText(
      $('xtDepth'),
      !solarControls.enabled && !unavailable && Number.isFinite(lastResult?.limitMagnitude)
        ? t('极限 {mag} 等', { mag: lastResult.limitMagnitude.toFixed(1) })
        : ''
    );
    setText($('xtCoordinates'), coords);
    setText(
      $('xtField'),
      t('视场 {fov}°', { fov: field.toFixed(field < 0.1 ? 3 : field < 1 ? 2 : 1) })
    );
    $('xtUnavailable').hidden = !unavailable;
    $('xtCapture').disabled =
      capturing || unavailable || !!surveyMission?.busy || !solarControls.canCapture;
    $('xtCapture').title = solarControls.canCapture
      ? ''
      : t('太阳影像尚未载入，请更新影像或选择普通成像。');
    ocular.dataset.center = unavailable ? '' : center?.kind || '';
    panel.dataset.mode = mode;
    panel.dataset.target = anchor?.cityId || (anchor ? mode : null) || named?.id || fieldId || '';
  }
  function ensureFormation() {
    if (formation) return;
    formation = installXuntianFormation(sim);
    formation.subscribe(({ reason }) => {
      stationRefresh = true;
      lastDraw = -Infinity;
      assemblyRevision++;
      if (reason === 'offset' || reason === 'suggested' || reason === 'clearance') {
        clearTimeout(shadowTimer);
        shadowTimer = setTimeout(() => {
          if (visible(sim)) sim.rebuild({ poseOnly: true });
        }, 120);
      }
      if (active && sim.current) formation.update(sim.current, axes);
    });
  }
  function restoreInitial() {
    solarControls.ordinary();
    surveyMission?.clear();
    discardAnchor();
    input.clear();
    search.close();
    bookmark = null;
    mode = 'free';
    named = null;
    fieldId = null;
    desired = null;
    locked = false;
    $('xtSearch').value = '';
    // In along-track, orbit-normal, radial coordinates, look along +X with +Z up.
    freePose = attitudeQuaternion({ right: [0, -1, 0], up: [0, 0, 1], forward: [1, 0, 0] }, true);
    roll = 0;
    setRoll(0, false);
    formation.restoreInitial();
    lastDraw = -Infinity;
  }
  function open() {
    if (sim.missionId !== 'tiangong') return;
    const query = $('xtSearch').value;
    if (!sim.api.state.showXT) {
      $('showXT').click();
      $('xtSearch').value = query;
      return;
    }
    sim.mainFlight?.selectTarget?.('xuntian');
    if (active) return;
    ensureFormation();
    if (!guide) {
      guide = makeScopeGuide(sim.api.scene, $('xtShowGuide'));
      mountXuntianFormationPanel($('xtFormationPanel'), formation);
    }
    active = true;
    panel.hidden = false;
    document.body.classList.add('xt-scope-open');
    if (
      sim.minimap.visible &&
      matchMedia('(max-width:760px)').matches &&
      !$('orbitMinimap').classList.contains('compact-expanded')
    )
      $('toggleMinimap').click();
    $('openXuntian').setAttribute('aria-expanded', 'true');
    $('openXuntianMap').setAttribute('aria-expanded', 'true');
    lastWall = null;
    lastDraw = -Infinity;
    lastResult = null;
    unavailable = !sim.current;
    sim.mainFlight?.resetTarget?.('xuntian');
    restoreInitial();
    $('xtSearch').value = query;
    search.refreshExamples();
    opened = true;
    completedFrame = '';
    pausedFrame = '';
    delete canvas.dataset.xuntianFrame;
    formation.refresh();
    update(sim.current, performance.now());
    sim.rebuild({ poseOnly: true });
    needsFrame = true;
    hud();
    canvas.focus({ preventScroll: true });
  }
  function close() {
    if (!active) return;
    active = false;
    surveyMission?.clear();
    search.close();
    input.clear();
    guide?.hide();
    panel.hidden = true;
    document.body.classList.remove('xt-scope-open');
    for (const id of ['openXuntian', 'openXuntianMap'])
      $(id).setAttribute('aria-expanded', 'false');
    renderer?.dispose();
    renderer = null;
    lastResult = null;
    needsFrame = false;
    lastWall = null;
    if (location.hash === '#xuntian')
      history.replaceState(null, '', location.pathname + location.search);
  }
  let wasVisible = false;
  function assemblyChanged() {
    const stationMission = sim.missionId === 'tiangong';
    $('openXuntianMap').hidden = !stationMission;
    $('openXuntian').disabled = !stationMission;
    if (!visible(sim)) close();
    if (formation) formation.refresh();
    else if (visible(sim)) ensureFormation();
    const nowVisible = visible(sim);
    if (nowVisible && !wasVisible) {
      restoreInitial();
      opened = true;
    }
    wasVisible = nowVisible;
    if (formation && visible(sim) && sim.current)
      optics = formation.update(sim.current, opened ? axes : undefined);
  }
  function update(q, wall) {
    if (!formation) return;
    if (!visible(sim)) {
      close();
      optics = null;
      return;
    }
    if (!q) {
      formation.update(null);
      optics = null;
      unavailable = true;
      guide?.hide();
      if (active) hud();
      return;
    }
    if (!active && !anchor && mode !== 'free' && mode !== 'pilot') {
      optics = formation.update(q, opened ? axes : undefined);
      return;
    }
    const dt = lastWall === null ? 0 : clamp((wall - lastWall) / 1000, 0, 0.2);
    lastWall = wall;
    if (mode === 'free') updateFree(q);
    if (active) input.step(dt);
    if (mode !== 'sky' && mode !== 'sky-pin' && mode !== 'free' && mode !== 'pilot') {
      // The line of sight to the station depends on where the entrance sits on the turning instrument.
      optics = formation.update(q, axes);
      const target = targetForMode();
      if (target) {
        desired = target.up
          ? groundAttitude(target, pose)
          : lookDirection(target.direction, cameraAxes(pose).up);
        if (mode === 'station' && stationRefresh) setLens(target.fov);
      }
    }
    stationRefresh = false;
    if (desired) {
      pose.rotateTowards(desired, 112 * D * dt);
      locked = pose.angleTo(desired) < 0.002;
      if (locked) {
        pose.copy(desired);
        desired = null;
      }
    }
    axes = actualAxes();
    optics = formation.update(q, axes);
    unavailable = !optics;
    if (!active) return;
    if (needsFrame && optics) {
      needsFrame = false;
      frameExternal('near');
    }
    if ($('xtShowGuide').checked && sim.view !== 'orbit') guide.update(optics, field, ASPECT);
    else guide.hide();
  }
  function frameExternal(which) {
    exterior = which;
    const close = which === 'near';
    $('xtNear').setAttribute('aria-pressed', String(close));
    $('xtFrameBoth').setAttribute('aria-pressed', String(!close));
    if (close) formation?.frameTelescope(panel);
    else formation?.frameBoth(panel);
  }
  const frame = () => ({
    ...solarControls.frame(),
    language: getLanguage(),
    previewNames: $('xtNames').checked,
    photoNames: $('xtPhotoNames').checked,
    chartSettings: normalizeStarChartSettings(sim.environment.settings),
    focusTargetId: named?.id || null,
    overviewArtworkId: mode === 'sky-pin' ? overviewArtworkId : null,
    q: sim.current,
    eyeKm: optics.eyeKm,
    eyeLocal: optics.eyeLocal,
    axes: optics.axes,
    localAxes: optics.localAxes,
    fovY: field,
    apertureMm: aperture,
    exposure: 2 ** ev,
    showGalaxy: sim.environment.settings.milky && sim.environment.settings.stars,
    showStars: sim.environment.settings.stars,
    skyExposure: sim.environment.settings.exposure,
    skyBrightness: sim.environment.settings.starBrightness,
    showStation: true,
    constellationId:
      mode === 'sky' && named?.type === 'constellation' ? named.id.split(':')[1] : null,
    fillLight: $('fillLight').checked,
    aspect: ASPECT,
  });
  function aimTile(target) {
    beginExternalSteering();
    solarControls.ordinary();
    discardAnchor();
    mode = 'sky';
    named = null;
    fieldId = target.fieldId;
    setLens(4.7);
    aim(target.direction);
    selectedAt = performance.now();
    $('xtSearch').value = '';
    hud();
    canvas.focus({ preventScroll: true });
  }
  function openSurveyTile({ fieldId, tile } = {}) {
    if (sim.missionId !== 'tiangong') return false;
    open();
    return active && surveyMission.select(fieldId, tile);
  }
  surveyMission = mountSurveyMission(sim, {
    aimTile,
    clearTarget() {
      hud();
    },
    getFrame: () =>
      active && optics && sim.current ? { ...frame(), constellationId: null } : null,
    instrument() {
      renderer ??= createXuntianViewRenderer(sim, canvas, { cityFinder: cities });
      return { renderer, width: photoWidth };
    },
    refresh: hud,
  });
  $('xtPin').onclick = togglePin;
  $('xtPinHere').onclick = pinHere;
  $('xtGroundQuick').onclick = () => observe('nadir');
  $('xtRoll').oninput = (e) => setRoll(Number(e.target.value));
  $('xtRollReset').onclick = () => setRoll(0);
  $('xtSkyCompass').onchange = () => {
    prefs();
    hud();
  };
  function draw(wall) {
    if (
      !active ||
      document.hidden ||
      !panel.getClientRects().length ||
      !optics ||
      !sim.current ||
      wall - lastDraw < interval
    )
      return;
    lastDraw = wall;
    const completed = canvas.dataset.xuntianFrame;
    if (completed && completed !== 'error' && completed !== completedFrame) {
      stats.frames++;
      completedFrame = completed;
    }
    const f = frame(),
      env = sim.environment,
      u = env.uniforms;
    // At a paused epoch the same photons need no second exposure. Invalidate for
    // pointing, focus, a moving panel, cloud/texture replacement and local illumination.
    const signature =
      sim.paused && sim.mode !== 'real'
        ? [
            sim.current.t,
            f.language,
            f.previewNames,
            JSON.stringify(f.chartSettings),
            f.solarChannel,
            f.solarObservation?.id,
            f.solarRevision,
            assemblyRevision,
            mode,
            f.constellationId,
            f.focusTargetId,
            f.overviewArtworkId,
            field,
            aperture,
            ev,
            canvas.clientWidth,
            devicePixelRatio,
            f.showStars,
            f.skyExposure,
            f.skyBrightness,
            env.skyLoading,
            env.galaxyTexture?.version,
            renderer?.earthAppearanceKey?.(),
            renderer?.solarAppearanceKey?.(),
            renderer?.skyAppearanceKey?.(),
            env.settings.skyDetail,
            ...pose.toArray(),
            ...optics.eyeLocal,
            ...sim.api.model.quaternion.toArray(),
            f.fillLight,
            f.showGalaxy,
            env.galaxyTexture?.id,
            ...['dayMap', 'nightMap', 'cloudMap', 'oceanMap'].map((k) => u[k].value?.id),
            u.cloudAmount.value,
            env.settings.cloudNightVisible,
            ...Object.values(sim.api.rig).flatMap((r) => [
              r.roll?.rotation.x,
              r.left?.rotation.y,
              r.right?.rotation.y,
            ]),
          ].join('|')
        : '';
    if (signature && signature === pausedFrame && completed && completed !== 'error') {
      if (lastResult) lastResult.identification = renderer.identify(f);
      hud();
      return;
    }
    renderer ??= createXuntianViewRenderer(sim, canvas, { cityFinder: cities });
    const start = performance.now(),
      result = renderer.render(f);
    if (result?.available) lastResult = result;
    if (result?.submitted) pausedFrame = signature;
    stats.lastRenderMs = performance.now() - start;
    interval = clamp(74 + stats.lastRenderMs * 2, 80, 205);
    hud();
  }
  async function capture() {
    if (capturing || !optics || !sim.current || !solarControls.canCapture) return;
    // The observation is a real image at its own UTC epoch. Freeze its record
    // across asynchronous photo preparation, independently of simulation time.
    const solarFrame = solarControls.frame();
    capturing = true;
    hud();
    let stamp, subject;
    const atShutter = () => {
      if (!active || !sim.current || !optics) return null;
      stamp = new Date(sim.current.t).toISOString().replace(/[:.]/g, '-');
      subject = (
        anchor?.cityId ||
        (mode === 'solar' ? named.body : mode === 'sky' ? named?.id || fieldId || mode : mode)
      ).replace(/[^a-zA-Z0-9_-]/g, '_');
      return { ...frame(), ...solarFrame, constellationId: null };
    };
    try {
      renderer ??= createXuntianViewRenderer(sim, canvas, { cityFinder: cities });
      const blob = await renderer.capture(atShutter(), { width: photoWidth, atShutter });
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      const observation = solarFrame.solarObservation,
        solarStamp = observation
          ? '_' +
            observation.channel +
            '_obs-' +
            observation.observedAt.replace(/[:.]/g, '-') +
            '_sim-'
          : '_';
      a.download = 'StarOrbit_Xuntian_' + subject + solarStamp + stamp + '.png';
      a.href = url;
      a.click();
      const photoSky = renderer.photoSkyStatus();
      if (photoSky?.requested && !photoSky.complete)
        sim.api.toast(t('部分高清天区尚未就绪，照片已保留可用影像并注明。'));
      const photoCity = renderer.photoCityStatus();
      if (photoCity?.requested && !photoCity.complete)
        sim.api.toast(t('部分城市细节尚未就绪，照片已保留可用底图并注明。'));
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      sim.api.toast(t('巡天照片未能保存：{error}', { error: e.message }));
    } finally {
      capturing = false;
      hud();
    }
  }
  const route = async () => {
    if (location.hash !== '#xuntian') return;
    if (sim.flightLab?.active) sim.flightLab.close();
    if (sim.missionId !== 'tiangong') {
      try {
        await sim.missions.switchTo('tiangong');
      } catch (e) {
        sim.api.toast('切换失败：{error}', { error: e.message });
        return;
      }
    }
    if (location.hash === '#xuntian') open();
  };
  window.addEventListener('hashchange', route);
  $('openXuntian').onclick = open;
  $('openXuntianMap').onclick = () => (active ? close() : open());
  $('xtLookBody').onclick = () => {
    if (mode !== 'solar' || !sim.current) return;
    const overview = sim.view === 'orbit',
      camera = overview ? sim.spaceCamera : sim.api.camera;
    const controls = overview ? sim.orbitControls : sim.api.controls;
    const body = solarApparent(sim.current, sim.spaceCamera.position.toArray()).find(
      (b) => b.id === named.body
    );
    if (!body) return;
    const direction = overview
      ? body.direction
      : sim.current.basis.map((axis) => dot(axis, body.direction));
    const distance = camera.position.distanceTo(controls.target);
    controls.stopMotion();
    controls.target
      .copy(camera.position)
      .addScaledVector(camera.position.clone().fromArray(direction), distance);
    controls.update();
  };
  $('xtInitial').onclick = () => {
    sim.mainFlight?.selectTarget?.('xuntian');
    sim.mainFlight?.resetTarget?.('xuntian');
    restoreInitial();
    canvas.focus({ preventScroll: true });
  };
  $('xtObserveSun').onclick = () => observeSolar();
  $('xtClose').onclick = () => {
    close();
    const button = $('openXuntianMap');
    if (button.offsetWidth) button.focus({ preventScroll: true });
  };
  $('xtExpand').onclick = () => {
    const large = panel.classList.toggle('expanded');
    $('xtExpand').setAttribute('aria-pressed', String(large));
    if (optics) frameExternal(exterior);
    lastDraw = -Infinity;
  };
  $('xtAperture').oninput = (e) => {
    setAperture(25 * 80 ** (Number(e.target.value) / 1000));
    prefs();
  };
  $('xtEV').oninput = (e) => {
    setEV(Number(e.target.value));
    prefs();
  };
  const maxPhoto = sim.api.renderer.capabilities.maxTextureSize;
  for (const option of $('xtPhotoWidth').options) option.disabled = +option.value > maxPhoto;
  photoWidth =
    PHOTO_WIDTHS.includes(photoWidth) && photoWidth <= maxPhoto
      ? photoWidth
      : PHOTO_WIDTHS.filter((w) => w <= maxPhoto).at(-1) || Math.min(maxPhoto, 1440);
  $('xtPhotoWidth').value = String(photoWidth);
  $('xtPhotoWidth').onchange = (e) => {
    const n = Number(e.target.value);
    if (PHOTO_WIDTHS.includes(n) && n <= maxPhoto) {
      photoWidth = n;
      prefs();
    }
  };
  $('xtNames').onchange = () => {
    pausedFrame = '';
    lastDraw = -Infinity;
    prefs();
  };
  $('xtPhotoNames').onchange = prefs;
  $('xtNear').onclick = () => frameExternal('near');
  $('xtFocal').oninput = (e) => setLens(fovAtZoom(Number(e.target.value) / 1000));
  $('xtShowGuide').onchange = prefs;
  $('xtCapture').onclick = capture;
  $('xtRecommend').onclick = () => recommend(false);
  $('xtReturn').onclick = restoreSky;
  panel
    .querySelectorAll('[data-xt-mode]')
    .forEach((b) => (b.onclick = () => observe(b.dataset.xtMode)));
  $('xtFrameBoth').onclick = () => frameExternal('both');
  $('xtMore').addEventListener('toggle', () => {
    if ($('xtMore').open) $('xtMore').scrollIntoView({ block: 'nearest' });
  });
  onLanguageChange(() => {
    if (named?.type === 'solar') {
      named.name = solarLabel(named.body, getLanguage());
      $('xtSearch').value = named.name;
    } else if (named)
      named =
        getXuntianTarget(named.id, getLanguage(), sim.environment.settings.skyCulture) || named;
    if (bookmark?.named)
      bookmark.named =
        getXuntianTarget(bookmark.named.id, getLanguage(), sim.environment.settings.skyCulture) ||
        bookmark.named;
    search.refresh();
    if (active) {
      if (anchor?.cityId)
        $('xtSearch').value = cities.get(anchor.cityId, getLanguage())?.name || '';
      else if (named && mode === 'sky') $('xtSearch').value = named.name;
      hud();
    }
  });
  setLens(field);
  setAperture(aperture);
  setEV(ev);
  setRoll(roll, false);
  assemblyChanged();
  if (formation) sim.rebuild({ poseOnly: true });
  return {
    open,
    close,
    observeBody(body) {
      if (
        sim.missionId !== 'tiangong' ||
        ![
          'Sun',
          'Moon',
          'Mercury',
          'Venus',
          'Mars',
          'Jupiter',
          'Saturn',
          'Uranus',
          'Neptune',
        ].includes(body)
      )
        return false;
      open();
      if (!active || !bodyNow(body)) return false;
      selectStar({
        id: 'solar:' + body,
        body,
        type: 'solar',
        name: solarLabel(body, getLanguage()),
      });
      return mode === 'solar' && named?.body === body;
    },
    observeTarget(target, { annotations = false } = {}) {
      if (sim.missionId !== 'tiangong' || !target?.direction) return false;
      open();
      if (!active) return false;
      if (annotations) {
        $('xtNames').checked = true;
        pausedFrame = '';
        lastDraw = -Infinity;
        prefs();
      }
      selectStar(target);
      return true;
    },
    observeRegion(target) {
      if (sim.missionId !== 'tiangong' || !target?.direction?.every(Number.isFinite)) return false;
      open();
      if (!active) return false;
      beginExternalSteering();
      saveSky();
      solarControls.ordinary();
      surveyMission?.clear();
      discardAnchor();
      mode = 'sky-pin';
      named = null;
      fieldId = null;
      overviewArtworkId = target.artworkId || null;
      anchor = { kind: 'sky', direction: [...target.direction] };
      setLens(target.fov);
      aim(target.direction, true);
      selectedAt = performance.now();
      $('xtNames').checked = true;
      $('xtSearch').value = '';
      pausedFrame = '';
      prefs();
      hud();
      canvas.focus({ preventScroll: true });
      return true;
    },
    onSkyCultureChange() {
      overviewArtworkId = null;
      // A cultural group has no one-to-one counterpart. Preserve the optical
      // ray and physical targets, clear only the old grouping and its bookmark.
      if (named && ['asterism', 'constellation'].includes(named.type)) {
        named = null;
        $('xtSearch').value = '';
      } else if (named && named.type !== 'solar') {
        named =
          getXuntianTarget(named.id, getLanguage(), sim.environment.settings.skyCulture) || named;
        $('xtSearch').value = named.name;
      }
      if (bookmark?.named && ['asterism', 'constellation'].includes(bookmark.named.type))
        bookmark.named = null;
      else if (bookmark?.named && bookmark.named.type !== 'solar')
        bookmark.named =
          getXuntianTarget(bookmark.named.id, getLanguage(), sim.environment.settings.skyCulture) ||
          bookmark.named;
      search.refresh();
      pausedFrame = '';
      lastDraw = -Infinity;
      if (active) hud();
    },
    openSurveyTile,
    observeSolar,
    observeSkyDetail,
    observeCity(city) {
      open();
      if (active) selectCity(city);
    },
    update,
    draw,
    assemblyChanged,
    setPilotAxes,
    clearPilot,
    beginExternalSteering,
    restoreRoute: route,
    get active() {
      return active;
    },
    get formation() {
      return formation;
    },
    get optics() {
      return optics;
    },
    get pointing() {
      return {
        mode,
        target: anchor?.cityId || (anchor ? mode : null) || named?.id || fieldId,
        axes,
        locked,
        field,
        aperture,
        ev,
        roll,
        pinned: anchor?.kind || null,
        ground:
          anchor?.kind === 'ground'
            ? {
                latitude: anchor.latitude,
                longitude: anchor.longitude,
                visible: tracked?.visible ?? null,
              }
            : null,
        selectedAt,
      };
    },
    get result() {
      return lastResult;
    },
    stats,
  };
}
