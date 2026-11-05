import {onLanguageChange,t} from './i18n.js';
import {clockText} from './time-format.js';
import {SURVEY_FIELDS} from './survey-lab-math.js';

const LABELS={balcony:'阳台观测',exposure:'轨道长曝光',survey:'巡天拍摄计划','survey-photo':'巡天现场单帧'};
const CAN_SAVE=new Set(['balcony','exposure','survey']);
function button(parent,action) {
  const el=document.createElement('button');el.type='button';el.onclick=action;parent.append(el);return el;
}
function paragraph(parent,content,cls) {
  const el=document.createElement('p');el.textContent=content;if(cls)el.className=cls;parent.append(el);return el;
}
function description(record) {
  const field=SURVEY_FIELDS.find(x=>x.id===record.fieldId);
  const parts=[t(LABELS[record.kind]),record.observer?.name||record.groundTarget?.name||''];
  if(field)parts.push(t(field.name));
  if(record.kind==='survey-photo' && Number.isInteger(record.tile))parts.push('ABCD'[record.tile]);
  if(record.kind==='balcony'&&record.targetName)parts.push(t(record.targetName));
  if(record.kind==='exposure'){
    const modeNames={body:'舱体固定',inertial:'恒星锁定',ground:'地面点锁定','compare-ground':'对照：舱体固定 / 地面点锁定','compare-stars':'对照：舱体固定 / 恒星锁定'};
    if(modeNames[record.mode])parts.push(t(modeNames[record.mode]));
    if(Number.isFinite(record.seconds))parts.push(record.seconds+' s');
  }
  return parts.filter(Boolean).join(' · ');
}

