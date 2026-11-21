import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { groundPlanetProjection } from '../src/ground-planets.js';
import { createSolarDiscMaps } from '../src/solar-disc.js';
import { Texture, TextureLoader, PerspectiveCamera } from 'three';
import {
  Equator,
  Horizon,
  SearchAltitude,
  Observer,
  Rotation_EQJ_EQD,
  RotateVector,
  Vector,
  EquatorFromVector,
} from 'astronomy-engine';
const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/ground-stargazing.js';",
      "export * from './src/ground-scope-optics.js';",
      "export {groundScopeBodyLabels} from './src/ground-scope-labels.js';",
    ].join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const {
  createGroundStargazing,
  GROUND_TELESCOPE,
  groundEyepiece,
  groundEyepieceCameraFov,
  groundPresetField,
  groundFieldAtZoom,
  groundZoomAtField,
  groundScopeOptics,
  nudgeGroundScope,
  groundScopeBodyLabels,
  nextGroundAstronomicalDusk,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);

function near(a, b, tol = 1e-8) {
  assert.ok(
    Number.isFinite(a) && Math.abs(a - b) <= tol,
    `${a} differs from ${b} by more than ${tol}`
  );
}
const turnDifference = (a, b) => ((a - b + 540) % 360) - 180;
const site = { name: '北京', latitude: 39.9042, longitude: 116.4074, height: 52 };
const date = new Date('2026-11-21T12:00:00.652Z');
const time = +date,
  language = 'zh';
const controller = createGroundStargazing(),
  pose = { azimuth: 128, elevation: 27 };
const star = controller.search('Vega', site, time, language)[0],
  moon = controller.search('月亮', site, time, language)[0];
assert.deepEqual(controller.observe(star.target, site, time), star);
assert.equal(controller.target, null);
assert.equal(star.target.id, 'hip:91262');
assert.ok(Math.abs(star.magnitude) < 0.1);
assert.equal(star.magnitude, star.target.magnitude);
assert.ok(Number.isFinite(moon.magnitude));
assert.equal(controller.search('M31', site, time, language)[0].target.id, 'deep-sky:m31');
assert.equal(controller.search('Сатурн', site, time, 'ru')[0].target.name, 'Сатурн');
assert.equal(controller.search('Lune', site, time, 'fr')[0].target.name, 'Lune');
assert.equal(moon.target.id, 'solar:Moon');
assert.equal(
  controller.search('Earth', site, time, 'en').some((r) => r.target.id === 'solar:Earth'),
  false
);
assert.ok(controller.search('', site, time, language).length > 0);
assert.ok(
  controller.search('', site, time, language).every((r) => r.aboveHorizon && r.elevation > 0)
);

// Verify both directions against Astronomy Engine's independent public horizon
// conversion at the same instant, using a fixed catalogue and a moving Moon.
const o = new Observer(site.latitude, site.longitude, site.height);
const noon = Date.parse('2026-11-21T04:15:00Z');
const dusk = nextGroundAstronomicalDusk(site, noon);
const sun = controller.search('Sun', site, noon, 'en')[0].target;
assert.ok(controller.observe(sun, site, dusk).elevation <= -18);
assert.ok(controller.observe(sun, site, dusk - 2000).elevation > -18);
near(dusk, SearchAltitude('Sun', o, -1, new Date(noon), 3, -18).date.getTime(), 5000);
assert.equal(
  nextGroundAstronomicalDusk(
    { latitude: 79, longitude: 16, height: 10 },
    Date.parse('2026-06-21T12:00:00Z')
  ),
  null
);
const [x, y, z] = star.target.direction;
const eq = EquatorFromVector(RotateVector(Rotation_EQJ_EQD(date), new Vector(x, y, z, date)));
const stellarHz = Horizon(date, o, eq.ra, eq.dec);
near(turnDifference(star.azimuth, stellarHz.azimuth), 0, 1e-6);
near(star.elevation, stellarHz.altitude, 1e-6);
const lunarEq = Equator('Moon', date, o, true, false),
  lunarHz = Horizon(date, o, lunarEq.ra, lunarEq.dec);
near(turnDifference(moon.azimuth, lunarHz.azimuth), 0, 0.003);
near(moon.elevation, lunarHz.altitude, 0.003);

