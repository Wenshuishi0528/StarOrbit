import { Vector3 } from 'three';
import { dot } from './orbit.js';
import { cameraAxes, lookDirection, MIN_FOV } from './xuntian-pointing.js';
import { webbPlateRay } from './webb-plate.js';

const radians = Math.PI / 180;
const vector = (xyz) => new Vector3(...xyz);

// Frame the actual celestial footprint: the plate centre may be displaced from
// the WCS reference pixel or the associated object's catalogue coordinates.
export function frameSkyArtwork(provider, direction, aspect, fallbackFov) {
  const forward = vector(direction).normalize();
  const plate = provider?.plate;
  const axes = cameraAxes(lookDirection(direction));
  if (!plate) return { ...axes, fovY: fallbackFov, aspect };
  const right = forward.clone().cross(vector(plate.down).negate()).normalize();
  const up = right.clone().cross(forward).normalize();
  let tangent = 0;
  for (const [u, v] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]) {
    const ray = vector(webbPlateRay(plate, u, v)),
      depth = ray.dot(forward);
    if (depth <= 0) return { ...axes, fovY: fallbackFov, aspect };
    tangent = Math.max(
      tangent,
      Math.abs(ray.dot(up)) / depth,
      Math.abs(ray.dot(right)) / (depth * aspect)
    );
  }
  const fovY = Math.max(MIN_FOV, Math.min(100, (2 * Math.atan(1.05 * tangent)) / radians));
  return { forward: forward.toArray(), right: right.toArray(), up: up.toArray(), fovY, aspect };
}

function aim(sim, direction, up, distance) {
  const orbit = sim.view === 'orbit',
    camera = orbit ? sim.spaceCamera : sim.api.camera,
    controls = orbit ? sim.orbitControls : sim.api.controls;
  const local = (v) => (orbit ? v : sim.current.basis.map((axis) => dot(axis, v)));
  if (up) camera.up.fromArray(local(up)).normalize();
  controls.target.copy(camera.position).addScaledVector(vector(local(direction)), distance);
  camera.lookAt(controls.target);
}

export function restoreMainSkyLens(sim) {
  const frame = sim?.mainSkyFrame;
  const camera = sim?.api.camera;
  if (!camera) return;
  if (frame) {
    sim.mainSkyFrame = null;
    frame.controls.removeEventListener('start', frame.unlock);
    frame.controls.rotateSpeed = frame.rotateSpeed;
    frame.controls.panSpeed = frame.panSpeed;
    if (camera.fov === frame.view.fovY) {
      camera.fov = frame.originalFov;
      frame.camera.up.copy(frame.originalUp);
      frame.camera.zoom = frame.originalZoom;
      frame.camera.updateProjectionMatrix();
    }
  } else if (camera.fov < 10) {
    // A saved scene containing a catalogue framing can also be reset.
    camera.fov = 38;
  } else return;
  camera.updateProjectionMatrix();
}

export function updateMainSkyPointing(sim) {
  const frame = sim.mainSkyFrame;
  if (!frame) return;
  if (sim.api.camera.fov !== frame.view.fovY) {
    restoreMainSkyLens(sim);
    return;
  }
  if (frame.locked && sim.current && sim.view !== 'orbit')
    aim(sim, frame.view.forward, frame.view.up, frame.distance);
}

export function pointMainCameraAtSky(sim, direction, view) {
  const orbit = sim.view === 'orbit',
    camera = orbit ? sim.spaceCamera : sim.api.camera,
    controls = orbit ? sim.orbitControls : sim.api.controls;
  restoreMainSkyLens(sim);
  if (orbit) sim.overviewZoom?.reset();
  controls.stopMotion();
  const distance = Math.max(
    orbit ? controls.minDistance : 20,
    camera.position.distanceTo(controls.target)
  );
  if (view) {
    const frame = {
      view,
      camera,
      controls,
      distance,
      locked: true,
      originalUp: camera.up.clone(),
      originalZoom: camera.zoom,
      originalFov: sim.api.camera.fov,
      rotateSpeed: controls.rotateSpeed,
      panSpeed: controls.panSpeed,
    };
    frame.unlock = () => {
      frame.locked = false;
    };
    controls.addEventListener('start', frame.unlock);
    sim.mainSkyFrame = frame;
    sim.api.camera.fov = view.fovY;
    sim.api.camera.updateProjectionMatrix();
    camera.zoom = 1;
    camera.fov = view.fovY;
    camera.updateProjectionMatrix();
    if (!orbit) {
      const sensitivity = Math.min(1, view.fovY / frame.originalFov);
      controls.rotateSpeed *= sensitivity;
      controls.panSpeed *= sensitivity;
    }
  }
  aim(sim, direction, view?.up, distance);
  controls.update();
  sim.cameraFocus?.resetAnchor();
  sim.dirty = true;
}
