import config from './visitor-config.json';
import {counterEndpoints,loadVisitorCount} from './visitor-counter.js';
import {t,getLanguage,onLanguageChange} from './i18n.js';
export function installVisitorCounter(){
 const element=document.getElementById('visitorCount');if(!element||!counterEndpoints(config.site))return;
 let value;
 const render=()=>{if(!value)return;const locale={zh:'zh-CN',en:'en',ru:'ru',fr:'fr'}[getLanguage()];
  element.textContent=t('网页累计访问 · {count}',{count:new Intl.NumberFormat(locale).format(value.count)});
  element.title=t('统计更新：{time}；同一会话重复访问去重，数字定期更新。',{time:new Date(value.updatedAt).toLocaleString(locale)});element.hidden=false;
 };
 onLanguageChange(render);
 // Run after the model is ready; one read, at most one count, no polling.
 setTimeout(()=>{
  let storage;try{storage=localStorage;}catch{}
  void loadVisitorCount({site:config.site,location,fetch:window.fetch.bind(window),storage,online:navigator.onLine,automated:navigator.webdriver,onChange:next=>{value=next;render();}});
 },1500);
}