// Selecting or searching leaves the mount where it was. Tracking follows the
// same frame as the sky, while an unlocked mount stays at fixed local angles.
controller.select(star.target);
controller.search('M51', site, time, language);
assert.deepEqual(pose, { azimuth: 128, elevation: 27 });
assert.equal(controller.aim(site, time, pose, true), true);
const first = controller.update(site, time, pose),
  later = controller.update(site, time + 1800000, pose);
near(first.raDeg, star.raDeg);
near(first.decDeg, star.decDeg);
near(later.raDeg, star.raDeg);
near(later.decDeg, star.decDeg);
assert.ok(Math.abs(later.azimuth - first.azimuth) > 1);
assert.equal(later.sky.frame.q.t, time + 1800000);
assert.equal(controller.update(site, time + 1800000, pose).sky, later.sky);
const az = pose.azimuth,
  el = pose.elevation;
controller.release();
const stopped = controller.update(site, time + 3600000, pose);
assert.equal(stopped.tracking, false);
assert.equal(pose.azimuth, az);
assert.equal(pose.elevation, el);
assert.ok(Math.abs(turnDifference(stopped.raDeg, star.raDeg)) > 6);
controller.localize('ru', 'western');
assert.equal(controller.target.name, 'Вега');
assert.equal(controller.manual(pose, -20, 0), true);
assert.equal(pose.azimuth, 340);
assert.equal(controller.manual(pose, 2, NaN), false);
assert.deepEqual(pose, { azimuth: 340, elevation: 0 });
assert.equal(controller.manual(pose, 2, -1), false);
assert.equal(controller.manual(pose, 0, 90), true);

// A gallery crop is allowed to carry its own direction. At a site on the
// opposite side of Earth the target is below the horizon and the mount stops.
const field = {
  id: 'hubble:test',
  type: 'deep-sky',
  name: 'Off-centre framing',
  direction: [x * 2, y * 2, z * 2],
};
controller.select(field);
assert.equal(controller.aim(site, time, pose, true), true);
const preview = controller.observe(moon.target, site, time);
assert.equal(preview.target.id, 'solar:Moon');
assert.equal(controller.target, field);
assert.equal(controller.tracking, true);
const locked = { ...pose };
const antipode = { ...site, latitude: -site.latitude, longitude: site.longitude - 180 };
const lost = controller.update(antipode, time, pose);
assert.equal(lost.observation.aboveHorizon, false);
assert.equal(lost.tracking, false);
assert.deepEqual(pose, locked);
assert.equal(controller.aim(antipode, time, pose, true), false);
assert.deepEqual(pose, locked);
controller.select(moon.target);
assert.equal(controller.aim(site, time, pose, true), true);
const trackedMoon = controller.update(site, time + 3600000, pose);
assert.ok(Math.hypot(trackedMoon.raDeg - moon.raDeg, trackedMoon.decDeg - moon.decDeg) > 0.1);
const otherMoon = controller.search('月球', antipode, time, language)[0];
assert.ok(Math.hypot(otherMoon.raDeg - moon.raDeg, otherMoon.decDeg - moon.decDeg) > 0.5);
controller.select(null);
assert.equal(controller.update(site, time, pose).observation, null);

// A saved old eyepiece still has its calibrated field. Dragging between
// shortcuts and crossing the finder/field-stop transition changes the scale continuously.
for (const fraction of [0, 0.15, 0.36, 0.72, 0.99, 1])
  near(groundZoomAtField(groundFieldAtZoom(fraction)), fraction);
near(groundPresetField('finder'), 60);
near(groundPresetField('25'), 50 / 24);
near(groundPresetField('10'), 50 / 60);
near(groundPresetField('6'), 0.5);
for (const [width, height] of [
  [800, 500],
  [300, 650],
  [1400, 280],
]) {
  const finder = groundScopeOptics(60, width, height, 80, 0);
  near(finder.eyeCircleDiameter, 0);
  near(finder.fov, 60);
  near(finder.autoMagnitudeLimit, 6.5);
  let previous = 100;
  for (let f = 60; f >= 0.49; f /= 1.003) {
    const current = groundScopeOptics(f, width, height, 80, 0).fov;
    assert.ok(current < previous && (previous === 100 || previous / current < 1.008));
    previous = current;
  }
  const ocular = groundScopeOptics(0.5, width, height, 80, 0);
  near(ocular.eyeCircleDiameter, 0.9 * Math.min(width, height));
  near(ocular.autoMagnitudeLimit, 8);
  const larger = groundScopeOptics(0.5, width, height, 160, 1);
  near(larger.apertureGain, 4);
  near(larger.exposureGain, 2);
  near(larger.autoMagnitudeLimit - ocular.autoMagnitudeLimit, 2.5 * Math.log10(8));
  near(larger.fov, ocular.fov);
}

