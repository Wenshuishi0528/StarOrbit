import * as THREE from 'three';
import {cross,dot} from './orbit.js';
import {solarApparent} from './solar-system.js';
import {earthHit} from './xuntian-view-shaders.js';
import {xuntianStarPSF} from './xuntian-view-sky.js';
import {createSolarObservationView} from './solar-observation-view.js';
import {solarImageFootprint,solarImageOccluders} from './solar-observation-math.js';

const u=value=>({value}),V=()=>u(new THREE.Vector3()),V2=()=>u(new THREE.Vector2());
const cameraComponents=(v,axes)=>[dot(v,axes.right),dot(v,axes.up),dot(v,axes.forward)];
const vertex=`uniform vec2 centre,extent;varying vec2 film;
void main(){film=centre+position.xy*extent;gl_Position=vec4(film,0.,1.);}`;
const fragment=`precision highp float;varying vec2 film;
uniform vec2 lens,screen,centre;uniform mat3 cameraToFixed;uniform vec3 fixedEye;
uniform vec3 direction,pole,prime,east,sun,tint;
uniform float radius,discPixels,sigma,flux,isSun,isSaturn,hasMap,hasRing;
uniform sampler2D surface,ring;
${earthHit}
void main(){
 vec3 ray=normalize(vec3(film*lens,1.));
 if(groundDistance(fixedEye,cameraToFixed*ray)>=0.)discard;
 // Express the vector from the sphere centre to the closest ray point
 // in body radii. Cross products retain precision at narrow fields.
 vec3 nearest=cross(ray,cross(ray,direction))/radius;
 float rho=length(nearest),edge=max(fwidth(rho),.00001);
 float cover=1.-smoothstep(1.-edge*.5,1.+edge*.5,rho);
 float front=sqrt(max(0.,1.-rho*rho));
 vec3 n=normalize(nearest-ray*front);
 vec2 uv=vec2(.5+atan(dot(n,east),dot(n,prime))/6.2831853,.5+asin(clamp(dot(n,pole),-1.,1.))/3.14159265);
 vec3 albedo=tint;
 if(hasMap>.5)albedo=texture2D(surface,uv).rgb;
 float lighting=max(dot(n,sun),0.);
 vec3 surfaceLight=isSun>.5?mix(vec3(2.3),vec3(4.8),front)*mix(vec3(1.),albedo,.25):albedo*(.012+1.65*sqrt(lighting));
 vec3 light=surfaceLight*cover;
 if(isSaturn>.5){
   // Intersection with Saturn's equatorial plane, measured along the ray
   // from nearest approach. A negative depth lies on the near side.
   float slant=dot(ray,pole);
   if(abs(slant)>.00002){
    float depth=-dot(nearest,pole)/slant;
    float r=length(nearest+ray*depth);
    if(r>=1.23&&r<=2.27&&(cover<.999||depth < -front)){
     float band=(r-1.23)/1.04;
     vec4 rings=hasRing>.5?texture2D(ring,vec2(band,.5)):vec4(.60,.50,.36,.72);
     // Cassini Division at about 1.95 Saturn radii.
     if(hasRing<.5)rings.a*=mix(1.,.16,1.-smoothstep(.015,.047,abs(r-1.95)));
     float alpha=rings.a*(depth < -front?1.:1.-cover);
     vec3 ringLight=rings.rgb*(.34+.95*sqrt(abs(dot(sun,pole))));
     light=ringLight*alpha+light*(1.-alpha);cover=alpha+(1.-alpha)*cover;
    }
   }
 }
 // Move continuously between an unresolved detector spot and the actual disc.
 float resolved=smoothstep(.40,1.55,discPixels/sigma);
 vec2 delta=(film-centre)*.5*screen;
 float spot=flux*exp(-dot(delta,delta)/(2.*sigma*sigma))/(6.2831853*sigma*sigma);
 vec3 signal=mix(tint*spot,light,resolved);
 if(max(max(signal.r,signal.g),signal.b)<.000002&&cover*resolved<.001)discard;
 gl_FragColor=vec4(signal,cover*resolved);
}`;

