// Artwork coordinates are normalized from the image's upper-left corner.
// Directions are ICRS/J2000: +x=RA 0, +y=RA 90, +z=north. These drawings do
// not define IAU constellation boundaries or physical outlines in space.
const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const subtract = (a, b) => a.map((x, i) => x - b[i]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const numericArray = (value) =>
  (Array.isArray(value) || ArrayBuffer.isView(value)) &&
  Number.isInteger(value.length) &&
  Array.from(value).every(Number.isFinite);
function unit(a) {
  const length = Math.hypot(...a);
  if (!Number.isFinite(length) || length < 1e-12) throw Error('Invalid art direction');
  return a.map((x) => x / length);
}

function registeredMeshFrame(record) {
  const source = record.mesh,
    positions = source.positions,
    uv = source.uv,
    indices = source.indices;
  if (
    !numericArray(positions) ||
    positions.length < 9 ||
    positions.length % 3 ||
    positions.length / 3 > 16384 ||
    !numericArray(uv) ||
    uv.length !== (positions.length / 3) * 2 ||
    !numericArray(indices) ||
    indices.length < 3 ||
    indices.length % 3 ||
    indices.length / 3 > 32768
  )
    throw Error('Invalid artwork mesh arrays or budget');
  const count = positions.length / 3;
  if (indices.some((index) => !Number.isInteger(index) || index < 0 || index >= count))
    throw Error('Invalid artwork mesh indices');
  if (uv.some((value) => value < 0 || value > 1)) throw Error('Invalid artwork mesh UV');
  let planeNormal = null;
  if (source.planeNormal !== undefined) {
    if (
      !numericArray(source.planeNormal) ||
      source.planeNormal.length !== 3 ||
      Math.abs(Math.hypot(...source.planeNormal) - 1) > 1e-4
    )
      throw Error('Invalid artwork gnomonic plane normal');
    planeNormal = unit(Array.from(source.planeNormal));
  }
  const mesh = {
      positions: new Float32Array(positions.length),
      uv: new Float32Array(uv),
      indices: new Uint16Array(indices),
      planeNormal,
    },
    directions = [];
  for (let i = 0; i < positions.length; i += 3) {
    const direction = Array.from(positions.slice(i, i + 3)),
      length = Math.hypot(...direction);
    if (Math.abs(length - 1) > 1e-4) throw Error('Artwork mesh positions must be unit directions');
    mesh.positions.set(unit(direction), i);
    directions.push(unit(Array.from(mesh.positions.slice(i, i + 3))));
    if (planeNormal && dot(planeNormal, directions.at(-1)) <= 1e-6)
      throw Error('Artwork gnomonic plane crosses its tangent horizon');
  }
  let winding = 0,
    parity = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = Array.from(mesh.indices.slice(i, i + 3)),
      area =
        (mesh.uv[b * 2] - mesh.uv[a * 2]) * (mesh.uv[c * 2 + 1] - mesh.uv[a * 2 + 1]) -
        (mesh.uv[b * 2 + 1] - mesh.uv[a * 2 + 1]) * (mesh.uv[c * 2] - mesh.uv[a * 2]),
      skyArea = dot(directions[a], cross(directions[b], directions[c]));
    if (Math.abs(area) < 1e-12 || Math.abs(skyArea) < 1e-12)
      throw Error('Degenerate artwork mesh triangle');
    const nextWinding = Math.sign(area),
      nextParity = Math.sign(area * skyArea);
    if ((winding && winding !== nextWinding) || (parity && parity !== nextParity))
      throw Error('Folded artwork mesh projection');
    winding = nextWinding;
    parity = nextParity;
  }
  const mean = directions.reduce(
      (sum, point) => sum.map((value, i) => value + point[i]),
      [0, 0, 0]
    ),
    meanLength = Math.hypot(...mean),
    center = meanLength > 1e-8 ? unit(mean) : directions[0],
    minimum = Math.min(...directions.map((point) => dot(center, point)));
  return {
    id: record.imageId,
    record,
    mesh,
    corners: directions,
    center,
    // A cap smaller than a hemisphere is convex under each triangle's
    // normalized barycentric interpolation. All vertices therefore bound its
    // entire surface; wider sheets receive a conservative full-sphere bound.
    radiusRad: meanLength > 1e-8 && minimum > 0 ? Math.acos(clamp(minimum, -1, 1)) : Math.PI,
  };
}

