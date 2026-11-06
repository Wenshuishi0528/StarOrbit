import { Matrix4, Vector3, Quaternion } from 'three';
import { EARTH_RADIUS, dot, unit } from './orbit.js';

const D = Math.PI / 180,
  V = (a) => new Vector3(...a);
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const MIN_FOV = 0.006,
  MAX_FOV = 110;
// Virtual instrument with a 24 mm high sensor. Field of view always means vertical field.
export const focalLength = (fov) => 12 / Math.tan((fov * D) / 2);
export const fovAtZoom = (z) => MAX_FOV * Math.pow(MIN_FOV / MAX_FOV, clamp(z, 0, 1));
export const zoomAtFov = (f) => clamp(Math.log(f / MAX_FOV) / Math.log(MIN_FOV / MAX_FOV), 0, 1);
export function lookDirection(forward, previousUp = [0, 0, 1]) {
  const f = V(forward).normalize(),
    z = f.clone().negate();
  const north = Math.abs(f.z) < 0.999999 ? new Vector3(0, 0, 1) : V(previousUp).normalize();
  if (Math.abs(north.dot(f)) > 0.999999) north.set(0, 1, 0);
  const right = f.clone().cross(north).normalize(),
    up = right.clone().cross(f).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, z)).normalize();
}
export function cameraAxes(rotation) {
  const axis = (x, y, z) => new Vector3(x, y, z).applyQuaternion(rotation).toArray();
  return { right: axis(1, 0, 0), up: axis(0, 1, 0), forward: axis(0, 0, -1) };
}
export function nudge(rotation, rightDeg, upDeg) {
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -rightDeg * D);
  const pitch = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), upDeg * D);
  return rotation.multiply(yaw).multiply(pitch).normalize();
}
export function earthInFront(eye, dir) {
  if (!eye) return false;
  const p = dot(eye, dir);
  return p < 0 && dot(eye, eye) - p * p <= EARTH_RADIUS ** 2;
}
export function groundDirection(kind, eye, q) {
  const radial = unit(eye);
  if (kind === 'nadir') return radial.map((x) => -x);
  const velocity = q.velocity,
    along = unit(velocity.map((v, i) => v - radial[i] * dot(radial, velocity)));
  const sin = clamp(EARTH_RADIUS / Math.hypot(...eye), 0, 1),
    cos = Math.sqrt(1 - sin * sin);
  return along.map((v, i) => v * sin - radial[i] * cos);
}
export function skyCoordinates(f) {
  const ra = ((Math.atan2(f[1], f[0]) / D + 360) % 360) / 15,
    dec = Math.asin(clamp(f[2], -1, 1)) / D;
  const minutes = Math.round(ra * 60) % (24 * 60);
  return (
    'RA ' +
    String(Math.floor(minutes / 60)).padStart(2, '0') +
    'ʰ ' +
    String(minutes % 60).padStart(2, '0') +
    'ᵐ   Dec ' +
    (dec < 0 ? '−' : '+') +
    Math.abs(dec).toFixed(2) +
    '°'
  );
}

// Choose an illuminated point on the observer's visible cap. If the cap is
// completely on the night side, there is no such line of sight at this epoch.
export function sunlitGroundDirection(eye, sun) {
  const r = Math.hypot(...eye),
    radial = unit(eye),
    s = unit(sun);
  if (r <= EARTH_RADIUS) return null;
  const cap = Math.acos(EARTH_RADIUS / r),
    angle = Math.acos(clamp(dot(radial, s), -1, 1));
  if (angle >= Math.PI / 2 + cap - 1e-7) return null;
  const toward = s.map((v, i) => v - radial[i] * dot(radial, s));
  if (Math.hypot(...toward) < 1e-9) return radial.map((v) => -v);
  const offset = Math.min(
    angle,
    Math.max(cap * 0.68, (Math.max(0, angle - Math.PI / 2) + cap) * 0.5)
  );
  const along = unit(toward),
    normal = radial.map((v, i) => v * Math.cos(offset) + along[i] * Math.sin(offset));
  return unit(normal.map((v, i) => v * EARTH_RADIUS - eye[i]));
}
export function groundSunAltitude(hit, q) {
  if (hit?.kind !== 'earth' || !q?.earthAxes || !q.sun) return null;
  const lat = hit.latitude * D,
    lon = hit.longitude * D,
    local = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const sun = unit(q.sun);
  return (
    Math.asin(
      clamp(
        local.reduce((sum, n, i) => sum + n * dot(sun, q.earthAxes[i]), 0),
        -1,
        1
      )
    ) / D
  );
}
