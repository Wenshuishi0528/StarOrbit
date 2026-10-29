import {restoreControlFocus} from './display-controls.js';
import {t,errorText,onLanguageChange} from './i18n.js';
import {WEB_BUILD} from './runtime-assets.js';
import {clockText} from './time-format.js';
import {mission} from './missions.js';
import {orbitSource} from './orbit-repository.js';

const css=`
.resource-dialog{box-sizing:border-box;width:min(1100px,95vw);height:min(900px,92dvh);max-width:none;max-height:none;padding:0;border:1px solid #355069;border-radius:16px;background:#091321;color:#e7effa;overflow:hidden}.resource-dialog::backdrop{background:#020610b8;backdrop-filter:blur(4px)}.resource-dialog[open]{display:flex;flex-direction:column}.resource-dialog [hidden]{display:none!important}.resource-dialog .resource-header{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:18px 22px;border-bottom:1px solid #27374b;flex-shrink:0}.resource-dialog .resource-header h2{font-size:19px;margin:0 0 7px}.resource-dialog .resource-header p{margin:0;max-width:740px;line-height:1.6;color:#9eb3c9;font-size:12px}.resource-dialog .resource-close{flex-shrink:0}.resource-dialog .resource-body{padding:18px 22px;overflow:auto;min-height:0}.resource-dialog .resource-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px}.resource-dialog .resource-actions button{flex:initial;min-height:38px;font-size:13px}.resource-dialog button,.resource-dialog input,.resource-dialog select{font:inherit;touch-action:manipulation}.resource-dialog button{font-size:12px;padding:8px 11px}.resource-dialog button:focus-visible,.resource-dialog select:focus-visible,.resource-dialog input:focus-visible{outline:2px solid #74d9ef;outline-offset:3px}.resource-dialog .resource-feedback{white-space:pre-line;color:#ffbdac;line-height:1.6;font-size:12px}.resource-dialog .resource-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.resource-dialog .resource-card{padding:15px;background:#0f2032;border:1px solid #2c435a;border-radius:11px;min-width:0;display:flex;flex-direction:column;gap:10px;scroll-margin-top:12px}.resource-dialog .resource-card-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.resource-dialog .resource-card h3{font-size:15px;margin:0}.resource-dialog .resource-badge{display:inline-block;max-width:64%;font-size:11px;line-height:1.4;padding:4px 7px;border-radius:6px;background:#23394c;color:#bdcedb;text-align:right}.resource-dialog .resource-badge[data-phase=updated],.resource-dialog .resource-badge[data-phase=unchanged]{background:#153d3d;color:#a1e6d8}.resource-dialog .resource-badge[data-phase=error]{background:#4c292b;color:#ffbfb4}.resource-dialog .resource-badge[data-phase=partial]{background:#493c24;color:#f1d397}.resource-dialog .resource-badge[data-phase=checking],.resource-dialog .resource-badge[data-phase=downloading],.resource-dialog .resource-badge[data-phase=processing]{background:#16465c;color:#9be8f2}.resource-dialog .resource-source{display:flex;flex-direction:column;gap:6px;color:#a9bed1;font-size:12px}.resource-dialog .resource-source select{width:100%;min-width:0;max-width:none;background:#102b3d}.resource-dialog .resource-fact{margin:0;padding-top:9px;border-top:1px solid #263d51;line-height:1.55}.resource-dialog .resource-fact dt{font-size:11px;color:#89a4ba;margin-bottom:4px}.resource-dialog .resource-fact dd{margin:0;font-size:12px;white-space:pre-line;overflow-wrap:anywhere;color:#d6e6f2}.resource-dialog .resource-fact.resource-current dd{color:#a2e7ed}.resource-dialog .resource-message{white-space:pre-line;font-size:12px;line-height:1.6;color:#b4ccdf;overflow-wrap:anywhere;min-height:1.6em;margin:0}.resource-dialog .resource-progress{width:100%;height:5px;accent-color:#74d9ef;margin:0}.resource-dialog .resource-hint{color:#9bb1c5;font-size:11px;line-height:1.65;margin:0;overflow-wrap:anywhere}.resource-dialog .resource-card-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:0;padding-top:6px}.resource-dialog .resource-card-actions button:last-child:nth-child(3){grid-column:1/-1}.resource-dialog .resource-card-actions button{width:100%}.resource-dialog .resource-card-actions .resource-use{background:#173d47;border-color:#38646d}.resource-dialog .resource-bundled{margin:15px 0 18px;padding:14px 16px;border:1px solid #2c435a;border-radius:10px;background:#102030;display:flex;align-items:flex-start;gap:15px}.resource-dialog .resource-bundled h3{font-size:13px;margin:0;min-width:115px}.resource-dialog .resource-bundled p{font-size:12px;line-height:1.7;color:#a9bed1;margin:0}.resource-dialog .resource-section-title{font-size:15px;margin:20px 0 12px}.resource-dialog .resource-legacy{padding:0 16px 15px;border:1px solid #2c435a;border-radius:10px;background:#0d1c2d}.resource-dialog .resource-legacy>.small{font-size:12px}.resource-dialog .resource-legacy>.row{justify-content:flex-start;gap:14px}.resource-dialog .resource-legacy input[type=number]{width:100px;padding:7px;font-size:13px}.resource-dialog .resource-legacy>.check{margin-bottom:7px}.resource-dialog .resource-cache-note{font-size:12px;color:#9fb5c7;line-height:1.7;margin:8px 0}.resource-dialog .resource-cache-result{font-size:12px;color:#9ddccf;line-height:1.6;white-space:pre-line}.resource-dialog .resource-server-cache{color:#9eb3c9}.resource-dialog .resource-log{margin:0 0 14px}.resource-dialog .resource-log summary{font-size:12px;color:#9eb3c9}.resource-dialog .resource-log #dataUpdates{padding:0 10px 10px}.resource-dialog #weatherHistory{max-height:470px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.resource-dialog .snapshot-card{min-width:0;border:1px solid #2a4157;border-radius:9px;padding:10px}.resource-dialog .snapshot-card p{font-size:11px}.resource-dialog .snapshot-card img{max-height:145px;object-fit:contain;background:#08121f}.resource-dialog .snapshot-card .angle-actions{flex-wrap:wrap}.resource-dialog .snapshot-card button{font-size:11px}.resource-dialog #importSnapshot{display:block;max-width:100%;margin:10px 0 14px;font-size:12px}.resource-sidebar-summary{white-space:pre-line}.resource-sidebar-open{width:100%;margin-top:10px}
@media(max-width:820px){.resource-dialog .resource-grid{grid-template-columns:1fr}.resource-dialog .resource-card{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:16px}.resource-dialog .resource-card-heading,.resource-dialog .resource-source,.resource-dialog .resource-message,.resource-dialog .resource-progress,.resource-dialog .resource-hint{grid-column:1/-1}.resource-dialog .resource-card-actions{grid-column:1/-1;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:0}.resource-dialog .resource-card-actions button:last-child:nth-child(3){grid-column:1/-1}.resource-dialog .resource-bundled{display:block}.resource-dialog .resource-bundled h3{margin-bottom:7px}}
@media(max-width:560px){.resource-dialog{width:100vw;height:100dvh;border-radius:0;border:0}.resource-dialog .resource-header{padding:14px 13px;gap:10px}.resource-dialog .resource-header h2{font-size:17px}.resource-dialog .resource-header p{font-size:11px}.resource-dialog .resource-close{padding:7px 9px;font-size:11px}.resource-dialog .resource-body{padding:13px}.resource-dialog .resource-actions button{font-size:12px;flex:1}.resource-dialog .resource-card{padding:13px;column-gap:12px}.resource-dialog .resource-card-actions{grid-template-columns:1fr}.resource-dialog .resource-card-actions button:last-child:nth-child(3){grid-column:auto}.resource-dialog .resource-legacy{padding:0 12px 12px}.resource-dialog #weatherHistory{grid-template-columns:1fr}.resource-dialog .resource-bundled{padding:12px}.resource-dialog .resource-badge{max-width:60%}}
`;
const node=(tag,className,parent)=>{const element=document.createElement(tag);if(className)element.className=className;parent?.append(element);return element;};
const providerName=provider=>provider==='satcorps'?'NASA SATCORPS':'Live Cloud Maps · GitHub';
const timestamp=value=>Number.isFinite(value)?clockText(value)+' UTC+8':null;
const megabytes=value=>(Math.max(0,Number(value)||0)/1048576).toFixed(1);
const phaseKeys={idle:'尚未检查',checking:'正在检查…',downloading:'正在下载…',processing:'正在处理…',unchanged:'未发现更新',updated:'新版本已下载',partial:'检查不完整',error:'更新失败'};

