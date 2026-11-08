import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Texture, Vector3 } from 'three';
import { ConstellationArt, ART_GPU_BUDGET } from '../src/constellation-art.js';
import { constellationArtFrame } from '../src/constellation-art-math.js';

const western = JSON.parse(
  readFileSync(new URL('../assets/constellation-art/manifest.json', import.meta.url))
);
const image = western.images.find((record) => record.imageId === 'cygnus');
const turn = () => new Promise((resolve) => setImmediate(resolve));
async function until(check) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    assert.ok(Date.now() < deadline, 'culture artwork work did not settle');
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
    fovY: 35,
    aspect: 1.6,
  };
}
function resource() {
  const item = { closed: 0, disposed: 0, texture: new Texture() };
  item.texture.addEventListener('dispose', () => item.disposed++);
  item.image = { close: () => item.closed++ };
  return item;
}
function manager() {
  return new ConstellationArt(
    { images: [image], caption: 'Western author / western license' },
    {
      chinese: {
        images: [{ ...image }],
        caption: 'Chinese modern teaching artwork / separate source',
      },
    }
  );
}

test('Four Symbols and asterism illustrations switch independently and keep a frozen photo', async () => {
  const art = new ConstellationArt({images:[]}, {chinese:{images:[
    {...image,imageId:'four-symbol',kind:'symbols'},
    {...image,imageId:'individual',kind:'asterisms'},
  ]}});
  art.setCulture('chinese');
  const input = {...view(art.frames[0]),fovY:110};
  art.load = async () => resource();
  try {
    art.update('main',input,true,1,{symbols:false,asterisms:true});
    await until(() => art.status('main').complete);
    assert.deepEqual(art.status('main').images,['chinese:individual']);
    await art.prepare('photo',input,true,2500,{culture:'chinese',symbols:true,asterisms:false});
    assert.deepEqual(art.status('photo').images,['chinese:four-symbol']);
    art.update('main',input,true,1,{symbols:true,asterisms:true});
    await until(() => art.status('main').complete);
    assert.equal(art.status('main').ready,2);
    art.update('main',{...input,fovY:4},true,1,{symbols:true,asterisms:false});
    assert.equal(art.status('main').requested,1,'explicit overview stays visible in narrow fields');
    assert.deepEqual(art.status('photo').images,['chinese:four-symbol'],'photo owns its captured layer choices');
    art.release('photo');
    assert.equal(art.entries.size,1,'main still owns its visible overview');
    art.release('main');
    assert.equal(art.entries.size,0);
  } finally {art.dispose();}
});

test('culture artwork uses namespaces and a frozen photo retains its own source and texture', async () => {
  const art = manager(),
    input = view(art.frames[0]),
    resources = [];
  art.load = async (frame) => {
    const value = resource();
    value.culture = frame.culture;
    resources.push(value);
    return value;
  };
  try {
    art.update('main', input, true);
    await until(() => art.status('main').complete);
    const before = await art.prepare('photo', input, true, 2500, { culture: 'western' });
    art.setCulture('chinese');
    art.update('main', input, true);
    await until(() => art.status('main').complete);
    assert.equal(before.culture, 'western');
    assert.equal(art.status('photo').culture, 'western');
    assert.match(art.status('photo').caption, /^Western author/);
    assert.match(art.status('main').caption, /^Chinese modern/);
    assert.equal(art.status('main').images[0], 'chinese:' + image.imageId);
    assert.equal(art.status('photo').images[0], image.imageId);
    assert.notEqual(art.ready('main')[0].texture, art.ready('photo')[0].texture);
    assert.ok(art.status('main').gpuBytes <= ART_GPU_BUDGET);
    art.release('photo');
    assert.equal(resources.find((r) => r.culture === 'western').closed, 1);
    assert.equal(resources.find((r) => r.culture === 'chinese').closed, 0);
    art.release('main');
    assert.equal(art.status('main').gpuBytes, 0);
    assert.ok(resources.every((r) => r.closed === 1 && r.disposed === 1));
  } finally {
    art.dispose();
  }
});

test('an old culture decode cannot revive after switching with the same source image ID', async () => {
  const art = manager(),
    input = view(art.frames[0]),
    jobs = [];
  art.load = (frame, signal) => new Promise((resolve) => jobs.push({ frame, signal, resolve }));
  try {
    art.update('main', input, true);
    art.setCulture('chinese');
    art.update('main', input, true);
    assert.equal(jobs[0].signal.aborted, true);
    const old = resource(),
      current = resource();
    jobs[0].resolve(old);
    await until(() => jobs.length === 2);
    jobs[1].resolve(current);
    await until(() => art.status('main').complete);
    assert.equal(old.closed, 1);
    assert.equal(old.disposed, 1);
    assert.equal(art.ready('main')[0].texture, current.texture);
    assert.equal(art.status('main').culture, 'chinese');
    assert.equal(art.entries.size, 1);
  } finally {
    art.dispose();
  }
});

