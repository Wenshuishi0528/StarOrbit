// Bundle this fixture and run checkXuntianView(viewer.sim) on the real WebGL renderer.
import * as THREE from 'three';
import {cross,dot,EARTH_RADIUS,unit} from '../../src/orbit.js';
import {equatorial} from '../../src/environment-math.js';
import {queryXuntianStars} from '../../src/xuntian-catalog.js';
import {createXuntianViewRenderer} from '../../src/xuntian-view-render.js';

const axes=(forward,up=[0,0,1])=>{const r=unit(cross(forward,up));return {right:r,up:unit(cross(r,forward)),forward};};
const basis=[[1,0,0],[0,1,0],[0,0,1]],rho=EARTH_RADIUS+405,au=149597870.7;
const scale=(v,n)=>v.map(x=>x*n),width=480,height=300;
function cleanFrame(point){return {q:{basis,earthAxes:basis,sun:[au,0,0]},axes:axes(point),eyeKm:scale(point,rho),eyeLocal:[300,-200,120],aspect:width/height,
  apertureMm:600,exposure:1,fovY:5,showGalaxy:false,showStation:false,fillLight:true};}
function pixelRay(a,fov,x,y){const k=Math.tan(fov*Math.PI/360),h=(2*(x+.5)/width-1)*k*width/height,v=(1-2*(y+.5)/height)*k;
  return unit(a.forward.map((p,i)=>p+h*a.right[i]+v*a.up[i]));}
