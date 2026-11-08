import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Ray, Texture, Triangle, Vector3 } from 'three';
import { ConstellationArt, ART_GPU_BUDGET } from '../src/constellation-art.js';
import { ConstellationArtLayer } from '../src/constellation-art-layer.js';
import {
  constellationArtDirection,
  constellationArtFrame,
  constellationArtMesh,
  constellationArtPixelDirection,
  constellationOverviewFade,
  selectConstellationArt,
} from '../src/constellation-art-math.js';

const manifest = JSON.parse(
  readFileSync(new URL('../assets/constellation-art/manifest.json', import.meta.url))
);
const cygnus = manifest.images.find((record) => record.imageId === 'cygnus');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'artwork asynchronous work did not settle');
    await turn();
  }
}
function view(frame) {
  const forward = new Vector3(...frame.center),
    right = forward
      .clone()
      .cross(new Vector3(0, 0, 1))
      .normalize(),
    up = right.clone().cross(forward).normalize();
  return {
    forward: forward.toArray(),
    right: right.toArray(),
    up: up.toArray(),
    fovY: 25,
    aspect: 1.6,
  };
}
function resource() {
  const result = { disposed: 0, closed: 0 };
  result.texture = new Texture();
  result.texture.addEventListener('dispose', () => result.disposed++);
  result.image = {
    close() {
      result.closed++;
    },
  };
  return result;
}
function harness(images = [cygnus]) {
  const manager = new ConstellationArt({ images }),
    calls = [];
  manager.load = (frame, signal) => {
    const job = { ...deferred(), frame, signal };
    calls.push(job);
    return job.promise;
  };
  return { manager, calls, input: view(manager.frames[0]) };
}

test('late artwork decode is closed after disable and replaced on re-enable', async () => {
  const { manager, calls, input } = harness();
  try {
    manager.update('main', input, true);
    manager.update('main', input, false);
    manager.update('main', input, true);
    assert.equal(calls[0].signal.aborted, true);
    const stale = resource();
    calls[0].resolve(stale);
    await until(() => calls.length === 2);
    assert.equal(stale.closed, 1);
    assert.equal(stale.disposed, 1);
    assert.equal(manager.entries.size, 0);
    const current = resource();
    calls[1].resolve(current);
    await until(() => manager.status('main').complete);
    assert.equal(manager.ready('main')[0].texture, current.texture);
    manager.release('main');
    assert.equal(current.closed, 1);
    assert.equal(current.disposed, 1);
    assert.equal(manager.status('main').gpuBytes, 0);
  } finally {
    manager.dispose();
  }
});

test('dispose prevents an in-flight decode from reviving GPU resources', async () => {
  const { manager, calls, input } = harness();
  manager.update('scope', input, true, 2);
  manager.dispose();
  assert.equal(calls[0].signal.aborted, true);
  const late = resource();
  calls[0].resolve(late);
  await until(() => manager.loads.size === 0);
  assert.equal(late.closed, 1);
  assert.equal(late.disposed, 1);
  assert.equal(manager.entries.size, 0);
  assert.equal(manager.views.size, 0);
});

test('main, preview and photograph share a single bounded texture pool', async () => {
  const images = Array.from({ length: 24 }, (_, i) => ({ ...cygnus, imageId: 'image-' + i }));
  const manager = new ConstellationArt({ images }),
    input = view(manager.frames[0]),
    resources = [];
  let active = 0,
    peak = 0;
  manager.load = async () => {
    active++;
    peak = Math.max(peak, active);
    await turn();
    active--;
    const item = resource();
    resources.push(item);
    return item;
  };
  try {
    manager.update('main', input, true, 1);
    manager.update('scope', input, true, 2);
    const status = await manager.prepare('photo', input, true);
    assert.equal(status.complete, true);
    assert.ok(status.requested > 1 && status.requested < images.length);
    assert.ok(status.gpuBytes <= ART_GPU_BUDGET);
    assert.ok(peak <= 2);
    assert.equal(resources.length, status.ready, 'three consumers must not decode three copies');
    for (const id of ['main', 'scope', 'photo']) {
      assert.deepEqual(
        manager.ready(id).map((e) => e.texture),
        resources.map((e) => e.texture)
      );
      assert.ok(manager.ready(id).every((e) => performance.now() - e.born >= 300));
    }
    manager.release('photo');
    manager.release('scope');
    assert.equal(resources.filter((r) => r.closed).length, 0);
    manager.release('main');
    assert.ok(resources.every((r) => r.closed === 1 && r.disposed === 1));
    assert.equal(manager.status('main').gpuBytes, 0);
  } finally {
    manager.dispose();
  }
});

test('layer geometry is private while a borrowed texture survives another layer closing', async () => {
  const { manager, calls, input } = harness(),
    main = new ConstellationArtLayer(manager, 'main'),
    scope = new ConstellationArtLayer(manager, 'scope', true, 2);
  try {
    main.update(input, true);
    scope.update(input, true);
    const shared = resource();
    calls[0].resolve(shared);
    await until(() => manager.status('scope').complete);
    main.update(input, true);
    scope.update(input, true);
    const a = [...main.meshes.values()][0],
      b = [...scope.meshes.values()][0];
    assert.notEqual(a.geometry, b.geometry);
    assert.notEqual(a.material, b.material);
    assert.equal(a.material.uniforms.artMap.value, b.material.uniforms.artMap.value);
    for (const [key, expected] of [
      ['right', [1, 0, 0]],
      ['up', [0, 1, 0]],
      ['forward', [0, 0, 1]],
    ]) {
      const actual = new Vector3(...input[key])
        .applyMatrix3(scope.uniforms.inertialToCamera.value)
        .toArray();
      assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) < 1e-12));
    }
    let geometryDisposed = 0,
      materialDisposed = 0;
    b.geometry.addEventListener('dispose', () => geometryDisposed++);
    b.material.addEventListener('dispose', () => materialDisposed++);
    scope.dispose();
    assert.equal(geometryDisposed, 1);
    assert.equal(materialDisposed, 1);
    assert.equal(shared.disposed, 0);
    main.dispose();
    assert.equal(shared.disposed, 1);
    assert.equal(shared.closed, 1);
  } finally {
    main.dispose();
    scope.dispose();
    manager.dispose();
  }
});

