// HEALPix NESTED geometry for equatorial HiPS. Directions are ICRS/J2000:
// RA 0 = +X, RA 90° = +Y, celestial north = +Z (not Earth-fixed axes).
// References: IVOA HiPS 1.0 §4.1/4.2/6.3, HEALPix xyf2loc/loc2pix/max_pixrad,
// and Aladin Lite renderable/hips/uv.rs. Image UV has its origin at TOP LEFT:
// u = native HEALPix y; v = native HEALPix x. Use Texture.flipY = false.
// JPEG/PNG child tiles are arranged [0, 2; 1, 3], not Morton order in rows.
const PI = Math.PI;
const HALF_PI = PI / 2;
const DEG = PI / 180;
const JR = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
const JP = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mod = (x, n) => ((x % n) + n) % n;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function checkOrder(order) {
  // Order 24 is the last whose 12 * 4^order cell IDs fit exactly in a Number.
  if (!Number.isInteger(order) || order < 0 || order > 24) {
    throw new RangeError('HiPS order must be an integer from 0 to 24');
  }
}

function unit(value) {
  const x = value?.[0] ?? value?.x;
  const y = value?.[1] ?? value?.y;
  const z = value?.[2] ?? value?.z;
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length === 0) {
    throw new TypeError('HiPS direction must be a finite nonzero vector');
  }
  return [x / length, y / length, z / length];
}

function decode(order, pixel) {
  checkOrder(order);
  const area = 4 ** order;
  if (!Number.isSafeInteger(pixel) || pixel < 0 || pixel >= 12 * area) {
    throw new RangeError('HiPS pixel is outside its order');
  }
  const face = Math.floor(pixel / area);
  let bits = pixel - face * area;
  let ix = 0;
  let iy = 0;
  for (let scale = 1; bits > 0; scale *= 2) {
    const pair = bits % 4;
    ix += (pair % 2) * scale;
    iy += Math.floor(pair / 2) * scale;
    bits = Math.floor(bits / 4);
  }
  return { face, ix, iy, nside: 2 ** order };
}

function encode(order, face, ix, iy) {
  // Arithmetic Morton interleaving avoids JS's signed 32-bit bitwise limit.
  let pixel = face * 4 ** order;
  for (let scale = 1; ix > 0 || iy > 0; scale *= 4) {
    pixel += ((ix % 2) + 2 * (iy % 2)) * scale;
    ix = Math.floor(ix / 2);
    iy = Math.floor(iy / 2);
  }
  return pixel;
}

/** Map an ICRS direction to its NESTED tile and top-left-origin image UV. */
export function hipsPixel(order, direction) {
  checkOrder(order);
  const [x, y, z] = unit(direction);
  const nside = 2 ** order;
  const tt = mod(Math.atan2(y, x) / HALF_PI, 4);
  let face;
  let ix;
  let iy;
  let dx;
  let dy;
  if (Math.abs(z) <= 2 / 3) {
    const along = nside * (0.5 + tt);
    const across = nside * z * 0.75;
    const ascending = along + across;
    const descending = along - across;
    const jp = Math.floor(descending);
    const jm = Math.floor(ascending);
    const fp = Math.floor(jp / nside);
    const fm = Math.floor(jm / nside);
    face = fp === fm ? (fp % 4) + 4 : fp < fm ? fp : fm + 8;
    ix = mod(jm, nside);
    iy = nside - 1 - mod(jp, nside);
    dx = ascending - jm;
    dy = 1 - (descending - jp);
  } else {
    const quadrant = Math.min(3, Math.floor(tt));
    const longitude = tt - quadrant;
    // sin(theta) form stays accurate near poles, where 1 - |z| rounds to zero.
    const radius = nside * Math.hypot(x, y) * Math.sqrt(3 / (1 + Math.abs(z)));
    const a = longitude * radius;
    const b = (1 - longitude) * radius;
    const ja = Math.min(nside - 1, Math.floor(a));
    const jb = Math.min(nside - 1, Math.floor(b));
    if (z > 0) {
      face = quadrant;
      ix = nside - 1 - jb;
      iy = nside - 1 - ja;
      dx = nside - b - ix;
      dy = nside - a - iy;
    } else {
      face = quadrant + 8;
      ix = ja;
      iy = jb;
      dx = a - ix;
      dy = b - iy;
    }
  }
  return {
    order,
    pixel: encode(order, face, ix, iy),
    face,
    ix,
    iy,
    u: clamp(dy, 0, 1),
    v: clamp(dx, 0, 1),
  };
}

