import {Raycaster,Vector3} from 'three';
import {VIEW_UNITS_PER_METRE} from './missions.js';
import {fromBasis} from './xuntian-formation-math.js';
import {groundHit} from './xuntian-view-math.js';

function visibleMesh(mesh){
  for(let node=mesh;node;node=node.parent)if(!node.visible)return false;
  return true;
}
function solidHit(hit){
  const mesh=hit.object,m=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material;
  return !!m&&m.visible&&(!m.transparent||m.opacity>.001);
}
// The renderer and the aim button must agree about the nearest solid surface.
export function inspectStationRay(sim,raycaster,{frustum,earth,pinSurface=false}={}){
  const {api}=sim;
  let visible=false,best=null,pin=null;
  const hits=[];
  if(api.model?.visible&&api.modelRoot.visible){
    for(const [id,group] of Object.entries(api.groups)){
      if(group===api.groups.freeXT||!group.visible)continue;
      const bucket=sim.tracker?.occluders?.[id];
      if(bucket&&frustum&&!frustum.intersectsBox(bucket.box))continue;
      visible=true;
      if(bucket&&!raycaster.ray.intersectsBox(bucket.box))continue;
      function intersect(mesh){
        if(!mesh.isMesh||!visibleMesh(mesh))return;
        hits.length=0;raycaster.intersectObject(mesh,false,hits);
        const hit=hits.find(solidHit);
        if(!hit)return;
        const distanceKm=hit.distance/(VIEW_UNITS_PER_METRE*1000);
        if(distanceKm>=(earth?.distanceKm??Infinity)||distanceKm>=(best?.distanceKm??Infinity))return;
        best={kind:'station',distanceKm,moduleId:id,moduleType:api.types[id]};
        if(pinSurface)pin={moduleId:id,mesh,point:mesh.worldToLocal(hit.point.clone())};
      }
      if(bucket){for(const record of bucket.records)if(raycaster.ray.intersectsBox(record.box))intersect(record.mesh);}
      else group.traverseVisible(intersect);
    }
  }
  return {visible,center:best||earth||{kind:'sky'},pin};
}

export function sampleStationPin(sim,optics){
  if(!optics||!sim.current)return null;
  sim.api.model?.updateWorldMatrix(true,true);
  const ray=new Raycaster(new Vector3(...optics.eyeLocal),new Vector3(...optics.localAxes.forward),.015);
  ray.firstHitOnly=true;
  const earth=groundHit(optics.eyeKm,optics.axes.forward,sim.current.earthAxes);
  return inspectStationRay(sim,ray,{earth,pinSurface:true}).pin;
}

export function stationPinDirection(sim,optics,pin){
  const group=sim.api.groups[pin?.moduleId];
  if(!group||!optics||!sim.current||!visibleMesh(pin.mesh))return null;
  // Detached or rebuilt module instances cannot silently acquire an old lock.
  let owner=pin.mesh;
  while(owner&&owner!==group)owner=owner.parent;
  if(!owner)return null;
  const offset=pin.mesh.localToWorld(pin.point.clone()).sub(new Vector3(...optics.eyeLocal));
  return offset.lengthSq()>1e-12?fromBasis(offset.normalize().toArray(),sim.current.basis):null;
}
