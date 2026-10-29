import {restoreControlFocus} from './display-controls.js';
import {t,onLanguageChange} from './i18n.js';
import {mountPassPanel} from './pass-panel.js';
import {mountDockingPanel} from './docking-panel.js';

const style=`
.flight-lab{box-sizing:border-box;width:min(1460px,96vw);height:92dvh;max-width:none;max-height:none;padding:0;border:1px solid #355069;border-radius:16px;background:#091321;color:#e7effa;overflow:hidden}
.flight-lab::backdrop{background:#020610ba;backdrop-filter:blur(5px)}
.flight-lab[open]{display:flex;flex-direction:column}.flight-lab *{box-sizing:border-box}
.flight-lab-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border-bottom:1px solid #27374b;flex-shrink:0}
.flight-lab-head h2{margin:0;font-size:17px}.flight-lab-head p{margin:3px 0 0;color:#9eb3c9;font-size:12px;line-height:1.5}
.flight-lab-tabs{display:flex;gap:8px;padding:8px 16px;border-bottom:1px solid #27374b;flex-shrink:0}.flight-lab-tabs button{padding:8px 16px}
.flight-lab-tabs button[aria-selected=true]{background:#16475c;border-color:#74d9ef;color:#d6f8ff}
.flight-lab-content{flex:1;min-height:0;overflow:hidden}.flight-panel{height:100%;overflow:auto;padding:12px 16px;overscroll-behavior:contain}.flight-panel[hidden]{display:none!important}
.flight-lab button{touch-action:manipulation}.flight-lab input,.flight-lab select{background:#0e2033;color:#e7effa;border:1px solid #355069;border-radius:6px;padding:7px}
.flight-lab.dock-large{width:98vw;height:96dvh}.flight-lab.dock-large .flight-lab-head p{display:none}.flight-lab.dock-large .flight-lab-head{padding:6px 12px}.flight-lab.dock-large .flight-lab-tabs{padding:5px 12px}.flight-lab.dock-large .flight-panel{padding:8px 12px}
.flight-lab.dock-window-fill{width:100vw;height:100dvh;margin:0;inset:0;border:0;border-radius:0}
.flight-lab input[type=number]{width:100%}.flight-lab button:focus-visible,.flight-lab canvas:focus-visible{outline:2px solid #74d9ef;outline-offset:3px}
@media(max-width:700px){.flight-lab,.flight-lab.dock-large{width:100vw;height:100dvh;border-radius:0;border:0}.flight-lab-head{padding:12px}.flight-lab-head p{max-width:70vw}.flight-lab-tabs{padding:8px 12px}.flight-panel{padding:12px}.flight-lab-tabs button{flex:1;padding:9px 8px}}
`;

// The modal owns its views and simulation state. The main animation loop skips
// work while open; closing resets wall time so custom playback never catches up.
export function installFlightLab(sim,assets){
 const sheet=document.createElement('style');sheet.textContent=style;document.head.append(sheet);
 const openButton=document.createElement('button');openButton.id='openFlightLab';openButton.type='button';document.getElementById('toolbarActions').prepend(openButton);
 const dialog=document.createElement('dialog');dialog.id='flightLab';dialog.className='flight-lab';dialog.setAttribute('aria-labelledby','flightLabTitle');
 dialog.innerHTML=`<div class="flight-lab-head"><div><h2 id="flightLabTitle"></h2><p id="flightLabDescription"></p></div><button type="button" id="closeFlightLab"></button></div><div class="flight-lab-tabs" role="tablist"><button id="passTab" type="button" role="tab" aria-controls="passPanel" aria-selected="true"></button><button id="dockingTab" type="button" role="tab" aria-controls="dockingPanel" aria-selected="false" tabindex="-1"></button></div><div class="flight-lab-content"><div id="passPanel" class="flight-panel" role="tabpanel" aria-labelledby="passTab"></div><div id="dockingPanel" class="flight-panel" role="tabpanel" aria-labelledby="dockingTab" hidden></div></div>`;
 document.body.append(dialog);
 const $=id=>dialog.querySelector('#'+id),panels={},tabs=['pass','docking'];let activeTab='pass';
 const refresh=()=>{
  openButton.textContent=t('任务实验室');$('flightLabTitle').textContent=t('任务实验室');$('flightLabDescription').textContent=t('规划一次过境，或练习近距离交会与对接。');
  $('passTab').textContent=t('过境预报');$('dockingTab').textContent=t('交会对接');$('closeFlightLab').textContent=t('返回模拟器');
 };
 const select=name=>{
  if(!tabs.includes(name))return;
  if(activeTab!==name)panels[activeTab]?.deactivate?.();
  panels[activeTab]?.pause?.();activeTab=name;
  for(const key of tabs){$(key+'Panel').hidden=key!==name;$(key+'Tab').setAttribute('aria-selected',String(key===name));$(key+'Tab').tabIndex=key===name?0:-1;}
  if(!panels[name])panels[name]=name==='pass'?mountPassPanel($('passPanel'),sim):mountDockingPanel($('dockingPanel'),sim,assets);
  panels[name]?.resume?.();
 };
 const close=()=>{panels[activeTab]?.pause?.();dialog.close();};
 const open=(name=activeTab)=>{if(sim.sceneBusy||sim.missions?.busy)return;if(!document.getElementById('helpPanel').hidden)document.getElementById('closeHelp').click();if(!dialog.open)dialog.showModal();select(name);};
 openButton.onclick=()=>open();
 $('closeFlightLab').onclick=close;
 dialog.addEventListener('keydown',event=>event.stopPropagation());
 dialog.addEventListener('close',()=>{for(const panel of Object.values(panels)){panel.pause?.();panel.deactivate?.();}sim.lastWall=performance.now();restoreControlFocus(openButton);});
 for(const name of tabs){$(name+'Tab').onclick=()=>select(name);$(name+'Tab').onkeydown=event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
  const next=event.key==='Home'?'pass':event.key==='End'?'docking':name==='pass'?'docking':'pass';select(next);$(next+'Tab').focus();
 };}
 const unsubscribe=onLanguageChange(refresh);refresh();
 const lab={get active(){return dialog.open;},get panels(){return panels;},get tab(){return activeTab;},
  open,close,
  previewPass(time){if(!Number.isFinite(time)||!sim.data||time<sim.start||time>sim.end){sim.api.toast('当前三维星历未覆盖此时刻，可查看天空轨迹图。');return;}close();sim.seek(time);sim.update(performance.now());sim.setView('orbit');sim.sessionMemory?.save();},
  dispose(){for(const p of Object.values(panels))p.dispose?.();unsubscribe();dialog.remove();openButton.remove();sheet.remove();}
 };
 sim.flightLab=lab;return lab;
}
