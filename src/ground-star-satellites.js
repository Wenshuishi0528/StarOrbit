// Ground telescope overlays read the mission's selected local ephemeris. Opening
// the view never selects another record or starts a satellite catalogue download.
import { MISSIONS } from './missions.js';
import { estimateSatelliteMagnitude } from './satellite-photometry.js';
import {
  satelliteMetadata,
  matchesSatelliteFilters,
  satelliteFacets,
} from './satellite-catalog.js';
export { groundSatelliteGroup } from './satellite-catalog.js';
import { observerOrbit, orbitSelection, sameSelection } from './observer-settings.js';
import { interpolate, stateAt, dot, sub, sunlightFraction, validTime } from './orbit.js';
import { DFH1_HISTORY, orbitSegment } from './dfh1-history.js';
import { groundCelestialFrame } from './ground-world-sky.js';
import { skyAngles, projectSky } from './balcony-sky-view-math.js';
import { observationState } from './balcony-lab-geometry.js';
import { cameraAxes } from './xuntian-pointing.js';
import { placeSkyLabels } from './star-chart-math.js';
import { skyAnnotationTextWidth } from './sky-annotation-layout.js';
import { t } from './i18n.js';

export const GROUND_SATELLITE_LEVELS = Object.freeze({
  compact: { markers: 8, labels: 4, mixedMarkers: 2, mixedLabels: 1 },
  standard: { markers: 24, labels: 12, mixedMarkers: 6, mixedLabels: 3 },
  detailed: { markers: 64, labels: 32, mixedMarkers: 16, mixedLabels: 8 },
});
export const DEFAULT_SATELLITE_ELEVATION = 10;
const DISCOVER_PER_FRAME = 16;
const MAX_LOCAL_READS = 4;
const MAX_TERRAIN_READS = 8;
const STATION_CATEGORIES = new Set([
  '空间站',
  'space station',
  'station spatiale',
  'космическая станция',
]);
const ESTIMATE_LIMIT = 14 * 86400000;
// Dates covered by the reported passes used to reconstruct Dong Fang Hong 1.
const HISTORY_START = Date.parse('1970-04-25T00:00:00+08:00');
const HISTORY_END = Date.parse('1970-05-03T00:00:00+08:00');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => {
  const v = clamp(x, 0, 1);
  return v * v * (3 - 2 * v);
};

const GROUPS = ['regular', 'internet'];
const groupsFor = (scope) => (scope === 'all' ? GROUPS : [scope]);
const FACET_KEYS = ['objectType', 'purpose', 'owner', 'decade'];
function markerSlots(limit, regularCount, internetCount) {
  const reservedInternet = Math.min(limit.mixedMarkers, internetCount);
  const regular = Math.min(regularCount, limit.markers - reservedInternet);
  return { regular, internet: Math.min(internetCount, limit.markers - regular) };
}

export function groundSatelliteSourceMode(data, time) {
  if (!(data?.rows?.length >= 8)) return 'missing';
  if (!validTime(time)) return 'outOfRange';
  const first = data.rows[0][0],
    last = data.rows.at(-1)[0];
  if (time >= first && time <= last) return 'catalog';
  if (orbitSegment(data, time) === 'historical' && time >= HISTORY_START && time < HISTORY_END)
    return 'historical';
  return Math.min(Math.abs(time - first), Math.abs(time - last)) <= ESTIMATE_LIMIT
    ? 'estimated'
    : 'outOfRange';
}

function sourceState(entry, time) {
  if (entry.last?.time === time) return entry.last;
  let mode = groundSatelliteSourceMode(entry.data, time),
    position;
  if (mode === 'catalog') {
    // An explicitly imported historical ephemeris takes precedence over the reconstruction.
    position = interpolate(entry.data.rows, time)?.position;
  } else if (mode === 'estimated' || mode === 'historical') {
    // For extrapolation choose the endpoint's sampled branch, even if a custom
    // DFH-1 record predates 2000. The historical fit is confined to the week above.
    const segmentTime = mode === 'estimated' ? Math.max(time, DFH1_HISTORY.cutoff) : time;
    position = stateAt(entry.data, time, segmentTime)?.position;
  }
  if (position && !position.every(Number.isFinite)) position = null;
  if (!position && mode !== 'missing') mode = 'outOfRange';
  return (entry.last = { time, mode, position });
}

