import { restoreControlFocus } from './display-controls.js';
import { t, getLanguage, onLanguageChange } from './i18n.js';
import { mountPassPanel } from './pass-panel.js';
import { validTime, stateAt } from './orbit.js';
import { mountDockingPanel } from './docking-panel.js';
import { mountExposureLab } from './exposure-lab.js';
import { mountBalconyLab } from './balcony-lab.js';
import { mountSurveyLab } from './survey-lab.js';
import { mountLunarLab } from './lunar-lab.js';
import { mountCosmicLab } from './cosmic-lab.js';
import { getXuntianTarget } from './xuntian-catalog.js';
import { ObservationStore } from './observation-store.js';
import { mountObservationJournal } from './observation-journal.js';

const labTabs = {
  pass: { label: '过境预报', mount: mountPassPanel },
  docking: { label: '交会对接', mount: mountDockingPanel },
  exposure: { label: '轨道长曝光', mount: mountExposureLab },
  balcony: { label: '阳台观测', mount: mountBalconyLab },
  survey: { label: '巡天拍摄计划', mount: mountSurveyLab },
  cosmic: { label: '宇宙探索馆', mount: mountCosmicLab },
  lunar: { label: '月球观测', mount: mountLunarLab },
};
const tabNames = Object.keys(labTabs);

const style = `
.flight-lab{box-sizing:border-box;width:min(1460px,96vw);height:92dvh;max-width:none;max-height:none;padding:0;border:1px solid #355069;border-radius:16px;background:#091321;color:#e7effa;overflow:hidden}
.flight-lab::backdrop{background:#020610ba;backdrop-filter:blur(5px)}
.flight-lab[open]{display:flex;flex-direction:column}.flight-lab *{box-sizing:border-box}
.flight-lab-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border-bottom:1px solid #27374b;flex-shrink:0}
.flight-lab-head h2{margin:0;font-size:17px}.flight-lab-head p{margin:3px 0 0;color:#9eb3c9;font-size:12px;line-height:1.5}
.flight-lab-tabs{display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px;border-bottom:1px solid #27374b;flex-shrink:0}.flight-lab-tabs button{padding:8px 16px}
.flight-lab-tabs button[aria-selected=true]{background:#16475c;border-color:#74d9ef;color:#d6f8ff}
.flight-lab-content{flex:1;min-height:0;overflow:hidden}.flight-panel{height:100%;overflow:auto;padding:12px 16px;overscroll-behavior:contain}.flight-panel[hidden]{display:none!important}
.flight-lab button{touch-action:manipulation}.flight-lab input,.flight-lab select{background:#0e2033;color:#e7effa;border:1px solid #355069;border-radius:6px;padding:7px}
.flight-lab.dock-large{width:98vw;height:96dvh}.flight-lab.dock-large .flight-lab-head p{display:none}.flight-lab.dock-large .flight-lab-head{padding:6px 12px}.flight-lab.dock-large .flight-lab-tabs{padding:5px 12px}.flight-lab.dock-large .flight-panel{padding:8px 12px}
.flight-lab.dock-window-fill{width:100vw;height:100dvh;margin:0;inset:0;border:0;border-radius:0}
.flight-lab input[type=number]{width:100%}.flight-lab button:focus-visible,.flight-lab canvas:focus-visible{outline:2px solid #74d9ef;outline-offset:3px}
@media(max-width:700px){.flight-lab,.flight-lab.dock-large{width:100vw;height:100dvh;border-radius:0;border:0}.flight-lab-head{padding:12px}.flight-lab-head p{max-width:70vw}.flight-lab-tabs{padding:8px 12px}.flight-panel{padding:12px}.flight-lab-tabs button{flex:1;padding:9px 8px}}
@media(max-width:700px){.flight-lab-tabs{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:5px;min-height:52px;scrollbar-width:thin}.flight-lab-tabs button{flex:0 0 auto;max-width:160px;padding:8px 12px;font-size:12px;line-height:1.25}.flight-panel{padding:10px}}
`;

