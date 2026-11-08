import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { normalizeStarChartSettings, skyCultureArtOptions, skyCultureArtEnabled } from '../src/star-chart-settings.js';
import { validateScene } from '../src/scene-format.js';
import { skyCulturePhotoCredit } from '../src/sky-culture-caption.js';

const bundle = await build({ stdin: { contents: `export * from './src/xuntian-catalog.js'; export * from './src/sky-cultures.js'; export { constellationArtFrame, constellationArtDirection } from './src/constellation-art-math.js'; export { chineseSkyArtProvider } from './src/chinese-sky-art.js'; export { skyOverviewTarget } from './src/sky-culture-controls.js';`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const chinese = api.getSkyCulture('chinese');
assert.equal(normalizeStarChartSettings().skyCulture, 'western');
assert.equal(normalizeStarChartSettings({ skyCulture: 'chinese' }, { strict: true }).skyCulture, 'chinese');
assert.throws(() => normalizeStarChartSettings({ skyCulture: 'unknown' }, { strict: true }));
const oldScene = JSON.parse(readFileSync('docs/examples/scene-dfh1-model.json'));
assert.equal(validateScene(oldScene).environment.skyCulture, 'western');
const newScene = structuredClone(oldScene); newScene.environment.skyCulture = 'chinese';
newScene.environment.chineseSymbolArt = true;
assert.equal(validateScene(JSON.parse(JSON.stringify(newScene))).environment.skyCulture, 'chinese');
assert.equal(validateScene(JSON.parse(JSON.stringify(newScene))).environment.chineseSymbolArt, true);
assert.equal(validateScene(newScene).simulation.time, validateScene(oldScene).simulation.time);
assert.equal(normalizeStarChartSettings().chineseSymbolArt, false);
assert.throws(() => normalizeStarChartSettings({chineseSymbolArt:'yes'}, {strict:true}));
assert.deepEqual(skyCultureArtOptions({skyCulture:'chinese',constellationArt:false,chineseSymbolArt:true}),{culture:'chinese',asterisms:false,symbols:true,overviewOpacity:.2,artBrightness:1});
assert.equal(skyCultureArtEnabled({skyCulture:'chinese',constellationArt:false,chineseSymbolArt:true}),true);
assert.equal(skyCultureArtEnabled({skyCulture:'chinese',constellationArt:false,chineseSymbolArt:false}),false);
assert.equal(skyCultureArtEnabled({skyCulture:'western',constellationArt:false,chineseSymbolArt:true}),false);

for (const asterism of chinese.asterisms) {
  const target = api.getXuntianTarget(asterism.targetId, 'zh', 'chinese');
  assert(target && target.type === 'asterism', asterism.targetId);
  assert.equal(target.name, asterism.zh);
  assert.equal(target.id, asterism.targetId);
  assert.equal(target.identifier, chinese.groups.find((g) => g.id === asterism.groupId).zh);
  assert(Number.isFinite(target.fov) && target.fov > 0 && target.fov < 180);
  assert(target.direction.every(Number.isFinite));
  assert.equal(new Set(target.memberHips).size, target.memberHips.length);
  const primary = new Set([
    ...(asterism.primaryMemberHips || []).map(hip => 'hip:' + hip),
    ...(asterism.primaryMemberObjectIds || []),
  ]);
  for (const member of asterism.members)
    if (primary.has(member.physicalId)) {
      const ra = member.ra * Math.PI / 180, dec = member.dec * Math.PI / 180;
      const direction = [Math.cos(dec)*Math.cos(ra),Math.cos(dec)*Math.sin(ra),Math.sin(dec)];
      const angle = Math.acos(Math.max(-1,Math.min(1,direction.reduce((s,v,i) => s+v*target.direction[i],0)))) * 180/Math.PI;
      assert(angle <= target.radius + 1e-5, `${asterism.zh}: ${member.physicalId} lies outside its primary target footprint`);
    }
  assert.deepEqual(target.primaryMemberHips,asterism.primaryMemberHips);
}
for (const query of ['北斗', 'Běi Dǒu', 'beidou']) {
  const first = api.searchXuntianTargets(query, 'zh', 12, 'chinese')[0];
  assert.equal(first?.type, 'asterism', query);
  assert.equal(first?.name, '北斗', query);
}
const vega = api.getXuntianTarget('hip:91262', 'zh', 'chinese');
assert(vega.name.includes('织女'));
assert(vega.asterisms.some((a) => a.name === '织女'));
assert.equal(api.getXuntianTarget('hip:91262', 'en', 'western').name, 'Vega');
assert.deepEqual(vega.direction, api.getXuntianTarget('hip:91262', 'en', 'western').direction);
for (const query of ['织女一', '織女一'])
  assert.equal(api.searchXuntianTargets(query, 'zh', 12, 'chinese')[0]?.id, 'hip:91262');
for (const [simplified, traditional] of [['轩辕', '軒轅'], ['天钺', '天鉞'], ['娄宿', '婁宿']])
  assert.equal(api.searchXuntianTargets(simplified, 'zh', 12, 'chinese')[0]?.id,
    api.searchXuntianTargets(traditional, 'zh', 12, 'chinese')[0]?.id, traditional);
for (const star of chinese.otherStars || []) {
  for (const query of [star.id, 'Gaia DR3 ' + star.id.slice(5), star.id.slice(5)])
    assert.equal(api.searchXuntianTargets(query, 'zh', 12, 'chinese')[0]?.id, star.id, query);
  const physical = api.queryXuntianStars(api.getXuntianTarget(star.id, 'zh', 'chinese').direction, 0.00001);
  assert(physical.some((p) => p.id === star.id), star.id);
  assert.equal(typeof star.id, 'string');
}
const all = api.queryXuntianStars([1, 0, 0], 180);
assert.equal(api.getXuntianTarget('deep:NGC2632', 'zh', 'chinese').id,
  api.getXuntianTarget('NGC2632', 'zh', 'chinese').id);
assert.equal(all.filter((p) => p.source === 'gaia').length, chinese.otherStars.length);
assert.equal(new Set(all.map((p) => p.id)).size, all.length);
assert(all.every((p) => p.bv === null || Number.isFinite(p.bv)));
const dataOnly = skyCulturePhotoCredit({ ready: 0 }, { skyCulture: 'chinese' }, true);
assert(dataOnly.caption.includes('CC BY-SA 4.0'));
assert(!dataOnly.caption.includes('Johan'));
assert.equal(skyCulturePhotoCredit({ ready: 0 }, { skyCulture: 'chinese' }, false).ready, 0);
for (const [hip, ra, dec, mag] of JSON.parse(readFileSync('assets/stars.json'))) {
  const point = api.getXuntianTarget('hip:' + hip);
  assert(point);
  // The old catalogue remains physically unchanged when culture is added.
  assert(Math.abs(point.dec - dec) < 1e-7);
}
const manifest = JSON.parse(readFileSync('assets/chinese-sky/art/manifest.json'));
assert.equal(manifest.artworks, chinese.asterisms.length + 7);
assert.equal(new Set(manifest.images.map((r) => r.original)).size, chinese.asterisms.length + 7);
assert.equal(new Set(manifest.images.filter(r => r.kind === 'symbols').map(r => r.original)).size,7);
assert.equal(new Set(manifest.images.filter(r => r.kind === 'asterisms').map(r => r.original)).size,chinese.asterisms.length);
for (const a of chinese.asterisms) assert(manifest.images.some(r => r.kind === 'asterisms' && r.targetIds.includes(a.targetId)),a.zh+' independent illustration');
assert.equal(manifest.registrationComplete,true);
const runtime = {version:manifest.version,artworks:manifest.artworks,images:manifest.images.map(record => ({imageId:record.imageId,url:'test://'+record.imageId}))};
const provider = api.chineseSkyArtProvider(runtime);
assert.equal(provider.images.length,manifest.images.length);
for (const record of provider.images) {
  const source = manifest.images.find(image => image.imageId === record.imageId);
  assert.deepEqual(record.mesh,source.mesh,'minimal runtime URLs retain the full registered geometry');
  assert.equal(record.url,'test://'+record.imageId);
}
for (const record of manifest.images.filter(r => r.kind === 'symbols')) {
  const target = api.skyOverviewTarget(record,chinese);
  assert(target && target.fov >=24 && target.fov <=110);
  assert(target.memberIds.length > 0);
  assert(target.direction.every(Number.isFinite));
}
for (const group of chinese.groups.filter(group => group.theme !== 'southern' && !['ziwei','taiwei','tianshi'].includes(group.theme))) {
  const stem = group.zh.replace(/宿$/,'');
  const principal = chinese.asterisms.find(a => a.groupId === group.id && [stem,stem+'宿'].includes(a.zh));
  assert(principal,group.zh);
  assert(manifest.images.some(r => r.kind === 'asterisms' && r.targetIds.includes(principal.targetId)),group.zh+' illustration coverage');
}
for (const record of manifest.images) {
  const frame = api.constellationArtFrame(record);
  for (const anchor of record.anchors) {
    const actual = api.constellationArtDirection(frame, anchor.pos[0] / record.width, anchor.pos[1] / record.height);
    // Registered meshes use the same Float32 vertex buffers as the GPU. Their
    // sub-0.03-arcsecond rounding is checked separately in screen pixels too.
    assert(Math.hypot(...actual.map((v, i) => v - anchor.direction[i])) < (record.mesh ? 1e-7 : 1e-9), record.imageId);
  }
  assert(record.targetIds.every((id) => chinese.asterisms.some((a) => a.targetId === id)));
  assert(!manifest.caption.includes('Johan'));
}
console.log('Chinese sky integration: every asterism resolves, physical identities and old scene stay stable, culture search and real registered art passed.');
