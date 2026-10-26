export const MUSIC_SETTINGS_KEY='tiangong-music-settings-v1';
export function musicSettings(value={}){return {volume:Number.isFinite(value?.volume)?Math.max(0,Math.min(1,value.volume)):.25,muted:value?.muted===true,autoplay:value?.autoplay!==false};}
export function reconcileMusic(saved,tracks){
 const available=new Map(tracks.map(t=>[t.id,t])),removed=[...new Set((Array.isArray(saved?.removed)?saved.removed:[]).filter(id=>available.get(id)?.builtin))],allowed=tracks.filter(t=>!removed.includes(t.id)).map(t=>t.id);
 return {id:'library',order:[...new Set([...(Array.isArray(saved?.order)?saved.order:[]),...allowed])].filter(id=>allowed.includes(id)),removed};
}
export function adjacentTrack(order,current,step=1){if(!order.length)return null;const i=order.indexOf(current);return order[(i<0?0:(i+step+order.length)%order.length)];}
export function randomTrack(order,random=Math.random){return order.length?order[Math.min(order.length-1,Math.floor(random()*order.length))]:null;}
export function moveTrack(order,id,before=null){const next=order.filter(x=>x!==id);if(!order.includes(id)||before===id)return [...order];const i=before===null?next.length:next.indexOf(before);if(i<0)return [...order];next.splice(i,0,id);return next;}
export function musicTime(seconds){if(!Number.isFinite(seconds)||seconds<0)return '0:00';const s=Math.floor(seconds);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
export class MusicStore{
 constructor(){this.ready=new Promise(resolve=>{try{const request=indexedDB.open('tiangong-music-library-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('library',{keyPath:'id'});request.onsuccess=()=>{this.db=request.result;this.db.onversionchange=()=>this.db.close();resolve();};request.onerror=request.onblocked=()=>resolve();}catch{resolve();}});}
 async read(){await this.ready;if(!this.db)return [];return new Promise((resolve,reject)=>{const tx=this.db.transaction('library','readonly'),r=tx.objectStore('library').getAll();tx.oncomplete=()=>resolve(r.result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('音乐库读取失败'));});}
 async commit(state,added=[],removed=[]){await this.ready;if(!this.db)throw Error('浏览器未允许保存音乐');return new Promise((resolve,reject)=>{const tx=this.db.transaction('library','readwrite'),store=tx.objectStore('library');store.put(state);for(const record of added)store.put(record);for(const id of removed)store.delete(id);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('音乐库保存失败'));});}
}
export function probeMusic(blob){return new Promise((resolve,reject)=>{const audio=new Audio(),url=URL.createObjectURL(blob);let done=false;const finish=(error,duration)=>{if(done)return;done=true;clearTimeout(timer);audio.onloadedmetadata=audio.onerror=null;audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);error?reject(error):resolve(duration);};const timer=setTimeout(()=>finish(Error('音乐读取超时')),15000);audio.preload='metadata';audio.onloadedmetadata=()=>Number.isFinite(audio.duration)&&audio.duration>0?finish(null,audio.duration):finish(Error('音乐时长无效'));audio.onerror=()=>finish(Error('浏览器无法播放此音乐格式'));audio.src=url;});}
