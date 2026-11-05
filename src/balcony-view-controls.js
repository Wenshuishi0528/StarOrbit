import {t} from './i18n.js';
import {wrap,delta,startOrientation} from './balcony-orientation.js';

const modes={flat:'平面',hemisphere:'半球',sphere:'全球'};
const hints={flat:'平面展开方位与仰角，可拖动地平线。',hemisphere:'半球默认朝向天顶（90°），上北下南。点「看地平线」可平视西南方。',sphere:'全球默认显示地平线下的恒星，便于查看整个天球；关闭透视可恢复地面遮挡。'};
const errors={unsupported:'此设备未提供可用的方向传感器，可拖动星空。',restricted:'未获得方向传感器访问权限，可拖动星空。','no-data':'没有收到有效姿态，可拖动星空或重试。',busy:'另一窗口正在使用设备跟随，关闭后可重试。',unavailable:'当前环境无法读取设备姿态，可拖动星空；Mac 请用本机星轨启动器。'};

export function mountBalconyViewControls({host,view,onMode,onManual,redraw}){
 const root=document.createElement('div');root.className='bal-view-controls';
 root.innerHTML='<div class="bal-view-actions"><div class="bal-view-modes" role="group"></div><div class="bal-view-aim"></div></div><div class="bal-view-sensor"></div><p class="bal-view-note"></p>';
 const sheet=document.createElement('style');sheet.textContent=`
 .bal-view-controls{padding:0 12px 9px;display:grid;gap:5px}.bal-view-actions,.bal-view-modes,.bal-view-aim,.bal-view-sensor{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.bal-view-actions{justify-content:space-between}.bal-view-controls button{font-size:12px;padding:4px 9px}
 .bal-view-sensor{margin-top:2px}.bal-view-controls .bal-view-note{color:#a5bbcb;font-size:11px;line-height:1.5}.bal-view-status{color:#b5daca;font-size:11px;line-height:1.45}
 `;host.append(sheet,root);
 const group=root.querySelector('.bal-view-modes'),aim=root.querySelector('.bal-view-aim'),sensor=root.querySelector('.bal-view-sensor'),hint=root.querySelector('.bal-view-note');
 let mode='flat',job=null,last=null,adjust=0,message='',currentType='';
 function button(parent,action,key,fn){
  const b=document.createElement('button');b.type='button';b.dataset.view=action;b.dataset.key=key;b.onclick=fn;parent.append(b);return b;
 }
 const buttons=Object.fromEntries(Object.entries(modes).map(([key,label])=>[key,button(group,key,label,()=>change(key,true))]));
 const horizon=button(aim,'horizon','看地平线',()=>{stopMotion();onManual();view.restoreHorizon();redraw();});
 const zenith=button(aim,'zenith','看天顶',()=>{stopMotion();onManual();view.aimAtZenith();redraw();});
 const nadir=button(aim,'nadir','看天底',()=>{stopMotion();onManual();view.aimAtNadir();redraw();});
 const target=button(aim,'target','看向目标',()=>{stopMotion();onManual();view.aimAtTarget();redraw();});
 const enable=button(sensor,'motion','启用设备跟随',()=>{if(job){stopMotion();return;}enableMotion();});
 const below=button(sensor,'below','显示地平线下星空',()=>{view.setBelowHorizon(!view.belowHorizon);refresh();redraw();});
 const north=button(sensor,'north','校准北向',()=>{
  if(!last)return;adjust=-last.yaw;message='已把设备当前朝向设为正北。';apply(last);refresh();
 });
 const bearing=document.createElement('small');bearing.className='bal-view-bearing';aim.append(bearing);
 const status=document.createElement('span');status.className='bal-view-status';status.setAttribute('role','status');sensor.append(status);
 function syncTarget(){
  target.disabled=!view.hasTarget;bearing.hidden=mode==='flat';if(bearing.hidden)return;
  const pose=view.getOrientation(),text=t('视线 {az}° / 仰角 {el}°',{az:Math.round(wrap(pose.azimuth))%360,el:Math.round(pose.elevation)});
  if(bearing.textContent!==text)bearing.textContent=text;
 }
 function refresh(){
  group.setAttribute('aria-label',t('天空投影'));for(const b of root.querySelectorAll('button'))b.textContent=t(b.dataset.key);
  for(const [key,b] of Object.entries(buttons))b.setAttribute('aria-pressed',String(key===mode));
  horizon.hidden=mode!=='hemisphere';zenith.hidden=target.hidden=mode==='flat';syncTarget();north.hidden=!last;hint.textContent=t(hints[mode]);
  nadir.hidden=below.hidden=mode!=='sphere';below.setAttribute('aria-pressed',String(view.belowHorizon));
  enable.textContent=t(job?'关闭设备跟随':'启用设备跟随');enable.setAttribute('aria-pressed',String(!!job));
  status.textContent=message?t(message):'';
 }
 function change(key,manual=false){
  if(manual){stopMotion();if(key!=='flat')onManual();}
  mode=key;view.setMode(key);onMode(key);refresh();redraw();
 }
 function stopMotion(){
  job?.abort();job=null;last=null;currentType='';adjust=0;message='';refresh();
 }
 function apply(q){
  const az=wrap(q.yaw+adjust),el=Math.max(-90,Math.min(90,q.pitch)),roll=delta(q.roll,0),old=view.getOrientation();
  if(Math.abs(delta(az,old.azimuth))+Math.abs(el-old.elevation)+Math.abs(delta(roll,old.roll))<.15)return;
  view.setOrientation(az,el,roll);redraw();
 }
 function enableMotion(){
  const controller=new AbortController();job=controller;message='正在等待设备姿态…';refresh();
  const receive=q=>{
   if(job!==controller)return;
   const type=q.native?'mac':q.absolute?'absolute':'relative';
   if(!last||type!==currentType){
    const prev=view.getOrientation();change('sphere');onManual();currentType=type;
    adjust=q.absolute?0:delta(prev.azimuth,q.yaw);
    message=q.absolute?'设备提供北向参考。':q.native?'Mac 机身相对转动；将键盘前方朝向正北，再点「校准北向」。':'相对转动；将设备朝向正北，再点「校准北向」。';
    last=q;refresh();
   }
   last=q;apply(q);
  };
  startOrientation(controller.signal,receive,reason=>{
   if(job!==controller)return;stopMotion();message=errors[reason]||errors.unavailable;refresh();
  });
 }
 const hidden=()=>{if(document.hidden&&job)stopMotion();};
 document.addEventListener('visibilitychange',hidden);change('hemisphere');
 return {stopMotion,refresh,syncTarget,get mode(){return mode;},dispose(){stopMotion();document.removeEventListener('visibilitychange',hidden);sheet.remove();root.remove();}};
}
