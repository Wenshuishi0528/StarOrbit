import {BufferGeometry,BufferAttribute,LineBasicMaterial,LineSegments} from 'three';
import {onLanguageChange,t} from './i18n.js';

const SCALES=[.25,.5,1,2,4,8];
const SCALE_KEY='starorbit-xuntian-guide-scale-v1';
function mountScaleControl(toggle,setScale){
 const label=document.createElement('label'),caption=document.createElement('span'),select=document.createElement('select');
 label.className='xt-guide';select.id='xtGuideScale';label.append(caption,select);
 for(const value of SCALES)select.add(new Option(value+'×',String(value)));
 let saved=1;
 try{const stored=Number(localStorage.getItem(SCALE_KEY));if(SCALES.includes(stored))saved=stored;}catch{}
 select.value=String(saved);setScale(saved);
 function apply(){
  const value=Number(select.value);setScale(value);
  try{localStorage.setItem(SCALE_KEY,String(value));}catch{}
 }
 function refresh(){
  caption.textContent=t('外景视锥比例');
  label.title=t('以镜口为起点缩放外景辅助线。取景和照片使用镜头的实际视场。');
 }
 const sync=()=>{select.disabled=!toggle.checked;};
 select.addEventListener('change',apply);toggle.addEventListener('change',sync);
 toggle.closest('label').after(label);sync();refresh();
 const unsubscribe=onLanguageChange(refresh);
 return ()=>{unsubscribe();toggle.removeEventListener('change',sync);select.removeEventListener('change',apply);label.remove();};
}

export function makeScopeGuide(scene,toggle){
 const corners=[[1,1],[-1,1],[-1,-1],[1,-1]],data=new Float32Array(8*2*3);
 const geometry=new BufferGeometry(),attr=new BufferAttribute(data,3);geometry.setAttribute('position',attr);
 const guide=new LineSegments(geometry,new LineBasicMaterial({color:0x62dacc,transparent:true,opacity:.49,depthWrite:false}));guide.visible=false;guide.frustumCulled=false;guide.name='Xuntian field of view';scene.add(guide);
 let scale=1,current=null;
 function update(optics,fov,aspect){
  if(!optics){hide();return;}
  current={optics,fov,aspect};
  const {eyeLocal:eye,localAxes:{right,up,forward}}=optics;
  // Vary the distance of the drawn rectangle from the entrance. Its angular
  // opening, the optical camera and the exposure all keep the physical FOV.
  const length=scale*Math.min(155,110/Math.tan(Math.max(10,fov)*Math.PI/360)),h=Math.tan(fov*Math.PI/360)*length;
  const pts=corners.map(([x,y])=>eye.map((p,i)=>p+forward[i]*length+h*(right[i]*x*aspect+up[i]*y)));
  pts.forEach((p,i)=>{data.set(eye,i*12);data.set(p,i*12+3);data.set(p,i*12+6);data.set(pts[(i+1)%4],i*12+9);});
  attr.needsUpdate=true;guide.visible=true;
 }
 function hide(){current=null;guide.visible=false;}
 function setScale(value){
  scale=SCALES.includes(value)?value:1;
  if(current)update(current.optics,current.fov,current.aspect);
 }
 const removeControl=toggle?mountScaleControl(toggle,setScale):null;
 return {hide,update,setScale,dispose(){hide();removeControl?.();guide.removeFromParent();geometry.dispose();guide.material.dispose();}};
}