async function pixels(blob){const bitmap=await createImageBitmap(blob),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return ctx.getImageData(0,0,c.width,c.height).data;}
const differ=(a,b,i)=>Math.max(...[0,1,2].map(k=>Math.abs(a[i+k]-b[i+k])));
function starStats(image){let flux=0,bright=0;for(let i=0;i<image.length;i+=4){flux+=image[i]+image[i+1]+image[i+2];if(Math.max(image[i],image[i+1],image[i+2])>40)bright++;}return {flux,bright};}
function centreColour(image){const sum=[0,0,0];for(let y=height/2-5;y<height/2+5;y++)for(let x=width/2-5;x<width/2+5;x++)for(let c=0;c<3;c++)sum[c]+=image[(y*width+x)*4+c];return sum;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function assert(ok,message){if(!ok)throw Error(message);}

export async function checkXuntianView(sim){
  const canvas=document.createElement('canvas');canvas.style.cssText=`width:${width}px;height:${height}px;position:absolute;left:-9999px`;
  document.body.append(canvas);const api=sim.api,renderer=api.renderer,view=createXuntianViewRenderer(sim,canvas),lab=sim.flightLab;
  const original={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),colour:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),auto:renderer.autoClear,shadowAuto:renderer.shadowMap.autoUpdate,shadowDirty:renderer.shadowMap.needsUpdate};
  const probeTarget=new THREE.WebGLRenderTarget(48,32);probeTarget.viewport.set(3,4,31,20);probeTarget.scissor.set(1,2,30,20);probeTarget.scissorTest=true;
  const snap=()=>JSON.stringify({target:renderer.getRenderTarget()?.texture.uuid,viewport:renderer.getCurrentViewport(new THREE.Vector4()).toArray(),scissor:renderer.getScissor(new THREE.Vector4()).toArray(),scissorTest:renderer.getScissorTest(),
    clear:renderer.getClearColor(new THREE.Color()).toArray(),alpha:renderer.getClearAlpha(),auto:renderer.autoClear,shadowAuto:renderer.shadowMap.autoUpdate,shadowDirty:renderer.shadowMap.needsUpdate,
    camera:api.camera.matrixWorld.toArray(),targetPoint:api.controls.target.toArray(),sun:api.sunLight.intensity,fill:api.fillLight.intensity,background:api.scene.background?.uuid||api.scene.background?.getHex?.(),env:api.scene.environment?.uuid,int:api.scene.environmentIntensity,
    freeXT:api.groups.freeXT.visible,localSun:sim.localSunArrow?.visible,root:api.modelRoot.visible,time:sim.time});
  const shot=async f=>pixels(await view.capture(f,{width}));
  async function preview(f){await sleep(84);const before=canvas.dataset.xuntianFrame,status=view.render(f);for(let k=0;k<60&&canvas.dataset.xuntianFrame===before;k++)await sleep(16);assert(canvas.dataset.xuntianFrame!==before,'small view failed to produce a frame');return status;}
  try{
    lab.open('pass');renderer.setRenderTarget(probeTarget);renderer.setClearColor(0xa02c5e,.35);renderer.autoClear=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;const initial=snap();
    const target=equatorial(56.8,24.1),source=cleanFrame(target);
    const small=starStats(await shot({...source,apertureMm:25})),standard=starStats(await shot(source)),large=starStats(await shot({...source,apertureMm:2000}));
    assert(small.bright<standard.bright&&standard.bright<large.bright,`Aperture failed to change the detectable sky: ${JSON.stringify({small,standard,large})}`);
    const red=queryXuntianStars(equatorial(88.793,7.407),.05).find(s=>s.hip===27989),blue=queryXuntianStars(equatorial(78.635,-8.202),.05).find(s=>s.hip===24436);
    const redRGB=centreColour(await shot({...cleanFrame(red.direction),apertureMm:65})),blueRGB=centreColour(await shot({...cleanFrame(blue.direction),apertureMm:65}));
    assert(redRGB[0]>redRGB[2]&&blueRGB[2]>blueRGB[0],`B-V colours lost: ${redRGB} / ${blueRGB}`);

    // Keep the Earth/day map pixel-identical while shifting the inertial catalogue 1.2 degrees.
    // Differences can therefore only be stars. A real bright star straddles the central limb.
    const sirius=queryXuntianStars(equatorial(101.287,-16.716),.05).find(s=>s.hip===32349);
    const a=axes(sirius.direction),dip=Math.acos(EARTH_RADIUS/rho),eye=a.forward.map((v,i)=>rho*(-Math.sin(dip)*v+Math.cos(dip)*a.up[i]));
    const limb={...cleanFrame(sirius.direction),axes:a,eyeKm:eye,fovY:12};
    const angle=.021,c=Math.cos(angle),s=Math.sin(angle),turn=v=>[c*v[0]-s*v[1],s*v[0]+c*v[1],v[2]];
    const shifted={...limb,axes:Object.fromEntries(Object.entries(a).map(([k,v])=>[k,turn(v)])),eyeKm:turn(eye),q:{...limb.q,earthAxes:basis.map(turn),sun:turn(limb.q.sun)}};
    const one=await shot(limb),two=await shot(shifted);let groundChecked=0,groundChanged=0,skyChanged=0,rimSky=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const ray=pixelRay(a,limb.fovY,x,y),along=-dot(eye,ray),perp=eye.map((v,i)=>v+along*ray[i]),h=Math.hypot(...perp)-EARTH_RADIUS;
      const delta=differ(one,two,(y*width+x)*4);
      if(along>0&&h<-.10){groundChecked++;if(delta>5)groundChanged++;}
      if(along>0&&h>.10&&delta>9){skyChanged++;if(Math.abs(x-width/2)<12&&Math.abs(y-height/2)<8)rimSky++;}
    }
    assert(groundChecked>40000&&groundChanged/groundChecked<.001&&skyChanged>150&&rimSky>0,`Earth masking failed: ${JSON.stringify({groundChecked,groundChanged,skyChanged,rimSky})}`);
    const location=equatorial(116.4,39.9),down=scale(location,-1),earth={...cleanFrame(down),eyeKm:scale(location,rho),fovY:8};
    const day=centreColour(await shot({...earth,q:{...earth.q,sun:scale(location,au)}})),night=centreColour(await shot({...earth,q:{...earth.q,sun:scale(location,-au)}}));
    const groundStatus=(await preview(earth)).center;
    assert(groundStatus.kind==='earth'&&Math.abs(groundStatus.latitude-39.9)<1e-7&&Math.abs(groundStatus.longitude-116.4)<1e-7,'ground centre is not at the true subpoint');
    assert(Math.max(...day.map((v,i)=>Math.abs(v-night[i])))>300,'day/night Earth imagery failed to respond to the Sun');

    // Put the real assembled station in front of the actual Cygnus catalogue.
    const box=new THREE.Box3().setFromObject(api.groups.TH),centre=box.getCenter(new THREE.Vector3()).toArray(),eyeLocal=centre.map((v,i)=>v+[390,-530,260][i]);
    const localAxes=axes(unit(centre.map((v,i)=>v-eyeLocal[i]))),sky=equatorial(305.5,40.3),windowAxes=axes(sky);
    const station={...cleanFrame(sky),localAxes,axes:windowAxes,eyeLocal,showStation:true,fovY:28};
    const body=await shot(station),clear=await shot({...station,showStation:false});
    const mask=new Uint8Array(width*height),lx=new Int32Array(height).fill(width),rx=new Int32Array(height).fill(-1);
    let covered=0,opaque=null,blockedScore=0,gap=null,gapScore=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;
      if(differ(body,clear,i*4)>14){mask[i]=1;covered++;lx[y]=Math.min(lx[y],x);rx[y]=Math.max(rx[y],x);}}
    for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
      const i=y*width+x,score=Math.max(clear[i*4],clear[i*4+1],clear[i*4+2]);
      if(mask[i]&&mask[i-1]&&mask[i+1]&&mask[i-width]&&mask[i+width]&&score>blockedScore){opaque=[x,y];blockedScore=score;}
      if(!mask[i]&&!mask[i-1]&&!mask[i+1]&&x>lx[y]+2&&x<rx[y]-2&&differ(body,clear,i*4)<=1&&score>gapScore){gap=[x,y];gapScore=score;}
    }
    assert(covered>700&&opaque&&blockedScore>45&&gap&&gapScore>35,`Expected real hull and transmitted stars between its pieces: ${JSON.stringify({covered,blockedScore,gapScore})}`);
    const retarget=xy=>({...station,axes:axes(pixelRay(windowAxes,station.fovY,...xy),windowAxes.up),localAxes:axes(pixelRay(localAxes,station.fovY,...xy),localAxes.up)});
    const blocked=(await preview(retarget(opaque))).center,through=(await preview(retarget(gap))).center;
    assert(blocked.kind==='station'&&blocked.moduleId!=='freeXT'&&through.kind==='sky',`Hull ray and pixel disagree: ${JSON.stringify({opaque,gap,blocked,through})}`);
    const selfVisible=api.groups.freeXT.visible;
    try{api.groups.freeXT.visible=!selfVisible;const selfChanged=await shot(station);let changed=0;for(let i=0;i<body.length;i+=4)if(differ(body,selfChanged,i)>1)changed++;
      assert(!changed,'The observing instrument appeared in its own view');}finally{api.groups.freeXT.visible=selfVisible;}
    const guide={...cleanFrame(equatorial(83.8,-5.4)),fovY:35,constellationId:'Ori'},photoGuide=await shot(guide),photoClean=await shot({...guide,constellationId:null});
    assert(photoGuide.every((v,i)=>v===photoClean[i]),'Guide lines were burned into a PNG');
    const guideStatus=await preview(guide),guided=canvas.getContext('2d').getImageData(0,0,width,height).data;
    await preview({...guide,constellationId:null});const baseline=canvas.getContext('2d').getImageData(0,0,width,height).data;let guidePixels=0;
    for(let i=0;i<guided.length;i+=4)if(differ(guided,baseline,i)>4)guidePixels++;
    assert(guideStatus.submitted===true&&guidePixels>50,'Selected constellation was not drawn into the preview');
    assert(snap()===initial,'Viewfinder altered the main camera, clock, render target, scissor, model, lighting or helpers');
    return {small,standard,large,redRGB,blueRGB,groundChecked,groundChanged,skyChanged,rimSky,groundStatus,day,night,covered,blockedScore,gapScore,blocked,through,guidePixels,statePreserved:true};
  }finally{
    view.dispose();canvas.remove();renderer.setRenderTarget(original.target,original.face,original.mip);renderer.setClearColor(original.colour,original.alpha);renderer.autoClear=original.auto;renderer.shadowMap.autoUpdate=original.shadowAuto;renderer.shadowMap.needsUpdate=original.shadowDirty;probeTarget.dispose();if(lab.active)lab.close();
  }
}
