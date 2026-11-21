import { Vector3 } from 'three';
import { dot } from './orbit.js';

export function pointMainCameraAtSky(sim, direction) {
  const orbit = sim.view === 'orbit',
    camera = orbit ? sim.spaceCamera : sim.api.camera;
  const controls = orbit ? sim.orbitControls : sim.api.controls;
  const local = orbit ? direction : sim.current.basis.map((axis) => dot(axis, direction));
  const distance = Math.max(20, camera.position.distanceTo(controls.target));
  controls.stopMotion();
  controls.target.copy(camera.position).addScaledVector(new Vector3(...local), distance);
  camera.lookAt(controls.target);
  controls.update();
  sim.cameraFocus?.resetAnchor();
  sim.dirty = true;
}
