import { Box3 } from 'three';

const viewBounds = new Box3();
// The telescope renders nearby spacecraft separately from the distant sky and
// Earth. Keep half the closest assembly depth as a conservative clipping margin.
export function stationNearPlane(camera, boxes) {
  let closest = Infinity;
  for (const box of boxes) {
    if (!box || box.isEmpty()) continue;
    viewBounds.copy(box).applyMatrix4(camera.matrixWorldInverse);
    if (viewBounds.min.z >= 0) continue;
    closest = Math.min(closest, Math.max(0, -viewBounds.max.z));
  }
  return Number.isFinite(closest) ? Math.max(0.015, closest * 0.5) : 0.015;
}
