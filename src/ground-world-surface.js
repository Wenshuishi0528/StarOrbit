import * as THREE from 'three';
import { ELEVATION_SOURCE } from './earth-elevation-source.js';
import { elevationTile, sampleElevationBase, sampleElevationMesh } from './earth-elevation-math.js';
import { geodeticToECEF, enuFrame, localFromECEF } from './ground-world-math.js';

const DEG = Math.PI / 180;
const wrap = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Sample measured DEM heights, never the radial/chord height of a display mesh.
// The same diagonal as the elevation source meshes is used for stable contact.
export function sampleGroundGrid(grid, latitude, longitude) {
  if (!grid?.heights || !Number.isFinite(latitude + longitude)) return null;
  const [w, s, e, n] = grid.bounds;
  longitude += 360 * Math.round(((w + e) / 2 - longitude) / 360);
  if (latitude < s || latitude > n || longitude < w || longitude > e) return null;
  const columns = grid.columns ?? grid.gridSize - 1;
  const rows = grid.rows ?? grid.gridSize - 1;
  const px = clamp(((longitude - w) / (e - w)) * columns, 0, columns);
  const py = clamp(((n - latitude) / (n - s)) * rows, 0, rows);
  const x = Math.min(columns - 1, Math.floor(px)),
    y = Math.min(rows - 1, Math.floor(py));
  const fx = px - x,
    fy = py - y,
    nw = y * (columns + 1) + x,
    sw = nw + columns + 1;
  const ids = fx + fy <= 1 ? [nw, nw + 1, sw] : [nw + 1, sw, sw + 1];
  const weights = fx + fy <= 1 ? [1 - fx - fy, fx, fy] : [1 - fy, 1 - fx, fx + fy - 1];
  if (ids.some((id, i) => weights[i] > 1e-10 && !Number.isFinite(grid.heights[id]))) return null;
  return ids.reduce(
    (sum, id, i) => sum + (weights[i] > 1e-10 ? grid.heights[id] * weights[i] : 0),
    0
  );
}

export function groundTilePlan(
  site,
  { fine = true, rangeKm = 160, view = null, groundHeightMeters = 0 } = {}
) {
  if (Math.abs(site.latitude) > 80) return [];
  rangeKm = clamp(Number(rangeKm) || 160, 20, 400);
  const altitude = Math.max(0, (Number(site.height) || 0) - (Number(groundHeightMeters) || 0));
  const nearRadius = Math.min(20, Math.max(8, (altitude / 1000) * 2));
  const middleRadius = Math.min(rangeKm, Math.min(64, Math.max(32, (altitude / 1000) * 5)));
  // Measured-height requests are independent of the twelve globe display
  // patches. Near, middle and horizon rings can therefore share a modest
  // amount of DEM data without allocating a full-resolution global mesh.
  const outerLevel = rangeKm > 220 ? 8 : 9;
  const rings = [
    ...(fine ? [[12, nearRadius, 96]] : []),
    [outerLevel, rangeKm, 140],
    [10, middleRadius, 96],
  ];
  const tiles = [],
    batches = [],
    keys = new Set();
  const lat = site.latitude * DEG,
    lon = site.longitude * DEG;
  const eye = view?.eyeKm;
  for (const [desiredLevel, radius, budget] of rings) {
    let ring;
    for (let z = desiredLevel; z >= 6; z--) {
      const rows = 2 ** z,
        step = 180 / rows;
      const cy = Math.min(rows - 1, Math.floor((90 - site.latitude) / step));
      const cx = Math.floor((wrap(site.longitude) + 180) / step);
      const dyMax = Math.ceil(radius / (111.2 * step)) + 1;
      const dxMax = Math.min(
        rows,
        Math.ceil(radius / (111.2 * step * Math.max(0.12, Math.cos(lat)))) + 2
      );
      ring = [];
      for (let dy = -dyMax; dy <= dyMax; dy++)
        for (let dx = -dxMax; dx <= dxMax; dx++) {
          if (cy + dy < 0 || cy + dy >= rows) continue;
          const tile = elevationTile(z, cx + dx, cy + dy);
          if (keys.has(tile.key)) continue;
          const [w, so, e, n] = tile.bounds,
            tlat = ((so + n) * DEG) / 2,
            tlon = ((w + e) * DEG) / 2;
          const normal = [
            Math.cos(tlat) * Math.cos(tlon),
            Math.cos(tlat) * Math.sin(tlon),
            Math.sin(tlat),
          ];
          const cosine =
            Math.sin(lat) * Math.sin(tlat) + Math.cos(lat) * Math.cos(tlat) * Math.cos(tlon - lon);
          const distance = Math.acos(clamp(cosine, -1, 1)) * 6371;
          const diagonal = (111.2 * step * Math.hypot(1, Math.cos(tlat))) / 2;
          if (distance > radius + diagonal) continue;
          // Always keep all azimuths covered, but fetch the visible half first.
          const relative = eye && normal.map((x, i) => x * 6371 - eye[i]);
          const facing =
            relative && view.forward
              ? relative.reduce((v, x, i) => v + x * view.forward[i], 0) /
                Math.max(0.001, Math.hypot(...relative))
              : 1;
          ring.push({ tile, score: distance * (facing < 0 ? 2 : 1) });
        }
      if (ring.length <= budget || z === 6) break;
    }
    ring.sort((a, b) => a.score - b.score);
    const batch = [];
    for (const { tile } of ring) {
      keys.add(tile.key);
      batch.push(tile);
    }
    batches.push(batch);
  }
  // Keep immediate contact first, then interleave near/middle/horizon requests.
  // A distant mountain should improve while detailed foot-level tiles arrive.
  if (fine) tiles.push(...batches[0].splice(0, 9));
  while (batches.some((batch) => batch.length))
    for (const batch of batches) tiles.push(...batch.splice(0, 2));
  return tiles;
}

