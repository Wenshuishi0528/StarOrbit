import assert from 'node:assert/strict';
import * as THREE from 'three';
import {EARTH_EFFECTS_RADIUS,FOLLOW_SPACE_NEAR,SPACE_FAR,spaceCameraClipping,depthStepAtDistance} from '../src/space-camera-depth.js';

const earth={center:[0,0,0],radius:EARTH_EFFECTS_RADIUS};
const cameraAt=(position,target=[0,0,0],aspect=1.6)=>{
 const camera=new THREE.PerspectiveCamera(38,aspect,10,SPACE_FAR);
 camera.position.fromArray(position);camera.lookAt(...target);camera.updateMatrixWorld(true);return camera;
};
const clipping=(camera,spheres=[earth],orbitPositions=null,overview=true)=>spaceCameraClipping({overview,viewMatrix:camera.matrixWorldInverse.elements,fov:camera.fov,aspect:camera.aspect,zoom:camera.zoom,spheres,orbitPositions});
const orbit=Float32Array.from(Array.from({length:360},(_,i)=>[6800*Math.sin(i*Math.PI/180),0,6800*Math.cos(i*Math.PI/180)]).flat());
for(const distance of [7500,8000,14000,28000,45000,60000]){
 const camera=cameraAt([0,0,distance]),limits=clipping(camera,[earth,{center:[0,0,6800],radius:65}],orbit);
 assert(limits.near>100&&limits.near<distance-6865,'near must improve precision without clipping the foreground marker');
 assert(limits.far>=800000+6000,'solar disc and lunar distance must fit');
 assert(depthStepAtDistance(distance-6371,limits.near,limits.far)<.01,'24-bit Earth depth precision remains better than 10 m throughout ordinary zoom');
}
const farView=cameraAt([0,0,60000]),farLimits=clipping(farView);
const previousStep=depthStepAtDistance(60000-6371,10,SPACE_FAR),currentStep=depthStepAtDistance(60000-6371,farLimits.near,farLimits.far);
assert(previousStep>17&&currentStep<.007&&previousStep/currentStep>2000,'regression: kilometre-sized depth steps at maximum zoom');

// A high/eccentric orbit can put the satellite much nearer than the Earth.
const nearMarker={center:[0,0,59800],radius:65},closeLimits=clipping(farView,[earth,nearMarker]);
assert(closeLimits.near<135&&closeLimits.near>0,'preserve the marker 200 km in front of the camera');
const offscreenMarker={center:[1000,0,59900],radius:65},behindMarker={center:[0,0,60100],radius:65};
assert.equal(clipping(farView,[earth,offscreenMarker,behindMarker]).near,farLimits.near,'offscreen/behind-camera markers must not collapse Earth precision');

// A rendered segment crosses the view although both vertices are outside it.
const across=Float32Array.from([-1000,0,59800,1000,0,59800]);
assert.equal(clipping(farView,[earth],across).near,100,'protect the visible middle of an orbit segment');
const outside=Float32Array.from([1000,0,59900,1200,100,59800]);
assert.equal(clipping(farView,[earth],outside).near,farLimits.near,'do not use a nearby orbit segment wholly outside the view');
// Last-to-first is part of LineLoop and must participate in clipping too.
const loop=Float32Array.from([-1000,0,59800,-1000,2000,59800,1000,2000,59800,1000,0,59800]);
assert.equal(clipping(farView,[earth],loop).near,100,'include the closing segment');
const crossingEye=Float32Array.from([0,0,60100,0,0,59900]);
assert(clipping(farView,[earth],crossingEye).near<=.1,'a genuine near foreground segment takes precedence over far-Earth precision');

// Actual camera matrices exercise panning, rotation, narrow FOV and portrait
// aspect. Every sphere point inside the image must remain in front of near.
for(const camera of [cameraAt([18000,-22000,14000],[3500,2500,0]),cameraAt([18000,0,28000],[7000,0,0],.5),cameraAt([60000,0,0],[0,4500,0])]){
 camera.zoom=1.4;camera.updateProjectionMatrix();const limits=clipping(camera);let visible=0;
 for(let latitude=-90;latitude<=90;latitude+=10)for(let longitude=0;longitude<360;longitude+=10){
  const lat=latitude*Math.PI/180,lon=longitude*Math.PI/180,p=new THREE.Vector3(Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)).multiplyScalar(EARTH_EFFECTS_RADIUS);
  const view=p.clone().applyMatrix4(camera.matrixWorldInverse),ndc=p.project(camera);
  if(view.z<0&&Math.abs(ndc.x)<=1&&Math.abs(ndc.y)<=1){visible++;assert(-view.z>limits.near,'visible atmosphere/aurora shell must survive panning');}
 }
 assert(visible>0&&limits.near>100);
}