function faceDirection(face, x, y) {
  const ring = JR[face] - x - y;
  let radius;
  let z;
  let transverse;
  if (ring < 1 || ring > 3) {
    radius = ring < 1 ? ring : 4 - ring;
    const cap = (radius * radius) / 3;
    z = ring < 1 ? 1 - cap : cap - 1;
    transverse = Math.sqrt(Math.max(0, cap * (2 - cap)));
  } else {
    radius = 1;
    z = ((2 - ring) * 2) / 3;
    transverse = Math.sqrt(Math.max(0, 1 - z * z));
  }
  const phi = radius < 1e-15 ? 0 : (PI / 4) * (JP[face] + (x - y) / radius);
  return [transverse * Math.cos(phi), transverse * Math.sin(phi), z];
}

/** Sample a tile continuously, including shared corners/edges; UV is image UV. */
export function hipsDirection(order, pixel, u = 0.5, v = 0.5) {
  if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) {
    throw new RangeError('HiPS UV must be within [0, 1]');
  }
  const { face, ix, iy, nside } = decode(order, pixel);
  return faceDirection(face, (ix + v) / nside, (iy + u) / nside);
}

export function hipsParent(order, pixel, parentOrder = Math.max(0, order - 1)) {
  decode(order, pixel);
  checkOrder(parentOrder);
  if (parentOrder > order) throw new RangeError('HiPS parent order exceeds child order');
  return { order: parentOrder, pixel: Math.floor(pixel / 4 ** (order - parentOrder)) };
}

export function hipsTileUrl(base, order, pixel, format = 'jpg') {
  decode(order, pixel);
  if (!/^(jpg|jpeg|png|avif|webp|fits)$/.test(format)) {
    throw new TypeError('Unsupported HiPS tile format');
  }
  const directory = Math.floor(pixel / 10000) * 10000;
  return `${String(base).replace(/\/+$/, '')}/Norder${order}/Dir${directory}/Npix${pixel}.${format}`;
}

/** Select native image sampling. fovY is in DEGREES; pixelHeight is physical pixels. */
export function hipsOrderForView(
  fovY,
  pixelHeight,
  { tileSize = 512, minOrder = 0, maxOrder = 14 } = {}
) {
  checkOrder(minOrder);
  checkOrder(maxOrder);
  if (!(fovY > 0 && fovY < 180) || !(pixelHeight > 0) || !(tileSize > 0)) {
    throw new RangeError('HiPS view dimensions must be positive; FOV must be below 180°');
  }
  if (minOrder > maxOrder) throw new RangeError('HiPS order range is reversed');
  const screenPixel = (2 * Math.tan((fovY * DEG) / 2)) / pixelHeight;
  const order = Math.ceil(Math.log2(Math.sqrt(PI / 3) / (tileSize * screenPixel)));
  return clamp(order, minOrder, maxOrder);
}

/** Global cell-center-to-boundary bound, using the HEALPix max_pixrad geometry. */
export function hipsMaxPixelRadius(order) {
  checkOrder(order);
  const nside = 2 ** order;
  const phi = PI / (4 * nside);
  const z = 1 - (1 - 1 / nside) ** 2 / 3;
  const a = [(Math.sqrt(5) / 3) * Math.cos(phi), (Math.sqrt(5) / 3) * Math.sin(phi), 2 / 3];
  const b = [Math.sqrt(Math.max(0, 1 - z * z)), 0, z];
  const cross = [a[1] * b[2], a[2] * b[0] - a[0] * b[2], -a[1] * b[0]];
  return Math.atan2(Math.hypot(...cross), dot(a, b));
}

