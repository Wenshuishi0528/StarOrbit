import {t,onLanguageChange} from './i18n.js';
import {WEB_BUILD} from './runtime-assets.js';
const KEY='tiangong-help-v1',$=id=>document.getElementById(id);
const topics=[
 {title:'观察模型',text:'左键拖动旋转，右键拖动平移，滚轮缩放。触屏使用单指旋转、双指缩放与平移；右上角“视角”可切换方向或显示全貌。',target:'#stage'},
 {title:'切换航天器',text:'在左侧任务列表选择中国空间站或东方红一号。每个任务有独立的模型、轨道和姿态控制，地球与星空设置共用。也可导入模型和配置文件。',target:'#missionSelect'},
 {title:'控制时间',text:'使用暂停、倍速和 1s／1m／10m／1h 步进探索轨道。拖动右下角小地图或底部时间轴可定位时刻；运行中拖动后继续播放。',target:'.time-step-row'},
 {title:'探索地球与星空',text:'在“地球与星空”调整画质和标注。地理标注显示国家、首都和地形，星图显示恒星与星座；左下角音符展开音乐播放器。',target:'#settings-environment'},
];
export function installHelp(music){
 const panel=$('helpPanel'),welcome=$('welcomeDialog');let step=null,marked=null,restore=[],returnFocus=null;
 const remember=()=>{try{localStorage.setItem(KEY,'seen');}catch{}};
 const beginMusic=()=>{if(music.settings.autoplay&&music.audio.paused)music.play();};
 const clearTarget=()=>{marked?.classList.remove('tour-highlight');marked=null;for(const fn of restore.reverse())fn();restore=[];};
 function target(){
  clearTarget();const el=document.querySelector(topics[step].target);if(!el)return;
  const content=el.closest('.settings-content');if(content?.hidden){content.hidden=false;const button=document.querySelector(`[aria-controls="${content.id}"]`);button?.setAttribute('aria-expanded','true');restore.push(()=>{content.hidden=true;button?.setAttribute('aria-expanded','false');});}
  const aside=el.closest('aside');if(aside){const scroll=aside.scrollTop;restore.push(()=>aside.scrollTop=scroll);el.scrollIntoView({block:'center',behavior:'instant'});}
  marked=el;el.classList.add('tour-highlight');
 }
 function render(){
  const tour=step!==null;panel.classList.toggle('touring',tour);$('helpProgress').textContent=tour?`${step+1} / ${topics.length}`:t('使用指南');$('helpTitle').textContent=t(tour?topics[step].title:'帮助与操作说明');$('tourActions').hidden=!tour;$('replayTour').hidden=tour;
  $('tourPrevious').disabled=step===0;$('tourNext').textContent=t(step===topics.length-1?'完成导览':'下一步');
  const contents=$('helpContents');contents.replaceChildren();
  if(tour){const p=document.createElement('p');p.textContent=t(topics[step].text);contents.append(p);return;}
  const extra=[{title:'数据与更新',text:WEB_BUILD?'网页版默认使用内置轨道和云图。可导入轨道文件与云图快照；数据区间外继续椭圆轨道演算。':'桌面版支持内置数据、在线更新和文件导入。轨道区间外继续椭圆轨道演算，数据栏显示当前计算模式。'},
   {title:'保存与分享',text:'设置、导入模型和音乐保存在当前浏览器中。清除网站数据会删除这些内容；使用“场景分享”导出场景文件。桌面版与网页版的本地数据分别保存。'},
   {title:'画质与音乐',text:'画面流畅度取决于电脑性能。可先使用流畅或标准画质，再提高细节。点击音符播放音乐，展开播放列表可导入、删除和排序曲目。'}];
  [...topics,...extra].forEach((topic,i)=>{const details=document.createElement('details'),summary=document.createElement('summary'),p=document.createElement('p');summary.textContent=t(topic.title);p.textContent=t(topic.text);details.append(summary,p);details.open=i===0;contents.append(details);});
 }
 function close(){clearTarget();panel.hidden=true;$('helpToggle').setAttribute('aria-expanded','false');step=null;if(returnFocus?.isConnected)returnFocus.focus();}
 function open(tour=false){returnFocus=document.activeElement;step=tour?0:null;panel.hidden=false;$('helpToggle').setAttribute('aria-expanded','true');render();if(tour)target();panel.focus();}
 function dismiss(){remember();welcome.close();beginMusic();}
 $('helpToggle').onclick=()=>panel.hidden?open():close();$('closeHelp').onclick=close;
 $('replayTour').onclick=()=>{step=0;render();target();panel.focus();};
 $('tourPrevious').onclick=()=>{if(step>0){step--;render();target();}};
 $('tourNext').onclick=()=>{if(step===topics.length-1){remember();close();}else{step++;render();target();}};
 $('startTour').onclick=()=>{dismiss();open(true);returnFocus=$('helpToggle');};$('skipTour').onclick=()=>{dismiss();$('helpToggle').focus();};
 welcome.addEventListener('cancel',remember);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();close();}});
 document.addEventListener('pointerdown',e=>{if(!panel.hidden&&step===null&&!panel.contains(e.target)&&!$('helpToggle').contains(e.target))close();});
 onLanguageChange(()=>{if(!panel.hidden)render();});
 let seen=false;try{seen=localStorage.getItem(KEY)==='seen';}catch{}
 if(!seen)welcome.showModal();
}
