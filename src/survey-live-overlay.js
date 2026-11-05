import {targetEdges,skyCompass,angularScale} from './survey-live-geometry.js';

export function mountSurveyOverlay(canvas){
 const ctx=canvas.getContext('2d');let previous='';
 function paint(axes,fovY,target,directions){
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio||1);
  if(!w||!h)return;
  const key=[w,h,dpr,fovY,target?.fieldId,target?.tile,directions,...axes.right,...axes.up,...axes.forward].join('|');
  if(key===previous)return;previous=key;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.lineJoin='round';ctx.lineCap='round';
  ctx.shadowColor='#020711';ctx.shadowBlur=3;
  if(target){
   ctx.strokeStyle='#ffce81';ctx.lineWidth=1.5;ctx.setLineDash([7,4]);ctx.beginPath();
   for(const [a,b] of targetEdges(target,axes,fovY,w/h)){ctx.moveTo(a[0]*w,a[1]*h);ctx.lineTo(b[0]*w,b[1]*h);}ctx.stroke();ctx.setLineDash([]);
  }
  if(!directions)return;
  const compass=skyCompass(axes);ctx.strokeStyle=ctx.fillStyle='#b3dfed';ctx.font='600 10px system-ui';ctx.lineWidth=1;
  if(compass){const x=w-30,y=h-46,r=15;
   for(const [i,[dx,dy]] of compass.entries()){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx*r,y+dy*r);ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i?'E':'N',x+dx*(r+6),y+dy*(r+6));}
  }
  const scale=angularScale(fovY,h);if(scale){const x=10,y=h-29;
   ctx.beginPath();ctx.moveTo(x,y-3);ctx.lineTo(x,y);ctx.lineTo(x+scale.pixels,y);ctx.lineTo(x+scale.pixels,y-3);ctx.stroke();
   ctx.font='10px ui-monospace,monospace';ctx.textAlign='left';ctx.textBaseline='bottom';ctx.fillText(scale.label,x,y-3);}
 }
 return {paint,reset(){previous='';}};
}
