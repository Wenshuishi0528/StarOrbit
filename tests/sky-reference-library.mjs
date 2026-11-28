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
assert.equal(new Set(all).size, all.length);
assert.equal(
  all.length,
  Object.keys(referenceCategories)
    .filter((k) => k !== 'all')
    .reduce((sum, k) => sum + directory.search('', k).length, 0)
);
assert.equal(directory.search('', 'asterism').length, 312);
assert.equal(directory.search('', 'constellation').length, 88);
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
for (const category of Object.keys(referenceCategories).filter((k) => k !== 'all')) {
  const ids = directory.search('', category);
  for (const id of [ids[0], ids.at(-1)]) {
    for (const lang of ['zh', 'en', 'fr', 'ru']) {
      const target = directory.subject(id, lang);
      assert.equal(target.type, category, id);
      const article = await skyReadingFor(target, 'western', lang);
      assert.ok(article?.description?.length > 30, id + ' ' + lang);
    }
  }
}
console.log(
  'Reference directory:',
  all.length,
  'distinct subjects; aliases, categories, four languages and relationships verified.'
);