test('a transient fetch failure retries even when the visible camera stays fixed', async () => {
  const manager = new ConstellationArt({ images: [cygnus] }),
    input = view(manager.frames[0]),
    timeout = globalThis.setTimeout,
    clock = performance.now.bind(performance),
    clockDescriptor = Object.getOwnPropertyDescriptor(performance, 'now');
  let offset = 0,
    calls = 0;
  const loaded = resource();
  try {
    // Exercise the real retry scheduling without a ten-second test delay.
    globalThis.setTimeout = (callback, ms, ...args) => timeout(callback, Math.min(ms, 10), ...args);
    Object.defineProperty(performance, 'now', {
      configurable: true,
      value: () => clock() + offset,
    });
    manager.load = async () => {
      calls++;
      if (calls === 1) throw Error('temporary fetch failure');
      return loaded;
    };
    manager.update('main', input, true);
    await until(() => manager.failures.size > 0);
    offset = 11000;
    await until(() => manager.status('main').complete);
    assert.equal(calls, 2);
    assert.equal(manager.ready('main')[0].texture, loaded.texture);
  } finally {
    manager.dispose();
    globalThis.setTimeout = timeout;
    if (clockDescriptor) Object.defineProperty(performance, 'now', clockDescriptor);
    else delete performance.now;
  }
});

const direction = (x, y) => new Vector3(1, x, y).normalize().toArray();
function meshRecord() {
  return {
    imageId: 'mesh-fixture',
    width: 640,
    height: 320,
    size: [640, 320],
    anchors: [],
    mesh: {
      positions: [
        direction(-0.2, 0.1),
        direction(0.2, 0.1),
        direction(-0.2, -0.1),
        direction(0.2, -0.1),
      ].flat(),
      uv: [0, 1, 1, 1, 0, 0, 1, 0],
      indices: [0, 1, 2, 1, 3, 2],
    },
  };
}

test('registered mesh dispatches source pixels independently of legacy three-anchor fitting', () => {
  const record = meshRecord(),
    frame = constellationArtFrame(record),
    geometry = constellationArtMesh(frame),
    second = constellationArtMesh(frame);
  assert.ok(geometry.positions instanceof Float32Array);
  assert.ok(geometry.uv instanceof Float32Array);
  assert.ok(geometry.indices instanceof Uint16Array);
  assert.notEqual(geometry.positions, second.positions, 'each view owns its geometry arrays');
  assert.deepEqual(constellationArtPixelDirection(frame, 320, 160), [1, 0, 0]);
  assert.deepEqual(constellationArtDirection(frame, 0.5, 0.5), [1, 0, 0]);
  assert.ok(
    new Vector3(...constellationArtPixelDirection(frame, 0, 0)).angleTo(
      new Vector3(...record.mesh.positions.slice(0, 3))
    ) < 1e-7
  );
  assert.throws(() => constellationArtPixelDirection(frame, -10, 0), /outside/);
});

test('registered mesh rejects illegal indices, collapsed triangles and local projection folds', () => {
  for (const value of [-1, 4, 0.5]) {
    const record = meshRecord();
    record.mesh.indices[0] = value;
    assert.throws(() => constellationArtFrame(record), /indices/);
  }
  const collapsed = meshRecord();
  collapsed.mesh.uv.splice(2, 2, 0, 1);
  assert.throws(() => constellationArtFrame(collapsed), /Degenerate/);
  const folded = meshRecord();
  folded.mesh.positions.splice(9, 3, ...folded.mesh.positions.slice(0, 3));
  assert.throws(() => constellationArtFrame(folded), /Folded/);
  const scaled = meshRecord();
  scaled.mesh.positions[0] *= 2;
  assert.throws(() => constellationArtFrame(scaled), /unit directions/);
  const mixedWinding = meshRecord();
  mixedWinding.mesh.indices.splice(3, 3, 1, 2, 3);
  assert.throws(() => constellationArtFrame(mixedWinding), /Folded/);
});

test('registered mesh culling bounds every vertex including a curved boundary outside its corners', () => {
  const frame = constellationArtFrame({
    imageId: 'curved-boundary',
    width: 400,
    height: 400,
    size: [400, 400],
    mesh: {
      positions: [
        direction(-0.1, -0.1),
        direction(0.1, -0.1),
        direction(0.1, 0.1),
        direction(0, 0.5),
        direction(-0.1, 0.1),
      ].flat(),
      uv: [0, 0, 1, 0, 1, 1, 0.5, 1, 0, 1],
      indices: [0, 1, 3, 1, 2, 3, 0, 3, 4],
    },
  });
  const tip = direction(0, 0.5),
    smallView = view({ center: tip });
  smallView.fovY = 0.05;
  assert.ok(selectConstellationArt([frame], smallView).includes(frame));
  for (const vertex of frame.corners)
    assert.ok(
      new Vector3(...vertex).angleTo(new Vector3(...frame.center)) <= frame.radiusRad + 1e-7
    );
});

function chineseArt() {
  return JSON.parse(
    readFileSync(new URL('../assets/chinese-sky/art/manifest.json', import.meta.url))
  );
}
function physicalHipDirection(hip) {
  const row = JSON.parse(readFileSync(new URL('../assets/stars.json', import.meta.url))).find(
      (r) => r[0] === hip
    ),
    ra = (row[1] * Math.PI) / 180,
    dec = (row[2] * Math.PI) / 180;
  return new Vector3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
}
function angleDegrees(a, b) {
  return (Math.atan2(a.clone().cross(b).length(), a.dot(b)) * 180) / Math.PI;
}
function patchPixelFromOriginal(record, sourcePixel) {
  const [left, top, right, bottom] = record.registration.sourceBox;
  return [
    ((sourcePixel[0] - left) / (right - left)) * record.size[0],
    ((sourcePixel[1] - top) / (bottom - top)) * record.size[1],
  ];
}

