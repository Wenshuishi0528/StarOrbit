import { archiveColorGLSL } from './sky-archive-color.js';
import { webbPlateGeometry } from './webb-plate.js';
import * as THREE from 'three';
import { hipsDirection, hipsTileMesh } from './sky-detail-math.js';
import { earthHit, sensorResponse } from './xuntian-view-shaders.js';

const vertexShader = `varying vec2 tileUV;varying vec3 cameraRay;
 uniform mat3 inertialToCamera;uniform vec2 lens;uniform vec3 cameraOrigin;
 void main(){tileUV=uv;cameraRay=inertialToCamera*position+cameraOrigin;
 gl_Position=vec4(cameraRay.xy/lens,0.,cameraRay.z);}`;
const fragmentShader = `precision highp float;varying vec2 tileUV;varying vec3 cameraRay;
 uniform sampler2D tileMap;uniform float scope,skyGain,mainSkyHDR,opticalGain,archiveGain;
 #ifdef ARCHIVE_PLATE
  ${archiveColorGLSL}
 #endif
 #ifdef ARCHIVE_BYTE_SENSOR
  uniform bool resolveByteSensor,hasTerrestrialImage;
  uniform vec2 detectorSize;
  uniform sampler2D storedScene,terrestrialImage;
  uniform float terrestrialExposure;
  ${sensorResponse}
 #endif
 uniform mat3 cameraToFixed;uniform vec3 fixedEye;
 #include <tonemapping_pars_fragment>
 ${earthHit}
 void main(){
  if(scope>.5&&groundDistance(fixedEye,cameraToFixed*normalize(cameraRay))>=0.)discard;
  vec4 pixel=texture2D(tileMap,tileUV);if(pixel.a<.001)discard;
  vec3 colour=pixel.rgb;
  #ifdef ARCHIVE_PLATE
   colour=archiveLinearRGB(colour);
   if(scope>.5){
    // This sensor maps radiance to display light with 1-exp(-radiance).
    // Its neutral aperture and 0 EV reproduce the published image exactly.
    colour=-log(max(vec3(.00001),1.-colour))*archiveGain;
    #ifdef ARCHIVE_BYTE_SENSOR
     if(resolveByteSensor){
      vec2 uv=gl_FragCoord.xy/detectorSize;
      vec4 fg=texture2D(storedScene,uv);
      if(fg.a>=1.)discard;
      vec4 surface=hasTerrestrialImage?texture2D(terrestrialImage,uv):vec4(0.);
      // The byte scene has clipped/rounded this plate's radiance. Restore only
      // the missing part behind any station coverage before the sensor response.
      vec3 stored=floor(clamp(colour,0.,1.)*255.+.5)/255.;
      fg.rgb+=(colour-stored)*(1.-fg.a);
      gl_FragColor=vec4(exposeSensor(fg,surface,opticalGain,terrestrialExposure).rgb,pixel.a);
      return;
     }
    #endif
   }else{
    colour*=archiveGain;
    if(mainSkyHDR>.5)colour=archiveBeforeACES(colour,toneMappingExposure);
   }
  #else
  if(scope>.5){
   if(mainSkyHDR>.5){vec3 mapped=ACESFilmicToneMapping(colour*(2.*skyGain*opticalGain));
    colour=-log(max(vec3(.0001),1.-mapped))/max(opticalGain,.00001);}
   else colour=-log(max(vec3(.0001),1.-min(colour,vec3(.9999))))*skyGain;
  }else colour*=skyGain;
  #endif
  gl_FragColor=vec4(colour,pixel.a);
  #include <colorspace_fragment>
 }`;

