import * as THREE from 'three';
import { earthSurfaceRadiance, earthSurfaceOutput } from './earth-shaders.js';

const TERRAIN_UNIFORMS = new Set(['terrainFade', 'terrainHoleCount', 'terrainHoles']);

const vertex = `attribute vec3 basePosition;uniform float terrainFade;
varying vec2 terrainUV;varying vec3 worldP,worldN;
void main(){vec3 p=mix(basePosition,position,terrainFade);terrainUV=uv;
worldP=(modelMatrix*vec4(p,1.)).xyz;
worldN=normalize(mix(normalize(worldP),mat3(modelMatrix)*normal,terrainFade));
gl_Position=projectionMatrix*viewMatrix*vec4(worldP,1.);}`;
function fragment(optical) {
  return `#define EARTH_ELEVATION
${earthSurfaceRadiance}
uniform int terrainHoleCount;uniform vec4 terrainHoles[12];varying vec2 terrainUV;varying vec3 worldP,worldN;
void main(){
for(int i=0;i<12;i++){if(i>=terrainHoleCount)break;vec4 r=terrainHoles[i];vec2 p=terrainUV-r.xy;if(p.x>=0.&&p.y>=0.&&p.x<r.z&&p.y<r.w)discard;}
float lon=(terrainUV.x-.5)*6.28318530718,lat=(terrainUV.y-.5)*3.14159265359;
vec3 geo=vec3(cos(lat)*cos(lon),cos(lat)*sin(lon),sin(lat));
gl_FragColor=vec4(earthSurfaceColour(geo,worldN,worldP),1.);
${optical ? '' : earthSurfaceOutput}}`;
}

// Only wrappers/material uniforms belong to a view; all geometry belongs to the manager.
export class EarthElevationLayer {
  constructor(manager, uniforms, id, { optical = false } = {}) {
    this.manager = manager;
    this.uniforms = uniforms;
    this.id = id;
    this.optical = optical;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.tiles = new Map();
    this.base = new THREE.Mesh(new THREE.BufferGeometry(), this.material());
    this.empty = this.base.geometry;
    this.group.add(this.base);
  }
  material() {
    return new THREE.ShaderMaterial({
      uniforms: {
        ...this.uniforms,
        terrainFade: { value: 1 },
        terrainHoleCount: { value: 0 },
        terrainHoles: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
      },
      vertexShader: vertex,
      fragmentShader: fragment(this.optical),
      toneMapped: !this.optical,
      depthTest: true,
      depthWrite: true,
    });
  }
  syncUniforms(material) {
    // The optical view swaps whole city uniform objects between preview and
    // photograph preparation. Refresh those borrowed references, while each
    // terrain mesh keeps ownership of its fade and hole uniforms.
    for (const name of Object.keys(this.uniforms)) {
      if (!TERRAIN_UNIFORMS.has(name)) material.uniforms[name] = this.uniforms[name];
    }
  }
  update(quaternion) {
    const manager = this.manager,
      active = manager.enabled && !!manager.baseGeometry;
    this.group.visible = active;
    if (!active) {
      this.clear();
      return false;
    }
    this.group.quaternion.copy(quaternion);
    this.base.geometry = manager.baseGeometry;
    this.syncUniforms(this.base.material);
    const records = manager.records(this.id),
      keys = new Set(records.map((e) => e.tile.key));
    const holes = this.base.material.uniforms;
    holes.terrainHoleCount.value = records.length;
    for (let i = 0; i < records.length; i++)
      holes.terrainHoles.value[i].fromArray(records[i].tile.rect);
    for (const [key, mesh] of this.tiles)
      if (!keys.has(key)) {
        this.group.remove(mesh);
        mesh.material.dispose();
        this.tiles.delete(key);
      }
    for (const entry of records) {
      let mesh = this.tiles.get(entry.tile.key);
      if (!mesh) {
        mesh = new THREE.Mesh(entry.geometry, this.material());
        this.tiles.set(entry.tile.key, mesh);
        this.group.add(mesh);
      }
      mesh.geometry = entry.geometry;
      mesh.position.fromArray(entry.geometry.userData.origin);
      this.syncUniforms(mesh.material);
      mesh.material.uniforms.terrainFade.value = manager.fade(entry);
    }
    return true;
  }
  clear() {
    for (const mesh of this.tiles.values()) {
      this.group.remove(mesh);
      mesh.material.dispose();
    }
    this.tiles.clear();
    this.base.geometry = this.empty;
  }
  dispose() {
    this.clear();
    this.empty.dispose();
    this.base.material.dispose();
    this.group.removeFromParent();
  }
}
