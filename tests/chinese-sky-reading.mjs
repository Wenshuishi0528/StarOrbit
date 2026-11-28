import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readChineseAsterism, readChineseGroup } from '../src/chinese-sky-reading.js';
import { mansions, regions, symbols } from '../src/chinese-sky-reading-content.js';
import profiles from '../src/chinese-sky-profiles.json' with { type: 'json' };
import stories from '../src/chinese-sky-stories.json' with { type: 'json' };
import relatedStories from '../src/chinese-sky-related-stories.json' with { type: 'json' };

const chart = JSON.parse(
  await readFile(new URL('../assets/chinese-sky/catalog.json', import.meta.url), 'utf8')
);
const langs = ['zh', 'en', 'fr', 'ru'];
const textOf = (out) => [out.description, out.detail, out.observing].filter(Boolean).join(' ');
const a = (id, language = 'zh') => textOf(readChineseAsterism(id, chart, language));
const g = (id, language = 'zh') => textOf(readChineseGroup(id, chart, language));
assert.deepEqual(Object.keys(profiles).sort(), chart.asterisms.map((row) => row.id).sort());
assert.deepEqual(
  Object.keys(stories).sort(),
  [
    ...chart.asterisms.map((row) => row.id),
    ...chart.groups.map((row) => row.id),
    ...Object.keys(symbols),
  ].sort()
);
const kinds = new Set(['tradition', 'history', 'name', 'discovery', 'catalogue']);
function checkStory(out, id, lang, seen) {
  const [kind, source, ...translations] = stories[id];
  assert.ok(kinds.has(kind) && source, id);
  assert.equal(out.storyKind, kind);
  assert.equal(translations.length, langs.length);
  assert.equal(new Set(translations).size, langs.length, id + ' needs four translations');
  assert.equal(out.story, translations[langs.indexOf(lang)]);
  assert.ok(out.story.length >= (lang === 'zh' ? 50 : 115), id + ' ' + lang);
  assert.match(out.story, /[。.!?？！].+/u, id);
  assert.ok(![out.description, out.detail, out.observing].includes(out.story), id);
  assert.ok(!seen.has(out.story), id);
  seen.add(out.story);
  assert.equal(out.link, out.sources[0]);
  assert.ok(out.link.name && new URL(out.link.url).protocol === 'https:', id);
  assert.equal(new Set(out.sources.map((item) => item.url)).size, out.sources.length);
  const related = relatedStories[id];
  if (related) {
    const entry = out.relatedStory;
    assert.ok(['tradition', 'history', 'discovery', 'context'].includes(entry.kind), id);
    assert.equal(entry.label, related.label[langs.indexOf(lang)]);
    assert.equal(entry.text, related.text[langs.indexOf(lang)]);
    assert.equal(new Set(related.label).size, langs.length);
    assert.equal(new Set(related.text).size, langs.length);
    assert.ok(entry.text && entry.text !== out.story && entry.text !== out.description, id);
    assert.ok(
      entry.links.length &&
        entry.links.every((item) => item.name && new URL(item.url).protocol === 'https:'),
      id
    );
    assert.notEqual(entry.links[0].url, out.link.url, id);
  } else {
    assert.equal(out.relatedStory, undefined, id);
  }
}
let checks = 0;
for (const lang of langs) {
  const descriptions = new Set();
  const seenStories = new Set();
  for (const record of chart.asterisms) {
    const out = readChineseAsterism(record, chart, lang);
    checkStory(out, record.id, lang, seenStories);
    // Unique, standalone cultural prose, even before opening the observing details.
    assert.equal(out.description, profiles[record.id][langs.indexOf(lang)]);
    assert.ok(out.description.length >= (lang === 'zh' ? 40 : 95), record.id + ' ' + lang);
    assert.ok(out.description.split(lang === 'zh' ? '。' : '.').length >= 3, record.zh);
    assert.ok(textOf(out).length >= (lang === 'zh' ? 95 : 200), record.id);
    assert.ok(!descriptions.has(out.description), record.id);
    descriptions.add(out.description);
    assert.ok(!/undefined|NaN|\[object Object\]|Infinity/u.test(textOf(out)), record.id);
    assert.match(out.observing, /°|HIP |Gaia/u, 'missing chart-based observing help: ' + record.id);
    assert.equal(out.link, out.sources[0]);
    assert.ok(out.sources.every((item) => item.name && new URL(item.url).protocol === 'https:'));
    assert.equal(new Set(out.sources.map((item) => item.url)).size, out.sources.length);
    assert.equal(a(record.targetId, lang), textOf(out));
    checks++;
  }
  for (const item of [...chart.groups, ...Object.keys(symbols)]) {
    const out = readChineseGroup(item, chart, lang);
    checkStory(out, item.id ?? item, lang, seenStories);
    assert.ok(textOf(out).length >= (lang === 'zh' ? 75 : 125), item.id ?? item);
    assert.ok(out.link?.url);
    assert.ok(!descriptions.has(out.description), item.id ?? item);
    descriptions.add(out.description);
    checks++;
  }
  assert.equal(seenStories.size, 348);
}
assert.equal(chart.asterisms.filter((a) => a.isSubsidiary).length, 12);
assert.equal(chart.asterisms.length, 312);
assert.equal(chart.groups.length, 32);
assert.equal(Object.keys(mansions).length, 28);
assert.equal(Object.keys(symbols).length, 4);
assert.equal(Object.keys(regions).length, 8);
assert.equal(checks, 1392);
for (const [id, ref] of Object.entries(mansions)) assert.ok(g(id).includes(ref[0]), id);
assert.ok(
  chart.asterisms.filter((a) => a.isSubsidiary).every((a) => readChineseAsterism(a, chart))
);
assert.match(a('039'), /天璇.*天枢/);
const dipper = readChineseAsterism('039', chart);
assert.match(dipper.description, /北天.*舀酒.*量粮.*四颗星.*三颗/u);
assert.match(dipper.story, /^《楚辞·九歌·东君》.*举起北斗.*桂酒.*史记.*黄昏.*斗柄/u);
assert.equal(dipper.storyKind, 'name');
assert.match(
  dipper.relatedStory.text,
  /管辂.*颜超.*清酒.*鹿肉.*桑树.*围棋.*十九岁.*九十岁.*北斗.*南斗/u
);
assert.ok(
  dipper.relatedStory.links.some((s) => s.name.includes('搜神记') && s.name.includes('卷三'))
);
assert.ok(dipper.link.name.includes('楚辞') && dipper.sources.some((s) => s.name.includes('史记')));
assert.ok(dipper.sources.some((s) => s.url.includes('dict.variants.moe.edu.tw')));
for (const [id, topic, source] of [
  ['008', /箕.*簸谷.*诗里的那把斗/u, '大东'],
  ['016', /牛宿.*六颗星.*祭礼.*河鼓/u, '宋史'],
  ['075', /织女.*脚朝向扶筐.*丝线.*桑叶/u, '宋史'],
  ['078', /武丁.*庄子.*骑着箕、尾.*群星/u, '庄子'],
  ['093', /鼓.*大将军.*左旗、右旗/u, '宋史'],
  ['138', /天市.*牛.*女/u, '宋史'],
  ['222', /1054.*客星.*白天.*蟹状星云/u, 'NASA'],
  ['244', /勾龙.*平治水土.*祭社.*精气升天成星/u, '宋史'],
  ['263', /鞭子.*策.*四匹马/u, '晋书'],
  ['272', /四颗星.*掌管帝王车驾.*奚仲造车/u, '宋史'],
  ['296', /造父的五星.*御官.*伯乐.*马厩/u, '宋史'],
  ['304', /织女.*机声.*泪水.*银河/u, '古诗十九首'],
  ['306', /周鼎三星.*泗水.*精气升天成星.*李太异/u, '宋史'],
]) {
  const out = readChineseAsterism(id, chart);
  assert.match(out.story, topic);
  assert.ok(out.link.name.includes(source), id);
}
for (const [id, subject, source] of [
  ['075', /女子.*深筐.*嫩桑叶/u, '七月'],
  ['078', /武丁.*贤人.*筑墙/u, '殷本纪'],
  ['093', /七夕.*河鼓二.*七月初七.*喜鹊/u, '香港太空馆'],
  ['263', /王良.*嬖奚.*出猎.*十只/u, '孟子'],
  ['296', /穆王.*徐偃王.*一日千里/u, '秦本纪'],
  ['306', /王孙满.*九鼎.*德行/u, '左传'],
]) {
  const { relatedStory } = readChineseAsterism(id, chart);
  assert.match(relatedStory.text, subject, id);
  assert.ok(relatedStory.links[0].name.includes(source), id);
}
for (const item of chart.asterisms.filter((r) => r.groupId === 'southern')) {
  const { sources } = readChineseAsterism(item, chart);
  assert.ok(
    sources.some((s) => s.name.includes('大清会典图')),
    item.zh
  );
}
assert.match(readChineseAsterism('076', chart).story, /极旁.*白气.*靠近/u);
assert.match(readChineseAsterism('109', chart).story, /白.*臼.*极旁的白气.*三星.*两星/u);
assert.match(readChineseAsterism('144', chart).description, /三颗.*对应其中两颗/u);
assert.match(readChineseGroup('southern', chart).story, /西方观测.*二十三.*蛇首、蛇腹和蛇尾/u);
assert.match(readChineseGroup('zhang', chart).story, /铜仪.*十七度.*十八度/u);
assert.match(readChineseGroup('azuredragon', chart).story, /曾侯乙.*漆衣箱.*顺时针/u);
assert.match(readChineseGroup('blacktortoise', chart).story, /故宫.*龟与蛇.*玄武司马/u);
assert.match(readChineseGroup('vermilionbird', chart).story, /礼记.*朱鸟在前.*玄武在后/u);
assert.notEqual(readChineseGroup('yi', chart).story, readChineseAsterism('029', chart).story);
assert.match(a('304'), /七夕.*河鼓二/);
assert.match(a('093', 'en'), /Altair/);
assert.match(a('104'), /M44/);
assert.match(a('105'), /HIP 13879/);
assert.match(a('185'), /NGC 6231/);
assert.match(a('289'), /NGC 6475/);
assert.match(a('090'), /Gaia DR3/);
assert.match(a('029'), /二十二.*十八.*三/);
assert.match(a('186'), /十六.*八/);
assert.match(a('101'), /华盖二.*华盖七/);
assert.match(a('176'), /紫微垣/);
assert.match(a('175'), /太微垣/);
assert.match(a('275'), /南/);
const focused = [
  ['037', /坏掉.*照管瓜果/u],
  ['075', /桑叶.*蚕.*皇后/u],
  ['100', /葫芦.*匏瓜.*果园/u],
  ['138', /库藏.*旒珠.*环佩/u],
];
for (const [id, subject] of focused) {
  const out = readChineseAsterism(id, chart);
  assert.match(out.description, subject);
  assert.ok(out.detail);
  assert.ok(out.sources.some((source) => source.url.endsWith('/宋史/卷050')));
}
assert.match(readChineseAsterism('074', chart).description, /刈具.*饲草/u);
assert.match(readChineseAsterism('159', chart).description, /卧床.*女性侍从/u);
assert.match(readChineseAsterism('054', chart).description, /厨房/u);
assert.match(readChineseAsterism('055', chart).description, /军粮/u);
assert.match(readChineseAsterism('138', chart).description, /五星.*四颗/u);
for (const [firstId, firstMeaning, secondId, secondMeaning] of [
  ['054', /厨房.*舂粮/u, '055', /军粮/u],
  ['058', /疾病和巫医/u, '059', /太微.*随侍/u],
  ['104', /蜂巢星团 M44/u, '105', /大陵.*HIP 13879/u],
  ['106', /船中.*水患/u, '115', /饮用.*烹饪/u],
  ['175', /朝会.*谒者/u, '176', /太尉、司徒、司空/u],
  ['245', /亲耕籍田/u, '246', /王都周围.*罗堰/u],
  ['269', /帝师、帝友/u, '270', /内五诸侯/u],
  ['308', /五车.*三柱/u, '309', /库楼.*兵器库/u],
]) {
  assert.match(readChineseAsterism(firstId, chart).description, firstMeaning, firstId);
  assert.match(readChineseAsterism(secondId, chart).description, secondMeaning, secondId);
}
assert.notEqual(
  readChineseGroup('nv', chart).description,
  readChineseAsterism('017', chart).description
);
assert.match(g('southern'), /晚明.*清代/);
assert.match(g('blacktortoise'), /龟一蛇/);
assert.match(g('shen'), /ζ Ori/);
assert.equal(readChineseAsterism(null, chart), null);
assert.equal(readChineseAsterism({ culture: 'western', id: '039' }, chart), null);
assert.equal(readChineseAsterism('asterism:chinese:zzz', chart), null);
assert.equal(readChineseGroup('toString', chart), null);
assert.equal(readChineseGroup('ziwei', { id: 'western' }), null);
console.log(
  'Chinese reading: 300 independent asterisms + 12 subsidiary records, 32 regions and 4 symbols × 4 languages = ' +
    checks +
    ' offline readings. Every article has a distinct translated story and source. Historical narratives, disagreements, real members, clusters and ambiguous names checked.'
);