test('original Northern Dipper retains its silhouette and locks bowl-centre to handle-tip direction', () => {
  const record = chineseArt().images.find((image) => image.imageId === 'northern-dipper'),
    hips = [53910, 54061, 58001, 59774, 62956, 65378, 67301],
    points = record?.registration?.landmarks || [];
  assert.equal(
    record.original,
    'northern-dipper.png',
    'keep the user-selected original gold line drawing'
  );
  assert.deepEqual(record.registration.sourcePixelSize, [1983, 793]);
  assert.deepEqual(
    points.map((point) => point.hip).sort((a, b) => a - b),
    hips
  );
  assert.equal(record.registration.method, 'uniform-similarity-gnomonic');
  assert.equal(record.registration.diagnostics.shapePreserved, true);
  assert.equal(record.registration.diagnostics.individualStarsPinned, false);
  const frame = constellationArtFrame(record),
    mesh = constellationArtMesh(frame),
    placement = record.registration.placement,
    bowlDirection = [54061, 53910, 58001, 59774]
      .reduce((sum, hip) => sum.add(physicalHipDirection(hip)), new Vector3())
      .normalize(),
    handleDirection = physicalHipDirection(67301);
  for (const [pixel, target] of [
    [placement.sourceOrigin, bowlDirection],
    [placement.sourceAxisTip, handleDirection],
  ]) {
    const actual = new Vector3(
      ...constellationArtPixelDirection(frame, ...patchPixelFromOriginal(record, pixel))
    );
    assert.ok(
      angleDegrees(actual, target) < 0.00002,
      'overall centre/axis/scale must follow the declared real members'
    );
  }
  assert.ok(Math.abs(record.registration.diagnostics.maximumScaleRatio - 1) < 1e-10);
  const forward = new Vector3(...frame.center),
    right = forward
      .clone()
      .cross(new Vector3(0, 0, 1))
      .normalize(),
    up = right.clone().cross(forward).normalize(),
    ray = new Ray(new Vector3(), new Vector3()),
    triangle = new Triangle(),
    hit = new Vector3(),
    weights = new Vector3();
  let maximumResidual = 0;
  for (const point of points) {
    const star = physicalHipDirection(point.hip),
      placed = new Vector3(...point.direction),
      actual = new Vector3(...constellationArtPixelDirection(frame, ...point.pixel)),
      residual = angleDegrees(placed, star);
    maximumResidual = Math.max(maximumResidual, residual);
    assert.ok(angleDegrees(new Vector3(...point.targetDirection), star) < 1e-8);
    assert.ok(
      Math.abs(residual - point.angularResidualDegrees) < 1e-8,
      'disclose rather than conceal local star-to-drawing differences'
    );
    assert.ok(angleDegrees(actual, placed) < 0.00002);
    assert.ok(
      Number.isInteger(point.vertex) &&
        point.vertex >= 0 &&
        point.vertex < mesh.positions.length / 3
    );
    // Independently recover the GPU texture pixel on its actual placed ray.
    ray.direction.copy(placed);
    let sourceError = Infinity;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const indices = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
      triangle.a.fromArray(mesh.positions, indices[0] * 3);
      triangle.b.fromArray(mesh.positions, indices[1] * 3);
      triangle.c.fromArray(mesh.positions, indices[2] * 3);
      if (!ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)) continue;
      triangle.getBarycoord(hit, weights);
      const bary = weights.toArray(),
        u = indices.reduce((sum, index, j) => sum + mesh.uv[index * 2] * bary[j], 0),
        v = indices.reduce((sum, index, j) => sum + mesh.uv[index * 2 + 1] * bary[j], 0);
      sourceError = Math.min(
        sourceError,
        Math.hypot(u * record.size[0] - point.pixel[0], (1 - v) * record.size[1] - point.pixel[1])
      );
    }
    assert.ok(
      sourceError < 0.02,
      point.physicalId + ' GPU texture and source-pixel query must agree'
    );
    for (const [width, height, fov, roll] of [
      [1440, 1000, 38, 0],
      [390, 260, 8, 90],
      [3840, 2160, 55, 137],
    ]) {
      const r = right.clone().applyAxisAngle(forward, (roll * Math.PI) / 180),
        v = up.clone().applyAxisAngle(forward, (roll * Math.PI) / 180),
        t = Math.tan((fov * Math.PI) / 360),
        project = (d) => [
          width / 2 + ((d.dot(r) / d.dot(forward) / ((t * width) / height)) * width) / 2,
          height / 2 - ((d.dot(v) / d.dot(forward) / t) * height) / 2,
        ],
        expectedPixel = project(placed),
        renderedPixel = project(actual);
      assert.ok(
        Math.hypot(renderedPixel[0] - expectedPixel[0], renderedPixel[1] - expectedPixel[1]) < 0.05,
        'the same source feature must stay fixed under view rotation, zoom and 4K photography'
      );
    }
  }
  assert.ok(
    Math.abs(maximumResidual - record.registration.diagnostics.maximumLandmarkResidualDegrees) <
      1e-8
  );
});

test('original eight illustrations share one equal-scale gnomonic mapping across every patch', () => {
  const originals = [
      'azure-dragon',
      'white-tiger',
      'vermilion-bird',
      'black-tortoise',
      'northern-dipper',
      'weaving-maiden',
      'river-drum',
      'celestial-wolf',
    ],
    manifest = chineseArt();
  for (const name of originals) {
    const records = manifest.images.filter((record) => record.original === name + '.png');
    assert.ok(records.length, name + ' retains the original bitmap');
    for (const record of records) {
      assert.ok(record.mesh);
      const frame = constellationArtFrame(record),
        p = record.registration.placement,
        center = new Vector3(...p.center),
        east = new Vector3(...p.east),
        north = new Vector3(...p.north),
        [left, top, right, bottom] = record.registration.sourceBox,
        rotation = p.orthogonalMatrix,
        scale = p.uniformScalePerSourcePixel;
      assert.equal(record.registration.diagnostics.flippedTriangles, 0);
      assert.equal(record.registration.diagnostics.foldedJacobianSamples, 0);
      assert.ok(Math.abs(record.registration.diagnostics.maximumScaleRatio - 1) < 1e-10);
      assert.ok(
        Math.abs(rotation[0][0] * rotation[1][0] + rotation[0][1] * rotation[1][1]) < 1e-10
      );
      assert.ok(Math.abs(Math.hypot(...rotation[0]) - 1) < 1e-10);
      assert.ok(Math.abs(Math.hypot(...rotation[1]) - 1) < 1e-10);
      for (let i = 0; i < record.mesh.positions.length / 3; i++) {
        const direction = new Vector3(...record.mesh.positions.slice(i * 3, i * 3 + 3)),
          pixel = [
            left + record.mesh.uv[i * 2] * (right - left),
            top + (1 - record.mesh.uv[i * 2 + 1]) * (bottom - top),
          ],
          dx = pixel[0] - p.sourceOrigin[0],
          dy = pixel[1] - p.sourceOrigin[1],
          expected = [
            p.targetOriginPlane[0] + (dx * rotation[0][0] + dy * rotation[1][0]) * scale,
            p.targetOriginPlane[1] + (dx * rotation[0][1] + dy * rotation[1][1]) * scale,
          ],
          actual = [
            direction.dot(east) / direction.dot(center),
            direction.dot(north) / direction.dot(center),
          ];
        assert.ok(
          Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 2e-9,
          name + ' must have no local warp, shear or patch-dependent transform'
        );
      }
      for (const point of record.registration.landmarks) {
        const actual = new Vector3(...constellationArtPixelDirection(frame, ...point.pixel));
        assert.ok(angleDegrees(actual, new Vector3(...point.direction)) < 0.0001);
        assert.equal(point.correspondence, 'approximate-overall-placement');
      }
    }
  }
});