const labelCamera = new PerspectiveCamera(40, 1.6, 0.1, 1000);
const bodyNames = {
  camera: labelCamera,
  labels: [
    { bodyId: 'Moon', text: '月球', direction: [0, 0, -1] },
    { bodyId: 'Saturn', text: '土星', direction: [0.12, 0, -1] },
    { bodyId: 'Mars', text: '火星', direction: [-0.12, 0, -1] },
    { bodyId: 'Jupiter', text: '木星', direction: [0.5, 0, -1] },
    { bodyId: 'Sun', text: '太阳', direction: [0, 0, 1] },
    { text: 'Already owned by shared sky', direction: [0, 0.05, -1] },
  ],
};
const sampled = [];
const labels = groundScopeBodyLabels({
  status: bodyNames,
  width: 640,
  height: 400,
  radius: 170,
  trackedBody: 'Moon',
  hidden(row, x, y) {
    sampled.push(row.bodyId);
    near(y, 200);
    assert.ok(x > 0 && x < 640);
    return row.bodyId === 'Mars';
  },
});
assert.deepEqual(sampled, ['Saturn', 'Mars']);
assert.deepEqual(
  labels.map((row) => row.text),
  ['土星']
);
const { rect: bodyLabel } = labels[0];
assert.ok(bodyLabel.x > 338 && bodyLabel.y >= 0 && bodyLabel.x + bodyLabel.w <= 640);
assert.deepEqual(
  groundScopeBodyLabels({ status: { camera: labelCamera, labels: [] }, width: 640, height: 400 }),
  []
);

