import {t} from './i18n.js';

export const modeKey={body:'舱体固定',inertial:'恒星锁定',ground:'地面点锁定'};
export async function exposureBlob(canvas){
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 if(!blob)throw Error('无法编码相片 PNG');return blob;
}
function newCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
export function compositeExposure(output,images,split=.5){
 const first=images[0];if(output.width!==first.width)output.width=first.width;if(output.height!==first.height)output.height=first.height;
 const ctx=output.getContext('2d');ctx.drawImage(first,0,0);
 if(images.length===2){const x=Math.round(first.width*split);if(x<first.width)ctx.drawImage(images[1],x,0,first.width-x,first.height,x,0,first.width-x,first.height);}
 return output;
}
export function packExposure(images){
 const {width,height}=images[0],packed=newCanvas(width*images.length,height),ctx=packed.getContext('2d');
 images.forEach((image,i)=>ctx.drawImage(image,i*width,0));return packed;
}
export async function unpackExposure(blob,count){
 if(!(blob instanceof Blob)||![1,2].includes(count))throw Error('保存的曝光图像无效');
 const url=URL.createObjectURL(blob);
 try{
  const image=new Image();image.src=url;await image.decode();
  const width=image.naturalWidth/count,height=image.naturalHeight;
  if(!Number.isInteger(width)||width<1||height<1||width>8192||height>4608||Math.abs(width/height-16/9)>.02)throw Error('保存的曝光图像无效');
  return Array.from({length:count},(_,i)=>{const c=newCanvas(width,height);c.getContext('2d').drawImage(image,i*width,0,width,height,0,0,width,height);return c;});
 }finally{URL.revokeObjectURL(url);}
}
export function exportExposure(images,modes,split,variant='view'){
 if(images.length===1||variant==='a'||variant==='b')return images[variant==='b'&&images[1]?1:0];
 const c=compositeExposure(newCanvas(images[0].width,images[0].height),images,split),ctx=c.getContext('2d');
 const x=Math.round(c.width*split),scale=c.width/1000;
 ctx.fillStyle='#e3eee4';if(x>0&&x<c.width)ctx.fillRect(x,0,Math.max(1,scale),c.height);
 ctx.font=Math.max(10,Math.round(15*scale))+'px system-ui,sans-serif';
 for(const [i,ratio] of [split,1-split].entries()){
  const label=t(modeKey[modes[i]]),w=ctx.measureText(label).width+16*scale;if(ratio*c.width<w+16*scale)continue;
  const left=i?c.width-w-8*scale:8*scale;
  ctx.fillStyle='rgba(4,13,24,.74)';ctx.fillRect(left,c.height-33*scale,w,24*scale);ctx.fillStyle='#dcf4ef';ctx.fillText(label,left+8*scale,c.height-15*scale);
 }
 return c;
}
export function mountExposureWipe(handle,film,onChange){
 let split=.5,drag=null;
 function set(value){
  split=Math.max(0,Math.min(1,Number.isFinite(value)?value:.5));handle.style.left=(split*100)+'%';handle.setAttribute('aria-valuenow',String(Math.round(split*100)));onChange(split);
 }
 const move=e=>{const box=film.getBoundingClientRect();if(box.width)set((e.clientX-box.left)/box.width);};
 handle.onpointerdown=e=>{if(e.button!==0||drag!==null)return;e.preventDefault();handle.focus({preventScroll:true});drag=e.pointerId;handle.setPointerCapture(e.pointerId);move(e);};
 handle.onpointermove=e=>{if(e.pointerId===drag)move(e);};
 handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=()=>{drag=null;};
 handle.onkeydown=e=>{
  const step=e.shiftKey ? .1 : .01;
  const v={Home:0,End:1,ArrowLeft:split-step,ArrowRight:split+step}[e.key];
  if(v==null)return;e.preventDefault();set(v);
 };
 return {set,get value(){return split;}};
}
