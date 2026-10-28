import * as THREE from 'three';
const matrix=rows=>new THREE.Matrix4().set(...rows.flat());
const place=(template,rows)=>{const model=template.clone(true);matrix(rows).decompose(model.position,model.quaternion,model.scale);model.visible=true;model.updateMatrixWorld(true);return model;};

// Centreline training optic. A raised eye point creates large parallax at capture.
// Orientation is set once in body coordinates, never aimed at the moving target.
export function createDockingCamera(){
 const camera=new THREE.PerspectiveCamera(40,1,.02,6000);camera.up.set(0,0,1);
 camera.position.set(-.05,0,0);camera.lookAt(-1,0,0);return camera;
}

// The existing mating anchors lie behind extended docking petals. For this
// rigid teaching scene use the exposed petal-envelope contact planes, keeping
// their centreline. This avoids overlapping the two unanimated docking caps.
export function createDockingModels(templates,meta){
 const core=place(templates.TH,meta.modules.TH.matrix),ship=place(templates.SZ,meta.modules.SZ.matrix);
 const targetAnchor=new THREE.Vector3().setFromMatrixPosition(matrix(meta.modules.TH.matrix).multiply(matrix(meta.modules.TH.ports.TH_FORWARD)));
 const chaserAnchor=new THREE.Vector3().setFromMatrixPosition(matrix(meta.modules.SZ.matrix).multiply(matrix(meta.modules.SZ.ports.SZ_INBOARD)));
 const coreBounds=new THREE.Box3().setFromObject(core),shipBounds=new THREE.Box3().setFromObject(ship);
 targetAnchor.x=coreBounds.max.x;chaserAnchor.x=shipBounds.min.x;
 const station=new THREE.Group();station.scale.setScalar(.2);station.position.copy(targetAnchor).multiplyScalar(-.2);station.add(core);
 for(const name of ['WT','MT'])station.add(place(templates[name],meta.modules[name].matrix));
 const chaser=new THREE.Group(),craft=new THREE.Group();craft.scale.setScalar(.2);craft.position.copy(chaserAnchor).multiplyScalar(-.2);craft.add(ship);chaser.add(craft);
 station.updateMatrixWorld(true);chaser.updateMatrixWorld(true);
 return {station,chaser,core,ship,targetAnchor:targetAnchor.toArray(),chaserAnchor:chaserAnchor.toArray()};
}
