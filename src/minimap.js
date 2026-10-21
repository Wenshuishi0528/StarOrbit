import {interpolate,earthAxes,dot,norm,unit} from './orbit.js';

const $=id=>document.getElementById(id),DEG=Math.PI/180;
const project=(lon,lat,w,h)=>[(lon+180)/360*w,(90-lat)/180*h];
const coordinate=(n,pos,neg)=>`${Math.abs(n).toFixed(2)}°${n>=0?pos:neg}`;

export class OrbitMinimap{
 constructor(sim){
  this.sim=sim;this.panel=$('orbitMinimap');this.canvas=$('minimapCanvas');this.ctx=this.canvas.getContext('2d');
  this.visible=true;this.lastDraw=-Infinity;this.lastTrack=-Infinity;this.points=[];
  try{this.visible=localStorage.getItem('tiangong-minimap-v1')!=='off';}catch{}
  $('showMinimap').checked=this.visible;this.panel.hidden=!this.visible;
  $('showMinimap').onchange=()=>this.setVisible($('showMinimap').checked);
  $('closeMinimap').onclick=()=>{this.setVisible(false);$('showMinimap').focus();};
  this.image=new Image();this.image.onload=()=>{this.lastDraw=-Infinity;};
  this.image.src=JSON.parse($('environmentAssets').textContent).simple.day;
  this.resizeObserver=new ResizeObserver(()=>{this.lastDraw=-Infinity;});this.resizeObserver.observe(this.canvas);
 }
 setVisible(on){
  this.visible=on;this.panel.hidden=!on;$('showMinimap').checked=on;this.lastDraw=-Infinity;
  try{localStorage.setItem('tiangong-minimap-v1',on?'on':'off');}catch{}
 }
 rebuild(q){
  const s=this.sim;this.points=[];
  for(let t=Math.max(s.start,q.t-2800000);t<=Math.min(s.end,q.t+2800000);t+=20000){
   const p=interpolate(s.data.rows,t).position,fixed=earthAxes(t),v=fixed.map(a=>dot(p,a));
   this.points.push([t,Math.atan2(v[1],v[0])/DEG,Math.asin(v[2]/norm(v))/DEG]);
  }
  this.lastTrack=q.t;this.trackData=s.data;
 }
 trace(points,color,w,h){
  const c=this.ctx;c.beginPath();c.strokeStyle=color;c.lineWidth=1.7;let last;
  for(const [,lon,lat] of points){
   const p=project(lon,lat,w,h);
   if(!last)c.moveTo(...p);
   else if(Math.abs(p[0]-last[0])>w/2){
    // Split at the date line instead of drawing a false line across the map.
    const right=last[0]>w/2,x=p[0]+(right?w:-w),edge=right?w:0;
    const y=last[1]+(p[1]-last[1])*(edge-last[0])/(x-last[0]);
    c.lineTo(edge,y);c.moveTo(right?0:w,y);c.lineTo(...p);
   }else c.lineTo(...p);
   last=p;
  }
  c.stroke();
 }
 update(q,wall){
  if(!this.visible||wall-this.lastDraw<250)return;this.lastDraw=wall;
  const c=this.ctx,box=this.canvas.getBoundingClientRect(),w=box.width,h=box.height;if(!w||!h)return;
  const ratio=Math.min(devicePixelRatio||1,2),pw=Math.round(w*ratio),ph=Math.round(h*ratio);
  if(this.canvas.width!==pw||this.canvas.height!==ph){this.canvas.width=pw;this.canvas.height=ph;}
  c.setTransform(ratio,0,0,ratio,0,0);c.fillStyle='#102b3e';c.fillRect(0,0,w,h);
  if(this.image.complete&&this.image.naturalWidth)c.drawImage(this.image,0,0,w,h);
  c.fillStyle='#04132155';c.fillRect(0,0,w,h);
  if(q){
   // Same solar direction and Earth rotation as the 3D view; no new orbit model.
   const sun=q.earthAxes.map(a=>dot(unit(q.sun),a)),step=5;
   for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){
    const lon=((x+step/2)/w*360-180)*DEG,lat=(90-(y+step/2)/h*180)*DEG;
    const lit=Math.cos(lat)*(Math.cos(lon)*sun[0]+Math.sin(lon)*sun[1])+Math.sin(lat)*sun[2];
    const a=Math.min(.6,Math.max(0,-lit*8)*.6);if(a){c.fillStyle=`rgba(1,6,20,${a})`;c.fillRect(x,y,step,step);}
   }
  }
  c.strokeStyle='#b1d8e126';c.lineWidth=.6;c.beginPath();
  for(const lon of [-120,-60,0,60,120]){const x=project(lon,0,w,h)[0];c.moveTo(x,0);c.lineTo(x,h);}
  for(const lat of [-60,-30,0,30,60]){const y=project(0,lat,w,h)[1];c.moveTo(0,y);c.lineTo(w,y);}
  c.stroke();c.font='9px -apple-system,sans-serif';c.fillStyle='#d2e5edb3';c.textAlign='center';
  for(const lon of [-120,0,120])c.fillText(`${lon}°`,project(lon,0,w,h)[0],h-5);
  if(!q){$('minimapTime').textContent='轨道数据无效';$('minimapPosition').textContent='请选择有效时刻或更新轨道数据';return;}
  if(this.trackData!==this.sim.data||Math.abs(q.t-this.lastTrack)>60000)this.rebuild(q);
  const current=[q.t,q.longitude,q.latitude];
  this.trace([...this.points.filter(p=>p[0]<q.t),current],'#76e2fa',w,h);
  this.trace([current,...this.points.filter(p=>p[0]>q.t)],'#ffcc76',w,h);
  const [x,y]=project(q.longitude,q.latitude,w,h);
  c.fillStyle='#75e5ff33';c.beginPath();c.arc(x,y,8,0,Math.PI*2);c.fill();
  c.fillStyle='#fff';c.strokeStyle='#072b3c';c.lineWidth=1.7;c.beginPath();c.arc(x,y,3.7,0,Math.PI*2);c.fill();c.stroke();
  $('minimapTime').textContent=`${this.sim.mode==='real'?'实时':'模拟'} · ${new Date(q.t+8*3600000).toISOString().slice(11,19)}`;
  $('minimapPosition').textContent=`${coordinate(q.latitude,'N','S')} / ${coordinate(q.longitude,'E','W')}`;
 }
}
