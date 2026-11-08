import assert from 'node:assert/strict';
import {dot,EARTH_RADIUS,unit} from '../src/orbit.js';
import {coneHalfAngle,groundHit,sensorOptics,starColour,starInSky,toLocal} from '../src/xuntian-view-math.js';
const close=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}`);
const identity=[[1,0,0],[0,1,0],[0,0,1]],eye=[EARTH_RADIUS+405,0,0];
const nadir=groundHit(eye,[-1,0,0],identity);assert.equal(nadir.kind,'earth');close(nadir.distanceKm,405);close(nadir.latitude,0);close(nadir.longitude,0);
assert.equal(groundHit(eye,[1,0,0],identity),null);assert.equal(groundHit(eye,[0,1,0],identity),null);
const nadirRot=groundHit(eye,[-1,0,0],[[0,1,0],[-1,0,0],[0,0,1]]);close(nadirRot.longitude,-90);
const tilt=Math.acos(EARTH_RADIUS/eye[0]),ray=delta=>[-Math.sin(tilt+delta),Math.cos(tilt+delta),0];
assert(groundHit(eye,ray(.0001),identity));assert.equal(groundHit(eye,ray(-.0001),identity),null);
const axes={right:[0,0,-1],up:[1,0,0],forward:[0,1,0]};
assert(starInSky(ray(-.01),axes,1,1.6,eye));assert(!starInSky(ray(.01),axes,1,1.6,eye));assert(!starInSky([0,-1,0],axes,1,1.6,eye));
const small=sensorOptics(5,25),standard=sensorOptics(5,600),large=sensorOptics(5,2000);
close(standard.areaGain/small.areaGain,(600/25)**2);close(large.areaGain/standard.areaGain,(2000/600)**2);
assert(large.limitMagnitude>standard.limitMagnitude&&standard.limitMagnitude>small.limitMagnitude);
assert(small.sigmaAt300>large.sigmaAt300);assert(small.diffraction>large.diffraction);
const narrow=sensorOptics(.2,25);assert(narrow.sigmaAt300>small.sigmaAt300);close(narrow.areaGain,small.areaGain);
assert(coneHalfAngle(standard.tangent,1.6)>2.5);close(coneHalfAngle(1,1),Math.atan(Math.sqrt(2))*180/Math.PI);
assert(starColour(1.4)[0]>starColour(1.4)[2]);assert(starColour(-.28)[2]>starColour(-.28)[0]);assert(starColour(null).every(Number.isFinite));
const transformed=toLocal(identity,unit([1,2,3]));close(dot(transformed,transformed),1);
console.log('Xuntian optics: gnomonic field, Earth limb intersections and geography, B–V colour, aperture area, angular diffraction and magnitude reach passed.');
const {detectorSize,earthMapSizes}=await import('../src/xuntian-image-quality.js');
assert.deepEqual(detectorSize(292,2,1.6),{w:584,h:365,aspect:1.6});
assert.deepEqual(detectorSize(750,2,1.6),{w:1500,h:938,aspect:1.6});
assert.equal(detectorSize(1400,3).w,2048);
assert.equal(detectorSize(292,2,1.6,2048,3840).w,2048);
assert.deepEqual(detectorSize(292,2,1.6,8192,3840),{w:3840,h:2400,aspect:1.6});
const env={uniforms:{dayMap:{value:{image:{width:8192}}},nightMap:{value:{image:{width:4096}}}},loading:false,settings:{quality:'simple'}};
assert.deepEqual(earthMapSizes(env),{day:8192,night:4096,loading:false});
console.log('Viewfinder uses physical display pixels, bounded GPU targets, independent PNG size and actual loaded source dimensions.');

// A reticle lock on a moving wing follows that point through rotation and releases on removal.
const {Mesh,Group,BoxGeometry,MeshBasicMaterial}=await import('three');
const {sampleStationPin,stationPinDirection}=await import('../src/xuntian-station-pin.js');
const root=new Group(),station=new Group(),freeXT=new Group(),pivot=new Group();
root.add(station,freeXT);station.add(pivot);
const plate=new Mesh(new BoxGeometry(2,2,2),new MeshBasicMaterial());plate.position.set(0,0,-10);
pivot.add(plate);const self=plate.clone();self.position.z=-4;freeXT.add(self);
const sim={api:{modelRoot:root,model:root,groups:{core:station,freeXT},types:{core:'TH'}},current:{basis:identity,earthAxes:identity}};
const optics={eyeLocal:[.5,0,0],eyeKm:eye,axes:{forward:[0,0,-1]},localAxes:{forward:[0,0,-1]}};
const pin=sampleStationPin(sim,optics);
assert.equal(pin.mesh,plate);close(pin.point.x,.5);close(pin.point.z,1);
pivot.rotation.y=Math.PI/2;
const locked=stationPinDirection(sim,optics,pin);
const expected=unit([-9.5,0,-.5]);
locked.forEach((v,i)=>close(v,expected[i]));
station.remove(pivot);assert.equal(stationPinDirection(sim,optics,pin),null);
assert.equal(sampleStationPin(sim,optics),null);
console.log('Reticle locks the exact station surface, excludes its own telescope, follows articulation and releases removed parts.');

// Preserve near geometry while resolving thin station surfaces at telescope distances.
const {Box3,Vector3,PerspectiveCamera}=await import('three');
const {stationNearPlane}=await import('../src/xuntian-station-depth.js');
const {depthStepAtDistance}=await import('../src/space-camera-depth.js');
const camera=new PerspectiveCamera();camera.position.set(0,0,260);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
const bounds=new Box3(new Vector3(-100,-100,-100),new Vector3(100,100,100));
const near=stationNearPlane(camera,[bounds]);assert.equal(near,80);
assert(depthStepAtDistance(260,near,10000)<depthStepAtDistance(260,.015,10000)/5000);
assert.equal(stationNearPlane(camera,[new Box3(new Vector3(-1,-1,259.99),new Vector3(1,1,261))]),.015);
assert.equal(stationNearPlane(camera,[]),.015);
assert.equal(stationNearPlane(camera,[new Box3(new Vector3(-1,-1,300),new Vector3(1,1,310))]),.015);
console.log('Telescope station depth precision and near/inside/behind clipping passed.');

// Terrain credits follow the actual rectangular sensor, not its diagonal cone
// or the 300 km atmosphere. Construct contacts geometrically, including ones
// missed by the reticle, all corners, and the four edge midpoints.
const {sphereIntersectsRectangularView}=await import('../src/xuntian-view-math.js');
const surfaceCamera={right:[1,0,0],up:[0,1,0],forward:[0,0,1]},surfaceDistance=EARTH_RADIUS+405,
 surfaceRadius=EARTH_RADIUS+12,surfaceAngle=Math.asin(surfaceRadius/surfaceDistance),surfaceDegree=Math.PI/180;
const surfaceRay=(x,y)=>unit([x,y,1]),surfaceEye=center=>center.map(v=>-surfaceDistance*v),
 surfaceHit=(position,direction,radius=surfaceRadius)=>{const near=-dot(position,direction);return near>=0&&near*near>=dot(position,position)-radius*radius;},
 surfaceFrame=(center,fovY,aspect)=>({eyeKm:surfaceEye(center),axes:surfaceCamera,fovY,aspect}),
 surfaceCheck=(frame,radius=surfaceRadius)=>sphereIntersectsRectangularView(frame.eyeKm,frame.axes,frame.fovY,frame.aspect,radius),
 surfaceCases=[];
function surfaceCase(name,frame,expected){assert.equal(surfaceCheck(frame),expected,name);surfaceCases.push({name,frame,expected});return frame;}
surfaceCase('nadir remains visible in a tiny field',surfaceFrame([0,0,1],.1,1.6),true);
surfaceCase('zenith remains empty even in a wide field',surfaceFrame([0,0,-1],110,1.6),false);
const airOnlyAngle=surfaceAngle+16*surfaceDegree,
 airOnly=surfaceCase('air/cone overlap without ground in the rectangular field',surfaceFrame([0,Math.sin(airOnlyAngle),Math.cos(airOnlyAngle)],30,1.6),false);
assert(airOnlyAngle<Math.asin((EARTH_RADIUS+300)/surfaceDistance)+coneHalfAngle(Math.tan(15*surfaceDegree),1.6)*surfaceDegree,
 'this is inside the unchanged conservative atmosphere rendering envelope');
for(const aspect of [.5,1.6,3])for(const sx of [-1,1])for(const sy of [-1,1]){
 const ty=Math.tan(20*surfaceDegree),tx=ty*aspect,diagonal=Math.hypot(tx,ty),az=[sx*tx/diagonal,sy*ty/diagonal],
  angle=Math.atan(diagonal)+Math.asin(EARTH_RADIUS/surfaceDistance)-.01*surfaceDegree,
  frame=surfaceCase(`actual ground enters only corner ${sx},${sy} at aspect ${aspect}`,
    surfaceFrame([az[0]*Math.sin(angle),az[1]*Math.sin(angle),Math.cos(angle)],40,aspect),true);
 assert(surfaceHit(frame.eyeKm,surfaceRay(sx*tx,sy*ty),EARTH_RADIUS));
 for(const [x,y] of [[0,0],[tx,0],[-tx,0],[0,ty],[0,-ty]])assert(!surfaceHit(frame.eyeKm,surfaceRay(x,y),EARTH_RADIUS));
}
const edgeTy=Math.tan(20*surfaceDegree),edgeTx=edgeTy*1.6,edgeX=.37*edgeTx,
 edgePoint=surfaceRay(edgeX,edgeTy),edgeNormal=unit([0,-1,edgeTy]);
function edgeContact(delta){const angle=surfaceAngle+delta;return surfaceFrame(edgePoint.map((v,i)=>v*Math.cos(angle)-edgeNormal[i]*Math.sin(angle)),40,1.6);}
const grazing=surfaceCase('a thin ridge enters an off-centre edge interval',edgeContact(-1e-6),true);
assert(surfaceHit(grazing.eyeKm,edgePoint));
for(const [x,y] of [[0,0],[edgeTx,edgeTy],[-edgeTx,edgeTy],[edgeTx,-edgeTy],[-edgeTx,-edgeTy],[edgeTx,0],[-edgeTx,0],[0,edgeTy],[0,-edgeTy]])
 assert(!surfaceHit(grazing.eyeKm,surfaceRay(x,y)),'even the usual nine sampled rays miss this genuine edge contact');
surfaceCase('exact tangent is retained',edgeContact(0),true);
surfaceCase('just beyond the tangent is absent',edgeContact(1e-5),false);
const ridgeAngle=(surfaceAngle+Math.asin(EARTH_RADIUS/surfaceDistance))/2+.05*surfaceDegree,
 ridge=surfaceCase('highest ridges can enter before the sea-level limb',surfaceFrame([0,Math.sin(ridgeAngle),Math.cos(ridgeAngle)],.1,1.6),true);
assert.equal(surfaceCheck(ridge,EARTH_RADIUS),false,'do not lose a possible mountain because sea level and reticle miss');
for(const item of surfaceCases){
 const axis=new Vector3(.3,.5,.8).normalize(),rotate=v=>new Vector3(...v).applyAxisAngle(axis,.73).toArray(),
  transformed={...item.frame,eyeKm:rotate(item.frame.eyeKm),axes:Object.fromEntries(Object.entries(surfaceCamera).map(([key,value])=>[key,rotate(value)]))};
 assert.equal(surfaceCheck(transformed),item.expected,item.name+' must survive a common inertial-frame rotation');
}
assert.equal(sphereIntersectsRectangularView([0,0,EARTH_RADIUS],surfaceCamera,10,1.6,surfaceRadius),true);
assert.equal(sphereIntersectsRectangularView([0,0,NaN],surfaceCamera,10,1.6,surfaceRadius),false);
console.log(`Terrain attribution: ${surfaceCases.length} nadir/zenith, real corner, off-centre grazing edge, mountain-only and rotated-frame cases passed.`);

// Exercise the actual Earth-view status and caption consumer without a GPU.
// The atmosphere stays renderable while an incomplete-terrain footer vanishes.
const {build:surfaceBuild}=await import('esbuild');
const surfaceBundle=await surfaceBuild({stdin:{contents:`
 export {createXuntianEarthView} from './src/xuntian-earth-view.js';
 export {elevationCaptionLines} from './src/earth-elevation-controls.js';
 export {Mesh,ShaderMaterial,SphereGeometry,PlaneGeometry,Texture,UnsignedByteType} from 'three';
