export const KM_PER_DEGREE = (Math.PI * 6371.0088) / 180;
export const wrap = (longitude) => ((((longitude + 180) % 360) + 360) % 360) - 180;
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// A north-up local equirectangular map. Longitude wraps at the date line;
// a bounded parallel scale keeps the geographic overview finite at the poles.
export function locationMapFrame(site, widthKm = 80, width = 240, height = 160) {
  const latitude = clamp(Number(site.latitude) || 0, -90, 90);
  const longitude = wrap(Number(site.longitude) || 0);
  const parallel = Math.max(0.02, Math.cos((latitude * Math.PI) / 180));
  const longitudeSpan = Math.min(
    360,
    clamp(Number(widthKm) || 80, 2, 12000) / (KM_PER_DEGREE * parallel)
  );
  const actualWidthKm = longitudeSpan * KM_PER_DEGREE * parallel;
  const latitudeSpan = (actualWidthKm * height) / width / KM_PER_DEGREE;
  return makeFrame(
    latitude,
    longitude,
    width,
    height,
    longitudeSpan,
    latitudeSpan,
    actualWidthKm / width
  );
}
function makeFrame(latitude, longitude, width, height, longitudeSpan, latitudeSpan, kmPerPixel) {
  return {
    latitude,
    longitude,
    width,
    height,
    longitudeSpan,
    latitudeSpan,
    west: longitude - longitudeSpan / 2,
    east: longitude + longitudeSpan / 2,
    south: latitude - latitudeSpan / 2,
    north: latitude + latitudeSpan / 2,
    kmPerPixel,
  };
}
export function projectLocation(frame, latitude, longitude) {
  return {
    x: frame.width * (0.5 + wrap(longitude - frame.longitude) / frame.longitudeSpan),
    y: frame.height * (0.5 - (latitude - frame.latitude) / frame.latitudeSpan),
  };
}
export function locationMapScale(frame, targetPixels = 58) {
  const wanted = frame.kmPerPixel * targetPixels;
  const power = 10 ** Math.floor(Math.log10(wanted));
  const kilometres = ([5, 2, 1].find((step) => step * power <= wanted) || 1) * power;
  return { kilometres, pixels: kilometres / frame.kmPerPixel };
}
// Source bounds are WGS84 west/south/east/north and source pixels are north-up.
// Return clipped rectangles instead of drawing a huge, mostly offscreen globe.
export function locationMapImageRects(frame, bounds) {
  const [west, south, east, north] = bounds;
  if (!(east > west && north > south)) return [];
  const out = [];
  const centralShift = 360 * Math.round((frame.longitude - (west + east) / 2) / 360);
  for (const shift of [centralShift - 360, centralShift, centralShift + 360]) {
    const w = Math.max(frame.west, west + shift),
      e = Math.min(frame.east, east + shift);
    const s = Math.max(frame.south, south),
      n = Math.min(frame.north, north);
    if (e <= w || n <= s) continue;
    out.push({
      source: [
        (w - west - shift) / (east - west),
        (north - n) / (north - south),
        (e - w) / (east - west),
        (n - s) / (north - south),
      ],
      target: [
        ((w - frame.west) / frame.longitudeSpan) * frame.width,
        ((frame.north - n) / frame.latitudeSpan) * frame.height,
        ((e - w) / frame.longitudeSpan) * frame.width,
        ((n - s) / frame.latitudeSpan) * frame.height,
      ],
    });
  }
  return out;
}

// The picker keeps its vertical ground scale in km/CSS pixel. This makes the
// latitude under a moving pointer solvable directly, even as the local
// east/west scale changes with latitude. The compact observer map keeps its
// previous fixed-centre framing, including at the poles.
export function sitePickerFrame(center, kmPerPixel, width, height) {
  const maxScale = KM_PER_DEGREE * Math.max(360 / width, 180 / height);
  const scale = clamp(kmPerPixel, 0.0005, maxScale);
  const latitudeSpan = (scale * height) / KM_PER_DEGREE;
  const limit = Math.max(0, 90 - latitudeSpan / 2);
  const latitude = clamp(center.latitude, -limit, limit);
  const parallel = Math.max(1e-9, Math.cos((latitude * Math.PI) / 180));
  const longitudeSpan = Math.min(360, (scale * width) / (KM_PER_DEGREE * parallel));
  const frame = makeFrame(
    latitude,
    wrap(center.longitude),
    width,
    height,
    longitudeSpan,
    latitudeSpan,
    (longitudeSpan * KM_PER_DEGREE * parallel) / width
  );
  return { ...frame, verticalKmPerPixel: scale };
}

export function locationAtPixel(frame, { x, y }) {
  return {
    latitude: frame.north - (y / frame.height) * frame.latitudeSpan,
    longitude: wrap(frame.west + (x / frame.width) * frame.longitudeSpan),
  };
}

// Panning, pinch and wheel all retain the geographic point under the anchor.
export function anchoredSitePickerFrame(frame, anchor, target, scale) {
  let next = sitePickerFrame(frame, scale, frame.width, frame.height);
  const latitude = anchor.latitude + (target.y / frame.height - 0.5) * next.latitudeSpan;
  next = sitePickerFrame({ ...frame, latitude }, scale, frame.width, frame.height);
  const longitude = anchor.longitude - (target.x / frame.width - 0.5) * next.longitudeSpan;
  return sitePickerFrame({ latitude, longitude }, scale, frame.width, frame.height);
}
