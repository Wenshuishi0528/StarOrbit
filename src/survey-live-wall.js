import {t,onLanguageChange} from './i18n.js';
import {SURVEY_FIELDS,SURVEY_TILES} from './survey-lab-math.js';

const el=(tag,parent,cls='')=>{const node=document.createElement(tag);node.className=cls;parent.append(node);return node;};
const clock=time=>Number.isFinite(time)?new Date(time).toISOString().slice(0,19).replace('T',' ')+' UTC':'';
function saveBlob(blob,name){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function coverageText(row){
 const c=row.coverage;if(!c)return '';
 return t('可见天区约 {percent}%',{percent:Math.round(100*c.sky)});
}
function obstacles(row){
 const c=row.coverage;if(!c)return '';
 return [[c.earth,'地球'],[c.station,'站体'],[c.outside,'画外']].filter(([v])=>v>.005).map(([v,key])=>t(key)+' '+Math.round(100*v)+'%').join(' · ');
}
async function imageOf(blob){
 if(typeof createImageBitmap==='function'){try{return await createImageBitmap(blob);}catch{}}
 const url=URL.createObjectURL(blob);try{const img=new Image();img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}
}
async function makeSheet(field,rows,store){
 const out=document.createElement('canvas');out.width=1600;out.height=1190;
 const ctx=out.getContext('2d');if(!ctx)throw Error('在轨照片不可用');
 ctx.fillStyle='#07121e';ctx.fillRect(0,0,out.width,out.height);
 ctx.fillStyle='#e8f3f5';ctx.font='600 33px system-ui';ctx.fillText(t('我的在轨四格')+' · '+t(field.name),35,55);
 ctx.fillStyle='#acc5cd';ctx.font='19px system-ui';ctx.fillText(t('主场景镜口单帧 · 各格保留实际构图和拍摄时刻'),35,90);
 const w=756,h=472;
 for(let i=0;i<4;i++){
  const x=35+(i%2)*774,y=118+Math.floor(i/2)*529,row=rows[i];ctx.fillStyle='#0e2332';ctx.fillRect(x,y,w,h);
  if(row){
   const blob=await store.image(row.id);if(!blob)throw Error('在轨照片不可用');
   const img=await imageOf(blob);try{
    const fit=Math.min(w/img.width,h/img.height),iw=fit*img.width,ih=fit*img.height;
    ctx.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);
   }finally{img.close?.();}
  }else{
   ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.strokeStyle='#1b3444';ctx.lineWidth=1;
   for(let k=-h;k<w;k+=24){ctx.beginPath();ctx.moveTo(x+k,y);ctx.lineTo(x+k+h,y+h);ctx.stroke();}ctx.restore();
   ctx.fillStyle='#8aa4b4';ctx.font='25px system-ui';ctx.textAlign='center';ctx.fillText(t('尚无在轨照片'),x+w/2,y+h/2);ctx.textAlign='left';
  }
  ctx.fillStyle='#eabf83';ctx.font='bold 21px system-ui';ctx.fillText(SURVEY_TILES[i],x,y+h+27);
  if(row){ctx.fillStyle='#b5cad1';ctx.font='17px system-ui';ctx.fillText([clock(row.time),coverageText(row),obstacles(row)].filter(Boolean).join(' · '),x+30,y+h+27);}
 }
 const blob=await new Promise(resolve=>out.toBlob(resolve,'image/png'));if(!blob)throw Error('在轨照片不可用');return blob;
}

