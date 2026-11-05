import * as THREE from 'three';
import {createXuntianViewRenderer} from '../../src/xuntian-view-render.js';
import {equatorial} from '../../src/environment-math.js';
import {queryXuntianStars} from '../../src/xuntian-catalog.js';
import {mainSkyReference} from './xuntian-main-sky-reference.js';

const WIDTH=562,HEIGHT=351,FOV=30,APERTURE=315;
const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const waitPreview=async canvas=>{for(let i=0;i<180&&!Number(canvas.dataset.xuntianFrame);i++)await raf();if(!Number(canvas.dataset.xuntianFrame))throw Error('LMC preview unavailable');};
async function dataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
function project(dir,axes,w,h){
 const v=new THREE.Vector3().fromArray(dir),z=v.dot(axes.forward),tan=Math.tan(FOV*Math.PI/360);
 return [(v.dot(axes.right)/(z*tan*1.6)+1)*w/2-.5,(1-v.dot(axes.up)/(z*tan))*h/2-.5];
}
export async function captureLMC(sim){
 const env=sim.environment;sim.flightLab.open('pass');await env.ready;await env.skyLoad;
 if(!env.galaxyTexture){await env.setSkyStyle();await env.skyLoad;}
 if(!env.galaxyTexture)throw Error('A resident Milky Way cube is required');
 const forward=new THREE.Vector3().fromArray(equatorial(81,-69.96)),right=forward.clone().cross(new THREE.Vector3(0,0,1)).normalize(),up=right.clone().cross(forward).normalize();
 const axes={right,up,forward},dirs=Object.fromEntries(Object.entries(axes).map(([key,v])=>[key,v.toArray()]));
 const row=sim.data.rows.reduce((best,row)=>{const radial=new THREE.Vector3(...row.slice(1,4)).normalize(),score=radial.dot(forward);return score>best.score?{row,score}:best;},{score:-2}).row;
 sim.seek(row[0]);sim.update(performance.now());const q=sim.current;
 const canvas=document.createElement('canvas');canvas.style.cssText='position:absolute;left:-9999px;width:562px;height:351px';document.body.append(canvas);
 const view=createXuntianViewRenderer(sim,canvas);
 const f={q,eyeKm:q.position,eyeLocal:[0,0,0],axes:dirs,fovY:FOV,apertureMm:APERTURE,exposure:4,showGalaxy:true,showStars:true,showStation:false,aspect:1.6};
 const files={};
 try{
  const result=view.render(f);await waitPreview(canvas);files.live=canvas.toDataURL('image/png');files.photo=await dataURL(await view.capture(f,{width:1440}));
  const catalogBlob=await view.capture({...f,showGalaxy:false},{width:WIDTH});
  const isolated=await createImageBitmap(catalogBlob),probe=document.createElement('canvas');probe.width=isolated.width;probe.height=isolated.height;
  const ctx=probe.getContext('2d');ctx.drawImage(isolated,0,0);isolated.close();
  const values=ctx.getImageData(0,0,probe.width,probe.height).data;let bright=0;
  for(let i=0;i<values.length;i+=4)if(Math.max(values[i],values[i+1],values[i+2])>16)bright++;
  if(bright<1000||!result.starCount)throw Error('LMC catalogue did not produce resolved stars: '+bright);
  files.catalog=await dataURL(catalogBlob);
  for(const pixelRatio of [1,2])files['main'+pixelRatio]=mainSkyReference(sim,f,WIDTH,HEIGHT,{pixelRatio}).toDataURL('image/png');
  const stars=queryXuntianStars(dirs.forward,28,{maxMagnitude:7.7}).map(s=>({mag:s.mag,id:s.id,xy:project(s.direction,axes,WIDTH,HEIGHT)})).filter(s=>s.xy[0]>10&&s.xy[0]<WIDTH-10&&s.xy[1]>10&&s.xy[1]<HEIGHT-10);
  return {files,meta:{starCount:result.starCount,stars,time:q.t,skySize:env.skySize,quality:env.quality,mainSky:[env.milky.visible,env.milky.material.uniforms.textured.value,env.milky.material.uniforms.skyMap.value===env.galaxyTexture],eye:q.position,axes:dirs,w:canvas.width,h:canvas.height}};
 }finally{view.dispose();canvas.remove();sim.flightLab.close();}
}
