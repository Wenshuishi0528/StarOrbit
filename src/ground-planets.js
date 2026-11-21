import * as THREE from 'three';
import {
  cameraComponents,
  createSolarDiscMaps,
  createSolarDiscUniforms,
  solarDiscGLSL,
  solarDiscVertex,
  updateSolarDisc,
} from './solar-disc.js';

// Coordinates and sizes use drawing-buffer pixels. Keep a subpixel planet as
// a point. Saturn's rings can be resolved before the globe itself.
export function groundPlanetProjection(body, view, stopPixels = 0) {
  const direction = cameraComponents(body.direction, view);
  if (direction[2] <= 0) return null;
  const tangent = Math.tan((view.fovY * Math.PI) / 360);
  const scale = view.pixelHeight / (2 * tangent * direction[2]);
  const radiusPixels = scale * Math.tan(body.radiusRad);
  const outer = radiusPixels * (body.id === 'Saturn' ? 2.27 : 1);
  if (outer < 1.3) return null;
  const x = scale * direction[0],
    y = scale * direction[1];
  const halfHeight = view.pixelHeight / 2,
    halfWidth = halfHeight * view.aspect;
  const extent = outer / Math.max(0.01, direction[2] - 2.3 * Math.sin(body.radiusRad)) + 1;
  if (Math.abs(x) > halfWidth + extent || Math.abs(y) > halfHeight + extent) return null;
  if (stopPixels > 0 && Math.hypot(x, y) > stopPixels / 2 + extent) return null;
  return {
    direction,
    centre: [x / halfWidth, y / halfHeight],
    extent: [extent / halfWidth, extent / halfHeight],
    radiusPixels,
    lens: [tangent * view.aspect, tangent],
  };
}

export function createGroundPlanetLayer(scene, environment, air, airColourGLSL) {
  const maps = createSolarDiscMaps(environment);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const meshes = new Map(),
    visibleMaps = new Set();
  function meshFor(id) {
    if (!meshes.has(id)) {
      const uniforms = {
        ...createSolarDiscUniforms(),
        lens: { value: new THREE.Vector2() },
        localDir: { value: new THREE.Vector3() },
        skySun: air.sun,
        day: air.day,
        twilight: air.twilight,
        natural: air.natural,
        opticalGain: air.opticalGain,
        density: air.density,
        airVisibility: air.airVisibility,
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: solarDiscVertex,
        transparent: true,
        toneMapped: false,
        depthTest: false,
        depthWrite: false,
        fragmentShader: `precision highp float;varying vec2 film;uniform vec2 lens;
uniform vec3 localDir,skySun;uniform float day,twilight,natural,density,airVisibility,opticalGain;
${solarDiscGLSL}
${airColourGLSL}
void main(){
 vec4 disc=solarDisc(normalize(vec3(film*lens,1.)),0.);
 if(disc.a<.001)discard;
 float z=max(0.,localDir.z);
 float haze=natural*airVisibility*clamp((day*.98+twilight*exp(-z*5.)*.8)/max(density,.000001),0.,.995);
 float transmittance=exp(-.10*density/max(.055,z));
 vec3 signal=disc.rgb/disc.a*transmittance*(1.-haze*.76);
 gl_FragColor=vec4((signal+airColour(localDir,skySun,day,twilight)*haze)*opticalGain,disc.a);
 #include <colorspace_fragment>
}`,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      meshes.set(id, mesh);
      scene.add(mesh);
    }
    return meshes.get(id);
  }
  return {
    begin() {
      for (const mesh of meshes.values()) mesh.visible = false;
      visibleMaps.clear();
    },
    show(body, local, view, stopPixels) {
      if (local[2] < -body.radiusRad * (body.id === 'Saturn' ? 2.27 : 1)) return false;
      const p = groundPlanetProjection(body, view, stopPixels);
      if (!p) return false;
      const mesh = meshFor(body.id);
      mesh.visible = true;
      mesh.renderOrder = -Math.log10(body.distanceKm);
      const u = mesh.material.uniforms;
      u.localDir.value.fromArray(local);
      u.lens.value.fromArray(p.lens);
      const textures = maps.maps(body, p.radiusPixels);
      if (textures[0]) visibleMaps.add(body.id);
      if (textures[1]) visibleMaps.add('SaturnRing');
      updateSolarDisc(u, body, view, p.direction, p.centre, p.extent, textures);
      return true;
    },
    end() {
      maps.retain(visibleMaps);
      for (const mesh of meshes.values()) {
        if (mesh.visible) continue;
        mesh.material.uniforms.surface.value = null;
        mesh.material.uniforms.ring.value = null;
      }
    },
    dispose() {
      maps.dispose();
      for (const mesh of meshes.values()) {
        mesh.removeFromParent();
        mesh.material.dispose();
      }
      meshes.clear();
      geometry.dispose();
    },
  };
}
