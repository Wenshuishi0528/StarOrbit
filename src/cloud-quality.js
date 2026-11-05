import {CLOUD_QUALITY_SCHEMA} from './cloud-source.js';

// A conservative artifact screen, not cloud classification or proof of observation
// accuracy. Operates once per candidate on a bounded sample, never per frame.
export function inspectCloudPixels(pixels,width=1024,height=512){
 if(pixels.length!==width*height||width<3||height<3)throw Error('云图质量检查尺寸无效');
 const histogram=new Uint32Array(256);let plateauCount=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const value=pixels[y*width+x];if(value<180)continue;
  let low=255,high=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const v=pixels[Math.max(0,Math.min(height-1,y+dy))*width+(x+dx+width)%width];low=Math.min(low,v);high=Math.max(high,v);
  }
  if(high-low<=2){histogram[value]++;plateauCount++;}
 }
 let plateauPeak=0,plateauValue=0;for(let v=180;v<256;v++)if(histogram[v]>plateauPeak){plateauPeak=histogram[v];plateauValue=v;}
 const plateauFraction=plateauPeak/pixels.length,plateauDominance=plateauCount?plateauPeak/plateauCount:0;
 const reasons=[];
 if(plateauFraction>=.005&&plateauDominance>=.60)reasons.push('high-opacity-plateau');
 const edge=(a,b,c,d)=>Math.abs(c-b)>=64&&Math.abs(b-a)<=12&&Math.abs(d-c)<=12?Math.sign(c-b):0;
 const run=(length,read)=>{let longest=0,current=0,previous=0;for(let i=0;i<length;i++){const sign=read(i);current=sign?(sign===previous?current+1:1):0;previous=sign;longest=Math.max(longest,current);}return longest;};
 const datelineRun=run(height,y=>{const offset=y*width;return edge(pixels[offset+width-2],pixels[offset+width-1],pixels[offset],pixels[offset+1]);});
 let verticalRun=0,horizontalRun=0;
 for(let x=1;x<width-2;x++)verticalRun=Math.max(verticalRun,run(height,y=>{const i=y*width+x;return edge(pixels[i-1],pixels[i],pixels[i+1],pixels[i+2]);}));
 for(let y=1;y<height-2;y++)horizontalRun=Math.max(horizontalRun,run(width,x=>{const i=y*width+x;return edge(pixels[i-width],pixels[i],pixels[i+width],pixels[i+width*2]);}));
 if(datelineRun>=32)reasons.push('dateline-seam');
 if(verticalRun>=64||horizontalRun>=128)reasons.push('internal-seam');
 return {schema:CLOUD_QUALITY_SCHEMA,status:reasons.length?'rejected':'accepted',reasons,metrics:{sampleWidth:width,sampleHeight:height,plateauFraction,plateauDominance,plateauValue,datelineRun,verticalRun,horizontalRun}};
}

export function requireCloudQuality(quality){
 const labels={'high-opacity-plateau':'大面积重复的高不透明度平台','dateline-seam':'日期线附近的长直拼接缝','internal-seam':'云图内部的长直拼接缝'};
 if(quality.status!=='accepted')throw Object.assign(Error('云图质量检查未通过：'+quality.reasons.map(code=>labels[code]||code).join('；')+'；已有云图已保留'),{retryable:false,quality});
 return quality;
}

export async function inspectCloudBitmap(bitmap){
 const width=1024,height=512,canvas=new OffscreenCanvas(bitmap.width,1),ctx=canvas.getContext('2d',{willReadFrequently:true}),pixels=new Uint8Array(width*height);
 try{
  // Exact source-centre sampling matches the desktop converter's NEAREST rule.
  // A one-row canvas avoids another full-resolution RGBA allocation.
  for(let y=0;y<height;y++){
   if(y&&y%32===0)await new Promise(resolve=>setTimeout(resolve,0));
   const sy=Math.min(bitmap.height-1,Math.floor((y+.5)*bitmap.height/height));
   ctx.clearRect(0,0,bitmap.width,1);ctx.drawImage(bitmap,0,sy,bitmap.width,1,0,0,bitmap.width,1);
   const rgba=ctx.getImageData(0,0,bitmap.width,1).data;
   for(let x=0;x<width;x++)pixels[y*width+x]=rgba[Math.min(bitmap.width-1,Math.floor((x+.5)*bitmap.width/width))*4];
  }
  return inspectCloudPixels(pixels,width,height);
 }finally{canvas.width=canvas.height=1;}
}
