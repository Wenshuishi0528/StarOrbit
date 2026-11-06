import {flightVessel} from './free-flight-vessels.js';
import {FREE_FLIGHT_LIMITS} from './free-flight-physics.js';
import {Box3, Group, Matrix3, Matrix4, Quaternion, Vector3} from 'three';
import {OBB} from 'three/addons/math/OBB.js';
import {describeAssembly, placementMatrices} from './assembly.js';
import {VIEW_UNITS_PER_METRE} from './missions.js';

const metres = 1 / VIEW_UNITS_PER_METRE;
const toMetres = new Matrix4().makeScale(metres, metres, metres);
const matrix = rows => new Matrix4().set(...rows.flat());
const point = values => new Vector3().fromArray(values);
const rotation = values => new Quaternion().fromArray(values);

function setTransform(object, transform) {
  transform.decompose(object.position, object.quaternion, object.scale);
  object.updateMatrixWorld(true);
}

function posePanels(group, type, angles = {}) {
  for (const [key, name, axis] of [['roll', 'roll_' + type, 'x'], ['left', 'pitch_' + type + '_L', 'y'], ['right', 'pitch_' + type + '_R', 'y']]) {
    const pivot = group.getObjectByName(name);
    if (pivot && Number.isFinite(angles[key])) pivot.rotation[axis] = angles[key] * Math.PI / 180;
  }
}

// Bound rigid sections along the actual module, but keep a rotating panel and
// each docking collar in its own frame. A single enclosing station box would
// treat the empty space between two solar wings as a collision.
function collisionBoxes(module) {
  const bins = new Map();
  module.updateMatrixWorld(true);
  function walk(node, anchor) {
    if (!node.visible) return;
    if (node !== module && /^(pitch_|roll_|UD_CAP_(?:TH|SZ|TZ|WT|MT|XT)_)/.test(node.name)) anchor = node;
    if (node.isMesh) {
      const geometry = node.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (geometry.boundingBox && !geometry.boundingBox.isEmpty()) {
        const keyToLocal = anchor.matrixWorld.clone().invert().multiply(node.matrixWorld);
        const box = geometry.boundingBox.clone().applyMatrix4(keyToLocal);
        // The imported mesh uses five drawing units/metre. Sectioning by
        // longitudinal position preserves the narrow node beside a wider bus.
        const key = anchor === module ? 'body:' + Math.floor(box.getCenter(new Vector3()).x * metres / 2) : anchor.uuid;
        if (!bins.has(key)) bins.set(key, {anchor, box:new Box3()});
        bins.get(key).box.union(box);
      }
    }
    for (const child of node.children) walk(child, anchor);
  }
  walk(module, module);
  return [...bins.values()].map(({anchor, box}) => {
    const orientation = anchor.getWorldQuaternion(new Quaternion());
    const scale = anchor.getWorldScale(new Vector3());
    const halfSize = box.getSize(new Vector3()).multiplyScalar(.5).multiply(scale);
    halfSize.set(Math.abs(halfSize.x), Math.abs(halfSize.y), Math.abs(halfSize.z));
    return new OBB(box.getCenter(new Vector3()).applyMatrix4(anchor.matrixWorld), halfSize,
      new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromQuaternion(orientation)));
  });
}

function transformBoxes(boxes, orientation, offset) {
  const rotate = new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromQuaternion(orientation));
  return boxes.map(box => new OBB(box.center.clone().applyQuaternion(orientation).add(offset), box.halfSize,
    rotate.clone().multiply(box.rotation)));
}

function makeDefinition(module, instance, hostMatrix, meta) {
  const hostPort = hostMatrix.clone().multiply(matrix(meta.modules.TH.ports[instance.hostPort]));
  const localPort = matrix(meta.modules[instance.type].ports[flightVessel(instance.type).port]);
  const shipPort = module.matrixWorld.clone().multiply(localPort);
  const hostOrigin = new Vector3().setFromMatrixPosition(hostPort);
  const shipOrigin = new Vector3().setFromMatrixPosition(shipPort);
  const outward = new Vector3().setFromMatrixColumn(hostPort, 2).normalize();
  const up = new Vector3().setFromMatrixColumn(hostPort, 1).normalize();
  const lateral = new Vector3().crossVectors(up, outward).normalize();
  const north = new Vector3().crossVectors(outward, lateral);
  const attitude = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(outward, lateral, north));
  // The authored mating planes are inside their collars. Their midpoint is
  // the shared contact point; it exactly reproduces the assembled model.
  const port = hostOrigin.lerp(shipOrigin, .5);
  const boxCentre = new Box3().setFromObject(module).getCenter(new Vector3());
  const centre = port.clone().addScaledVector(outward, boxCentre.sub(port).dot(outward));
  return {id:'ship:' + instance.id,type:instance.type,portId:instance.id,hostId:instance.parentId,
    hostPort:instance.hostPort,position:centre.toArray(),quaternion:attitude.toArray(),port:port.toArray()};
}

function sphereFor(boxes) {
  const extents = new Box3();
  for (const box of boxes) extents.expandByPoint(box.center);
  const center = extents.getCenter(new Vector3());
  const radius = Math.max(0, ...boxes.map(box => center.distanceTo(box.center) + box.halfSize.length()));
  return {center, radius};
}

