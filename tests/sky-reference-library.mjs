import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { equatorial } from '../src/environment-math.js';

const bundle = await build({
  stdin: {
    contents: `export * from './sky-reference-library.js';
      export { skyReadingFor } from './sky-reading-view.js';
      export { westernRegion } from './sky-location-math.js';
      export { objectSightline } from './sky-object-target.js';`,
    resolveDir: fileURLToPath(new URL('../src', import.meta.url)),
  },
  platform: 'node',
  format: 'esm',
  bundle: true,
  write: false,
});
const { loadReferenceLibrary, referenceCategories, skyReadingFor, westernRegion, objectSightline } =
  await import(
    'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
  );

const directory = await loadReferenceLibrary();
assert.equal(await loadReferenceLibrary(), directory);
const all = directory.search('');
assert.deepEqual(directory.search('HD 26907', 'star'), ['hip:20000']);
assert.deepEqual(directory.search('HD 61907', 'star'), ['hip:37882', 'hip:37884']);
assert.deepEqual(directory.search('TYC 4774-934-1', 'star'), ['tycho:orion:0']);
assert.equal(directory.subject('tycho:orion:0', 'zh').name, 'TYC 4774-934-1');
assert.equal(directory.subject('hip:20000', 'zh').referenceDesignation, 'HD 26907');
assert.equal(new Set(all).size, all.length);
assert.equal(
  all.length,
  Object.keys(referenceCategories)
    .filter((k) => k !== 'all')
    .reduce((sum, k) => sum + directory.search('', k).length, 0)
);
assert.equal(directory.search('', 'asterism').length, 312);
assert.equal(directory.search('', 'constellation').length, 88);
const origins = ['classical', 'early-atlases', 'hevelius', 'lacaille', 'argo'].map((id) =>
  directory.search('', 'constellation', id)
);
assert.deepEqual(
  origins.map((list) => list.length),
  [47, 17, 7, 14, 3]
);
assert.deepEqual(new Set(origins.flat()), new Set(directory.search('', 'constellation')));
const positions = ['north', 'equatorial', 'south'].map((id) =>
  directory.search('', 'constellation', id)
);
assert.deepEqual(
  positions.map((rows) => rows.length),
  [28, 15, 45]
);
assert.deepEqual(new Set(positions.flat()), new Set(directory.search('', 'constellation')));
const equatorialRegions = new Set();
for (let ra = 0; ra < 360; ra += 0.1)
  equatorialRegions.add(westernRegion(equatorial(ra, 0)).targetId);
assert.deepEqual(new Set(positions[1]), equatorialRegions);
assert.deepEqual(directory.search('天赤道'), positions[1]);
assert.deepEqual(directory.search('Crux', 'constellation', 'south'), ['constellation:Cru']);
assert.deepEqual(directory.search('Crux', 'constellation', 'north'), []);
assert.deepEqual(
  new Set(origins[4]),
  new Set(['constellation:Car', 'constellation:Pup', 'constellation:Vel'])
);
const zodiac = directory.search('', 'constellation', 'zodiac');
const ecliptic = directory.search('', 'constellation', 'ecliptic');
assert.equal(zodiac.length, 12);
assert.equal(ecliptic.length, 13);
assert.deepEqual(
  ecliptic.filter((id) => id !== 'constellation:Oph'),
  zodiac
);
assert.deepEqual(ecliptic.slice(7, 10), [
  'constellation:Sco',
  'constellation:Oph',
  'constellation:Sgr',
]);
assert.deepEqual(directory.search('蛇夫座', 'constellation', 'zodiac'), []);
assert.deepEqual(directory.search('Ophiuchus', 'constellation', 'ecliptic'), ['constellation:Oph']);
assert.deepEqual(directory.search('射手座', 'constellation', 'zodiac'), ['constellation:Sgr']);
assert.deepEqual(directory.search('Antlia', 'constellation', 'classical'), []);
assert.deepEqual(directory.search('Antlia', 'constellation', 'lacaille'), ['constellation:Ant']);
assert.deepEqual(directory.search('NGC 224', 'deep-sky', 'zodiac'), ['deep-sky:m31']);
assert.deepEqual(directory.search('Lacaille', 'constellation'), origins[3]);
assert.deepEqual(directory.search('南船座', 'constellation'), origins[4]);
assert.deepEqual(directory.search('黄道十二星座'), zodiac);
assert.deepEqual(directory.search('écliptique', 'constellation'), ecliptic);
assert.equal(directory.search('', 'sky-group').length, 36);
assert.equal(directory.search('', 'solar').length, 10);
assert.deepEqual(directory.search('宇宙悬崖'), []);
for (const query of ['M31', 'Messier 31', 'NGC 224', 'NGC 0224'])
  assert.deepEqual(directory.search(query), ['deep-sky:m31'], query);
for (const query of ['M45', 'Mel22', 'Mel 022', 'Melotte 22'])
  assert.deepEqual(directory.search(query), ['deep-sky:m45'], query);