export function groundDestination(site, east, north) {
  const distance = Math.hypot(east, north),
    bearing = Math.atan2(east, north);
  const a = distance / 6371008.8,
    lat = site.latitude * DEG,
    lon = site.longitude * DEG;
  const nextLat = Math.asin(
    clamp(Math.sin(lat) * Math.cos(a) + Math.cos(lat) * Math.sin(a) * Math.cos(bearing), -1, 1)
  );
  const nextLon =
    lon +
    Math.atan2(
      Math.sin(bearing) * Math.sin(a) * Math.cos(lat),
      Math.cos(a) - Math.sin(lat) * Math.sin(nextLat)
    );
  return { latitude: nextLat / DEG, longitude: wrap(nextLon / DEG) };
}

function* groundPatchChunks(
  site,
  sampleHeight,
  { segments = 128, halfSize = 2048, geoidUndulation = 0, sphereRadius = 0, spacingScale = 0 } = {}
) {
  const frame = enuFrame({ ...site, height: 0 }, geoidUndulation),
    stride = segments + 1;
  const point = (geo) => {
    if (!sphereRadius) return geodeticToECEF(geo, geoidUndulation);
    const lat = geo.latitude * DEG,
      lon = geo.longitude * DEG,
      r = sphereRadius + geo.height;
    return [
      r * Math.cos(lat) * Math.cos(lon),
      r * Math.cos(lat) * Math.sin(lon),
      r * Math.sin(lat),
    ];
  };
  if (sphereRadius) frame.origin = point({ ...site, height: 0 });
  const gridDistances = Float64Array.from({ length: stride }, (_, i) => {
    const t = (i / segments) * 2 - 1;
    return spacingScale > 0
      ? spacingScale * Math.sinh(t * Math.asinh(halfSize / spacingScale))
      : t * halfSize;
  });
  const positions = new Float32Array(stride * stride * 3),
    uv = new Float32Array(stride * stride * 2);
  for (let y = 0; y <= segments; y++) {
    for (let x = 0; x <= segments; x++) {
      const geo = groundDestination(site, gridDistances[x], gridDistances[y]);
      const height = sampleHeight(geo.latitude, geo.longitude, gridDistances[x], gridDistances[y]);
      const i = y * stride + x;
      if (sphereRadius) {
        const lat = geo.latitude * DEG,
          lon = geo.longitude * DEG;
        const r = sphereRadius + (Number.isFinite(height) ? height : 0);
        const dx = r * Math.cos(lat) * Math.cos(lon) - frame.origin[0];
        const dy = r * Math.cos(lat) * Math.sin(lon) - frame.origin[1];
        const dz = r * Math.sin(lat) - frame.origin[2];
        positions[i * 3] = dx * frame.east[0] + dy * frame.east[1] + dz * frame.east[2];
        positions[i * 3 + 1] = dx * frame.north[0] + dy * frame.north[1] + dz * frame.north[2];
        positions[i * 3 + 2] = dx * frame.up[0] + dy * frame.up[1] + dz * frame.up[2];
      } else {
        positions.set(
          localFromECEF(point({ ...geo, height: Number.isFinite(height) ? height : 0 }), frame),
          i * 3
        );
      }
      // Keep UV continuous across the date line; the shared texture repeats in longitude.
      const lon = geo.longitude + 360 * Math.round((site.longitude - geo.longitude) / 360);
      uv.set([(lon + 180) / 360, (geo.latitude + 90) / 180], i * 2);
    }
    if (y % 16 === 15) yield;
  }
  const indices = new Uint32Array(segments * segments * 6);
  let cursor = 0;
  for (let y = 0; y < segments; y++)
    for (let x = 0; x < segments; x++) {
      const a = y * stride + x,
        b = a + 1,
        c = a + stride,
        d = c + 1;
      indices[cursor++] = a;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = d;
      indices[cursor++] = c;
    }
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < uv.length; i += 2) {
    const lon = uv[i] * 360 - 180,
      lat = uv[i + 1] * 180 - 90;
    bounds[0] = Math.min(bounds[0], lon);
    bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lon);
    bounds[3] = Math.max(bounds[3], lat);
  }
  return {
    positions,
    uv,
    indices,
    frame,
    segments,
    halfSize,
    bounds,
    sphereRadius,
    gridDistances,
  };
}

