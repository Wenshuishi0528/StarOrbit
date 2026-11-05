import * as THREE from 'three';
import {dot} from './orbit.js';
import {inspectStationRay} from './xuntian-station-pin.js';
import {equatorial} from './environment-math.js';
import {createSurveyProbe} from './survey-live-probe.js';
import {createSolarView} from './xuntian-solar-view.js';
import {createXuntianEarthView} from './xuntian-earth-view.js';
import {queryXuntianStars} from './xuntian-catalog.js';
import {CATALOG_SIGNAL,coneHalfAngle,groundHit,sensorOptics,starColour,starInSky,toLocal,VIEW_MAX_RATE} from './xuntian-view-math.js';
import {detectorSize} from './xuntian-image-quality.js';
import {backgroundFragment,guideFragment,guideVertex,quadVertex,sensorFragment,starFragment,starVertex} from './xuntian-view-shaders.js';
import {xuntianSkySource,xuntianStarPSF} from './xuntian-view-sky.js';

const axesArray=axes=>[axes.right,axes.up,axes.forward];
const matrix=columns=>new THREE.Matrix3().fromArray(columns.flat());
const v2=()=>({value:new THREE.Vector2()}),v3=()=>({value:new THREE.Vector3()}),mat=()=>({value:new THREE.Matrix3()});
const uniform=value=>({value});
const unavailable=()=>({available:false,center:{kind:'sky'},starCount:0,limitMagnitude:null,busy:false});

function frameSize(canvas,frame,width,maxWidth){
  const rect=canvas.getBoundingClientRect(),aspect=frame.aspect||((rect.width>0&&rect.height>0)?rect.width/rect.height:16/9);
  return detectorSize(rect.width||480,window.devicePixelRatio,aspect,maxWidth,width);
}
function makeTargets(renderer,w,h){
  const options={minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false};
  const type=renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
  const scene=new THREE.WebGLRenderTarget(w,h,{...options,type,depthBuffer:true});
  const film=new THREE.WebGLRenderTarget(w,h,{...options,depthBuffer:false});
  const bytes=new Uint8Array(w*h*4);
  return {w,h,scene,film,bytes,dispose(){scene.dispose();film.dispose();this.earth?.dispose();}};
}
function withSharedRenderer(renderer,draw){
  const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
  const colour=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),auto=renderer.autoClear;
  const shadow=renderer.shadowMap,shadowAuto=shadow.autoUpdate,shadowDirty=shadow.needsUpdate,xr=renderer.xr.enabled;
  try{
    // Use the main scene's existing shadow map without updating it from this camera.
    renderer.xr.enabled=false;shadow.autoUpdate=false;shadow.needsUpdate=false;renderer.autoClear=false;renderer.setClearColor(0,0);
    return draw();
  }finally{
    renderer.setRenderTarget(target,face,mip);renderer.setClearColor(colour,alpha);renderer.autoClear=auto;
    shadow.autoUpdate=shadowAuto;shadow.needsUpdate=shadowDirty;renderer.xr.enabled=xr;
  }
}
function screenPass(geometry,fragmentShader,uniforms){
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:quadVertex,fragmentShader,depthTest:false,depthWrite:false,toneMapped:false});
  const quad=new THREE.Mesh(geometry,material);quad.frustumCulled=false;
  const scene=new THREE.Scene();scene.add(quad);return {scene,material};
}

// Add celestial radiance without turning stars or teaching guides into opaque
// foreground pixels. The original assembly alone writes foreground coverage.
const celestialBlend={blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneFactor,
  blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor};