assert.ok(!all.includes('deep-sky:mel22'));
for (const query of ['扶筐', 'Fu Kuang', 'Fú Kuāng'])
  assert.equal(directory.search(query)[0], 'asterism:chinese:075', query);
assert.ok(directory.search('角宿', 'sky-group').includes('group:jiao'));
assert.ok(directory.search('角宿', 'asterism').length > 0);
assert.deepEqual(directory.search('扶筐', 'solar'), []);
assert.equal(directory.search('东方青龙')[0], 'group:azuredragon');
assert.equal(directory.search('二十八宿', 'sky-group').length, 28);
assert.equal(directory.search('三垣', 'sky-group').length, 3);
assert.equal(directory.search('四象', 'sky-group').length, 4);
assert.equal(directory.search('Луна', 'solar')[0], 'solar:Moon');
assert.equal(directory.search('Antlia', 'constellation')[0], 'constellation:Ant');
assert.equal(directory.search('Algol', 'star')[0], 'hip:14576');
assert.equal(directory.search('HIP 91262', 'star')[0], 'hip:91262');
assert.ok(directory.search('Gajahmina', 'star').includes('hip:5364'));
for (const [id, pattern] of [
  ['hip:58001', /大腿.*Phecda/],
  ['hip:59774', /长尾|尾巴/],
  ['hip:62956', /alioze/],
  ['hip:67301', /Benetnasch/],
  ['hip:72622', /南钳/],
  ['hip:74785', /北钳/],
  ['hip:113357', /4.2.*行星/],
  ['hip:104214', /贝塞尔.*视差/],
  ['hip:110991', /古德里克.*五天/],
  ['hip:10826', /GALEX.*尾迹/],
  ['hip:101958', /Nicolaus.*Venator/],
  ['hip:5364', /象和鱼/],
  ['hip:17573', /赫尔墨斯/],
  ['hip:841', /天厩.*换马/],
  ['hip:42806', /北驴.*沼泽/],
  ['hip:45238', /平静.*Mia/],
  ['hip:85822', /土耳其/],
]) {
  const target = directory.subject(id, 'zh');
  assert.match((await skyReadingFor(target, 'western', 'zh')).story, pattern, id);
}
const tycho = directory.subject('tycho:orion:0', 'zh');
assert.ok(directory.search(tycho.name, 'star').includes(tycho.id));
const elnath = directory.subject('hip:25428', 'zh');
const offset = equatorial(elnath.ra, elnath.dec + 0.06);
assert.equal(westernRegion(objectSightline({}, elnath, offset)).id, 'Tau');
assert.equal(westernRegion(objectSightline({ regionOnly: true }, elnath, offset)).id, 'Aur');
const star = directory.subject('hip:91262', 'zh');
const related = directory.related(star.id, star);
assert.ok(related.includes('asterism:chinese:304') && related.includes('constellation:Lyr'));
const lyra = directory.related('constellation:Lyr', directory.subject('constellation:Lyr', 'zh'));
assert.ok(lyra.includes('deep-sky:m57') && lyra.includes(star.id));
const subject = directory.subject('asterism:chinese:304', 'zh');
assert.ok(
  directory
    .related('deep-sky:m31', directory.subject('deep-sky:m31', 'zh'))
    .includes('asterism:chinese:012')
);
assert.ok(
  directory
    .related('asterism:chinese:104', directory.subject('asterism:chinese:104', 'zh'))
    .includes('deep-sky:m44')
);
assert.ok(directory.related(subject.id, subject).includes('hip:91262'));
assert.ok(directory.related(subject.id, subject).includes('group:niu'));
assert.equal(
  directory.related('group:azuredragon', directory.subject('group:azuredragon', 'zh')).length,
  7
);
const storyKinds = new Set(['tradition', 'history', 'name', 'discovery', 'catalogue']);
for (const category of Object.keys(referenceCategories).filter((k) => k !== 'all')) {
  for (const id of directory.search('', category)) {
    for (const lang of ['zh', 'en', 'fr', 'ru']) {
      const target = directory.subject(id, lang);
      assert.equal(target.type, category, id);
      const label = id + ' ' + lang;
      const article = await skyReadingFor(target, 'western', lang).catch((error) =>
        assert.fail(label + ': ' + error.message)
      );
      assert.ok(article?.description?.trim().length >= 12, label);
      assert.ok(article.story?.trim().length >= 30 && article.story !== article.description, label);
      assert.ok(storyKinds.has(article.storyKind), label);
      assert.ok(!/\b(?:undefined|null|NaN)\b|\{\w+\}/.test(article.story), label);
      if (article.relatedStory) {
        const companion = article.relatedStory;
        assert.ok(companion.text?.trim() && companion.text !== article.story, label);
        assert.ok(companion.label?.trim(), label);
        assert.ok(
          companion.links?.some((link) => link.url?.startsWith('https://')),
          label
        );
      }
      assert.ok(
        article.sources.some((s) => s.url.startsWith('https://')),
        id
      );
    }
  }
}
console.log(
  'Reference directory:',
  all.length,
  'distinct subjects; aliases, categories, four languages and relationships verified.'
);
