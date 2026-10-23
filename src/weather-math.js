// Pure validation/selection helpers shared by live data, imports and regression tests.
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function validateAurora(x){
 const time=Date.parse(x?.['Forecast Time']),observed=Date.parse(x?.['Observation Time']);
 if(!Number.isFinite(time)||!Number.isFinite(observed)||!Array.isArray(x?.coordinates)||x.coordinates.length<1000||x.coordinates.length>70000)throw Error('无效极光数据');
 if(x.coordinates.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||p[0]<-180||p[0]>360||p[1]<-90||p[1]>90||p[2]<0||p[2]>100))throw Error('无效极光数据');
 return {time,observed,data:x};
}
export function auroraPixels(x){
 validateAurora(x);const pixels=new Uint8Array(360*181);
 for(const [lon,lat,v] of x.coordinates){const col=((Math.round(lon)+180)%360+360)%360,row=Math.round(lat+90);pixels[row*360+col]=Math.max(pixels[row*360+col],Math.round(v*2.55));}
 return pixels;
}
export function selectSnapshot(items,kind,mode,time,id){
 const candidates=items.filter(x=>x.kind===kind);
 if(mode==='latest')return candidates.sort((a,b)=>(b.time??b.downloaded)-(a.time??a.downloaded))[0]||null;
 if(mode==='history'&&id!=='auto')return candidates.find(x=>x.id===id)||null;
 // Never imply a precise historical match for an image with unknown observation time.
 return candidates.filter(x=>Number.isFinite(x.time)).sort((a,b)=>Math.abs(a.time-time)-Math.abs(b.time-time))[0]||null;
}
export function evictionIds(items,limit,protectedIds=[]){
 let size=items.reduce((n,x)=>n+x.size,0);const ids=[];
 for(const x of [...items].filter(x=>!x.favorite&&!protectedIds.includes(x.id)).sort((a,b)=>a.downloaded-b.downloaded)){if(size<=limit)break;ids.push(x.id);size-=x.size;}
 return ids;
}
export function seedNumber(value){let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0)%10000;}
