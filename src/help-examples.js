import { cameraState, restoreCamera } from './scene-share.js';
import { setText } from './i18n.js';

const EXAMPLE_TIME = Date.parse('2026-11-05T13:44:00+08:00');
let simulation, original;
let pending = Promise.resolve();
const byId = (id) => document.getElementById(id);

export function installHelpExamples(sim) {
  simulation = sim;
}

export const hasHelpExample = () => !!original;

// Only the demonstration uses a clear sky and the bundled city imagery.
function setAppearance(env, { clouds, stars, cityTerrain, starBrightness }) {
  Object.assign(env.settings, { clouds, stars, cityTerrain, starBrightness });
  byId('showClouds').checked = clouds;
  byId('showStars').checked = stars;
  byId('starBrightness').value = starBrightness;
  if (byId('cityTerrainEnabled')) byId('cityTerrainEnabled').checked = cityTerrain;
  env.cityTerrain.setEnabled(cityTerrain);
  env.setSkyStyle();
}

function checkpoint(sim) {
  const { api, missions, environment, mainFlight } = sim;
  const moon = environment.moon.savedView;
  const beijingHidden = environment.cityTerrain.disabled.has('beijing');
  const { clouds, stars, cityTerrain, starBrightness } = environment.settings;
  const missionId = sim.missionId,
    data = sim.data,
    view = sim.view;
  const clock = { mode: sim.mode, paused: sim.paused, speed: sim.speed, time: sim.time };
  const showXT = api.state.showXT,
    auto = sim.auto,
    playing = api.isAnimating();
  const angles = structuredClone(api.state.angles),
    focus = sim.cameraFocus.selected;
  const cameras = [
    cameraState(api.camera, api.controls),
    cameraState(sim.spaceCamera, sim.orbitControls),
  ];
  const mapExpanded = byId('orbitMinimap').classList.contains('compact-expanded');
  const route = location.hash;
  const scope = sim.xuntian.checkpoint();
  const restorePilot = mainFlight.checkpoint();
  return async () => {
    if (beijingHidden) environment.cityTerrain.disabled.add('beijing');
    setAppearance(environment, { clouds, stars, cityTerrain, starBrightness });
    if (missionId !== sim.missionId) await missions.switchTo(missionId, { restoring: true });
    if (sim.data !== data) sim.setOrbit(data);
    sim.seek(clock.mode === 'real' ? Date.now() : clock.time);
    if (api.state.showXT !== showXT) byId('showXT').click();
    Object.assign(sim, { auto, paused: clock.paused, speed: clock.speed, mode: clock.mode });
    byId('autoTrack').checked = auto;
    api.state.angles = angles;
    api.setAnimating(playing);
    sim.lastWall = performance.now();
    sim.update(sim.lastWall);
    scope();
    restorePilot();
    environment.moon.savedView = moon;
    setText('lookMoon', moon ? '返回航天器' : '望向月球');
    sim.setView(view);
    sim.cameraFocus.restore(focus);
    restoreCamera(api.camera, api.controls, cameras[0]);
    restoreCamera(sim.spaceCamera, sim.orbitControls, cameras[1]);
    sim.cameraFocus.resetAnchor();
    if (mapExpanded !== byId('orbitMinimap').classList.contains('compact-expanded'))
      byId('toggleMinimap').click();
    if (route === '#xuntian' && !location.hash) history.replaceState(null, '', route);
    sim.timeUI();
    sim.controlUI();
    api.syncControls();
  };
}

// Serialize the two target buttons and the return action, including a return pressed
// while an imported mission is still switching to the built-in station.
function enqueue(fn) {
  const result = pending.then(fn);
  pending = result.catch(() => {});
  return result;
}

async function restore() {
  if (!original) return;
  await original();
  original = null;
  simulation.helpExampleActive = false;
  simulation.sessionMemory.save();
}

export function restoreHelpExample() {
  return enqueue(restore);
}

export function runHelpExample(target) {
  return enqueue(async () => {
    const sim = simulation;
    if (!['vega', 'beijing'].includes(target)) throw Error('目标不可用');
    if (!original) {
      if (sim.sceneBusy || sim.missions.busy) throw Error('正在恢复场景…');
      sim.sessionMemory.save();
      sim.helpExampleActive = true;
      try {
        original = checkpoint(sim);
      } catch (e) {
        sim.helpExampleActive = false;
        throw e;
      }
    }
    try {
      if (sim.missionId !== 'tiangong')
        await sim.missions.switchTo('tiangong', { restoring: true });
      // The fixed examples use the bundled station ephemeris, even with an imported orbit active.
      sim.setOrbit(sim.bundledOrbit);
      sim.seek(EXAMPLE_TIME);
      sim.environment.cityTerrain.disabled.delete('beijing');
      setAppearance(sim.environment, {
        clouds: false,
        stars: true,
        cityTerrain: true,
        starBrightness: 1,
      });
      sim.api.stopAnimation();
      sim.update(performance.now());
      if (!sim.xuntian.showHelpTarget(target)) throw Error('目标不可用');
    } catch (e) {
      await restore();
      throw e;
    }
  });
}