// Rectangular exclusion strips let the existing collision layout place names
// inside a round eyepiece, including names on the inner side of a rim target.
export function groundEyepieceMargins(width, height, radius) {
  if (!(radius > 0)) return [];
  const cx = width / 2,
    cy = height / 2,
    top = Math.max(0, cy - radius),
    bottom = Math.min(height, cy + radius);
  const rects = [];
  if (top > 0) rects.push({ x: 0, y: 0, w: width, h: top });
  if (bottom < height) rects.push({ x: 0, y: bottom, w: width, h: height - bottom });
  for (let i = 0; i < 24; i++) {
    const y = top + ((bottom - top) * i) / 24,
      h = (bottom - top) / 24,
      dy = Math.max(Math.abs(y - cy), Math.abs(y + h - cy)),
      halfChord = Math.sqrt(Math.max(0, radius * radius - dy * dy)),
      margin = cx - halfChord;
    if (margin > 0) {
      rects.push({ x: 0, y, w: margin, h });
      rects.push({ x: width - margin, y, w: margin, h });
    }
  }
  return rects;
}

function labelLines(row, level) {
  const name = t(row.name);
  const quality = row.mode === 'catalog' ? '' : t('估算');
  if (level === 'compact') return [[name, quality].filter(Boolean).join(' · ')];
  const source = row.mode === 'historical' ? t('历史轨道 · 报载时刻重建') : quality;
  const condition = [t(row.status), level === 'detailed' ? t(row.shadow) : '', source];
  const lines = [name, condition.filter(Boolean).join(' · ')];
  if (level === 'detailed') {
    const values = [
      t('仰角') + ' ' + row.elevation.toFixed(1) + '°',
      Math.round(row.range) + ' km',
    ];
    if (Number.isFinite(row.magnitude))
      values.push(t('估算视星等 {mag}', { mag: row.magnitude.toFixed(1) }));
    lines.push(values.join(' · '));
  }
  return lines;
}

function counters() {
  return {
    total: 0,
    regularTotal: 0,
    internetTotal: 0,
    regularVisible: 0,
    internetVisible: 0,
    regularLabels: 0,
    internetLabels: 0,
    checked: 0,
    available: 0,
    estimated: 0,
    historical: 0,
    outOfRange: 0,
    missing: 0,
    loading: 0,
    aboveMinimum: 0,
    terrainReads: 0,
    visible: 0,
    labels: 0,
  };
}

// Terrain is a depth-buffer lookup. Reuse a result only at the same site and
// lens with subpixel motion along this world ray. Refresh for streamed terrain
// even when paused. A simulation-clock jump invalidates every such result.
function terrainSampleValid(hit, row, site, time, now, focal) {
  if (
    !hit ||
    now - hit.at > 180 ||
    Math.abs(time - hit.time) > 500 ||
    hit.focal !== focal ||
    hit.latitude !== site.latitude ||
    hit.longitude !== site.longitude ||
    hit.height !== site.height
  )
    return false;
  const delta = row.direction.reduce((sum, v, i) => sum + (v - hit.direction[i]) ** 2, 0);
  return delta * focal * focal < 0.5;
}

