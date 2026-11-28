import assert from 'node:assert/strict';
import stars from '../assets/stars.json' with { type: 'json' };
import chart from '../assets/star-chart.json' with { type: 'json' };
import chinese from '../assets/chinese-sky/physical-stars.json' with { type: 'json' };
import parallaxes from '../assets/stellar-distances/catalog.json' with { type: 'json' };
import { stellarProfiles } from '../src/stellar-featured-reading.js';
import { standardStarNames } from '../src/stellar-name-register-reading.js';
import { solarBodyProfiles } from '../src/solar-body-reading-data.js';
import { readCatalogStar, readSolarBody } from '../src/stellar-body-reading.js';
import { searchSolarTargets } from '../src/solar-targets.js';
import { SURVEY_FIELDS } from '../src/survey-lab-math.js';
import { decodeTycho, fieldRay } from '../src/survey-sky-product-math.js';
import { tychoCutouts } from '../src/survey-sky-product-tycho.js';

const langs = ['zh', 'en', 'fr', 'ru'];
const names = new Map(chart.stars.map((s) => [String(s.id), s]));
const solar = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Earth',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
];
const originalStars = [91262, 32349, 11767, 27989, 97649];
const descriptions = new Set();

function checkProfile(read) {
  const translations = new Set();
  for (const lang of langs) {
    const card = read(lang);
    assert(card.description.length >= (lang === 'zh' ? 45 : 100));
    assert(card.detail.length >= (lang === 'zh' ? 20 : 60));
    assert(card.story.length >= (lang === 'zh' ? 48 : 95));
    assert(['name', 'history', 'discovery', 'tradition'].includes(card.storyKind));
    assert.notEqual(card.story, card.detail);
    assert.notEqual(card.story, card.description);
    assert.notEqual(card.detail, card.description);
    assert.doesNotMatch(card.description, /\{[^}]*\}|undefined|\bNaN\b/);
    assert.doesNotMatch(card.detail, /\{[^}]*\}|undefined|\bNaN\b/);
    assert.equal(new URL(card.link.url).protocol, 'https:');
    assert(card.link.name);
    assert.equal(card.sources[0].url, card.link.url);
    for (const source of card.sources) assert.equal(new URL(source.url).protocol, 'https:');
    translations.add(card.description);
    assert(!descriptions.has(card.description), 'repeated prose for two distinct objects');
    descriptions.add(card.description);
  }
  assert.equal(translations.size, langs.length);
}

for (const id of Object.keys(stellarProfiles)) {
  assert(names.has(id) && stars.some(([hip]) => String(hip) === id));
  checkProfile((lang) => readCatalogStar({ id: 'hip:' + id }, {}, lang));
}
for (const id of originalStars) assert(stellarProfiles[id]);
assert.equal(Object.keys(stellarProfiles).length, 33);
assert.match(readCatalogStar({ id: 'hip:32349' }, {}, 'en').description, /white dwarf/);
assert.match(readCatalogStar({ id: 'hip:7588' }, {}, 'fr').description, /équateur/);
assert.match(readCatalogStar({ id: 'hip:65474' }, {}, 'ru').description, /спектральные/);
assert.match(readCatalogStar({ id: 'hip:36850' }, {}).description, /六颗/);
const algol = readCatalogStar({ id: 'hip:14576' }, {});
assert.match(algol.description, /三星系统.*食变星/);
assert.match(algol.detail, /2\.87.*光变曲线/);
assert.match(algol.story, /1783.*皇家学会/);
assert.match(readCatalogStar({ id: 'hip:97649' }, {}).story, /牛郎.*儿女/);
assert.match(readCatalogStar({ id: 'hip:91262' }, {}).story, /织女.*七月初七.*喜鹊/);
assert.equal(Object.keys(standardStarNames).length, 541);
for (const [key, [official, , date, designation]] of Object.entries(standardStarNames)) {
  assert(stars.some(([hip]) => hip === Number(key)));
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date) && designation);
  for (const l of langs) {
    const r = readCatalogStar({ id: 'hip:' + key }, {}, l);
    assert(r.story?.length >= 35, official + ' ' + l);
    assert.notEqual(r.storyKind, 'catalogue', official + ' ' + l);
    assert(r.relatedStory?.text.includes('HIP ' + key), official + ' ' + l);
    assert.doesNotMatch(r.story, /\b(?:undefined|NaN)\b/);
  }
}

