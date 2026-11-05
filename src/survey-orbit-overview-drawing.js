import {earthAxes,dot} from './orbit.js';
import {geographicUV} from './environment-math.js';
import {earthTexture} from './balcony-lab-drawing.js';
import {surveyOrbitPosition,surveyProjectedPoint,surveyMapView,surveyEquatorialView,SURVEY_RADIUS_RATIO,surveyEarthIntercept,surveyWindowArcs} from './survey-orbit-overview-math.js';
import {SURVEY_PERIOD} from './survey-lab-math.js';
import {t} from './i18n.js';

const TAU=2*Math.PI,ambientColor=[6,13,21],rimColor=[19,43,53],gridColor=[95,138,149],oceanColor=[35,80,111];
export const arcColors={clear:'#76dfbb',earth:'#eb9486',sun:'#e9bd68'};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const screen=(p,layout)=>[layout.x+p.x*layout.radius,layout.y-p.y*layout.radius];
const timeText=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');

export function mapLayout(width,height){
 return {width,height,x:width/2,y:height*.515,radius:Math.min(height*.365,width*.326)};
}
function paintOrbitArc(ctx,layout,view,orbit,start,end,scale,stroke,width,{dashed=false,hideBack=false}={}){
 const count=Math.max(1,Math.ceil((end-start)/SURVEY_PERIOD*256));let previous=null,hidden=null;
 for(let i=0;i<=count;i++){
  const sec=start+(end-start)*i/count,pos=surveyOrbitPosition(orbit,sec).map(x=>x*scale);
  const p=surveyProjectedPoint(pos,view),xy=screen(p,layout);
  if(previous){
   const back=p.behindEarth&&previous.behindEarth;
   if(hidden!==back){
    if(hidden!==null)ctx.stroke();
    ctx.beginPath();ctx.moveTo(...previous.xy);ctx.lineWidth=back?Math.min(1.5,width):width;
    ctx.strokeStyle=stroke;ctx.globalAlpha=back?(hideBack?0:.47):1;
    ctx.setLineDash(back?[2.5,5]:dashed?[3,4]:[]);hidden=back;
   }
   ctx.lineTo(...xy);
  }
  previous={xy,behindEarth:p.behindEarth};
 }
 if(hidden!==null)ctx.stroke();ctx.globalAlpha=1;ctx.setLineDash([]);
}
function label(ctx,msg,x,y,color,align='left'){
 ctx.fillStyle=color;ctx.strokeStyle='rgba(5,15,24,.9)';ctx.lineWidth=3;ctx.lineJoin='round';ctx.textAlign=align;
 ctx.strokeText(msg,x,y);ctx.fillText(msg,x,y);
}
function line(ctx,points,color,width,dashes=[]){
 ctx.beginPath();ctx.moveTo(...points[0]);for(const pos of points.slice(1))ctx.lineTo(...pos);
 ctx.setLineDash(dashes);ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();ctx.setLineDash([]);
}
function paintEquatorialPlane(ctx,layout){
 const {x,y,radius}=layout;
 ctx.fillStyle='rgba(200,168,107,.055)';ctx.strokeStyle='#bca776';ctx.lineWidth=1;ctx.setLineDash([4,5]);
 ctx.beginPath();ctx.arc(x,y,radius*1.22,0,TAU);ctx.fill();ctx.stroke();ctx.setLineDash([]);
}
function paintNodes(ctx,layout,view){
 if(!view.ascending)return;
 ctx.font='10px system-ui,sans-serif';
 for(const [sign,key] of [[1,'升交点'],[-1,'降交点']]){
  const point=surveyProjectedPoint(view.ascending.map(v=>sign*v),view);
  const px=layout.x+point.x*layout.radius*SURVEY_RADIUS_RATIO,py=layout.y-point.y*layout.radius*SURVEY_RADIUS_RATIO;
  ctx.fillStyle='#e8c17d';ctx.beginPath();ctx.arc(px,py,3.2,0,TAU);ctx.fill();
  label(ctx,t(key),px,py+15,'#ecd297','center');
 }
}
// Rasterise just the disc. Geography comes from the main simulator's existing
// equirectangular day/night images; the orientation comes from its Earth axes.
function earthDisc(){
 const raster=document.createElement('canvas'),ctx=raster.getContext('2d');
 let cacheKey='',lastDay,lastNight,rays=null,pixels=null;
 function paint(view,orbit,time,day,night,resolution){
  const n=Math.round(resolution),orientation=[view.yaw,view.tilt,...view.right,...view.front,...orbit.sun,n].join('|');
  const interval=Math.floor(time/12000),rasterKey=orientation+'|'+interval;
  if(cacheKey===rasterKey&&lastDay===day&&lastNight===night)return raster;
  lastDay=day;lastNight=night;cacheKey=rasterKey;
  if(raster.width!==n||raster.height!==n){raster.width=raster.height=n;pixels=ctx.createImageData(n,n);rays=null;}
  if(!rays||rays.key!==orientation){
   const coords=new Int32Array(n*n),normals=new Float32Array(n*n*3),light=new Float32Array(n*n),rim=new Float32Array(n*n);
   let count=0;
   for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const nx=(x+.5)/n*2-1,ny=1-(y+.5)/n*2,d=nx*nx+ny*ny;if(d>=1)continue;
    const z=Math.sqrt(1-d),p=count*3;coords[count]=(y*n+x)*4;
    for(let j=0;j<3;j++)normals[p+j]=view.right[j]*nx+view.up[j]*ny+view.front[j]*z;
    light[count]=normals[p]*orbit.sun[0]+normals[p+1]*orbit.sun[1]+normals[p+2]*orbit.sun[2];rim[count]=(1-z)**4.8;count++;
   }
   rays={key:orientation,count,coords,normals,light,rim};
  }
  const [gx,gy,gz]=earthAxes((interval+.5)*12000),out=pixels.data;
  for(let i=0;i<rays.count;i++){
   const p=i*3,k=rays.coords[i],sx=rays.normals[p],sy=rays.normals[p+1],sz=rays.normals[p+2];
   const u=sx*gx[0]+sy*gx[1]+sz*gx[2],v=sx*gy[0]+sy*gy[1]+sz*gy[2],z=sx*gz[0]+sy*gz[1]+sz*gz[2];
   const [tx,ty]=geographicUV(Math.atan2(v,u)*180/Math.PI,Math.asin(clamp(z,-1,1))*180/Math.PI);
   const textureU=tx%1,textureV=1-ty,sun=rays.light[i],limb=rays.rim[i];
   const dayWeight=clamp((sun+.04)/.20,0,1),shade=.28+dayWeight*(.27+.45*Math.max(0,sun));
   const dk=day?(Math.min(day.height-1,Math.floor(textureV*day.height))*day.width+Math.min(day.width-1,Math.floor(textureU*day.width)))*4:0;
   const nk=night?(Math.min(night.height-1,Math.floor(textureV*night.height))*night.width+Math.min(night.width-1,Math.floor(textureU*night.width)))*4:0;
   const grid=Math.min(Math.abs(Math.sin(tx*12*Math.PI)),Math.abs(Math.sin((ty-.5)*6*Math.PI)))<.022;
   const fallback=grid?gridColor:oceanColor;
   for(let c=0;c<3;c++){
    const base=day?day.data[dk+c]:fallback[c],city=night?night.data[nk+c]*(1-dayWeight)*.52:0;
    out[k+c]=base*shade+city+ambientColor[c]+limb*rimColor[c]+(day&&grid?7:0);
   }
   out[k+3]=255;
  }
  ctx.putImageData(pixels,0,0);return raster;
 }
 return paint;
}

