import {t,initLanguage,onLanguageChange,setText,getLanguage} from './i18n.js';
import {installSessionMemory} from './session-memory.js';
import { Simulation } from './simulation.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {describeAssembly,replaceAttachment,matingTransforms,placementMatrices} from './assembly.js';
initLanguage();
const $=id=>document.getElementById(id),meta=JSON.parse($('modelMeta').textContent),names={TH:'天和',WT:'问天',MT:'梦天',TZ:'天舟',SZ:'神舟',XT:'巡天'},slotNames={TH_WENTIAN:'节点左侧',TH_MENGTIAN:'节点右侧',TH_FORWARD:'节点前端',TH_LOWER:'节点下方',TH_AFT:'天和尾端'},defaults={TH_WENTIAN:'WT',TH_MENGTIAN:'MT',TH_FORWARD:'SZ',TH_LOWER:'',TH_AFT:'TZ'},state={slots:{...defaults},showXT:true,target:'TH_WENTIAN',linked:false,pair:true,angles:{}};
let assembly=describeAssembly(state.slots);
const stage=$('stage'),scene=new THREE.Scene();scene.background=null;const camera=new THREE.PerspectiveCamera(38,1,.1,5000);camera.up.set(0,0,1);const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;stage.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=15;controls.maxDistance=1600;
const fillLight=new THREE.AmbientLight(0xbccde5,.025),sunLight=new THREE.DirectionalLight(0xfff8ef,3.4);scene.add(fillLight,sunLight,sunLight.target);sunLight.castShadow=true;sunLight.shadow.mapSize.set(4096,4096);sunLight.shadow.bias=-.00015;sunLight.shadow.normalBias=.08;sunLight.shadow.camera.near=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
let sim=null;
const modelRoot=new THREE.Group();scene.add(modelRoot);let model,ready=false,playing=false,last=0,saveTimer;const groups={},rig={},tags={},mating=matingTransforms(meta),templates={},types={};const mats=m=>new THREE.Matrix4().set(...m.flat());const copyTo=(o,m)=>{m.decompose(o.position,o.quaternion,o.scale);o.updateMatrixWorld(true);};
function toast(key,params={}){setText('toast',key,params);$('toast').style.opacity=1;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.opacity=0,3000);}
const zeroAngles=()=>({roll:0,left:0,right:0});
const coreName=id=>assembly.cores.length===1?t('天和核心舱'):t('天和核心舱 {number}',{number:assembly.byId.get(id).number});
const instanceName=id=>{
 if(id==='freeXT')return t('巡天 · 独立飞行');
 const item=assembly.byId.get(id);if(!item)return '';
 if(item.type==='TH')return coreName(id);
 const name=t(names[item.type]),port=t(slotNames[item.hostPort]);
 return assembly.cores.length===1?`${name} · ${port}`:t('{module} · {core} · {port}',{module:name,core:coreName(item.parentId),port});
};
const moduleName=k=>t({TH:'天和核心舱',WT:'问天实验舱',MT:'梦天实验舱',SZ:'神舟飞船',TZ:'天舟货运飞船',XT:'巡天望远镜'}[k]);
const labs=()=>Object.keys(groups).filter(id=>['WT','MT'].includes(types[id]));
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem('tiangong-viewer-v3',JSON.stringify(state));}catch{}},200);}
function loadState(){try{
 const current=localStorage.getItem('tiangong-viewer-v3')||localStorage.getItem('tiangong-viewer-v2'),s=JSON.parse(current||localStorage.getItem('tiangong-viewer-v1'));if(!s)return;
 state.slots=describeAssembly(s.slots).slots;
 state.showXT=s.showXT!==false;state.target=current?s.target:(s.target==='TH'?'TH':Object.keys(state.slots).find(id=>state.slots[id]===s.target)||'freeXT');state.linked=!!s.linked;state.pair=s.pair!==false;
 for(const id of ['TH',...Object.keys(state.slots),'freeXT']){state.angles[id]=zeroAngles();const oldKey=id==='TH'?'TH':id==='freeXT'?'XT':state.slots[id];for(const a of ['roll','left','right']){const v=Number(s.angles?.[current?id:oldKey]?.[a]);state.angles[id][a]=Number.isFinite(v)?THREE.MathUtils.clamp(v,-180,180):0;}}
}catch{}}
function renderPorts(){
 const cards=new Map();$('ports').replaceChildren();
 for(const core of assembly.cores){
  const card=document.createElement('fieldset');card.className='core-ports';card.dataset.core=core.id;
  const title=document.createElement('legend');title.textContent=coreName(core.id);card.append(title);
  if(core.parentId){const note=document.createElement('p');note.className='small core-connection';note.textContent=t('尾口已连接：{core} · {port}',{core:coreName(core.parentId),port:t(slotNames[core.hostPort])});card.append(note);}
  cards.set(core.id,card);$('ports').append(card);
 }
 for(const {id,coreId,port} of assembly.ports){
  const row=document.createElement('div');row.className='row';const lab=document.createElement('label');lab.htmlFor=id;lab.textContent=t(slotNames[port]);
  const sel=document.createElement('select');sel.id=id;sel.setAttribute('aria-label',`${coreName(coreId)} · ${t(slotNames[port])}`);
  sel.replaceChildren(new Option(t('空置'),''),...Object.keys(names).map(k=>new Option(moduleName(k),k)));sel.value=state.slots[id];row.append(lab,sel);cards.get(coreId).append(row);
  sel.onchange=()=>{state.slots=replaceAttachment(state.slots,id,sel.value);state.angles[id]=zeroAngles();applyConfig();fit();save();};
 }
}
function addInstance(id,type){
 const g=templates[type].clone(true);g.name='instance_'+id;model.add(g);groups[id]=g;types[id]=type;
 rig[id]={roll:g.getObjectByName('roll_'+type),left:g.getObjectByName('pitch_'+type+'_L'),right:g.getObjectByName('pitch_'+type+'_R')};
 state.angles[id]??=zeroAngles();
 const el=document.createElement('div');el.className='station-tag';el.textContent=instanceName(id);Object.assign(el.style,{position:'absolute',padding:'4px 8px',border:'1px solid #355066',borderRadius:'5px',color:'#c8e0f0',background:'#0a1724bb',fontSize:'11px',whiteSpace:'nowrap',pointerEvents:'none',transform:'translate(-50%,-130%)'});stage.appendChild(el);tags[id]={el,anchor:new THREE.Vector3(type==='TH'?45:40,0,13)};
}
function applyConfig(){if(!ready)return;playing=false;$('animate').textContent=t('▶ 演示自转');
 assembly=describeAssembly(state.slots);state.slots=assembly.slots;
 const wanted=Object.fromEntries(assembly.instances.map(item=>[item.id,item.type]));if(state.showXT)wanted.freeXT='XT';
 for(const id of Object.keys(state.angles))if(!wanted[id])delete state.angles[id];
 for(const id of Object.keys(groups))if(wanted[id]!==types[id]){groups[id].removeFromParent();tags[id].el.remove();delete groups[id];delete rig[id];delete tags[id];delete types[id];}
 for(const [id,k]of Object.entries(wanted)){state.angles[id]??=zeroAngles();if(!groups[id])addInstance(id,k);copyTo(groups[id],mats(meta.modules[k].matrix));}
 for(const [id,M] of placementMatrices(meta,assembly,mating))copyTo(groups[id],M);
 renderPorts();for(const [id,tag] of Object.entries(tags))tag.el.textContent=instanceName(id);
 $('showXT').checked=state.showXT;$('showXT').disabled=false;
 if(!groups[state.target])state.target=Object.keys(groups).find(id=>id!=='TH')||'TH';
 $('target').replaceChildren(...Object.keys(groups).map(id=>new Option(instanceName(id),id)));$('target').value=state.target;$('linkLabs').checked=state.linked;$('pairWings').checked=state.pair;
 setText('status','{count} 个舱体',{count:Object.keys(groups).length});applyAngles();controls.maxDistance=Math.max(1600,bounds().getSize(new THREE.Vector3()).length()*4);syncControls();sim?.rebuild();}
