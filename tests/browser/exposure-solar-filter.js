// Bundle this entry with esbuild and run checkSolarFilter(viewer.sim) in the
// application browser. Uses its actual solar-cell material and WebGL renderer.
import * as THREE from 'three';
import {captureHull,isSolarCellMaterial} from '../../src/exposure-lab-hull.js';
import {mountPosition,presetCamera} from '../../src/exposure-lab-math.js';
import {cross,unit} from '../../src/orbit.js';
import {VIEW_UNITS_PER_METRE as units} from '../../src/missions.js';

export function checkSolarFilter(sim){
  const renderer=sim.api.renderer,colour=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),previous=renderer.getRenderTarget();
  const auto=renderer.autoClear;let original;
  sim.api.model.traverse(node=>{if(!node.isMesh)return;for(const m of [].concat(node.material))if(isSolarCellMaterial(m.name))original=m;});
  if(!original)throw Error('Fixture has no actual solar cell material');
  const width=640,height=360,identity=[[1,0,0],[0,1,0],[0,0,1]];
  function image(z,shift,name){
    const dimensions=z>100?[22,36]:[6,12],span=Math.hypot(...dimensions)*units;
    const geo=new THREE.PlaneGeometry(dimensions[0]*units,dimensions[1]*units);geo.translate(shift*units,0,0);
    const material=original.clone();material.name=name;const card=new THREE.Mesh(geo,material);card.position.x=-shift*units;
    const model=new THREE.Group();model.add(card);
    const settings={...presetCamera('limb',0),z,fov:z>100?96:65};
    const eye=mountPosition(settings,[0,0,0],span,units),forward=unit(eye.map(x=>-x)),right=unit(cross(forward,[0,0,1]));
    const axes=[right,cross(right,forward),forward];
    const capture=captureHull({api:{model,renderer}},{initialBody:identity,initialCamera:axes,settings,width,height,planar:true});
    const target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:false});
    const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:{source:{value:capture.surface}},
      vertexShader:'varying vec2 uvFilm;void main(){uvFilm=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'uniform sampler2D source;varying vec2 uvFilm;void main(){gl_FragColor=vec4(texture2D(source,uvFilm).rgb,1.);}',toneMapped:false}));
    quad.frustumCulled=false;const scene=new THREE.Scene();scene.add(quad);
    try{
      renderer.setRenderTarget(target);renderer.render(scene,new THREE.Camera());const out=new Uint8Array(width*height*4);
      renderer.readRenderTargetPixels(target,0,0,width,height,out);return out;
    }finally{quad.geometry.dispose();quad.material.dispose();target.dispose();capture.dispose();material.dispose();geo.dispose();}
  }
  function difference(a,b){
    let changed=0,tested=0,max=0,absolute=0;
    for(let i=0;i<a.length;i+=4){if(Math.max(a[i+2],b[i+2])<4)continue;tested++;
      const delta=Math.max(...[0,1,2].map(k=>Math.abs(a[i+k]-b[i+k])));
      absolute+=delta;max=Math.max(max,delta);if(delta>1)changed++;
    }
    return {tested,changed,max,mean:absolute/Math.max(1,tested)};
  }
  try{
    renderer.setClearColor(0,0);renderer.autoClear=true;
    const active=original.name,plain='Panel_frames';
    const front=difference(image(4,0,active),image(4,0,plain));
    const back=difference(image(-20,0,active),image(-20,0,plain));
    const window=difference(image(4,0,'UD01_blue_recessed_window'),image(4,0,plain));
    // Same silhouette, same exposure and material. Move the grid half a cell
    // inside its local coordinates at a distance where cells are subpixel.
    const wide=difference(image(350,0,active),image(350,.08,active));
    if(front.changed<300||back.changed||window.changed||wide.tested<120||wide.mean>.75||wide.max>3)
      throw Error('Solar face or minification regression: '+JSON.stringify({front,back,window,wide}));
    return {front,back,window,wide};
  }finally{renderer.setRenderTarget(previous);renderer.setClearColor(colour,alpha);renderer.autoClear=auto;}
}