test('single-star artwork declares visual orientation and keeps its sole real star separate', () => {
  const record = chineseArt().images.find((image) => image.imageId === 'celestial-wolf'),
    point = record.registration.landmarks[0];
  assert.deepEqual(
    record.registration.landmarks.map((p) => p.hip),
    [32349]
  );
  assert.equal(record.anchors.length, 1, 'do not invent three true-star anchors');
  assert.equal(record.registration.virtualGuides.length, 2);
  assert.ok(
    record.registration.virtualGuides.every(
      (p) => p.virtual && p.notAstronomicalAnchor && !p.hip && !p.physicalId
    )
  );
  assert.ok(angleDegrees(new Vector3(...point.direction), physicalHipDirection(32349)) < 1e-8);
});

test('gnomonic triangle interiors preserve analytic source pixels through rolled 4K camera projections', () => {
  const records = chineseArt().images.filter((r) => r.kind === 'symbols');
  let checked = 0;
  for (const record of records) {
    const frame = constellationArtFrame(record),
      mesh = constellationArtMesh(frame),
      p = record.registration.placement,
      normal = new Vector3(...mesh.planeNormal),
      east = new Vector3(...p.east),
      north = new Vector3(...p.north),
      [left, top, right, bottom] = record.registration.sourceBox,
      ray = new Ray(new Vector3(), new Vector3()),
      triangle = new Triangle(),
      hit = new Vector3(),
      barycentric = new Vector3();
    assert.ok(mesh.planeNormal, 'rigid sheets must declare the homogeneous plane');
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const indices = [...mesh.indices.slice(i, i + 3)],
        weights = [0.2, 0.3, 0.5],
        u = indices.reduce((sum, id, j) => sum + mesh.uv[id * 2] * weights[j], 0),
        v = indices.reduce((sum, id, j) => sum + mesh.uv[id * 2 + 1] * weights[j], 0),
        x = left + u * (right - left),
        y = top + (1 - v) * (bottom - top),
        dx = x - p.sourceOrigin[0],
        dy = y - p.sourceOrigin[1],
        px =
          p.targetOriginPlane[0] +
          (dx * p.orthogonalMatrix[0][0] + dy * p.orthogonalMatrix[1][0]) *
            p.uniformScalePerSourcePixel,
        py =
          p.targetOriginPlane[1] +
          (dx * p.orthogonalMatrix[0][1] + dy * p.orthogonalMatrix[1][1]) *
            p.uniformScalePerSourcePixel,
        expected = normal.clone().addScaledVector(east, px).addScaledVector(north, py).normalize(),
        actual = new Vector3(...constellationArtDirection(frame, u, 1 - v));
      const restored = indices.map((id) => {
        const point = new Vector3().fromArray(mesh.positions, id * 3);
        return point.divideScalar(point.dot(normal)); // independent GPU vertex-shader oracle
      });
      triangle.set(...restored);
      ray.direction.copy(expected);
      assert.ok(ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit));
      triangle.getBarycoord(hit, barycentric);
      const bary = barycentric.toArray(),
        gpuU = indices.reduce((sum, id, j) => sum + mesh.uv[id * 2] * bary[j], 0),
        gpuV = indices.reduce((sum, id, j) => sum + mesh.uv[id * 2 + 1] * bary[j], 0);
      assert.ok(
        Math.hypot((gpuU - u) * record.size[0], (gpuV - v) * record.size[1]) < 0.01,
        record.imageId + ' triangle interior must retain the analytic source pixel'
      );
      const forward = expected.clone(),
        baseRight = forward
          .clone()
          .cross(new Vector3(0, 0, 1))
          .normalize(),
        baseUp = baseRight.clone().cross(forward).normalize();
      for (const [width, height, fov, roll] of [
        [1440, 1000, 38, 0],
        [390, 260, 8, 90],
        [3840, 2160, 55, 137],
      ]) {
        const r = baseRight.clone().applyAxisAngle(forward, (roll * Math.PI) / 180),
          n = baseUp.clone().applyAxisAngle(forward, (roll * Math.PI) / 180),
          t = Math.tan((fov * Math.PI) / 360),
          project = (d) => [
            width / 2 + ((d.dot(r) / d.dot(forward) / t) * height) / 2,
            height / 2 - ((d.dot(n) / d.dot(forward) / t) * height) / 2,
          ],
          a = project(actual),
          b = project(expected);
        assert.ok(
          Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05,
          record.imageId + ' interior shifts under view roll, zoom or 4K output'
        );
      }
      checked++;
    }
  }
  assert.ok(checked > 50, 'sample actual triangle interiors, not only declared landmarks');
});

test('gnomonic plane metadata rejects invalid normals and tangent-horizon vertices', () => {
  for (const normal of [
    [0, 0, 0],
    [2, 0, 0],
    [-1, 0, 0],
  ]) {
    const record = meshRecord();
    record.mesh.planeNormal = normal;
    assert.throws(() => constellationArtFrame(record), /plane normal|tangent horizon/);
  }
});

