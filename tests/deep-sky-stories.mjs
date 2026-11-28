import assert from 'node:assert/strict';
import { DEEP_SKY_OBJECTS } from '../src/deep-sky-catalog.js';
import { readDeepSkyObject } from '../src/deep-sky-guide.js';
import { originalICImpression } from '../src/deep-sky-index-impressions.js';
import { indexCatalogueRecord } from '../src/deep-sky-index-catalogue-reading.js';
import { messierObservationNotes } from '../src/messier-observation-notes.js';
import { printedMessierSource } from '../src/messier-observing-log-reading.js';

const byId = new Map(DEEP_SKY_OBJECTS.map((object) => [object.id, object]));
const article = (id, language = 'en') => readDeepSkyObject(byId.get(id), language);
for (const language of ['zh', 'en', 'ru', 'fr']) {
  for (const id of ['NGC2359', 'NGC6334', 'NGC7635', 'M87', 'LMC', 'NGC292']) {
    const { story, relatedStory } = article(id, language);
    assert.ok(relatedStory.label && relatedStory.text && relatedStory.links?.length, id);
    assert.ok(!story.includes(relatedStory.text) && !relatedStory.text.includes(story), id);
    assert.ok(relatedStory.links.every((link) => link.url.startsWith('https://')));
  }
  for (const [number, note] of Object.entries(messierObservationNotes)) {
    assert.equal(new Set(note).size, 4, number);
    const item = article('M' + number, language);
    assert.ok(item.story.includes(note[['zh', 'en', 'ru', 'fr'].indexOf(language)]), number);
    assert.ok(
      item.sources.some((s) => s.url === printedMessierSource(Number(number)).url),
      number
    );
  }
}

assert.match(article('NGC5139').story, /1677.*Dunlop.*centre.*440.*1828.*eight/);
assert.ok(article('NGC5139').sources.some((s) => s.url.includes('jstor-107841/page/n25')));
assert.match(article('NGC7635').story, /Herschel.*1787.*ninth-magnitude.*off-centre/);
assert.match(article('NGC7635').relatedStory.text, /anniversary.*2016/);
assert.match(article('M87').story, /18 March 1781.*eighth-magnitude.*M84 and M86/);
assert.match(article('M87').relatedStory.text, /2019.*Event Horizon Telescope/);
assert.match(printedMessierSource(87).url, /page=270,271$/);
assert.match(printedMessierSource(103).name, /266–267$/);
assert.equal(printedMessierSource(104), undefined);
assert.match(article('M49').story, /22 and 23 April 1779.*equally bright/);
assert.match(article('M63').story, /eighth-magnitude.*measuring wire/);
assert.match(article('M60').story, /13 and 14 April 1779.*15th/);
assert.match(article('IC1613').story, /1906.*Wolf.*26 Ceti.*1928.*Baade/);
assert.match(article('IC3327').story, /145.*Frost.*bM.*Arequipa/);
assert.deepEqual(originalICImpression(3328), { terms: 'vF,vS,bM', printedPage: 145, pdfPage: 41 });
assert.deepEqual(originalICImpression(5354), { terms: 'eeF,S,R', printedPage: 185, pdfPage: 81 });
assert.match(article('IC5354').story, /exceedingly faint, small, round/);
const plainIC = [...byId.keys()].filter((id) => /^IC\d+$/.test(id));
assert.ok(plainIC.filter((id) => originalICImpression(Number(id.slice(2)))).length > 2200);
const noHistoricalRow = plainIC.find((id) => {
  const number = Number(id.slice(2));
  return !originalICImpression(number) && !indexCatalogueRecord(number)?.printedPage;
});
assert.match(article(noHistoricalRow).story, /Dreyer listed.*modern J2000 position/);
assert.doesNotMatch(article(noHistoricalRow).story, /discovered|observer column/);
assert.match(article('MWSC3156').story, /Terzan 8.*41 stars.*0\.11°/);
assert.match(article('H13').story, /Harvard 13.*84 stars/);
assert.match(article('PGC143').story, /1909.*Wolf.*Lundmark.*Melotte.*1926/);
console.log(
  'Deep-sky histories, dated observing notes, facsimile links and secondary stories passed.'
);
