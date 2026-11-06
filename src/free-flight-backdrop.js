import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { ellipseFromState, ellipseState, snapshotFromState, validTime } from './orbit.js';

const finiteVector = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);

// Keep only the initial station state in the flight save. Refreshing the
// observation ephemeris cannot move or rewind an already flying spacecraft.
export function flightReference(seed) {
  if (!seed || !validTime(seed.t) || !finiteVector(seed.position) || !finiteVector(seed.velocity))
    throw Error('当前轨道不适用于近站飞行');
  const orbit = ellipseFromState(seed);
  if (!orbit || !Number.isFinite(orbit.n)) throw Error('当前轨道不适用于近站飞行');
  return {
    meanMotion: orbit.n,
    at(seconds) {
      const t = seed.t + seconds * 1000;
      return snapshotFromState(ellipseState(orbit, t), t);
    },
  };
}

export function createFlightBackdrop(sim) {
  const camera = new PerspectiveCamera(38, 1, 10, 1000000);
  const matrix = new Matrix4(),
    rotation = new Quaternion();
  const axes = [new Vector3(), new Vector3(), new Vector3()],
    origin = new Vector3();
  return (q, localCamera) => {
    for (let i = 0; i < 3; i++) axes[i].fromArray(q.basis[i]);
    rotation.setFromRotationMatrix(matrix.makeBasis(...axes));
    camera.position
      .copy(localCamera.position)
      .multiplyScalar(0.001)
      .applyQuaternion(rotation)
      .add(origin.fromArray(q.position));
    camera.quaternion.copy(rotation).multiply(localCamera.quaternion);
    camera.fov = localCamera.fov;
    camera.aspect = localCamera.aspect;
    camera.zoom = localCamera.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 3; i++) axes[i].fromArray(q.earthAxes[i]);
    sim.earth.quaternion.setFromRotationMatrix(matrix.makeBasis(...axes));
    sim.environment.uniforms.sun.value.fromArray(q.sun).normalize();
    sim.marker.visible = sim.orbitLine.visible = sim.sunArrow.visible = false;
    sim.renderOrbitalSky(q, camera, true);
  };
}
