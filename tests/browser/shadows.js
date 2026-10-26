import * as THREE from 'three';
import {fitSpacecraftShadow} from '../../src/spacecraft-shadow.js';

const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(384,384);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0);
const light=new THREE.DirectionalLight(0xffffff,3.4);light.castShadow=true;light.shadow.mapSize.set(1024,1024);scene.add(light,light.target);
const objects=new THREE.Group();scene.add(objects);
const material=new THREE.MeshStandardMaterial({color:0xd9d9d9,roughness:.4,side:THREE.DoubleSide});
const receiver=new THREE.Mesh(new THREE.BoxGeometry(4,4,.05),material);receiver.castShadow=receiver.receiveShadow=true;objects.add(receiver);
const blocker=new THREE.Mesh(new THREE.BoxGeometry(.35,.35,.08),material);blocker.position.set(0,0,.1);blocker.castShadow=true;objects.add(blocker);
const camera=new THREE.OrthographicCamera(-2.3,2.3,2.3,-2.3,.1,30);camera.position.set(0,0,10);camera.lookAt(0,0,0);
const gl=renderer.getContext();
function render(){renderer.render(scene,camera);const data=new Uint8Array(384*384*4);gl.readPixels(0,0,384,384,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;}
window.runShadowChecks=()=>{
 const results=[];
 // Directions sampled from the station's sunlit orbit; no auxiliary/ambient light.
 const suns=[[.83102094,.44858862,.32889579],[-.41859224,.44150678,.79363235],[-.88694394,.45988995,.04279822]];
 for(const scale of [1,100])for(const sun of suns){
  objects.scale.setScalar(scale);objects.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(objects),distance=fitSpacecraftShadow(light,bounds);
  light.position.copy(light.target.position).addScaledVector(new THREE.Vector3(...sun).normalize(),distance);
  camera.left=camera.bottom=-2.3*scale;camera.right=camera.top=2.3*scale;camera.near=.1*scale;camera.far=30*scale;camera.position.set(0,0,10*scale);camera.updateProjectionMatrix();
  const normal=light.shadow.normalBias,bias=light.shadow.bias;
  receiver.castShadow=false;blocker.visible=false;const clear=render();
  blocker.visible=true;const reference=render();
  receiver.castShadow=true;light.shadow.normalBias=.08;light.shadow.bias=-.00015;const before=render();
  light.shadow.normalBias=normal;light.shadow.bias=bias;const after=render();
  let pixels=0,beforeError=0,afterError=0,shadowPixels=0,retainedShadowPixels=0;
  for(let y=32;y<352;y++)for(let x=32;x<352;x++){
   const i=(y*384+x)*4;
   if(clear[i]-reference[i]>12){shadowPixels++;if(clear[i]-after[i]>10)retainedShadowPixels++;}
   // Compare known unoccluded surface, excluding real cast-shadow edges.
   if(clear[i]>20&&Math.abs(clear[i]-reference[i])<2){pixels++;beforeError+=Math.abs(before[i]-reference[i]);afterError+=Math.abs(after[i]-reference[i]);}
  }
  beforeError/=pixels;afterError/=pixels;
  results.push({scale,sun,pixels,beforeError,afterError,shadowPixels,retainedShadowPixels,pass:pixels>10000&&afterError<.6&&shadowPixels>20&&retainedShadowPixels>shadowPixels*.9&&gl.getError()===gl.NO_ERROR});
 }
 return results;
};
addEventListener('pagehide',()=>{renderer.dispose();renderer.forceContextLoss();});
