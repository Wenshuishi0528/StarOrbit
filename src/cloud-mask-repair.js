import {githubCloudOpacity} from './cloud-texture.js';

// A bounded source-grid reconstruction, not cloud classification. Work in opacity
// (area-averaged transmission), so filtering cannot brighten the weak grey floor.
// The 5-tap footprint only activates across abrupt source discontinuities.
// Self-contained: serialized into the offline app's one-shot worker.
export function repairCloudMask(input,width,height,lut){
 if(input.length!==width*height||width<2||height<2)throw Error('Invalid cloud mask');
 const output=new Uint8Array(input.length),rows=Array.from({length:5},()=>({id:-1,mean:new Float32Array(width),min:new Uint8Array(width),max:new Uint8Array(width)}));
 const weights=[1,4,6,4,1];
 function row(y){
  y=Math.max(0,Math.min(height-1,y));const r=rows[y%5];if(r.id===y)return r;r.id=y;
  for(let x=0;x<width;x++){
   let mean=0,lo=255,hi=0;
   for(let k=-2;k<=2;k++){const v=input[y*width+(x+k+width)%width];mean+=weights[k+2]*lut[v];lo=Math.min(lo,v);hi=Math.max(hi,v);}
   r.mean[x]=mean/16;r.min[x]=lo;r.max[x]=hi;
  }
  return r;
 }
 for(let y=0;y<height;y++){
  const window=[];for(let k=-2;k<=2;k++)window.push(row(y+k));
  for(let x=0;x<width;x++){
   let mean=0,lo=255,hi=0;
   for(let k=0;k<5;k++){const r=window[k];mean+=weights[k]*r.mean[x];lo=Math.min(lo,r.min[x]);hi=Math.max(hi,r.max[x]);}
   let t=Math.max(0,Math.min(1,((hi-lo)/255-.10)/.18));t=t*t*(3-2*t);
   const original=lut[input[y*width+x]];
   output[y*width+x]=Math.round(255*(original+(mean/16-original)*t));
  }
 }
 return output;
}

// Decode in short strips to avoid another full 8K RGBA canvas. Only one worker is
// active per Weather instance; raw downloaded records remain byte-for-byte intact.
export async function prepareGithubCloud(bitmap,channel,size={width:bitmap.width,height:bitmap.height}){
 const {width,height}=size;
 const source=`const repair=${repairCloudMask.toString()};self.onmessage=({data:{bitmap,channel,lut,width,height}})=>{try{const w=bitmap.width,h=bitmap.height,input=new Uint8Array(w*h),canvas=new OffscreenCanvas(w,64),ctx=canvas.getContext('2d',{willReadFrequently:true});for(let y=0;y<h;y+=64){const n=Math.min(64,h-y);ctx.clearRect(0,0,w,64);ctx.drawImage(bitmap,0,y,w,n,0,0,w,n);const rgba=ctx.getImageData(0,0,w,n).data;for(let i=0;i<w*n;i++)input[y*w+i]=rgba[i*4+(channel==='alpha'?3:0)];}bitmap.close();canvas.width=canvas.height=1;let output=repair(input,w,h,lut);if(width!==w){const small=new Uint8Array(width*height),sx=w/width,sy=h/height;for(let y=0;y<height;y++)for(let x=0;x<width;x++){let sum=0;for(let yy=Math.floor(y*sy);yy<Math.ceil((y+1)*sy);yy++)for(let xx=Math.floor(x*sx);xx<Math.ceil((x+1)*sx);xx++){const weight=(Math.min(xx+1,(x+1)*sx)-Math.max(xx,x*sx))*(Math.min(yy+1,(y+1)*sy)-Math.max(yy,y*sy));sum+=output[yy*w+xx]*weight;}small[y*width+x]=Math.round(sum/(sx*sy));}output=small;}self.postMessage({output},[output.buffer]);}catch(e){bitmap.close();self.postMessage({error:e.message});}};`;
 const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));let worker;
 try{
  const output=await new Promise((resolve,reject)=>{
   worker=new Worker(url);const timeout=setTimeout(()=>{worker.terminate();reject(Error('云图处理超时'));},60000);
   worker.onmessage=({data})=>{clearTimeout(timeout);data.error?reject(Error(data.error)):resolve(data.output);};
   worker.onerror=e=>{clearTimeout(timeout);reject(Error(e.message||'云图处理失败'));};
   const lut=Float32Array.from({length:256},(_,i)=>githubCloudOpacity(i/255));
   worker.postMessage({bitmap,channel,lut,width,height},[bitmap,lut.buffer]);
  });
  return {output,width,height};
 }finally{worker?.terminate();URL.revokeObjectURL(url);bitmap.close();}
}
