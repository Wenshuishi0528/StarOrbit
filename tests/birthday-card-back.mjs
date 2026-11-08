import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { BIRTHDAY_ZODIAC, BIRTHDAY_MANSIONS } from '../src/birthday-content.js';
import { ConstellationArt } from '../src/constellation-art.js';

const { outputFiles } = await build({
  stdin: {
    contents:
      "export * from './src/birthday-card-back.js'; export * from './src/birthday-card-render.js'; export * from './src/birthday-sky-frame.js'; export {getSkyCulture} from './src/sky-cultures.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const {
  birthdayBackLayout,
  birthdayBackSettings,
  birthdaySkyView,
  birthdaySkyFrame,
  getSkyCulture,
  renderBirthdayBack,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);

for (const [count, layout, width, height] of [
  [1, 'card', 1800, 2400],
  [2, 'card', 2400, 1500],
  [1, 'sky', 1800, 1350],
  [2, 'sky', 2400, 1392],
]) {
  const result = birthdayBackLayout({ count, layout });
  assert.equal(result.width, width);
  assert.equal(result.height, height);
  assert.equal(result.panels.length, count);
  for (const panel of result.panels) {
    assert(panel.x >= 0 && panel.y >= 0 && panel.w > 0 && panel.h > 0);
    assert(panel.x + panel.w <= result.W);
    assert(panel.y + panel.h <= result.H - 90, 'scene cannot cover bottom credits');
  }
  if (count === 2) assert(result.panels[0].x + result.panels[0].w < result.panels[1].x);
}
assert.throws(() => birthdayBackLayout({ count: 0 }), /一个或两个/);

const preferences = Object.freeze({
  backLabels: false,
  backArtwork: true,
  showLines: false,
  brightness: Object.freeze({ western: 1.4, chinese: 0.6 }),
});
for (const culture of ['western', 'chinese']) {
  const settings = birthdayBackSettings(preferences, culture);
  assert.equal(settings.skyCulture, culture);
  assert.equal(settings.starLabels, false);
  assert.equal(settings.solarSystemLabels, false);
  assert.equal(settings.constellationNames, false);
  assert.equal(settings.constellationLines, false);
  assert.equal(settings.constellationArt, true, 'artwork is independent of names and lines');
  assert.equal(settings.chineseSymbolArt, false);
  assert.equal(settings.westernArtBrightness, 1.4);
  assert.equal(settings.chineseArtBrightness, 0.6);
  const defaults = birthdayBackSettings({}, culture);
  assert(defaults.starLabels && defaults.constellationNames && defaults.solarSystemLabels);
  assert.equal(defaults.constellationArt, false);
}

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const art = new ConstellationArt(json('../assets/constellation-art/manifest.json'), {
  chinese: json('../assets/chinese-sky/art/manifest.json'),
});
const environment = Object.freeze({ constellationArt: art });
let verified = 0;
for (const item of [...BIRTHDAY_ZODIAC, ...BIRTHDAY_MANSIONS]) {
  const frame = art.cultures
    .get(item.culture)
    .frames.find((x) => x.record.imageId === item.artworkId);
  const target = getSkyCulture(item.culture).asterisms.find((x) => x.targetId === item.targetId);
  const original = JSON.stringify(frame.record);
  for (const count of [1, 2])
    for (const layout of ['card', 'sky']) {
      const panel = birthdayBackLayout({ count, layout }).panels[0];
      const view = birthdaySkyView(frame, target, panel.w / panel.h);
      view.fovY = Math.max(28, view.fovY);
      const capture = birthdaySkyFrame({
        date: '2004-11-09',
        view,
        culture: item.culture,
        targetId: item.targetId,
        chartSettings: birthdayBackSettings({}, item.culture),
      });
      assert(capture.fovY >= 28 && capture.fovY < 179);
      assert.equal(capture.q.t, Date.parse('2004-11-09T12:00:00Z'));
      assert.equal(capture.focusTargetId, item.targetId);
      assert.equal(capture.chartSettings.skyCulture, item.culture);
      assert.deepEqual(capture.eyeKm, [0, 0, 0]);
    }
  assert.equal(
    JSON.stringify(frame.record),
    original,
    'back framing must not modify source artwork registration'
  );
  verified++;
}
const signal = AbortSignal.abort();
await assert.rejects(
  renderBirthdayBack({
    environment,
    renderer: {},
    items: [BIRTHDAY_MANSIONS[0]],
    date: '2004-11-09',
    signal,
  }),
  { name: 'AbortError' },
  'cancelled capture must stop before opening GPU resources or fetching textures'
);
art.dispose();
assert.equal(verified, 40);
console.log(
  'Birthday back: matching front/back sizes, 40 independent dated sky fields, culture switches, immutable artwork and preflight cancellation passed.'
);