function applyAngles(){for(const k of Object.keys(groups)){const a=state.angles[k];if(rig[k].roll)rig[k].roll.rotation.x=THREE.MathUtils.degToRad(a.roll);rig[k].left.rotation.y=THREE.MathUtils.degToRad(a.left);rig[k].right.rotation.y=THREE.MathUtils.degToRad(a.right);}model.updateMatrixWorld(true);}
function syncControls(){const k=state.target,shown=!!groups[k],lab=['WT','MT'].includes(types[k]);$('rotationControls').classList.toggle('disabled',!shown);$('rollControl').classList.toggle('hidden',!lab);$('rightControl').classList.toggle('hidden',state.pair);$('linkLabs').disabled=!(labs().length>1&&lab);for(const a of ['roll','left','right']){$(a).value=state.angles[k][a];$(a+'N').value=Math.round(state.angles[k][a]);}$('selection').textContent=t('{name}{linked}',{name:instanceName(k),linked:state.linked&&!sim?.auto&&lab&&!$('linkLabs').disabled?t(' · 实验舱联动'):''});$('motionHint').textContent='';}
function linkSign(a,from,to){model.updateMatrixWorld(true);const u=new THREE.Vector3(a==='roll'?1:0,a==='roll'?0:1,0),v=u.clone();u.transformDirection((a==='roll'?groups[from]:rig[from].left.parent).matrixWorld);v.transformDirection((a==='roll'?groups[to]:rig[to].left.parent).matrixWorld);return u.dot(v)<-.5?-1:1;}
function changeAngle(a,value){sim?.manual();const k=state.target;if(!groups[k].visible)return;const v=THREE.MathUtils.clamp(Number(value)||0,-180,180),ks=state.linked&&['WT','MT'].includes(types[k])?labs():[k];for(const n of ks){const nv=n===k?v:v*linkSign(a,k,n);state.angles[n][a]=nv;if(state.pair&&a!=='roll')state.angles[n].left=state.angles[n].right=nv;}applyAngles();syncControls();save();}
for(const a of ['roll','left','right']){ $(a).oninput=e=>changeAngle(a,e.target.value);$(a+'N').onchange=e=>changeAngle(a,e.target.value);}
$('target').onchange=()=>{playing=false;$('animate').textContent=t('▶ 演示自转');state.target=$('target').value;syncControls();save();};$('pairWings').onchange=()=>{state.pair=$('pairWings').checked;if(state.pair)changeAngle('left',state.angles[state.target].left);syncControls();save();};$('linkLabs').onchange=()=>{state.linked=$('linkLabs').checked;if(state.linked){for(const a of ['roll','left','right'])changeAngle(a,state.angles[state.target][a]);toast('已同步所有问天、梦天实例');}syncControls();save();};$('showXT').onchange=()=>{state.showXT=$('showXT').checked;applyConfig();fit();save();};
$('zero').onclick=()=>{for(const a of ['roll','left','right'])changeAngle(a,0);playing=false;$('animate').textContent=t('▶ 演示自转');};$('animate').onclick=()=>{if(!groups[state.target].visible)return;playing=!playing;$('animate').textContent=playing?t('Ⅱ 暂停演示'):t('▶ 演示自转');};
function bounds(key){const b=new THREE.Box3();for(const [k,g]of Object.entries(groups))if(g.visible&&(!key||k===key))b.union(new THREE.Box3().setFromObject(g));return b;}
// Keep model depth precision independent of the much larger Earth scene.
// A tiny fixed near plane made nearby CAD surfaces fight when zooming out.
function updateModelClipping(){
 const distance=camera.position.distanceTo(controls.target);
 const near=Math.max(.05,distance/100),far=Math.max(3000,distance*4);
 if(camera.near!==near||camera.far!==far){camera.near=near;camera.far=far;camera.updateProjectionMatrix();}
}
function fit(key,dir){if(!ready)return;if(sim?.view==='orbit'&&!key&&!dir){sim.fit();return;}if(sim?.view==='orbit')sim.setView('follow');const b=bounds(key);if(b.isEmpty())return;const center=b.getCenter(new THREE.Vector3()),radius=b.getSize(new THREE.Vector3()).length()/2;const d=dir?new THREE.Vector3(...dir).normalize():camera.position.clone().sub(controls.target).normalize();if(d.length()<.1)d.set(1,-1,1);const fov=THREE.MathUtils.degToRad(camera.fov),effective=Math.min(fov,2*Math.atan(Math.tan(fov/2)*camera.aspect)),initial=radius/Math.sin(effective/2),right=new THREE.Vector3().crossVectors(camera.up,d).normalize(),up=new THREE.Vector3().crossVectors(d,right).normalize();let dist=10;const tanV=Math.tan(fov/2),tanH=tanV*camera.aspect;for(const [k,g] of Object.entries(groups)){if(!g.visible||(key&&k!==key))continue;g.updateMatrixWorld(true);g.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();const box=o.geometry.boundingBox;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).applyMatrix4(o.matrixWorld).sub(center);dist=Math.max(dist,p.dot(d)+Math.abs(p.dot(right))/tanH,p.dot(d)+Math.abs(p.dot(up))/tanV);}});}dist*=1.14;controls.target.copy(center);camera.position.copy(center).addScaledVector(d,dist);updateModelClipping();controls.update();}
$('fit').onclick=()=>fit();$('focus').onclick=()=>{if(groups[state.target].visible)fit(state.target);else toast('所选舱体不在当前组合中');};document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>fit(null,{top:[0,.001,1],bottom:[0,-.001,-1],side:[0,-1,.001],iso:[1,-1,1.25],horizon:[1,-1,.35]}[b.dataset.view]));
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{state.slots={...defaults};state.showXT=b.dataset.preset==='full';if(b.dataset.preset==='labs'){state.slots.TH_FORWARD='';state.slots.TH_AFT='';}if(b.dataset.preset==='core'){Object.keys(state.slots).forEach(k=>state.slots[k]='');state.target='TH';}else state.target='TH_WENTIAN';applyConfig();fit(null,[1,-1,1.25]);save();});$('reset').onclick=()=>{state.slots={...defaults};state.showXT=true;state.target='TH_WENTIAN';state.linked=false;state.pair=true;state.angles={};applyConfig();fit(null,[1,-1,1.25]);save();toast('已恢复默认组合、角度与视角');};$('saveImage').onclick=()=>{if(sim)sim.render();else renderer.render(scene,camera);const a=document.createElement('a');a.download=getLanguage()==='en'?'Tiangong_space_station.png':'天宫_空间站预览.png';a.href=renderer.domElement.toDataURL('image/png');a.click();};
const renderSize=new THREE.Vector2();
function resize(){
 const w=stage.clientWidth,h=stage.clientHeight;if(w<1||h<1)return;
 renderer.getSize(renderSize);
 // CSS fills the stage even while the browser's fullscreen animation is running.
 // Only reallocate the drawing buffer when its logical size actually changes.
 if(renderSize.x!==w||renderSize.y!==h)renderer.setSize(w,h,false);
 if(camera.aspect!==w/h){camera.aspect=w/h;camera.updateProjectionMatrix();}
}
function tick(t){requestAnimationFrame(tick);if(document.hidden)return;resize();const dt=Math.min((t-last)/1000,.1);last=t;if(ready&&sim)sim.update(t);if(ready&&playing)changeAngle('left',((state.angles[state.target].left+dt*15+180)%360)-180);controls.update();updateModelClipping();if(ready){for(const [k,tag]of Object.entries(tags)){const p=tag.anchor.clone().applyMatrix4(groups[k].matrixWorld).project(camera);tag.el.style.display=groups[k].visible&&$('labels').checked&&p.z<1&&p.z>-1&&Math.abs(p.x)<1&&Math.abs(p.y)<1?'block':'none';tag.el.style.left=((p.x+1)*stage.clientWidth/2)+'px';tag.el.style.top=((-p.y+1)*stage.clientHeight/2)+'px';}}if(sim)sim.render();else renderer.render(scene,camera);}requestAnimationFrame(tick);
async function boot(){try{const encoded=$('modelData').textContent.trim(),bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));setText('loadText','正在展开模型并建立太阳翼转轴…');const buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();const gltf=await new GLTFLoader().parseAsync(buffer,'');model=gltf.scene;modelRoot.add(model);
for(const k of Object.keys(names)){templates[k]=model.getObjectByName('module_'+k);if(!templates[k])throw Error(t('缺少模型 {module}',{module:k}));}
model.traverse(o=>{if(o.isMesh){o.frustumCulled=true;const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){m.roughness=Math.max(m.roughness,.4);m.metalness=Math.min(m.metalness,.6);}}});for(const t of Object.values(templates))t.removeFromParent();loadState();ready=true;resize();applyConfig();fit(null,[1,-1,1.25]);sim=new Simulation({groups,rig,state,types,model,modelRoot,scene,camera,renderer,stage,controls,sunLight,fillLight,tags,resize,syncControls,labs,toast,stopAnimation:()=>{playing=false;$('animate').textContent=t('▶ 演示自转');}});fit(null,[1,-1,.35]);await installSessionMemory(sim,{saveAssembly:()=>{clearTimeout(saveTimer);localStorage.setItem('tiangong-viewer-v3',JSON.stringify(state));},getPlaying:()=>playing,setPlaying:v=>{playing=v;$('animate').textContent=t(v?'Ⅱ 暂停演示':'▶ 演示自转');}});$('loading').classList.add('hidden');document.body.dataset.ready='true';window.viewer={state,groups,rig,scene,camera,controls,fit,applyConfig,changeAngle,renderer,meta,types,sim};}catch(e){console.error(e);$('loading').querySelector('.spinner').style.display='none';setText('loadingTitle','模型未能载入');setText('loadText','请使用新版 Chrome、Edge 或 Safari 打开本文件。错误：{error}',{error:e.message});setText('status','载入失败');}}
onLanguageChange(()=>{
 if(ready){renderPorts();for(const [id,tag] of Object.entries(tags))tag.el.textContent=instanceName(id);
  $('target').replaceChildren(...Object.keys(groups).map(id=>new Option(instanceName(id),id)));$('target').value=state.target;
  syncControls();
 }
 $('animate').textContent=t(playing?'Ⅱ 暂停演示':'▶ 演示自转');
});
boot();
