import * as THREE from 'three';
import { cross, dot, norm, unit } from './orbit.js';
import { VIEW_UNITS_PER_METRE } from './missions.js';

export const FORMATION_DEFAULT = Object.freeze([-120, 60, 40]);
const vec = (a) => new THREE.Vector3(...a);
const finite = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
export function validOffset(v) {
  return finite(v) && Number.isFinite(Math.hypot(...v));
}
export function orbitalAxes(q) {
  if (!q || !finite(q.position) || !finite(q.velocity) || norm(q.position) === 0) return null;
  const radial = unit(q.position),
    tangent = q.velocity.map((v, i) => v - radial[i] * dot(radial, q.velocity));
  if (norm(tangent) < 1e-10) return null;
  const along = unit(tangent);
  return [along, unit(cross(radial, along)), radial];
}
export const fromBasis = (local, basis) =>
  [0, 1, 2].map((j) => basis.reduce((sum, axis, i) => sum + local[i] * axis[j], 0));
export const intoBasis = (inertial, basis) => basis.map((axis) => dot(axis, inertial));
export function aimAxes(input) {
  if (!finite(input?.forward) || norm(input.forward) < 1e-12) return null;
  const forward = unit(input.forward);
  const projected = finite(input.right)
    ? input.right.map((x, i) => x - forward[i] * dot(forward, input.right))
    : null;
  let right;
  if (projected && norm(projected) > 1e-8) right = unit(projected);
  else {
    const pole =
      finite(input.up) && norm(cross(forward, input.up)) > 1e-8
        ? input.up
        : Math.abs(forward[2]) < 0.98
          ? [0, 0, 1]
          : [0, 1, 0];
    right = unit(cross(forward, pole));
  }
  return { right, up: unit(cross(right, forward)), forward };
}
export function attitudeQuaternion({ right, up, forward }, camera = false) {
  const axes = camera ? [right, up, forward.map((x) => -x)] : [forward, right.map((x) => -x), up];
  return new THREE.Quaternion()
    .setFromRotationMatrix(new THREE.Matrix4().makeBasis(...axes.map(vec)))
    .normalize();
}
export function suggestedOffset(clearance) {
  const factor = Math.max(1, (clearance + 2) / Math.hypot(...FORMATION_DEFAULT));
  return FORMATION_DEFAULT.map((x) => x * factor);
}
export function boxCorners(box) {
  const result = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) result.push(new THREE.Vector3(x, y, z));
  return result;
}

