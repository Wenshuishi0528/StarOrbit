import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import {
  BIRTHDAY_ZODIAC,
  BIRTHDAY_MANSIONS,
  birthdayContentForTarget,
} from '../src/birthday-content.js';

const { outputFiles } = await build({
  entryPoints: ['src/xuntian-catalog.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { searchXuntianTargets, getXuntianTarget } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const json = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url)));
const westernArt = json('../assets/constellation-art/manifest.json').images;
const chineseArt = json('../assets/chinese-sky/art/manifest.json').images;
assert.equal(BIRTHDAY_ZODIAC.length, 12);
assert.equal(BIRTHDAY_MANSIONS.length, 28);
assert.equal(new Set([...BIRTHDAY_ZODIAC, ...BIRTHDAY_MANSIONS].map((x) => x.targetId)).size, 40);
let queried = 0;
for (const [culture, entries, art] of [
  ['western', BIRTHDAY_ZODIAC, westernArt],
  ['chinese', BIRTHDAY_MANSIONS, chineseArt],
]) {
  for (const [index, entry] of entries.entries()) {
    assert.equal(entry.index, index);
    assert.equal(entry.culture, culture);
    assert.equal(birthdayContentForTarget(entry.targetId), entry);
    assert(getXuntianTarget(entry.targetId), entry.targetId);
    assert(art.some((image) => image.imageId === entry.artworkId), entry.artworkId);
    assert(entry.description.length > 20);
    assert.equal(new Set(entry.blessings).size, 2);
    for (const wish of entry.blessings) assert(wish.length > 10 && wish.length < 70);
    for (const alias of entry.aliases) {
      // Both sky-culture modes search the shared catalogue; choosing the result
      // then selects its real target and artwork rather than a duplicate star.
      for (const selectedCulture of ['western', 'chinese']) {
        assert.equal(
          searchXuntianTargets(alias, 'zh', 7, selectedCulture)[0]?.id,
          entry.targetId,
          `${alias} from ${selectedCulture}`
        );
        queried++;
      }
    }
    if (culture === 'chinese') assert.equal(entry.orderInTheme, (index % 7) + 1);
  }
}
const wings = BIRTHDAY_MANSIONS[26];
assert.equal(wings.zh, '翼宿');
assert.equal(wings.fullName, '翼火蛇');
assert.equal(wings.artworkId, 'yi-wings');
assert.equal(wings.themeName, '南方朱雀');
assert.equal(wings.orderInTheme, 6);
assert.equal(searchXuntianTargets('牛郎星')[0].id, 'hip:97649');
assert.equal(searchXuntianTargets('织女星')[0].id, 'hip:91262');
assert.equal(searchXuntianTargets('Scorpio')[0].id, 'constellation:Sco');
assert.equal(searchXuntianTargets('Scorpius')[0].id, 'constellation:Sco');
console.log(`Birthday content: all 12 signs / 28 mansions, existing artwork IDs, 80 wishes and ${queried} alias searches passed.`);
