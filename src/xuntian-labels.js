import {dot} from './orbit.js';
import {solarApparent} from './solar-system.js';
import {solarLabel} from './solar-targets.js';
import {placeSkyLabels} from './star-chart-math.js';
import {getXuntianTarget} from './xuntian-catalog.js';
import {starInSky} from './xuntian-view-math.js';

// Lay out in logical pixels. The preview and exported image each use their own
// detector dimensions while the projection uses the same rolled optical axes.
export function finderLabels(frame,size,scale,records,limit,blocked,preview){
 const {axes,language}=frame,width=size.w/scale,height=size.h/scale;
 const tangent=Math.tan(frame.fovY*Math.PI/360),bodies=solarApparent(frame.q,frame.eyeKm);
 const candidates=[];
 function add(direction,text,planet){
  if(!starInSky(direction,axes,tangent,size.aspect,frame.eyeKm)||blocked(direction))return;
  const z=dot(direction,axes.forward),x=width/2+height*dot(direction,axes.right)/(2*z*tangent);
  const y=height/2-height*dot(direction,axes.up)/(2*z*tangent);
  candidates.push({text,planet,x,y,w:Math.ceil([...text].reduce((n,c)=>n+(/[\u3000-\uffff]/.test(c)?13:9),0))+4,h:17});
 }
 for(const body of bodies){
  if(!bodies.some(other=>other.distanceKm<body.distanceKm&&dot(other.direction,body.direction)>Math.cos(other.radiusRad))){
   add(body.direction,solarLabel(body.id,language),true);
  }
 }
 if(Number.isFinite(limit)){
  for(const star of records){
   if(candidates.length>=100)break;
   if(!star.hip||star.mag-2.5*Math.log10(star.edgeWeight??1)>limit)continue;
   if(!starInSky(star.direction,axes,tangent,size.aspect,frame.eyeKm))continue;
   if(bodies.some(body=>dot(star.direction,body.direction)>Math.cos(body.radiusRad)))continue;
   const target=getXuntianTarget(star.id,language);
   if(target&&(target.name!==target.identifier||frame.fovY<=10))add(star.direction,target.name,false);
  }
 }
 const reserved=preview?[{x:0,y:0,w:width,h:18},{x:0,y:height-20,w:width,h:20}]:[];
 return {scale,labels:placeSkyLabels(candidates,width,height,.5,reserved).slice(0,32)};
}
export function paintFinderLabels(canvas,layout){
 if(!layout?.labels.length)return;
 const ctx=canvas.getContext('2d');ctx.save();ctx.scale(layout.scale,layout.scale);
 ctx.font='13px system-ui,sans-serif';ctx.textBaseline='top';ctx.lineJoin='round';ctx.lineWidth=2.5;
 ctx.strokeStyle='rgba(2,8,15,.94)';
 for(const label of layout.labels){
  const {text,rect}=label;ctx.fillStyle=label.planet?'#ffdcab':'#d0e5f3';
  ctx.strokeText(text,rect.x+2,rect.y+2);ctx.fillText(text,rect.x+2,rect.y+2);
 }
 ctx.restore();
}
