import assert from 'node:assert/strict';
import { DEEP_SKY_OBJECTS } from '../src/deep-sky-catalog.js';
import { loadHubbleArchive } from '../src/hubble-gallery.js';
import { WEBB_ARTWORKS } from '../src/webb-gallery.js';
import {
  createSkyImageIndex,
  galleryCoordinates,
  panstarrsCovers,
} from '../src/sky-image-index.js';
import facts from '../src/sky-artwork-facts.json' with { type: 'json' };
import { artworkNotes } from '../src/sky-artwork-notes.js';
import { describeSkyObject, describeSurveyImage } from '../src/sky-object-reading.js';

const { artworks: HUBBLE_ARTWORKS } = await loadHubbleArchive();
const languages = ['zh', 'en', 'ru', 'fr'];

function checkReadings(id, getParagraphs) {
  const recent = new Set();
  for (const lang of languages) {
    const paragraphs = getParagraphs(lang);
    assert.equal(paragraphs.length, 3, id);
    for (const paragraph of paragraphs) {
      assert.equal(typeof paragraph, 'string', id + ' ' + lang);
      assert.ok(paragraph.trim().length > 8, id + ' ' + lang);
      assert.doesNotMatch(paragraph, /\b(undefined|NaN|null)\b/);
      if (lang === 'ru') assert.match(paragraph, /\p{Script=Cyrillic}/u, id);
      if (lang === 'zh') assert.match(paragraph, /\p{Script=Han}/u, id);
    }
    assert.equal(new Set(paragraphs).size, 3, id + ' repeated paragraph');
    for (let i = 0; i < paragraphs.length; i++) {
      const key = i + ' ' + paragraphs[i];
      assert.ok(!recent.has(key), id + ' untranslated paragraph in ' + lang);
      recent.add(key);
    }
  }
}

const works = [...HUBBLE_ARTWORKS, ...WEBB_ARTWORKS];
for (const work of works) {
  checkReadings(work.id, (lang) => {
    const { image, subject, method } = artworkNotes(work, lang);
    return [image, subject, method];
  });
}

const index = createSkyImageIndex(works);
const ngc346 = index('heic0514a', 'hubble')[0];
const object = ngc346.subjects.find(({ object }) => object.id === 'NGC346').object;
assert.match(
  galleryCoordinates(ngc346.work.center.raDeg, ngc346.work.center.decDeg),
  /00ʰ59ᵐ07.2ˢ.*−72°10′29″/u
);
assert.match(galleryCoordinates(object.ra, object.dec), /00ʰ59ᵐ05.0ˢ.*−72°10′38″/u);
assert.equal(galleryCoordinates(null, 0), '');
assert.equal(galleryCoordinates(360, 95), '');
assert.match(galleryCoordinates(359.999995, 89.999999), /00ʰ00ᵐ00.0ˢ.*\+90°00′00″/u);

// The two archives can issue the same artwork number for separate subjects.
const collision = 'potm2601a';
const both = works.filter((work) => work.id === collision);
assert.equal(both.length, 2);
for (const lang of languages) {
  const [hubble, webb] = both.map((work) => artworkNotes(work, lang));
  assert.notEqual(hubble.image, webb.image);
  assert.notEqual(hubble.method, webb.method);
}

// Archive names sometimes describe an unlabelled edition, a ring in a
// circumstellar disc or a collection of distant galaxies along one sightline.
assert.notEqual(facts.hubble.opo0609b.layout, 'annotated');
assert.notEqual(facts.hubble.opo0002b.kind, 'exoplanet');
assert.notEqual(facts.hubble.opo9601c1.kind, 'galcluster');
function hubbleNotes(id) {
  return artworkNotes(
    HUBBLE_ARTWORKS.find((work) => work.id === id),
    'en'
  );
}
assert.doesNotMatch(hubbleNotes('opo0609b').image, /annotations identify|annotated (view|image)/i);
const disk = hubbleNotes('opo0002b');
assert.doesNotMatch(disk.image, /planetary rings?/i);
assert.doesNotMatch(disk.subject, /^exoplanets? (are|orbit)/i);
assert.doesNotMatch(
  hubbleNotes('opo9601c1').subject,
  /^a galaxy cluster|^galaxy clusters (are|contain)/i
);

let fields = 0;
for (const object of DEEP_SKY_OBJECTS.filter((row) => row.type !== 'image-field')) {
  for (const source of panstarrsCovers(object) ? ['dss', 'panstarrs'] : ['dss']) {
    checkReadings(object.id + ' ' + source, (lang) => {
      const { look, method } = describeSurveyImage(object, source, lang);
      return [look, describeSkyObject(object, lang), method];
    });
    fields++;
  }
}
console.log(
  'Checked three reading notes in four languages for',
  works.length,
  'archive works and',
  fields,
  'survey fields.'
);