function meshDirection(frame, u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) throw Error('Invalid artwork source pixel');
  const { positions, uv, indices, planeNormal } = frame.mesh,
    x = u,
    y = 1 - v,
    epsilon = 1e-7;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i],
      b = indices[i + 1],
      c = indices[i + 2],
      ax = uv[a * 2],
      ay = uv[a * 2 + 1],
      bx = uv[b * 2],
      by = uv[b * 2 + 1],
      cx = uv[c * 2],
      cy = uv[c * 2 + 1],
      denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy),
      first = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator,
      second = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator,
      third = 1 - first - second;
    if (Math.min(first, second, third) < -epsilon || Math.max(first, second, third) > 1 + epsilon)
      continue;
    // Uniform gnomonic sheets retain the homogeneous plane distance. The
    // shader performs this same restoration before perspective interpolation.
    const weight = (index, barycentric) =>
      planeNormal
        ? barycentric / dot(planeNormal, Array.from(positions.slice(index * 3, index * 3 + 3)))
        : barycentric;
    const wa = weight(a, first),
      wb = weight(b, second),
      wc = weight(c, third);
    return unit(
      [0, 1, 2].map(
        (axis) =>
          wa * positions[a * 3 + axis] + wb * positions[b * 3 + axis] + wc * positions[c * 3 + axis]
      )
    );
  }
  throw Error('Artwork source pixel is outside the registered mesh');
}

/** Three noncollinear image anchors uniquely define an affine plane in 3D.
 * Normalizing that plane matches Stellarium's tangential artwork projection.
 * Its artificial fourth point only completes the normal axis of a 4D matrix;
 * it does not change any z=0 point. No GPL implementation is copied here.
 * Reference: Stellarium ConstellationMgr.cpp, loadLinesNamesAndArt, 584–618.
 */
export function constellationArtFrame(record) {
  const size = record.size || [record.width, record.height];
  if (record.mesh) {
    if (size.length !== 2 || !size.every((n) => Number.isFinite(n) && n > 0))
      throw Error('Mesh artwork needs a reference size');
    return registeredMeshFrame(record);
  }
  if (!size.every((n) => Number.isFinite(n) && n > 0) || record.anchors?.length !== 3)
    throw Error('Artwork needs a reference size and three anchors');
  const anchors = record.anchors.map((a) => ({
    u: a.pos[0] / size[0],
    v: a.pos[1] / size[1],
    direction: unit(a.direction),
  }));
  const [a, b, c] = anchors;
  const ux = b.u - a.u,
    uy = b.v - a.v,
    vx = c.u - a.u,
    vy = c.v - a.v,
    determinant = ux * vy - uy * vx;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-8)
    throw Error('Artwork anchors must not be collinear');
  const ab = subtract(b.direction, a.direction),
    ac = subtract(c.direction, a.direction),
    normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ],
    normalLength = Math.hypot(...normal);
  // A plane through the observer collapses to a great circle after
  // normalization. Reject that degeneracy instead of creating flipped or
  // unbounded artwork; the shipped western anchors are well away from it.
  if (normalLength < 1e-12 || Math.abs(dot(a.direction, normal)) / normalLength < 1e-6)
    throw Error('Artwork sky anchors form a degenerate projection');
  const du = ab.map((x, i) => (x * vy - ac[i] * uy) / determinant),
    dv = ac.map((x, i) => (x * ux - ab[i] * vx) / determinant),
    origin = a.direction.map((x, i) => x - a.u * du[i] - a.v * dv[i]);
  const frame = { id: record.imageId, record, origin, du, dv };
  frame.corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([u, v]) => constellationArtDirection(frame, u, v));
  frame.center = constellationArtDirection(frame, 0.5, 0.5);
  const minimum = Math.min(...frame.corners.map((corner) => dot(frame.center, corner)));
  // A sub-hemisphere spherical cap is convex, so every normalized affine
  // combination inside the rectangle also lies in the corner-containing cap.
  // An exotic wider image uses a full-sphere bound instead of a false cull.
  frame.radiusRad = minimum > 0 ? Math.acos(clamp(minimum, -1, 1)) : Math.PI;
  return frame;
}

