import { Matrix4, Vector3, Quaternion } from 'three';

const matrix = new Matrix4(),
  inverse = new Quaternion(),
  vector = new Vector3();
// The camera and the optical frame both end up in the same Earth-fixed axes.
export function cityCameraView(camera, earthQuaternion, width, height) {
  camera.updateMatrixWorld();
  inverse.copy(earthQuaternion).invert();
  matrix.makeRotationFromQuaternion(inverse).multiply(camera.matrixWorld);
  const e = matrix.elements;
  return {
    eyeKm: vector.copy(camera.position).applyQuaternion(inverse).toArray(),
    right: [e[0], e[1], e[2]],
    up: [e[4], e[5], e[6]],
    forward: [-e[8], -e[9], -e[10]],
    fovY: camera.fov,
    aspect: width / height,
    width,
    height,
  };
}
export function cityOpticalView(frame, size) {
  const transform = (v) =>
    frame.q.earthAxes.map((axis) => axis.reduce((sum, x, i) => sum + x * v[i], 0));
  return {
    eyeKm: transform(frame.eyeKm),
    right: transform(frame.axes.right),
    up: transform(frame.axes.up),
    forward: transform(frame.axes.forward),
    fovY: frame.fovY,
    aspect: size.aspect || size.w / size.h,
    width: size.w,
    height: size.h,
  };
}
