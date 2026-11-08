import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root));
const json = (path) => JSON.parse(read(path));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const original = json('assets/chinese-sky/source/index.json');
const catalogue = json('assets/chinese-sky/catalog.json');
const existing = new Map(json('assets/stars.json').map((row) => [row[0], row]));
const western = json('assets/star-chart.json');
const compiled = await build({
  entryPoints: [new URL('../src/sky-cultures.js', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const api = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const culture = api.getSkyCulture('chinese');
const byId = new Map(culture.asterisms.map((item) => [item.id, item]));
const stars = new Map(culture.stars.map((star) => [star.id, star]));
const physical = new Map([
  ...culture.stars.map((star) => ['hip:' + star.id, star]),
  ...culture.namedObjects
    .filter((item) => Number.isFinite(item.ra))
    .map((item) => [item.physicalId, item]),
]);
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const point = ([ra, dec]) =>
  Number.isFinite(ra) && Number.isFinite(dec) && ra >= -180 && ra < 180 && dec >= -90 && dec <= 90;
const referenceId = (key) =>
  typeof key === 'number'
    ? 'hip:' + key
    : key.startsWith('DSO:')
      ? 'deep:' + key.slice(4)
      : 'gaia:' + key;
const sourceItem = (name) => culture.asterisms.find((item) => item.zh === name);
// Verified against the pinned source's canonical names AND its explicit
// parent/subsidiary records. These are drawing anchors, not primary members.
const foreignSourceAnchors = new Map([
  ['001', [[21683, '附耳', '附耳(附毕宿)']]],
  ['010', [[29655, '钺', '钺(附井宿)']]],
  [
    '031',
    [
      [60189, '长沙', '长沙(附轸宿)'],
      [61174, '左辖', '左辖(附轸宿)'],
      [59199, '右辖', '右辖(附轸宿)'],
    ],
  ],
  ['069', [[26311, '参宿二', '参宿']]],
  ['072', [[109427, '危宿二', '危宿']]],
  ['084', [[78820, '房宿四', '房宿']]],
  ['101', [[7078, '杠九', '杠(附华盖)']]],
  ['136', [[113881, '室宿二', '室宿']]],
]);
const pathEdges = (paths, excluded = new Set()) =>
  paths
    .flatMap((path) =>
      path
        .slice(1)
        .flatMap((value, i) =>
          excluded.has(path[i]) || excluded.has(value) ? [] : [JSON.stringify([path[i], value])]
        )
    )
    .sort();

assert.equal(
  hash(read('assets/chinese-sky/source/index.json')),
  '426118e6238ae69edb319c91d1a74b705eaa758222e962206e58c49b9dac9d8a'
);
assert.equal(
  hash(read('assets/chinese-sky/source/description.md')),
  'f0dec3d4fb115bb8d5667e96fb9af0450f33489ec02747c8229903c15b3a2cac'
);
assert.equal(culture.source.commit, '3c4a720f313ada6124b86fef24131fa65900133f');
assert.equal(catalogue.schema, 2);
assert.equal(culture.source.license, 'CC BY-SA 4.0');
assert.equal(culture.source.renderedStarCatalogSha256, hash(read('assets/stars.json')));
for (const [path, digest] of Object.entries(culture.source.sha256))
  assert.equal(hash(read('assets/chinese-sky/source/' + path)), digest);

assert.equal(culture.asterisms.length, original.constellations.length);
assert.equal(byId.size, 312);
assert.equal(culture.asterisms.filter((item) => item.isSubsidiary).length, 12);
assert.equal(culture.asterisms.filter((item) => !item.isSubsidiary).length, 300);
assert.equal(culture.groups.length, 32);
assert.deepEqual(culture.boundaries, [], 'Chinese groups must not inherit IAU polygons');
assert.equal(culture.groups.filter((group) => group.type === 'mansion').length, 28);
const grouped = culture.groups.flatMap((group) => group.asterismIds);
assert.equal(grouped.length, 312);
assert.equal(new Set(grouped).size, 312, 'each source asterism has exactly one documented region');

for (const raw of original.constellations) {
  const id = raw.id.split(' ').at(-1);
  const item = byId.get(id);
  assert.ok(item, 'no source record, including a single-object record, may disappear');
  assert.equal(item.sourceId, raw.id);
  assert.equal(item.targetId, `asterism:chinese:${id}`);
  assert.equal(item.zh, raw.common_name.native);
  assert.deepEqual(item.sourceMemberPaths, raw.lines);
  const rawMembers = [...new Set(raw.lines.flat())];
  assert.deepEqual(
    item.sourceLineMemberHips,
    rawMembers.filter((member) => typeof member === 'number').sort((a, b) => a - b)
  );
  assert.deepEqual(
    item.sourceLineMemberObjectIds,
    rawMembers.filter((member) => typeof member !== 'number').map(referenceId)
  );
  const excluded = new Set((foreignSourceAnchors.get(id) ?? []).map(([hip]) => hip));
  assert.deepEqual(
    pathEdges(item.displayMemberPaths),
    pathEdges(raw.lines, excluded),
    'only documented foreign anchors may be removed; a split must not create a new edge'
  );
  assert.equal(item.lines.length, item.displayMemberPaths.length);
  assert.ok(point([item.ra, item.dec]));
  assert.deepEqual(item.labelPositions, [[item.ra, item.dec]]);
  assert.ok(item.radius > 0 && item.radius < 90);
  assert.equal(
    item.primaryMemberStatus.resolved,
    item.primaryMemberHips.length + item.primaryMemberObjectIds.length
  );
  assert.equal(item.primaryMemberStatus.expected, item.declaredPrimaryCount);
  assert.ok(
    item.primaryMemberStatus.evidence.expected && item.primaryMemberStatus.evidence.resolved
  );
  const coreIds = [
    ...item.primaryMemberHips.map((hip) => 'hip:' + hip),
    ...item.primaryMemberObjectIds,
  ];
  assert.ok(coreIds.length > 0);
  const centerRa = (item.ra * Math.PI) / 180;
  const centerDec = (item.dec * Math.PI) / 180;
  for (const physicalId of coreIds) {
    const member = physical.get(physicalId);
    assert.ok(member, 'every primary member is a real physical object');
    assert.ok(item.members.some((value) => value.physicalId === physicalId));
    const memberRa = (member.ra * Math.PI) / 180;
    const memberDec = (member.dec * Math.PI) / 180;
    const angular =
      (2 *
        Math.asin(
          Math.min(
            1,
            Math.sqrt(
              Math.sin((centerDec - memberDec) / 2) ** 2 +
                Math.cos(centerDec) * Math.cos(memberDec) * Math.sin((centerRa - memberRa) / 2) ** 2
            )
          )
        ) *
        180) /
      Math.PI;
    assert.ok(angular <= item.radius + 1e-6, 'all primary points fit the displayed framing');
  }
  assert.ok(
    culture.groups.some((group) => group.id === item.groupId && group.asterismIds.includes(item.id))
  );
  assert.ok(item.members.length > 0);
  assert.equal(new Set(item.members.map((member) => member.physicalId)).size, item.members.length);
  assert.equal(new Set(item.memberHips).size, item.memberHips.length);
  assert.equal(new Set(item.memberObjectIds).size, item.memberObjectIds.length);
  assert.ok(item.addedMemberHips.every((hip) => !item.primaryMemberHips.includes(hip)));
  assert.ok(
    item.addedMemberObjectIds.every(
      (physicalId) => !item.primaryMemberObjectIds.includes(physicalId)
    )
  );
  assert.deepEqual(
    item.addedMemberHips,
    item.sourceAddedMemberHips.filter((hip) => !item.primaryMemberHips.includes(hip)),
    'a primary star with an added-star alias is counted once, while the original mapping survives'
  );
  for (const member of item.members) {
    assert.ok(physical.has(member.physicalId), `unresolved physical member ${member.physicalId}`);
    assert.ok(point([member.ra, member.dec]));
    if (typeof member.id === 'number') assert.equal(member.physicalId, `hip:${member.id}`);
  }
  for (let p = 0; p < item.displayMemberPaths.length; p++) {
    assert.equal(item.lines[p].length, item.displayMemberPaths[p].length);
    for (let i = 0; i < item.displayMemberPaths[p].length; i++) {
      const star = physical.get(referenceId(item.displayMemberPaths[p][i]));
      assert.ok(star, `unknown source object ${item.displayMemberPaths[p][i]}`);
      near(item.lines[p][i][0], star.ra);
      near(item.lines[p][i][1], star.dec);
    }
  }
  if (item.isSubsidiary) {
    assert.ok(byId.has(item.parentId));
    assert.equal(byId.get(item.parentId).groupId, item.groupId);
  } else assert.equal(item.parentId, null);
  for (const language of ['zh', 'en', 'ru', 'fr'])
    assert.ok(item[language] && item.names[language]);
}

assert.equal(culture.stats.sourceConnectionCorrections, 10);
for (const [id, corrections] of foreignSourceAnchors) {
  const item = byId.get(id);
  assert.equal(item.sourceConnectionCorrections.length, corrections.length);
  for (const [hip, name, ownerName] of corrections) {
    const owner = sourceItem(ownerName);
    assert.equal(original.common_names['HIP ' + hip][0].native, name);
    assert.ok(owner.parentId === id || item.parentId === owner.id);
    assert.ok(item.sourceLineMemberHips.includes(hip));
    assert.ok(!item.primaryMemberHips.includes(hip));
    assert.ok(!item.memberHips.includes(hip));
    assert.ok(!item.lineMemberHips.includes(hip));
    assert.ok(owner.primaryMemberHips.includes(hip));
    assert.ok(stars.get(hip).asterismIds.includes(owner.id));
    assert.ok(!stars.get(hip).asterismIds.includes(id));
  }
}
assert.deepEqual(
  sourceItem('毕宿').primaryMemberHips,
  [18724, 20205, 20455, 20648, 20713, 20885, 20889, 21421]
);
assert.equal(sourceItem('井宿').primaryMemberHips.length, 8);
assert.equal(sourceItem('轸宿').primaryMemberHips.length, 4);
assert.equal(sourceItem('伐(附参宿)').primaryMemberHips.length, 3);
assert.equal(sourceItem('坟墓(附危宿)').primaryMemberHips.length, 4);
assert.equal(sourceItem('钩钤(附房宿)').primaryMemberHips.length, 2);
assert.equal(sourceItem('离宫(附室宿)').primaryMemberHips.length, 6);

const states = sourceItem('十二国');
assert.deepEqual(
  states.primaryUnlinkedMemberHips,
  [103226, 103616, 104365, 104963, 105665, 105881, 105928, 106039]
);
assert.equal(states.primaryMemberHips.length, 16);
assert.equal(states.lineMemberHips.length, 8);
assert.equal(states.primaryMemberStatus.state, 'complete');
for (const hip of states.primaryUnlinkedMemberHips) {
  assert.ok(original.common_names['HIP ' + hip][0].english.endsWith('(In Twelve States)'));
  assert.ok(states.memberHips.includes(hip));
  assert.ok(stars.get(hip).asterismIds.includes(states.id));
  assert.ok(
    !states.sourceLineMemberHips.includes(hip),
    'unconnected points must not acquire edges'
  );
}
const canopy = sourceItem('华盖');
assert.equal(canopy.primaryMemberHips.length, 6);
assert.equal(canopy.primaryMemberStatus.expected, 7);
assert.equal(canopy.primaryMemberStatus.state, 'source-incomplete');
assert.deepEqual(canopy.lines, [], 'foreign hub removal cannot invent replacement spokes');
assert.deepEqual(canopy.primaryUnlinkedMemberHips, canopy.primaryMemberHips);
const wings = sourceItem('翼宿');
assert.equal(wings.primaryMemberStatus.state, 'source-incomplete');
assert.equal(wings.primaryMemberStatus.expected, 22);
assert.equal(wings.primaryMemberStatus.resolved, 18);
assert.deepEqual(wings.primaryMemberStatus.uncertainPhysicalIds, [
  'hip:54214',
  'hip:56245',
  'hip:56830',
]);
assert.equal(sourceItem('海山').primaryMemberStatus.state, 'source-count-inconsistent');
assert.equal(sourceItem('海山').primaryMemberStatus.expected, 4);
assert.equal(sourceItem('海山').primaryMemberStatus.resolved, 5);
assert.equal(sourceItem('宦者').primaryMemberHips.length, 4);
assert.equal(sourceItem('宦者').primaryMemberStatus.expected, 2);
assert.equal(culture.stats.unlinkedPrimaryMemberships, 14);
assert.equal(
  culture.asterisms.reduce(
    (count, item) =>
      count +
      item.sourceAddedMemberHips.filter((hip) => item.primaryMemberHips.includes(hip)).length,
    0
  ),
  42
);
assert.ok(sourceItem('井宿').primaryMemberHips.includes(32362));
assert.ok(!sourceItem('井宿').addedMemberHips.includes(32362));
assert.ok(sourceItem('井宿').sourceAddedMemberHips.includes(32362));
assert.ok(stars.get(32362).aliases.includes('井宿增十九'));
assert.ok(sourceItem('昴宿').addedMemberObjectIds.includes('gaia:66715105696289024'));
assert.ok(sourceItem('奎宿').addedMemberObjectIds.includes('deep:NGC224'));

assert.equal(sourceItem('北斗').groupId, 'ziwei');
assert.equal(sourceItem('织女').groupId, 'niu');
assert.equal(sourceItem('天狼').groupId, 'jing');
assert.equal(sourceItem('海山').groupId, 'southern');
assert.equal(sourceItem('积尸(鬼宿)').groupId, 'gui');
assert.equal(sourceItem('积尸(胃宿)').groupId, 'wei-stomach');
assert.notEqual(sourceItem('积尸(鬼宿)').targetId, sourceItem('积尸(胃宿)').targetId);
assert.equal(sourceItem('北斗').lineMemberHips.length, 7);
assert.ok(sourceItem('北斗').addedMemberHips.length > 0);
assert.equal(sourceItem('太子').lineMemberHips.length, 1);
assert.equal(sourceItem('太子').radius, 0.08);
assert.ok(
  !sourceItem('太子').memberHips.includes(75097),
  '北极一 alias 太子 is not the same-named 太子 asterism'
);
assert.ok(
  !sourceItem('御女').memberHips.includes(49637),
  '轩辕十七 alias 御女 must not change its asterism identity'
);
assert.ok(sourceItem('御女').radius < 4);
assert.ok(
  Math.abs(sourceItem('王良').ra) < 15,
  'RA-zero region must not average around the opposite hemisphere'
);

for (const name of ['积尸(鬼宿)', '神宫(附尾宿)', '鱼']) {
  const item = sourceItem(name);
  assert.equal(item.lineMemberHips.length, 0);
  assert.equal(item.lineMemberObjectIds.length, 1);
  assert.ok(item.lineMemberObjectIds[0].startsWith('deep:'));
  assert.deepEqual(
    item.lines[0][0],
    item.lines[0][1],
    'source single-object marker survives zero-length geometry'
  );
}
assert.equal(culture.stats.singleObjectAsterisms, 57);
assert.equal(culture.namedObjects.length, 19);
assert.equal(culture.namedObjects.filter((object) => object.kind === 'solar').length, 7);
assert.equal(culture.otherStars.length, 7);
for (const object of culture.otherStars) {
  assert.match(object.id, /^gaia:\d{17,19}$/);
  assert.equal(typeof object.id, 'string', 'Gaia identifiers exceed safe JS integer precision');
  assert.ok(point([object.ra, object.dec]));
  assert.equal(object.magnitudeBand, 'Gaia G');
  assert.ok(api.cultureStarName(object.id, 'chinese', 'zh'));
}
const etaCar = culture.otherStars.find((object) => object.id === 'gaia:5350358584482202880');
assert.equal(etaCar.epoch, 2016, 'absent proper motion cannot be fabricated');
near(etaCar.ra, 161.2647407537247);
near(etaCar.dec, -59.68445877770452);

const gaiaRows = read('assets/chinese-sky/source/Gaia-DR3.csv')
  .toString()
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => line.split(','));
const aipRows = [
  ...read('assets/chinese-sky/source/Gaia-DR3-AIP.xml')
    .toString()
    .matchAll(/<TR>(.*?)<\/TR>/gs),
].map((row) => [...row[1].matchAll(/<TD>(.*?)<\/TD>/gs)].map((cell) => cell[1]));
assert.equal(aipRows.length, 7);
for (const row of gaiaRows) {
  const independent = aipRows.find((other) => other[0] === row[0]);
  assert.ok(independent, 'independent archive must retain the exact 64-bit source identifier');
  for (let i = 1; i < row.length; i++)
    row[i] === ''
      ? assert.equal(independent[i], '')
      : near(Number(row[i]), Number(independent[i]), 1e-12);
}
assert.equal(
  read('assets/chinese-sky/source/Gaia-HIP-crossmatch.csv').toString().trim().split('\n').length,
  1,
  'official crossmatch has no existing HIP counterpart for these seven Gaia objects'
);
for (const object of culture.otherStars) {
  const ra = (object.ra * Math.PI) / 180;
  const dec = (object.dec * Math.PI) / 180;
  let closest = Infinity;
  for (const row of existing.values()) {
    const otherRa = (row[1] * Math.PI) / 180;
    const otherDec = (row[2] * Math.PI) / 180;
    const chord =
      Math.sin((dec - otherDec) / 2) ** 2 +
      Math.cos(dec) * Math.cos(otherDec) * Math.sin((ra - otherRa) / 2) ** 2;
    closest = Math.min(
      closest,
      ((2 * Math.asin(Math.min(1, Math.sqrt(chord))) * 180) / Math.PI) * 3600
    );
  }
  assert.ok(closest > 116, 'new culture physical points cannot silently duplicate an existing HIP');
}

assert.deepEqual(
  culture.additionalStars.map((row) => row[0]),
  [4714, 40205, 44637, 115481]
);
for (const row of culture.additionalStars) {
  assert.ok(!existing.has(row[0]), 'supplementing must not double-draw an existing HIP');
  assert.ok(point(row.slice(1, 3)));
}
near(culture.additionalStars[0][1], 15.13739276);
near(culture.additionalStars[0][2], 65.1150678);
for (const star of culture.stars) {
  assert.equal(star.physicalId, 'hip:' + star.id);
  const row = existing.get(star.id);
  if (row)
    assert.deepEqual(
      [star.ra, star.dec, star.mag],
      row.slice(1, 4),
      'culture switching preserves existing astrometry'
    );
}
for (const [key, values] of Object.entries(original.common_names)) {
  const object = key.startsWith('HIP ')
    ? stars.get(Number(key.slice(4)))
    : culture.namedObjects.find((item) => item.sourceId === key);
  assert.ok(object, `every culture naming object is retained: ${key}`);
  for (const name of values)
    for (const field of ['native', 'english', 'pronounce'])
      if (name[field]) assert.ok(object.aliases.includes(name[field]));
}
assert.equal(api.cultureStarName(32349, 'chinese', 'zh'), '天狼');
assert.equal(api.cultureStarName('hip:54061', 'chinese', 'zh'), '北斗一');
assert.ok(
  stars.get(54061).aliases.includes('天枢'),
  'familiar proper names remain searchable aliases of the same physical star'
);
assert.equal(
  api.cultureStarName(999999999, 'chinese', 'zh'),
  null,
  'unnamed HIP must use the caller’s modern-name fallback'
);
assert.equal(api.normalizeSkyCulture('unsupported'), 'western');
assert.equal(api.cultureName('chinese', 'unsupported'), culture.names.en);
assert.equal(api.cultureObjectLabel(sourceItem('北斗'), 'fr'), sourceItem('北斗').en);
assert.deepEqual(api.getSkyCulture('western').stars, western.stars);
assert.deepEqual(api.getSkyCulture('western').boundaries, western.boundaries);
for (const item of api.getSkyCulture('western').asterisms)
  assert.deepEqual(
    item.lines,
    western.constellations.find((original) => original.id === item.id).lines
  );
const glyphs = new Set(api.cultureGlyphText('chinese'));
for (const object of [...culture.asterisms, ...culture.namedObjects])
  for (const character of object.names.zh) assert.ok(glyphs.has(character));

const numeric = execFileSync(
  'python3',
  [
    '-c',
    `import importlib.util, json
s=importlib.util.spec_from_file_location('chinese', 'scripts/prepare-chinese-sky.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
a=m.extent([[1,359,0],[2,0,0],[3,1,0]])
assert abs(a[0])<1e-10 and abs(a[1])<1e-10 and abs(a[2]-1)<1e-7
assert m.split_member_paths([[1,9,2,3],[1,1]],{9})==[[2,3],[1,1]], 'removing an interior foreign anchor must never connect its neighbors'
try:m.supplemental_stars({999999999},{})
except ValueError:pass
else:raise AssertionError('unknown HIP must fail rather than create placeholder astrometry')
print(json.dumps(a))`,
  ],
  { cwd: root, encoding: 'utf8' }
);
assert.deepEqual(JSON.parse(numeric), [0, 0, 1]);
execFileSync('python3', ['scripts/prepare-chinese-sky.py', '--check'], {
  cwd: root,
  stdio: 'pipe',
});
assert.ok(read('assets/chinese-sky/catalog.json').length < 4000000);
console.log(
  'Sky cultures: pinned 300 + 12 records, 32 groups, primary/added identities, 10 audited drawing anchors, unconnected primary members, source count uncertainty, 3053 HIP names, 7 Gaia stars, DSO/single-object identities, astrometry, RA-zero and Western invariance passed.'
);