export function mountObservationJournal(labDialog,store,{getRecipe,restore,onShow,onHide}) {
  const controls=document.createElement('div');controls.className='obs-journal-actions';
  labDialog.querySelector('.flight-lab-head').insertBefore(controls,labDialog.querySelector('#closeFlightLab'));
  const headerStatus=document.createElement('span');headerStatus.className='obs-save-status';headerStatus.setAttribute('role','status');controls.append(headerStatus);
  const saveButton=button(controls,save);saveButton.dataset.observationAction='save';
  const browse=button(controls,show);browse.dataset.observationAction='browse';
  const modal=document.createElement('dialog');modal.className='obs-journal';modal.setAttribute('aria-labelledby','obsJournalTitle');
  modal.innerHTML='<div class="obs-journal-head"><h3 id="obsJournalTitle"></h3><button type="button" data-obs="close">×</button></div><div class="obs-journal-body"><div class="obs-journal-tools"><select data-obs="filter"></select><span data-obs="notice" role="status"></span></div><figure data-obs="picture" hidden><img alt=""><figcaption></figcaption></figure><div data-obs="list"></div><button type="button" data-obs="more" hidden></button></div>';
  labDialog.append(modal);
  const el=key=>modal.querySelector('[data-obs="'+key+'"]');
  let saving=false,restoring=false,tab='pass',pageSize=12,ticket=0,pictureTicket=0,pictureURL='',feedbackTimer=0;
  let thumbURLs=[];
  const clearThumbs=()=>{for(const url of thumbURLs)URL.revokeObjectURL(url);thumbURLs=[];};
  function clearPicture() {
    pictureTicket++;if(pictureURL)URL.revokeObjectURL(pictureURL);pictureURL='';
    el('picture').hidden=true;el('picture').querySelector('img').removeAttribute('src');
  }
  function feedback(message) {
    clearTimeout(feedbackTimer);headerStatus.textContent=message;
    feedbackTimer=setTimeout(()=>{headerStatus.textContent='';},6500);
  }
  async function save() {
    if(saving)return;
    saving=true;saveButton.disabled=true;
    try {
      const recipe=await getRecipe();
      if(!recipe?.record){feedback(t('请先选择一次可保存的观测'));return;}
      await store.save(recipe.record,recipe);
      feedback(t(store.persistent?'已保存到本机观测记录':'记录仅保留在本次会话'));
    } catch(e) { feedback(t('保存观测失败：{error}',{error:e.message})); }
    finally {saving=false;saveButton.disabled=false;}
  }
  async function see(record) {
    clearPicture();const token=pictureTicket;
    try {
      const blob=await store.image(record.id);
      if(token!==pictureTicket||!modal.open)return;
      if(!blob)throw Error('观测照片不可用');
      pictureURL=URL.createObjectURL(blob);
      el('picture').querySelector('img').src=pictureURL;
      el('picture').querySelector('figcaption').textContent=description(record)+' · '+clockText(record.time)+' UTC+8';
      el('picture').hidden=false;el('picture').scrollIntoView({block:'nearest'});
    } catch(e) {if(token===pictureTicket)el('notice').textContent=t(e.message);}
  }
  async function download(record) {
    try{
      const blob=await store.image(record.id);if(!blob)throw Error('观测照片不可用');
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='StarOrbit_'+record.kind+'_'+new Date(record.time).toISOString().replace(/[:.]/g,'-')+(blob.type==='image/jpeg'?'.jpg':'.png');
      a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){el('notice').textContent=t(e.message);}
  }
  async function reopen(record,control) {
    if(restoring)return;restoring=true;control.disabled=true;
    try {
      const [orbit,image]=await Promise.all([store.orbit(record.orbitRef),record.hasImage&&record.kind!=='survey-photo'?store.image(record.id):null]);
      if(!modal.open)return;
      await restore(record,{orbit,image});
      if(modal.open)modal.close();
      feedback(t('已打开观测记录'));
    } catch(e) {el('notice').textContent=t('重开观测失败：{error}',{error:e.message});}
    finally {control.disabled=false;restoring=false;}
  }
  async function populate() {
    if(!modal.open)return;
    const token=++ticket;
    try {
      const kind=el('filter').value;
      const records=await store.list(kind?{kind}:{});
      if(token!==ticket||!modal.open)return;
      clearThumbs();const list=el('list');list.replaceChildren();
      el('notice').textContent=!store.persistent?t('记录仅保留在本次会话'):records.length?'':t('这里还没有观测记录');
      for(const record of records.slice(0,pageSize)){
        const row=document.createElement('article');row.className='obs-record';row.dataset.observationId=record.id;
        const inner=document.createElement('div');row.append(inner);
        const title=document.createElement('strong');title.textContent=description(record);inner.append(title);
        paragraph(inner,clockText(record.time)+' UTC+8','obs-timing');
        if(record.orbitInfo){
          const {source,epoch}=record.orbitInfo;
          paragraph(inner,[t('归档星历'),source,epoch].filter(Boolean).join(' · '),'obs-origin');
        }
        const actions=document.createElement('div');actions.className='obs-record-buttons';inner.append(actions);
        const again=button(actions,()=>reopen(record,again));again.textContent=t('重开');again.dataset.observationAction='restore';
        if(record.hasImage){
          const seeButton=button(actions,()=>see(record));seeButton.textContent=t('看原图');
          button(actions,()=>download(record)).textContent=t('下载照片');
        }
        const del=button(actions,async()=>{
          if(del.dataset.confirm!=='yes'){del.dataset.confirm='yes';del.textContent=t('确认删除');return;}
          del.disabled=true;
          try{await store.remove(record.id);clearPicture();}catch(e){el('notice').textContent=t(e.message);del.disabled=false;}
        });
        del.textContent=t('删除');list.append(row);
        if(record.hasThumbnail){
          const img=document.createElement('img');img.alt='';img.loading='lazy';row.prepend(img);
          store.thumbnail(record.id).then(blob=>{
            if(!blob||token!==ticket||!modal.open)return;
            const url=URL.createObjectURL(blob);thumbURLs.push(url);img.src=url;
          }).catch(()=>img.remove());
        }
      }
      el('more').hidden=records.length<=pageSize;
    } catch(e) {if(token===ticket)el('notice').textContent=t(e.message);}
  }
  function show() {
    if(modal.open)return;
    pageSize=12;el('filter').value='';clearPicture();modal.showModal();onShow();populate();
  }
  modal.addEventListener('close',()=>{
    ticket++;clearThumbs();clearPicture();onHide();
    if(labDialog.open)browse.focus({preventScroll:true});
  });
  el('close').onclick=()=>modal.close();
  el('filter').onchange=()=>{pageSize=12;clearPicture();populate();};
  el('more').onclick=()=>{pageSize+=12;populate();};
  const unsubscribe=store.subscribe(()=>{if(modal.open)populate();});
  function translate(){
    saveButton.textContent=t('保存这次观测');browse.textContent=t('观测记录');
    modal.querySelector('h3').textContent=t('本机观测记录');el('close').setAttribute('aria-label',t('关闭观测记录'));
    const filter=el('filter'),current=filter.value;filter.setAttribute('aria-label',t('按观测类型筛选'));
    filter.replaceChildren(new Option(t('全部观测'),''),...Object.entries(LABELS).map(([id,key])=>new Option(t(key),id)));
    filter.value=current;el('more').textContent=t('显示更多记录');
    if(modal.open)populate();
  }
  const lang=onLanguageChange(translate);translate();
  return {show,close(){if(modal.open)modal.close();},
    setTab(key){if(key!==tab)feedback('');tab=key;saveButton.hidden=!CAN_SAVE.has(key);},
    dispose(){clearTimeout(feedbackTimer);unsubscribe();lang();ticket++;clearThumbs();clearPicture();modal.remove();controls.remove();}};
}
