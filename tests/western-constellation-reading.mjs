import assert from 'node:assert/strict';
import { DEEP_SKY_OBJECTS } from '../src/deep-sky-catalog.js';
import { getSkyCulture } from '../src/sky-cultures.js';
import readings from '../src/western-constellation-reading-data.json' with { type: 'json' };
import { readWesternConstellation } from '../src/western-constellation-reading.js';

const constellations = getSkyCulture('western').asterisms;
const languages = ['zh', 'en', 'fr', 'ru'];
const paragraphs = new Set();
const chartPages = new Set();
const namedObjects = new Set();
const catalog = new Map();
for (const object of DEEP_SKY_OBJECTS) {
  for (const name of [object.id, ...object.aliases]) {
    const compact = name.replaceAll(' ', '');
    if (/^(?:NGC|M)\d+$/.test(compact)) catalog.set(compact, object);
  }
}

assert.equal(constellations.length, 88);
assert.deepEqual(
  new Set(Object.keys(readings)),
  new Set(constellations.map((record) => record.id))
);
for (const record of constellations) {
  let objects;
  let chart;
  for (const lang of languages) {
    const label = `${record.id} · ${lang}`;
    const { description, link } = readWesternConstellation(record, lang);
    assert.equal(description, description.trim(), label);
    assert.ok(!paragraphs.has(description), label);
    paragraphs.add(description);
    assert.doesNotMatch(description, /[<>\r\n]/, label);
    assert.match(description, lang === 'zh' ? /。$/ : /\.$/, label);
    const length = Array.from(description).length;
    if (lang === 'zh') assert.ok(length >= 70 && length <= 150, label);
    else assert.ok(length >= 170, label);
    const source = new URL(link.url);
    assert.equal(source.host, 'commons.wikimedia.org', label);
    const title = readings[record.id].chart;
    assert.equal(
      decodeURIComponent(source.pathname),
      `/wiki/File:${title.replaceAll(' ', '_')}_IAU.svg`,
      label
    );
    assert.ok(link.name.includes(title) && link.name.includes('IAU / Sky & Telescope'), label);
    if (chart) assert.equal(link.url, chart, label);
    chart = link.url;

    const references = [...description.matchAll(/(?:NGC\s*\d+|M\s*\d+)/g)]
      .map((m) => m[0].replaceAll(' ', ''))
      .sort();
    if (objects) assert.deepEqual(references, objects, label);
    objects = references;
    for (const id of references) {
      assert.equal(catalog.get(id)?.constellation, record.id, `${label} · ${id}`);
      namedObjects.add(id);
    }
  }
  chartPages.add(chart);
}
assert.equal(paragraphs.size, 352);
assert.equal(chartPages.size, 88);
assert.ok(namedObjects.size >= 65);

const orion = constellations.find((record) => record.id === 'Ori');
assert.equal(readWesternConstellation(orion).description, readings.Ori.zh);
assert.equal(readWesternConstellation(orion, 'fr-CA').description, readings.Ori.fr);
assert.equal(readWesternConstellation(orion, 'de').description, readings.Ori.en);
assert.equal(readWesternConstellation({ ...orion, culture: 'chinese' }), null);
for (const invalid of [null, {}, { id: 'constructor' }, { id: 'XYZ' }])
  assert.equal(readWesternConstellation(invalid), null);
for (const lang of languages) {
  const serpens = readWesternConstellation({ id: 'Ser' }, lang);
  assert.match(serpens.description, /M5\b/);
  assert.match(serpens.description, /M16\b/);
  assert.match(serpens.link.name, /Serpens Caput/);
}

console.log(
  `Verified ${chartPages.size} constellation charts, ${paragraphs.size} localized readings and ${namedObjects.size} catalogued objects.`
);