// Sample the actual curved triangle surface of a regional patch. Its regular
// grid is azimuthal-equidistant around the anchor, rather than a lat/lon grid.
export function sampleGroundPatch(data, anchor, latitude, longitude) {
  if (!data || !anchor) return null;
  const lat = latitude * DEG,
    lat0 = anchor.latitude * DEG,
    dl = (longitude - anchor.longitude) * DEG;
  const cosine = clamp(
    Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(dl),
    -1,
    1
  );
  const distance = Math.acos(cosine) * 6371008.8;
  const bearing = Math.atan2(
    Math.sin(dl) * Math.cos(lat),
    Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(dl)
  );
  function gridIndex(value) {
    if (!data.gridDistances) return ((value / data.halfSize + 1) * data.segments) / 2;
    const grid = data.gridDistances;
    if (value < grid[0]) return -1;
    if (value > grid[data.segments]) return data.segments + 1;
    let low = 0,
      high = data.segments;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (grid[middle] <= value) low = middle;
      else high = middle;
    }
    return low + (value - grid[low]) / (grid[high] - grid[low]);
  }
  const px = gridIndex(distance * Math.sin(bearing));
  const py = gridIndex(distance * Math.cos(bearing));
  if (px < 0 || py < 0 || px > data.segments || py > data.segments) return null;
  const x = Math.min(data.segments - 1, Math.floor(px)),
    y = Math.min(data.segments - 1, Math.floor(py));
  const fx = px - x,
    fy = py - y,
    stride = data.segments + 1,
    a = y * stride + x;
  const ids = fx + fy <= 1 ? [a, a + 1, a + stride] : [a + 1, a + stride, a + stride + 1];
  const weights = fx + fy <= 1 ? [1 - fx - fy, fx, fy] : [1 - fy, 1 - fx, fx + fy - 1];
  let east = 0,
    north = 0,
    up = 0;
  for (let i = 0; i < 3; i++) {
    east += data.positions[ids[i] * 3] * weights[i];
    north += data.positions[ids[i] * 3 + 1] * weights[i];
    up += data.positions[ids[i] * 3 + 2] * weights[i];
  }
  const f = data.frame;
  return (
    Math.hypot(
      f.origin[0] + east * f.east[0] + north * f.north[0] + up * f.up[0],
      f.origin[1] + east * f.east[1] + north * f.north[1] + up * f.up[1],
      f.origin[2] + east * f.east[2] + north * f.north[2] + up * f.up[2]
    ) - data.sphereRadius
  );
}