/** u/v start at the top-left; all four corners use this same affine mapping. */
export function constellationArtDirection(frame, u, v) {
  if (frame.mesh) return meshDirection(frame, u, v);
  return unit(frame.origin.map((x, i) => x + u * frame.du[i] + v * frame.dv[i]));
}

/** Source pixels start at the upper-left of record.size. This queries the
 * actual triangulated UV mapping used by every view and photograph. */
export function constellationArtPixelDirection(frame, x, y) {
  const size = frame.record.size || [frame.record.width, frame.record.height];
  return constellationArtDirection(frame, x / size[0], y / size[1]);
}

/** UVs here use standard THREE.Texture flipY=true, unlike input anchor y. */
export function constellationArtMesh(frame, segments = 16) {
  if (frame.mesh)
    return {
      positions: new Float32Array(frame.mesh.positions),
      uv: new Float32Array(frame.mesh.uv),
      indices: new Uint16Array(frame.mesh.indices),
      ...(frame.mesh.planeNormal ? { planeNormal: [...frame.mesh.planeNormal] } : {}),
    };
  if (!Number.isInteger(segments) || segments < 1 || segments > 128)
    throw Error('Artwork mesh segments must be between 1 and 128');
  const side = segments + 1,
    positions = new Float32Array(side * side * 3),
    uv = new Float32Array(side * side * 2),
    indices = new Uint16Array(segments * segments * 6);
  for (let y = 0; y <= segments; y++) {
    for (let x = 0; x <= segments; x++) {
      const i = y * side + x,
        u = x / segments,
        v = y / segments;
      positions.set(constellationArtDirection(frame, u, v), i * 3);
      uv.set([u, 1 - v], i * 2);
      if (x < segments && y < segments) {
        const j = (y * segments + x) * 6;
        indices.set([i, i + 1, i + side, i + 1, i + side + 1, i + side], j);
      }
    }
  }
  return { positions, uv, indices };
}

/** Conservative whole-image selection, including a large picture whose
 * center lies off-screen. View axes use the same ICRS frame, fovY is degrees.
 * Returns unique frames sorted by center distance; the renderer owns budgets.
 */
export function selectConstellationArt(frames, view) {
  if (!view || !(view.fovY > 0) || !(view.aspect > 0)) return [];
  const forward = unit(view.forward),
    right = unit(view.right),
    up = unit(view.up),
    ty = Math.tan(clamp(view.fovY, 0.000001, 179) * DEG * 0.5),
    tx = ty * view.aspect;
  const planes = [
    unit(forward.map((x, i) => x * tx + right[i])),
    unit(forward.map((x, i) => x * tx - right[i])),
    unit(forward.map((x, i) => x * ty + up[i])),
    unit(forward.map((x, i) => x * ty - up[i])),
    forward,
  ];
  const unique = new Map();
  for (const frame of frames) {
    if (unique.has(frame.id)) continue;
    const extent = Math.sin(frame.radiusRad);
    if (
      frame.radiusRad >= Math.PI / 2 ||
      planes.every((plane) => dot(plane, frame.center) >= -extent - 1e-12)
    )
      unique.set(frame.id, frame);
  }
  return [...unique.values()].sort(
    (a, b) => dot(forward, b.center) - dot(forward, a.center) || a.id.localeCompare(b.id)
  );
}

/** Hide illustration fragments at telescope magnifications; retain the user
 * switch and normal opacity at >=3 degrees. No time-dependent state here.
 */
export function constellationArtFade(fovY) {
  const x = clamp((fovY - 1) / 2, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Explicit regional overlays stay visible at every valid field of view. */
export function constellationOverviewFade(fovY) {
  return Number.isFinite(fovY) && fovY > 0 ? 1 : 0;
}