test('sky anchors on a great circle cannot create a degenerate artwork sheet', () => {
  assert.throws(
    () =>
      constellationArtFrame({
        ...image,
        anchors: [0, 20, 40].map((ra, i) => ({
          pos: [
            [0, 0],
            [image.width, 0],
            [0, image.height],
          ][i],
          direction: [Math.cos((ra * Math.PI) / 180), Math.sin((ra * Math.PI) / 180), 0],
        })),
      }),
    /degenerate projection/
  );
});

const compiled = await build({
  stdin: {
    contents: `
      export { StarChart } from './src/star-chart.js';
      export { getSkyCulture } from './src/sky-cultures.js';
      export { buildSkyAnnotationLayout, getSkyConstellationLines, getSkyConstellationBoundaries } from './src/sky-annotation-layout.js';
      export { snapshot, validateOrbit } from './src/orbit.js';
      export { Group } from 'three';
    `,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const api = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64')
);

test('real Chinese catalogue replaces chart geometry without retaining western boundaries or old labels', () => {
  const env = { settings: {}, backdrop: new api.Group() },
    chart = new api.StarChart(env);
  chart.ensureGeometry();
  const original = [...chart.lines.geometry.attributes.position.array];
  assert.equal(chart.culture, 'western');
  assert.equal(chart.stats.asterisms, 88);
  chart.shown.set('old-western-label', { text: 'Orion' });
  let atlasDisposed = 0;
  chart.texture = { dispose: () => atlasDisposed++ };
  chart.setCulture('chinese');
  assert.ok(
    chart.stats.asterisms > 250,
    'a placeholder catalogue must never pass distribution checks'
  );
  assert.equal(chart.shown.size, 0);
  assert.equal(atlasDisposed, 1);
  assert.equal(chart.texture, null);
  assert.equal(chart.boundaries.geometry.attributes.position.count, 0);
  assert.notDeepEqual([...chart.lines.geometry.attributes.position.array], original);
  const selected = api
    .getSkyCulture('chinese')
    .asterisms.find((item) => item.memberHips.length >= 3);
  chart.updateSelection(selected.targetId);
  assert.equal(chart.stats.selectedTarget, selected.targetId);
  assert.ok(chart.stats.selectedMembers >= 3);
  assert.equal(
    chart.stats.selectedMembers,
    selected.lineMemberHips.length + selected.lineMemberObjectIds.length,
    'the selected outline highlights its primary members, not all added Qing-era names'
  );
  chart.setCulture('western');
  chart.updateSelection(null);
  assert.deepEqual([...chart.lines.geometry.attributes.position.array], original);
  assert.equal(chart.stats.selectedTarget, null);
  assert.equal(chart.selectedLines.geometry.attributes.position.count, 0);
  assert.ok(api.getSkyConstellationLines('chinese').length > 250);
  assert.equal(api.getSkyConstellationBoundaries('chinese').length, 0);
});

test('Chinese selection remains readable at low density while occlusion and category switches still win', () => {
  const culture = api.getSkyCulture('chinese'),
    selected = culture.asterisms.find((item) => item.zh === '北斗' || item.names.zh === '北斗');
  assert.ok(selected, 'the complete source must contain the Big Dipper asterism');
  const radians = Math.PI / 180,
    forward = new Vector3(
      Math.cos(selected.dec * radians) * Math.cos(selected.ra * radians),
      Math.cos(selected.dec * radians) * Math.sin(selected.ra * radians),
      Math.sin(selected.dec * radians)
    ),
    right = forward
      .clone()
      .cross(new Vector3(0, 0, 1))
      .normalize(),
    up = right.clone().cross(forward).normalize(),
    orbit = api.validateOrbit(
      JSON.parse(readFileSync(new URL('../assets/orbit.json', import.meta.url)))
    ),
    q = api.snapshot(orbit, orbit.rows[0][0]),
    settings = {
      skyCulture: 'chinese',
      starLabels: true,
      catalogStarLabels: false,
      solarSystemLabels: false,
      constellationNames: true,
      deepSkyObjects: false,
      starLabelDensity: 0,
    },
    frame = {
      settings,
      axes: { forward: forward.toArray(), right: right.toArray(), up: up.toArray() },
      eyeKm: forward.clone().multiplyScalar(7000).toArray(),
      q,
      fovY: 55,
      width: 900,
      height: 700,
      focusTargetId: selected.targetId,
    };
  const layout = api.buildSkyAnnotationLayout(frame);
  assert.equal(layout.stats.culture, 'chinese');
  assert.ok(layout.labels.some((label) => label.targetId === selected.targetId && label.selected));
  assert.ok(layout.labels.some((label) => label.kind === 'star' && label.selected));
  const hidden = api.buildSkyAnnotationLayout({ ...frame, blocked: () => true });
  assert.equal(hidden.labels.length, 0);
  const disabled = api.buildSkyAnnotationLayout({
    ...frame,
    settings: { ...settings, starLabels: false, constellationNames: false },
  });
  assert.equal(disabled.labels.length, 0);
  const all = api.buildSkyAnnotationLayout({
    ...frame,
    settings: { ...settings, starLabelDensity: 1 },
  });
  assert.equal(all.unfiltered, true);
  assert.ok(all.labels.length >= layout.labels.length);
  assert.ok(
    all.labels.every(
      (label) =>
        label.targetId?.startsWith('asterism:chinese:') ||
        !label.targetId?.startsWith('constellation:')
    )
  );
});

const densityCulture = api.getSkyCulture('chinese'),
  densityOrbit = api.validateOrbit(
    JSON.parse(readFileSync(new URL('../assets/orbit.json', import.meta.url)))
  ),
  densityEpoch = api.snapshot(densityOrbit, densityOrbit.rows[0][0]);
function densityFrame(
  center,
  { fovY = 38, density = 0.95, culture = 'chinese', focus = null, catalog = false } = {}
) {
  const ra = (center.ra * Math.PI) / 180,
    dec = (center.dec * Math.PI) / 180,
    forward = new Vector3(
      Math.cos(dec) * Math.cos(ra),
      Math.cos(dec) * Math.sin(ra),
      Math.sin(dec)
    ),
    right = forward
      .clone()
      .cross(new Vector3(0, 0, 1))
      .normalize(),
    up = right.clone().cross(forward).normalize();
  return {
    settings: {
      skyCulture: culture,
      starLabelDensity: density,
      starLabels: true,
      catalogStarLabels: catalog,
      constellationNames: true,
      solarSystemLabels: false,
      deepSkyObjects: false,
    },
    axes: { forward: forward.toArray(), right: right.toArray(), up: up.toArray() },
    eyeKm: forward.clone().multiplyScalar(7000).toArray(),
    q: densityEpoch,
    fovY,
    width: 1440,
    height: 1000,
    focusTargetId: focus,
  };
}

test('Chinese broad fields show brighter figure members, then reveal added stars with zoom or explicit selection', () => {
  const primary = new Set(
      densityCulture.asterisms.flatMap((item) => [
        ...item.lineMemberHips.map((hip) => 'hip:' + hip),
        ...item.lineMemberObjectIds,
      ])
    ),
    dipper = densityCulture.asterisms.find((item) => item.zh === '北斗'),
    polar = densityCulture.groups.find((item) => item.id === 'ziwei');
  for (const center of [dipper, polar]) {
    const layout = api.buildSkyAnnotationLayout(
        densityFrame(center, { focus: center.targetId || null })
      ),
      stars = layout.labels.filter((label) => label.kind === 'star');
    assert.ok(stars.length > 0, center.zh + ' retains useful star names');
    assert.ok(
      stars.every((label) => primary.has(label.targetId)),
      center.zh + ' suppresses added names in a 38-degree field'
    );
    assert.equal(layout.stats.secondaryStarsEnabled, false);
    if (center === dipper)
      assert.equal(stars.filter((label) => label.selected).length, dipper.lineMemberHips.length);
  }
  const added = densityCulture.stars.find((star) => star.zh === '天璇增三');
  assert.ok(added && !primary.has('hip:' + added.id));
  const id = 'hip:' + added.id,
    medium = api.buildSkyAnnotationLayout(densityFrame(added, { fovY: 12 })),
    close = api.buildSkyAnnotationLayout(densityFrame(added, { fovY: 6 })),
    chosen = api.buildSkyAnnotationLayout(densityFrame(added, { density: 0.1, focus: id })),
    maximum = api.buildSkyAnnotationLayout(densityFrame(added, { density: 1 }));
  assert.equal(
    medium.labels.some((label) => label.targetId === id),
    false
  );
  assert.ok(
    close.labels.some((label) => label.targetId === id),
    'a 6-degree field reveals the real added-star name'
  );
  assert.ok(
    chosen.labels.some((label) => label.targetId === id),
    'an explicitly searched star bypasses density filtering'
  );
  assert.equal(maximum.unfiltered, true);
  assert.ok(
    maximum.labels.some((label) => label.targetId === id),
    'maximum density includes added names even in wide fields'
  );
  assert.equal(
    api.buildSkyAnnotationLayout({ ...densityFrame(added, { density: 1 }), blocked: () => true })
      .labels.length,
    0
  );
});

test('Chinese magnitude decluttering leaves the western automatic-density rule intact', () => {
  const star = densityCulture.stars.find(
    (item) => item.mag >= 4.4 && item.mag <= 5.2 && item.dec > 50
  );
  assert.ok(star);
  const id = 'hip:' + star.id,
    western = api.buildSkyAnnotationLayout(
      densityFrame(star, { culture: 'western', catalog: true })
    ),
    chinese = api.buildSkyAnnotationLayout(
      densityFrame(star, { culture: 'chinese', catalog: true })
    );
  assert.ok(
    western.labels.some((label) => label.targetId === id),
    'western auto density retains the existing faint-star reach'
  );
  assert.equal(
    chinese.labels.some((label) => label.targetId === id),
    false
  );
});