/**
 * Conservatively cover a perspective viewport, including seams and polar tiles.
 * Camera basis is ICRS, fovY is in degrees. The whole level is reduced to fit the
 * tile budget; individual edge tiles are never dropped. If even minOrder cannot
 * fit, tiles is empty and budgetExceeded is true: keep the existing sky backdrop.
 */
export function selectHipsTiles({
  forward,
  right,
  up,
  fovY,
  aspect = 1,
  pixelHeight = 720,
  tileSize = 512,
  order,
  minOrder = 0,
  maxOrder = 14,
  maxTiles = 32,
}) {
  const naturalOrder = hipsOrderForView(fovY, pixelHeight, { tileSize, minOrder, maxOrder });
  if (!(aspect > 0) || !Number.isFinite(aspect) || !Number.isInteger(maxTiles) || maxTiles < 1) {
    throw new RangeError('HiPS aspect and tile budget must be positive');
  }
  if (order !== undefined) checkOrder(order);
  const requestedOrder = order === undefined ? naturalOrder : clamp(order, minOrder, maxOrder);
  const f = unit(forward);
  const r = unit(right);
  const u = unit(up);
  const ty = Math.tan((fovY * DEG) / 2);
  const tx = ty * aspect;
  const plane = (axis, tangent, sign) => unit(f.map((v, i) => v * tangent + axis[i] * sign));
  const planes = [plane(r, tx, 1), plane(r, tx, -1), plane(u, ty, 1), plane(u, ty, -1), f];
  const radii = Array.from(
    { length: requestedOrder + 1 },
    (_, level) => Math.sin(hipsMaxPixelRadius(level)) + 2e-14
  );

  function cover(level) {
    const tiles = [];
    function visit(depth, pixel) {
      const center = hipsDirection(depth, pixel);
      if (planes.some((normal) => dot(center, normal) < -radii[depth])) return true;
      if (depth === level) {
        tiles.push({ order: level, pixel, distance: 1 - dot(center, f) });
        return tiles.length <= maxTiles;
      }
      for (let child = 0; child < 4; child++) {
        if (!visit(depth + 1, pixel * 4 + child)) return false;
      }
      return true;
    }
    for (let face = 0; face < 12; face++) {
      if (!visit(0, face)) return null;
    }
    const centerPixel = hipsPixel(level, f).pixel;
    tiles.sort((a, b) => {
      if (a.pixel === centerPixel) return -1;
      if (b.pixel === centerPixel) return 1;
      return a.distance - b.distance || a.pixel - b.pixel;
    });
    return tiles;
  }

  for (let level = requestedOrder; level >= minOrder; level--) {
    const tiles = cover(level);
    if (tiles) return { order: level, requestedOrder, tiles, budgetExceeded: false };
  }
  return { order: minOrder, requestedOrder, tiles: [], budgetExceeded: true };
}

/** Unit-sphere mesh, outward-facing winding; use BackSide to view from inside. */
export function hipsTileMesh(order, pixel, segments = 8) {
  const { face, ix, iy, nside } = decode(order, pixel);
  if (!Number.isInteger(segments) || segments < 1 || segments > 128) {
    throw new RangeError('HiPS mesh segments must be between 1 and 128');
  }
  const side = segments + 1;
  const positions = new Float32Array(side * side * 3);
  const uvs = new Float32Array(side * side * 2);
  const indices = new Uint16Array(segments * segments * 6);
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const vertex = row * side + col;
      const u = col / segments;
      const v = row / segments;
      positions.set(faceDirection(face, (ix + v) / nside, (iy + u) / nside), vertex * 3);
      uvs.set([u, v], vertex * 2);
    }
  }
  let offset = 0;
  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments; col++) {
      const a = row * side + col;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], offset);
      offset += 6;
    }
  }
  return { positions, uvs, indices };
}
