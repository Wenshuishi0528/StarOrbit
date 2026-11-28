import assert from 'node:assert/strict';
import { DEEP_SKY_OBJECTS } from '../src/deep-sky-catalog.js';
import { getSkyCulture } from '../src/sky-cultures.js';
import readings from '../src/western-constellation-reading-data.json' with { type: 'json' };
import histories from '../src/western-constellation-history.json' with { type: 'json' };
import stories from '../src/western-constellation-stories.json' with { type: 'json' };
import {
  WESTERN_CONSTELLATION_CATEGORIES,
  westernConstellationCategory,
} from '../src/western-constellation-categories.js';
import { readWesternConstellation } from '../src/western-constellation-reading.js';

const constellations = getSkyCulture('western').asterisms;
const languages = ['zh', 'en', 'fr', 'ru'];
const paragraphs = new Set();
const chartPages = new Set();
const historyPages = new Set();
const storyParagraphs = new Set();
const relatedParagraphs = new Set();
const fieldDiscoveries = new Set([
  'CMi',
  'Cas',
  'Cet',
  'Cyg',
  'Cha',
  'Dor',
  'Mon',
  'Tuc',
  'Vol',
  'Lac',
  'Vul',
  'For',
  'Pic',
  'Pyx',
  'Scl',
]);
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
assert.deepEqual(new Set(Object.keys(readings)), new Set(Object.keys(histories)));
assert.deepEqual(new Set(Object.keys(readings)), new Set(Object.keys(stories)));
const categories = new Map(WESTERN_CONSTELLATION_CATEGORIES.map(({ id }) => [id, 0]));
for (const record of constellations) {
  const expectedCategory = westernConstellationCategory(record.id);
  assert.ok(categories.has(expectedCategory), record.id);
  categories.set(expectedCategory, categories.get(expectedCategory) + 1);
  let objects;
  let chart;
  for (const lang of languages) {
    const label = `${record.id} · ${lang}`;
    const {
      description,
      story,
      storyKind,
      relatedStory,
      category,
      observing,
      detail,
      link,
      sources,
    } = readWesternConstellation(record, lang);
    assert.equal(description, histories[record.id][lang], label);
    assert.equal(observing, readings[record.id][lang], label);
    assert.equal(category, expectedCategory, label);
    assert.ok(['tradition', 'history'].includes(storyKind), label);
    assert.equal(story, stories[record.id][lang], label);
    assert.ok(![description, detail, observing].includes(story), label);
    assert.ok(!storyParagraphs.has(story), label);
    storyParagraphs.add(story);
    assert.ok(story.length >= (lang === 'zh' ? 65 : 180), label);
    assert.doesNotMatch(story, /[<>\r\n]/, label);
    assert.match(story, lang === 'zh' ? /。$/ : /\.$/, label);
    assert.match(
      story,
      { zh: /\p{Script=Han}/u, en: /[a-z]/, fr: /[a-z]/, ru: /[а-я]/i }[lang],
      label
    );
    if (lang !== 'zh') assert.doesNotMatch(story, /\p{Script=Han}/u, label);
    if (lang !== 'ru') assert.doesNotMatch(story, /[А-Яа-я]/, label);
    if (fieldDiscoveries.has(record.id)) assert.equal(relatedStory?.kind, 'discovery', label);
    if (relatedStory) {
      assert.ok(
        ['tradition', 'history', 'discovery', 'context'].includes(relatedStory.kind),
        label
      );
      assert.equal(relatedStory.label, stories[record.id].related.label[lang], label);
      assert.equal(relatedStory.text, stories[record.id].related[lang], label);
      assert.ok(relatedStory.label.trim() && relatedStory.text.trim(), label);
      assert.ok(![story, description, detail, observing].includes(relatedStory.text), label);
      assert.ok(!relatedParagraphs.has(relatedStory.text), label);
      relatedParagraphs.add(relatedStory.text);
      assert.doesNotMatch(relatedStory.text, /[<>\r\n]/, label);
      assert.match(relatedStory.text, lang === 'zh' ? /。$/ : /\.$/, label);
      assert.ok(relatedStory.links.length, label);
      for (const ref of relatedStory.links) {
        assert.ok(ref?.name?.trim(), label);
        assert.equal(new URL(ref.url).protocol, 'https:', label);
      }
    } else {
      assert.equal(stories[record.id].related, undefined, label);
    }
    assert.ok(sources.length >= 2, label);
    assert.equal(new Set(sources.map((s) => s.url)).size, sources.length, label);
    for (const paragraph of [description, observing]) {
      assert.equal(paragraph, paragraph.trim(), label);
      assert.ok(!paragraphs.has(paragraph), label);
      paragraphs.add(paragraph);
      assert.doesNotMatch(paragraph, /[<>\r\n]/, label);
      assert.match(paragraph, lang === 'zh' ? /。$/ : /\.$/, label);
      const length = Array.from(paragraph).length;
      if (lang === 'zh') assert.ok(length >= 70 && length <= 150, label);
      else assert.ok(length >= 170, label);
    }
    if (histories[record.id].detail) {
      assert.equal(detail, histories[record.id].detail[lang], label);
      assert.ok(detail && detail !== description && detail !== observing, label);
    }
    assert.ok(sources[0].name.includes('All Skies Encyclopaedia'), label);
    assert.equal(new URL(sources[0].url).hostname, 'ase.exopla.net', label);
    for (const ref of sources) {
      assert.ok(ref.name.trim(), label);
      assert.equal(new URL(ref.url).protocol, 'https:', label);
    }
    historyPages.add(sources[0].url);
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

    const references = [...observing.matchAll(/(?:NGC\s*\d+|M\s*\d+)/g)]
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
assert.equal(paragraphs.size, 704);
assert.equal(storyParagraphs.size, 352);
assert.equal(
  relatedParagraphs.size,
  Object.values(stories).filter((entry) => entry.related).length * languages.length
);
assert.deepEqual(Object.fromEntries(categories), {
  classical: 47,
  'early-atlases': 17,
  hevelius: 7,
  lacaille: 14,
  argo: 3,
});
for (const id of ['Com', 'Cru', 'Cam'])
  assert.equal(westernConstellationCategory(id), 'early-atlases');
for (const id of ['Car', 'Pup', 'Vel']) assert.equal(westernConstellationCategory(id), 'argo');
assert.equal(westernConstellationCategory('Lib'), 'classical');
assert.equal(westernConstellationCategory('Sct'), 'hevelius');
assert.equal(westernConstellationCategory('Pyx'), 'lacaille');
assert.equal(westernConstellationCategory('constructor'), '');
assert.equal(chartPages.size, 88);
assert.equal(historyPages.size, 88);
assert.ok(namedObjects.size >= 65);

const orion = constellations.find((record) => record.id === 'Ori');
assert.equal(readWesternConstellation(orion).description, histories.Ori.zh);
assert.equal(readWesternConstellation(orion, 'fr-CA').description, histories.Ori.fr);
assert.equal(readWesternConstellation(orion, 'de').description, histories.Ori.en);
assert.match(readWesternConstellation(orion).description, /猎人.*俄里翁/);
assert.match(readWesternConstellation(orion).detail, /M42.*原行星盘/);
assert.match(readWesternConstellation(orion).story, /伊斯特罗斯.*阿耳忒弥斯/);
assert.ok(readWesternConstellation(orion).sources.some((s) => s.url.endsWith('/207#2.34.4')));
assert.match(readWesternConstellation({ id: 'UMa' }).story, /卡利斯托.*阿尔卡斯/);
assert.match(readWesternConstellation({ id: 'Lyr' }).story, /龟壳.*俄耳甫斯.*缪斯.*安放在群星/);
assert.match(readWesternConstellation({ id: 'Lyr' }).relatedStory.text, /欧律狄刻.*回头/);
const crab = readWesternConstellation({ id: 'Cnc' });
assert.match(crab.story, /螃蟹.*脚.*赫拉/);
assert.ok(crab.sources.some((s) => s.url.endsWith('/207#2.23.1')));
assert.ok(crab.relatedStory.links.some((s) => s.url.endsWith('/207#2.23.4')));
assert.doesNotMatch(crab.story, /马槽|巨人|头驴/);
const airPump = readWesternConstellation({ id: 'Ant' });
assert.match(airPump.story, /1756.*气泵.*容器.*实验物理/);
assert.doesNotMatch(airPump.story, /马德堡|格里克/);
assert.match(airPump.relatedStory.text, /格里克.*半球/);
assert.ok(!airPump.sources.some((s) => /magdeburg/i.test(s.url)));
assert.ok(airPump.relatedStory.links.some((s) => /magdeburg/i.test(s.url)));
const swan = readWesternConstellation({ id: 'Cyg' });
assert.match(swan.story, /阿拉托斯.*翅膀.*天鹅/);
assert.match(swan.relatedStory.text, /贝塞尔.*天鹅座 61/);
const reticle = readWesternConstellation({ id: 'Ret' });
assert.ok(reticle.sources.some((s) => s.url.endsWith('/lacaille/remarks.html')));
assert.match(readWesternConstellation({ id: 'Tel' }).story, /赫维留斯.*高?杆/);
assert.match(readWesternConstellation({ id: 'Vel' }).story, /α.*船底.*γ.*船帆.*ζ.*船尾/);
const dorado = readWesternConstellation({ id: 'Dor' });
assert.equal(dorado.storyKind, 'history');
assert.match(dorado.story, /德·豪特曼.*Den Dorado/);
assert.equal(dorado.relatedStory.kind, 'discovery');
assert.match(dorado.relatedStory.text, /1987.*超新星/);
assert.equal(readWesternConstellation(orion, 'fr-CA').story, stories.Ori.fr);
assert.equal(readWesternConstellation(orion, 'unknown').story, stories.Ori.en);
assert.match(readWesternConstellation({ id: 'Ant' }).description, /气泵.*拉卡伊/);
assert.match(readWesternConstellation({ id: 'Lyr' }).description, /里拉琴.*俄耳甫斯/);
assert.match(readWesternConstellation({ id: 'Boo' }).sources[0].url, /\/Bootes$/);
assert.equal(readWesternConstellation({ ...orion, culture: 'chinese' }), null);
for (const invalid of [null, {}, { id: 'constructor' }, { id: 'XYZ' }])
  assert.equal(readWesternConstellation(invalid), null);
for (const lang of languages) {
  const serpens = readWesternConstellation({ id: 'Ser' }, lang);
  assert.match(serpens.description, /Serpens Caput/);
  assert.match(serpens.description, /Serpens Cauda/);
  assert.match(serpens.observing, /M5\b/);
  assert.match(serpens.observing, /M16\b/);
  assert.match(serpens.link.name, /Serpens Caput/);
  assert.ok(serpens.sources.some((ref) => ref.name.includes('Serpens Cauda')));
}

console.log(
  `Verified ${chartPages.size} charts in five historical groups, ${storyParagraphs.size} figure histories and traditions, ${relatedParagraphs.size} related readings, ${paragraphs.size} introductions and guides, and ${namedObjects.size} catalogued objects.`
);
