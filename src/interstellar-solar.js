import * as THREE from 'three';
import { createSharedWorldEarth } from './shared-world-earth.js';
import { AU } from './orbit.js';
import { AU_LY, LY_KM } from './interstellar-math.js';
import { SOLAR_WORLD_BODIES, solarWorldState, solarWorldBodyAxes } from './solar-world-math.js';
import { solarSurfaceShaders } from './solar-world.js';

// The same geometric ephemerides, radii, surface shader and borrowed Earth/Moon
// textures as the Solar System view. No additional texture requests or renderer.
export function createInterstellarSolar({ environment, scene, renderer }) {
  const sharedEarth = renderer
    ? createSharedWorldEarth({ environment, renderer, scene, id: 'interstellar-earth' })
    : null;
  const root = new THREE.Group();
  scene.add(root);
  const geometry = new THREE.SphereGeometry(1, 40, 24),
    bodies = new Map();
  for (const body of SOLAR_WORLD_BODIES.filter((b) => b.id !== 'Sun')) {
    const material = new THREE.ShaderMaterial({
      ...solarSurfaceShaders,
      uniforms: {
        baseColor: { value: new THREE.Color(body.color) },
        sunPosition: { value: new THREE.Vector3() },
        surfaceMap: { value: null },
        textured: { value: false },
        bands: { value: body.id === 'Jupiter' ? 0.16 : body.id === 'Saturn' ? 0.08 : 0 },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(body.radiusKm / AU);
    root.add(mesh);
    bodies.set(body.id, mesh);
  }
  const basis = new THREE.Matrix4(),
    vectors = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let states = [],
    lastTime = NaN,
    elapsed = 1;
  return {
    update(position, time, dt) {
      root.visible = Math.hypot(...position) < 300 * AU_LY;
      if (!root.visible) return;
      elapsed += dt;
      if (!states.length || (time !== lastTime && elapsed >= 0.1)) {
        states = solarWorldState(time).filter((b) => b.id !== 'Sun');
        lastTime = time;
        elapsed = 0;
        for (const state of states) {
          const axes = solarWorldBodyAxes(state.id, time);
          basis.makeBasis(...vectors.map((v, i) => v.fromArray(axes[i])));
          bodies.get(state.id).quaternion.setFromRotationMatrix(basis);
        }
      }
      for (const body of states) {
        const mesh = bodies.get(body.id);
        mesh.position.set(...body.position.map((v, i) => v - position[i] / AU_LY));
        mesh.material.uniforms.sunPosition.value.set(...position.map((v) => -v / AU_LY));
        const texture =
          body.id === 'Earth'
            ? environment.uniforms.dayMap.value
            : body.id === 'Moon'
              ? environment.moon.texture
              : null;
        mesh.material.uniforms.surfaceMap.value = texture;
        mesh.material.uniforms.textured.value = !!texture && texture.image?.width > 1;
      }
    },
    renderEarth(camera, time, width, height) {
      if (!sharedEarth) return;
      const earth = bodies.get('Earth');
      sharedEarth.group.visible = root.visible;
      if (!root.visible) {
        environment.elevation.release('interstellar-earth');
        environment.cityTerrain.setView('interstellar-earth', null);
        return;
      }
      earth.visible = false;
      sharedEarth.update({
        time,
        camera,
        earthPosition: earth.position.toArray(),
        unitsPerKm: 1 / AU,
        width,
        height,
      });
    },
    renderEarthEffects() {
      sharedEarth?.renderEffects();
    },
    keepOutside(position) {
      if (!root.visible) return;
      for (const body of states) {
        const p = body.position.map((v) => v * AU_LY),
          r = (body.radiusKm / LY_KM) * 1.02;
        const delta = position.map((v, i) => v - p[i]),
          distance = Math.hypot(...delta);
        if (distance < r)
          for (let i = 0; i < 3; i++)
            position[i] = p[i] + (distance > 0 ? delta[i] / distance : i === 2 ? 1 : 0) * r;
      }
    },
    dispose() {
      sharedEarth?.dispose();
      root.removeFromParent();
      geometry.dispose();
      for (const mesh of bodies.values()) mesh.material.dispose();
    },
  };
}