const highPose = { azimuth: 123, elevation: 80, rollDegrees: 0 };
const rightMove = nudgeGroundScope(highPose, 0.04, 0);
const enu = (p) => {
  const e = (p.elevation * Math.PI) / 180,
    a = (p.azimuth * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
};
const chord = (a, b) => Math.hypot(...enu(a).map((v, i) => v - enu(b)[i]));
near((2 * Math.asin(chord(rightMove, highPose) / 2) * 180) / Math.PI, 0.04);
assert.ok(rightMove.azimuth - highPose.azimuth > 0.22);
const rolled = nudgeGroundScope({ ...highPose, rollDegrees: 90 }, 0.04, 0);
near(rolled.azimuth, highPose.azimuth);
near(rolled.elevation, 80.04);
near(
  nudgeGroundScope({ ...highPose, rollDegrees: 90 }, 0, 0.04).azimuth,
  2 * highPose.azimuth - rightMove.azimuth
);
near(nudgeGroundScope({ ...highPose, elevation: 90 }, 0.04, 0).elevation, 89.96);
near(nudgeGroundScope({ ...highPose, elevation: 0 }, 0, -0.04).elevation, 0);

// A circular eyepiece spans its stated field in both landscape and portrait.
for (const [i, magnification] of [24, 60, 100].entries()) {
  const optics = groundEyepiece(GROUND_TELESCOPE.tubeMm, GROUND_TELESCOPE.eyepiecesMm[i]);
  near(optics.magnification, magnification);
  near(optics.fov, 50 / magnification);
  near(optics.exitPupilMm, 80 / magnification);
  for (const [h, diameter] of [
    [900, 810],
    [840, 326],
    [1000, 1000],
  ]) {
    const vertical = (groundEyepieceCameraFov(optics.fov, h, diameter) * Math.PI) / 180;
    const radius = (h * Math.tan((optics.fov * Math.PI) / 360)) / (2 * Math.tan(vertical / 2));
    near(radius, diameter / 2, 1e-8);
  }
}
const saturn = first.sky.bodies.find((item) => item.id === 'Saturn');
const ra = Math.atan2(saturn.direction[1], saturn.direction[0]);
const right = [-Math.sin(ra), Math.cos(ra), 0];
const up = [
  -Math.cos(ra) * saturn.direction[2],
  -Math.sin(ra) * saturn.direction[2],
  Math.hypot(...saturn.direction.slice(0, 2)),
];
const fieldView = {
  right,
  up,
  forward: saturn.direction,
  aspect: 1.5,
  pixelHeight: 900,
  fovY: 0.5,
};
const ring = groundPlanetProjection(saturn, fieldView, 810);
near(ring.radiusPixels, (450 * Math.tan(saturn.radiusRad)) / Math.tan((0.25 * Math.PI) / 180));
near(Math.hypot(...ring.centre), 0);
assert.equal(groundPlanetProjection(saturn, { ...fieldView, fovY: 60 }), null);
assert.equal(
  groundPlanetProjection(saturn, { ...fieldView, forward: saturn.direction.map((v) => -v) }),
  null
);
const displaced = {
  ...saturn,
  direction: saturn.direction.map((v, i) => v + 0.0044 * right[i] + 0.003 * up[i]),
};
assert.ok(groundPlanetProjection(displaced, fieldView));
assert.equal(groundPlanetProjection(displaced, fieldView, 810), null);
// Both telescope views may use the same image while decoding. Releasing one
// observer must keep the other consumer's texture alive.
const originalLoad = TextureLoader.prototype.loadAsync;
let loads = 0,
  released = 0;
TextureLoader.prototype.loadAsync = async () => {
  loads++;
  const tex = new Texture();
  tex.addEventListener('dispose', () => released++);
  return tex;
};
try {
  const environment = { assets: { planets: { Saturn: 'planet.jpg', SaturnRing: 'ring.png' } } };
  const ground = createSolarDiscMaps(environment),
    orbit = createSolarDiscMaps(environment);
  assert.deepEqual(ground.maps(saturn, 0.1), []);
  const a = orbit.maps(saturn, 10),
    b = ground.maps(saturn, 10);
  assert.equal(loads, 2);
  assert.equal(a[0], b[0]);
  assert.equal(a[1], b[1]);
  ground.dispose();
  await Promise.all(a.map((item) => item.ready));
  assert.equal(released, 0);
  const groundAgain = createSolarDiscMaps(environment);
  assert.equal(groundAgain.maps(saturn, 10)[1].texture, a[1].texture);
  orbit.dispose();
  assert.equal(released, 0);
  groundAgain.retain(new Set());
  assert.equal(released, 2);
} finally {
  TextureLoader.prototype.loadAsync = originalLoad;
}
assert.throws(() => groundEyepiece(600, 0), RangeError);
console.log(
  'Ground telescope: shared catalogue, WGS84 horizontal/J2000 axes, topocentric Moon, source framing, tracking, horizon loss and eyepiece geometry passed.'
);

// The PNG keeps every original pixel and source credit even when the player turns labels off.
{
  const { describeEyepiecePng } = await import('../src/ground-scope-photo.js');
  const { crc32 } = await import('node:zlib');
  const original = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
    'base64'
  );
  const output = Buffer.from(
    await describeEyepiecePng(new Blob([original]), {
      title: '月球',
      description: '北京 · J2000',
      sources: ['LROC', 'LROC', 'ESA'],
    }).arrayBuffer()
  );
  assert.deepEqual(output.subarray(0, original.length - 12), original.subarray(0, -12));
  assert.deepEqual(output.subarray(-12), original.subarray(-12));
  const info = {};
  for (let position = original.length - 12; position < output.length - 12; ) {
    const length = output.readUInt32BE(position);
    const kindAndPayload = output.subarray(position + 4, position + 8 + length);
    assert.equal(kindAndPayload.toString('ascii', 0, 4), 'iTXt');
    assert.equal(output.readUInt32BE(position + 8 + length), crc32(kindAndPayload));
    const keyEnd = kindAndPayload.indexOf(0, 4);
    info[kindAndPayload.toString('ascii', 4, keyEnd)] = kindAndPayload.toString('utf8', keyEnd + 5);
    position += length + 12;
  }
  assert.deepEqual(info, { Title: '月球', Description: '北京 · J2000', Source: 'LROC\nESA' });
}
