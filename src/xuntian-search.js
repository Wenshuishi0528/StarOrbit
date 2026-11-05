import {t,getLanguage} from './i18n.js';
import {searchXuntianTargets} from './xuntian-catalog.js';
import {searchSolarTargets} from './solar-targets.js';
export function mountScopeSearch(input,list,{choose,isBlocked,cityFinder,cityVisible,solarVisible}){
 let results=[],index=0;
 const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
 function highlight(){Array.from(list.children).forEach((row,i)=>row.setAttribute('aria-selected',String(i===index)));if(results.length)input.setAttribute('aria-activedescendant','xt-result-'+index);else input.removeAttribute('aria-activedescendant');}
 function render(){
  const query=input.value.trim();list.replaceChildren();if(!query){close();return;}
  const stars=searchXuntianTargets(query,getLanguage(),7),cities=cityFinder.search(query,getLanguage());
  const bodies=searchSolarTargets(query,getLanguage());
  const exact=cities.filter(c=>c.score===0),others=cities.filter(c=>c.score!==0);
  // Exact city names come first. Preserve stellar results for HIP/name/IAU
  // searches, with space for city prefixes when both domains match.
  const cap=others.length?5:7;
  results=[...bodies.filter(b=>b.exact),...exact,...bodies.filter(b=>!b.exact).slice(0,3),...stars.slice(0,cap),...others,...stars.slice(cap)].slice(0,7);index=0;
  if(!results.length){const el=document.createElement('p');el.textContent=t('没有找到匹配的天体或城市。');list.append(el);}
  results.forEach((r,i)=>{
   const row=document.createElement('button');row.type='button';row.id='xt-result-'+i;row.setAttribute('role','option');row.tabIndex=-1;row.dataset.target=r.id;
   const name=document.createElement('b'),info=document.createElement('small');name.textContent=r.name;
   const city=r.type==='city',hidden=city?cityVisible(r)===false:r.type==='solar'?solarVisible(r.body)===false:isBlocked(r.direction);
   info.textContent=[t(city?'城市':r.category|| (r.type==='star'?'恒星':'星座')),r.identifier,hidden?t(city?'目标在地平线下':'地球遮挡'):''].filter(Boolean).join(' · ');
   row.append(name,info);row.onpointerdown=e=>e.preventDefault();row.onclick=()=>select(i);list.append(row);
  });
  list.hidden=false;input.setAttribute('aria-expanded','true');highlight();
 }
 function select(i){if(!results[i])return;const target=results[i];input.value=target.name;close();choose(target);}
 input.addEventListener('input',e=>{if(!e.isComposing)render();});input.addEventListener('compositionend',render);input.addEventListener('focus',render);
 input.addEventListener('blur',close);
 input.addEventListener('keydown',e=>{
  if(e.isComposing||e.keyCode===229)return;
  if(e.key==='Escape'){e.preventDefault();close();return;}
  if(!['ArrowDown','ArrowUp','Enter'].includes(e.key))return;
  e.preventDefault();if(list.hidden)render();if(!results.length||list.hidden)return;
  if(e.key==='Enter'){select(index);return;}
  index=(index+(e.key==='ArrowDown'?1:-1)+results.length)%results.length;highlight();list.children[index]?.scrollIntoView({block:'nearest'});
 });
 return {close,refresh(){if(!list.hidden)render();}};
}