assert.deepEqual(Object.keys(solarBodyProfiles).sort(), [...solar].sort());
for (const body of solar) {
  assert(searchSolarTargets(body, 'en').some((s) => s.body === body));
  checkProfile((lang) => readSolarBody('solar:' + body, lang));
}
assert.match(readSolarBody('Moon').story, /嫦娥/);
assert.match(readSolarBody('Venus').story, /启明.*长庚/);
assert.match(readSolarBody('Mercury').story, /1631/);
assert.equal(
  readSolarBody('solar:venus', 'fr').description,
  readSolarBody('Venus', 'fr-FR').description
);
assert.equal(readSolarBody('Pluto'), null);
assert.equal(readCatalogStar({ id: 'deep-sky:m51' }), null);

const parallaxByHip = new Map(parallaxes.rows.map(([n, parallax]) => [n, parallax]));
const hip = stars.find(
  ([n, ra, dec, mag, colour]) =>
    !stellarProfiles[n] &&
    Number.isFinite(ra + dec) &&
    mag > 4 &&
    mag < 6 &&
    Number(colour) >= 1 &&
    parallaxByHip.has(n)
);
const [id, ra, dec, mag, rawBV] = hip;
const target = { id: 'hip:' + id, ra, dec, magnitude: mag };
const hit = {
  magnitude: mag,
  bv: Number(rawBV),
  distanceLightYears: 3261.56 / parallaxByHip.get(id),
};
const plain = readCatalogStar(target, hit, 'en');
if (!standardStarNames[id]) assert.match(plain.story, /Hipparcos|HIP/);
const hip20000 = readCatalogStar({ id: 'hip:20000' }, {}, 'en');
assert.match(hip20000.story, /HD 26907.*A2.*HIP 20000.*85 Hipparcos.*7\.173/);
assert(hip20000.sources.some(({ url }) => new URL(url).searchParams.get('HD') === '26907'));
assert.match(readSolarBody('Neptune', 'en').story, /Le Verrier.*d’Arrest.*Bremiker/);
assert.match(plain.description, new RegExp('HIP ' + id));
assert.match(plain.observing, /dark sky|dark,? sky/i);
assert.match(plain.detail, /red side.*Sun/);
assert.match(plain.detail, /light-years/);
assert.equal(new URL(plain.link.url).searchParams.get('HIP'), String(id));
const noMeasures = readCatalogStar(target, { magnitude: NaN, bv: null, distanceLightYears: -1 });
assert.doesNotMatch(noMeasures.description, /B−V|光年|NaN/);
assert.match(noMeasures.detail, /可靠的距离测量/);

for (const obj of chinese.otherStars) {
  assert(obj.colorUnavailable);
  // The colour in the Chinese data file is a plotting placeholder, not a published B−V.
  const card = readCatalogStar(obj, { magnitude: obj.mag, bv: Number(obj.bv) }, 'en');
  assert.match(card.detail, /broad G band/);
  assert.equal(card.storyKind, 'catalogue');
  assert.ok(card.story.includes(obj.id.slice(5)));
  assert.match(card.story, /\d+ CCD measurements/);
  assert.doesNotMatch(
    card.description + card.detail,
    /B−V|light-years|red side|blue side|unaided eye/
  );
  assert.equal(new URL(card.link.url).searchParams.get('Source'), obj.id.slice(5));
}
const field = SURVEY_FIELDS[0],
  rows = decodeTycho(tychoCutouts.fields[field.id]);
const i = rows.findIndex((row) => Number.isFinite(row.bv));
const row = rows[i];
const point = { id: 'tycho:' + field.id + ':' + i, direction: fieldRay(field, row.x, row.y) };
const tycho = readCatalogStar(point, { magnitude: row.magnitude, bv: row.bv }, 'en');
assert.match(tycho.story, /star mappers.*ground catalogues.*TYC [\d-]+ used \d+ positions/);
assert.match(tycho.description, /Vₜ band/);
assert.match(tycho.detail, /approximate B−V/);
const cone = new URL(tycho.link.url);
assert.equal(cone.searchParams.get('-source'), 'I/259/tyc2');
assert.match(
  tycho.description,
  new RegExp('TYC ' + ['TYC1', 'TYC2', 'TYC3'].map((k) => cone.searchParams.get(k)).join('-'))
);
assert.equal(cone.searchParams.has('-c'), false);
const otherCutout = readCatalogStar({ ...point, id: 'tycho:custom:0' }, {}, 'en');
assert.match(new URL(otherCutout.link.url).searchParams.get('-c'), /^\d+\.\d+ -?\d+\.\d+$/);
const empty = readCatalogStar({ id: 'hip:1' }, {}, 'en');
assert.match(empty.description, /[Cc]elestial coordinates/);
assert.doesNotMatch(empty.description, /magnitude|light-years|B−V/);
console.log(
  '33 individually sourced bright stars and 10 solar-system objects in four languages, plus HIP, Gaia and Tycho photometry, distance and catalogue source checks passed.'
);