function makeStarLayer(renderer,shared){
  const geometry=new THREE.BufferGeometry(),u={...shared,inertialToCamera:mat(),pointSigma:v2(),starSignal:uniform(1),limitMagnitude:uniform(12),
    maxPointSize:uniform(renderer.getContext().getParameter(renderer.getContext().ALIASED_POINT_SIZE_RANGE)[1])};
  const material=new THREE.ShaderMaterial({uniforms:u,vertexShader:starVertex,fragmentShader:starFragment,depthTest:false,depthWrite:false,
    transparent:true,...celestialBlend,toneMapped:false});
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;const scene=new THREE.Scene();scene.add(points);
  let records=[],cache=null,capacity=0;
  function update(frame,optics,aspect,height,sky,limit){
    points.visible=sky.showStars&&sky.gain>0;
    if(!points.visible)return 0;
    const radius=coneHalfAngle(optics.tangent,aspect),need=Math.ceil((limit+.4)*2)/2;
    const distance=cache?Math.acos(Math.min(1,Math.max(-1,dot(frame.axes.forward,cache.center))))*180/Math.PI:Infinity;
    if(!cache||distance+radius>cache.radius+1e-8||need>cache.magnitude){
      const padded=Math.min(179,radius+Math.min(5,Math.max(.20,radius*.25)));
      records=queryXuntianStars(frame.axes.forward,padded,{maxMagnitude:need});cache={center:[...frame.axes.forward],radius:padded,magnitude:need};
      if(!capacity||records.length>capacity){
        capacity=2**Math.ceil(Math.log2(Math.max(32,records.length)));geometry.dispose();
        for(const [name,size] of [['position',3],['magnitude',1],['tint',3],['edgeWeight',1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(new Float32Array(capacity*size),size).setUsage(THREE.DynamicDrawUsage));
      }
      const {position,magnitude,tint,edgeWeight}=geometry.attributes;
      for(let i=0;i<records.length;i++){
        const star=records[i];position.setXYZ(i,...star.direction);magnitude.setX(i,star.mag);
        tint.setXYZ(i,...starColour(star.bv));edgeWeight.setX(i,star.edgeWeight??1);
      }
      for(const a of [position,magnitude,tint,edgeWeight])a.needsUpdate=true;
      geometry.setDrawRange(0,records.length);
    }
    const psf=xuntianStarPSF(optics,height);
    u.inertialToCamera.value.copy(matrix(axesArray(frame.axes))).transpose();u.pointSigma.value.set(psf.core,psf.wing);
    u.starSignal.value=sky.gain*CATALOG_SIGNAL;u.limitMagnitude.value=limit;
    let count=0;
    for(const star of records)if(star.mag-2.5*Math.log10(Math.max(1e-8,star.edgeWeight??1))<=limit&&starInSky(star.direction,frame.axes,optics.tangent,aspect,frame.eyeKm))count++;
    return count;
  }
  return {scene,material,update,dispose(){geometry.dispose();material.dispose();}};
}

// Reuse the chart's measured J2000 constellation polylines. A great-circle arc
// projects to a straight line in this camera's tangent plane. Capture omits guides.
function constellationGuide(environment,shared){
  const u={...shared,inertialToCamera:mat(),inverseGain:uniform(1)},geometry=new THREE.BufferGeometry();
  const material=new THREE.ShaderMaterial({uniforms:u,vertexShader:guideVertex,fragmentShader:guideFragment,
    transparent:true,...celestialBlend,toneMapped:false,depthTest:false,depthWrite:false});
  const scene=new THREE.Scene(),lines=new THREE.LineSegments(geometry,material);lines.frustumCulled=false;scene.add(lines);
  let previous=null,count=0;
  function draw(renderer,camera,id,axes,gain){
    if(!id)return;
    if(previous!==id){
      previous=id;const source=environment.starChart?.constellations.find(c=>c.id===id),positions=[];
      for(const path of source?.lines||[])for(let i=1;i<path.length;i++)positions.push(...equatorial(...path[i-1]),...equatorial(...path[i]));
      count=positions.length/3;geometry.dispose();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setDrawRange(0,count);
    }
    if(!count)return;
    u.inertialToCamera.value.copy(matrix(axes)).transpose();u.inverseGain.value=1/Math.max(.0001,gain);renderer.render(scene,camera);
  }
  return {draw,dispose(){geometry.dispose();material.dispose();}};
}

function stationView(sim){
  const {api}=sim,raycaster=new THREE.Raycaster(),frustum=new THREE.Frustum(),projection=new THREE.Matrix4();raycaster.firstHitOnly=true;
  const camera=new THREE.PerspectiveCamera(),direction=new THREE.Vector3();
  function prepare(frame,aspect){
    const {q,axes,localAxes}=frame,dirs=localAxes||Object.fromEntries(Object.entries(axes).map(([key,axis])=>[key,toLocal(q.basis,axis)]));
    direction.fromArray(dirs.forward).normalize();camera.position.fromArray(frame.eyeLocal);camera.up.fromArray(dirs.up);
    camera.lookAt(camera.position.clone().add(direction));camera.aspect=aspect;camera.fov=frame.fovY;
    camera.near=.015;camera.far=Math.max(10000,camera.position.length()*2+5000);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    raycaster.set(camera.position,direction);raycaster.near=camera.near;raycaster.far=camera.far;
  }
  function inspect(frame,earth){
    if(frame.showStation===false)return {visible:false,center:earth||{kind:'sky'}};
    return inspectStationRay(sim,raycaster,{frustum,earth});
  }
  function draw(renderer,fill){
    const scene=api.scene,hidden=[],bg=scene.background,env=scene.environment,envStrength=scene.environmentIntensity,fillIntensity=api.fillLight.intensity;
    const hide=object=>{if(object?.visible){hidden.push(object);object.visible=false;}};
    try{
      for(const child of scene.children)if(child!==api.modelRoot&&!child.isLight&&child!==api.sunLight.target)hide(child);
      for(const child of api.modelRoot.children)if(child!==api.model)hide(child);
      // Omit the observing vehicle alone. Docked Xuntian copies remain part of the assembly.
      hide(api.groups.freeXT);scene.background=null;scene.environment=fill?(sim.lighting?.reflection?.texture||env):null;
      scene.environmentIntensity=.35;api.fillLight.intensity=fill?.65:0;
      renderer.clearDepth();renderer.render(scene,camera);
    }finally{
      for(const child of hidden)child.visible=true;
      scene.background=bg;scene.environment=env;scene.environmentIntensity=envStrength;api.fillLight.intensity=fillIntensity;
    }
  }
  return {prepare,inspect,draw};
}

function writeCanvas(canvas,image,bytes,w,h){
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('巡天取景图像生成失败');
  const pixels=image?.width===w&&image.height===h?image:ctx.createImageData(w,h),stride=w*4;
  for(let row=0;row<h;row++)pixels.data.set(bytes.subarray((h-1-row)*stride,(h-row)*stride),row*stride);
  ctx.putImageData(pixels,0,0);return pixels;
}

export function createXuntianViewRenderer(sim,canvas){
  const renderer=sim.api.renderer,env=sim.environment,geometry=new THREE.PlaneGeometry(2,2),screenCamera=new THREE.Camera();
  const shared={lens:v2(),screen:v2(),cameraToFixed:mat(),fixedEye:v3()};
  const u={...shared,cameraToInertial:mat(),galaxy:uniform(null),galaxyMode:uniform(0),skyGain:uniform(1),mainSkyHDR:uniform(0),opticalGain:uniform(1),toneMappingExposure:uniform(1)};
  const sensor={image:uniform(null),gain:uniform(1),earthImage:uniform(null),earthOn:uniform(0),earthExposure:uniform(1)};
  const background=screenPass(geometry,backgroundFragment,u),film=screenPass(geometry,sensorFragment,sensor);
  const earthView=createXuntianEarthView(env,geometry),solarView=createSolarView(env,geometry,shared);
  const stars=makeStarLayer(renderer,shared),guide=constellationGuide(env,shared),station=stationView(sim);
  let surveyProbe=null,preview=null,previewImage=null,previewPending=false,capturePending=false,disposed=false,lastRender=-Infinity,lastStatus=unavailable(),previewCount=0;
  function valid(frame){return !!(frame?.q?.basis&&frame?.q?.earthAxes&&frame?.axes?.forward&&frame?.axes?.right&&frame?.axes?.up&&frame.eyeKm&&frame.eyeLocal&&frame.fovY>0&&frame.fovY<179&&frame.apertureMm>0);}
  function draw(frame,size,target,annotations=false){
    const {w,h,aspect}=size,optics=sensorOptics(frame.fovY,frame.apertureMm,frame.exposure??1),axes=axesArray(frame.axes),ground=groundHit(frame.eyeKm,frame.axes.forward,frame.q.earthAxes);
    station.prepare(frame,aspect);const local=station.inspect(frame,ground);
    u.cameraToInertial.value.copy(matrix(axes));u.cameraToFixed.value.copy(matrix(axes.map(axis=>toLocal(frame.q.earthAxes,axis))));
    u.fixedEye.value.fromArray(toLocal(frame.q.earthAxes,frame.eyeKm));
    u.lens.value.set(optics.tangent*aspect,optics.tangent);u.screen.value.set(w,h);
    const sky=xuntianSkySource(env,frame),panorama=sky.status==='panorama';
    u.galaxy.value=panorama?env.galaxyTexture:null;
    u.galaxyMode.value=panorama?2:['off','catalog'].includes(sky.status)?0:1;u.skyGain.value=sky.gain;
    u.mainSkyHDR.value=env.quality==='high'&&renderer.extensions.has('EXT_color_buffer_float')&&!env.hdr.failed?1:0;
    u.opticalGain.value=optics.areaGain;u.toneMappingExposure.value=renderer.toneMappingExposure;
    sensor.image.value=target.scene.texture;sensor.gain.value=optics.areaGain;
    const limit=sky.showStars&&sky.gain>0?optics.limitMagnitude+2.5*Math.log10(sky.gain):null;
    const count=stars.update(frame,optics,aspect,h,sky,limit);
    withSharedRenderer(renderer,()=>{
      sensor.earthImage.value=earthView.render(renderer,frame,size,target);
      sensor.earthOn.value=sensor.earthImage.value?1:0;sensor.earthExposure.value=frame.exposure??1;
      renderer.setRenderTarget(target.scene);renderer.clear(true,true,false);renderer.render(background.scene,screenCamera);
      if(annotations)guide.draw(renderer,screenCamera,frame.constellationId,axes,optics.areaGain);
      renderer.render(stars.scene,screenCamera);
      solarView.draw(renderer,screenCamera,frame,size,optics);
      if(local.visible)station.draw(renderer,!!frame.fillLight);
      renderer.setRenderTarget(target.film);renderer.clear(true,false,false);renderer.render(film.scene,screenCamera);
      if([background.material,stars.material,film.material].some(material=>renderer.properties.get(material).currentProgram?.diagnostics?.runnable===false))throw Error('巡天取景图像生成失败');
    });
    return {available:true,center:local.center,starCount:count,limitMagnitude:limit,busy:false};
  }
  async function read(target){
    if(renderer.readRenderTargetPixelsAsync)await renderer.readRenderTargetPixelsAsync(target.film,0,0,target.w,target.h,target.bytes);
    else renderer.readRenderTargetPixels(target.film,0,0,target.w,target.h,target.bytes);
    if(!target.bytes[3])throw Error('巡天取景图像生成失败');
  }
  return {
    earthSource:earthView.source,earthAppearanceKey:earthView.appearanceKey,solarAppearanceKey:solarView.key,
    render(frame){
      if(disposed||!valid(frame))return unavailable();
      const now=performance.now();
      if(previewPending||capturePending||now-lastRender<1000/VIEW_MAX_RATE)return {...lastStatus,busy:previewPending};
      const size=frameSize(canvas,frame,undefined,renderer.capabilities.maxTextureSize);if(!preview||preview.w!==size.w||preview.h!==size.h){preview?.dispose();preview=makeTargets(renderer,size.w,size.h);}
      const current=preview;lastRender=now;lastStatus=draw(frame,size,current,true);previewPending=true;
      read(current).then(()=>{
        if(disposed)return;previewImage=writeCanvas(canvas,previewImage,current.bytes,size.w,size.h);canvas.dataset.xuntianFrame=String(++previewCount);
      }).catch(()=>{if(!disposed){lastStatus={...lastStatus,available:false};canvas.dataset.xuntianFrame='error';}}).finally(()=>{previewPending=false;if(disposed)current.dispose();});
      return {...lastStatus,busy:true,submitted:true};
    },
    async capture(frame,{width=1440,surveyTarget=null,atShutter=null,onExposure=null}={}){
      if(disposed||!valid(frame))throw Error('没有可用的巡天光学位置');
      if(capturePending)throw Error('正在保存巡天取景照片');
      capturePending=true;let target;
      try{
        const bounded=Math.max(32,Math.min(3840,renderer.capabilities.maxTextureSize,Math.round(width)||1440)),size=frameSize(canvas,frame,bounded,renderer.capabilities.maxTextureSize);
        await Promise.all([earthView.preparePhoto(frame,size),solarView.preparePhoto(frame,size)]);if(disposed)throw Error('巡天取景器已关闭');
        // The terrain prefetch may yield. Snapshot the live model time and
        // entrance together immediately before drawing a survey shutter.
        const actual=atShutter?atShutter():frame;
        if(!valid(actual))throw Error('没有可用的巡天光学位置');
        target=makeTargets(renderer,size.w,size.h);const result=draw(actual,size,target);
        if(surveyTarget&&onExposure){
          surveyProbe??=createSurveyProbe(geometry);
          const coverage=withSharedRenderer(renderer,()=>surveyProbe.measure(renderer,target.scene.texture,actual,surveyTarget));
          onExposure(actual,{center:result.center,coverage,width:size.w,height:size.h});
        }
        await read(target);if(disposed)throw Error('巡天取景器已关闭');
        const out=document.createElement('canvas');writeCanvas(out,null,target.bytes,size.w,size.h);
        const blob=await new Promise(resolve=>out.toBlob(resolve,'image/png'));if(!blob||disposed)throw Error('巡天取景图像生成失败');return blob;
      }finally{target?.dispose();capturePending=false;}
    },
    dispose(){
      if(disposed)return;disposed=true;if(!previewPending)preview?.dispose();preview=null;previewImage=null;
      surveyProbe?.dispose();solarView.dispose();earthView.dispose();geometry.dispose();background.material.dispose();film.material.dispose();stars.dispose();guide.dispose();
    }
  };
}
