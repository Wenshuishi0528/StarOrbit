// The telescope owns steering only while its eyepiece is focused.
export function mountScopeInput(canvas,{nudge,zoom,field,roll=()=>{},togglePin=()=>{}}){
 const held=new Map(),points=new Map();
 const rolls={KeyQ:-1,KeyE:1};
 const directions={KeyW:[0,1],KeyS:[0,-1],KeyA:[-1,0],KeyD:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
 const clear=()=>{held.clear();points.clear();canvas.classList.remove('dragging');};
 canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  canvas.focus({preventScroll:true});points.set(e.pointerId,[e.clientX,e.clientY]);canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');e.preventDefault();
 });
 canvas.addEventListener('pointermove',e=>{
  const old=points.get(e.pointerId);if(!old)return;
  const next=[e.clientX,e.clientY];
  if(points.size===2){
   const other=Array.from(points).find(([id])=>id!==e.pointerId)[1];
   const before=Math.hypot(old[0]-other[0],old[1]-other[1]),after=Math.hypot(next[0]-other[0],next[1]-other[1]);
   if(before>6&&after>6)zoom(Math.log(after/before)*.20);
  }else if(points.size===1){
   const scale=field()/Math.max(1,canvas.clientHeight);
   if(old[0]!==next[0]||old[1]!==next[1])nudge((old[0]-next[0])*scale,(next[1]-old[1])*scale);
  }
  points.set(e.pointerId,next);
 });
 const end=e=>{points.delete(e.pointerId);if(!points.size)canvas.classList.remove('dragging');};
 for(const k of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(k,end);
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(-Math.sign(e.deltaY)*.035);},{passive:false});
 canvas.addEventListener('keydown',e=>{
  if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='Escape'){canvas.blur();return;}
  if(e.code==='KeyF'){e.preventDefault();e.stopPropagation();if(!e.repeat)togglePin();return;}
  if(directions[e.code]||rolls[e.code]){e.preventDefault();e.stopPropagation();if(!held.has(e.code))held.set(e.code,false);}
 });
 canvas.addEventListener('keyup',e=>{
  if(e.code==='KeyF'){e.stopPropagation();return;}
  const direction=directions[e.code],rotation=rolls[e.code];if(!direction&&!rotation)return;
  // A quick tap can begin and end between two animation frames, especially
  // when rendering Earth. Only supply a discrete step if no frame handled it.
  if(held.get(e.code)===false&&document.activeElement===canvas){
   if(direction){const step=Math.min(2,field()*.045);nudge(direction[0]*step,direction[1]*step);}
   else roll(rotation*5);
  }
  held.delete(e.code);e.stopPropagation();
 });
 canvas.addEventListener('blur',clear);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);
 return {clear,step(dt){
  if(!held.size||dt<=0||document.activeElement!==canvas)return;
  const [x,y,r]=Array.from(held.keys()).reduce(([a,b,c],k)=>[a+(directions[k]?.[0]||0),b+(directions[k]?.[1]||0),c+(rolls[k]||0)],[0,0,0]);
  for(const key of held.keys())held.set(key,true);
  if(r)roll(r*60*dt);
  if(x||y){const s=(field()*.65)*dt/Math.hypot(x,y);nudge(x*s,y*s);}
 }};
}
