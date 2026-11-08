import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { ElevationSource, ELEVATION_SOURCE } from './earth-elevation-source.js';
import { elevationTile } from './earth-elevation-math.js';
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

export function groundTilePlan(site) {
  const tiles = [];
  // A fine central neighbourhood and a coarse mountain horizon. No global DEM download.
  for (const z of [12, 9]) {
    const rows = 2 ** z,
      step = 180 / rows;
    const x = Math.floor((wrap(site.longitude) + 180) / step);
    const y = Math.min(rows - 1, Math.floor((90 - site.latitude) / step));
    for (const [dx, dy] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      if (y + dy < 0 || y + dy >= rows) continue;
      tiles.push(elevationTile(z, x + dx, y + dy));
    }
  }
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

export function buildGroundPatch(
  site,
  sampleHeight,
  { segments = 128, halfSize = 2048, geoidUndulation = 0 } = {}
) {
  const frame = enuFrame({ ...site, height: 0 }, geoidUndulation),
    stride = segments + 1;
  const positions = new Float32Array(stride * stride * 3),
    uv = new Float32Array(stride * stride * 2);
  for (let y = 0; y <= segments; y++)
    for (let x = 0; x <= segments; x++) {
      const geo = groundDestination(
        site,
        ((x / segments) * 2 - 1) * halfSize,
        ((y / segments) * 2 - 1) * halfSize
      );
      const height = sampleHeight(geo.latitude, geo.longitude);
      const local = localFromECEF(
        geodeticToECEF({ ...geo, height: Number.isFinite(height) ? height : 0 }, geoidUndulation),
        frame
      );
      const i = y * stride + x;
      positions.set(local, i * 3);
      // Keep UV continuous across the date line; the shared texture repeats in longitude.
      const lon = geo.longitude + 360 * Math.round((site.longitude - geo.longitude) / 360);
      uv.set([(lon + 180) / 360, (geo.latitude + 90) / 180], i * 2);
    }
  const indices = [];
  for (let y = 0; y < segments; y++)
    for (let x = 0; x < segments; x++) {
      const a = y * stride + x,
        b = a + 1,
        c = a + stride,
        d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  return { positions, uv, indices: new Uint32Array(indices), frame, segments, halfSize };
}

function buildHorizon(site, sampleHeight, geoidUndulation) {
  const frame = enuFrame({ ...site, height: 0 }, geoidUndulation),
    segments = 256;
  const radii = [
    1800, 2400, 3200, 4500, 6500, 9000, 13000, 18000, 25000, 35000, 50000, 75000, 110000, 160000,
    230000,
  ];
  const positions = [],
    uv = [],
    indices = [];
  for (const radius of radii)
    for (let x = 0; x <= segments; x++) {
      const a = (x / segments) * Math.PI * 2,
        geo = groundDestination(site, Math.sin(a) * radius, Math.cos(a) * radius);
      const height = sampleHeight(geo.latitude, geo.longitude);
      positions.push(
        ...localFromECEF(geodeticToECEF({ ...geo, height: height ?? 0 }, geoidUndulation), frame)
      );
      const lon = geo.longitude + 360 * Math.round((site.longitude - geo.longitude) / 360);
      uv.push((lon + 180) / 360, (geo.latitude + 90) / 180);
    }
  for (let r = 0; r < radii.length - 1; r++)
    for (let x = 0; x < segments; x++) {
      const a = r * (segments + 1) + x,
        b = a + 1,
        c = a + segments + 1,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  return {
    positions: new Float32Array(positions),
    uv: new Float32Array(uv),
    indices: new Uint32Array(indices),
    frame,
  };
}
function geometry(data) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
  g.setIndex(new THREE.BufferAttribute(data.indices, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  computeBoundsTree.call(g, { maxLeafSize: 12 });
  return g;
}
async function decode(blob) {
  const b =
    blob.type === 'application/gzip'
      ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : await blob.arrayBuffer();
  return b.byteLength === 129 * 129 * 4 ? new Float32Array(b) : null;
}
async function encode(heights) {
  const blob = new Blob([heights]);
  return typeof CompressionStream === 'function'
    ? new Blob(
        [
          await new Response(
            blob.stream().pipeThrough(new CompressionStream('gzip'))
          ).arrayBuffer(),
        ],
        { type: 'application/gzip' }
      )
    : blob;
}

/** Local ENU metres. Camera is [0,0,site.height], with current site's sea-level origin.
 * DEM's EGM2008 heights are kept distinct; geoidUndulation is an explicit optional
 * correction to WGS84 ECEF. Missing geoid data is not silently claimed as surveyed.
 */
export function createGroundSurface({
  environment,
  scene,
  source = new ElevationSource(),
  geoidUndulation = 0,
}) {
  const group = new THREE.Group();
  scene.add(group);
  const material = new THREE.MeshStandardMaterial({
    color: 0xa2a793,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const tiles = new Map(),
    pending = new Map(),
    failures = new Map();
  let wanted = [],
    signature = '',
    anchor = null,
    patch = null,
    near = null,
    far = null,
    site = null,
    revision = 0,
    drawnRevision = -1,
    lastBuild = 0,
    disposed = false,
    lastError = '';
  const baseSample = (lat, lon) => {
    const b = environment.elevation?.base;
    return b?.nodeHeights
      ? sampleGroundGrid(
          { heights: b.nodeHeights, bounds: b.bounds, columns: b.columns, rows: b.rows },
          lat,
          lon
        )
      : null;
  };
  function measuredHeight(lat, lon) {
    let height = baseSample(lat, lon);
    for (const z of [9, 12]) {
      const step = 180 / 2 ** z;
      for (const entry of tiles.values()) {
        if (entry.tile.z !== z) continue;
        const h = sampleGroundGrid(
          { ...entry.tile, heights: entry.heights, gridSize: 129 },
          lat,
          lon
        );
        if (h === null) continue;
        const [w, s, e, n] = entry.tile.bounds;
        const longitude = lon + 360 * Math.round(((w + e) / 2 - lon) / 360);
        const neighbour = (dx, dy) => {
          const yy = entry.tile.y + dy;
          if (yy < 0 || yy >= 2 ** z) return false;
          const adjacent = tiles.get(elevationTile(z, entry.tile.x + dx, yy).key);
          if (!adjacent) return false;
          const atLat = clamp(lat, s, n) + dy * -step,
            atLon = longitude + dx * step;
          return (
            sampleGroundGrid(
              { ...adjacent.tile, heights: adjacent.heights, gridSize: 129 },
              atLat,
              atLon
            ) !== null
          );
        };
        // Feather only the outer boundary of available measured coverage; joined
        // equal-resolution neighbours retain all their original DEM heights.
        const distances = [
          neighbour(-1, 0) ? Infinity : longitude - w,
          neighbour(1, 0) ? Infinity : e - longitude,
          neighbour(0, -1) ? Infinity : n - lat,
          neighbour(0, 1) ? Infinity : lat - s,
        ];
        const edge = Math.min(...distances),
          f = clamp(edge / (step * 0.25), 0, 1),
          weight = f * f * (3 - 2 * f);
        height = height === null ? h : height + (h - height) * weight;
        break;
      }
    }
    return height;
  }
  function heightAt(lat, lon) {
    // Match the stable near mesh triangle exactly: visual LOD/fades never drive contact.
    if (patch) {
      const p = localFromECEF(
        geodeticToECEF({ latitude: lat, longitude: lon, height: 0 }, geoidUndulation),
        patch.frame
      );
      const step = (patch.halfSize * 2) / patch.segments,
        fx = (p[0] + patch.halfSize) / step,
        fy = (p[1] + patch.halfSize) / step;
      if (fx >= 0 && fy >= 0 && fx < patch.segments && fy < patch.segments) {
        const x = Math.floor(fx),
          y = Math.floor(fy),
          u = fx - x,
          v = fy - y,
          stride = patch.segments + 1;
        const a = y * stride + x,
          b = a + 1,
          c = a + stride,
          d = c + 1;
        const ids = u + v <= 1 ? [a, b, c] : [b, d, c];
        const verts = ids.map((i) => new THREE.Vector3(...patch.positions.slice(i * 3, i * 3 + 3)));
        const normal = verts[1].clone().sub(verts[0]).cross(verts[2].clone().sub(verts[0]));
        if (Math.abs(normal.z) > 1e-10) {
          const z =
            verts[0].z -
            (normal.x * (p[0] - verts[0].x) + normal.y * (p[1] - verts[0].y)) / normal.z;
          return z - p[2];
        }
      }
    }
    return measuredHeight(lat, lon);
  }
  async function load(tile, controller) {
    try {
      let heights = environment.elevation?.entries?.get(tile.key)?.heights;
      const cache = environment.elevation?.cache;
      if (!heights && cache) {
        const blob = await cache.get(tile.key);
        if (blob) heights = await decode(blob);
      }
      controller.signal.throwIfAborted();
      if (!heights) {
        const result = await source.tile(tile, controller.signal);
        heights = result.heights;
        if (!(heights instanceof Float32Array) || heights.length !== 129 * 129)
          throw Error('局部高程数据长度不符');
        if (cache && !controller.signal.aborted) await cache.put(tile.key, await encode(heights));
      }
      if (disposed || controller.signal.aborted) return;
      tiles.set(tile.key, { tile, heights });
      revision++;
      lastError = '';
    } catch (error) {
      if (!controller.signal.aborted) {
        lastError = error.message;
        failures.set(tile.key, performance.now() + 60000);
      }
    } finally {
      pending.delete(tile.key);
      if (!disposed) pump();
    }
  }
  function pump() {
    for (const tile of wanted) {
      if (pending.size >= 2) break;
      if (
        tiles.has(tile.key) ||
        pending.has(tile.key) ||
        (failures.get(tile.key) || 0) > performance.now()
      )
        continue;
      const controller = new AbortController();
      pending.set(tile.key, controller);
      load(tile, controller);
    }
  }
  function update(next, time) {
    if (disposed) return;
    site = { ...next };
    const planned = groundTilePlan(site),
      key = planned.map((t) => t.key).join('|');
    if (key !== signature) {
      signature = key;
      wanted = planned;
      const keys = new Set(planned.map((t) => t.key));
      for (const [k, c] of pending) if (!keys.has(k)) c.abort();
      for (const k of tiles.keys()) if (!keys.has(k)) tiles.delete(k);
      for (const k of failures.keys()) if (!keys.has(k)) failures.delete(k);
    }
    pump();
    const current = enuFrame({ ...site, height: 0 }, geoidUndulation),
      now = performance.now();
    const distance = anchor ? Math.hypot(...localFromECEF(current.origin, anchor)) : Infinity;
    if (
      environment.elevation?.base &&
      (!anchor || distance > 400 || (revision !== drawnRevision && now - lastBuild > 700))
    ) {
      const data = buildGroundPatch(site, measuredHeight, { geoidUndulation });
      patch = data;
      anchor = data.frame;
      const horizon = buildHorizon(site, measuredHeight, geoidUndulation);
      for (const mesh of [near, far])
        if (mesh) {
          group.remove(mesh);
          disposeBoundsTree.call(mesh.geometry);
          mesh.geometry.dispose();
        }
      near = new THREE.Mesh(geometry(data), material);
      far = new THREE.Mesh(geometry(horizon), material);
      near.raycast = far.raycast = acceleratedRaycast;
      // Avoid overlapping near/horizon depth fighting: horizon lies below near terrain.
      far.position.z = -2;
      group.add(near, far);
      drawnRevision = revision;
      lastBuild = now;
    }
    if (anchor) {
      const basis = (axis) =>
        new THREE.Vector3(
          axis.reduce((s, v, i) => s + v * current.east[i], 0),
          axis.reduce((s, v, i) => s + v * current.north[i], 0),
          axis.reduce((s, v, i) => s + v * current.up[i], 0)
        );
      const m = new THREE.Matrix4().makeBasis(
        basis(anchor.east),
        basis(anchor.north),
        basis(anchor.up)
      );
      m.setPosition(...localFromECEF(anchor.origin, current));
      group.matrix.copy(m);
      group.matrixAutoUpdate = false;
      group.matrixWorldNeedsUpdate = true;
    }
    const texture = environment.uniforms?.dayMap?.value;
    if (texture && texture !== environment.fallback && texture !== material.map) {
      material.map = texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    }
  }
  return {
    update,
    heightAt,
    measuredHeight,
    group,
    status: () => ({
      baseReady: !!environment.elevation?.base,
      detailed:
        !!site &&
        [...tiles.values()].some(
          (e) =>
            e.tile.z === 12 &&
            sampleGroundGrid(
              { ...e.tile, heights: e.heights, gridSize: 129 },
              site.latitude,
              site.longitude
            ) !== null
        ),
      pending: pending.size,
      tiles: tiles.size,
      source: tiles.size ? ELEVATION_SOURCE.title : 'NOAA ETOPO 2022',
      verticalDatum: 'EGM2008',
      geoidCorrection: geoidUndulation,
      geoidModel: geoidUndulation === 0 ? '未配置局部大地水准面改正' : '局部改正',
      lastError,
      credit: tiles.size ? ELEVATION_SOURCE.credit : 'NOAA NCEI ETOPO 2022',
    }),
    dispose() {
      disposed = true;
      for (const c of pending.values()) c.abort();
      pending.clear();
      source.close();
      for (const m of [near, far])
        if (m) {
          disposeBoundsTree.call(m.geometry);
          m.geometry.dispose();
        }
      material.dispose();
      scene.remove(group);
      tiles.clear();
    },
  };
}
