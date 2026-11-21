import { MathUtils, Quaternion, Vector3 } from 'three';
import { EARTH_RADIUS } from './orbit.js';

export const OVERVIEW_MAX_ZOOM = 128;
const rad = MathUtils.radToDeg;

function surfaceDistance(eye, direction) {
  const along = -eye.dot(direction);
  const excess = eye.lengthSq() - EARTH_RADIUS * EARTH_RADIUS;
  const discriminant = along * along - excess;
  return along > 0 && excess > 0 && discriminant > 0
    ? excess / (along + Math.sqrt(discriminant))
    : null;
}

// A virtual camera nearer the selected point with the original lens frames the
// same plane at the centre. The ground viewer can descend from that position.
export function overviewGroundTarget(camera, earthRotation, pickTerrain) {
  if (camera.zoom <= 1) return null;
  const inverse = earthRotation.clone().invert();
  const eye = camera.position.clone().applyQuaternion(inverse);
  const direction = camera.getWorldDirection(new Vector3()).applyQuaternion(inverse);
  const distance =
    pickTerrain?.(eye.toArray(), direction.toArray())?.distanceKm ??
    surfaceDistance(eye, direction);
  if (distance === null) return null;
  const hit = eye.clone().addScaledVector(direction, distance);
  const observer = hit.clone().addScaledVector(direction, -distance / camera.zoom);
  const up = observer.clone().normalize();
  const longitude = Math.atan2(up.y, up.x);
  const east = new Vector3(-Math.sin(longitude), Math.cos(longitude), 0);
  const north = up.clone().cross(east);
  const screenUp = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion).applyQuaternion(inverse);
  const e = direction.dot(east),
    n = direction.dot(north);
  const azimuth =
    Math.hypot(e, n) > 1e-6
      ? Math.atan2(e, n)
      : Math.atan2(screenUp.dot(east), screenUp.dot(north));
  const right = east.multiplyScalar(Math.cos(azimuth)).addScaledVector(north, -Math.sin(azimuth));
  const upright = right.clone().cross(direction);
  return {
    latitude: rad(Math.atan2(hit.z, Math.hypot(hit.x, hit.y))),
    longitude: rad(Math.atan2(hit.y, hit.x)),
    observerLatitude: rad(Math.atan2(up.z, Math.hypot(up.x, up.y))),
    observerLongitude: rad(longitude),
    height: (observer.length() - EARTH_RADIUS) * 1000,
    fov: camera.fov,
    elevation: rad(Math.asin(MathUtils.clamp(direction.dot(up), -1, 1))),
    azimuth: (rad(azimuth) + 360) % 360,
    rollDegrees: rad(Math.atan2(-screenUp.dot(right), screenUp.dot(upright))),
  };
}

export function installOverviewGroundZoom(camera, controls, enabled, earthRotation) {
  const update = controls.update.bind(controls);
  const baseRotate = controls.rotateSpeed,
    basePan = controls.panSpeed;
  const previous = new Quaternion(),
    rotation = new Quaternion(),
    direction = new Vector3();
  let tracking = false;
  function reset() {
    tracking = false;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.rotateSpeed = baseRotate;
    controls.panSpeed = basePan;
  }
  // OrbitControls funnels wheel, middle-mouse and pinch through a single
  // dolly factor. Split that factor at the existing orbit distance limit.
  controls.update = (...args) => {
    if (!controls.enabled || !enabled()) return update(...args);
    const earth = earthRotation();
    if (tracking && camera.zoom > 1 && !earth.equals(previous)) {
      rotation.copy(previous).invert().premultiply(earth);
      camera.position.applyQuaternion(rotation);
      controls.target.applyQuaternion(rotation);
    }
    previous.copy(earth);
    if (controls._scale !== 1) {
      const distance = controls.getDistance();
      const next = (distance * controls._scale) / camera.zoom;
      if (
        next < controls.minDistance &&
        (camera.zoom > 1 ||
          surfaceDistance(camera.position, camera.getWorldDirection(direction)) !== null)
      ) {
        camera.zoom = Math.min(OVERVIEW_MAX_ZOOM, controls.minDistance / Math.max(1, next));
        controls._scale = controls.minDistance / distance;
      } else if (camera.zoom > 1) {
        controls._scale /= camera.zoom;
        camera.zoom = 1;
      }
      camera.updateProjectionMatrix();
    }
    tracking = camera.zoom > 1;
    // Both orbit rotation and pan scale with the visible ground footprint.
    const extra = Math.max(0, camera.zoom - 1);
    controls.rotateSpeed = baseRotate / (1 + 32 * extra);
    controls.panSpeed = basePan / (1 + 6 * extra);
    return update(...args);
  };
  return { reset };
}