// AABB in a rigid body or wing-pivot frame. The Minkowski inflation is
// conservative for a rotating companion. Slabs prevent a long drag tunnelling
// through a protected module even when both mouse endpoints are outside it.
export function boxTravelFraction(from, to, box, inflate) {
  let entry = 0,
    exit = 1;
  for (const axis of ['x', 'y', 'z']) {
    const a = from[axis],
      d = to[axis] - a,
      m = inflate[axis],
      lo = box.min[axis] - m,
      hi = box.max[axis] + m;
    if (Math.abs(d) < 1e-11) {
      if (a < lo || a > hi) return null;
      continue;
    }
    const x = (lo - a) / d,
      y = (hi - a) / d;
    entry = Math.max(entry, Math.min(x, y));
    exit = Math.min(exit, Math.max(x, y));
    if (entry > exit) return null;
  }
  return entry;
}
export function stationShapes(group) {
  // Keep each solar-wing branch in its own actual hinge frame. Fixed buses
  // share one box per module; a panel does not inflate the whole station box.
  group.updateWorldMatrix(true, true);
  const records = new Map();
  function walk(o, anchor, hinges) {
    if (o !== group && /^(roll_|pitch_)/.test(o.name)) {
      anchor = o;
      hinges = [...hinges, o];
    }
    if (o.isMesh && o.visible) {
      let rec = records.get(anchor);
      if (!rec) {
        rec = { anchor, hinges, box: new THREE.Box3(), inv: anchor.matrixWorld.clone().invert() };
        records.set(anchor, rec);
      }
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const transform = new THREE.Matrix4().multiplyMatrices(rec.inv, o.matrixWorld);
      rec.box.union(o.geometry.boundingBox.clone().applyMatrix4(transform));
    }
    if (o.visible) for (const child of o.children) walk(child, anchor, hinges);
  }
  walk(group, group, []);
  return [...records.values()].map(({ anchor, hinges, box }) => ({
    anchor,
    hinges,
    box,
    corners: boxCorners(box),
  }));
}
export function sweptReach(shape, origin) {
  if (!shape.hinges.length)
    return Math.max(
      ...shape.corners.map((v) =>
        v.clone().applyMatrix4(shape.anchor.matrixWorld).distanceTo(origin)
      )
    );
  let previous = origin,
    reach = 0;
  for (const hinge of shape.hinges) {
    const point = new THREE.Vector3().setFromMatrixPosition(hinge.matrixWorld);
    reach += previous.distanceTo(point);
    previous = point;
  }
  return (
    reach +
    Math.max(
      ...shape.corners.map((v) =>
        v.clone().applyMatrix4(shape.anchor.matrixWorld).distanceTo(previous)
      )
    )
  );
}
export function opticalModel(group) {
  group.updateWorldMatrix(true, true);
  const rim = group.getObjectByName('XT_offset_aperture_edge'),
    recess = group.getObjectByName('XT_offset_deep_optical_recess');
  if (!rim?.isMesh || !recess?.isMesh) return null;
  const inv = group.matrixWorld.clone().invert();
  function bounds(mesh) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox
      .clone()
      .applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
  }
  const opening = bounds(rim),
    deep = bounds(recess),
    center = opening.getCenter(new THREE.Vector3());
  const axis = center.clone().sub(deep.getCenter(new THREE.Vector3())).normalize();
  // Native CAD uses +X along the barrel. Validate it against the two separate
  // meshes before selecting the centre of the rim's front face.
  if (axis.dot(new THREE.Vector3(1, 0, 0)) < 0.9999) return null;
  center.x = opening.max.x;
  const shapes = stationShapes(group),
    rigid = shapes.find((s) => s.anchor === group);
  if (!rigid) return null;
  const reference = rigid.box.getCenter(new THREE.Vector3()),
    referenceWorld = reference.clone().applyMatrix4(group.matrixWorld);
  const radius =
    Math.max(...shapes.map((s) => sweptReach(s, referenceWorld))) / VIEW_UNITS_PER_METRE;
  return { reference, entrance: center, axis, radius };
}
export function constrainedTravel(from, to, shapes, padding, allowExit = false) {
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    inv = new THREE.Matrix4();
  let limit = 1;
  for (const shape of shapes) {
    shape.anchor.updateWorldMatrix(true, false);
    inv.copy(shape.anchor.matrixWorld).invert();
    const e = inv.elements;
    scale
      .set(
        Math.hypot(e[0], e[4], e[8]),
        Math.hypot(e[1], e[5], e[9]),
        Math.hypot(e[2], e[6], e[10])
      )
      .multiplyScalar(padding);
    const t = boxTravelFraction(
      a.copy(from).applyMatrix4(inv),
      b.copy(to).applyMatrix4(inv),
      shape.box,
      scale
    );
    // At the authored close formation a conservative clearance box may already
    // surround the centre. Permit travel out through its nearest face only.
    if (t === 0 && allowExit) {
      let gap = Infinity,
        outward = 0;
      for (const k of ['x', 'y', 'z']) {
        const low = a[k] - shape.box.min[k] + scale[k],
          high = shape.box.max[k] + scale[k] - a[k];
        if (low < gap) {
          gap = low;
          outward = a[k] - b[k];
        }
        if (high < gap) {
          gap = high;
          outward = b[k] - a[k];
        }
      }
      if (outward > 0) continue;
    }
    if (t != null) limit = Math.min(limit, t);
  }
  return limit;
}
