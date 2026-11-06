import {createSkyPainter} from './balcony-sky-view-drawing.js';
import {skyProjection3D,skyRay,skyAngles,skyPose,dragSkyPose} from './balcony-sky-view-math.js';
import {PILOT_KEY_AXES} from './pilot-controls.js';

const modes=['flat','hemisphere','sphere'];
const clampZoom=value=>Math.max(1,Math.min(3.2,value));

// Receives the same horizontal observation frame as the 2-D balcony chart.
// A target-free frame can supply an independent solar elevation in degrees.
export function createBalconySkyView(canvas,{onManual,onPick,onChange}={}){
 const originalTouch=canvas.style.touchAction,paint=createSkyPainter(canvas);
 const horizonPose=skyPose('hemisphere',215,0);
 const states={hemisphere:{pose:skyPose('hemisphere',180,90),zoom:1},sphere:{pose:skyPose('sphere',215,0),zoom:1}};
 let mode='flat',belowHorizon=true,data=null,picking=false,pickCandidate=false,disposed=false,pending=0,gesture=null;
 const pointers=new Map(),listeners=[];
 function listen(type,handler,options){canvas.addEventListener(type,handler,options);listeners.push([type,handler,options]);}
 function state(){return states[mode==='flat'?'sphere':mode];}
 function poseInfo(){return {...state().pose};}
 function projection(){
  const box=canvas.getBoundingClientRect();return skyProjection3D(mode,box.width,box.height,state().pose,state().zoom);
 }
 function draw(){
  if(disposed||mode==='flat'||!data?.frame||!Number.isFinite(data.time))return null;
  const view=projection();if(view.width<2||view.height<2)return null;
  return paint(data,view,state().pose,belowHorizon);
 }
 function schedule(){
  if(!pending&&!disposed)pending=requestAnimationFrame(()=>{pending=0;draw();});
 }
 function orientation(azimuth,elevation,roll=0,notify=true){
  if(disposed)return false;
  const next=skyPose(mode==='flat'?'sphere':mode,azimuth,elevation,roll);if(!next)return false;
  const st=state(),old=st.pose;
  if(Math.abs(old.azimuth-next.azimuth)+Math.abs(old.elevation-next.elevation)+Math.abs(old.roll-next.roll)<1e-7)return true;
  st.pose=next;if(notify){onChange?.(poseInfo());schedule();}return true;
 }
 function zoom(value){
  if(!Number.isFinite(value))return;state().zoom=clampZoom(value);schedule();
 }
 function release(){
  for(const id of pointers.keys())if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);
  pointers.clear();gesture=null;pickCandidate=false;
 }
 function setMode(next){
  if(disposed||!modes.includes(next))return false;
  if(next!==mode){
   release();mode=next;canvas.style.touchAction=mode==='flat'?originalTouch:'none';
   canvas.dataset.skyView=mode;if(mode!=='flat'){onChange?.(poseInfo());schedule();}
  }
  return true;
 }
 function setFrame(next,{follow=false}={}){
  data=next?{...next,profile:next.profile??[],segments:next.point?(next.segments??[]):[]}:null;
  if(follow&&mode!=='flat'&&data?.point)orientation(data.point.azimuth,data.point.elevation,0,false);
  if(pending){cancelAnimationFrame(pending);pending=0;}return draw();
 }
 function aimAtTarget(){if(!data?.point||mode==='flat')return false;return orientation(data.point.azimuth,data.point.elevation);}
 function aimAtZenith(){if(mode==='flat')return false;return orientation(180,90);}
 function restoreHorizon(){if(mode!=='hemisphere')return false;zoom(1);return orientation(horizonPose.azimuth,horizonPose.elevation);}
 function aimAtNadir(){return mode==='sphere'&&orientation(state().pose.azimuth,-90);}
 function setBelowHorizon(value){belowHorizon=!!value;schedule();}
 function setPicking(value){picking=Boolean(value);}
 function pick(x,y){
  if(mode==='flat')return null;
  const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return null;
  const ray=skyRay(x-box.left,y-box.top,projection());
  if(!ray||ray[2]<0)return null;return skyAngles(ray);
 }
 function reanchor(){
  const points=[...pointers.values()];
  if(!points.length){gesture=null;return;}
  const first=points[0],other=points[1];
  gesture={pose:poseInfo(),zoom:state().zoom,view:projection(),x:other?(first.x+other.x)/2:first.x,y:other?(first.y+other.y)/2:first.y,
   spread:other?Math.max(1,Math.hypot(first.x-other.x,first.y-other.y)):0,moved:false};
 }
 listen('pointerdown',e=>{
  if(mode==='flat'||disposed||e.button!==0||pointers.size>=2)return;
  e.preventDefault();canvas.focus({preventScroll:true});pickCandidate=picking&&!pointers.size;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);reanchor();
 });
 listen('pointermove',e=>{
  if(!gesture||!pointers.has(e.pointerId))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const [one,two]=pointers.values(),px=two?(one.x+two.x)/2:one.x,py=two?(one.y+two.y)/2:one.y;
  const dx=px-gesture.x,dy=py-gesture.y;
  if(!gesture.moved&&(two||Math.hypot(dx,dy)>3)){gesture.moved=true;pickCandidate=false;onManual?.();}
  if(!gesture.moved||picking)return;
  e.preventDefault();
  if(two)state().zoom=clampZoom(gesture.zoom*Math.hypot(one.x-two.x,one.y-two.y)/gesture.spread);
  const next=dragSkyPose(mode,gesture.pose,dx,dy,gesture.view);orientation(next.azimuth,next.elevation,next.roll);schedule();
 });
 function pointerEnd(e){
  if(!pointers.has(e.pointerId))return;
  if(picking&&pickCandidate&&e.type==='pointerup'&&!gesture?.moved&&pointers.size===1){const q=pick(e.clientX,e.clientY);if(q)onPick?.(q.azimuth,q.elevation);}
  pointers.delete(e.pointerId);reanchor();
 }
 listen('pointerup',pointerEnd);listen('pointercancel',pointerEnd);listen('lostpointercapture',pointerEnd);
 listen('wheel',e=>{
  if(mode==='flat'||disposed||picking)return;e.preventDefault();onManual?.();
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);
  zoom(state().zoom*Math.exp(-delta*.0018));
 },{passive:false});
 listen('keydown',e=>{
  if(mode==='flat'||disposed||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;const p=poseInfo(),step=e.shiftKey?15:5;
  const binding=PILOT_KEY_AXES[e.code];
  if(binding&&['pitch','yaw','roll'].includes(binding[0])){
   e.preventDefault();e.stopPropagation();onManual?.();
   if(binding[0]==='pitch')p.elevation+=binding[1]*step;
   if(binding[0]==='yaw')p.azimuth-=binding[1]*step;
   if(binding[0]==='roll')p.roll+=binding[1]*step;
   orientation(p.azimuth,p.elevation,p.roll);return;
  }
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','+','=','-','_'].includes(e.key))return;
  e.preventDefault();onManual?.();
  if(e.key==='Home'){aimAtZenith();return;}
  if(e.key==='End'){orientation(p.azimuth,mode==='sphere'?-90:0);return;}
  if(['+','=','-','_'].includes(e.key)){zoom(state().zoom*(['+','='].includes(e.key)?1.2:1/1.2));return;}
  if(e.key==='ArrowLeft')p.azimuth-=step;else if(e.key==='ArrowRight')p.azimuth+=step;
  else if(e.key==='ArrowUp')p.elevation+=step;else p.elevation-=step;
  orientation(p.azimuth,p.elevation,p.roll);
 });
 return {setFrame,setMode,setOrientation:orientation,getOrientation:poseInfo,get orientation(){return poseInfo();},
  get mode(){return mode;},get hasTarget(){return Boolean(data?.point);},get zoom(){return state().zoom;},get belowHorizon(){return belowHorizon;},setBelowHorizon,setPicking,aimAtTarget,aimAtZenith,aimAtNadir,restoreHorizon,pick,
  dispose(){disposed=true;release();if(pending)cancelAnimationFrame(pending);pending=0;
   for(const [ev,fn,options] of listeners)canvas.removeEventListener(ev,fn,options);
   canvas.style.touchAction=originalTouch;delete canvas.dataset.skyView;data=null;}
 };
}
