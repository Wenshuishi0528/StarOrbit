import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

// Display lighting belongs to the viewer, so every spacecraft uses the same
// switch. Studio reflections are only enabled for auxiliary/model-only viewing.
export class SpacecraftLighting{
 constructor(api){this.api=api;this.reflection=null;}
 update(q,auxiliary){
  const {scene,renderer,fillLight,sunLight}=this.api,display=!q||auxiliary;
  if(display&&!this.reflection){
   const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
   try{this.reflection=pmrem.fromScene(room,.04);}finally{room.dispose();pmrem.dispose();}
  }
  scene.environment=display?this.reflection.texture:null;scene.environmentIntensity=.35;
  fillLight.intensity=display?.65:0;
  sunLight.color.set(0xfff8ef);sunLight.intensity=3.4*(q?q.illumination:1);
 }
 dispose(){if(this.api.scene.environment===this.reflection?.texture)this.api.scene.environment=null;this.reflection?.dispose();this.reflection=null;}
}
