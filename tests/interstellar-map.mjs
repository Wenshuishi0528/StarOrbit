import assert from 'node:assert/strict';
import {
  galacticVector,
  mapProjection,
  clampMapRadius,
  fittedMapRadius,
  nearestMapHit,
  mapHitCandidates,
  createMapTrail,
} from '../src/interstellar-map-math.js';
import { AU_LY, stellarPosition } from '../src/interstellar-math.js';

// Independent known sky directions: north Galactic pole and l=0 direction.
const pole = stellarPosition(192.85948, 27.12825, 1000);
const north = galacticVector(pole);
assert(Math.hypot(north[0], north[1]) < 1e-6);
assert(north[2] > 3.26);
const gc = galacticVector(stellarPosition(266.4051, -28.936175, 1000));
assert(gc[0] > 3.26 && Math.hypot(gc[1], gc[2]) < 0.0001);
for (const v of [
  [1, 2, 3],
  [-8, 2, -4],
  [1e7, 1e-7, 1],
]) {
  const g = galacticVector(v);
  assert(
    Math.abs(Math.hypot(...g) / Math.hypot(...v) - 1) < 1e-9,
    'rotation preserves physical distances'
  );
  for (const yaw of [0, 1, 4])
    for (const pitch of [-1, 0, 0.7])
      assert(
        Math.abs(Math.hypot(...mapProjection(g, '3d', false, yaw, pitch)) / Math.hypot(...g) - 1) <
          1e-12
      );
}
assert.deepEqual(mapProjection([1, 2, 3], '2d'), [1, 2, 3]);
assert.deepEqual(mapProjection([1, 2, 3], '2d', true), [1, 3, -2]);
assert.equal(clampMapRadius(0), AU_LY);
assert.equal(clampMapRadius(Infinity), 20);
assert.equal(fittedMapRadius([3, 4, 0], [[0, 0, 0]]), 6);
assert.equal(
  nearestMapHit(
    [
      { x: 10, y: 10, index: 1 },
      { x: 40, y: 10, index: 2 },
    ],
    39,
    10
  ).index,
  2
);
assert.equal(nearestMapHit([{ x: 10, y: 10 }], 100, 100), null);
const trail = createMapTrail(512);
for (let i = 0; i < 2000; i++) trail.update([i, 0, 0], 0.1, 20);
assert.equal(trail.points.length, 512);
const last = trail.points.at(-1);
trail.update(last, 0.1, 20);
assert.equal(trail.points.length, 512);
trail.reset();
trail.update([1e6, 0, 0], 0.1, 20);
assert.deepEqual(trail.points, [[1e6, 0, 0]], 'teleports do not join unrelated paths');
console.log(
  'Navigation map: reference axes, 3D distance preservation, projections, range, picking and bounded/reset trail passed'
);

const overlap = mapHitCandidates(
  [
    { x: 4, y: 4, index: 1, kind: 'star' },
    { x: 4, y: 4, index: 1, kind: 'star' },
    { x: 4, y: 4, index: 0, kind: 'bookmark' },
  ],
  4,
  4
);
assert.equal(
  overlap.length,
  2,
  'coincident star/waypoint remain separately selectable, duplicate star draw is deduplicated'
);
