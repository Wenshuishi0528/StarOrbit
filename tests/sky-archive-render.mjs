import assert from 'node:assert/strict';
import * as THREE from 'three';
import { archiveUsesSRGBTransfer } from '../src/sky-archive-color.js';
import { SkyDetail } from '../src/sky-detail.js';
import { loadHubbleArchive } from '../src/hubble-gallery.js';
import { frameSkyArtwork } from '../src/sky-camera-pointing.js';
import { SkyDetailLayer } from '../src/sky-detail-layer.js';
import { createWebbPlate, validSkyImageDimensions, webbPlateTile } from '../src/webb-plate.js';

const { providers: HUBBLE_PLATE_PROVIDERS } = await loadHubbleArchive();
const plate = createWebbPlate([256, 256, 256, 256, 0, 0, 128, 128, -0.001, 0, 0, 0.001, 1]);
const view = { right: [0, 1, 0], up: [0, 0, 1], forward: [1, 0, 0], fovY: 0.05, aspect: 1 };
const provider = { id: 'example', plate, format: 'jpg', revision: '1', baseUrl: 'local' };
let entries;
const manager = { update() {}, ready: () => entries, release() {} };

for (const profile of ['srgb', 'prophoto', 'adobe', 'p3', 'lstar', 'eci188', 'mono', 'dot15']) {
  const tile = webbPlateTile({ ...provider, archiveProfile: profile }, 0, 0);
  const priorTexture = new THREE.Texture();
  entries = [{ ...tile, texture: priorTexture }];
  const layer = new SkyDetailLayer(manager, 'scope', true, true);
  layer.update(view, true, { skyGain: 0.75 });
  const [mesh] = layer.group.children;
  assert.equal(mesh.material.defines.ARCHIVE_PLATE, 1);
  assert.equal(mesh.material.defines['ARCHIVE_' + profile.toUpperCase()], 1);
  assert.equal(mesh.material.uniforms.archiveGain.value, 0.75);
  assert.equal(archiveUsesSRGBTransfer(profile), ['srgb', 'p3'].includes(profile));
  assert.equal(mesh.material.uniforms.tileMap.value, priorTexture);
  assert.ok(mesh.layers.isEnabled(0) && mesh.layers.isEnabled(1));
  const camera = new THREE.Camera(),
    target = {
      w: 128,
      h: 96,
      scene: { texture: new THREE.Texture() },
    };
  const sensor = {
    earthOn: { value: 0 },
    earthImage: { value: null },
    earthExposure: { value: 2 },
  };
  let passes = 0;
  layer.resolveByteFilm(
    {
      render(scene) {
        passes++;
        assert.equal(scene, layer.scene);
        assert.equal(camera.layers.mask, 2);
        assert.equal(layer.uniforms.storedScene.value, target.scene.texture);
        assert.equal(layer.uniforms.resolveByteSensor.value, true);
      },
    },
    camera,
    target,
    sensor
  );
  assert.equal(passes, 1);
  assert.equal(camera.layers.mask, 1);
  assert.equal(layer.uniforms.resolveByteSensor.value, false);
  assert.equal(layer.uniforms.storedScene.value, null);
  layer.dispose();
  priorTexture.dispose();
  target.scene.texture.dispose();
}

const ordinary = { ...webbPlateTile(provider, 0, 0), texture: new THREE.Texture() };
entries = [ordinary];
const layer = new SkyDetailLayer(manager, 'scope', true, true);
layer.update(view, true);
assert.deepEqual(layer.group.children[0].material.defines, {});
layer.resolveByteFilm({ render: () => assert.fail('ordinary sky requested archive pass') });
layer.dispose();
ordinary.texture.dispose();
console.log(
  'Archive renderer: transfer functions, shared source textures and isolated byte-detector pass passed.'
);

// The verified original JPEG and older saved pyramid have different file identities.
// Test both directions of a package round trip and every registered native dimension.
for (const [slug, size, profile] of [
  ['heic0513d', [362, 362], 'srgb'],
  ['heic0608d', [404, 404], 'srgb'],
  ['heic0816a', [1502, 1482], 'adobe'],
]) {
  const p = HUBBLE_PLATE_PROVIDERS.find((item) => item.artworkSlug === slug);
  const service = new SkyDetail({ providers: [p] }, { source: 'hubble' });
  const framing = { ...frameSkyArtwork(p, p.plate.direction, 1.6, 0.1), pixelHeight: 1200 };
  service.setArtwork(p.id);
  const [tile, ...rest] = service.plan(framing).tiles;
  assert.equal(rest.length, 0);
  assert.ok(tile.url.endsWith('/large/' + slug + '.jpg'));
  assert.equal(tile.archiveProfile, profile);
  assert.deepEqual([tile.width, tile.height], size);
  assert.ok(validSkyImageDimensions(tile, ...size));
  assert.equal(validSkyImageDimensions(tile, size[0] + 1, size[1]), false);
  const native = service.offline.planArtwork({ provider: p, view: framing, fieldOnly: true });
  assert.equal(native.items.length, 1);
  assert.equal(native.items[0].key, tile.key);
  assert.equal(native.estimatedBytes, p.nativeImage.bytes);
  assert.equal(service.offline.planRecord(native).id, native.id);
  const old = service.offline.planArtwork({ provider: p, view: framing, savedPyramid: true });
  assert.notEqual(old.id, native.id);
  assert.ok(old.items.length > 1);
  assert.deepEqual(
    service.offline.planRecord(old).items.map((t) => t.key),
    old.items.map((t) => t.key)
  );
  service.setArtwork(p.id, p.maxOrder);
  const saved = service.plan(framing).tiles;
  assert.ok(saved.every((t) => t.cacheOnly && old.items.some((item) => item.key === t.key)));
  service.setArtwork(p.id);
  assert.equal(service.plan(framing).tiles[0].key, tile.key);
  service.dispose();
}
console.log(
  'Native Hubble renditions, exact dimensions and existing offline pyramid editions passed.'
);