export function mountSurveyLiveWall(parent,sim,observe){
 const root=el('section',parent,'survey-live-wall');root.dataset.survey='live-wall';
 const header=el('div',root,'survey-live-head'),title=el('h4',header),picker=el('select',header);picker.dataset.survey='live-field';
 const note=el('p',root,'survey-note'),grid=el('div',root,'survey-live-grid'),footer=el('div',root,'survey-live-footer');
 const download=el('button',footer),feedback=el('span',footer);download.type='button';download.dataset.survey='live-export';feedback.setAttribute('role','status');
 const cards=SURVEY_TILES.map((letter,i)=>{
  const card=el('article',grid,'survey-live-card');card.dataset.liveTile=letter;
  const picture=el('button',card,'survey-live-picture');picture.type='button';const photo=el('img',picture),empty=el('span',picture);
  const head=el('div',card,'survey-live-info'),tile=el('strong',head);tile.textContent=letter;const btn=el('button',head);btn.type='button';btn.dataset.survey='live-observe';
  const when=el('time',card),info=el('small',card),history=el('select',card);history.dataset.survey='live-history';
  btn.onclick=()=>observe(fieldId,i);picture.onclick=()=>{if(chosen[i])openPhoto(chosen[i]);};
  history.onchange=()=>{pinned[i]=history.value;refresh();};
  return {card,picture,photo,empty,btn,when,info,history};
 });
 const modal=el('dialog',root,'survey-live-dialog'),modalBody=el('div',modal),modalHead=el('div',modalBody,'survey-live-head');
 const modalName=el('strong',modalHead),saveOriginal=el('button',modalHead),close=el('button',modalHead);saveOriginal.type=close.type='button';
 const big=el('img',modalBody);close.onclick=()=>modal.close();modal.addEventListener('click',e=>{if(e.target===modal)modal.close();});
 let fieldId=null,visible=false,dead=false,rev=0,pinned={},chosen=[],urls=[],singleURL=null,singleRow=null,singleBlob=null,openRev=0,exporting=false,offStore=null;
 function resetPhoto(){openRev++;if(singleURL)URL.revokeObjectURL(singleURL);singleURL=null;singleRow=null;singleBlob=null;big.removeAttribute('src');}
 modal.addEventListener('close',resetPhoto);
 async function openPhoto(row){
  const tag=++openRev;
  try{const blob=await sim.observations.image(row.id);if(tag!==openRev||dead||!visible)return;if(!blob)throw Error('在轨照片不可用');
   if(singleURL)URL.revokeObjectURL(singleURL);singleURL=URL.createObjectURL(blob);singleBlob=blob;singleRow=row;big.src=singleURL;big.alt=t('在轨原图');
   modalName.textContent=t(SURVEY_FIELDS.find(f=>f.id===row.fieldId).name)+' '+SURVEY_TILES[row.tile]+' · '+clock(row.time);if(!modal.open)modal.showModal();
  }catch{if(tag===openRev)feedback.textContent=t('在轨照片不可用');}
 }
 saveOriginal.onclick=()=>{if(singleBlob&&singleRow)saveBlob(singleBlob,'StarOrbit-Xuntian-'+singleRow.fieldId+'-'+SURVEY_TILES[singleRow.tile]+'-'+singleRow.time+'.png');};
 function release(){urls.forEach(url=>{if(url)URL.revokeObjectURL(url);});urls=[];}
 function paint(rows){
  release();chosen=[];
  for(let i=0;i<4;i++){
   const c=cards[i],group=rows.filter(r=>r.tile===i),row=group.find(r=>r.id===pinned[i])||group[0];chosen[i]=row;
   c.photo.hidden=true;c.photo.removeAttribute('src');c.picture.disabled=!row;c.empty.hidden=!!row;c.empty.textContent=t('尚无在轨照片');
   c.picture.setAttribute('aria-label',row?t('查看 {tile} 格原图',{tile:SURVEY_TILES[i]}):t('尚无在轨照片'));
   c.card.dataset.record=row?.id||'';c.btn.textContent=t('补拍 {tile}',{tile:SURVEY_TILES[i]});
   c.when.textContent=row?clock(row.time):'';c.info.textContent=row?[coverageText(row),obstacles(row)].filter(Boolean).join(' · '):'';
   c.history.replaceChildren(...group.map(r=>new Option(clock(r.time)+' · '+coverageText(r),r.id)));
   if(row)c.history.value=row.id;c.history.hidden=group.length<2;c.history.setAttribute('aria-label',t('选择 {tile} 格拍摄记录',{tile:SURVEY_TILES[i]}));
  }
  download.disabled=exporting||!chosen.some(Boolean);
 }
 async function refresh(recordId=null){
  const ticket=++rev;if(!visible||dead||!fieldId)return;
  const store=sim.observations;if(!store){paint([]);return;}
  if(!offStore)offStore=store.subscribe(change=>{if(visible&&(!change?.kind||change.kind==='survey-photo'))refresh();});
  try{
   const rows=await store.list({kind:'survey-photo',fieldId});if(dead||ticket!==rev||!visible)return;
   if(recordId){const record=rows.find(row=>row.id===recordId);if(record)pinned[record.tile]=record.id;}
   paint(rows);feedback.textContent='';
   await Promise.all(chosen.map(async(row,i)=>{
    if(!row)return;
    const blob=await store.thumbnail(row.id)||await store.image(row.id);
    if(dead||ticket!==rev||!visible||!blob)return;
    const url=URL.createObjectURL(blob);urls[i]=url;cards[i].photo.src=url;cards[i].photo.alt=t('查看 {tile} 格原图',{tile:SURVEY_TILES[i]});cards[i].photo.hidden=false;
   }));
  }catch{if(ticket===rev){paint([]);feedback.textContent=t('在轨照片不可用');}}
 }
 function select(id,recordId=null){
  if(!SURVEY_FIELDS.some(f=>f.id===id))return;
  if(id!==fieldId){pinned={};fieldId=id;picker.value=id;paint([]);}
  return refresh(recordId);
 }
 function translate(){
  title.textContent=t('我的在轨四格');picker.replaceChildren(...SURVEY_FIELDS.map(f=>new Option(t(f.name),f.id)));if(fieldId)picker.value=fieldId;
  picker.setAttribute('aria-label',t('在轨四格天区'));note.textContent=t('主场景镜口单帧 · 各格保留实际构图和拍摄时刻');
  download.textContent=t('导出在轨四格 PNG');close.textContent=t('关闭');saveOriginal.textContent=t('下载原图');refresh();
 }
 picker.onchange=()=>select(picker.value);
 download.onclick=async()=>{
  if(exporting||!chosen.some(Boolean))return;exporting=true;download.disabled=true;const field=SURVEY_FIELDS.find(f=>f.id===fieldId),rows=chosen.slice();
  try{const blob=await makeSheet(field,rows,sim.observations);if(!visible||dead||field.id!==fieldId)return;
   saveBlob(blob,'StarOrbit-Xuntian-live-'+field.id+'-'+rows.filter(Boolean).length+'of4.png');feedback.textContent=t('在轨四格已导出');}
  catch{if(visible&&!dead)feedback.textContent=t('在轨照片不可用');}finally{exporting=false;download.disabled=!chosen.some(Boolean);}
 };
 const offLang=onLanguageChange(translate);translate();paint([]);
 return {resume(id){visible=true;if(!fieldId)select(id);else refresh();},select,
  show(id,recordId){select(id,recordId);root.scrollIntoView({block:'center'});picker.focus({preventScroll:true});},
  pause(){visible=false;rev++;if(modal.open)modal.close();resetPhoto();release();},
  dispose(){dead=true;rev++;if(modal.open)modal.close();resetPhoto();release();offStore?.();offLang();}};
}
