import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Matrix3, Matrix4, Vector3, Vector4 } from 'three';
import {
  constellationArtDirection,
  constellationArtFade,
  constellationArtFrame,
  constellationArtMesh,
  selectConstellationArt,
} from '../src/constellation-art-math.js';

const root = new URL('../', import.meta.url),
  folder = new URL('assets/constellation-art/', root),
  manifest = JSON.parse(readFileSync(new URL('manifest.json', folder))),
  chart = JSON.parse(readFileSync(new URL('assets/star-chart.json', root))),
  stars = new Map(
    JSON.parse(readFileSync(new URL('assets/stars.json', root))).map((s) => [s[0], s])
  );
const hash = (data) => createHash('sha256').update(data).digest('hex');
const compare = (a, b, epsilon = 2e-12) =>
  a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) < epsilon, `${a} != ${b}`));

assert.equal(manifest.version, 1);
assert.equal(manifest.images.length, 85);
assert.equal(new Set(manifest.images.map((r) => r.imageId)).size, 85);
assert.equal(Object.keys(manifest.constellationImages).length, 88);
assert.deepEqual(
  Object.keys(manifest.constellationImages).sort(),
  chart.constellations.map((c) => c.id).sort()
);
assert.equal(manifest.source.commit, 'daace2add6a1bf886e8ee1934f51e9c69f818d18');
assert.equal(
  manifest.source.starCoordinatesSha256,
  hash(readFileSync(new URL('assets/stars.json', root)))
);
assert.match(manifest.source.artLicense, /Free Art License/);
assert.equal(manifest.source.dataLicense, 'CC BY-SA 4.0');
assert.equal(manifest.constellationImages.Car, manifest.constellationImages.Pup);
assert.equal(manifest.constellationImages.Car, manifest.constellationImages.Vel);
assert.equal(manifest.constellationImages.Oph, manifest.constellationImages.Ser);
assert.match(
  readFileSync(new URL('LICENSE-FAL-1.3.html', folder), 'utf8'),
  /INCORPORATION OF THE WORK/
);
assert.match(
  readFileSync(new URL('LICENSE-CC-BY-SA-4.0.txt', folder), 'utf8'),
  /Attribution-ShareAlike 4.0/
);
assert.ok(
  readdirSync(folder).reduce((total, file) => total + statSync(new URL(file, folder)).size, 0) <
    2 * 1024 * 1024
);

// Independent 4x4 oracle of Stellarium's documented construction. Its fourth
// anchor is displaced along the plane normal, not a guessed image corner.
function reference(record, u, v) {
  const [width, height] = record.size;
  const positions = record.anchors.map((a) => new Vector4(a.pos[0], height - a.pos[1], 0, 1));
  positions.push(new Vector4(positions[0].x, positions[0].y, width, 1));
  const sky = record.anchors.map((a) => new Vector3(...a.direction));
  const normal = sky[1].clone().sub(sky[0]).cross(sky[2].clone().sub(sky[0]));
  sky.push(sky[0].clone().add(normal));
  const a = new Matrix4().fromArray(positions.flatMap((p) => p.toArray()));
  const b = new Matrix4().fromArray(sky.flatMap((p) => [...p.toArray(), 1]));
  const p = new Vector4(u * width, (1 - v) * height, 0, 1).applyMatrix4(b.multiply(a.invert()));
  return new Vector3(p.x, p.y, p.z).normalize().toArray();
}