// Interval of motion which can reach an obstacle's broad-phase sphere.
function sweepInterval(start, end, target, radius) {
  const delta = end.clone().sub(start), from = start.clone().sub(target), length2 = delta.lengthSq();
  if (!length2) return from.lengthSq() <= radius * radius ? [0, 1] : null;
  const projected = -from.dot(delta) / length2;
  const difference = projected * projected - (from.lengthSq() - radius * radius) / length2;
  if (difference < 0) return null;
  const root = Math.sqrt(difference), enter = Math.max(0, projected - root), leave = Math.min(1, projected + root);
  return enter <= leave ? [enter, leave] : null;
}

function shipAt(vessel, state) {
  const q = rotation(state.quaternion), position = point(state.position);
  return {boxes:transformBoxes(vessel.localBoxes, q, position),center:position,radius:vessel.radius};
}

function touches(ship, before, after, obstacle, matePairs, limits=FREE_FLIGHT_LIMITS) {
  const start = point(before.position), end = point(after.position);
  const interval = sweepInterval(start, end, obstacle.center, ship.radius + obstacle.radius);
  if (!interval) return false;
  const q0 = rotation(before.quaternion), q1 = rotation(after.quaternion);
  const travel = start.distanceTo(end) + ship.radius * q0.angleTo(q1);
  // The shared fixed flight step usually takes just two samples. Refine long
  // segments within the broad-phase interval so thin panels cannot be skipped.
  const [first, last] = interval, steps = Math.max(1, Math.ceil(travel * (last - first) / .06));
  for (let i = 0; i <= steps; i++) {
    const t = first + (last - first) * i / steps;
    const q = q0.clone().slerp(q1, t), position = start.clone().lerp(end, t);
    let mating = false;
    // The permitted collar overlap follows this flight's soft-capture envelope.
    // It never exempts unrelated station sections, wings or other spacecraft.
    const collarAngle=Math.max(.15,limits.captureAngle*Math.PI/180+.025);
    const collarOffset=Math.max(.36,limits.captureLateral+.06);
    if (matePairs && q.angleTo(ship.dockedOrientation) < collarAngle) {
      const delta = ship.localPort.clone().applyQuaternion(q).add(position).sub(ship.port);
      const axial = delta.dot(ship.outward);
      mating = axial >= -.36 && axial <= 1.25 && delta.addScaledVector(ship.outward, -axial).lengthSq() < collarOffset ** 2;
    }
    const moved = transformBoxes(ship.localBoxes, q, position);
    for (let a = 0; a < moved.length; a++) {
      for (let b = 0; b < obstacle.boxes.length; b++) {
        if (mating && matePairs.has(a + ':' + b)) continue;
        if (moved[a].intersectsOBB(obstacle.boxes[b])) return true;
      }
    }
  }
  return false;
}

export function createFreeFlightAssembly(templates, meta, snapshot) {
  const graph = describeAssembly(snapshot.slots), placements = placementMatrices(meta, graph);
  const root = new Group(), fixed = new Map(), ships = new Map();
  const stationBounds = new Box3();
  for (const instance of graph.instances) {
    const model = templates[instance.type].clone(true);
    model.name = 'flight:' + instance.id; model.visible = true;
    posePanels(model, instance.type, snapshot.angles?.[instance.id]);
    const transform = toMetres.clone().multiply(placements.get(instance.id));
    setTransform(model, transform);root.add(model);root.updateMatrixWorld(true);
    const boxes = collisionBoxes(model);
    if (!flightVessel(instance.type)) {
      fixed.set(instance.id, {boxes,...sphereFor(boxes)});
      stationBounds.expandByObject(model);
      continue;
    }
    const host = toMetres.clone().multiply(placements.get(instance.parentId));
    const definition = makeDefinition(model, instance, host, meta);
    const centre = point(definition.position), attitude = rotation(definition.quaternion);
    const inverse = attitude.clone().invert();
    const localBoxes = transformBoxes(boxes, inverse, centre.clone().negate().applyQuaternion(inverse));
    const port = point(definition.port);
    const craft = new Group();craft.name = definition.id;
    craft.position.copy(centre);craft.quaternion.copy(attitude);
    root.add(craft);craft.updateMatrixWorld(true);craft.attach(model);
    ships.set(definition.id, {definition,craft,localBoxes,initialBoxes:boxes,port,dockedOrientation:attitude,
      outward:new Vector3(1,0,0).applyQuaternion(attitude),localPort:port.clone().sub(centre).applyQuaternion(inverse),
      radius:Math.max(...localBoxes.map(box => box.center.length() + box.halfSize.length())),overlaps:new Set()});
  }
  for (const ship of ships.values()) {
    const host = fixed.get(ship.definition.hostId);
    ship.initialBoxes.forEach((box,i) => host.boxes.forEach((other,j) => {
      if (box.intersectsOBB(other)) ship.overlaps.add(i + ':' + j);
    }));
  }
  function collides(before, after, definition, states, limits=FREE_FLIGHT_LIMITS) {
    const chaser = ships.get(definition.id);
    if (!chaser) return false;
    for (const [id, obstacle] of fixed) {
      if (touches(chaser, before, after, obstacle, id === chaser.definition.hostId ? chaser.overlaps : null,limits)) return true;
    }
    for (const [id, other] of ships) {
      if (id === definition.id) continue;
      const state = states?.find(candidate => candidate.id === id) || other.definition;
      if (touches(chaser, before, after, shipAt(other, state), null)) return true;
    }
    return false;
  }
  return {root,ships,stationBounds,collides,definitions:[...ships.values()].map(s => s.definition)};
}
