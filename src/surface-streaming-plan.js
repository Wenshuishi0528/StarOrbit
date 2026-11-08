import { visibleCityRegions } from './city-terrain-math.js';

const DEG = Math.PI / 180,
  R = 6371;
const wrap = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lonLat = (p) => [
  Math.atan2(p[1], p[0]) / DEG,
  Math.atan2(p[2], Math.hypot(p[0], p[1])) / DEG,
];

export function streamingAnchor(view) {
  if (!view?.eyeKm || !view.forward || !Number.isFinite(view.fovY)) return null;
  const radius = Math.hypot(...view.eyeKm),
    altitude = radius - R;
  if (altitude < -0.01) return null;
  // A globe overview already has an appropriate global map. Zooming in enables
  // regional imagery according to projected ground pixels, not altitude alone.
  const pixelMeters =
    (2000 * Math.max(0.001, altitude) * Math.tan((view.fovY * DEG) / 2)) / Math.max(1, view.height);
  if (pixelMeters > 300) return null;
  let center = lonLat(view.eyeKm);
  if (altitude > 20) {
    const b = dot(view.eyeKm, view.forward),
      discriminant = b * b - radius * radius + R * R;
    if (discriminant < 0) return null;
    const distance = -b - Math.sqrt(discriminant);
    if (distance <= 0) return null;
    center = lonLat(view.eyeKm.map((x, i) => x + distance * view.forward[i]));
  }
  return { center, altitude, pixelMeters };
}

// Stable latitude bands with longitude cell width adapted to latitude: about
// 111 km per region, independent of travel path or city names. Region boundaries
// align exactly; dateline cells never wrap and Mercator polar limits are explicit.
export function streamRegion(row, column) {
  const south = row - 90,
    north = south + 1,
    latitude = (south + north) / 2;
  if (south < -85 || north > 85) return null;
  const columns = Math.max(32, Math.round(360 * Math.cos(latitude * DEG)));
  column = ((column % columns) + columns) % columns;
  const west = -180 + (column * 360) / columns,
    east = -180 + ((column + 1) * 360) / columns;
  const longitude = (west + east) / 2;
  return {
    id: `surface-2025-${row}-${column}`,
    streaming: true,
    name: `${latitude.toFixed(1)}°, ${longitude.toFixed(1)}°`,
    latitude,
    longitude,
    center: [longitude, latitude],
    bounds: [west, south, east, north],
    extentKm: Math.max(111.32, (east - west) * 111.32 * Math.cos(latitude * DEG)),
    maxLevel: 0,
  };
}

export function planStreamingRegions(view, { rangeKm = 120, maxRegions = 48 } = {}) {
  const anchor = streamingAnchor(view);
  if (!anchor || Math.abs(anchor.center[1]) >= 85) return [];
  const radius = clamp(Number(rangeKm) || 120, 20, 400),
    [lon, lat] = anchor.center;
  const span = Math.ceil(radius / 110) + 1,
    candidates = [];
  const middle = Math.floor(lat + 90);
  for (let row = Math.max(5, middle - span); row <= Math.min(174, middle + span); row++) {
    const latitude = row - 89.5,
      columns = Math.max(32, Math.round(360 * Math.cos(latitude * DEG)));
    const mid = Math.floor(((wrap(lon) + 180) / 360) * columns);
    const horizontal =
      Math.ceil(radius / ((360 / columns) * 111.32 * Math.cos(latitude * DEG))) + 1;
    for (let dx = -horizontal; dx <= horizontal; dx++) {
      const region = streamRegion(row, mid + dx);
      const dl = wrap(region.longitude - lon) * DEG,
        p = lat * DEG,
        q = region.latitude * DEG;
      const distance =
        R *
        2 *
        Math.asin(
          Math.sqrt(
            Math.min(
              1,
              Math.sin((p - q) / 2) ** 2 + Math.cos(p) * Math.cos(q) * Math.sin(dl / 2) ** 2
            )
          )
        );
      // Root cap extends approximately 80 km; reject wholly outside the radius.
      if (distance > radius + 80) continue;
      region.distanceKm = distance;
      candidates.push(region);
    }
  }
  return visibleCityRegions(candidates, view, { elevationKm: 9 })
    .sort((a, b) => a.meta.distanceKm - b.meta.distanceKm || b.score - a.score)
    .slice(0, maxRegions)
    .map((x) => x.meta);
}

export function streamingViewKey(views) {
  return views
    .filter((v) => v.input)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map((v) => {
      const a = streamingAnchor(v.input);
      if (!a) return v.id + ':overview';
      return [
        v.id,
        ...a.center.map((x) => Math.round(x * 20)),
        Math.round(Math.log2(Math.max(0.05, a.altitude)) * 4),
        Math.round(v.input.fovY),
        ...v.input.forward.map((x) => Math.round(x * 20)),
      ].join(':');
    })
    .join('|');
}
