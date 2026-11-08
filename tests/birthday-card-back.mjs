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
  birthdayBackView,
  birthdayBackTarget,
  requireBirthdaySurvey,
  birthdaySkyView,
  birthdaySkyFrame,
  getSkyCulture,
  renderBirthdayBack,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);

for (const [backFormat, mode, layout, width, height] of [
  ['landscape','dual','card',2400,1500], ['landscape','chinese','sky',2400,1500],
  ['portrait','western','card',1800,2400], ['match','dual','card',2400,1500],
  ['match','chinese','card',1800,2400], ['match','dual','sky',2400,1392],
  ['match','western','sky',1800,1350],
]) {
  const result = birthdayBackLayout({backFormat, mode, layout});
  assert.equal(result.width,width); assert.equal(result.height,height);
  assert.equal(result.panels.length,1,'one independent full-frame back');
  assert.equal(result.panels[0].w/result.panels[0].h,width/height);
}
const preferences=Object.freeze({ backLabels:false, backNames:false, backPlanets:false,
  backArtwork:true, backLines:false, showLines:true, backArtBrightness:.7,
  backGrid:true,backEcliptic:true,backDeepSky:true,backDensity:.3,
  brightness:Object.freeze({western:1.9,chinese:1.8}) });
for (const culture of ['western','chinese']) {
 const settings=birthdayBackSettings(preferences,culture);
 assert.equal(settings.skyCulture,culture);
 for(const key of ['starLabels','constellationNames','solarSystemLabels','constellationLines'])assert.equal(settings[key],false);
 for(const key of ['constellationArt','equatorialGrid','eclipticLine','deepSkyObjects'])assert.equal(settings[key],true);
 assert.equal(settings.westernArtBrightness,.7);assert.equal(settings.chineseArtBrightness,.7);
 assert.equal(settings.starLabelDensity,.3);
}
for(const mode of ['dual','western','chinese']) {
 const options={mode,backCulture:'chinese',western:BIRTHDAY_ZODIAC[7],mansion:BIRTHDAY_MANSIONS[26]};
 assert.equal(birthdayBackTarget(options),BIRTHDAY_MANSIONS[26]);
 assert.equal(birthdayBackTarget({...options,backCulture:'western'}),BIRTHDAY_ZODIAC[7]);
}
assert.throws(()=>birthdayBackTarget({items:[1,2]}));
for(const state of [null,{complete:false,source:'dss'},{complete:true,source:'galaxy'},{complete:true,source:'dss',sources:[]}])assert.throws(()=>requireBirthdaySurvey(state));
requireBirthdaySurvey({complete:true,source:'dss',sources:[{id:'dss-color'}]});

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
  for (const backFormat of ['landscape','portrait'])
    for (const rotation of [0,90,-180]) {
      const panel = birthdayBackLayout({backFormat}).panels[0];
      const view = birthdayBackView(frame, target, panel.w / panel.h, {backRotation:rotation,backPanX:.3,backPanY:-.2,backZoom:1.2});
      const capture = birthdaySkyFrame({
        date: '2004-11-09',
        view,
        culture: item.culture,
        targetId: item.targetId,
        chartSettings: birthdayBackSettings({}, item.culture),
      });
      assert(capture.fovY >= 8 && capture.fovY <= 120);
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
  'Birthday back: independent postcard sizes/cultures/settings, 40 dated sky fields with rotation/pan, complete DSS gating, immutable artwork and cancellation passed.'
);
