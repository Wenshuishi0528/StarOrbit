import chart from '../assets/star-chart.json';
import { equatorial } from './environment-math.js';
import { solarApparent } from './solar-system.js';
import { solarLabel } from './solar-targets.js';
import { DEEP_SKY_OBJECTS, deepSkyRegionLabel, deepSkyRegionMatch } from './deep-sky-catalog.js';
import { deepSkyInScope, deepSkyLabel, deepSkySymbol } from './star-chart-symbols.js';
import { starChartName, starChartHasName } from './star-label-catalog.js';
import { getXuntianTarget, queryXuntianStars } from './xuntian-catalog.js';
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
    targetId: 'constellation:' + c.id,
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
  focusTargetId = null,
  verticalInset = 0,
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
    const font = item.kind === 'constellation' ? 14 : 13;
    const text =
      item.regionOnly && skyAnnotationTextWidth(item.text, font) + 4 > width - 10
        ? deepSkyRegionLabel(item.object.id, language)
        : item.text;
    // The outline is already a capped locator. Leave one text row above and
    // below it in compact windows instead of letting it consume every slot.
    const gap = 4 + (1 - density) * 9;
    const symbol =
      item.kind === 'deep' && !item.regionOnly
        ? deepSkySymbol(item.object, {
            fovY,
            height,
            maxSize: Math.min(
              120,
              Math.max(8, height - 2 * (font + 7 + gap + Math.max(5, verticalInset) + 3))
            ),
          })
        : null;
    candidates.push({
      ...item,
      text,
      symbol,
      font,
      anchorRadius: symbol ? symbol.width / 2 : 0,
      centered: item.kind === 'constellation',
      x: ((x + 1) * width) / 2,
      y: ((1 - y) * height) / 2,
      w: skyAnnotationTextWidth(text, font) + 4,
      h: font + 7,
    });
    return true;
  }
  const radius = Math.atan(tangent * Math.hypot(1, aspect)) / DEG;
  const stars =
    settings.starLabels || settings.catalogStarLabels
      ? queryXuntianStars(axes.forward, radius, {
          maxMagnitude: unfiltered ? Infinity : starsLimit,
        })
      : [];
  // Density controls background clutter, not the star explicitly selected by
  // search. It still goes through the same category and solid-body filters.
  if (
    (settings.starLabels || settings.catalogStarLabels) &&
    /^(hip|tycho):/.test(focusTargetId || '') &&
    !stars.some((star) => star.id === focusTargetId)
  ) {
    const target = getXuntianTarget(focusTargetId, language);
    if (target?.type === 'star')
      stars.push({
        ...target,
        hip: Number(/^hip:(\d+)$/.exec(target.id)?.[1]) || null,
        mag: Infinity,
      });
  }
  for (const star of stars) {
    const named = star.hip && starChartHasName(star.hip);
    if (named ? !settings.starLabels : !settings.catalogStarLabels) continue;
    const text = star.hip
      ? starChartName(star.hip, language)
      : 'Tycho-2 · ' + star.ra.toFixed(4) + '° / ' + star.dec.toFixed(4) + '°';
    add({
      ...star,
      key: star.hip ? 'star-' + star.hip : star.id,
      targetId: star.id,
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
        targetId: 'solar:' + body.id,
        kind: 'solar',
        direction,
        text: solarLabel(body.id, language),
        priority: Math.min(-2, body.mag),
      });
    }
  if (settings.constellationNames)
    for (const item of constellationNames)
      add({ ...item, text: item.names[language] || item.names.en || item.names.zh, priority: 1.7 });
  if (settings.deepSkyObjects) {
    const regions = [];
    for (const object of DEEP_SKY_OBJECTS) {
      if (deepSkyInScope(object, settings.deepSkyScope)) {
        const shown = add({
          key: 'deep-' + object.id,
          targetId: 'deep-sky:' + object.id.toLowerCase(),
          kind: 'deep',
          direction: object.direction,
          object,
          text: deepSkyLabel(object, language),
          priority: 2.4,
        });
        if (!shown && deepSkyRegionMatch(object, axes.forward)?.withinRegion) regions.push(object);
      }
    }
    // A resolved, extended object does not stop existing when its catalogue
    // center leaves the frame. Label the region at the actual visible ray,
    // with no fabricated center marker. One most-specific context is enough.
    regions.sort(
      (a, b) =>
        Number('deep-sky:' + b.id.toLowerCase() === focusTargetId) -
          Number('deep-sky:' + a.id.toLowerCase() === focusTargetId) ||
        a.regionRadiusRad - b.regionRadiusRad
    );
    if (regions[0]) {
      const object = regions[0];
      add({
        key: 'deep-region-' + object.id,
        targetId: 'deep-sky:' + object.id.toLowerCase(),
        kind: 'deep',
        regionOnly: true,
        direction: axes.forward,
        object,
        text: deepSkyRegionLabel(object, language),
        priority: 2.3,
      });
    }
  }
  const centerDistance = (item) => Math.hypot(item.x - width / 2, item.y - height / 2);
  const selected = candidates.filter((item) => item.targetId === focusTargetId);
  const central = selected.length
    ? selected
    : candidates.filter(
        (item) =>
          item.kind !== 'constellation' &&
          centerDistance(item) <= Math.min(24, Math.min(width, height) * 0.1)
      );
  const focus = central.reduce(
    (best, item) => (!best || centerDistance(item) < centerDistance(best) ? item : best),
    null
  );
  candidates.sort(
    (a, b) =>
      Number(b === focus) - Number(a === focus) ||
      a.priority - b.priority ||
      a.key.localeCompare(b.key)
  );
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
    verticalInset,
  });
  return {
    labels,
    candidates: candidates.length,
    total: labels.length,
    unfiltered,
    stats: { scanned: stars.length, deepSky: labels.filter((item) => item.kind === 'deep').length },
  };
}
