import assert from 'node:assert/strict';
import stars from '../assets/stars.json' with { type: 'json' };
import chart from '../assets/star-chart.json' with { type: 'json' };
import chinese from '../assets/chinese-sky/physical-stars.json' with { type: 'json' };
import parallaxes from '../assets/stellar-distances/catalog.json' with { type: 'json' };
import { stellarProfiles } from '../src/stellar-featured-reading.js';
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
    assert.doesNotMatch(card.description, /\{[^}]*\}|undefined|\bNaN\b/);
    assert.equal(new URL(card.link.url).protocol, 'https:');
    assert(card.link.name);
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

assert.deepEqual(Object.keys(solarBodyProfiles).sort(), [...solar].sort());
for (const body of solar) {
  assert(searchSolarTargets(body, 'en').some((s) => s.body === body));
  checkProfile((lang) => readSolarBody('solar:' + body, lang));
}
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
assert.match(plain.description, /dark sky|dark,? sky/i);
assert.match(plain.description, /red side.*Sun/);
assert.match(plain.description, /light-years/);
assert.equal(new URL(plain.link.url).searchParams.get('HIP'), String(id));
const noMeasures = readCatalogStar(target, { magnitude: NaN, bv: null, distanceLightYears: -1 });
assert.doesNotMatch(noMeasures.description, /B−V|光年|NaN/);
assert.match(noMeasures.description, /可靠的距离测量/);

for (const obj of chinese.otherStars) {
  assert(obj.colorUnavailable);
  // The colour in the Chinese data file is a plotting placeholder, not a published B−V.
  const card = readCatalogStar(obj, { magnitude: obj.mag, bv: Number(obj.bv) }, 'en');
  assert.match(card.description, /broad G band/);
  assert.doesNotMatch(card.description, /B−V|light-years|red side|blue side|unaided eye/);
  assert.equal(new URL(card.link.url).searchParams.get('Source'), obj.id.slice(5));
}
const field = SURVEY_FIELDS[0],
  rows = decodeTycho(tychoCutouts.fields[field.id]);
const i = rows.findIndex((row) => Number.isFinite(row.bv));
const row = rows[i];
const point = { id: 'tycho:' + field.id + ':' + i, direction: fieldRay(field, row.x, row.y) };
const tycho = readCatalogStar(point, { magnitude: row.magnitude, bv: row.bv }, 'en');
assert.match(tycho.description, /Vₜ band/);
assert.match(tycho.description, /approximate B−V/);
const cone = new URL(tycho.link.url);
assert.equal(cone.searchParams.get('-source'), 'I/259/tyc2');
assert.match(cone.searchParams.get('-c'), /^\d+\.\d+ -?\d+\.\d+$/);
assert.equal(cone.searchParams.get('-c.rs'), '5');
assert.equal(cone.searchParams.has('TYC'), false);
const empty = readCatalogStar({ id: 'hip:1' }, {}, 'en');
assert.match(empty.description, /[Cc]elestial coordinates/);
assert.doesNotMatch(empty.description, /magnitude|light-years|B−V/);
console.log(
  '33 individually sourced bright stars and 10 solar-system objects in four languages, plus HIP, Gaia and Tycho photometry, distance and catalogue source checks passed.'
);
