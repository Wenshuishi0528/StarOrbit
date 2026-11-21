import { cameraAxes } from './xuntian-pointing.js';
import { projectSky } from './balcony-sky-view-math.js';
import { placeSkyLabels } from './star-chart-math.js';
import { skyAnnotationTextWidth } from './sky-annotation-layout.js';
import { groundEyepieceMargins } from './ground-star-satellites.js';
import { dot } from './orbit.js';

// The shared celestial chart labels stars and deep-sky objects. This overlay
// places the separately rendered topocentric Sun, Moon and planets in ENU.
export function groundScopeBodyLabels({
  status,
  width,
  height,
  radius,
  bodies = [],
  trackedBody,
  reserved = [],
  hidden = () => false,
}) {
  if (!status?.camera || !status.labels?.length) return [];
  const camera = status.camera;
  const focal = (camera.zoom * height) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  const projection = {
    ...cameraAxes(camera.quaternion),
    mode: 'perspective',
    width,
    height,
    focal,
  };
  const candidates = [];
  for (const row of status.labels) {
    if (!row.bodyId || row.bodyId === trackedBody) continue;
    const point = projectSky(row.direction, projection);
    if (!point) continue;
    const { x, y } = point;
    const edge = Math.min(x, y, width - x, height - y);
    if (edge < 3 || (radius && Math.hypot(x - width / 2, y - height / 2) >= radius - 2)) continue;
    if (hidden(row, x, y)) continue;
    const body = bodies.find((item) => item.id === row.bodyId);
    const disc = body
      ? (focal * Math.tan(body.radiusRad)) / dot(projection.forward, row.direction)
      : 0;
    candidates.push({
      ...point,
      bodyId: row.bodyId,
      text: row.text,
      w: skyAnnotationTextWidth(row.text, 12) + 4,
      h: 16,
      anchorRadius: disc,
      symbol: { height: 2 * disc },
    });
  }
  if (!candidates.length) return [];
  return placeSkyLabels(candidates, width, height, 0.65, [
    ...reserved,
    ...groundEyepieceMargins(width, height, radius),
    { x: width / 2 - 16, y: height / 2 - 16, w: 32, h: 32 },
  ]);
}

export function paintGroundScopeBodyLabels(ctx, names) {
  ctx.save();
  ctx.font = '500 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(6,14,21,0.9)';
  ctx.fillStyle = '#ffe4c8';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  for (const { text, rect } of names) {
    const x = rect.x + 2,
      y = rect.y + rect.h / 2;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}
