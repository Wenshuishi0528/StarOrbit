// Artwork coordinates are normalized from the image's upper-left corner.
// Directions are ICRS/J2000: +x=RA 0, +y=RA 90, +z=north. These drawings do
// not define IAU constellation boundaries or physical outlines in space.
const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const subtract = (a, b) => a.map((x, i) => x - b[i]);
function unit(a) {
  const length = Math.hypot(...a);
  if (!Number.isFinite(length) || length < 1e-12) throw Error('Invalid art direction');
  return a.map((x) => x / length);
}

/** Three noncollinear image anchors uniquely define an affine plane in 3D.
 * Normalizing that plane matches Stellarium's tangential artwork projection.
 * Its artificial fourth point only completes the normal axis of a 4D matrix;
 * it does not change any z=0 point. No GPL implementation is copied here.
 * Reference: Stellarium ConstellationMgr.cpp, loadLinesNamesAndArt, 584–618.
 */
export function constellationArtFrame(record) {
  const size = record.size || [record.width, record.height];
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
    ac = subtract(c.direction, a.direction);
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
  return unit(frame.origin.map((x, i) => x + u * frame.du[i] + v * frame.dv[i]));
}

/** UVs here use standard THREE.Texture flipY=true, unlike input anchor y. */
export function constellationArtMesh(frame, segments = 16) {
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