test('selected individual gets the existing bounded loading budget and selection invalidates the view signature', async () => {
  const records = Array.from({ length: 8 }, (_, i) => ({
      ...cygnus,
      imageId: 'individual-' + i,
      width: 1024,
      height: 1024,
      kind: 'asterisms',
      targetIds: ['asterism:chinese:' + i],
    })),
    art = new ConstellationArt({ images: [] }, { chinese: { images: records } });
  art.setCulture('chinese');
  art.load = async () => resource();
  const input = view(art.frames[0]);
  try {
    art.update('main', input, true, 1);
    await until(() => art.status('main').complete);
    assert.ok(!art.status('main').images.includes('chinese:individual-7'));
    art.update('main', input, true, 1, { focusTargetId: 'asterism:chinese:7' });
    await until(() => art.status('main').complete);
    assert.equal(art.status('main').focusTargetId, 'asterism:chinese:7');
    assert.equal(art.views.get('main').plan[0].record.imageId, 'individual-7');
    assert.ok(art.status('main').images.includes('chinese:individual-7'));
    assert.ok(art.status('main').gpuBytes <= ART_GPU_BUDGET);
    assert.equal(
      art.status('main').requested,
      Math.floor(ART_GPU_BUDGET / Math.ceil((1024 * 1024 * 4 * 4) / 3)),
      'prioritizing selection must not enlarge the budget'
    );
    await art.prepare('photo', input, true, 2500, {
      culture: 'chinese',
      focusTargetId: 'asterism:chinese:7',
    });
    art.update('main', input, true, 1, { focusTargetId: 'asterism:chinese:0' });
    assert.equal(art.status('photo').focusTargetId, 'asterism:chinese:7');
  } finally {
    art.dispose();
  }
});

test('selection emphasizes the individual without hiding or dimming overlapping overviews', async () => {
  const records = [
      {
        ...cygnus,
        imageId: 'individual',
        kind: 'asterisms',
        targetIds: ['asterism:chinese:1'],
        opacity: 0.2,
      },
      {
        ...cygnus,
        imageId: 'matching-overview',
        kind: 'symbols',
        targetIds: ['asterism:chinese:1'],
        opacity: 0.2,
      },
      {
        ...cygnus,
        imageId: 'unrelated-overview',
        kind: 'symbols',
        targetIds: ['asterism:chinese:2'],
        opacity: 0.2,
      },
    ],
    art = new ConstellationArt({ images: [] }, { chinese: { images: records } }),
    layer = new ConstellationArtLayer(art, 'main');
  art.setCulture('chinese');
  art.load = async () => resource();
  const input = { ...view(art.frames[0]), fovY: 110 },
    options = { culture: 'chinese', focusTargetId: 'asterism:chinese:1' };
  try {
    layer.update(input, true, options);
    await until(() => art.status('main').complete);
    for (const entry of art.entries.values()) entry.born -= 1000;
    layer.update(input, true, options);
    const opacity = (id) => layer.meshes.get('chinese:' + id).material.uniforms.opacity.value;
    assert.ok(Math.abs(opacity('individual') - 0.26) < 1e-10);
    assert.ok(Math.abs(opacity('matching-overview') - 0.2) < 1e-10);
    assert.ok(
      layer.meshes.has('chinese:unrelated-overview'),
      'all overlapping overviews remain visible'
    );
    assert.equal(
      layer.meshes.get('chinese:individual').material.uniforms.artPlanar.value,
      0,
      'legacy artwork shaders retain their original coordinate path'
    );
    const other = { ...options, overviewArtworkId: 'unrelated-overview' };
    layer.update(input, true, other);
    await until(() => art.status('main').complete);
    for (const entry of art.entries.values()) entry.born -= 1000;
    layer.update(input, true, other);
    assert.ok(Math.abs(opacity('unrelated-overview') - 0.2) < 1e-10);
    assert.ok(layer.meshes.has('chinese:matching-overview'));
    for (const overviewOpacity of [0, 0.2, 0.65, 1]) {
      layer.update(input, true, { ...other, overviewOpacity });
      assert.ok(
        Math.abs(opacity('individual') - 0.26) < 1e-10,
        'overview slider must never alter asterism opacity'
      );
      assert.ok(Math.abs(opacity('matching-overview') - overviewOpacity) < 1e-10);
      assert.ok(Math.abs(opacity('unrelated-overview') - overviewOpacity) < 1e-10);
    }
  } finally {
    layer.dispose();
    art.dispose();
  }
});

test('four-symbol subject axes and honest coverage counts agree with verified member coordinates', () => {
  const catalog = JSON.parse(
      readFileSync(new URL('../assets/chinese-sky/catalog.json', import.meta.url))
    ),
    records = chineseArt().images,
    meanDirection = (hips) =>
      hips.reduce((sum, hip) => sum.add(physicalHipDirection(hip)), new Vector3()).normalize();
  for (const original of [
    'azure-dragon.png',
    'white-tiger.png',
    'vermilion-bird.png',
    'black-tortoise.png',
  ]) {
    const tiles = records.filter((r) => r.original === original),
      record = tiles[0],
      p = record.registration.placement,
      center = new Vector3(...p.center),
      east = new Vector3(...p.east),
      north = new Vector3(...p.north),
      toPlane = (direction) => [
        direction.dot(east) / direction.dot(center),
        direction.dot(north) / direction.dot(center),
      ],
      sourceDirection = (pixel) => {
        const tile = tiles.find((r) => {
          const [l, t, rgt, b] = r.registration.sourceBox;
          return pixel[0] >= l && pixel[0] <= rgt && pixel[1] >= t && pixel[1] <= b;
        });
        return new Vector3(
          ...constellationArtPixelDirection(
            constellationArtFrame(tile),
            ...patchPixelFromOriginal(tile, pixel)
          )
        );
      },
      placed = p.sourceAxisPixels.map((pixel) => toPlane(sourceDirection(pixel))),
      expected = p.targetAxisHips.map((hips) => toPlane(meanDirection(hips))),
      a = [placed[1][0] - placed[0][0], placed[1][1] - placed[0][1]],
      b = [expected[1][0] - expected[0][0], expected[1][1] - expected[0][1]],
      angle = Math.atan2(Math.abs(a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1]);
    assert.ok(
      angle < 2e-6,
      original + ' declared subject direction must follow its real stellar axis'
    );
    const targetIds = new Set(record.targetIds),
      members = new Map();
    for (const object of catalog.asterisms.filter((o) => targetIds.has(o.targetId))) {
      const ids = new Set([
        ...(object.primaryMemberHips || []).map((id) => 'hip:' + id),
        ...(object.primaryMemberObjectIds || []),
      ]);
      for (const member of object.members)
        if (ids.has(member.physicalId)) members.set(member.physicalId, member);
    }
    let count = 0, covered = 0;
    for (const member of members.values()) {
      const ra = (member.ra * Math.PI) / 180,
        dec = (member.dec * Math.PI) / 180,
        plane = toPlane(
          new Vector3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec))
        ),
        dx = (plane[0] - p.targetOriginPlane[0]) / p.uniformScalePerSourcePixel,
        dy = (plane[1] - p.targetOriginPlane[1]) / p.uniformScalePerSourcePixel,
        x = p.sourceOrigin[0] + dx * p.orthogonalMatrix[0][0] + dy * p.orthogonalMatrix[0][1],
        y = p.sourceOrigin[1] + dx * p.orthogonalMatrix[1][0] + dy * p.orthogonalMatrix[1][1],
        [l, t, r, b] = p.sourceVisibleBox;
      if (x >= l - 1e-4 && x <= r + 1e-4 && y >= t - 1e-4 && y <= b + 1e-4) covered++;
      count++;
    }
    assert.equal(count, p.primaryMemberCount);
    assert.equal(p.coveredPrimaryMembers, covered, 'report actual coverage without inflating the drawing');
    assert.equal(
      record.registration.landmarks.length,
      0,
      'overview axes do not pretend to be anatomical star-by-star anchors'
    );
  }
});

