import { EARTH_RADIUS, dot, norm } from './orbit.js';

const degree = Math.PI / 180;
export const VIEW_MAX_RATE = 20;
// Flux of a magnitude-8 point source at the reference collecting area and exposure.
export const CATALOG_SIGNAL = 0.2,
  DETECTOR_SIGMA = 0.26;
export function sensorOptics(fovY, apertureMm, exposure = 1) {
  const tangent = Math.tan((fovY * degree) / 2),
    areaGain = (apertureMm / 600) ** 2 * Math.max(exposure, 0);
  // Fixed 24 mm sensor height. Gaussian diffraction width approximates the core
  // of a circular aperture at 550 nm, added in quadrature to the display PSF.
  const diffraction = (0.437 * 0.00055) / apertureMm;
  const sigmaAt300 = Math.hypot(DETECTOR_SIGMA, (diffraction * 300) / (2 * tangent));
  // The best detector pixel can receive at most the whole point-source flux.
  const peakShare = Math.min(1, 1 / (2 * Math.PI * sigmaAt300 ** 2));
  const limitMagnitude =
    8 + 2.5 * Math.log10(Math.max(1e-14, (CATALOG_SIGNAL * areaGain * peakShare) / 0.0035));
  return { tangent, areaGain, diffraction, sigmaAt300, limitMagnitude };
}
export function coneHalfAngle(tangent, aspect) {
  return Math.atan(tangent * Math.hypot(1, aspect)) / degree;
}
export function groundHit(eye, direction, earthAxes) {
  const near = -dot(eye, direction);
  if (near <= 0) return null;
  const perpendicular = eye.map((v, i) => v + near * direction[i]);
  const discriminant = EARTH_RADIUS ** 2 - dot(perpendicular, perpendicular);
  if (discriminant < 0) return null;
  const distanceKm = near - Math.sqrt(discriminant);
  if (distanceKm < 0) return null;
  const point = eye.map((v, i) => v + distanceKm * direction[i]),
    fixed = earthAxes.map((axis) => dot(axis, point));
  return {
    kind: 'earth',
    distanceKm,
    latitude: Math.asin(Math.max(-1, Math.min(1, fixed[2] / norm(fixed)))) / degree,
    longitude: Math.atan2(fixed[1], fixed[0]) / degree,
  };
}
export const toLocal = (basis, direction) => basis.map((axis) => dot(axis, direction));
export function starInSky(direction, axes, tangent, aspect, eye) {
  const ahead = dot(direction, axes.forward);
  if (
    ahead <= 0 ||
    Math.abs(dot(direction, axes.right)) > ahead * tangent * aspect ||
    Math.abs(dot(direction, axes.up)) > ahead * tangent
  )
    return false;
  const towardEarth = -dot(eye, direction);
  return towardEarth <= 0 || towardEarth * towardEarth < dot(eye, eye) - EARTH_RADIUS ** 2;
}
export function starColour(bv) {
  // Interpolate the main catalogue's blue, neutral and warm stellar colours.
  // The detector adds radiance, so its input tints are linear, like THREE.Color.
  const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const stops = [
    [-0.3, [0.67, 0.79, 1]],
    [0.1, [0.753, 0.843, 1]],
    [0.4, [0.898, 0.925, 1]],
    [0.9, [1, 0.941, 0.863]],
    [1.55, [1, 0.808, 0.62]],
    [2.1, [1, 0.72, 0.54]],
  ];
  if (!Number.isFinite(bv)) return [0.898, 0.925, 1].map(linear);
  if (bv <= stops[0][0]) return stops[0][1].map(linear);
  for (let i = 1; i < stops.length; i++)
    if (bv <= stops[i][0]) {
      const [left, a] = stops[i - 1],
        [right, b] = stops[i],
        k = (bv - left) / (right - left);
      return a.map((v, j) => linear(v + (b[j] - v) * k));
    }
  return stops.at(-1)[1].map(linear);
}