function drawRay(ctx,origin,direction,view,layout,color,dashed){
 const length=.68,tip=origin.map((v,i)=>v+direction[i]*length);
 const [sx,sy]=screen(surveyProjectedPoint(origin,view),layout),[tx,ty]=screen(surveyProjectedPoint(tip,view),layout);
 const dx=tx-sx,dy=ty-sy,size=Math.hypot(dx,dy);
 if(size<7){
  ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(tx,ty,5.7,0,TAU);ctx.stroke();
  if(dot(direction,view.front)>0){ctx.fillStyle=color;ctx.beginPath();ctx.arc(tx,ty,1.6,0,TAU);ctx.fill();}
  else{line(ctx,[[tx-3,ty-3],[tx+3,ty+3]],color,1);line(ctx,[[tx+3,ty-3],[tx-3,ty+3]],color,1);}
  return;
 }
 line(ctx,[[sx,sy],[tx,ty]],color,dashed?1.6:2,dashed?[4,4]:[]);
 const angle=Math.atan2(dy,dx);
 line(ctx,[[tx-8*Math.cos(angle-.45),ty-8*Math.sin(angle-.45)],[tx,ty],[tx-8*Math.cos(angle+.45),ty-8*Math.sin(angle+.45)]],color,1.8);
}
// No mutable scenes, cameras, meshes or GPU state are borrowed from the main
// viewer. The overview can remain mounted alongside the live telescope view.
export function createSurveyMapPainter(canvas,{sim,earthImage,onAsset}){
 const renderEarth=earthDisc(),bound=new Map(),saved=new WeakMap();let alive=true,equator=null,equatorOrbit=null;
 function imagePixels(image){
  if(!image)return null;
  if(!image.naturalWidth){
   if(!bound.has(image)&&image.addEventListener){
    const load=()=>{if(alive)onAsset();};bound.set(image,load);image.addEventListener('load',load);
   }
   return null;
  }
  if(!saved.has(image))saved.set(image,earthTexture(image));return saved.get(image);
 }
 function paint(model,yaw,tilt,equatorial=false){
  const box=canvas.getBoundingClientRect(),w=box.width,h=box.height;if(w<2||h<2)return null;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const dpr=Math.min(2,window.devicePixelRatio||1),cw=Math.round(w*dpr),ch=Math.round(h*dpr);
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  ctx.setTransform(cw/w,0,0,ch/h,0,0);ctx.clearRect(0,0,w,h);ctx.globalAlpha=1;ctx.setLineDash([]);
  if(equatorial&&(equatorOrbit!==model.orbit||equator?.roll!==yaw)){equatorOrbit=model.orbit;equator=surveyEquatorialView(model.orbit,yaw);}
  const layout=mapLayout(w,h),view=equatorial?equator:surveyMapView(model.orbit,yaw,tilt),{radius,x,y}=layout;
  const bg=ctx.createRadialGradient(x,y,0,x,y,Math.max(w,h)*.67);bg.addColorStop(0,'#10283a');bg.addColorStop(1,'#05101b');
  ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);if(equatorial)paintEquatorialPlane(ctx,layout);
  const dayImage=sim?.environment?.uniforms?.dayMap?.value?.image;
  const day=imagePixels(earthImage)||imagePixels(dayImage)||imagePixels(sim?.minimap?.image);
  const night=imagePixels(sim?.environment?.uniforms?.nightMap?.value?.image);
  const earth=renderEarth(view,model.orbit,model.orbit.epoch+model.elapsed*1000,day,night,clamp(2*radius*dpr,96,256));
  const air=ctx.createRadialGradient(x,y,radius*.98,x,y,radius*1.072);air.addColorStop(0,'rgba(105,182,211,.39)');air.addColorStop(.43,'rgba(70,129,165,.13)');air.addColorStop(1,'rgba(25,74,101,0)');
  ctx.fillStyle=air;ctx.beginPath();ctx.arc(x,y,radius*1.075,0,TAU);ctx.fill();
  ctx.drawImage(earth,x-radius,y-radius,2*radius,2*radius);
  ctx.lineWidth=1;ctx.strokeStyle='#71a1b388';ctx.beginPath();ctx.arc(x,y,radius,0,TAU);ctx.stroke();
  const arcs=surveyWindowArcs(model.visibility);
  for(const a of arcs)paintOrbitArc(ctx,layout,view,model.orbit,a.start,a.end,1,arcColors[a.kind],4.5);
  for(const j of model.jobs){
   const start=clamp(j.start,0,SURVEY_PERIOD),end=clamp(j.end??(j.start+j.duration),0,SURVEY_PERIOD);
   if(end>start)paintOrbitArc(ctx,layout,view,model.orbit,start,end,1.038,'#e3f3ff',2,{dashed:!!j.issues?.length});
  }
  const craft=surveyOrbitPosition(model.orbit,model.elapsed),p=surveyProjectedPoint(craft,view),c=screen(p,layout);
  const align=c[0]>w-90?'right':'left',tx=clamp(c[0]+(align==='right'?-10:10),8,w-8),ty=clamp(c[1]-10,13,h-7);
  ctx.font='600 11px system-ui, sans-serif';const craftLabel=t('巡天'),nameWidth=ctx.measureText(craftLabel).width;
  const nameLeft=align==='left'?tx:tx-nameWidth,nameRight=nameLeft+nameWidth;
  ctx.font='10px ui-monospace, monospace';
  for(let i=0;i<4;i++){
   const second=i*SURVEY_PERIOD/4,r=surveyOrbitPosition(model.orbit,second),pos=surveyProjectedPoint(r,view);
   if(pos.behindEarth)continue;
   const a=screen(pos,layout),b=screen(surveyProjectedPoint(r.map(v=>v*1.055),view),layout);
   line(ctx,[a,b],'#8cabb7',1);
   const rawX=x+(b[0]-x)*1.07,rawY=y+(b[1]-y)*1.065;
   const ax=Math.abs(rawX-x)<20?'center':rawX>x?'left':'right';
   const tick=timeText(second),lx=clamp(rawX,29,w-29),ly=clamp(rawY+3,13,h-6),tw=ctx.measureText(tick).width;
   const tickLeft=ax==='left'?lx:ax==='right'?lx-tw:lx-tw/2;
   if(Math.abs(ly-ty)<14&&tickLeft<nameRight+4&&tickLeft+tw>nameLeft-4)continue;
   if(Math.hypot(rawX-a[0],rawY-a[1])>2)label(ctx,tick,lx,ly,'#a0b7c0',ax);
  }
  if(equatorial)paintNodes(ctx,layout,view);
  const same=dot(model.pointing,model.direction)>.99996;
  if(!same)drawRay(ctx,craft,model.direction,view,layout,'#d3a7f1',true);
  drawRay(ctx,craft,model.pointing,view,layout,'#e5f5ff',false);
  const hit=surveyEarthIntercept(craft,model.direction);
  if(hit!=null&&hit<.68){
   const v=craft.map((q,i)=>q+hit*model.direction[i]),xy=screen(surveyProjectedPoint(v,view),layout);
   line(ctx,[[xy[0]-3,xy[1]-3],[xy[0]+3,xy[1]+3]],'#ffaf98',1.4);line(ctx,[[xy[0]+3,xy[1]-3],[xy[0]-3,xy[1]+3]],'#ffaf98',1.4);
  }
  const glow=ctx.createRadialGradient(...c,0,...c,14);glow.addColorStop(0,'rgba(159,239,255,.71)');glow.addColorStop(1,'rgba(62,129,167,0)');
  ctx.fillStyle=glow;ctx.fillRect(c[0]-14,c[1]-14,28,28);
  ctx.beginPath();ctx.arc(...c,5,0,TAU);ctx.fillStyle='#d5f7ff';ctx.fill();ctx.strokeStyle='#0a293d';ctx.lineWidth=1.5;ctx.stroke();
  ctx.font='600 11px system-ui, sans-serif';
  label(ctx,craftLabel,tx,ty,'#e3f7fc',align);
  return {layout,view};
 }
 return {paint,dispose(){alive=false;for(const [im,fn] of bound)im.removeEventListener('load',fn);bound.clear();}};
}
