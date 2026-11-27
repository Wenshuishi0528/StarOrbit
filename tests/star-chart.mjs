import assert from 'node:assert/strict';
import { sphereHidesDirection, placeSkyLabels } from '../src/star-chart-math.js';
assert.equal(sphereHidesDirection([0, 0, -1], [0, 0, -6771], 6371), true);
assert.equal(sphereHidesDirection([0, 0, 1], [0, 0, -6771], 6371), false);
assert.equal(sphereHidesDirection([1, 0, 0], [0, 0, -6771], 6371), false);
const candidates = Array.from({ length: 400 }, (_, i) => ({
  key: String(i),
  x: 15 + (i % 20) * 39,
  y: 15 + Math.floor(i / 20) * 29,
  w: 42,
  h: 20,
}));
for (const density of [0, 0.55, 1]) {
  const placed = placeSkyLabels(candidates, 800, 600, density);
  assert.ok(placed.length <= 96 && placed.length > 0);
  for (const p of placed) {
    assert.ok(
      p.rect.x >= 5 && p.rect.y >= 5 && p.rect.x + p.rect.w <= 795 && p.rect.y + p.rect.h <= 595
    );
    for (const other of placed)
      if (p !== other)
        assert.ok(
          p.rect.x >= other.rect.x + other.rect.w ||
            p.rect.x + p.rect.w <= other.rect.x ||
            p.rect.y >= other.rect.y + other.rect.h ||
            p.rect.y + p.rect.h <= other.rect.y
        );
  }
}
const crowded = placeSkyLabels(
  [
    { key: 'bright', x: 100, y: 100, w: 60, h: 24 },
    { key: 'faint', x: 100, y: 100, w: 60, h: 24 },
  ],
  200,
  200,
  0.55
);
assert.equal(crowded[0].key, 'bright');
assert.ok(crowded.length <= 2);
console.log(
  'Sky label occlusion, on-screen placement, priorities, overlap and density budget: passed'
);

// Keep the margin between labels and reserved symbols even across a 64px
// grid boundary, including symbols centered just outside the finder.
const centered = (x, y) => [{ key: 'target', x, y, w: 10, h: 10, centered: true }];
const marker = { x: 64, y: 27, w: 4, h: 4 };
assert.equal(placeSkyLabels(centered(57, 30), 180, 90, 1, [marker]).length, 0);
assert.equal(placeSkyLabels(centered(54, 30), 180, 90, 1, [marker]).length, 1);
assert.equal(
  placeSkyLabels(centered(13, 30), 180, 90, 1, [{ x: -2, y: 29, w: 7, h: 3 }]).length,
  0
);
