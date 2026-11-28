import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readChineseAsterism, readChineseGroup } from '../src/chinese-sky-reading.js';
import { mansions, regions, symbols } from '../src/chinese-sky-reading-content.js';
import profiles from '../src/chinese-sky-profiles.json' with { type: 'json' };

const chart = JSON.parse(
  await readFile(new URL('../assets/chinese-sky/catalog.json', import.meta.url), 'utf8')
);
const langs = ['zh', 'en', 'fr', 'ru'];
const textOf = (out) => [out.description, out.detail, out.observing].filter(Boolean).join(' ');
const a = (id, language = 'zh') => textOf(readChineseAsterism(id, chart, language));
const g = (id, language = 'zh') => textOf(readChineseGroup(id, chart, language));
assert.deepEqual(Object.keys(profiles).sort(), chart.asterisms.map((row) => row.id).sort());
let checks = 0;
for (const lang of langs) {
  const descriptions = new Set();
  for (const record of chart.asterisms) {
    const out = readChineseAsterism(record, chart, lang);
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
    assert.ok(textOf(out).length >= (lang === 'zh' ? 75 : 125), item.id ?? item);
    assert.ok(out.link?.url);
    assert.ok(!descriptions.has(out.description), item.id ?? item);
    descriptions.add(out.description);
    checks++;
  }
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
    ' offline readings. Each is distinct, contextual and attributed. Real members, clusters, ambiguous names and source disagreements checked.'
);
