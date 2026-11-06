import * as THREE from 'three';
import { hipsDirection, hipsTileMesh } from './sky-detail-math.js';
import { earthHit } from './xuntian-view-shaders.js';

const vertexShader = `varying vec2 tileUV;varying vec3 cameraRay;
 uniform mat3 inertialToCamera;uniform vec2 lens;uniform vec3 cameraOrigin;
 void main(){tileUV=uv;cameraRay=inertialToCamera*position+cameraOrigin;
 gl_Position=vec4(cameraRay.xy/lens,0.,cameraRay.z);}`;
const fragmentShader = `precision highp float;varying vec2 tileUV;varying vec3 cameraRay;
 uniform sampler2D tileMap;uniform float scope,skyGain,mainSkyHDR,opticalGain;
 uniform mat3 cameraToFixed;uniform vec3 fixedEye;
 #include <tonemapping_pars_fragment>
 ${earthHit}
 void main(){
  if(scope>.5&&groundDistance(fixedEye,cameraToFixed*normalize(cameraRay))>=0.)discard;
  vec4 pixel=texture2D(tileMap,tileUV);if(pixel.a<.001)discard;
  vec3 colour=pixel.rgb;
  if(scope>.5){
   if(mainSkyHDR>.5){vec3 mapped=ACESFilmicToneMapping(colour*(2.*skyGain*opticalGain));
    colour=-log(max(vec3(.0001),1.-mapped))/max(opticalGain,.00001);}
   else colour=-log(max(vec3(.0001),1.-min(colour,vec3(.9999))))*skyGain;
  }else colour*=skyGain;
  gl_FragColor=vec4(colour,pixel.a);
  #include <colorspace_fragment>
 }`;

// Geometry/materials belong to each view. The texture (and its decoded bitmap)
// belongs to the one bounded manager, including during high-resolution export.
export class SkyDetailLayer {
  constructor(manager, id, scope = false) {
    this.manager = manager;
    this.id = id;
    this.group = new THREE.Group();
    this.scene = new THREE.Scene();
    this.scene.add(this.group);
    this.meshes = new Map();
    this.uniforms = {
      scope: { value: scope ? 1 : 0 },
      skyGain: { value: 1 },
      mainSkyHDR: { value: 0 },
      opticalGain: { value: 1 },
      toneMappingExposure: { value: 1 },
      inertialToCamera: { value: new THREE.Matrix3() },
      lens: { value: new THREE.Vector2() },
      cameraToFixed: { value: new THREE.Matrix3() },
      fixedEye: { value: new THREE.Vector3() },
    };
  }
  update(view, enabled, options = {}) {
    const status = this.manager.update(this.id, view, enabled),
      u = this.uniforms;
    u.inertialToCamera.value.fromArray([...view.right, ...view.up, ...view.forward]).transpose();
    const tangent = Math.tan((view.fovY * Math.PI) / 360);
    u.lens.value.set(tangent * view.aspect, tangent);
    for (const key of ['skyGain', 'mainSkyHDR', 'opticalGain', 'toneMappingExposure'])
      if (options[key] !== undefined) u[key].value = options[key];
    if (options.cameraToFixed) u.cameraToFixed.value.copy(options.cameraToFixed);
    if (options.fixedEye) u.fixedEye.value.copy(options.fixedEye);
    const entries = this.manager.ready(this.id),
      wanted = new Set(entries.map((t) => t.key));
    for (const [key, mesh] of this.meshes)
      if (!wanted.has(key)) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this.meshes.delete(key);
      }
    entries.forEach((entry, index) => {
      let mesh = this.meshes.get(entry.key);
      if (!mesh) {
        const data = hipsTileMesh(entry.order, entry.pixel, 8),
          geometry = new THREE.BufferGeometry();
        const origin = hipsDirection(entry.order, entry.pixel);
        // Project a small tile-relative vector on the GPU. Subtracting almost
        // parallel unit directions in float32 loses subpixel detail at 0.006°.
        for (let i = 0; i < data.uvs.length / 2; i++) {
          const point = hipsDirection(
            entry.order,
            entry.pixel,
            data.uvs[i * 2],
            data.uvs[i * 2 + 1]
          );
          data.positions.set(
            point.map((v, axis) => v - origin[axis]),
            i * 3
          );
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
        const material = new THREE.ShaderMaterial({
          uniforms: {
            ...u,
            tileMap: { value: entry.texture },
            cameraOrigin: { value: new THREE.Vector3() },
          },
          vertexShader,
          fragmentShader,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
          blending: THREE.CustomBlending,
          blendSrc: THREE.SrcAlphaFactor,
          blendDst: THREE.OneMinusSrcAlphaFactor,
          // Scope alpha is reserved for solid foreground, never celestial light.
          blendSrcAlpha: THREE.ZeroFactor,
          blendDstAlpha: THREE.OneFactor,
        });
        mesh = new THREE.Mesh(geometry, material);
        mesh.userData.skyOrigin = origin;
        mesh.frustumCulled = false;
        this.meshes.set(entry.key, mesh);
        this.group.add(mesh);
      }
      mesh.material.uniforms.tileMap.value = entry.texture;
      mesh.material.uniforms.cameraOrigin.value.fromArray(
        [view.right, view.up, view.forward].map((axis) =>
          axis.reduce((sum, v, i) => sum + v * mesh.userData.skyOrigin[i], 0)
        )
      );
      // Replace the panorama and catalogue together, before planets and labels.
      mesh.renderOrder = 1.1 + index * 0.001;
    });
    return status;
  }
  dispose() {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.meshes.clear();
    this.group.clear();
    this.manager.release(this.id);
  }
}
