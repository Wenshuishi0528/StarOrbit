import * as THREE from 'three';
export const LUNAR_REFERENCE_RADIUS_KM = 1737.4;
const DEG = Math.PI / 180;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function decodeLunarTerrain(buffer, manifest) {
  const { width, height, scaleMeters } = manifest || {};
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 4 ||
    height < 2 ||
    width > 4096 ||
    height > 2048 ||
    scaleMeters !== 0.5 ||
    buffer.byteLength !== width * height * 2
  )
    throw Error('Invalid lunar DEM dimensions or encoding');
  const view = new DataView(buffer),
    values = new Int16Array(width * height);
  for (let i = 0; i < values.length; i++) values[i] = view.getInt16(i * 2, true);
  const mean = (row) => {
    let sum = 0;
    for (let x = 0; x < width; x++) sum += values[row * width + x];
    return sum / width;
  };
  return { width, height, scaleMeters, values, northMean: mean(0), southMean: mean(height - 1) };
}
export function lunarSurfaceDirection(longitude, latitude) {
  const lon = longitude * DEG,
    lat = latitude * DEG,
    c = Math.cos(lat);
  return [c * Math.cos(lon), c * Math.sin(lon), Math.sin(lat)];
}
export function sampleLunarHeightKm(data, longitude, latitude) {
  if (!data || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return 0;
  const { width: w, height: h, values, scaleMeters } = data;
  const lat = clamp(latitude, -90, 90);
  if (lat === 90) return (data.northMean * scaleMeters) / 1000;
  if (lat === -90) return (data.southMean * scaleMeters) / 1000;
  const u = ((((longitude + 180) % 360) + 360) % 360) / 360;
  const x = u * w - 0.5,
    y = clamp(((90 - lat) / 180) * h - 0.5, 0, h - 1);
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    tx = x - x0,
    ty = y - y0;
  const get = (xx, yy) => values[yy * w + (((xx % w) + w) % w)];
  const a = get(x0, y0) * (1 - tx) + get(x0 + 1, y0) * tx;
  const b = get(x0, Math.min(h - 1, y0 + 1)) * (1 - tx) + get(x0 + 1, Math.min(h - 1, y0 + 1)) * tx;
  return ((a * (1 - ty) + b * ty) * scaleMeters) / 1000;
}
export function lunarTerrainGeometry(
  data,
  relief = 1,
  width = data?.width || 64,
  height = data?.height || 32
) {
  const scale = relief === 8 ? 8 : 1,
    w = Math.max(4, Math.min(1440, Math.floor(width))),
    h = Math.max(2, Math.min(720, Math.floor(height)));
  const count = (w + 1) * (h + 1),
    positions = new Float32Array(count * 3),
    uv = new Float32Array(count * 2),
    elevations = new Float32Array(count);
  const indices = new Uint32Array(w * (h - 1) * 6);
  let cursor = 0;
  for (let row = 0; row <= h; row++)
    for (let col = 0; col <= w; col++) {
      const i = row * (w + 1) + col,
        longitude = (col / w) * 360 - 180,
        latitude = 90 - (row / h) * 180;
      const elevation = sampleLunarHeightKm(data, longitude, latitude),
        radius = 1 + (elevation * scale) / LUNAR_REFERENCE_RADIUS_KM;
      const direction = lunarSurfaceDirection(longitude, latitude);
      for (let a = 0; a < 3; a++) positions[i * 3 + a] = direction[a] * radius;
      uv[i * 2] = col / w;
      uv[i * 2 + 1] = 1 - row / h;
      elevations[i] = elevation;
      if (row < h && col < w) {
        const a = i,
          b = i + 1,
          c = i + w + 1,
          d = c + 1;
        if (row > 0) {
          indices[cursor++] = a;
          indices[cursor++] = c;
          indices[cursor++] = b;
        }
        if (row < h - 1) {
          indices[cursor++] = b;
          indices[cursor++] = c;
          indices[cursor++] = d;
        }
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('elevationKm', new THREE.BufferAttribute(elevations, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal.array;
  // Duplicate equirectangular edge vertices share a physical position; smooth
  // their normals too, so the longitude seam does not become a false cliff.
  for (let row = 1; row < h; row++) {
    const a = row * (w + 1) * 3,
      b = (row * (w + 1) + w) * 3;
    const x = normals[a] + normals[b],
      y = normals[a + 1] + normals[b + 1],
      z = normals[a + 2] + normals[b + 2],
      n = Math.hypot(x, y, z) || 1;
    for (const i of [a, b]) {
      normals[i] = x / n;
      normals[i + 1] = y / n;
      normals[i + 2] = z / n;
    }
  }
  for (let col = 0; col <= w; col++)
    for (const row of [0, h]) {
      const i = (row * (w + 1) + col) * 3;
      normals[i] = normals[i + 1] = 0;
      normals[i + 2] = row === 0 ? 1 : -1;
    }
  geometry.computeBoundingSphere();
  return geometry;
}