test('expanded art keeps verified target identity, source meaning and bounded physical scale without fake anchors', () => {
  const manifest = chineseArt(),
    catalog = JSON.parse(
      readFileSync(new URL('../assets/chinese-sky/catalog.json', import.meta.url))
    ),
    originals = new Set([
      'azure-dragon.png',
      'white-tiger.png',
      'vermilion-bird.png',
      'black-tortoise.png',
      'northern-dipper.png',
      'weaving-maiden.png',
      'river-drum.png',
      'celestial-wolf.png',
    ]),
    checked = new Set();
  for (const record of manifest.images) {
    assert.doesNotThrow(() => constellationArtFrame(record), record.imageId);
    if (originals.has(record.original) || checked.has(record.original)) continue;
    checked.add(record.original);
    const p = record.registration.placement;
    const extentBased = record.registration.diagnostics.placementMethod === 'member-extent';
    if (extentBased) {
      assert.equal(record.anchors.length, 0);
      assert.equal(record.registration.landmarks.length, 0);
    }
    assert.ok(record.meaning.zh && record.meaning.en);
    assert.equal(record.historicalImageReconstruction, false);
    assert.equal(record.basis.perStarAnatomyClaimed, false);
    for (const id of record.basis.evidenceIds)
      assert.ok(
        manifest.evidence[id]?.url,
        'source claim resolves within the distributed manifest'
      );
    const selected = catalog.asterisms.filter((object) =>
      record.targetIds.includes(object.targetId)
    );
    assert.equal(selected.length, record.targetIds.length);
    if (record.kind === 'symbols') {
      assert.deepEqual(
        [...record.targetIds].sort(),
        catalog.asterisms
          .filter((object) => object.groupId === record.groupId)
          .map((object) => object.targetId)
          .sort(),
        'an enclosure overview references actual group targets rather than inventing a cultural object ID'
      );
    } else
      assert.equal(
        record.targetIds.length,
        1,
        'individual art describes the principal asterism rather than the whole mansion region'
      );
    const members = new Map(),
      center = new Vector3(...p.center),
      east = new Vector3(...p.east),
      north = new Vector3(...p.north);
    for (const object of selected) {
      const ids = new Set([
        ...(object.primaryMemberHips || []).map((id) => 'hip:' + id),
        ...(object.primaryMemberObjectIds || []),
      ]);
      for (const member of object.members)
        if (ids.has(member.physicalId)) members.set(member.physicalId, member);
    }
    if (!extentBased) {
      assert.ok(record.registration.landmarks.length > 0);
      for (const landmark of record.registration.landmarks) {
        assert.ok(members.has('hip:' + landmark.hip), 'semantic landmarks must be real primary members');
        assert.equal(landmark.basis, 'modern-layout');
      }
      continue;
    }
    const planes = [];
    let covered = 0;
    for (const member of members.values()) {
      const ra = (member.ra * Math.PI) / 180,
        dec = (member.dec * Math.PI) / 180,
        d = new Vector3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)),
        plane = [d.dot(east) / d.dot(center), d.dot(north) / d.dot(center)],
        dx = (plane[0] - p.targetOriginPlane[0]) / p.uniformScalePerSourcePixel,
        dy = (plane[1] - p.targetOriginPlane[1]) / p.uniformScalePerSourcePixel,
        x = p.sourceOrigin[0] + dx * p.orthogonalMatrix[0][0] + dy * p.orthogonalMatrix[0][1],
        y = p.sourceOrigin[1] + dx * p.orthogonalMatrix[1][0] + dy * p.orthogonalMatrix[1][1],
        [l, t, r, b] = p.sourceVisibleBox;
      planes.push(plane);
      if (x >= l - 1e-4 && x <= r + 1e-4 && y >= t - 1e-4 && y <= b + 1e-4) covered++;
    }
    assert.equal(members.size, p.primaryMemberCount);
    assert.equal(p.coveredPrimaryMembers, covered);
    const diameter = Math.max(...planes.flatMap(a => planes.map(b => Math.hypot(a[0]-b[0], a[1]-b[1]))));
    assert.ok(Math.abs(diameter-p.memberDiameterPlane) < 1e-9);
    const expectedSpan = Math.max(diameter * p.coveragePadding, 2*Math.tan(p.minimumAngularDiameterDegrees*Math.PI/360));
    assert.ok(Math.abs(p.sourceExtentPixels*p.uniformScalePerSourcePixel-expectedSpan)<1e-9,
      record.original+' must follow the stellar span instead of inflated rectangular containment');
    if (p.axisPolicy === 'north-up-visual-design') {
      assert.ok(
        Math.abs(p.orthogonalMatrix[0][0] + 1) < 1e-10 &&
          Math.abs(p.orthogonalMatrix[1][1] + 1) < 1e-10
      );
      assert.ok(
        Math.abs(p.orthogonalMatrix[0][1]) < 1e-10 && Math.abs(p.orthogonalMatrix[1][0]) < 1e-10
      );
    } else if (!p.targetAxisHips) {
      const mean = planes.reduce(
          (a, b) => [a[0] + b[0] / planes.length, a[1] + b[1] / planes.length],
          [0, 0]
        ),
        cov = planes.reduce(
          (s, v) => {
            const x = v[0] - mean[0],
              y = v[1] - mean[1];
            return [s[0] + x * x, s[1] + x * y, s[2] + y * y];
          },
          [0, 0, 0]
        ),
        theta = Math.atan2(2 * cov[1], cov[0] - cov[2]) / 2,
        expected = [Math.cos(theta), Math.sin(theta)],
        axis = [
          p.sourceAxisPixels[1][0] - p.sourceAxisPixels[0][0],
          p.sourceAxisPixels[1][1] - p.sourceAxisPixels[0][1],
        ],
        actual = [
          axis[0] * p.orthogonalMatrix[0][0] + axis[1] * p.orthogonalMatrix[1][0],
          axis[0] * p.orthogonalMatrix[0][1] + axis[1] * p.orthogonalMatrix[1][1],
        ],
        angle = Math.atan2(
          Math.abs(actual[0] * expected[1] - actual[1] * expected[0]),
          Math.abs(actual[0] * expected[0] + actual[1] * expected[1])
        );
      assert.ok(
        angle < 1e-7,
        record.original + ' body axis must follow the independently recomputed physical member PCA'
      );
    }
  }
});

