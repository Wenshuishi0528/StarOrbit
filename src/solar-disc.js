import * as THREE from 'three';
import { cross, dot } from './orbit.js';
import { lunarDetailGLSL } from './lunar-detail.js';

export const cameraComponents = (v, axes) => [
  dot(v, axes.right),
  dot(v, axes.up),
  dot(v, axes.forward),
];
export const solarDiscVertex = `uniform vec2 centre,extent;varying vec2 film;
void main(){film=centre+position.xy*extent;gl_Position=vec4(film,0.,1.);}`;
export const solarDiscGLSL = `
uniform vec3 direction,pole,prime,east,sun,tint;
uniform float radius,isSun,isSaturn,hasMap,hasRing;
uniform sampler2D surface,ring;
#ifdef LUNAR_DETAIL
${lunarDetailGLSL}
#endif
vec4 solarDisc(vec3 ray,float nightLight){
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
 #ifdef LUNAR_DETAIL
 albedo=lunarAlbedo(uv,albedo);
 #endif
 float lighting=max(dot(n,sun),0.);
 vec3 surfaceLight=isSun>.5?mix(vec3(2.3),vec3(4.8),front)*mix(vec3(1.),albedo,.25):albedo*(nightLight+1.65*sqrt(lighting));
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
 return vec4(light,cover);
}`;

export function createSolarDiscUniforms() {
  const value = (v) => ({ value: v });
  return {
    centre: value(new THREE.Vector2()),
    extent: value(new THREE.Vector2()),
    direction: value(new THREE.Vector3()),
    pole: value(new THREE.Vector3()),
    prime: value(new THREE.Vector3()),
    east: value(new THREE.Vector3()),
    sun: value(new THREE.Vector3()),
    tint: value(new THREE.Color()),
    radius: value(0),
    isSun: value(0),
    isSaturn: value(0),
    surface: value(null),
    hasMap: value(0),
    ring: value(null),
    hasRing: value(0),
  };
}

export function updateSolarDisc(uniforms, body, axes, direction, centre, extent, [surface, ring]) {
  uniforms.centre.value.fromArray(centre);
  uniforms.extent.value.fromArray(extent);
  uniforms.direction.value.fromArray(direction);
  for (const [key, v] of [
    ['pole', body.north],
    ['prime', body.prime],
    ['east', cross(body.north, body.prime)],
    ['sun', body.sunDirection],
  ])
    uniforms[key].value.fromArray(cameraComponents(v, axes));
  uniforms.tint.value.setHex(body.color);
  uniforms.radius.value = Math.sin(body.radiusRad);
  uniforms.isSun.value = Number(body.id === 'Sun');
  uniforms.isSaturn.value = Number(body.id === 'Saturn');
  uniforms.surface.value = surface?.texture ?? null;
  uniforms.hasMap.value = Number(!!surface?.texture);
  uniforms.ring.value = ring?.texture ?? null;
  uniforms.hasRing.value = Number(!!ring?.texture);
}

// Ground and spacecraft eyepieces can request the same packaged map at once.
// The last consumer releases the GPU texture. An already pending decode can
// still be reused if an observer returns to the body before it finishes.
const textureBanks = new WeakMap();
export function createSolarDiscMaps(environment) {
  let bank = textureBanks.get(environment);
  if (!bank) {
    bank = { entries: new Map(), revision: 0 };
    textureBanks.set(environment, bank);
  }
  const held = new Set();
  function discard(id, entry) {
    if (!entry.users && !entry.pending) {
      entry.texture?.dispose();
      bank.entries.delete(id);
    }
  }
  function request(id) {
    if (id === 'Moon' && environment.moon?.texture) return { texture: environment.moon.texture };
    const url = id === 'Moon' ? environment.assets.moon : environment.assets.planets?.[id];
    if (!url) return null;
    let entry = bank.entries.get(id);
    if (!entry) {
      entry = { users: 0, pending: true, texture: null };
      bank.entries.set(id, entry);
      entry.ready = new THREE.TextureLoader()
        .loadAsync(url)
        .then((texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          if (id !== 'SaturnRing') texture.wrapS = THREE.RepeatWrapping;
          entry.texture = texture;
          bank.revision++;
        })
        .catch(() => {})
        .finally(() => {
          entry.pending = false;
          discard(id, entry);
        });
    }
    if (!held.has(id)) {
      held.add(id);
      entry.users++;
    }
    return entry;
  }
  function retain(ids) {
    for (const id of held) {
      if (ids?.has(id)) continue;
      const entry = bank.entries.get(id);
      held.delete(id);
      entry.users--;
      discard(id, entry);
    }
  }
  return {
    get revision() {
      return bank.revision;
    },
    maps(body, radiusPixels) {
      if (radiusPixels < 2) return [];
      return [request(body.id), body.id === 'Saturn' ? request('SaturnRing') : null];
    },
    retain,
    dispose() {
      retain(null);
    },
  };
}