`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'}),
 surfaceAPI=await import('data:text/javascript;base64,'+Buffer.from(surfaceBundle.outputFiles[0].contents).toString('base64'));
const shellGeometry=new surfaceAPI.SphereGeometry(1,4,2),
 surfaceShell=()=>new surfaceAPI.Mesh(shellGeometry,new surfaceAPI.ShaderMaterial({uniforms:{},vertexShader:'void main(){}',fragmentShader:'void main(){}'})),
 shellSources=[surfaceShell(),surfaceShell(),surfaceShell(),surfaceShell()],
 terrainEnv={quality:'simple',settings:{},uniforms:{},fallback:new surfaceAPI.Texture(),sim:{paused:true},assets:{},
  detail:{columns:12,rows:6,slots:[]},nightDetail:{columns:24,rows:12,slots:[]},
  clouds:shellSources[0],volumeClouds:shellSources[1],atmosphere:shellSources[2],atmosphereTransmission:shellSources[3],
  api:{renderer:{extensions:{has:()=>false}}},hdr:{failed:false},
  elevation:{enabled:true,baseGeometry:null,setView(){},release(){},status:()=>({enabled:true,requested:4,ready:0,complete:false})}},
 terrainQuad=new surfaceAPI.PlaneGeometry(2,2),terrainView=surfaceAPI.createXuntianEarthView(terrainEnv,terrainQuad),
 terrainRenderer={setRenderTarget(){},clear(){},render(){},properties:{get:()=>({})}},
 terrainSize={w:32,h:20,aspect:1.6},terrainTarget={scene:{texture:{type:surfaceAPI.UnsignedByteType}}},
 renderTerrain=(frame,photo=false)=>terrainView.render(terrainRenderer,{...frame,q:{earthAxes:identity,sun:[1,0,0]}},terrainSize,terrainTarget,photo);
try{
 assert(renderTerrain(airOnly),'the atmosphere rendering path remains active');
 assert.equal(terrainView.elevationStatus().visible,false);
 assert.deepEqual(surfaceAPI.elevationCaptionLines(terrainView.elevationStatus()),[],
  'a sky-only field gets no real/local elevation footer even with requested incomplete terrain');
 renderTerrain(surfaceFrame([0,0,1],20,1.6),true);
 assert.equal(terrainView.elevationStatus(true).visible,true);
 assert(surfaceAPI.elevationCaptionLines(terrainView.elevationStatus(true)).some(line=>line.includes('Real elevation')));
 assert.equal(terrainView.elevationStatus().visible,false,'photo visibility does not overwrite the preview surface flag');
 renderTerrain(grazing);
 assert.equal(terrainView.elevationStatus().visible,true,'a real off-centre grazing edge keeps its terrain credit');
 assert(surfaceAPI.elevationCaptionLines(terrainView.elevationStatus()).length>0);
 assert.equal(renderTerrain(surfaceFrame([0,0,-1],30,1.6),true),null);
 assert.deepEqual(surfaceAPI.elevationCaptionLines(terrainView.elevationStatus(true)),[]);
 assert.equal(terrainView.elevationStatus().visible,true,'a pure-sky photograph does not overwrite the preview surface flag');
}finally{terrainView.dispose();terrainTarget.earth?.dispose();terrainQuad.dispose();terrainEnv.fallback.dispose();for(const mesh of shellSources)mesh.material.dispose();shellGeometry.dispose();}
console.log('Earth-view integration: atmosphere-only sky has no elevation footer; real corners/ridges retain credits; photo and preview flags stay independent.');