test('real enclosure overviews overlap and a photo freezes priority without hiding other regions', async () => {
  const art = new ConstellationArt({ images: [] }, { chinese: chineseArt() });
  art.setCulture('chinese');
  art.load = async () => resource();
  const ziwei = art.frames.find((f) => f.record.original === 'ziwei-enclosure.png');
  const input = { ...view({ center: ziwei.record.registration.placement.center }), fovY: 110 };
  const overviews = (id) => art.ready(id).filter((e) => e.frame.record.kind === 'symbols');
  try {
    art.update('main', input, true, 1, {
      overviewArtworkId: 'ziwei-enclosure.png',
      asterisms: false,
    });
    await until(() => art.status('main').complete);
    const regions = new Set(overviews('main').map((e) => e.frame.record.original));
    assert.ok(regions.size > 1, 'multiple intersecting regional artworks must be planned');
    for (const name of regions)
      assert.equal(
        overviews('main').filter((e) => e.frame.record.original === name).length,
        art.frames.filter((f) => f.record.original === name).length
      );
    await art.prepare('photo', input, true, 2500, {
      culture: 'chinese',
      overviewArtworkId: 'ziwei-enclosure.png',
      asterisms: false,
    });
    art.update('main', input, true, 1, {
      overviewArtworkId: 'taiwei-enclosure.png',
      asterisms: false,
    });
    await until(() => art.status('main').complete);
    assert.equal(art.status('photo').requestedOverviewArtworkId, 'ziwei-enclosure.png');
    assert.equal(art.status('main').requestedOverviewArtworkId, 'taiwei-enclosure.png');
    assert.deepEqual(new Set(overviews('main').map((e) => e.frame.record.original)), regions);
    assert.ok(art.status('main').gpuBytes <= ART_GPU_BUDGET);
  } finally {
    art.dispose();
  }
});

test('real overview patches appear together only after the complete decode group is ready', async () => {
  const records = chineseArt().images.filter((r) => r.original === 'ziwei-enclosure.png'),
    art = new ConstellationArt({ images: [] }, { chinese: { images: records } }),
    layer = new ConstellationArtLayer(art, 'main'),
    jobs = [];
  art.setCulture('chinese');
  art.load = (frame) => {
    const job = { ...deferred(), frame };
    jobs.push(job);
    return job.promise;
  };
  const input = { ...view(art.frames[0]), fovY: 110 };
  try {
    assert.ok(records.length >= 2);
    layer.update(input, true, { overviewArtworkId: 'ziwei-enclosure.png' });
    for (let i = 0; i < records.length; i++) {
      await until(() => jobs.length > i);
      jobs[i].resolve(resource());
      await until(() => art.entries.size === i + 1);
      if (i < records.length - 1) {
        assert.equal(art.ready('main').length, 0, 'no temporary head/face fragments');
        layer.update(input, true, { overviewArtworkId: 'ziwei-enclosure.png' });
        assert.equal(layer.meshes.size, 0);
        for (const entry of art.entries.values()) entry.born -= 1000;
      }
    }
    layer.update(input, true, { overviewArtworkId: 'ziwei-enclosure.png' });
    assert.equal(layer.meshes.size, records.length);
    const opacities = [...layer.meshes.values()].map(
      (mesh) => mesh.material.uniforms.opacity.value
    );
    assert.ok(
      Math.max(...opacities) - Math.min(...opacities) < 0.001,
      'the complete group shares one loading fade'
    );
  } finally {
    layer.dispose();
    art.dispose();
  }
});

test('overview groups reserve budget atomically before unselected individual art', async () => {
  const make = (large) => [
    ...Array.from({ length: 4 }, (_, i) => ({
      ...cygnus,
      imageId: 'overview-' + i,
      original: 'overview.png',
      kind: 'symbols',
      width: large ? 2048 : 512,
      height: large ? 2048 : 512,
    })),
    { ...cygnus, imageId: 'focused', kind: 'asterisms', targetIds: ['asterism:chinese:1'] },
    ...Array.from({ length: 5 }, (_, i) => ({
      ...cygnus,
      imageId: 'other-' + i,
      kind: 'asterisms',
      width: 1024,
      height: 1024,
    })),
  ];
  for (const large of [false, true]) {
    const art = new ConstellationArt({ images: [] }, { chinese: { images: make(large) } });
    art.setCulture('chinese');
    art.load = async () => resource();
    try {
      art.update('main', { ...view(art.frames[0]), fovY: 110 }, true, 1, {
        focusTargetId: 'asterism:chinese:1',
        overviewArtworkId: 'overview.png',
      });
      await until(() => art.status('main').complete);
      const plan = art.views.get('main').plan,
        parts = plan.filter((f) => f.record.kind === 'symbols');
      assert.equal(plan[0].record.imageId, 'focused');
      assert.equal(
        parts.length,
        large ? 0 : 4,
        'an overview fits completely or is omitted completely'
      );
      if (!large) assert.ok(plan.slice(1, 5).every((f) => f.record.original === 'overview.png'));
      assert.ok(art.status('main').gpuBytes <= ART_GPU_BUDGET);
    } finally {
      art.dispose();
    }
  }
});