// Resource actions and the renderer share Weather's state. This view never
// downloads, decodes images or rebuilds the download-history list during render.
export function mountResourcePanel(weather){
 const w=weather,sim=w.sim,side=document.getElementById('settings-data'),previous=[...side.childNodes];
 const sheet=node('style','',document.head);sheet.textContent=css;
 const dialog=node('dialog','resource-dialog',document.body);dialog.id='resourceDialog';dialog.setAttribute('aria-labelledby','resourceTitle');
 const header=node('div','resource-header',dialog),heading=node('div','',header),title=node('h2','',heading);title.id='resourceTitle';
 const intro=previous.find(element=>element.nodeType===1&&element.tagName==='P');if(intro)heading.append(intro);
 const closeButton=node('button','resource-close',header);closeButton.type='button';closeButton.id='closeResources';
 const body=node('div','resource-body',dialog),actions=document.getElementById('updateEnvironment').parentElement;actions.classList.add('resource-actions');body.append(actions);
 const feedback=node('p','resource-feedback',body);feedback.setAttribute('role','status');feedback.hidden=true;let feedbackMessage='';
 const log=node('details','resource-log',body),logTitle=node('summary','',log);log.append(document.getElementById('lastDataCheck'),document.getElementById('dataUpdates'));
 const grid=node('div','resource-grid',body),cards={};
 const createCard=kind=>{
  const card=node('article','resource-card',grid);card.dataset.resource=kind;
  const head=node('div','resource-card-heading',card),name=node('h3','',head),badge=node('span','resource-badge',head);
  const source=node('label','resource-source',card),sourceLabel=node('span','',source),sourceValue=kind==='cloud'?node('select','',source):node('strong','',source);
  if(kind==='cloud'){sourceValue.id='resourceCloudProvider';for(const provider of ['satcorps','github']){const option=node('option','',sourceValue);option.value=provider;option.textContent=providerName(provider);}}
  const fact=className=>{const wrap=node('dl','resource-fact '+className,card);return {label:node('dt','',wrap),value:node('dd','',wrap)};};
  const available=fact(''),current=fact('resource-current'),checked=fact('');
  const progress=node('progress','resource-progress',card);progress.hidden=true;progress.setAttribute('aria-hidden','true');
  const message=node('p','resource-message',card);message.setAttribute('role','status');
  const hint=node('p','resource-hint',card),buttons=node('div','resource-card-actions',card),check=node('button','primary',buttons),use=node('button','resource-use',buttons);
  check.type=use.type='button';check.dataset.resourceAction='check';use.dataset.resourceAction='use';
  let importButton;if(kind==='orbit'){importButton=node('button','',buttons);importButton.type='button';importButton.onclick=()=>document.getElementById('importOrbit').click();}
  card.insertBefore(buttons,available.label.parentElement);
  const api={card,name,badge,sourceLabel,sourceValue,available,current,checked,progress,message,hint,check,use,importButton};cards[kind]=api;
  const run=async action=>{feedback.hidden=true;try{await action();}catch(error){feedbackMessage=error.message||'更新失败';feedback.hidden=false;}finally{render();}};
  check.onclick=()=>run(()=>w.updateResource(kind,{provider:kind==='cloud'?w.settings.cloudDownloadProvider:undefined}));
  use.onclick=()=>run(()=>w.useLatest(kind,kind==='cloud'?w.settings.cloudDownloadProvider:undefined));
  if(kind==='cloud')sourceValue.onchange=()=>{w.settings.cloudDownloadProvider=sourceValue.value;w.save();feedback.hidden=true;render();};
  return api;
 };
 for(const kind of ['cloud','aurora','orbit'])createCard(kind);
 const bundled=node('div','resource-bundled',body),bundledTitle=node('h3','',bundled),bundledText=node('p','',bundled);
 const cacheTitle=node('h3','resource-section-title',body),legacy=node('div','resource-legacy',body);
 for(const element of previous)if(element.parentNode===side)legacy.append(element);
 const cacheNote=node('p','resource-cache-note'),cacheResult=node('p','resource-cache-result'),serverCache=node('p','resource-cache-result resource-server-cache');
 const history=legacy.querySelector('[data-memory-key="downloads"]');legacy.insertBefore(cacheNote,history);legacy.insertBefore(cacheResult,history);legacy.insertBefore(serverCache,history);
 side.replaceChildren();const entry=node('button','resource-sidebar-open primary',side);entry.type='button';entry.id='openResources';const summary=node('p','small resource-sidebar-summary',side);summary.id='resourceSummary';
 const toolbar=node('button','');toolbar.type='button';toolbar.id='openDataResources';document.getElementById('toolbarActions').prepend(toolbar);
 let disposed=false,returnFocus=null;
 const describeRecord=(record,kind)=>{
  if(!record)return t('尚未下载');
  const time=timestamp(record.time),downloaded=timestamp(record.downloaded),lines=[];
  if(kind==='cloud')lines.push(providerName(record.provider));
  lines.push(time||t('来源未提供观测时间'));
  if(record.resolution)lines.push(record.resolution);
  lines.push(t('{size} MB',{size:megabytes(record.size)}));
  if(!time&&downloaded)lines.push(t('下载于 {time}',{time:downloaded}));
  return lines.join('\n');
 };
 const appliedRecord=kind=>w.items.find(record=>record.id===w.active[kind]);
 const currentText=kind=>{
  const record=appliedRecord(kind);if(record)return describeRecord(record,kind);
  if(kind==='orbit'){
   if(!sim.data?.rows?.length)return t('未配置轨道');
   return t(sim.data.source||'当前轨道数据')+'\n'+t('有效区间')+'：\n'+timestamp(sim.data.rows[0][0])+'\n— '+timestamp(sim.data.rows.at(-1)[0]);
  }
  return t(w.settings[kind]==='local'?'本地生成':w.settings[kind]==='off'?'已关闭':kind==='cloud'?'内置静态云图':'尚未使用下载数据');
 };
 const usingLatest=(kind,provider,latest)=>{
  if(!latest||w.active[kind]!==latest.id)return false;
  return kind==='orbit'||w.settings[kind]===(kind==='cloud'&&provider==='satcorps'?'satcorps':'latest');
 };
 function render(){
  if(disposed)return;if(w.busy)feedback.hidden=true;if(!feedback.hidden)feedback.textContent=errorText(feedbackMessage);
  title.textContent=t('数据与资源');toolbar.textContent=t('数据与资源');entry.textContent=t('打开数据与资源');closeButton.textContent=t('返回模拟器');
  logTitle.textContent=t('更新记录');cacheTitle.textContent=t('下载缓存与历史');bundledTitle.textContent=t('随软件提供的资源');
  bundledText.textContent=t('地球地表与夜景、星空、月面和地理标识随软件版本提供，按画质与视野载入。检查数据更新不会重新下载这些素材。');
  cacheNote.textContent=t('开启后，超过容量时自动删除最早下载的安全旧版本，保留正在使用、已收藏和被设置引用的数据。关闭后不再按容量自动清理。');
  const sceneBusy=!!(sim.sceneBusy||sim.missions?.busy),provider=w.settings.cloudDownloadProvider==='satcorps'?'satcorps':'github';
  cards.cloud.sourceValue.value=provider;
  for(const [kind,card]of Object.entries(cards)){
   const source=kind==='cloud'?provider:undefined,state=w.resourceState(kind,source)||{},updating=w.isUpdating(kind,source),latest=w.latestRecord(kind,source),used=usingLatest(kind,source,latest);
   card.name.textContent=t(kind==='cloud'?'云图':kind==='aurora'?'极光':'当前任务轨道');
   card.sourceLabel.textContent=t(kind==='cloud'?'检查的云图来源':kind==='aurora'?'数据来源':'当前任务');
   if(kind==='aurora')card.sourceValue.textContent='NOAA SWPC · OVATION';
   if(kind==='orbit')card.sourceValue.textContent=t(mission(sim.missionId).name);
   card.available.label.textContent=t('最新已下载');card.available.value.textContent=describeRecord(latest,kind);
   card.current.label.textContent=t('当前画面使用');card.current.value.textContent=currentText(kind);
   card.checked.label.textContent=t('上次检查');card.checked.value.textContent=timestamp(state.checkedAt)||t('尚未检查');
   card.badge.dataset.phase=state.phase||'idle';card.badge.textContent=t(phaseKeys[state.phase]||phaseKeys.idle);card.progress.hidden=!updating;
   card.message.textContent=state.message?(typeof state.message==='object'?t(state.message.key,state.message.params):errorText(state.message)):t('可检查该来源的新版本，也可使用已下载的数据。');
   const check=state.checkSummary;
   if(check&&['checked','missing','rejected','failed'].every(k=>Number.isInteger(check[k])&&check[k]>=0))card.message.textContent+='\n'+t('检查 {checked} 个候选：{missing} 个尚未发布，{rejected} 个覆盖不足，{failed} 个读取失败。',check);
   if(state.recovery==='waiting')card.message.textContent+='\n'+t('自动恢复第 {attempt} 次：将在 {time} 重试。',{attempt:state.retryAttempt,time:timestamp(state.retryAt)});
   if(state.recovery==='offline')card.message.textContent+='\n'+t('当前离线，联网后自动重试。');
   if(state.recovery==='paused')card.message.textContent+='\n'+t('自动重试已暂缓；重新联网后继续，也可手动检查。');
   const unavailable=kind==='cloud'&&provider==='satcorps'&&WEB_BUILD,noOrbit=kind==='orbit'&&!orbitSource(sim.missionId);
   card.check.textContent=t(updating?'更新进行中…':kind==='cloud'&&provider==='satcorps'?'检查 NASA 更新':kind==='cloud'?'检查 GitHub 云图更新':kind==='aurora'?'检查极光更新':'检查轨道更新');
   card.check.disabled=updating||unavailable||noOrbit||sceneBusy;card.use.textContent=t(used?'正在使用最新下载':'使用最新下载');card.use.disabled=!latest||used||updating||sceneBusy;
   if(kind==='cloud')card.sourceValue.disabled=sceneBusy;
   if(unavailable)card.hint.textContent=t('NASA 在线更新需要桌面启动器的本机服务。网页版仍可导入并使用已下载的 NASA 快照。');
   else if(noOrbit)card.hint.textContent=t('此任务没有在线轨道源，请导入轨道文件');
   else if(kind==='cloud'&&provider==='satcorps')card.hint.textContent=t('NASA 更新会核验全球与极区覆盖，可能需要数分钟；检查期间继续使用当前云图。');
   else if(kind==='orbit')card.hint.textContent=t('轨道仅用于当前任务；更新失败时保留现有轨道。');
   else card.hint.textContent=t('正在跟随该来源的最新数据时会自动使用新版本；固定历史快照或关闭状态会保留。');
   if(card.importButton){card.importButton.textContent=t('导入轨道');card.importButton.disabled=sceneBusy||w.busy;}
  }
  const report=w.cacheReport||{},count=w.items.length,total=w.items.reduce((sum,item)=>sum+(item.size||0),0),jobs=(w.jobs?.size||0)+((w.nasaWatch||w.nasaRestoreTask)&&!w.jobs?.has('cloud:satcorps')?1:0);
  summary.textContent=t('已下载 {count} 份 · {size} MB',{count,size:megabytes(total)})+(jobs?'\n'+t('{count} 项更新正在进行',{count:jobs}):'');
  const removed=report.removedIds?.length||0;cacheResult.hidden=!removed&&!report.overBudget;
  cacheResult.textContent=removed?t('已自动清理 {count} 份旧数据，释放 {size} MB。',{count:removed,size:megabytes(report.removedBytes)}):'';
  if(report.overBudget)cacheResult.textContent+=(removed?'\n':'')+t(w.settings.autoClean===false?'自动清理已关闭，不会按容量删除下载数据。':'受保护的数据已超过容量，已保留；可手动检查下载历史。');
  serverCache.hidden=!w.serverCache;serverCache.textContent=w.serverCache?t('本机 NASA 共享文件：{size} MB · {count} 份；与当前浏览器的下载缓存分别保存。',{size:megabytes(w.serverCache.bytes),count:w.serverCache.count}):'';
 }
 function open(kind){
  if(disposed)return;
  if(!document.getElementById('helpPanel')?.hidden)document.getElementById('closeHelp')?.click();
  if(sim.flightLab?.active)sim.flightLab.close();
  if(!dialog.open){returnFocus=document.activeElement;dialog.showModal();}render();w.render();
  if(cards[kind]){cards[kind].card.scrollIntoView({block:'nearest'});(kind==='cloud'?cards[kind].sourceValue:cards[kind].check).focus({preventScroll:true});}
 }
 const close=()=>dialog.close();entry.onclick=toolbar.onclick=()=>open();closeButton.onclick=close;
 dialog.addEventListener('keydown',event=>event.stopPropagation());
 dialog.addEventListener('close',()=>{sim.lastWall=performance.now();restoreControlFocus(returnFocus);});
 const unsubscribe=onLanguageChange(render);render();
 return {open,close,render,get active(){return dialog.open;},dispose(){disposed=true;if(dialog.open)dialog.close();unsubscribe();side.replaceChildren(...previous);dialog.remove();toolbar.remove();sheet.remove();}};
}