export function createSolarView(env,geometry,shared){
 const observations=createSolarObservationView(geometry,shared);
 const uniforms={...shared,centre:V2(),extent:V2(),direction:V(),pole:V(),prime:V(),east:V(),sun:V(),
  tint:u(new THREE.Color()),radius:u(0),discPixels:u(0),sigma:u(1),flux:u(0),isSun:u(0),isSaturn:u(0),
  hasMap:u(0),hasRing:u(0),surface:u(null),ring:u(null)};
 // Celestial opacity hides more distant stars/bodies; the alpha channel
 // itself belongs to station coverage and is preserved for the Earth pass.
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,toneMapped:false,
  transparent:true,depthTest:false,depthWrite:false,blending:THREE.CustomBlending,
  blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
 const scene=new THREE.Scene();scene.add(mesh);
 const textures=new Map();let disposed=false,revision=0;
 function request(id){
  if(id==='Moon'&&env.moon?.texture)return {texture:env.moon.texture};
  const url=id==='Moon'?env.assets.moon:env.assets.planets?.[id];if(!url)return null;
  let entry=textures.get(id);
  if(!entry){
   entry={};textures.set(id,entry);
   entry.ready=new THREE.TextureLoader().loadAsync(url).then(texture=>{
    if(disposed){texture.dispose();return;}
    texture.colorSpace=THREE.SRGBColorSpace;
    if(id!=='SaturnRing')texture.wrapS=THREE.RepeatWrapping;
    entry.texture=texture;revision++;
   }).catch(()=>{entry.failed=true;});
  }
  return entry;
 }
 function visible(frame,size){
  const tangent=Math.tan(frame.fovY*Math.PI/360),scale=size.h/(2*tangent);
  const halfAngle=Math.atan(tangent*Math.hypot(size.aspect,1)),rows=[];
  for(const body of solarApparent(frame.q,frame.eyeKm)){
   const d=cameraComponents(body.direction,frame.axes),ringScale=body.id==='Saturn'?2.27:body.id==='Sun'&&frame.solarObservation?(solarImageFootprint(body,frame.solarObservation)||body.radiusRad)/body.radiusRad:1;
   if(d[2]<=0||Math.acos(THREE.MathUtils.clamp(d[2],-1,1))>halfAngle+body.radiusRad*ringScale+12/scale)continue;
   const px=scale*Math.tan(body.radiusRad)/d[2];
   const centre=[d[0]/(d[2]*tangent*size.aspect),d[1]/(d[2]*tangent)];
   rows.push({body,d,px,centre});
  }
  return rows.sort((a,b)=>b.body.distanceKm-a.body.distanceKm);
 }
 function maps(body,px){
  if(px<2)return [];
  return [request(body.id),body.id==='Saturn'?request('SaturnRing'):null];
 }
 return {
  key:()=>revision+':'+(env.moon?.texture?.id??'')+':'+observations.revision,
  preparePhoto(frame,size){
   // The shutter samples the live pointing after asynchronous terrain loading.
   // Prepare its frozen observation even if the Sun starts outside the field,
   // so moving onto the Sun cannot silently photograph the procedural fallback.
   const ready=frame.solarObservation?[observations.prepare(frame.solarObservation)]:[];
   return Promise.all([...ready,...visible(frame,size).flatMap(({body,px})=>body.id==='Sun'&&frame.solarObservation?[]:maps(body,px).map(entry=>entry?.ready))]);
  },
  draw(renderer,camera,frame,size,optics){
   const {w,h}=size,psf=xuntianStarPSF(optics,h);
   for(const {body,d,px,centre} of visible(frame,size)){
    const saturn=body.id==='Saturn',sun=body.id==='Sun';
    // Observations are drawn once after the detector transfer, on every GPU.
    // Never put the procedural white Sun behind a pending real observation.
    if(sun&&frame.solarObservation)continue;
    const [surface,ring]=maps(body,px),radius=Math.sin(body.radiusRad);
    // Saturated, very bright sources remain compact in a wide field. Their
    // visible halo grows gradually rather than scaling diameter by flux.
    const flux=2.2*Math.log1p(10**(-.4*(body.mag-7)));
    const sigma=Math.hypot(psf.core,Math.min(1.25,Math.max(0,(3-body.mag)*.10)));
    const span=px*(saturn?2.27:1)/Math.max(.015,d[2]-radius*2.3)+sigma*6+2;
    uniforms.centre.value.fromArray(centre);uniforms.extent.value.set(span*2/w,span*2/h);
    uniforms.direction.value.fromArray(d);
    for(const [key,v] of [['pole',body.north],['prime',body.prime],['east',cross(body.north,body.prime)],['sun',body.sunDirection]]){
     uniforms[key].value.fromArray(cameraComponents(v,frame.axes));
    }
    uniforms.tint.value.setHex(body.color);uniforms.radius.value=radius;uniforms.discPixels.value=px;
    uniforms.isSun.value=Number(sun);uniforms.isSaturn.value=Number(saturn);uniforms.sigma.value=sigma;uniforms.flux.value=flux;
    uniforms.hasMap.value=Number(!!surface?.texture);uniforms.surface.value=surface?.texture||null;
    uniforms.hasRing.value=Number(!!ring?.texture);uniforms.ring.value=ring?.texture||null;
    renderer.render(scene,camera);
   }
  },
  drawObservation(renderer,camera,frame,size,foreground){
   if(!frame.solarObservation)return null;
   const row=visible(frame,size).find(({body})=>body.id==='Sun');if(!row)return null;
   const occluders=solarImageOccluders(row.body,solarApparent(frame.q,frame.eyeKm));
   return observations.draw(renderer,camera,frame,size,row.body,row.centre,row.px,foreground,occluders)?frame.solarObservation:null;
  },
  dispose(){disposed=true;observations.dispose();material.dispose();for(const entry of textures.values())entry.texture?.dispose();textures.clear();}
 };
}
