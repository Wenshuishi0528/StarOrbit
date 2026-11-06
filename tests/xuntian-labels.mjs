import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { DEEP_SKY_OBJECTS } from '../src/deep-sky-catalog.js';
import { EARTH_RADIUS } from '../src/orbit.js';
import { cameraAxes, lookDirection } from '../src/xuntian-pointing.js';
import { equatorial } from '../src/environment-math.js';

const bundle = await build({
  stdin: {
    contents:
      "export {finderLabels} from './src/xuntian-labels.js';export {buildSkyAnnotationLayout} from './src/sky-annotation-layout.js';export {getXuntianTarget} from './src/xuntian-catalog.js';",
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { finderLabels, buildSkyAnnotationLayout, getXuntianTarget } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);
const size = { w: 800, h: 500, aspect: 1.6 },
  identity = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
const target = (id) => DEEP_SKY_OBJECTS.find((object) => object.id === id);
const settings = {
  starLabels: false,
  catalogStarLabels: false,
  solarSystemLabels: false,
  constellationNames: false,
  deepSkyObjects: true,
  deepSkyScope: 'featured',
  starLabelDensity: 0.55,
};
const frame = (object) => ({
  q: { t: Date.UTC(2026, 10, 6), earthAxes: identity },
  eyeKm: object.direction.map((v) => v * (EARTH_RADIUS + 405)),
  axes: cameraAxes(lookDirection(object.direction)),
  fovY: 6,
  language: 'zh',
  chartSettings: { ...settings },
});
const inspect = (f, blocked = () => false) => finderLabels(f, size, 1, blocked).labels;
const m31 = frame(target('M31')),
  galaxy = inspect(m31).find((label) => label.text.includes('M31'));
assert(galaxy && galaxy.text.includes('仙女座星系'));
assert.equal(galaxy.symbol.shape, 'ellipse');
assert(galaxy.symbol.width > galaxy.symbol.height);
assert.equal(
  inspect({ ...m31, chartSettings: { ...settings, deepSkyObjects: false } }).filter(
    (label) => label.symbol
  ).length,
  0,
  'shared deep-sky layer disables eyepiece symbols'
);
assert.equal(inspect(m31, () => true).length, 0, 'foreground geometry hides catalogue labels');
assert.equal(
  inspect({ ...m31, eyeKm: m31.eyeKm.map((v) => -v) }).length,
  0,
  'Earth masks labels behind its surface'
);
const california = frame(target('NGC1499'));
assert(
  !inspect({ ...california, chartSettings: { ...settings, deepSkyScope: 'messier' } }).some(
    (label) => label.text.includes('NGC1499')
  )
);
assert(
  inspect({ ...california, chartSettings: { ...settings, deepSkyScope: 'all' } }).some((label) =>
    label.text.includes('NGC1499')
  ),
  'all catalogue scope includes selected NGC objects'
);
for (const label of inspect(m31))
  assert(
    label.rect.x >= 0 &&
      label.rect.y >= 0 &&
      label.rect.x + label.rect.w <= size.w &&
      label.rect.y + label.rect.h <= size.h
  );
const dense = {
  ...m31,
  fovY: 60,
  chartSettings: {
    ...settings,
    starLabels: true,
    catalogStarLabels: true,
    constellationNames: true,
    starLabelDensity: 1,
  },
};
const finder = finderLabels(dense, size, 1, () => false),
  shared = buildSkyAnnotationLayout({
    settings: dense.chartSettings,
    axes: dense.axes,
    eyeKm: dense.eyeKm,
    q: dense.q,
    fovY: dense.fovY,
    width: size.w,
    height: size.h,
    language: dense.language,
  });
assert.deepEqual(
  finder.labels,
  shared.labels,
  'eyepiece and main sky must use the identical candidates and layout'
);
assert(
  finder.labels.length > 96 && finder.unfiltered,
  'maximum density has no old 32/96/100 label cap'
);
assert(
  finder.labels.some((label) => label.kind === 'star' && label.text.startsWith('HIP ')),
  'unnamed stars keep their catalogue identifier'
);
assert(
  finder.labels.some((label) => label.kind === 'constellation'),
  'constellation names are inherited'
);
const namesOff = inspect({
  ...dense,
  chartSettings: { ...dense.chartSettings, starLabels: false, catalogStarLabels: false },
});
assert(
  !namesOff.some((label) => label.kind === 'star') &&
    namesOff.some((label) => label.kind === 'constellation'),
  'categories are independently inherited'
);
const orion = {
  ...frame(target('M42')),
  fovY: 15,
  chartSettings: {
    ...settings,
    deepSkyObjects: false,
    catalogStarLabels: true,
    starLabelDensity: 1,
  },
};
assert(
  inspect(orion).some((label) => label.text.startsWith('Tycho-2')),
  'maximum density also annotates the shipped Tycho cutouts'
);

// Use the actual compact finder's logical size, not its larger Retina buffer.
// Formerly the long name fitted neither side of a centered object and vanished.
for (const id of ['NGC6960', 'M31', 'NGC1499']) {
  for (const width of [240, 280, 288, 320, 360, 800]) {
    for (const fovY of [13.8, 0.006]) {
      for (const density of [0, 0.55, 0.95]) {
        for (const hud of [false, true]) {
          const height = width / 1.6,
            small = { w: width, h: height };
          const aimed = {
            ...frame(target(id)),
            fovY,
            chartSettings: {
              ...settings,
              starLabels: true,
              catalogStarLabels: true,
              constellationNames: true,
              starLabelDensity: density,
            },
          };
          const layout = finderLabels(aimed, small, 1, () => false, { hud });
          const label = layout.labels.find((item) => item.key === 'deep-' + id);
          assert(label, `${id} must stay visible at ${width}px / ${fovY}° / density ${density}`);
          assert.equal(
            layout.labels[0],
            label,
            'the manually centered object has first choice of space'
          );
          const edge = hud ? 24 : 5;
          assert(
            label.rect.x >= 5 &&
              label.rect.y >= edge &&
              label.rect.x + label.rect.w <= width - 5 &&
              label.rect.y + label.rect.h <= height - edge
          );
          const left = label.x - label.symbol.width / 2,
            top = label.y - label.symbol.height / 2;
          assert(
            label.rect.x >= left + label.symbol.width ||
              label.rect.x + label.rect.w <= left ||
              label.rect.y >= top + label.symbol.height ||
              label.rect.y + label.rect.h <= top,
            'the locator and its name remain distinct'
          );
          assert.deepEqual(
            finderLabels(aimed, { w: width * 2, h: height * 2 }, 2, () => false, { hud }).labels,
            layout.labels,
            'Retina scaling preserves logical placement'
          );
        }
      }
    }
  }
}
const compact = { w: 288, h: 180 },
  veil = {
    ...frame(target('NGC6960')),
    fovY: 13.8,
    focusTargetId: 'deep-sky:ngc6960',
    chartSettings: {
      ...settings,
      starLabels: true,
      catalogStarLabels: true,
      constellationNames: true,
      starLabelDensity: 0.95,
    },
  };
for (const offset of [-0.45, -0.1, 0, 0.1, 0.45]) {
  const direction = veil.axes.forward.map(
    (value, i) => value + veil.axes.right[i] * Math.tan((offset * Math.PI) / 180)
  );
  const panned = { ...veil, axes: cameraAxes(lookDirection(direction)) };
  for (const language of ['zh', 'en', 'ru', 'fr']) {
    const labels = finderLabels({ ...panned, language }, compact, 1, () => false).labels;
    assert.equal(
      labels[0]?.key,
      'deep-NGC6960',
      `searched object survives center crossing in ${language}`
    );
  }
}
assert(
  !finderLabels(
    { ...veil, chartSettings: { ...veil.chartSettings, deepSkyObjects: false } },
    compact,
    1,
    () => false
  ).labels.some((label) => label.key === 'deep-NGC6960')
);
assert(
  !finderLabels(
    { ...veil, chartSettings: { ...veil.chartSettings, deepSkyScope: 'messier' } },
    compact,
    1,
    () => false
  ).labels.some((label) => label.key === 'deep-NGC6960'),
  'selection respects the shared catalogue scope'
);
assert.equal(
  finderLabels(veil, compact, 1, () => true).labels.length,
  0,
  'selection does not bypass spacecraft occlusion'
);
assert.equal(
  finderLabels({ ...veil, eyeKm: veil.eyeKm.map((value) => -value) }, compact, 1, () => false)
    .labels.length,
  0,
  'selection does not bypass Earth'
);
const faint = {
  ...frame(getXuntianTarget('hip:1011')),
  fovY: 13.8,
  focusTargetId: 'hip:1011',
  chartSettings: {
    ...settings,
    catalogStarLabels: true,
    deepSkyObjects: false,
    starLabelDensity: 0,
  },
};
assert.equal(
  finderLabels(faint, compact, 1, () => false).labels[0]?.text,
  'HIP 1011',
  'search keeps the explicit faint target despite low background density'
);
assert(
  !finderLabels({ ...faint, focusTargetId: null }, compact, 1, () => false).labels.some(
    (label) => label.key === 'star-1011'
  ),
  'background magnitude filtering is unchanged'
);
assert(
  !finderLabels(
    { ...faint, chartSettings: { ...faint.chartSettings, catalogStarLabels: false } },
    compact,
    1,
    () => false
  ).labels.some((label) => label.key === 'star-1011'),
  'selection respects the catalogue-star switch'
);
assert.equal(
  finderLabels(faint, compact, 1, () => true).labels.length,
  0,
  'selected faint star still respects physical occlusion'
);
const atReticle = finderLabels(faint, compact, 1, () => false, { hud: true }).labels[0];
assert(
  atReticle.rect.x < compact.w / 2 + 12 && atReticle.rect.y < compact.h / 2 + 12,
  'there is no exclusion zone around the 23px reticle'
);
const selectedFinder = finderLabels(veil, compact, 1, () => false);
const selectedShared = buildSkyAnnotationLayout({
  settings: veil.chartSettings,
  axes: veil.axes,
  eyeKm: veil.eyeKm,
  q: veil.q,
  fovY: veil.fovY,
  width: compact.w,
  height: compact.h,
  focusTargetId: veil.focusTargetId,
  language: veil.language,
});
assert.deepEqual(
  selectedFinder.labels,
  selectedShared.labels,
  'selected targets use one layout in the main sky, finder and photos'
);
const lmcDirection = equatorial(81.75, -69.69);
const lmcFrame = {
  ...frame(target('LMC')),
  axes: cameraAxes(lookDirection(lmcDirection)),
  eyeKm: lmcDirection.map((v) => v * (EARTH_RADIUS + 405)),
  fovY: 0.006,
};
for (const language of ['zh', 'en', 'fr', 'ru']) {
  const view = { ...lmcFrame, language };
  const labels = finderLabels(view, compact, 1, () => false, { hud: true }).labels;
  const label = labels.find((item) => item.targetId === 'deep-sky:lmc');
  assert(
    label?.regionOnly && !label.symbol,
    'offscreen center is replaced by region context, never a false center symbol'
  );
  assert(label.rect.y >= 24 && label.rect.y + label.rect.h <= compact.h - 24);
}
assert(
  finderLabels({ ...lmcFrame, fovY: 13.8 }, compact, 1, () => false).labels.some(
    (item) => item.key === 'deep-LMC'
  ),
  'the reported wide LMC view has the catalogue name'
);
assert.equal(
  finderLabels(
    { ...lmcFrame, chartSettings: { ...settings, deepSkyObjects: false } },
    compact,
    1,
    () => false
  ).labels.length,
  0
);
assert.equal(
  finderLabels(
    { ...lmcFrame, chartSettings: { ...settings, deepSkyScope: 'messier' } },
    compact,
    1,
    () => false
  ).labels.length,
  0
);
assert.equal(finderLabels(lmcFrame, compact, 1, () => true).labels.length, 0);
assert.equal(
  finderLabels({ ...lmcFrame, eyeKm: lmcFrame.eyeKm.map((v) => -v) }, compact, 1, () => false)
    .labels.length,
  0
);
console.log(
  'Xuntian labels: compact/Retina/extreme zoom placement, selected and centered priorities, categories, uncapped density, main/eyepiece parity and physical occlusion passed.'
);