export function buildGroundPatch(...args) {
  const chunks = groundPatchChunks(...args);
  let result;
  do {
    result = chunks.next();
  } while (!result.done);
  return result.value;
}

export async function buildGroundPatchAsync(site, sampleHeight, options, isCurrent = () => true) {
  const chunks = groundPatchChunks(site, sampleHeight, options);
  while (isCurrent()) {
    const result = chunks.next();
    if (result.done) return result.value;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  chunks.return();
  return null;
}

// Pixel-centred original ETOPO raster, not the coarse globe display mesh.
export function sampleGroundRaster(base, latitude, longitude) {
  const data = base?.rasterHeights,
    width = base?.rasterWidth,
    height = base?.rasterHeight;
  if (
    !data ||
    !width ||
    !height ||
    !Number.isFinite(latitude + longitude) ||
    Math.abs(latitude) > 90
  )
    return null;
  const px = ((wrap(longitude) + 180) / 360) * width - 0.5;
  const py = clamp(((90 - latitude) / 180) * height - 0.5, 0, height - 1);
  const x = Math.floor(px),
    y = Math.floor(py),
    fx = px - x,
    fy = py - y;
  const at = (xx, yy) => data[Math.min(height - 1, yy) * width + (((xx % width) + width) % width)];
  const values = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)];
  if (!values.every(Number.isFinite)) return null;
  return (
    (values[0] * (1 - fx) + values[1] * fx) * (1 - fy) +
    (values[2] * (1 - fx) + values[3] * fx) * fy
  );
}

