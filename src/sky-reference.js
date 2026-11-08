import * as Astronomy from 'astronomy-engine';

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const spherical = (lon, lat) => [
  Math.cos(lat * DEG) * Math.cos(lon * DEG),
  Math.cos(lat * DEG) * Math.sin(lon * DEG),
  Math.sin(lat * DEG),
];
const niceStep = (value) =>
  [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15, 30, 60].find(
    (step) => step >= value
  ) || 60;
const cache = new Map();
let lastEpoch, lastFrames;

// Astronomy Engine matrices are column-major. Both the physical star catalogue
// and the main sky use EQJ; only these teaching references change with date.
// EQD/ECT are true equator/ecliptic of date, including precession and nutation.
export function skyReferenceFrames(epoch) {
  if (!Number.isFinite(epoch)) return null;
  if (epoch !== lastEpoch) {
    const date = new Date(epoch);
    if (!Number.isFinite(date.getTime())) return null;
    try {
      lastFrames = {
        equatorialGrid: Astronomy.Rotation_EQD_EQJ(date).rot,
        eclipticLine: Astronomy.Rotation_ECT_EQJ(date).rot,
      };
      if (!Object.values(lastFrames).every((columns) => columns.flat().every(Number.isFinite)))
        lastFrames = null;
    } catch {
      // Invalid/extreme imported dates must not take down the physical view.
      lastFrames = null;
    }
    lastEpoch = epoch;
  }
  return lastFrames;
}

export const rotateSkyReference = (columns, vector) =>
  [0, 1, 2].map((i) => columns.reduce((sum, column, j) => sum + column[i] * vector[j], 0));

function coordinates(direction, columns) {
  const v = columns.map((column) => dot(column, direction));
  return {
    lon: (((Math.atan2(v[1], v[0]) / DEG) % 360) + 360) % 360,
    lat: Math.asin(clamp(v[2], -1, 1)) / DEG,
  };
}
const rounded = (value) => String(Number(value.toFixed(4)));
function raText(degrees) {
  const seconds = Math.round(((((degrees % 360) + 360) % 360) / 15) * 360000) / 100,
    hours = Math.floor(seconds / 3600) % 24,
    minutes = Math.floor(seconds / 60) % 60,
    rest = Number((seconds % 60).toFixed(2));
  return `${hours}h${minutes || rest ? String(minutes).padStart(2, '0') + 'm' : ''}${rest ? (rest < 10 ? '0' : '') + rest + 's' : ''}`;
}
function path(lon0, lat0, lon1, lat1, step) {
  const count = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(lon1 - lon0), Math.abs(lat1 - lat0)) / step)
  );
  return Array.from({ length: count + 1 }, (_, i) =>
    spherical(lon0 + ((lon1 - lon0) * i) / count, lat0 + ((lat1 - lat0) * i) / count)
  );
}

// A padded local patch keeps narrow-field grids useful without allocating an
// arcminute grid over the entire sphere. Geometry changes only on cell/zoom
// boundaries; exact epoch rotations are applied separately by each renderer.
export function skyReferenceGeometry({ fovY, aspect = 1, forward, columns, allSky = false }) {
  const center = coordinates(forward, columns),
    radius = Math.min(
      179,
      (Math.atan(Math.tan((fovY * DEG) / 2) * Math.hypot(1, aspect)) / DEG) * 1.15
    ),
    decStep = allSky ? 15 : niceStep(fovY / 5),
    pole = allSky || Math.abs(center.lat) + radius + decStep >= 90,
    raSpan = pole
      ? 180
      : Math.asin(clamp(Math.sin(radius * DEG) / Math.cos(center.lat * DEG), -1, 1)) / DEG,
    raStep = pole ? 30 : niceStep(fovY / (5 * Math.max(0.05, Math.cos(center.lat * DEG)))),
    raCenter = Math.round(center.lon / raStep) * raStep,
    decCenter = Math.round(center.lat / decStep) * decStep,
    decMin = allSky
      ? -90
      : Math.max(-90, Math.floor((center.lat - radius) / decStep) * decStep - decStep),
    decMax = allSky
      ? 90
      : Math.min(90, Math.ceil((center.lat + radius) / decStep) * decStep + decStep),
    raMin = pole ? 0 : Math.floor((center.lon - raSpan) / raStep) * raStep - raStep,
    raMax = pole ? 360 : Math.ceil((center.lon + raSpan) / raStep) * raStep + raStep,
    sampleStep = Math.min(1, Math.max(0.001, decStep / 10)),
    key = [raStep, decStep, raMin, raMax, decMin, decMax, raCenter, decCenter, sampleStep].join(
      '|'
    );
  if (cache.has(key)) return cache.get(key);
  const parallels = [],
    meridians = [],
    labels = [],
    labelLat = clamp(decCenter, -75, 75);
  for (let ra = raMin; ra < raMax - 1e-7; ra += raStep) {
    meridians.push(path(ra, decMin, ra, decMax, sampleStep));
    labels.push({ key: 'ra-' + ra, text: raText(ra), direction: spherical(ra, labelLat) });
  }
  for (let dec = decMin; dec <= decMax + 1e-7; dec += decStep) {
    if (Math.abs(dec) >= 89.999) continue;
    parallels.push(path(raMin, dec, raMax, dec, sampleStep / Math.max(0.001, Math.cos(dec * DEG))));
    labels.push({
      key: 'dec-' + dec,
      text: `δ ${dec > 0 ? '+' : ''}${rounded(dec)}°`,
      direction: spherical(raCenter, dec),
    });
  }
  const result = { key, paths: [...meridians, ...parallels], labels };
  cache.set(key, result);
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  return result;
}

const eclipticPath = [path(0, 0, 360, 0, 0.5)];
const eclipticNames = { zh: '黄道', en: 'Ecliptic', fr: 'Écliptique', ru: 'Эклиптика' };
export const SKY_REFERENCE_GLYPHS = '0123456789hmsδλ°+−- .黄道EclipticÉcliptiqueЭклиптика';

export function skyReferenceLayers({
  settings,
  epoch,
  fovY = 60,
  aspect = 1,
  forward = [1, 0, 0],
  language = 'zh',
  allSky = false,
}) {
  if (!settings.equatorialGrid && !settings.eclipticLine) return [];
  const frames = skyReferenceFrames(epoch);
  if (!frames) return [];
  const layers = [];
  if (settings.equatorialGrid) {
    const columns = frames.equatorialGrid,
      geometry = skyReferenceGeometry({ fovY, aspect, forward, columns, allSky });
    layers.push({
      ...geometry,
      setting: 'equatorialGrid',
      columns,
      color: '#679eaf',
      tint: [0.035, 0.09, 0.115],
      opacity: 0.32,
      dashed: false,
    });
  }
  if (settings.eclipticLine) {
    const columns = frames.eclipticLine,
      center = coordinates(forward, columns),
      step = Math.min(30, niceStep(fovY / 2)),
      longitude = Math.round(center.lon / step) * step;
    layers.push({
      key: 'ecliptic',
      setting: 'eclipticLine',
      columns,
      paths: eclipticPath,
      labels: [-step, 0, step].map((offset) => ({
        key: 'ecliptic-' + (longitude + offset),
        text: `${eclipticNames[language] || eclipticNames.en} · λ ${rounded((((longitude + offset) % 360) + 360) % 360)}°`,
        direction: spherical(longitude + offset, 0),
      })),
      color: '#d4ac60',
      tint: [0.22, 0.14, 0.045],
      opacity: 0.65,
      dashed: false,
    });
  }
  return layers;
}