// The modal owns its views and simulation state. The main animation loop skips
// work while open; closing resets wall time so custom playback never catches up.
export function installFlightLab(sim, assets) {
  const store = new ObservationStore();
  sim.observations = store;
  const sheet = document.createElement('style');
  sheet.textContent = style;
  document.head.append(sheet);
  const openButton = document.createElement('button');
  openButton.id = 'openFlightLab';
  openButton.type = 'button';
  document.getElementById('toolbarActions').prepend(openButton);
  const cosmicButton = document.createElement('button');
  cosmicButton.id = 'openCosmicLab';
  cosmicButton.type = 'button';
  document.getElementById('toolbarActions').prepend(cosmicButton);
  const dialog = document.createElement('dialog');
  dialog.id = 'flightLab';
  dialog.className = 'flight-lab';
  dialog.setAttribute('aria-labelledby', 'flightLabTitle');
  dialog.innerHTML = `<div class="flight-lab-head"><div><h2 id="flightLabTitle"></h2></div><button type="button" id="closeFlightLab"></button></div><div class="flight-lab-tabs" role="tablist" aria-labelledby="flightLabTitle"></div><div class="flight-lab-content"></div>`;
  document.body.append(dialog);
  const $ = (id) => dialog.querySelector('#' + id),
    panels = {};
  let activeTab = 'pass',
    visibleKey = null,
    journal = null,
    handoffPending = false,
    openingControl = openButton;
  const bar = dialog.querySelector('.flight-lab-tabs'),
    body = dialog.querySelector('.flight-lab-content');
  for (const [index, key] of tabNames.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = key + 'Tab';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', key + 'Panel');
    bar.append(button);
    const panel = document.createElement('div');
    panel.id = key + 'Panel';
    panel.className = 'flight-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    body.append(panel);
    button.onclick = () => selectFromTabs(key);
    button.onkeydown = (event) => {
      let next;
      switch (event.key) {
        case 'Home':
          next = tabNames[0];
          break;
        case 'End':
          next = tabNames.at(-1);
          break;
        case 'ArrowLeft':
          next = tabNames[(index + tabNames.length - 1) % tabNames.length];
          break;
        case 'ArrowRight':
          next = tabNames[(index + 1) % tabNames.length];
          break;
        default:
          return;
      }
      event.preventDefault();
      selectFromTabs(next);
      $(next + 'Tab').focus();
    };
  }
  const refresh = () => {
    openButton.textContent = t('任务实验室');
    cosmicButton.textContent = t('宇宙探索馆');
    $('flightLabTitle').textContent = t(
      activeTab === 'cosmic' ? '宇宙探索馆' : activeTab === 'lunar' ? '月球观测' : '任务实验室'
    );
    $('closeFlightLab').textContent = t('返回模拟器');
    for (const key of tabNames) $(key + 'Tab').textContent = t(labTabs[key].label);
  };
  function markTabs() {
    $('flightLabTitle').textContent = t(
      activeTab === 'cosmic' ? '宇宙探索馆' : activeTab === 'lunar' ? '月球观测' : '任务实验室'
    );
    journal?.setTab(activeTab);
    for (const key of tabNames) {
      const selected = key === activeTab;
      $(key + 'Panel').hidden = !selected;
      $(key + 'Tab').setAttribute('aria-selected', String(selected));
      $(key + 'Tab').tabIndex = selected ? 0 : -1;
    }
  }
  function selectFromTabs(key) {
    const panel = select(key);
    if (location.hash.startsWith('#lab/')) {
      const target =
        key === 'balcony' ? $('balconyPanel').querySelector('[data-id=dataset]')?.value : '';
      labRoute('#lab/' + key + (target ? '/' + target : ''));
    }
    return panel;
  }
  function suspend() {
    const panel = panels[visibleKey];
    visibleKey = null;
    if (panel?.deactivate) panel.deactivate();
    else panel?.pause?.();
  }
  function select(key) {
    if (!Object.hasOwn(labTabs, key)) return;
    if (visibleKey === key) return panels[key];
    suspend();
    activeTab = key;
    markTabs();
    if (dialog.open) $(key + 'Tab').scrollIntoView({ block: 'nearest', inline: 'center' });
    panels[key] ??= labTabs[key].mount($(key + 'Panel'), sim, assets);
    visibleKey = key;
    panels[key].resume?.();
    return panels[key];
  }
  const close = () => {
    if (!dialog.open) return;
    journal?.close();
    suspend();
    sim.lastWall = performance.now();
    dialog.close();
  };
  const open = (name = activeTab) => {
    if (sim.sceneBusy || sim.missions?.busy) return;
    if (!document.getElementById('helpPanel').hidden) document.getElementById('closeHelp').click();
    if (!dialog.open) dialog.showModal();
    return select(name);
  };
  function labRoute(hash) {
    history.replaceState(null, '', location.pathname + location.search + hash);
  }
  async function observeSurveyTile(target) {
    if (handoffPending || sim.sceneBusy || sim.missions?.busy) return false;
    handoffPending = true;
    try {
      // The teaching epoch belongs to the planner. The live telescope uses the active main clock.
      if (sim.missionId !== 'tiangong') await sim.missions.switchTo('tiangong');
      if (!dialog.open || activeTab !== 'survey') return false;
      close();
      if (!sim.xuntian?.openSurveyTile(target)) {
        open('survey');
        return false;
      }
      labRoute('#xuntian');
      return true;
    } catch (error) {
      open('survey');
      sim.api.toast('切换失败：{error}', { error: t(error.message) });
      return false;
    } finally {
      handoffPending = false;
    }
  }
  async function observeCosmicTarget(id) {
    let closedForHandoff = false;
    if (
      handoffPending ||
      sim.sceneBusy ||
      sim.missions?.busy ||
      !dialog.open ||
      activeTab !== 'cosmic'
    )
      return false;
    handoffPending = true;
    try {
      const target = getXuntianTarget(id, getLanguage(), sim.environment.settings.skyCulture);
      if (!target?.direction) return false;
      if (sim.missionId !== 'tiangong') await sim.missions.switchTo('tiangong');
      if (!dialog.open || activeTab !== 'cosmic') return false;
      closedForHandoff = true;
      close();
      if (!sim.xuntian?.observeTarget(target, { annotations: true })) {
        open('cosmic');
        return false;
      }
      labRoute('#xuntian');
      return true;
    } catch {
      if ((dialog.open || closedForHandoff) && activeTab === 'cosmic') open('cosmic');
      return false;
    } finally {
      handoffPending = false;
    }
  }
  async function observeLunarTarget() {
    if (
      handoffPending ||
      sim.sceneBusy ||
      sim.missions?.busy ||
      !dialog.open ||
      activeTab !== 'lunar'
    )
      return false;
    handoffPending = true;
    let closedForHandoff = false;
    try {
      // Explicitly keeps the main clock: the lunar lab's independent date is not a mission seek.
      if (sim.missionId !== 'tiangong') await sim.missions.switchTo('tiangong');
      if (!dialog.open || activeTab !== 'lunar') return false;
      closedForHandoff = true;
      close();
      if (!sim.xuntian?.observeBody('Moon')) {
        open('lunar');
        return false;
      }
      labRoute('#xuntian');
      return true;
    } catch {
      if ((dialog.open || closedForHandoff) && activeTab === 'lunar') open('lunar');
      return false;
    } finally {
      handoffPending = false;
    }
  }
  function openSurveyPhotos({ fieldId, recordId } = {}) {
    const panel = open('survey');
    if (!panel) return;
    labRoute('#lab/survey');
    panel.showLivePhotos(fieldId, recordId);
  }
  async function openGroundCapture(payload) {
    if (payload?.missionId !== 'tiangong' || !payload.observer) return false;
    const panel = open('exposure');
    if (!panel) return false;
    labRoute('#lab/exposure');
    try {
      return await panel.openGroundCapture(payload);
    } catch (error) {
      sim.api.toast('切换失败：{error}', { error: t(error.message) });
      return false;
    }
  }
  async function restoreRecord(record, media) {
    if (record.kind === 'survey-photo') {
      openSurveyPhotos({ fieldId: record.fieldId, recordId: record.id });
      return;
    }
    const panel = open(record.kind);
    if (!panel?.restoreObservationRecord) throw Error('此观测类型暂不能重开');
    await panel.restoreObservationRecord(record, media);
  }
  journal = mountObservationJournal(dialog, store, {
    getRecipe: () => panels[activeTab]?.getObservationRecord?.(),
    restore: restoreRecord,
    onShow: suspend,
    onHide: () => {
      if (dialog.open) select(activeTab);
    },
  });
  openButton.onclick = () => {
    openingControl = openButton;
    open();
  };
  cosmicButton.onclick = () => {
    openingControl = cosmicButton;
    open('cosmic');
  };
  const lunarEntries = ['openLunarLab', 'xtLunarLab', 'xtLunarExplore']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  for (const entry of lunarEntries)
    entry.onclick = () => {
      openingControl = entry;
      open('lunar');
    };
  $('closeFlightLab').onclick = close;
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    suspend();
    sim.lastWall = performance.now();
    if (!sim.xuntian?.active) restoreControlFocus(openingControl);
  });
  const unsubscribe = onLanguageChange(refresh);
  refresh();
  markTabs();
  const openLinkedExperiment = () => {
    const match = /^#lab\/([a-z]+)(?:\/([a-zA-Z0-9_-]+))?$/.exec(location.hash);
    if (!match || !Object.hasOwn(labTabs, match[1])) return;
    const [, key, id] = match,
      panel = open(key);
    if (key === 'balcony' && id && panel?.selectTarget)
      Promise.resolve(panel.selectTarget(id)).catch((error) =>
        sim.api.toast('切换失败：{error}', { error: t(error.message) })
      );
    $(key + 'Tab').focus();
  };
  const lab = {
    get active() {
      return dialog.open;
    },
    get panels() {
      return panels;
    },
    get tab() {
      return activeTab;
    },
    open,
    close,
    observeSurveyTile,
    observeCosmicTarget,
    observeLunarTarget,
    openSurveyPhotos,
    openGroundCapture,
    saveObservation: (record, media) => store.save(record, media),
    openBalcony(payload) {
      const panel = open('balcony');
      if (panel) {
        $('balconyTab').focus();
        return panel.openPass(payload);
      }
    },
    previewPass(time) {
      if (!validTime(time) || !stateAt(sim.data, time)) {
        sim.api.toast('轨道演算不可用');
        return;
      }
      close();
      sim.seek(time);
      sim.update(performance.now());
      sim.setView('orbit');
      sim.sessionMemory?.save();
    },
    dispose() {
      window.removeEventListener('hashchange', openLinkedExperiment);
      suspend();
      for (const p of Object.values(panels)) p.dispose?.();
      unsubscribe();
      journal.dispose();
      store.dispose();
      dialog.remove();
      openButton.remove();
      cosmicButton.remove();
      for (const entry of lunarEntries) entry.onclick = null;
      sheet.remove();
    },
  };
  sim.flightLab = lab;
  window.addEventListener('hashchange', openLinkedExperiment);
  openLinkedExperiment();
  return lab;
}
