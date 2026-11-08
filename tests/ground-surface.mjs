import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  sampleGroundGrid,
  groundTilePlan,
  groundDestination,
  buildGroundPatch,
  createGroundSurface,
} from '../src/ground-world-surface.js';

const grid = {
  bounds: [-1, -1, 1, 1],
  gridSize: 2,
  heights: new Float32Array([100, 200, 300, 400]),
};
assert.equal(sampleGroundGrid(grid, 1, -1), 100);
assert.equal(sampleGroundGrid(grid, 0, 0), 250);
assert.equal(sampleGroundGrid(grid, 0, 360), 250);
assert.equal(sampleGroundGrid(grid, 5, 0), null);
assert.equal(
  sampleGroundGrid({ ...grid, heights: new Float32Array([NaN, 200, 300, 400]) }, 1, 1),
  200
);
assert.equal(
  sampleGroundGrid({ ...grid, heights: new Float32Array([NaN, 200, 300, 400]) }, 0.9, -0.9),
  null
);
for (const site of [
  { latitude: 0, longitude: 179.999 },
  { latitude: 89.999, longitude: 0 },
  { latitude: -89.999, longitude: -180 },
  { latitude: 39.9, longitude: 116.4 },
]) {
  const plan = groundTilePlan(site);
  assert.ok(plan.length <= 18 && plan.length >= 12);
  assert.equal(new Set(plan.map((t) => t.key)).size, plan.length);
  assert.ok(
    plan.every(
      (t) => t.bounds[0] >= -180 && t.bounds[2] <= 180 && t.bounds[1] >= -90 && t.bounds[3] <= 90
    )
  );
  const dest = groundDestination(site, 5000, 3000);
  assert.ok(Number.isFinite(dest.latitude + dest.longitude));
  assert.ok(Math.abs(dest.longitude) <= 180);
  const p = buildGroundPatch(site, () => 120, { segments: 8, halfSize: 2000 });
  assert.equal(p.positions.length, 9 * 9 * 3);
  assert.ok(p.positions.every(Number.isFinite));
  assert.ok(Math.abs(p.positions[(4 * 9 + 4) * 3 + 2] - 120) < 0.001);
  // Curved WGS84 ground drops below its tangent plane away from the observer.
  assert.ok(p.positions[2] < 120 - 0.3);
  const i = p.indices;
  const a = new THREE.Vector3(...p.positions.slice(i[0] * 3, i[0] * 3 + 3));
  const b = new THREE.Vector3(...p.positions.slice(i[1] * 3, i[1] * 3 + 3));
  const c = new THREE.Vector3(...p.positions.slice(i[2] * 3, i[2] * 3 + 3));
  assert.ok(b.sub(a).cross(c.sub(a)).z > 0);
}
// Independent stable terrain data: existing manager display heights/fades are irrelevant.
const environment = {
  elevation: {
    base: {
      nodeHeights: new Float32Array(15).fill(120),
      bounds: [-180, -90, 180, 90],
      columns: 4,
      rows: 2,
    },
    heightAt: () => -99999,
    entries: new Map(),
  },
};
const scene = new THREE.Scene();
let calls = 0,
  closed = false;
const source = {
  async tile(tile, signal) {
    calls++;
    await new Promise((r) => setTimeout(r, 1));
    signal.throwIfAborted();
    return { heights: new Float32Array(129 * 129).fill(140) };
  },
  close() {
    closed = true;
  },
};
const surface = createGroundSurface({ environment, scene, source });
const site = { latitude: 39.9, longitude: 116.4, height: 121.7 };
surface.update(site, 0);
assert.ok(Math.abs(surface.heightAt(site.latitude, site.longitude) - 120) < 0.001);
assert.equal(surface.status().baseReady, true);
assert.ok(surface.status().pending <= 2);
await new Promise((r) => setTimeout(r, 100));
assert.ok(calls <= 18);
assert.ok(surface.status().tiles <= 18);
assert.ok(surface.status().detailed);
// Source arrival cannot silently change existing contact until its stable mesh is rebuilt.
assert.ok(Math.abs(surface.heightAt(site.latitude, site.longitude) - 120) < 0.001);
surface.dispose();
assert.equal(scene.children.length, 0);
assert.equal(closed, true);
console.log(
  'ground surface: DEM interpolation, dateline/poles, WGS84 curvature, bounded loading and lifecycle passed'
);