export function createGroundSatelliteOverlay(sim, missions = MISSIONS) {
  const entries = new Map();
  let inventory = new Map(),
    facets = satelliteFacets([]),
    internetTotal = 0;
  let pools = { regular: [], internet: [] };
  const cursors = { regular: 0, internet: 0 };
  const classifications = new WeakMap();
  let lastInventory = -Infinity,
    lastFilterKey = null,
    reads = 0,
    tracked = { regular: [], internet: [] };

  function metadataFor(id, data) {
    const mission = missions[id];
    const orbit =
      data ?? (id === sim.missionId ? sim.data : entries.get(id)?.data) ?? sim.bundledOrbits?.[id];
    const previous = classifications.get(mission);
    if (
      previous &&
      previous.orbit === orbit &&
      previous.explicit === mission.satelliteGroup &&
      previous.catalog === mission.satelliteCatalog &&
      previous.name === mission.name &&
      previous.category === mission.category
    )
      return previous.meta;
    let meta = satelliteMetadata(mission, orbit);
    if (
      previous &&
      ['group', 'launchYear', ...FACET_KEYS].every((k) => previous.meta[k] === meta[k])
    )
      meta = previous.meta;
    classifications.set(mission, {
      orbit,
      meta,
      explicit: mission.satelliteGroup,
      catalog: mission.satelliteCatalog,
      name: mission.name,
      category: mission.category,
    });
    return meta;
  }

  function refreshCatalog(now, filters) {
    if (now - lastInventory >= 1000) {
      const next = new Map();
      let changed = false;
      for (const id of Object.keys(missions))
        if (missions[id].center === 'EARTH') {
          const meta = metadataFor(id);
          next.set(id, meta);
          if (inventory.get(id) !== meta) changed = true;
        }
      if (changed || next.size !== inventory.size) {
        inventory = next;
        const metadata = [...inventory.values()];
        facets = satelliteFacets(metadata);
        internetTotal = metadata.filter((meta) => meta.group === 'internet').length;
        lastFilterKey = null;
      }
      for (const id of entries.keys()) if (!missions[id]) entries.delete(id);
      lastInventory = now;
    }
    const filterKey = JSON.stringify(FACET_KEYS.map((k) => filters?.[k] || null));
    if (filterKey !== lastFilterKey) {
      pools = { regular: [], internet: [] };
      for (const [id, meta] of inventory)
        if (matchesSatelliteFilters(meta, filters)) pools[meta.group].push(id);
      for (const group of GROUPS)
        cursors[group] = pools[group].length ? cursors[group] % pools[group].length : 0;
      lastFilterKey = filterKey;
    }
  }
  let lastSite,
    rim,
    disposed = false;
  const status = counters();

  function selectedEntry(id) {
    const selection = orbitSelection(sim, id);
    const bundled = sim.bundledOrbits?.[id];
    const cached = entries.get(id);
    if (cached && cached.bundled === bundled && sameSelection(cached.selection, selection))
      return cached;

    const entry = { selection, bundled, data: null, pending: false };
    if (selection.recordId === 'none' || id === sim.missionId) {
      entry.data = selection.recordId === 'none' ? null : sim.data;
    } else if (selection.recordId == null && bundled) {
      entry.data = bundled;
    } else {
      if (reads >= MAX_LOCAL_READS) return { pending: true };
      entry.pending = true;
      reads++;
      (async () => {
        try {
          await sim.environment?.weather?.ready;
          const data = await observerOrbit(sim, id);
          if (
            !disposed &&
            entries.get(id) === entry &&
            sameSelection(selection, orbitSelection(sim, id))
          ) {
            entry.data = data;
            if (missions[id] && metadataFor(id, data) !== inventory.get(id))
              lastInventory = -Infinity;
          }
        } catch {
          // A missing or unreadable selection has no marker. A new selection retries.
        } finally {
          entry.pending = false;
          reads--;
        }
      })();
    }
    entries.set(id, entry);
    return entry;
  }

  function sample({
    time,
    site,
    camera,
    width,
    height,
    minElevation = DEFAULT_SATELLITE_ELEVATION,
    labelLevel = 'standard',
    satelliteScope = 'all',
    filters = {},
    circleRadius = 0,
    frame,
    blocked,
    reserved = [],
  }) {
    Object.assign(status, counters());
    if (disposed || !site || !camera || !(width > 0 && height > 0) || !validTime(time)) return [];
    if (!Object.hasOwn(GROUND_SATELLITE_LEVELS, labelLevel)) labelLevel = 'standard';
    const limit = GROUND_SATELLITE_LEVELS[labelLevel];
    const minimum = Number.isFinite(minElevation)
      ? clamp(minElevation, 0, 85)
      : DEFAULT_SATELLITE_ELEVATION;

    if (satelliteScope !== 'regular' && satelliteScope !== 'internet') satelliteScope = 'all';
    const enabled = groupsFor(satelliteScope);
    const mixed = satelliteScope === 'all';
    const now = performance.now();
    filters ||= {};
    refreshCatalog(now, filters);
    status.regularTotal = inventory.size - internetTotal;
    status.internetTotal = internetTotal;
    status.total = enabled.reduce((n, g) => n + pools[g].length, 0);
    const batch = new Set();
    const eligible = (meta) =>
      meta && enabled.includes(meta.group) && matchesSatelliteFilters(meta, filters);
    if (eligible(inventory.get(sim.missionId))) batch.add(sim.missionId);
    // Separate cursors: ordinary spacecraft cannot be buried behind thousands
    // of names from one constellation, irrespective of catalogue ordering.
    const regularDiscovery = Math.min(
      pools.regular.length,
      DISCOVER_PER_FRAME - Math.min(4, pools.internet.length)
    );
    const kept = markerSlots(
      limit,
      enabled.includes('regular') ? tracked.regular.length : 0,
      enabled.includes('internet') ? tracked.internet.length : 0
    );
    for (const group of enabled) {
      for (const id of tracked[group].slice(0, kept[group]))
        if (eligible(inventory.get(id))) batch.add(id);
      const ids = pools[group];
      const discovery = mixed
        ? group === 'regular'
          ? regularDiscovery
          : DISCOVER_PER_FRAME - regularDiscovery
        : DISCOVER_PER_FRAME;
      for (let i = 0; i < Math.min(ids.length, discovery); i++) {
        batch.add(ids[cursors[group]]);
        cursors[group] = (cursors[group] + 1) % ids.length;
      }
    }

    const view = {
      ...cameraAxes(camera.quaternion),
      mode: 'perspective',
      width,
      height,
      focal: (camera.zoom * height) / (2 * Math.tan((camera.fov * Math.PI) / 360)),
    };
    let sky = frame?.q?.t === time ? frame : null;
    let sunElevation;
    const candidates = { regular: [], internet: [] };
    for (const id of batch) {
      const mission = missions[id];
      if (mission?.center !== 'EARTH' || !eligible(inventory.get(id))) continue;
      status.checked++;
      const entry = selectedEntry(id);
      if (entry.pending) {
        status.loading++;
        continue;
      }
      const meta = metadataFor(id, entry.data);
      if (meta !== inventory.get(id)) lastInventory = -Infinity;
      if (!eligible(meta)) continue;
      const group = meta.group;
      const { mode, position } = sourceState(entry, time);
      if (!position) {
        status[mode]++;
        continue;
      }
      status.available++;
      if (mode !== 'catalog') status[mode]++;
      if (!sky) {
        if (
          lastSite?.frame.q.t !== time ||
          lastSite.latitude !== site.latitude ||
          lastSite.longitude !== site.longitude ||
          lastSite.height !== site.height
        )
          lastSite = {
            latitude: site.latitude,
            longitude: site.longitude,
            height: site.height,
            frame: groundCelestialFrame(site, time),
          };
        sky = lastSite.frame;
      }
      const ray = sub(position, sky.eye),
        range = Math.hypot(...ray);
      if (!(range > 0)) continue;
      const direction = sky.basis.map((axis) => dot(axis, ray) / range);
      const { azimuth, elevation } = skyAngles(direction);
      if (elevation <= minimum) continue;
      status.aboveMinimum++;
      const point = projectSky(direction, view);
      if (!point) continue;
      const { x, y } = point;
      const offCentre = Math.hypot(x - width / 2, y - height / 2);
      const edge = Math.min(
        x,
        y,
        width - x,
        height - y,
        circleRadius > 0 ? circleRadius - offCentre : Infinity
      );
      const alpha = smooth((elevation - minimum) / 3) * smooth(edge / 20);
      if (alpha <= 0) continue;
      if (sunElevation === undefined) {
        const toSun = sub(sky.q.sun, sky.eye);
        sunElevation = skyAngles(sky.basis.map((axis) => dot(axis, toSun))).elevation;
      }
      const illumination = sunlightFraction(position, sky.q.sun);
      const light = observationState({ azimuth, elevation, sunElevation, illumination }, []);
      const magnitude = estimateSatelliteMagnitude(
        mission.satellitePhotometry,
        sky.eye,
        position,
        sky.q.sun,
        illumination
      );
      candidates[group].push({
        id,
        group,
        name: mission.name,
        mode,
        ...light,
        status: light.candidate ? '当地天色已暗' : light.status,
        illumination,
        magnitude,
        photometrySource: Number.isFinite(magnitude) ? mission.satellitePhotometry.source : null,
        sunElevation,
        azimuth,
        elevation,
        range,
        direction,
        x,
        y,
        alpha,
        offCentre,
        priority:
          id === sim.missionId
            ? 2
            : STATION_CATEGORIES.has(mission.category?.toLowerCase())
              ? 1
              : 0,
      });
    }

    const selected = { regular: [], internet: [] },
      deferred = { regular: [], internet: [] };
    // Protect both terrain-check budgets when crowded. After masking, either
    // group can borrow display slots the other cannot fill in this field.
    for (const group of enabled) {
      const groupCandidates = candidates[group];
      groupCandidates.sort(
        (a, b) =>
          b.priority - a.priority ||
          b.candidate - a.candidate ||
          a.offCentre - b.offCentre ||
          a.id.localeCompare(b.id)
      );
      const cap = limit.markers;
      const terrainLimit =
        mixed && group === 'regular'
          ? MAX_TERRAIN_READS - Math.min(2, candidates.internet.length)
          : MAX_TERRAIN_READS;
      for (const row of groupCandidates) {
        if (selected[group].length >= cap) break;
        if (blocked) {
          const entry = entries.get(row.id);
          if (
            entry.terrain?.query !== blocked ||
            entry.terrain?.revision !== blocked.revision ||
            !terrainSampleValid(entry.terrain, row, site, time, now, view.focal)
          ) {
            if (status.terrainReads >= terrainLimit) {
              deferred[group].push(row.id);
              continue;
            }
            const hidden = blocked((2 * row.x) / width - 1, 1 - (2 * row.y) / height);
            status.terrainReads++;
            if (hidden === null) continue;
            entry.terrain = {
              hidden,
              query: blocked,
              revision: blocked.revision,
              direction: row.direction,
              latitude: site.latitude,
              longitude: site.longitude,
              height: site.height,
              time,
              at: now,
              focal: view.focal,
            };
          }
          if (entry.terrain.hidden) continue;
        }
        selected[group].push(row);
      }
    }
    const slots = markerSlots(limit, selected.regular.length, selected.internet.length);
    selected.regular.length = slots.regular;
    selected.internet.length = slots.internet;
    const rows = selected.regular.concat(selected.internet);
    status.regularVisible = selected.regular.length;
    status.internetVisible = selected.internet.length;
    // Keep the selected rows plus at most one frame's worth of deferred terrain
    // checks. Both pools together obey the original per-stage propagation bound.
    let spare = limit.markers - rows.length;
    for (const group of GROUPS) {
      const retry = deferred[group].slice(0, spare);
      tracked[group] = selected[group].map((row) => row.id).concat(retry);
      spare -= retry.length;
    }
    status.visible = rows.length;
    if (!rows.length) return rows;
    if (!rim || rim.width !== width || rim.height !== height || rim.radius !== circleRadius)
      rim = {
        width,
        height,
        radius: circleRadius,
        rects: groundEyepieceMargins(width, height, circleRadius),
      };
    for (const row of rows) {
      row.lines = labelLines(row, labelLevel);
      row.w = Math.min(
        width - 12,
        // Astronomical readings change continuously. Reuse a tabular width for
        // equal-length digits to keep the shared text measurement cache bounded.
        Math.max(
          ...row.lines.map((s, i) =>
            skyAnnotationTextWidth(i === 2 ? s.replace(/\d/g, '8') : s, i ? 11 : 13)
          )
        ) + 8
      );
      row.h = 7 + 15 * row.lines.length;
      row.anchorRadius = 6;
    }
    const occupied = [...rim.rects, ...reserved];
    // Give ordinary labels first choice of collision-free space, and reserve a
    // bounded share of names for any internet spacecraft visible in a mixed field.
    const internetNames = mixed ? Math.min(limit.mixedLabels, selected.internet.length) : 0;
    const allocateLabels = (items, budget) => {
      if (!items.length || !budget) return;
      const labels = placeSkyLabels(items, width, height, 0.55, occupied).slice(0, budget);
      for (const label of labels) {
        rows.find((row) => row.id === label.id).rect = label.rect;
        occupied.push(label.rect);
        status.labels++;
        if (label.group === 'internet') status.internetLabels++;
        else status.regularLabels++;
      }
    };
    allocateLabels(selected.regular, limit.labels - internetNames);
    allocateLabels(selected.internet, mixed ? internetNames : limit.labels);
    if (mixed)
      for (const group of GROUPS) {
        if (status.labels >= limit.labels) break;
        allocateLabels(
          selected[group].filter((row) => !row.rect),
          limit.labels - status.labels
        );
      }
    return rows;
  }

  return {
    sample,
    status,
    get facets() {
      return facets;
    },
    dispose() {
      disposed = true;
      entries.clear();
      inventory.clear();
      facets = satelliteFacets([]);
      tracked = { regular: [], internet: [] };
      pools = { regular: [], internet: [] };
      lastSite = rim = null;
    },
  };
}

export function paintGroundSatellites(ctx, rows) {
  if (!ctx || !rows?.length) return;
  ctx.save();
  const baseAlpha = ctx.globalAlpha;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const row of rows) {
    ctx.globalAlpha = baseAlpha * row.alpha;
    const colour = row.candidate ? '#8ef5db' : '#b2c7d9';
    const { x, y, rect } = row;
    ctx.beginPath();
    if (row.group === 'internet') ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
    else {
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 5);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
    }
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#10202b';
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colour;
    ctx.stroke();
    if (!rect) continue;
    ctx.fillStyle = 'rgba(8, 19, 30, 0.78)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    row.lines.forEach((line, i) => {
      ctx.fillStyle = i ? '#c6d7e1' : colour;
      ctx.font = i ? '11px sans-serif' : '500 13px sans-serif';
      ctx.fillText(line, rect.x + 4, rect.y + 11 + 15 * i, rect.w - 8);
    });
  }
  ctx.restore();
}