const frames = manifest.images.map(constellationArtFrame);
let anchorCount = 0;
for (const frame of frames) {
  const r = frame.record;
  assert.equal(frame.id, r.imageId);
  const data = readFileSync(new URL(r.file, root));
  assert.equal(data.length, r.bytes);
  assert.equal(hash(data), r.sha256);
  assert.match(r.sourceSha256, /^[0-9a-f]{64}$/);
  assert.equal(data.subarray(4, 8).toString(), 'ftyp');
  assert.equal(data.subarray(8, 12).toString(), 'avif');
  assert.deepEqual([r.width, r.height], r.size);
  assert.ok([128, 256, 512].includes(r.width));
  assert.equal(r.alpha, 'source luminance');
  assert.ok(r.validation.alphaMeanAbsoluteError < 0.7);
  assert.ok(r.validation.faintMeanAbsoluteError < 1.5);
  assert.deepEqual(
    r.constellationIds.slice().sort(),
    Object.keys(manifest.constellationImages)
      .filter((id) => manifest.constellationImages[id] === r.imageId)
      .sort()
  );
  for (const anchor of r.anchors) {
    const [, ra, dec] = stars.get(anchor.hip),
      a = (ra * Math.PI) / 180,
      d = (dec * Math.PI) / 180;
    assert.equal(anchor.ra, ra);
    assert.equal(anchor.dec, dec);
    compare(anchor.direction, [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]);
    compare(
      constellationArtDirection(frame, anchor.pos[0] / r.width, anchor.pos[1] / r.height),
      anchor.direction
    );
    anchorCount++;
  }
  for (const [u, v] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0.5, 0.5],
    [0.13, 0.81],
  ]) {
    compare(constellationArtDirection(frame, u, v), reference(r, u, v));
  }
  const mesh = constellationArtMesh(frame);
  assert.equal(mesh.positions.length, 17 * 17 * 3);
  assert.equal(mesh.indices.length, 16 * 16 * 6);
  assert.ok(mesh.indices.every((i) => i < 17 * 17));
  compare([...mesh.uv.subarray(0, 2)], [0, 1]);
  compare([...mesh.uv.subarray(-2)], [1, 0]);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    assert.ok(Math.abs(Math.hypot(...mesh.positions.subarray(i, i + 3)) - 1) < 6e-8);
  }
  // Ray/triangle intersection validates the actual tessellated texture, not
  // just the exact affine function. The HIP star stays within half a source
  // texel of its anchor with the default 16-segment mesh.
  for (const anchor of r.anchors) {
    const u = anchor.pos[0] / r.width,
      v = anchor.pos[1] / r.height,
      x = Math.min(15, Math.floor(u * 16)),
      y = Math.min(15, Math.floor(v * 16));
    const vertices =
      u * 16 - x + v * 16 - y <= 1
        ? [y * 17 + x, y * 17 + x + 1, (y + 1) * 17 + x]
        : [y * 17 + x + 1, (y + 1) * 17 + x + 1, (y + 1) * 17 + x];
    const directions = vertices.map((i) => [...mesh.positions.subarray(i * 3, i * 3 + 3)]);
    const inverse = new Matrix3()
      .set(...[0, 1, 2].flatMap((i) => directions.map((d) => d[i])))
      .invert();
    const weights = new Vector3(...anchor.direction).applyMatrix3(inverse).toArray(),
      sum = weights.reduce((a, b) => a + b, 0);
    const actual = [0, 1].map((axis) =>
      vertices.reduce(
        (total, index, i) => total + (mesh.uv[index * 2 + axis] * weights[i]) / sum,
        0
      )
    );
    assert.ok(Math.hypot((actual[0] - u) * r.width, (1 - actual[1] - v) * r.height) < 0.5);
  }
}
assert.equal(anchorCount, 255);
const byId = new Map(frames.map((frame) => [frame.id, frame]));
assert.deepEqual(
  byId.get('perseus').record.anchors.map((a) => [a.pos, a.hip]),
  [
    [[164, 323], 18532],
    [[299, 175], 15863],
    [[385, 386], 13254],
  ]
);
assert.deepEqual(
  byId.get('cygnus').record.anchors.map((a) => [a.pos, a.hip]),
  [
    [[7, 382], 107310],
    [[474, 46], 94779],
    [[467, 453], 95947],
  ]
);

function viewAt(forward, fovY = 0.006, aspect = 1.6) {
  const f = new Vector3(...forward).normalize(),
    referenceUp = Math.abs(f.z) > 0.99 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1),
    right = f.clone().cross(referenceUp).normalize(),
    up = right.clone().cross(f).normalize();
  return { forward: f.toArray(), right: right.toArray(), up: up.toArray(), fovY, aspect };
}
// Aiming inside a picture must retain it even when its center is well outside
// a very narrow field. Includes the RA0 seam (Pisces) and polar Ursa Minor.
for (const frame of frames) {
  for (const [u, v] of [
    [0, 0],
    [1, 1],
    [0.5, 0.5],
    [0.1, 0.9],
  ]) {
    const selected = selectConstellationArt(frames, viewAt(constellationArtDirection(frame, u, v)));
    assert.ok(selected.includes(frame), frame.id + ' culled while aiming inside its image');
    assert.equal(new Set(selected.map((f) => f.id)).size, selected.length);
  }
  if (frame.radiusRad < Math.PI / 2) {
    const opposite = viewAt(frame.center.map((x) => -x));
    assert.equal(selectConstellationArt([frame], opposite).length, 0);
  }
}
const cygnus = byId.get('cygnus');
assert.equal(selectConstellationArt([cygnus, cygnus], viewAt(cygnus.center)).length, 1);
assert.deepEqual(selectConstellationArt(frames, null), []);
assert.equal(constellationArtFade(0.006), 0);
assert.equal(constellationArtFade(1), 0);
assert.equal(constellationArtFade(2), 0.5);
assert.equal(constellationArtFade(3), 1);
assert.equal(constellationArtFade(120), 1);
assert.throws(
  () =>
    constellationArtFrame({ ...cygnus.record, anchors: Array(3).fill(cygnus.record.anchors[0]) }),
  /collinear/
);
assert.throws(() => constellationArtMesh(cygnus, 0), /segments/);
console.log(
  `Constellation art: 85 images / 88 IDs / 255 HIP anchors, 4x4 reference geometry, seam/polar culling and <2 MiB package verified.`
);
