// Surface coordinates use the renderer's +X prime / +Y east / +Z north frame.
// Index once by catalogue identity; no DOM and no per-frame full catalogue sort.
const RAD = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const validLunarPlace = (place) =>
  Number.isFinite(place?.latitude) &&
  Math.abs(place.latitude) <= 90 &&
  Number.isFinite(place?.longitude) &&
  Math.abs(place.longitude) <= 360;
export function lunarPlaceDirection(place) {
  const latitude = place.latitude * RAD,
    longitude = place.longitude * RAD;
  return [
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
  ];
}
export function lunarPlaceName(place, language = 'en') {
  if (place?.localizedName) return place.localizedName;
  if (typeof place?.name === 'object') return place.name[language] || place.name.en || place.id;
  return (language === 'zh' && place?.nameZh) || place?.name || place?.id || '';
}
export function lunarLandingMarker(place) {
  const failed = place.outcome === 'impact-failed';
  return {
    shape: place.country === 'CN' ? 'star' : 'diamond',
    color: place.country === 'CN' ? '#ff5454' : '#8de4f1',
    filled: !failed,
    failed,
    partial: place.outcome === 'soft-partial',
  };
}
export function createLunarPlaceIndex(places = []) {
  const buckets = new Map();
  let count = 0;
  for (const place of places) {
    if (!validLunarPlace(place) || place.kind === 'landing') continue;
    const longitude = ((((place.longitude + 180) % 360) + 360) % 360) - 180;
    const x = Math.min(35, Math.floor((longitude + 180) / 10));
    const y = Math.min(17, Math.floor((place.latitude + 90) / 10));
    const key = y * 36 + x;
    if (!buckets.has(key))
      buckets.set(key, {
        direction: lunarPlaceDirection({ longitude: x * 10 - 175, latitude: y * 10 - 85 }),
        radius: 0,
        entries: [],
      });
    const bucket = buckets.get(key),
      direction = lunarPlaceDirection(place);
    bucket.radius = Math.max(
      bucket.radius,
      Math.acos(clamp(dot(direction, bucket.direction), -1, 1))
    );
    bucket.entries.push({
      place,
      direction,
      diameterKm: Math.max(0, Number(place.diameterKm) || 0),
    });
    count++;
  }
  for (const bucket of buckets.values()) bucket.entries.sort((a, b) => b.diameterKm - a.diameterKm);
  return {
    count,
    bucketCount: buckets.size,
    query({ direction, angularRadius = Math.PI / 2, minDiameterKm = 0 }) {
      const result = [];
      let visited = 0;
      const cosine = Math.cos(angularRadius);
      for (const bucket of buckets.values()) {
        if (
          dot(direction, bucket.direction) <
          Math.cos(Math.min(Math.PI, angularRadius + bucket.radius + 1e-8))
        )
          continue;
        for (const entry of bucket.entries) {
          if (entry.diameterKm < minDiameterKm) break;
          visited++;
          if (dot(direction, entry.direction) >= cosine - 1e-8) result.push(entry);
        }
      }
      return { entries: result, visited };
    },
  };
}
// Camera points at the lunar centre. The corner ray's first intersection gives
// a conservative spherical cap; if a corner misses, use the visible hemisphere.
export function lunarVisibleCap(distance, verticalFovDegrees, aspect) {
  const d = Math.max(1.00001, distance);
  const beta = Math.atan(Math.tan((verticalFovDegrees * RAD) / 2) * Math.hypot(1, aspect));
  const limb = Math.asin(1 / d);
  return beta >= limb ? Math.acos(1 / d) : Math.asin(clamp(d * Math.sin(beta), -1, 1)) - beta;
}

export function layoutLunarPlaces({
  index,
  selected,
  landingSites = [],
  project,
  width,
  height,
  density = 0.45,
  pixelsPerKm,
  direction,
  angularRadius,
  labels = true,
  language = 'en',
  measureText = (text) => text.length * 6.5,
}) {
  density = Number.isFinite(density) ? clamp(density, 0, 1) : 0.45;
  const unlimited = density >= 1;
  const minPixels = 26 - 22 * density;
  const query = labels
    ? index.query({
        direction,
        angularRadius,
        minDiameterKm: unlimited ? 0 : minPixels / Math.max(0.00001, pixelsPerKm),
      })
    : { entries: [], visited: 0 };
  const entries = query.entries.sort((a, b) => b.diameterKm - a.diameterKm);
  const ordered = [];
  if (
    validLunarPlace(selected) &&
    (selected.kind === 'landing' ? landingSites.some((p) => p.id === selected.id) : labels)
  )
    ordered.push({ place: selected, direction: lunarPlaceDirection(selected), selected: true });
  for (const place of landingSites)
    if (validLunarPlace(place) && place.id !== selected?.id)
      ordered.push({ place, direction: lunarPlaceDirection(place) });
  for (const entry of entries)
    if (!selected || (entry.place.id !== selected.id && entry.place.featuredId !== selected.id))
      ordered.push(entry);
  const result = [],
    grid = new Map();
  const maximum = unlimited ? Infinity : Math.round(12 + 180 * density * density);
  let regularLabels = 0;
  const intersects = (box) => {
    for (let x = Math.floor(box.x / 80); x <= Math.floor((box.x + box.width) / 80); x++)
      for (let y = Math.floor(box.y / 24); y <= Math.floor((box.y + box.height) / 24); y++)
        for (const other of grid.get(x + ':' + y) || [])
          if (
            box.x < other.x + other.width &&
            box.x + box.width > other.x &&
            box.y < other.y + other.height &&
            box.y + box.height > other.y
          )
            return true;
    return false;
  };
  const reserve = (box) => {
    for (let x = Math.floor(box.x / 80); x <= Math.floor((box.x + box.width) / 80); x++)
      for (let y = Math.floor(box.y / 24); y <= Math.floor((box.y + box.height) / 24); y++) {
        const key = x + ':' + y;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(box);
      }
  };
  for (const entry of ordered) {
    const point = project(entry.place, entry.direction);
    if (
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x > width ||
      point.y > height
    )
      continue;
    const landing = entry.place.kind === 'landing',
      text = lunarPlaceName(entry.place, language);
    const textWidth = Math.min(width - 12, measureText(text) + 10),
      box = {
        x: clamp(point.x + 8, 4, Math.max(4, width - textWidth - 4)),
        y: clamp(point.y - 10, 3, Math.max(3, height - 21)),
        width: textWidth,
        height: 18,
      };
    const showText =
      entry.selected || unlimited || ((landing || regularLabels < maximum) && !intersects(box));
    if (!landing && !showText) continue;
    if (showText) {
      reserve(box);
      if (!landing && !entry.selected) regularLabels++;
    }
    result.push({
      ...entry,
      ...point,
      text,
      box,
      showText,
      marker: landing ? lunarLandingMarker(entry.place) : null,
    });
  }
  return {
    items: result,
    visited: query.visited,
    candidates: query.entries.length,
    overlap: unlimited,
  };
}
