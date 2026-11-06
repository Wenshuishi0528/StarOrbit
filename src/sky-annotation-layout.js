import chart from '../assets/star-chart.json';
import { equatorial } from './environment-math.js';
import { solarApparent } from './solar-system.js';
import { solarLabel } from './solar-targets.js';
import { DEEP_SKY_OBJECTS } from './deep-sky-catalog.js';
import { deepSkyInScope, deepSkyLabel, deepSkySymbol } from './star-chart-symbols.js';
import { starChartName, starChartHasName } from './star-label-catalog.js';
import { queryXuntianStars } from './xuntian-catalog.js';
import { placeSkyLabels, sphereHidesDirection } from './star-chart-math.js';

const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => {
  const length = Math.hypot(...v);
  return v.map((value) => value / length);
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
let textCanvas = null;
const widths = new Map();
export const SKY_CONSTELLATION_LINES = chart.constellations
  .flatMap((c) => c.lines)
  .map((path) => path.map((p) => equatorial(...p)));
export const SKY_CONSTELLATION_BOUNDARIES = chart.boundaries.map((path) =>
  path.map((p) => equatorial(...p))
);
const constellationNames = chart.constellations.flatMap((c) =>
  (c.labelPositions || [[c.ra, c.dec]]).map(([ra, dec], i) => ({
    key: 'const-' + c.id + '-' + i,
    kind: 'constellation',
    direction: equatorial(ra, dec),
    names: c,
  }))
);

export function skyAnnotationTextWidth(text, font = 13) {
  const key = font + '|' + text;
  if (widths.has(key)) return widths.get(key);
  if (!textCanvas && typeof document !== 'undefined') {
    textCanvas = document.createElement('canvas').getContext('2d');
    textCanvas.font = '500 24px sans-serif';
  }
  const width = textCanvas
    ? (textCanvas.measureText(text).width * font) / 24
    : [...text].reduce((sum, c) => sum + (/[\u3000-\uffff]/.test(c) ? font : font * 0.58), 0);
  widths.set(key, width);
  return width;
}

/** Main sky, preview and capture use one catalogue, projection and policy.
 * Master display switches belong to each surface; category/density preferences
 * are global. Density 1 deliberately permits overlap and has no count or
 * magnitude cut. It still respects the view cone and solid-body occlusion. */
export function buildSkyAnnotationLayout({
  settings,
  axes,
  eyeKm,
  q,
  fovY,
  width,
  height,
  language = 'zh',
  blocked = () => false,
  showMoon = true,
}) {
  if (!q || !axes || !(width > 0 && height > 0 && fovY > 0 && fovY < 180))
    return { labels: [], candidates: 0, total: 0, unfiltered: false, stats: { scanned: 0 } };
  const density = clamp(settings.starLabelDensity ?? 0.95, 0, 1),
    unfiltered = density >= 1,
    aspect = width / height;
  const tangent = Math.tan((fovY * DEG) / 2),
    earth = eyeKm.map((value) => -value),
    candidates = [];
  const bodies = solarApparent(q, eyeKm).filter(
    (body) => !body.behindEarth && (showMoon || body.id !== 'Moon')
  );
  const starsLimit = 2.5 + density * 3 + Math.max(0, Math.log2(40 / fovY)) * 1.35;
  function add(item) {
    const dir = item.direction,
      z = dot(dir, axes.forward);
    if (z <= 0) return;
    const x = dot(dir, axes.right) / (z * tangent * aspect),
      y = dot(dir, axes.up) / (z * tangent);
    if (Math.abs(x) > 1 || Math.abs(y) > 1 || sphereHidesDirection(dir, earth, 6371)) return;
    if (
      item.kind !== 'solar' &&
      bodies.some((body) => dot(body.direction, dir) > Math.cos(body.radiusRad))
    )
      return;
    if (blocked(dir)) return;
    const font = item.kind === 'constellation' ? 14 : 13,
      symbol = item.kind === 'deep' ? deepSkySymbol(item.object, { fovY, height }) : null;
    candidates.push({
      ...item,
      symbol,
      font,
      anchorRadius: symbol ? symbol.width / 2 : 0,
      centered: item.kind === 'constellation',
      x: ((x + 1) * width) / 2,
      y: ((1 - y) * height) / 2,
      w: skyAnnotationTextWidth(item.text, font) + 4,
      h: font + 7,
    });
  }
  const radius = Math.atan(tangent * Math.hypot(1, aspect)) / DEG;
  const stars =
    settings.starLabels || settings.catalogStarLabels
      ? queryXuntianStars(axes.forward, radius, {
          maxMagnitude: unfiltered ? Infinity : starsLimit,
        })
      : [];
  for (const star of stars) {
    const named = star.hip && starChartHasName(star.hip);
    if (named ? !settings.starLabels : !settings.catalogStarLabels) continue;
    const text = star.hip
      ? starChartName(star.hip, language)
      : 'Tycho-2 · ' + star.ra.toFixed(4) + '° / ' + star.dec.toFixed(4) + '°';
    add({
      ...star,
      key: star.hip ? 'star-' + star.hip : star.id,
      kind: 'star',
      text,
      priority: star.mag,
    });
  }
  if (settings.solarSystemLabels)
    for (const body of bodies) {
      if (
        bodies.some(
          (other) =>
            other.distanceKm < body.distanceKm &&
            dot(other.direction, body.direction) > Math.cos(other.radiusRad)
        )
      )
        continue;
      let direction = body.direction;
      if (body.id === 'Sun' || body.id === 'Moon') {
        const tangentRight = unit(
          axes.right.map((value, i) => value - direction[i] * dot(axes.right, direction))
        );
        direction = unit(
          direction.map(
            (value, i) =>
              value + tangentRight[i] * Math.tan(body.radiusRad + (tangent * 4) / height)
          )
        );
      }
      add({
        key: 'solar-' + body.id,
        kind: 'solar',
        direction,
        text: solarLabel(body.id, language),
        priority: Math.min(-2, body.mag),
      });
    }
  if (settings.constellationNames)
    for (const item of constellationNames)
      add({ ...item, text: item.names[language] || item.names.en || item.names.zh, priority: 1.7 });
  if (settings.deepSkyObjects)
    for (const object of DEEP_SKY_OBJECTS) {
      if (deepSkyInScope(object, settings.deepSkyScope))
        add({
          key: 'deep-' + object.id,
          kind: 'deep',
          direction: object.direction,
          object,
          text: deepSkyLabel(object, language),
          priority: 2.4,
        });
    }
  candidates.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
  const markers = unfiltered
    ? []
    : candidates
        .filter((item) => item.symbol)
        .map((item) => ({
          x: item.x - item.symbol.width / 2,
          y: item.y - item.symbol.height / 2,
          w: item.symbol.width,
          h: item.symbol.height,
        }));
  const labels = placeSkyLabels(candidates, width, height, density, markers, {
    all: unfiltered,
    areaBudget: true,
  });
  return {
    labels,
    candidates: candidates.length,
    total: labels.length,
    unfiltered,
    stats: { scanned: stars.length, deepSky: labels.filter((item) => item.kind === 'deep').length },
  };
}
