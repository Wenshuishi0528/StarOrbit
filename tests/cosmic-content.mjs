import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { COSMIC_TOPICS, cosmicTopic, cosmicText } from '../src/cosmic-content.js';

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/xuntian-catalog.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const { getXuntianTarget } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);

assert.deepEqual(COSMIC_TOPICS.map(topic => topic.id), ['supernova', 'neutron', 'pulsar', 'meteor', 'blackhole']);
assert.equal(new Set(COSMIC_TOPICS.map(topic => topic.id)).size, 5);
const languages = ['zh', 'en', 'ru', 'fr'];
let resolved = 0;
for (const topic of COSMIC_TOPICS) {
  assert.equal(cosmicTopic(topic.id), topic);
  assert.match(topic.accent, /^#[a-f\d]{6}$/i);
  for (const language of languages) {
    const copy = topic.copy[language];
    for (const field of ['title', 'subtitle', 'summary', 'modelNote'])
      assert.equal(typeof copy[field], 'string', `${topic.id}/${language}/${field}`);
    assert(copy.facts.length >= 2 && copy.facts.length <= 4);
    for (const value of [copy.title, copy.subtitle, copy.summary, copy.modelNote, ...copy.facts])
      assert(value.trim().length > 0);
    for (const target of topic.targets) {
      assert(target.label[language] && target.note[language]);
      assert.equal(cosmicText(target.label, language), target.label[language]);
      for (const culture of ['western', 'chinese']) {
        const physical = getXuntianTarget(target.id, language, culture);
        assert(physical, `${target.id}: target must exist in the observing catalogue`);
        assert.equal(physical.id, target.id);
        assert.equal(physical.type, 'deep-sky', 'Host/remnant links must not masquerade as a point star');
        assert(physical.direction.every(Number.isFinite));
        resolved++;
      }
    }
  }
  assert(topic.sources.length >= 2);
  for (const { title, url } of topic.sources) {
    assert(title.trim());
    assert.equal(new URL(url).protocol, 'https:');
    assert(['science.nasa.gov', 'www.nasa.gov', 'www.jpl.nasa.gov', 'heasarc.gsfc.nasa.gov', 'chandra.si.edu', 'www.mpifr-bonn.mpg.de'].includes(new URL(url).hostname));
  }
}
assert.deepEqual(cosmicTopic('meteor').targets, [], 'Atmospheric meteor demos have no fabricated deep-sky coordinate');
assert.equal(cosmicTopic('missing'), COSMIC_TOPICS[0]);
assert.equal(cosmicText({ zh: '中', en: 'English' }, 'unknown'), 'English');
assert.equal(cosmicText(null), '');
console.log(`Cosmic content: five complete four-language topics, source links, model notes and ${resolved} culture/language target resolutions passed.`);
