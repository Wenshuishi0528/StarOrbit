import * as THREE from 'three';

export const DETAIL_COLUMNS=12,DETAIL_ROWS=6,DETAIL_SIZE=1800,DETAIL_GUTTER=8;
export function detailCell(lon,lat,columns=12,rows=6){
 const x=Math.floor(((lon+180)%360+360)%360/(360/columns)),y=Math.min(rows-1,Math.max(0,Math.floor((90-lat)/(180/rows))));
 return {key:`${x}-${y}`,x,y};
}
export function detailRect({x,y},columns=12,rows=6){return [x/columns,1-(y+1)/rows,1/columns,1/rows];}

// Four resident tiles, one decode in flight. No full-resolution global GPU texture.
export class EarthDetail{
 constructor(env,night=false){
  this.night=night;this.prefix=night?'nightDetail':'detail';this.columns=night?24:12;this.rows=night?12:6;
  this.env=env;this.slots=Array.from({length:4},()=>({key:null,texture:null,born:0}));
  this.wanted=[];this.failed=new Set();this.pending=false;this.epoch=0;this.lastCheck=-Infinity;
  this.inverse=new THREE.Quaternion();this.origin=new THREE.Vector3();this.point=new THREE.Vector3();this.direction=new THREE.Vector3();this.sunDirection=new THREE.Vector3();
  for(let i=0;i<4;i++){
   env.uniforms[`${this.prefix}Map${i}`]={value:env.fallback};env.uniforms[`${this.prefix}Rect${i}`]={value:new THREE.Vector4()};env.uniforms[`${this.prefix}Fade${i}`]={value:0};
  }
 }
 release(i){const slot=this.slots[i];if(slot.texture){slot.texture.dispose();slot.texture.image?.close?.();slot.texture.image=null;}slot.key=null;slot.texture=null;this.env.uniforms[`${this.prefix}Map${i}`].value=this.env.fallback;this.env.uniforms[`${this.prefix}Fade${i}`].value=0;}
 clear(){this.epoch++;this.wanted=[];for(let i=0;i<4;i++)this.release(i);}
 update(camera){
  const now=performance.now(),e=this.env;
  if(e.quality!=='high'||camera.position.length()>8371||!e.assets[this.prefix]){if(this.wanted.length||this.slots.some(s=>s.key))this.clear();return;}
  for(let i=0;i<4;i++)e.uniforms[`${this.prefix}Fade${i}`].value=this.slots[i].texture?Math.min(1,(now-this.slots[i].born)/400):0;
  if(now-this.lastCheck<250)return;this.lastCheck=now;
  camera.updateMatrixWorld();this.inverse.copy(e.earth.quaternion).invert();this.origin.copy(camera.position).applyQuaternion(this.inverse);this.sunDirection.copy(e.uniforms.sun.value).applyQuaternion(this.inverse);
  const votes=new Map();
  // Sample the actual view, not just the sub-satellite point (also works at the horizon).
  for(let iy=-2;iy<=2;iy++)for(let ix=-2;ix<=2;ix++){
   this.direction.set(ix*.46,iy*.46,.5).unproject(camera).sub(camera.position).normalize().applyQuaternion(this.inverse);
   const b=this.origin.dot(this.direction),h=b*b-this.origin.lengthSq()+6371*6371;if(h<0)continue;const distance=-b-Math.sqrt(h);if(distance<0)continue;
   this.point.copy(this.origin).addScaledVector(this.direction,distance).normalize();
   const illumination=this.point.dot(this.sunDirection);if(this.night?illumination>.1:illumination<-.15)continue;
   const cell=detailCell(Math.atan2(this.point.y,this.point.x)*180/Math.PI,Math.asin(this.point.z)*180/Math.PI,this.columns,this.rows);
   const old=votes.get(cell.key);votes.set(cell.key,{...cell,vote:(old?.vote||0)+1/(1+ix*ix+iy*iy)});
  }
  this.wanted=[...votes.values()].sort((a,b)=>b.vote-a.vote).slice(0,4);
  if(!this.wanted.length){this.clear();return;}
  for(let i=0;i<4;i++)if(this.slots[i].key&&!this.wanted.some(c=>c.key===this.slots[i].key))this.release(i);
  this.loadNext();
 }
 async loadNext(){
  if(this.pending||this.env.detailDecodeBusy)return;
  const cell=this.wanted.find(c=>!this.failed.has(c.key)&&!this.slots.some(s=>s.key===c.key));if(!cell)return;
  const index=this.slots.findIndex(s=>!s.key);if(index<0)return;
  this.pending=true;this.env.detailDecodeBusy=true;const epoch=this.epoch;let texture;
  try{
   // ImageBitmap decoding keeps JPEG work off the main animation thread.
   const response=await fetch(this.env.assets[this.prefix][cell.key]);if(!response.ok)throw Error('Detail tile unavailable');
   const bitmap=await createImageBitmap(await response.blob(),{imageOrientation:'flipY',premultiplyAlpha:'none'});
   texture=new THREE.Texture(bitmap);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,this.env.api.renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;
   if(epoch!==this.epoch||!this.wanted.some(c=>c.key===cell.key)||this.env.quality!=='high'){texture.dispose();bitmap.close();return;}
   this.env.api.renderer.initTexture(texture);
   this.slots[index]={key:cell.key,texture,born:performance.now()};
   this.env.uniforms[`${this.prefix}Map${index}`].value=texture;this.env.uniforms[`${this.prefix}Rect${index}`].value.fromArray(detailRect(cell,this.columns,this.rows));
  }catch(error){if(texture){texture.dispose();texture.image?.close?.();}this.failed.add(cell.key);console.warn('Earth detail fallback:',cell.key,error.message);}
  finally{this.pending=false;this.env.detailDecodeBusy=false;}
 }
}
