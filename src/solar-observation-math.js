import { cross, dot, unit } from './orbit.js';

// Browse images are already solar-north-up, not longitude/latitude maps.
// The solar-west axis is image-right; the detector roll is applied only once,
// by projecting this inertial frame through the actual observing camera.
export function solarImageAxes(body) {
  const forward = unit(body.direction),
    right = unit(cross(forward, body.north)),
    up = unit(cross(right, forward));
  return { forward, right, up };
}
export function solarImageUV(ray, body, record) {
  const axes = solarImageAxes(body),
    along = dot(ray, axes.forward);
  if (along <= 0) return null;
  const scale = record.radiusFraction / (2 * along * Math.tan(body.radiusRad));
  const center = record.solarCenterUV || [0.5, 0.5];
  return [center[0] + dot(ray, axes.right) * scale, center[1] + dot(ray, axes.up) * scale];
}
export function solarImageFootprint(body, record) {
  const fraction = record?.radiusFraction;
  if (!(fraction > 0 && fraction <= 1) || !body?.radiusRad) return null;
  return Math.atan(Math.tan(body.radiusRad) / fraction);
}
// Each frustum side is a plane through the observer. Leave the instrument
// only after the whole image (with a small guard band for limb studies) lies
// outside a side. A roll, zoom or orbit update alone never triggers this test.
export function sunlightOutsideView(axes, fovY, aspect, sun, record) {
  if (!sun?.direction || !axes || !(aspect > 0) || !(fovY > 0)) return false;
  const z = dot(axes.forward, sun.direction);
  const radius = (solarImageFootprint(sun, record) || sun.radiusRad || 0) * 1.1;
  const tanY = Math.tan((fovY * Math.PI) / 360);
  return [
    [axes.right, tanY * aspect],
    [axes.up, tanY],
  ].some(
    ([axis, tangent]) =>
      (Math.abs(dot(axis, sun.direction)) - z * tangent) / Math.hypot(1, tangent) > Math.sin(radius)
  );
}
// These bodies can pass in front of the Sun. The Moon may cover the entire
// disk; inner planets retain their true apparent sizes during a transit.
export function solarImageOccluders(sun, bodies) {
  return bodies.filter(
    (body) =>
      ['Moon', 'Mercury', 'Venus'].includes(body.id) &&
      body.distanceKm < sun.distanceKm &&
      body.radiusRad > 0
  );
}
