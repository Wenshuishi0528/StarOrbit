import * as THREE from 'three';
import {VIEW_UNITS_PER_METRE} from './missions.js';
import {CAMERA_PRESETS, localVector, mountPosition, PHOTO_ASPECT, preferredWingBearing} from './exposure-lab-math.js';

export function wingViewBearing(sim) {
  const inverse=sim.api.model.getWorldQuaternion(new THREE.Quaternion()).invert(),panels=[];
  for(const [id,wings] of Object.entries(sim.tracker?.wings||{})){
    if(id==='freeXT')continue;
    for(const wing of wings){
      if(!wing.area||!wing.root)continue;
      const normal=new THREE.Vector3(0,0,1).transformDirection(wing.root.matrixWorld).applyQuaternion(inverse);
      panels.push({normal:normal.toArray(),area:wing.area});
    }
  }
  return preferredWingBearing(panels);
}

function visibleBounds(root,excludeWings=false) {
  const bounds=new THREE.Box3();
  root?.traverseVisible(object=>{
    if(!object.isMesh)return;
    if(excludeWings){
      for(let parent=object;parent&&parent!==root;parent=parent.parent){
        if(/^(roll_|pitch_)/.test(parent.name))return;
      }
    }
    if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return bounds;
}

export function isSolarCellMaterial(name='') {
  return /^(?:Solar_blue_display_only|.+_solar_blue)$/i.test(name);
}

// Display-scale cell and conductor geometry, measured in the mesh's local XY
// plane in metres. Integrate the periodic bands over each pixel's footprint.
// Under minification each band tends to its area fraction instead of aliasing.
const solarDetailGLSL=`varying vec3 cellSurface;
float bandIntegral(float x,float width){return floor(x)*width+min(fract(x),width);}
float cellBand(float x,float pixel,float width){
  pixel=max(pixel,.001);float a=x+.5*width;
  float filtered=(bandIntegral(a+.5*pixel,width)-bandIntegral(a-.5*pixel,width))/pixel;
  return mix(clamp(filtered,0.,1.),width,smoothstep(.45,1.05,pixel));
}
vec3 cellColour(vec3 base){
  vec2 cell=cellSurface.xy/vec2(.16,.24),pixel=fwidth(cell);
  float gapX=cellBand(cell.x,pixel.x,.065),gapY=cellBand(cell.y,pixel.y,.065);
  float seams=1.-(1.-gapX)*(1.-gapY);
  float railX=cellBand(cell.x/4.,pixel.x/4.,.032),railY=cellBand(cell.y/4.,pixel.y/4.,.028);
  float rails=1.-(1.-railX)*(1.-railY),fingers=cellBand(cell.x*3.,pixel.x*3.,.035);
  float shoulder=(1.-smoothstep(.18,.70,pixel.y))*(.5+.5*cos(6.2831853*cell.y));
  vec3 cells=base*(1.-.52*seams-.07*shoulder);
  return mix(cells,mix(base,vec3(.17,.23,.31),.62),clamp(rails+.15*fingers,0.,1.));
}`;

// Two G-buffer passes preserve the GLB material and its real surface shape.
// MeshBasicMaterial handles texture transforms, vertex colours and alpha masks.
// Normals are in body coordinates so the same surface can be relit at every time.
function surfaceMaterial(source,normalPass) {
  const material=new THREE.MeshBasicMaterial({color:source.color??0xffffff,map:source.map??null,
    alphaMap:source.alphaMap??null,alphaTest:source.alphaTest??0,opacity:source.opacity??1,
    vertexColors:source.vertexColors===true,side:source.side,blending:THREE.NoBlending,toneMapped:false});
  const coefficient=normalPass?(source.roughness??.6):(source.metalness??0);
  const solar=!normalPass&&isSolarCellMaterial(source.name);
  material.customProgramCacheKey=()=>normalPass?'exposure-normal-roughness':solar?'exposure-solar-cells':'exposure-colour-metalness';
  material.onBeforeCompile=shader=>{
    shader.uniforms.exposureCoefficient={value:coefficient};
    shader.fragmentShader='uniform float exposureCoefficient;\n'+shader.fragmentShader;
    let output='#include <opaque_fragment>\n gl_FragColor.a=exposureCoefficient;';
    if(normalPass){
      shader.vertexShader='varying vec3 hullNormal;\n'+shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n hullNormal=(vec4(normalMatrix*normal,0.)*viewMatrix).xyz;');
      shader.fragmentShader='varying vec3 hullNormal;\n'+shader.fragmentShader;
      output='vec3 direction=normalize(hullNormal)*(gl_FrontFacing?1.:-1.);gl_FragColor=vec4(.5+.5*direction,.55+.45*exposureCoefficient);';
    }
    if(solar){
      shader.vertexShader='varying vec3 cellSurface;\n'+shader.vertexShader.replace('#include <project_vertex>',
        `#include <project_vertex>\n cellSurface=vec3(position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz))/${VIEW_UNITS_PER_METRE.toFixed(1)},normal.z);`);
      shader.fragmentShader=solarDetailGLSL+'\n'+shader.fragmentShader;
      output+='\n if(gl_FrontFacing && cellSurface.z>.95)gl_FragColor.rgb=cellColour(gl_FragColor.rgb);';
    }
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',output);
  };
  return material;
}

export function captureHull(sim,{initialBody,initialCamera,openAtPosition,settings,width,height,planar,smallCube=false}) {
  const model=sim.api.model.clone(true);model.visible=true;model.quaternion.identity();model.updateMatrixWorld(true);
  const companion=model.getObjectByName('instance_freeXT');
  if(companion)companion.visible=false;
  const all=visibleBounds(model),core=visibleBounds(model.getObjectByName('instance_TH'),true);
  if(all.isEmpty())throw Error('无法读取当前舱体组合');
  const chosen=CAMERA_PRESETS[settings.preset].anchor==='core'&&!core.isEmpty()?core:all;
  const center=chosen.getCenter(new THREE.Vector3()),span=chosen.getSize(new THREE.Vector3()).length();
  const position=mountPosition(settings,center.toArray(),span,VIEW_UNITS_PER_METRE);
  if(openAtPosition)initialCamera=openAtPosition(position);
  const boxSize=all.getSize(new THREE.Vector3()).length(),far=boxSize*8+2*new THREE.Vector3(...position).distanceTo(center);
  const renderer=sim.api.renderer,scene=new THREE.Scene();scene.add(model);
  const records=[];model.traverseVisible(mesh=>{if(mesh.isMesh)records.push({mesh,source:mesh.material});});
  const targets=[],temporary=[];
  const near=Math.max(.00001,boxSize/6000),local=initialCamera.map(axis=>localVector(initialBody,axis));
  function pass(normalPass){
    const lookup=new Map();
    const get=source=>{
      if(!lookup.has(source)){const m=surfaceMaterial(source,normalPass);lookup.set(source,m);temporary.push(m);}return lookup.get(source);
    };
    for(const {mesh,source} of records)mesh.material=Array.isArray(source)?source.map(get):get(source);
    const options={minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false};
    let target;
    if(planar){
      target=new THREE.WebGLRenderTarget(width,height,{...options,samples:Math.min(4,renderer.capabilities.maxSamples)});targets.push(target);
      const camera=new THREE.PerspectiveCamera(settings.fov,PHOTO_ASPECT,near,far);camera.position.fromArray(position);
      camera.up.fromArray(local[1]);camera.lookAt(camera.position.clone().add(new THREE.Vector3(...local[2])));
      renderer.setRenderTarget(target);renderer.render(scene,camera);
    }else{
      const size=Math.min(smallCube?(width>1000?768:384):(width>1000?1280:768),renderer.capabilities.maxCubemapSize);
      const cubeOptions=normalPass?options:{...options,minFilter:THREE.LinearMipmapLinearFilter,generateMipmaps:true};
      target=new THREE.WebGLCubeRenderTarget(size,cubeOptions);targets.push(target);
      const camera=new THREE.CubeCamera(near,far,target);camera.position.fromArray(position);camera.update(renderer,scene);
    }
    return target.texture;
  }
  try{
    const normals=pass(true),surface=pass(false);
    return {normals,surface,position,initialCamera,planar,dispose(){for(const target of targets)target.dispose();}};
  }catch(error){for(const target of targets)target.dispose();throw error;}
  finally{for(const material of temporary)material.dispose();}
}
