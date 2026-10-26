const CACHE_KEY='starorbit-public-visits-v1',CACHE_MS=15*60*1000;
const PATH='/StarOrbit/';
export function counterEndpoints(site){
 try{const url=new URL(site);if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||! /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.goatcounter\.com$/.test(url.hostname))return null;
  return {site:url.origin,count:url.origin+'/count?p='+encodeURIComponent(PATH),read:url.origin+'/counter/'+encodeURIComponent(PATH)+'.json'};
 }catch{return null;}
}
export function isOfficialVisitorPage(location){return location?.origin==='https://wenshuishi0528.github.io'&&['/StarOrbit/','/StarOrbit/index.html'].includes(location.pathname);}
export function parseVisitorCount(value){
 if(typeof value==='string'){if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)||value.length>24)return null;value=Number(value.replaceAll(',',''));}
 return Number.isSafeInteger(value)&&value>=0?value:null;
}
async function request(fetch,url,readJSON=false){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetch(url,{method:'GET',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',signal:controller.signal});
  if(!readJSON)return;
  if(!response.ok)throw Error('Counter unavailable');return await response.json();
 }
 finally{clearTimeout(timer);}
}
// Only fixed endpoints cross the network. No scene, document, URL query or file data.
export async function loadVisitorCount({site,location,fetch,storage,onChange,online=true,automated=false,now=Date.now()}){
 const endpoints=counterEndpoints(site);if(!endpoints)return;
 let cached;
 try{const value=JSON.parse(storage?.getItem(CACHE_KEY));if(value?.site===endpoints.site&&parseVisitorCount(value.count)!==null&&Number.isFinite(value.updatedAt)&&value.updatedAt>0&&value.updatedAt<=now)cached={count:parseVisitorCount(value.count),updatedAt:value.updatedAt};}catch{}
 if(cached)onChange(cached);
 if(!online)return;
 const jobs=[];
 if(isOfficialVisitorPage(location)&&!automated)jobs.push(request(fetch,endpoints.count));
 if(!cached||now-cached.updatedAt>=CACHE_MS)jobs.push((async()=>{
  const value=await request(fetch,endpoints.read,true),count=parseVisitorCount(value?.count);if(count===null)throw Error('Invalid counter');
  const result={count,updatedAt:now};try{storage?.setItem(CACHE_KEY,JSON.stringify({site:endpoints.site,...result}));}catch{}onChange(result);
 })());
 // Statistics never interrupt startup or animation, including offline/blocked requests.
 await Promise.allSettled(jobs);
}
