// Heights and patch vertices are in metres in the patch's east/north/up frame.
// Bound entire cells (including their interiors), so a peak between screen
// corners or a cliff beside the observer cannot be culled as empty sky.
const boxes = new WeakMap();
export function patchBoxes(data) {
  if (data.horizonBoxes) return data.horizonBoxes;
  let result = boxes.get(data);
  if (result) return result;
  result = [];
  const n = data.segments,
    p = data.positions;
  for (let y = 0; y < n; y += 16) {
    for (let x = 0; x < n; x += 16) {
      let left = Infinity,
        right = -Infinity,
        bottom = Infinity,
        top = -Infinity,
        high = -Infinity;
      for (let j = y; j <= Math.min(n, y + 16); j++) {
        for (let i = x; i <= Math.min(n, x + 16); i++) {
          const k = 3 * (j * (n + 1) + i);
          left = Math.min(left, p[k]);
          right = Math.max(right, p[k]);
          bottom = Math.min(bottom, p[k + 1]);
          top = Math.max(top, p[k + 1]);
          high = Math.max(high, p[k + 2]);
        }
      }
      result.push(left, right, bottom, top, high);
    }
  }
  boxes.set(data, result);
  return result;
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function terrainCeiling(site, patch, elevated) {
  if (!elevated) return site.height >= 0 ? 0 : Math.PI / 2;
  const lat = (site.latitude * Math.PI) / 180,
    lon = (site.longitude * Math.PI) / 180;
  const up = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  let ceiling = 0,
    covered = 0;
  for (const part of [patch, patch?.surround]) {
    const data = part?.data;
    if (!data?.sphereRadius || !data.segments) continue;
    const f = data.frame,
      offset = up.map((v, i) => v * (data.sphereRadius + site.height) - f.origin[i]);
    const x = dot(offset, f.east),
      y = dot(offset, f.north),
      z = dot(offset, f.up);
    const tilt = Math.acos(Math.min(1, Math.max(-1, dot(up, f.up))));
    const b = patchBoxes(data);
    for (let k = 0; k < b.length; k += 5) {
      const rise = b[k + 4] - z + 0.5;
      if (rise <= 0) continue;
      const dx = Math.max(0, b[k] - x, x - b[k + 1]),
        dy = Math.max(0, b[k + 2] - y, y - b[k + 3]);
      ceiling = Math.max(ceiling, Math.atan2(rise, Math.hypot(dx, dy)) + tilt);
    }
    // The globe is clipped to the outermost available patch. Allow extra
    // room for the change of tangent frame across its extent.
    covered = Math.max(0, data.halfSize * 0.98 - Math.hypot(x, y) - 12000 * Math.sin(tilt));
  }
  // All terrestrial DEM relief is below 12 km. Beyond the patch, curvature
  // only lowers the visible relief relative to the local tangent plane.
  const rise = Math.max(0, 12000 - site.height);
  return Math.max(ceiling, rise ? Math.atan2(rise, covered) : 0);
}
export function skyClearsTerrain(elevation, fov, aspect, ceiling) {
  const halfDiagonal = Math.atan(Math.tan((fov * Math.PI) / 360) * Math.hypot(1, aspect));
  return (elevation * Math.PI) / 180 - halfDiagonal > ceiling + 0.002;
}
