import assert from 'node:assert/strict';
import { DEEP_SKY_OBJECTS } from '../src/deep-sky-catalog.js';
import { describeDeepSkySubject, readDeepSkyObject } from '../src/deep-sky-guide.js';

const paragraphs = new Map();
const languages = ['zh', 'en', 'ru', 'fr'];
for (const object of DEEP_SKY_OBJECTS) {
  const variants = languages.map((language) => {
    const article = readDeepSkyObject(object, language);
    assert.ok(article.description.length >= 38, object.id + ' ' + language);
    assert.doesNotMatch(article.description, /\b(?:undefined|null|NaN)\b|\{\w+\}/);
    assert.ok(article.link?.url.startsWith('https://'), object.id);
    return article.description;
  });
  assert.equal(new Set(variants).size, 4, object.id);
  paragraphs.set(object.id, variants);
}
assert.ok(paragraphs.size > 12000);
assert.match(paragraphs.get('M1')[0], /1054.*中子星/);
assert.match(paragraphs.get('HCG92')[1], /NGC 7320/);
assert.match(paragraphs.get('M31')[0], /仙女座/);
assert.equal(readDeepSkyObject(null), null);
const m1 = DEEP_SKY_OBJECTS.find((o) => o.id === 'M1');
assert.equal(describeDeepSkySubject(m1), paragraphs.get('M1')[0]);
console.log(
  paragraphs.size + ' deep-sky objects and image fields have sourced four-language introductions.'
);