// This service owns only a local contact mesh. SharedWorldEarth owns its rendering
// with the main Earth material, full globe and the same imagery/terrain managers.
export function createGroundSurface({
  environment,
  scene,
  geoidUndulation = 0,
  id = 'world-ground-contact',
  renderViewId = 'world-ground-earth',
}) {
  const elevation = environment.elevation,
    group = new THREE.Group();
  scene?.add(group);
  let site = null,
    patch = null,
    patchSite = null,
    revision = 0,
    lastRevision = -1,
    lastBuild = -Infinity,
    surround = null,
    surroundSite = null,
    surroundRevision = 0,
    surroundSourceKey = null,
    lastSurroundBuild = -Infinity,
    surroundBuild = null,
    buildGeneration = 0;
  let sortedEntries = [],
    cachedRevision = -1,
    disposed = false,
    planned = [],
    levels = [],
    grids = new Map(),
    measuredSampler = null,
    planKey = null;
  function entries() {
    if (cachedRevision !== elevation?.revision) {
      sortedEntries = [...(elevation?.entries?.values() || [])]
        .filter((entry) => entry.heights)
        .sort((a, b) => b.tile.z - a.tile.z);
      levels = [...new Set(sortedEntries.map((entry) => entry.tile.z))];
      grids = new Map(
        sortedEntries.map((entry) => [
          entry.tile.key,
          { ...entry.tile, heights: entry.heights, gridSize: 129 },
        ])
      );
      measuredSampler = makeMeasuredSampler(grids, levels, elevation?.base);
      cachedRevision = elevation?.revision;
    }
    return sortedEntries;
  }
  function makeMeasuredSampler(sourceGrids, sourceLevels, base) {
    return (lat, lon) => {
      for (const z of sourceLevels) {
        const rows = 2 ** z,
          step = 180 / rows;
        const x = Math.floor((wrap(lon) + 180) / step),
          y = Math.min(rows - 1, Math.floor((90 - lat) / step));
        const grid = sourceGrids.get(`${z}/${x}/${y}`);
        if (!grid) continue;
        const h = sampleGroundGrid(grid, lat, lon);
        if (h !== null) return h;
      }
      const original = sampleGroundRaster(base, lat, lon);
      if (original !== null) return original;
      return base?.nodeHeights
        ? sampleGroundGrid(
            {
              heights: base.nodeHeights,
              bounds: base.bounds,
              columns: base.columns,
              rows: base.rows,
            },
            lat,
            lon
          )
        : null;
    };
  }
  function measuredHeight(lat, lon) {
    entries();
    return measuredSampler?.(lat, lon) ?? null;
  }
  function displayHeight(lat, lon, records) {
    for (const record of records) {
      const surface = sampleElevationMesh(record.data, lon, lat);
      if (!surface) continue;
      const fade = elevation.fade?.(record) ?? 1;
      if (fade === 1) return surface.heightMeters;
      const from = sampleElevationMesh(
        { ...record.data, positions: record.data.basePositions },
        lon,
        lat
      );
      if (from)
        return (
          (Math.hypot(
            ...surface.position.map((v, i) => from.position[i] + (v - from.position[i]) * fade)
          ) -
            6371) *
          1000
        );
    }
    // The outer boundary meets the actual rendered globe, including its triangular chord sag.
    return elevation?.base?.positions
      ? (sampleElevationBase(elevation.base, lon, lat)?.heightMeters ?? 0)
      : (measuredHeight(lat, lon) ?? 0);
  }
  const displaced = (a, b) =>
    !a || !b
      ? Infinity
      : Math.hypot(
          ...localFromECEF(enuFrame({ ...a, height: 0 }).origin, enuFrame({ ...b, height: 0 }))
        );
  function update(next) {
    if (disposed) return;
    site = { ...next };
    const rangeKm = clamp(Number(environment.settings?.surfaceElevationRangeKm) || 160, 20, 400);
    const halfSize = rangeKm * 1000;
    // Mesh detail follows height above the local DEM, not sea-level altitude:
    // standing on a high plateau still requires the same foot-level detail.
    const groundHeightMeters = measuredHeight(site.latitude, site.longitude) ?? 0;
    const aboveGround = Math.max(0, site.height - groundHeightMeters);
    const contactHalfSize = clamp(aboveGround * 2, 4096, 16000);
    const view = elevation?.views?.get(renderViewId)?.view;
    const nextPlanKey = [
      Math.floor(site.latitude * 128),
      Math.floor(site.longitude * 128),
      Math.floor(aboveGround / 500),
      site.height < 200000,
      rangeKm,
      ...(view?.forward || []).map((v) => Math.round(v * 5)),
    ].join('|');
    if (nextPlanKey !== planKey) {
      planned =
        site.height < 200000
          ? groundTilePlan(site, { fine: aboveGround < 50000, rangeKm, view, groundHeightMeters })
          : [];
      planKey = nextPlanKey;
    }
    elevation?.setSamplingTiles?.(id, planned, 5);
    const now = performance.now();
    if (site.height > 20000) {
      if (patch) {
        patch = null;
        patchSite = null;
        revision++;
      }
    } else if (
      elevation?.base &&
      (!patch ||
        Math.abs(patch.halfSize - contactHalfSize) > Math.max(500, contactHalfSize * 0.15) ||
        displaced(site, patchSite) > 500 ||
        (lastRevision !== elevation.revision && now - lastBuild > 700))
    ) {
      patch = buildGroundPatch(
        site,
        (lat, lon, east, north) => {
          const measured = measuredHeight(lat, lon) ?? 0;
          const edge = clamp(
            (Math.max(Math.abs(east), Math.abs(north)) / contactHalfSize - 0.875) / 0.125,
            0,
            1
          );
          if (!edge || !surround) return measured;
          const outer = sampleGroundPatch(surround, surroundSite, lat, lon);
          if (outer === null) return measured;
          const blend = edge * edge * (3 - 2 * edge);
          return measured * (1 - blend) + outer * blend;
        },
        {
          segments: 256,
          halfSize: contactHalfSize,
          geoidUndulation,
          sphereRadius: 6371000,
        }
      );
      patchSite = { ...site };
      lastRevision = elevation.revision;
      lastBuild = now;
      revision++;
    }
    if (site.height > 200000) {
      if (surroundBuild) {
        buildGeneration++;
        surroundBuild = null;
      }
      if (surround) {
        surround = null;
        surroundSite = null;
        surroundRevision++;
      }
      return;
    }
    const records = elevation?.records?.(renderViewId) || [];
    const sourceKey =
      entries()
        .map((e) => `${e.tile.key}:${e.revision || 0}`)
        .join(',') +
      '|' +
      records.map((r) => `${r.tile.key}:${Math.floor((elevation.fade?.(r) ?? 1) * 4)}`).join(',');
    const needsBuild =
      elevation?.base &&
      (!surround ||
        surround.halfSize !== halfSize ||
        displaced(site, surroundSite) > 4000 ||
        (sourceKey !== surroundSourceKey && now - lastSurroundBuild > 1500));
    if (
      needsBuild &&
      (!surroundBuild ||
        surroundBuild.halfSize !== halfSize ||
        displaced(site, surroundBuild.site) > 4000)
    ) {
      const buildSite = { ...site },
        generation = ++buildGeneration;
      const sample = measuredSampler;
      const job = { site: buildSite, halfSize, promise: null };
      surroundBuild = job;
      job.promise = buildGroundPatchAsync(
        buildSite,
        (lat, lon, east, north) => {
          const measured = sample(lat, lon) ?? 0;
          const edge = clamp(
            (Math.max(Math.abs(east), Math.abs(north)) / halfSize - 0.8) / 0.2,
            0,
            1
          );
          if (!edge) return measured;
          const blend = edge * edge * (3 - 2 * edge);
          return measured * (1 - blend) + displayHeight(lat, lon, records) * blend;
        },
        {
          segments: 768,
          halfSize,
          spacingScale: Math.min(16000, halfSize / 4),
          geoidUndulation,
          sphereRadius: 6371000,
        },
        () => !disposed && generation === buildGeneration
      )
        .then((data) => {
          if (!data || disposed || generation !== buildGeneration) return;
          surround = data;
          surroundSite = buildSite;
          surroundSourceKey = sourceKey;
          lastSurroundBuild = performance.now();
          surroundRevision++;
          lastRevision = -1;
          lastBuild = -Infinity;
        })
        .finally(() => {
          if (surroundBuild === job) surroundBuild = null;
        });
    }
  }

  function status() {
    const ready =
      site &&
      entries().filter(
        (entry) =>
          sampleGroundGrid(
            { ...entry.tile, heights: entry.heights, gridSize: 129 },
            site.latitude,
            site.longitude
          ) !== null
      );
    return {
      baseReady: !!elevation?.base,
      rangeKm: (surround?.halfSize || 0) / 1000,
      requestedTiles: planned.length,
      streamingPaused: !!elevation?.streamingPaused,
      detailed: !!ready?.some((entry) => entry.tile.z >= 12),
      pending: planned.filter((tile) => elevation?.pending?.has(tile.key)).length,
      tiles: planned.filter((tile) => elevation?.entries?.has(tile.key)).length,
      source: ready?.length ? ELEVATION_SOURCE.title : 'NOAA ETOPO 2022',
      verticalDatum: 'EGM2008',
      geoidCorrection: geoidUndulation,
      lastError: elevation?.lastError || '',
      credit: ready?.length ? ELEVATION_SOURCE.credit : 'NOAA NCEI ETOPO 2022',
    };
  }
  return {
    update,
    whenReady: () => surroundBuild?.promise ?? Promise.resolve(),
    measuredHeight,
    heightAt: measuredHeight,
    group,
    status,
    getPatch: () =>
      patch || surround
        ? {
            data: patch,
            site: patchSite,
            revision,
            surround: surround
              ? { data: surround, site: surroundSite, revision: surroundRevision }
              : null,
          }
        : null,
    dispose() {
      if (disposed) return;
      disposed = true;
      buildGeneration++;
      surroundBuild = null;
      elevation?.release?.(id);
      group.removeFromParent();
      patch = surround = null;
      sortedEntries = [];
    },
  };
}
