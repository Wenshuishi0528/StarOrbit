import assert from 'node:assert/strict';
import { DEEP_SKY_OBJECTS } from '../src/deep-sky-catalog.js';
import { describeDeepSkySubject, readDeepSkyObject } from '../src/deep-sky-guide.js';
import { messierReading } from '../src/messier-reading-data.js';
import { deepSkyLandmarks } from '../src/deep-sky-featured-reading.js';
import { originalNGCRecord } from '../src/deep-sky-historical-records.js';
import { indexCatalogueRecord } from '../src/deep-sky-index-catalogue-reading.js';

const paragraphs = new Map();
const languages = ['zh', 'en', 'ru', 'fr'];
for (const object of DEEP_SKY_OBJECTS) {
  const variants = languages.map((language) => {
    const article = readDeepSkyObject(object, language);
    assert.ok(article.description.length >= 12, object.id + ' ' + language);
    assert.equal(article.description, describeDeepSkySubject(object, language));
    assert.ok(article.observing && article.observing !== article.description);
    assert.ok(article.story?.length >= (language === 'zh' ? 35 : 65), object.id + ' ' + language);
    assert.ok(
      ['history', 'tradition', 'name', 'discovery', 'catalogue'].includes(article.storyKind)
    );
    for (const section of [article.description, article.detail, article.observing])
      if (section)
        assert.ok(!article.story.includes(section) && !section.includes(article.story), object.id);
    for (const s of article.sources) assert.equal(new URL(s.url).protocol, 'https:');
    assert.equal(new Set(article.sources.map((s) => s.url)).size, article.sources.length);
    const prose = [article.description, article.story, article.detail, article.observing]
      .filter(Boolean)
      .join(' ');
    assert.ok(prose.length >= 38 && !/\b(?:undefined|null|NaN)\b|\{\w+\}/.test(prose));
    assert.ok(article.link?.url.startsWith('https://'), object.id);
    assert.equal(article.sources[0].url, article.link.url);
    return article.description;
  });
  assert.equal(new Set(variants).size, 4, object.id);
  paragraphs.set(object.id, variants);
}
assert.ok(paragraphs.size > 12000);
assert.deepEqual(
  Object.keys(messierReading),
  Array.from({ length: 110 }, (_, i) => 'M' + (i + 1))
);
for (const langIndex of [0, 1, 2, 3]) {
  assert.equal(new Set(Object.values(messierReading).map((row) => row[langIndex])).size, 110);
}
for (const id of Object.keys(deepSkyLandmarks)) {
  assert(paragraphs.has(id), 'unreachable named article ' + id);
  assert.equal(new Set(deepSkyLandmarks[id].intro).size, 4);
}
assert.match(paragraphs.get('M1')[0], /1054.*中子星/);
assert.match(paragraphs.get('HCG92')[1], /NGC 7320/);
assert.match(paragraphs.get('M31')[0], /仙女座/);
assert.equal(readDeepSkyObject(null), null);
const m1 = DEEP_SKY_OBJECTS.find((o) => o.id === 'M1');
assert.equal(describeDeepSkySubject(m1), paragraphs.get('M1')[0]);
assert.match(readDeepSkyObject(m1).story, /贝维斯.*彗星.*梅西耶.*烛光/);
const cliffs = DEEP_SKY_OBJECTS.find((o) => o.id === 'JWST-CARINA-2022');
assert.match(readDeepSkyObject(cliffs).description, /韦伯.*影像.*NGC 3324/);
assert.match(readDeepSkyObject(cliffs).story, /2022.*红外.*取景框/);
assert.match(paragraphs.get('C14')[0], /NGC 869.*NGC 884/);
assert.match(paragraphs.get('B33')[0], /马头星云.*剪影/);
assert.equal(readDeepSkyObject(m1, 'en-GB').detail, readDeepSkyObject(m1, 'en').detail);
const m40 = DEEP_SKY_OBJECTS.find((o) => o.id === 'M40');
assert.match(readDeepSkyObject(m40, 'en').sources[0].name, /Messier.*1781/);
assert.match(readDeepSkyObject(m1, 'en').sources[0].url, /messier-1\/$/);
const find = (id) => DEEP_SKY_OBJECTS.find((o) => o.id === id);
for (const language of languages)
  assert.equal(
    readDeepSkyObject(find('M45'), language).story,
    readDeepSkyObject(find('Mel22'), language).story
  );
assert.match(readDeepSkyObject(find('M45')).story, /毛利.*新年/);
const m87 = readDeepSkyObject(find('M87'));
assert.match(m87.story, /1781.*(?:梅西耶|三月|3 月)|梅西耶.*1781/);
assert.match(m87.relatedStory.text, /2019.*黑洞/);
assert.match(readDeepSkyObject(find('NGC6543')).story, /哈金斯.*光谱/);
assert.match(readDeepSkyObject(find('NGC1'), 'en').story, /F, S, R.*faint, small, round.*d’Arrest/);
assert.match(originalNGCRecord(1), /F,S,R/);
assert.equal(indexCatalogueRecord(1).observer, undefined); // a damaged "11" on this page must not be assigned to IC 1
assert.equal(indexCatalogueRecord(3327).observer, 'F');
assert.match(readDeepSkyObject(find('IC3327'), 'en').story, /145.*Frost.*Arequipa/);
assert.ok(readDeepSkyObject(find('IC3327'), 'en').sources.some((s) => s.url.endsWith('#page=41')));
const suffixed = DEEP_SKY_OBJECTS.find(
  (o) => /^NGC\d+[A-Z]$/.test(o.id) && !deepSkyLandmarks[o.id]
);
assert.match(readDeepSkyObject(suffixed, 'en').story, /modern suffix/);
console.log(
  paragraphs.size + ' deep-sky objects and image fields have sourced four-language introductions.'
);