// Far clipping retains a Moon beyond the usual range after a large pan; a
// Sun 800,000 km from the eye also constrains near when looking from far away.
const largePan=cameraAt([0,0,2000000]),sun={center:[0,0,1200000],radius:6000},moon={center:[0,0,-400000],radius:1737.4};
const distant=clipping(largePan,[earth,sun,moon]);
assert(distant.near<800000-6000&&distant.far>2400000+1737.4);
const overviewAgain=clipping(farView),follow=clipping(farView,[earth],orbit,false),returned=clipping(farView);
assert.deepEqual(follow,{near:FOLLOW_SPACE_NEAR,far:SPACE_FAR});assert.deepEqual(returned,overviewAgain,'overview must be recomputed after follow/scene restore');
assert.deepEqual(clipping(cameraAt([0,0,60000],[0,0,70000]),[]),{near:FOLLOW_SPACE_NEAR,far:SPACE_FAR});
assert.equal(depthStepAtDistance(1,0,SPACE_FAR),Infinity);
console.log('Space camera clipping: zoom, 24-bit precision, high-orbit marker, full orbit segments, pan, Moon/Sun and follow transition passed',JSON.stringify({previousDepthStepKm:previousStep,currentDepthStepKm:currentStep,near:farLimits.near}));

// Wheel, mouse dolly and two-finger pinch share OrbitControls' dolly factor.
const { createOrbitControls } = await import('../src/camera-controls.js');
const { installOverviewGroundZoom, overviewGroundTarget, OVERVIEW_MAX_ZOOM } = await import('../src/overview-ground-view.js');
const { cityCameraView } = await import('../src/city-terrain-view.js');
{
 const camera = cameraAt([8200, 0, 0]);
 camera.up.set(0,0,1);
 const controls = createOrbitControls(camera, null);
 controls.minDistance = 7500;
 controls.maxDistance = 60000;
 const rotation = new THREE.Quaternion();
 let high = true;
 const close = installOverviewGroundZoom(camera, controls, () => high, () => rotation);
 controls.update();
 assert.equal(overviewGroundTarget(camera, rotation), null);
 controls._dollyIn(0.5);
 controls.update();
 assert(Math.abs(controls.getDistance()-7500)<1e-6);
 assert(Math.abs(camera.zoom-7500/4100)<1e-8);
 let site=overviewGroundTarget(camera, rotation);
 assert(Math.abs(site.longitude)<1e-8&&Math.abs(site.latitude)<1e-8);
 assert(Math.abs(site.height-1129000/camera.zoom)<1e-5&&Math.abs(site.elevation+90)<1e-4);
 assert(Math.abs(site.rollDegrees)<1e-6);
 const summit=overviewGroundTarget(camera,rotation,()=>({distanceKm:1121}));
 assert(Math.abs(summit.height-(8000+1121000/camera.zoom))<1e-5,
   'terrain intercept preserves the mountain elevation at handoff');
 assert(Math.abs(cityCameraView(camera,rotation,900,700).fovY-camera.getEffectiveFOV())<1e-10);
 rotation.setFromAxisAngle(new THREE.Vector3(0,0,1),2.7);
 controls.update();
 site=overviewGroundTarget(camera,rotation);
 assert(Math.abs(site.longitude)<1e-8&&Math.abs(site.latitude)<1e-8,'Earth-fixed point follows time');
 controls._dollyIn(0.0001);
 controls.update();
 assert.equal(camera.zoom,OVERVIEW_MAX_ZOOM);
 controls._dollyOut(0.5);
 controls.update();
 assert.equal(camera.zoom,OVERVIEW_MAX_ZOOM/2);
 controls._dollyOut(0.01);
 controls.update();
 assert.equal(camera.zoom,1);
 assert(controls.getDistance()>7500);
 high=false;
 controls._dollyIn(0.01);
 controls.update();
 assert.equal(camera.zoom,1,'4K dolly stops at original limit');
 high=true;
 controls.target.set(0,12000,0);
 camera.position.set(7500,12000,0);
 controls.update();
 controls._dollyIn(0.5);
 controls.update();
 assert.equal(camera.zoom,1,'space does not trigger ground magnification');
 controls.target.set(0,1000,1000);
 camera.position.set(7500,1000,1000);
 controls.update();
 controls._dollyIn(0.1);
 controls.update();
 site=overviewGroundTarget(camera,rotation);
 const unit=(latitude,longitude)=>new THREE.Vector3(Math.cos(latitude*Math.PI/180)*Math.cos(longitude*Math.PI/180),Math.cos(latitude*Math.PI/180)*Math.sin(longitude*Math.PI/180),Math.sin(latitude*Math.PI/180));
 const virtualEye=unit(site.observerLatitude,site.observerLongitude).multiplyScalar(6371+site.height/1000);
 const target=unit(site.latitude,site.longitude).multiplyScalar(6371);
 const direction=target.sub(virtualEye).normalize().applyQuaternion(rotation);
 assert(direction.distanceTo(camera.getWorldDirection(new THREE.Vector3()))<1e-9,'panned handoff follows the ray to the selected location');
 close.reset();
 assert.equal(camera.zoom,1);
 assert.equal(controls.rotateSpeed,1);
}
