import * as THREE from 'three';
import { dot } from './orbit.js';
import { solarImageAxes } from './solar-observation-math.js';
import { earthHit } from './xuntian-view-shaders.js';

const uniform = (value) => ({ value }),
  vec = () => uniform(new THREE.Vector3());
const cameraVector = (v, axes) => [dot(v, axes.right), dot(v, axes.up), dot(v, axes.forward)];
const vertex = `uniform vec2 centre,extent;varying vec2 film;
void main(){film=centre+position.xy*extent;gl_Position=vec4(film,0.,1.);}`;
const fragment = `precision highp float;varying vec2 film;
uniform vec2 lens,sourceCenter,sourceSize;
uniform mat3 cameraToFixed;uniform vec3 fixedEye,direction,north,west;
uniform float solarTangent,radiusFraction,exposure,photosphere,occluderCount;
uniform vec4 occluders[3];
uniform sampler2D observation,foreground;
${earthHit}
void main(){
 vec3 ray=normalize(vec3(film*lens,1.));
 if(groundDistance(fixedEye,cameraToFixed*ray)>=0.)discard;
 // The scene alpha records station coverage, while celestial passes preserve
 // that alpha. Moon/planet disks therefore need their own angular masks.
 float visibility=1.-clamp(texture2D(foreground,film*.5+.5).a,0.,1.);
 for(int i=0;i<3;i++){
  if(float(i)>=occluderCount)break;
  if(dot(ray,occluders[i].xyz)<=0.)continue;
  float occult=length(cross(ray,occluders[i].xyz))/occluders[i].w;
  float feather=max(fwidth(occult),.00001);
  visibility*=smoothstep(1.-feather*.5,1.+feather*.5,occult);
 }
 if(visibility<.00001)discard;
 float along=dot(ray,direction);if(along<=0.)discard;
 vec2 solar=vec2(dot(ray,west),dot(ray,north))/(along*solarTangent);
 vec2 uv=sourceCenter+.5*radiusFraction*solar;
 if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))discard;
 float rho=length(solar),edge=max(fwidth(rho),.00001);
 float cover=1.-smoothstep(1.-edge*.5,1.+edge*.5,rho);
 vec3 colour=texture2D(observation,uv).rgb;
 // The source is a display-processed sRGB observation. Apply only display EV,
 // then return to sRGB after the normal detector pass. No inverse pupil gain,
 // HDR radiance, or float render attachment is needed for this image layer.
 vec3 mapped=1.-pow(max(vec3(0.),1.-colour),vec3(exposure));
 colour=mix(12.92*mapped,1.055*pow(mapped,vec3(1./2.4))-.055,step(vec3(.0031308),mapped));
 // HMI's photosphere is opaque. EUV structures can extend past the limb;
 // off-disc signal adds emission without an opaque black image rectangle.
 float border=clamp(min(min(uv.x,1.-uv.x)*sourceSize.x,min(uv.y,1.-uv.y)*sourceSize.y),0.,1.);
 if(photosphere>.5)colour*=cover;
 colour*=border*visibility;
 if(cover<.001&&max(max(colour.r,colour.g),colour.b)<.000002)discard;
 gl_FragColor=vec4(colour,cover*visibility);
}`;

/** A bounded, lazy GPU view of the shared cached observations. No network here. */
export function createSolarObservationView(geometry, shared) {
  const uniforms = {
    ...shared,
    centre: uniform(new THREE.Vector2()),
    extent: uniform(new THREE.Vector2()),
    sourceCenter: uniform(new THREE.Vector2(0.5, 0.5)),
    sourceSize: uniform(new THREE.Vector2()),
    direction: vec(),
    north: vec(),
    west: vec(),
    solarTangent: uniform(0),
    radiusFraction: uniform(1),
    exposure: uniform(1),
    photosphere: uniform(0),
    observation: uniform(null),
    foreground: uniform(null),
    occluderCount: uniform(0),
    occluders: uniform(Array.from({ length: 3 }, () => new THREE.Vector4())),
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    toneMapped: false,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const scene = new THREE.Scene(),
    mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const images = new Map();
  let disposed = false,
    revision = 0;
  function request(record) {
    if (!record?.blob || !record.id) return null;
    let entry = images.get(record.id);
    if (entry && entry.blob === record.blob) {
      images.delete(record.id);
      images.set(record.id, entry);
      return entry;
    }
    if (entry) {
      entry.retired = true;
      entry.texture?.dispose();
    }
    entry = { blob: record.blob };
    images.set(record.id, entry);
    const url = URL.createObjectURL(record.blob);
    entry.ready = new THREE.TextureLoader()
      .loadAsync(url)
      .then((texture) => {
        if (disposed || entry.retired) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        entry.texture = texture;
        revision++;
      })
      .catch(() => {
        entry.failed = true;
        revision++;
      })
      .finally(() => URL.revokeObjectURL(url));
    while (images.size > 2) {
      const [id, old] = images.entries().next().value;
      images.delete(id);
      old.retired = true;
      old.texture?.dispose();
    }
    return entry;
  }
  return {
    get revision() {
      return revision;
    },
    async prepare(record) {
      const entry = request(record);
      await entry?.ready;
      if (entry?.failed) throw Error('太阳观测影像解码失败，请重新更新或导入。');
    },
    draw(renderer, camera, frame, size, body, centre, px, foreground, occluders = []) {
      const record = frame.solarObservation,
        entry = request(record);
      if (!entry?.texture) return false;
      const axes = solarImageAxes(body),
        fraction = record.radiusFraction;
      const depth = dot(body.direction, frame.axes.forward),
        span = px / fraction / Math.max(0.015, depth - Math.sin(body.radiusRad) * 2.3) + 3;
      uniforms.centre.value.fromArray(centre);
      uniforms.extent.value.set((span * 2) / size.w, (span * 2) / size.h);
      for (const [name, axis] of [
        ['direction', axes.forward],
        ['north', axes.up],
        ['west', axes.right],
      ])
        uniforms[name].value.fromArray(cameraVector(axis, frame.axes));
      uniforms.solarTangent.value = Math.tan(body.radiusRad);
      uniforms.radiusFraction.value = fraction;
      uniforms.sourceCenter.value.fromArray(record.solarCenterUV || [0.5, 0.5]);
      uniforms.sourceSize.value.set(record.width, record.height);
      uniforms.exposure.value = frame.exposure ?? 1;
      uniforms.photosphere.value = Number(record.channel === 'hmi');
      uniforms.observation.value = entry.texture;
      uniforms.foreground.value = foreground;
      uniforms.occluderCount.value = Math.min(3, occluders.length);
      for (let i = 0; i < Math.min(3, occluders.length); i++)
        uniforms.occluders.value[i].set(
          ...cameraVector(occluders[i].direction, frame.axes),
          Math.sin(occluders[i].radiusRad)
        );
      renderer.render(scene, camera);
      return true;
    },
    dispose() {
      disposed = true;
      for (const entry of images.values()) {
        entry.retired = true;
        entry.texture?.dispose();
      }
      images.clear();
      material.dispose();
    },
  };
}
