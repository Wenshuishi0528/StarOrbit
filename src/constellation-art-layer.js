import * as THREE from 'three';
import { constellationArtMesh, constellationArtFade } from './constellation-art-math.js';
import { earthHit } from './xuntian-view-shaders.js';

const vertex = `varying vec2 artUV;varying vec3 cameraRay;uniform mat3 inertialToCamera;uniform vec2 lens;
void main(){artUV=uv;cameraRay=inertialToCamera*position;gl_Position=vec4(cameraRay.xy/lens,0.,cameraRay.z);}`;
const fragment = `varying vec2 artUV;varying vec3 cameraRay;uniform sampler2D artMap;uniform float opacity,inverseGain,scope;uniform vec3 ink;uniform mat3 cameraToFixed;uniform vec3 fixedEye;
${earthHit}
void main(){if(scope>.5&&groundDistance(fixedEye,cameraToFixed*normalize(cameraRay))>=0.)discard;
float alpha=texture2D(artMap,vec2(artUV.x,1.-artUV.y)).a*opacity;if(alpha<.002)discard;
gl_FragColor=vec4(ink*inverseGain,alpha);
#include <colorspace_fragment>
}`;

export class ConstellationArtLayer {
  constructor(manager, id, scope = false, priority = 1) {
    this.manager = manager;
    this.id = id;
    this.priority = priority;
    this.scene = new THREE.Scene();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.meshes = new Map();
    this.uniforms = {
      inertialToCamera: { value: new THREE.Matrix3() },
      lens: { value: new THREE.Vector2() },
      scope: { value: scope ? 1 : 0 },
      cameraToFixed: { value: new THREE.Matrix3() },
      fixedEye: { value: new THREE.Vector3() },
      inverseGain: { value: 1 },
      ink: { value: new THREE.Color('#d5c5a0') },
    };
  }
  update(view, enabled, options = {}) {
    const entries = this.manager.update(this.id, view, enabled, this.priority),
      u = this.uniforms;
    u.inertialToCamera.value.fromArray([...view.right, ...view.up, ...view.forward]).transpose();
    const tangent = Math.tan((view.fovY * Math.PI) / 360);
    u.lens.value.set(tangent * view.aspect, tangent);
    u.inverseGain.value = options.inverseGain ?? 1;
    if (options.cameraToFixed) u.cameraToFixed.value.copy(options.cameraToFixed);
    if (options.fixedEye) u.fixedEye.value.copy(options.fixedEye);
    const wanted = new Set(entries.map((e) => e.frame.id));
    for (const [id, mesh] of this.meshes)
      if (!wanted.has(id)) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this.meshes.delete(id);
      }
    const fade = constellationArtFade(view.fovY);
    for (const entry of entries) {
      const id = entry.frame.id;
      let mesh = this.meshes.get(id);
      if (!mesh) {
        const data = constellationArtMesh(entry.frame, 16),
          geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
        geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
        const material = new THREE.ShaderMaterial({
          uniforms: { ...u, artMap: { value: entry.texture }, opacity: { value: 0 } },
          vertexShader: vertex,
          fragmentShader: fragment,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
          blending: THREE.CustomBlending,
          blendSrc: THREE.SrcAlphaFactor,
          blendDst: THREE.OneFactor,
          blendSrcAlpha: THREE.ZeroFactor,
          blendDstAlpha: THREE.OneFactor,
        });
        mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 1.8;
        this.meshes.set(id, mesh);
        this.group.add(mesh);
      }
      mesh.material.uniforms.artMap.value = entry.texture;
      mesh.material.uniforms.opacity.value =
        0.22 * fade * Math.min(1, (performance.now() - entry.born) / 300);
    }
    return this.manager.status(this.id);
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

export function paintConstellationArtCaption(canvas, status, bottomInset = 0) {
  if (!status?.ready) return 0;
  const font = Math.max(11, Math.round(canvas.width / 120)),
    height = font + 12,
    ctx = canvas.getContext('2d');
  ctx.save();
  ctx.font = `${font}px sans-serif`;
  ctx.fillStyle = 'rgba(2,8,15,.76)';
  ctx.fillRect(0, canvas.height - bottomInset - height, canvas.width, height);
  ctx.fillStyle = '#d0dce8';
  ctx.fillText(
    'Constellation illustrations: Johan Meuris / Stellarium · Free Art License · teaching overlay',
    8,
    canvas.height - bottomInset - 7,
    canvas.width - 16
  );
  ctx.restore();
  return height;
}