function hipsGeometry(entry) {
  const data = hipsTileMesh(entry.order, entry.pixel, 8);
  const origin = hipsDirection(entry.order, entry.pixel);
  // Project a small tile-relative vector on the GPU. Subtracting almost
  // parallel unit directions in float32 loses subpixel detail at 0.006°.
  for (let i = 0; i < data.uvs.length / 2; i++) {
    const point = hipsDirection(entry.order, entry.pixel, data.uvs[i * 2], data.uvs[i * 2 + 1]);
    data.positions.set(
      point.map((v, axis) => v - origin[axis]),
      i * 3
    );
  }

  return { ...data, origin };
}

// Geometry/materials belong to each view. The texture (and its decoded bitmap)
// belongs to the one bounded manager, including during high-resolution export.
export class SkyDetailLayer {
  constructor(manager, id, scope = false, byteSensor = false) {
    this.manager = manager;
    this.id = id;
    this.byteSensor = byteSensor;
    this.group = new THREE.Group();
    this.scene = new THREE.Scene();
    this.scene.add(this.group);
    this.meshes = new Map();
    this.uniforms = {
      scope: { value: scope ? 1 : 0 },
      skyGain: { value: 1 },
      archiveGain: { value: 1 },
      mainSkyHDR: { value: 0 },
      opticalGain: { value: 1 },
      toneMappingExposure: { value: 1 },
      inertialToCamera: { value: new THREE.Matrix3() },
      lens: { value: new THREE.Vector2() },
      cameraToFixed: { value: new THREE.Matrix3() },
      fixedEye: { value: new THREE.Vector3() },
    };
    if (byteSensor)
      Object.assign(this.uniforms, {
        resolveByteSensor: { value: false },
        hasTerrestrialImage: { value: false },
        terrestrialImage: { value: null },
        terrestrialExposure: { value: 1 },
        storedScene: { value: null },
        detectorSize: { value: new THREE.Vector2() },
      });
  }
  update(view, enabled, options = {}) {
    const status = this.manager.update(this.id, view, enabled),
      u = this.uniforms;
    u.inertialToCamera.value.fromArray([...view.right, ...view.up, ...view.forward]).transpose();
    const tangent = Math.tan((view.fovY * Math.PI) / 360);
    u.lens.value.set(tangent * view.aspect, tangent);
    for (const key of ['skyGain', 'mainSkyHDR', 'opticalGain', 'toneMappingExposure'])
      if (options[key] !== undefined) u[key].value = options[key];
    u.archiveGain.value = options.skyGain ?? 1;
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
        const data = entry.provider.plate ? webbPlateGeometry(entry) : hipsGeometry(entry);
        const origin = data.origin;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
        const profile = entry.archiveProfile ?? entry.provider.archiveProfile;
        const material = new THREE.ShaderMaterial({
          defines: profile
            ? {
                ARCHIVE_PLATE: 1,
                ['ARCHIVE_' + profile.toUpperCase()]: 1,
                ...(this.byteSensor && { ARCHIVE_BYTE_SENSOR: 1 }),
              }
            : {},
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
        if (profile && this.byteSensor) mesh.layers.enable(1);
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
  // Floating-point scenes already hold the full radiance. On byte-only GPUs
  // reuse the film and scene targets and draw just the loaded archive footprint.
  resolveByteFilm(renderer, camera, target, sensor) {
    if (!this.byteSensor || !this.group.children.some((mesh) => mesh.layers.isEnabled(1))) return;
    const u = this.uniforms,
      mask = camera.layers.mask;
    u.resolveByteSensor.value = true;
    u.detectorSize.value.set(target.w, target.h);
    u.storedScene.value = target.scene.texture;
    u.terrestrialImage.value = sensor.earthImage.value;
    u.hasTerrestrialImage.value = !!sensor.earthOn.value;
    u.terrestrialExposure.value = sensor.earthExposure.value;
    camera.layers.set(1);
    try {
      renderer.render(this.scene, camera);
    } finally {
      camera.layers.mask = mask;
      u.resolveByteSensor.value = false;
      u.storedScene.value = null;
      u.terrestrialImage.value = null;
    }
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