test('38-degree main fields and narrow finders retain overviews with shared adjustable opacity', async () => {
  const records = chineseArt().images.filter((r) =>
    ['northern-dipper.png', 'ziwei-enclosure.png'].includes(r.original)
  );
  const art = new ConstellationArt({ images: [] }, { chinese: { images: records } });
  art.setCulture('chinese');
  art.load = async () => resource();
  const dipper = art.frames.find((f) => f.record.original === 'northern-dipper.png'),
    input = view(dipper);
  const layers = ['main', 'scope', 'photo', 'balcony'].map(
    (id) => new ConstellationArtLayer(art, id)
  );
  const options = {
    culture: 'chinese',
    symbols: true,
    asterisms: true,
    overviewArtworkId: 'ziwei-enclosure.png',
    focusTargetId: 'asterism:chinese:3',
    overviewOpacity: 0.65,
  };
  try {
    for (const fovY of [0.5, 4, 31.8, 38, 40, 57.5, 75, 110]) {
      for (const layer of layers) layer.update({ ...input, fovY }, true, options);
      await until(() => layers.every((l) => art.status(l.id).complete));
      for (const entry of art.entries.values()) entry.born -= 1000;
      for (const layer of layers) {
        layer.update({ ...input, fovY }, true, options);
        const meshes = [...layer.meshes]
          .filter(([id]) => id !== 'chinese:northern-dipper')
          .map(([, mesh]) => mesh);
        assert.equal(meshes.length, records.filter((r) => r.kind === 'symbols').length);
        assert.ok(
          meshes.every((mesh) => Math.abs(mesh.material.uniforms.opacity.value - 0.65) < 1e-10),
          `overview hidden/dimmed at ${fovY} degrees in ${layer.id}`
        );
        assert.equal(constellationOverviewFade(fovY), 1);
      }
    }
    for (const value of [0, 0.2, 1])
      for (const layer of layers) {
        layer.update({ ...input, fovY: 38 }, true, { ...options, overviewOpacity: value });
        for (const [id, mesh] of layer.meshes)
          if (id !== 'chinese:northern-dipper')
            assert.ok(Math.abs(mesh.material.uniforms.opacity.value - value) < 1e-10);
      }
    for (const layer of layers)
      layer.update({ ...input, fovY: 38 }, true, { ...options, symbols: false });
    await until(() => layers.every((l) => art.status(l.id).complete));
    for (const layer of layers)
      assert.ok(art.ready(layer.id).every((e) => e.frame.record.kind !== 'symbols'));
  } finally {
    for (const layer of layers) layer.dispose();
    art.dispose();
  }
});

test('the expanded illustrations use their real RGB texture and the original eight retain their established ink mode', async () => {
  const actual = chineseArt(),
    originals = new Set([
      'azure-dragon.png',
      'white-tiger.png',
      'vermilion-bird.png',
      'black-tortoise.png',
      'northern-dipper.png',
      'weaving-maiden.png',
      'river-drum.png',
      'celestial-wolf.png',
    ]),
    newOriginals = new Set(),
    oldOriginals = new Set();
  for (const record of actual.images) {
    if (originals.has(record.original)) {
      oldOriginals.add(record.original);
      assert.notEqual(record.colorMode, 'source');
    } else {
      newOriginals.add(record.original);
      assert.equal(
        record.colorMode,
        'source',
        record.original + ' must retain dark strokes and light surfaces'
      );
    }
  }
  assert.equal(newOriginals.size, actual.artworks - 8);
  assert.equal(oldOriginals.size, 8);
  for (const [name, expected] of [
    ['jing-well.png', 1],
    ['northern-dipper.png', 0],
  ]) {
    const record = actual.images.find((r) => r.original === name),
      art = new ConstellationArt({ images: [] }, { chinese: { images: [record] } }),
      main = new ConstellationArtLayer(art, 'main'),
      photo = new ConstellationArtLayer(art, 'photo', true, 3);
    art.setCulture('chinese');
    art.load = async () => resource();
    const input = view(art.frames[0]);
    try {
      await art.prepare('photo', input, true, 2500, { culture: 'chinese' });
      main.update(input, true, { culture: 'chinese' });
      photo.update(input, true, { culture: 'chinese' });
      for (const layer of [main, photo]) {
        const material = [...layer.meshes.values()][0].material;
        assert.equal(
          material.uniforms.sourceColor.value,
          expected,
          name + ' uses the same colour mode in main and photo'
        );
        assert.equal(
          material.uniforms.artMap.value,
          art.ready(layer.id)[0].texture,
          'the actual prepared texture is bound without an alpha-only replacement'
        );
      }
    } finally {
      main.dispose();
      photo.dispose();
      art.dispose();
    }
  }
});

test('all seven regional artworks share the fixed budget across simultaneous viewing directions', async () => {
  const records = chineseArt().images.filter((r) => r.kind === 'symbols');
  const art = new ConstellationArt({ images: [] }, { chinese: { images: records } });
  art.setCulture('chinese');
  art.load = async () => resource();
  const originals = [...new Set(records.map((r) => r.original))];
  try {
    for (const name of originals) {
      const record = records.find((r) => r.original === name);
      art.update(
        name,
        { ...view({ center: record.registration.placement.center }), fovY: 38 },
        true,
        1,
        { symbols: true, asterisms: false }
      );
    }
    await until(() => originals.every((name) => art.status(name).complete));
    assert.equal(
      art.entries.size,
      records.length,
      'the fixed pool can hold all four symbols and all three enclosures'
    );
    assert.ok(art.status(originals[0]).gpuBytes <= ART_GPU_BUDGET);
    for (const name of originals)
      assert.ok(art.ready(name).some((e) => e.frame.record.original === name));
  } finally {
    art.dispose();
  }
});
