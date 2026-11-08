import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { build } from 'esbuild';
import { BIRTHDAY_ZODIAC, BIRTHDAY_MANSIONS } from '../src/birthday-content.js';
import { ConstellationArt } from '../src/constellation-art.js';
import { constellationArtMesh } from '../src/constellation-art-math.js';
import { equatorial } from '../src/environment-math.js';
import { ConstellationArtLayer } from '../src/constellation-art-layer.js';
import { Texture, ZeroFactor, OneFactor, SrcAlphaFactor } from 'three';

const { outputFiles } = await build({
  stdin: {
    contents:
      "export * from './src/birthday-card-render.js'; export {getSkyCulture} from './src/sky-cultures.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const {
  birthdaySkyView,
  projectBirthdayStar,
  fitBirthdayWish,
  getSkyCulture,
  configureBirthdayArtworkRenderer,
  birthdayCardInscription,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const json = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url)));
const art = new ConstellationArt(json('../assets/constellation-art/manifest.json'), {
  chinese: json('../assets/chinese-sky/art/manifest.json'),
});
// Exercise the actual layer's blend contract against the export renderer's
// clear state: transparent clear previously produced RGB with alpha zero,
// which disappeared when copied to the final Canvas 2D card.
const rendererState = {};
configureBirthdayArtworkRenderer({
  setPixelRatio(value) {
    rendererState.pixelRatio = value;
  },
  setClearColor(color, alpha) {
    Object.assign(rendererState, { color, alpha });
  },
});
const frame = art.cultures.get('western').frames[0];
const texture = new Texture();
const layer = new ConstellationArtLayer(
  {
    update: () => [{ frame, texture, born: -10000 }],
    status: () => ({ ready: 1 }),
    release() {},
  },
  'birthday-alpha-test'
);
layer.update(birthdaySkyView(frame, { lines: [] }), true);
const material = layer.meshes.get(frame.id).material;
assert.equal(material.blendSrc, SrcAlphaFactor);
assert.equal(material.blendDst, OneFactor);
assert.equal(material.blendSrcAlpha, ZeroFactor);
assert.equal(material.blendDstAlpha, OneFactor);
assert.equal(rendererState.color, 0);
const outputAlpha = 0.4 * 0 + rendererState.alpha * 1;
assert.equal(outputAlpha, 1, 'artwork must stay opaque when copied from WebGL to Canvas 2D');
const screen = (backdrop, source, alpha) => backdrop + source * (1 - backdrop) * alpha;
assert.equal(screen(0.12, 0, outputAlpha), 0.12, 'black clear must not alter the card background');
assert(
  screen(0.12, 0.7 * 0.4, outputAlpha) > 0.12,
  'additive artwork must remain visible in the PNG'
);
layer.dispose();
texture.dispose();
let checked = 0;
for (const item of [...BIRTHDAY_ZODIAC, ...BIRTHDAY_MANSIONS]) {
  const target = getSkyCulture(item.culture).asterisms.find((x) => x.targetId === item.targetId);
  const frame = art.cultures
    .get(item.culture)
    .frames.find((x) => x.record.imageId === item.artworkId);
  assert(target && frame, item.targetId);
  assert.notEqual(
    frame.record.kind,
    'symbols',
    'birthday must use its own artwork, not a regional overview'
  );
  assert(existsSync(new URL('../' + frame.record.file, import.meta.url)), item.artworkId);
  const mesh = constellationArtMesh(frame, 16);
  const directions = [];
  for (let i = 0; i < mesh.positions.length; i += 3)
    directions.push(Array.from(mesh.positions.slice(i, i + 3)));
  for (const path of target.lines || [])
    for (const pair of path) directions.push(equatorial(...pair));
  for (const star of target.members || []) directions.push(equatorial(star.ra, star.dec));
  // Card and pure-sky layouts must frame both the registered artwork and stars.
  for (const aspect of [1560 / 1070, 1020 / 610, 1630 / 1140, 1030 / 1182]) {
    const view = birthdaySkyView(frame, target, aspect);
    assert(Number.isFinite(view.fovY) && view.fovY > 0 && view.fovY < 130, item.targetId);
    const center = projectBirthdayStar(frame.center, view, 1000, 1000 / aspect);
    assert(Math.abs(center[0] - 500) < 1e-8);
    assert(Math.abs(center[1] - 500 / aspect) < 1e-8);
    for (const direction of directions) {
      const point = projectBirthdayStar(direction, view, 1000, 1000 / aspect);
      assert(point && point.every(Number.isFinite), item.targetId);
      assert(
        point[0] >= 0 && point[0] <= 1000 && point[1] >= 0 && point[1] <= 1000 / aspect,
        item.targetId + ' clipped'
      );
    }
    assert.equal(
      projectBirthdayStar(
        frame.center.map((x) => -x),
        view,
        1000,
        1000
      ),
      null
    );
  }
  checked++;
}
art.dispose();
assert.equal(checked, 40);

const ctx = {
  font: '',
  measureText(value) {
    return { width: [...value].length * parseFloat(this.font) };
  },
};
for (const [width, size, height] of [
  [910, 32, 132],
  [1410, 47, 235],
]) {
  for (const wish of [
    '愿君前程万里，振翅高飞。',
    '福'.repeat(120),
    'Happy birthday 星河灿烂🌠'.repeat(5),
  ]) {
    const result = fitBirthdayWish(ctx, wish, width, size, height);
    assert.equal(
      result.lines.join(''),
      wish,
      'personal text must survive without ellipsis or missing characters'
    );
    assert(result.lines.length * result.lineHeight <= height);
    assert(result.lines.every((line) => [...line].length * result.size <= width));
  }
}
assert.deepEqual(fitBirthdayWish(ctx, '第一行\n第二行', 910, 32, 132).lines, ['第一行', '第二行']);
assert.throws(() => fitBirthdayWish(ctx, '福'.repeat(121), 910, 32, 132), /120/);
assert.throws(() => fitBirthdayWish(ctx, '福\n'.repeat(50), 910, 32, 132), /换行/);
const dedication = birthdayCardInscription({
  date: '2004-11-09',
  sender: '小王',
  giftDate: '2026-11-09',
});
assert.equal(dedication.birthday, '生辰 2004 · 11 · 09');
assert.equal(dedication.signature, '来自 小王  ·  2026 · 11 · 09');
assert.equal(birthdayCardInscription({ sender: '小王' }).signature, '来自 小王');
assert.equal(birthdayCardInscription({ giftDate: '2026-11-09' }).signature, '2026 · 11 · 09');
assert.equal(birthdayCardInscription({}).signature, '');
assert.equal(birthdayCardInscription({ sender: '名'.repeat(40) }).sender, '名'.repeat(40));
assert.throws(() => birthdayCardInscription({ sender: '名'.repeat(41) }), /40/);
assert.equal(birthdayCardInscription({ giftDate: '2024-02-29' }).giftDate, '2024-02-29');
for (const giftDate of ['2026-02-29', '2026-13-01', '2026-04-31', '0000-01-01', '2026-1-9'])
  assert.throws(() => birthdayCardInscription({ giftDate }), /有效/);
const pureInscription = birthdayCardInscription({
  date: '2004-11-09',
  sender: '小王',
  giftDate: '2026-11-09',
  layout: 'sky',
});
assert.equal(pureInscription.birthday, '');
assert.equal(pureInscription.signature, '');
console.log(
  'Birthday card: 40 artwork/star fields fit all layouts; full-length wishes and optional gift inscriptions verified.'
);
