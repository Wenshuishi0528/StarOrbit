import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readChineseAsterism, readChineseGroup } from '../src/chinese-sky-reading.js';
import {
  figures,
  mansions,
  readingScenes,
  regions,
  symbols,
} from '../src/chinese-sky-reading-content.js';

const chart = JSON.parse(
  await readFile(new URL('../assets/chinese-sky/catalog.json', import.meta.url), 'utf8')
);
const langs = ['zh', 'en', 'fr', 'ru'];
const a = (id, language = 'zh') => readChineseAsterism(id, chart, language).description;
const g = (id, language = 'zh') => readChineseGroup(id, chart, language).description;
let checks = 0;
for (const lang of langs) {
  const descriptions = new Set();
  for (const record of chart.asterisms) {
    const out = readChineseAsterism(record, chart, lang);
    assert.ok(out.description.length >= (lang === 'zh' ? 75 : 135), record.id + ' ' + lang);
    assert.ok(out.description.split(lang === 'zh' ? '。' : '.').length >= 3, record.zh);
    assert.ok(!descriptions.has(out.description), record.id);
    descriptions.add(out.description);
    assert.ok(!/undefined|NaN|\[object Object\]|Infinity/u.test(out.description), record.id);
    assert.ok(out.link.name && new URL(out.link.url).protocol === 'https:');
    assert.equal(a(record.targetId, lang), out.description);
    const contextual =
      figures[record.id] ||
      readingScenes.get(record.id) ||
      (mansions[record.groupId] && record.zh === record.regionName);
    assert.ok(contextual, 'Missing authored cultural/observational context: ' + record.id);
    checks++;
  }
  for (const item of [...chart.groups, ...Object.keys(symbols)]) {
    const out = readChineseGroup(item, chart, lang);
    assert.ok(out.description.length >= (lang === 'zh' ? 75 : 125), item.id ?? item);
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
