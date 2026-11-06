import * as THREE from 'three';
import { VIEW_UNITS_PER_METRE } from './missions.js';
import {
  FORMATION_DEFAULT,
  aimAxes,
  attitudeQuaternion,
  validOffset,
  suggestedOffset,
  orbitalAxes,
  fromBasis,
  intoBasis,
  stationShapes,
  opticalModel,
  sweptReach,
  constrainedTravel,
} from './xuntian-formation-math.js';
export { mountXuntianFormationPanel } from './xuntian-formation-panel.js';

const INITIAL_OFFSET = Object.freeze([52, 0, 0]);
const SCALE = VIEW_UNITS_PER_METRE,
  IDENTITY = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  margin = 2;
const vec = (a) => new THREE.Vector3(...a);
const defaultAim = () => ({ right: [0, -1, 0], up: [0, 0, 1], forward: [1, 0, 0] });

export function installXuntianFormation(sim) {
  const api = sim.api,
    listeners = new Set();
  let offset = [...INITIAL_OFFSET],
    automatic = false,
    active = null,
    measured = null,
    shapes = [],
    recommended = [...FORMATION_DEFAULT],
    extent = 0,
    padding = 0;
  let initialPlacement = true;
  let command = null,
    last = null,
    lastFrame = { orbital: IDENTITY, scene: IDENTITY },
    constrained = false,
    disposed = false,
    lastReason = 'initial';
  function getState() {
    return {
      offset: [...offset],
      suggested: [...recommended],
      extent,
      automatic,
      available: !!(sim.missionId === 'tiangong' && active?.visible && measured),
      constrained,
      reason: lastReason,
    };
  }
  function notify(reason) {
    lastReason = reason;
    const state = getState();
    for (const listener of listeners) listener(state);
  }
  function dataFrame(q) {
    const orbital = orbitalAxes(sim.mainFlight?.reference ?? q);
    if (orbital && q?.basis) lastFrame = { orbital, scene: q.basis };
    return lastFrame;
  }
  function centerLocal(v, frame) {
    return vec(intoBasis(fromBasis(v, frame.orbital), frame.scene)).multiplyScalar(SCALE);
  }
  function collect() {
    active = api.groups.freeXT ?? null;
    measured = active ? opticalModel(active) : null;
    shapes = [];
    for (const [id, group] of Object.entries(api.groups))
      if (id !== 'freeXT' && group?.visible) shapes.push(...stationShapes(group));
    const zero = new THREE.Vector3();
    (api.modelRoot || api.model)?.getWorldPosition(zero);
    padding = ((measured?.radius || 0) + margin) * SCALE;
    const reach = (zero.length() + Math.max(0, ...shapes.map((s) => sweptReach(s, zero)))) / SCALE;
    extent = reach + padding / SCALE;
    recommended = suggestedOffset(extent);
    // A desired close formation is tested against current geometry below. The
    // global all-attitude envelope is only for safe fallback/recommendations.
    if (initialPlacement) offset = [...INITIAL_OFFSET];
    else if (automatic) offset = [...recommended];
  }
  function protectedAt(center) {
    return (
      center.length() <= extent * SCALE && constrainedTravel(center, center, shapes, padding) < 1
    );
  }
  function ensureClear(frame) {
    if (!measured || !protectedAt(centerLocal(offset, frame))) return false;
    offset = [...recommended];
    initialPlacement = false;
    automatic = true;
    constrained = true;
    return true;
  }
  function update(q = sim.current, axes) {
    if (disposed) return null;
    if (api.groups.freeXT !== active && (api.groups.freeXT || active)) collect();
    if (sim.missionId !== 'tiangong' || !active?.visible || !measured) {
      last = null;
      return null;
    }
    const frame = dataFrame(q),
      relocated = ensureClear(frame),
      center = centerLocal(offset, frame);
    if (axes) {
      const requested = aimAxes(axes);
      if (requested) command = requested;
    }
    if (!command && q) {
      const sun = q.sunDir || q.sun;
      command = aimAxes({ forward: sun?.map((x) => -x) }) || defaultAim();
    }
    const inertial = command || defaultAim(),
      sceneAxes = Object.fromEntries(
        Object.entries(inertial).map(([key, v]) => [key, intoBasis(v, frame.scene)])
      );
    const pose = attitudeQuaternion(sceneAxes),
      origin = center.clone().sub(measured.reference.clone().applyQuaternion(pose));
    const world = new THREE.Matrix4().compose(origin, pose, new THREE.Vector3(1, 1, 1));
    active.parent.updateWorldMatrix(true, false);
    const local = active.parent.matrixWorld.clone().invert().multiply(world);
    local.decompose(active.position, active.quaternion, active.scale);
    active.updateWorldMatrix(false, true);
    if (!q) {
      last = null;
      if (relocated) notify('clearance');
      return null;
    }
    const eyeLocal = active.localToWorld(measured.entrance.clone()).toArray();
    const displacement = fromBasis(
      eyeLocal.map((x) => x / (SCALE * 1000)),
      q.basis
    );
    last = {
      eyeLocal,
      eyeKm: (q.sceneOrigin || q.position).map((x, i) => x + displacement[i]),
      axes: inertial,
      localAxes: sceneAxes,
      cameraQuaternion: attitudeQuaternion(sceneAxes, true).toArray(),
      cameraQuaternionKm: attitudeQuaternion(inertial, true).toArray(),
      entranceModel: measured.entrance.toArray(),
      centerLocal: center.toArray(),
      time: q.t,
    };
    if (relocated) notify('clearance');
    return last;
  }
  function refresh() {
    if (disposed) return;
    collect();
    constrained = false;
    update(sim.current);
    if (!constrained) notify('configuration');
  }
  function setOffset(next) {
    if (disposed || !validOffset(next) || !active || !measured || sim.missionId !== 'tiangong')
      return getState();
    const frame = dataFrame(sim.current);
    ensureClear(frame);
    const from = centerLocal(offset, frame),
      to = centerLocal(next, frame),
      delta = to.clone().sub(from),
      length = delta.length();
    if (length < 1e-9) return getState();
    const nearest = Math.max(0, Math.min(1, -from.dot(delta) / (length * length)));
    let fraction = 1;
    if (from.clone().addScaledVector(delta, nearest).length() <= extent * SCALE) {
      fraction = constrainedTravel(from, to, shapes, padding);
      if (fraction < 1 || protectedAt(to))
        fraction = Math.max(0, fraction - (0.01 * SCALE) / length);
    }
    constrained = fraction < 1;
    automatic = false;
    offset = next.map((value, i) => offset[i] + (value - offset[i]) * fraction);
    initialPlacement = false;
    update(sim.current);
    notify(constrained ? 'clearance' : 'offset');
    return getState();
  }
  function restoreInitial() {
    initialPlacement = true;
    automatic = false;
    constrained = false;
    collect();
    offset = [...INITIAL_OFFSET];
    update(sim.current);
    notify(constrained ? 'clearance' : 'offset');
  }
  function restoreSuggested() {
    if (disposed) return getState();
    // This explicitly restores placement; manual drags always use swept collision tests.
    initialPlacement = false;
    offset = [...recommended];
    automatic = true;
    constrained = false;
    update(sim.current);
    notify('suggested');
    return getState();
  }
  function stationBounds() {
    const box = new THREE.Box3();
    for (const entry of shapes) {
      entry.anchor.updateWorldMatrix(true, false);
      for (const corner of entry.corners)
        box.expandByPoint(corner.clone().applyMatrix4(entry.anchor.matrixWorld));
    }
    return box;
  }
  function stationTarget(aspect = 1) {
    if (!last || !sim.current || !Number.isFinite(aspect) || aspect <= 0) return null;
    const bounds = stationBounds();
    if (bounds.isEmpty()) return null;
    const center = bounds.getCenter(new THREE.Vector3()),
      eye = vec(last.eyeLocal),
      relative = center.clone().sub(eye),
      distance = relative.length();
    if (distance < 1e-8) return null;
    const forward = relative.divideScalar(distance);
    let slope = 0,
      complete = true;
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const v = new THREE.Vector3(x, y, z).sub(eye),
            depth = v.dot(forward);
          if (depth <= 1e-7) {
            complete = false;
            continue;
          }
          // For arbitrary field roll, fit the bounding cone into the smaller dimension.
          slope = Math.max(
            slope,
            v.addScaledVector(forward, -depth).length() / depth / Math.min(1, aspect)
          );
        }
    return {
      direction: fromBasis(forward.toArray(), sim.current.basis),
      fov: complete ? Math.max(0.01, (2 * Math.atan(1.06 * slope) * 180) / Math.PI) : 179,
      centerLocal: center.toArray(),
      range: distance / SCALE,
      fullyVisible: complete,
    };
  }
  function frameExternal(previewElement, closeUp) {
    if (disposed || sim.missionId !== 'tiangong' || !active || !measured) return false;
    update(sim.current);
    if (sim.environment?.moon?.savedView) sim.environment.moon.returnToStation();
    sim.setView?.('follow');
    const station = stationBounds();
    if (station.isEmpty()) return false;
    const stationCenter = station.getCenter(new THREE.Vector3()),
      craft = centerLocal(offset, dataFrame(sim.current));
    const separation = craft.clone().sub(stationCenter).normalize(),
      up = new THREE.Vector3(0, 0, 1);
    let d;
    if (closeUp) {
      // Pick a three-quarter side view once. The observer camera stays in the
      // orbit scene as the real telescope turns, so its attitude change is visible.
      const axes = last?.localAxes || defaultAim(),
        lateral = vec(axes.right);
      const sign = lateral.dot(separation) < 0 ? -1 : 1;
      d = lateral
        .multiplyScalar(sign * 0.85)
        .addScaledVector(vec(axes.up), 0.33)
        .addScaledVector(vec(axes.forward), 0.42)
        .normalize();
      if (Math.abs(d.dot(up)) > 0.93) up.fromArray(axes.up);
    } else {
      const side = up.clone().cross(separation);
      if (side.lengthSq() < 0.001) side.set(0, -1, 0);
      side.normalize();
      d = side.addScaledVector(up, 0.45).addScaledVector(separation, 0.12).normalize();
    }
    const right = up.clone().cross(d).normalize(),
      vertical = d.clone().cross(right);
    const { camera, controls } = api,
      stage = api.stage.getBoundingClientRect();
    if (stage.width < 2 || stage.height < 2) return false;
    const w = stage.width,
      h = stage.height;
    let left = w * 0.045,
      top = h * 0.055,
      rightEdge = w * 0.955,
      bottom = h * 0.94;
    const crop = (element, kind) => {
      if (!element?.getBoundingClientRect) return;
      const b = element.getBoundingClientRect();
      if (
        b.width < 2 ||
        b.height < 2 ||
        b.right <= stage.left ||
        b.left >= stage.right ||
        b.bottom <= stage.top ||
        b.top >= stage.bottom
      )
        return;
      const x = b.left - stage.left,
        y = b.top - stage.top,
        margin = 10;
      if (kind === 'sidebar' && x <= 8 && b.width < w * 0.67 && b.height > h * 0.5) {
        left = Math.max(left, b.right - stage.left + margin);
        return;
      }
      if (kind === 'view') {
        if (b.width > w * 0.67 && y > h * 0.1) bottom = Math.min(bottom, y - margin);
        else if (x > w * 0.32) rightEdge = Math.min(rightEdge, x - margin);
        else if (y > h * 0.26) bottom = Math.min(bottom, y - margin);
      }
    };
    if (typeof document !== 'undefined') {
      crop(document.querySelector('aside'), 'sidebar');
      previewElement ??= document.getElementById('xuntianScope');
    }
    crop(previewElement, 'view');
    if (rightEdge - left < w * 0.22) {
      left = w * 0.045;
      rightEdge = w * 0.955;
    }
    if (bottom - top < h * 0.18) {
      top = h * 0.045;
      bottom = h * 0.94;
    }
    const kx = (left + rightEdge) / w - 1,
      ky = 1 - (top + bottom) / h,
      halfX = (rightEdge - left) / w,
      halfY = (bottom - top) / h;
    const tanV = Math.tan((38 * Math.PI) / 360),
      tanH = tanV * camera.aspect;
    let center, distance;
    if (closeUp) {
      center = craft;
      const radius = measured.radius * SCALE;
      // Fit the full rotation envelope, even when steering turns a wing edge-on
      // into a broadside. Use the available area beside the live instrument panel.
      distance = Math.max(
        15,
        radius * Math.hypot(1 / (tanH * halfX), 1 + Math.abs(kx) / halfX),
        radius * Math.hypot(1 / (tanV * halfY), 1 + Math.abs(ky) / halfY)
      );
    } else {
      const craftBox = new THREE.Box3().setFromObject(active);
      center = station.clone().union(craftBox).getCenter(new THREE.Vector3());
      distance = 15;
      const points = [];
      for (const shape of shapes)
        for (const corner of shape.corners)
          points.push(corner.clone().applyMatrix4(shape.anchor.matrixWorld));
      for (const x of [craftBox.min.x, craftBox.max.x])
        for (const y of [craftBox.min.y, craftBox.max.y])
          for (const z of [craftBox.min.z, craftBox.max.z]) points.push(new THREE.Vector3(x, y, z));
      for (const point of points) {
        point.sub(center);
        const depth = point.dot(d);
        distance = Math.max(
          distance,
          depth + Math.abs(point.dot(right) / tanH + kx * depth) / halfX,
          depth + Math.abs(point.dot(vertical) / tanV + ky * depth) / halfY
        );
      }
    }
    distance *= 1.045;
    const aim = center
      .clone()
      .addScaledVector(right, -kx * tanH * distance)
      .addScaledVector(vertical, -ky * tanV * distance);
    camera.up.copy(up);
    camera.fov = 38;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.maxDistance = Math.max(controls.maxDistance, distance * 1.05);
    controls.stopMotion();
    controls.target.copy(aim);
    camera.position.copy(aim).addScaledVector(d, distance);
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
    sim.cameraFocus?.adopt(closeUp ? 'xuntian' : 'all');
    return true;
  }
  function mapShapes() {
    const frame = dataFrame(sim.current);
    return shapes.map((entry) => {
      entry.anchor.updateWorldMatrix(true, false);
      return entry.corners.map((v) => {
        const world = v
          .clone()
          .applyMatrix4(entry.anchor.matrixWorld)
          .multiplyScalar(1 / SCALE)
          .toArray();
        return intoBasis(fromBasis(world, frame.scene), frame.orbital);
      });
    });
  }
  const formation = {
    update,
    refresh,
    frameBoth: (panel) => frameExternal(panel, false),
    frameTelescope: (panel) => frameExternal(panel, true),
    stationTarget,
    setOffset,
    restoreInitial,
    restoreSuggested,
    mapShapes,
    getState,
    getOffset: () => [...offset],
    getOptics: () =>
      disposed || !sim.current || sim.missionId !== 'tiangong' || !api.groups.freeXT?.visible
        ? null
        : last,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      disposed = true;
      listeners.clear();
      last = null;
      shapes = [];
      active = null;
      measured = null;
    },
  };
  sim.xuntianFormation = formation;
  refresh();
  return formation;
}
