// Rebuild the offline observing records from the original catalogue tables.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { SURVEY_FIELDS } from '../src/survey-lab-math.js';
import { decodeTycho, projectStar } from '../src/survey-sky-product-math.js';
import { tychoCutouts } from '../src/survey-sky-product-tycho.js';
import { equatorial } from '../src/environment-math.js';
import stars from '../assets/stars.json' with { type: 'json' };
import chinese from '../assets/chinese-sky/physical-stars.json' with { type: 'json' };

const cache = resolve(process.argv[2] || 'output/stellar-observation-sources');
await mkdir(cache, { recursive: true });
async function rows(key, table, columns, filters = {}) {
  const file = join(cache, key + '.tsv');
  let tsv;
  try {
    tsv = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const query = new URLSearchParams({
      '-source': table,
      '-out': columns,
      '-out.max': 'unlimited',
      ...filters,
    });
    const result = await fetch('https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?' + query);
    if (!result.ok) throw new Error(table + ' ' + result.status);
    tsv = await result.text();
    if (!tsv.includes(columns.replaceAll(',', '\t')))
      throw new Error('Missing columns in ' + table);
    await writeFile(file, tsv);
  }
  if (!tsv.includes(columns.replaceAll(',', '\t')) || tsv.includes('QUERY_STATUS=OVERFLOW'))
    throw new Error('Incomplete table ' + key);
  return tsv
    .split(/\r?\n/)
    .filter((line) => /^\s*\d+\t/.test(line))
    .map((line) => line.split('\t').map((cell) => cell.trim()));
}

const spectrum = new Map(await rows('hd', 'III/135A/catalog', 'HD,SpT'));
if (spectrum.size !== 272150) throw new Error('Incomplete HD catalogue');
const extension = await rows('hdec', 'III/182/catalog', 'HD,Sp');
if (extension.length !== 88883) throw new Error('Incomplete HD Extension Charts');
for (const [hd, type] of extension)
  spectrum.set(hd, !spectrum.has(hd) || spectrum.get(hd) === type ? type : null);
const hip = new Set([...stars, ...chinese.additionalStars].map(([id]) => id));
const hipRows = await rows('hip', 'I/239/hip_main', 'HIP,HD,o_Hpmag,Hpmag');
if (hipRows.length !== 118218) throw new Error('Incomplete Hipparcos main catalogue');
const hipparcos = hipRows
  .filter(([id]) => hip.has(Number(id)))
  .map(([id, hd, count, mag]) => [
    Number(id),
    Number(hd) || null,
    hd ? spectrum.get(hd) || null : null,
    Number(count) || null,
    mag ? Number(mag) : null,
  ]);
if (hipparcos.length !== hip.size) throw new Error('Local HIP targets missing from main catalogue');

// The cutouts quantize x/y to 16 bits and VT to 0.01 mag. Test the neighbours
// of each cell and require a unique position + magnitude match in both directions.
function matchCutout(field, table) {
  const cells = new Map();
  const key = (x, y) => Math.floor(x * 65536) + ',' + Math.floor(y * 65536);
  for (const [region, seq, component, ra, dec, vt, positions] of table) {
    if (!ra || !dec || !vt) continue;
    const xy = projectStar(field, equatorial(Number(ra), Number(dec)));
    if (!xy) continue;
    const cell = key(xy.x, xy.y);
    if (!cells.has(cell)) cells.set(cell, []);
    cells.get(cell).push({
      ...xy,
      vt: Number(vt),
      row: [Number(region), Number(seq), Number(component), Number(positions) || null],
    });
  }
  const counts = new Map();
  const matches = decodeTycho(tychoCutouts.fields[field.id]).map((s) => {
    const candidates = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = key(s.x + dx / 65536, s.y + dy / 65536);
        for (const star of cells.get(cell) || []) {
          if (
            Math.hypot(s.x - star.x, s.y - star.y) * 65536 <= 1.42 &&
            Math.abs(star.vt - s.magnitude) <= 0.00501
          )
            candidates.push(star);
        }
      }
    }
    if (candidates.length !== 1) return null;
    const row = candidates[0].row;
    counts.set(row, (counts.get(row) || 0) + 1);
    return row;
  });
  return matches.map((row) => (counts.get(row) === 1 ? row : null));
}
const tycho = {};
for (const field of SURVEY_FIELDS) {
  const coord = field.ra.toFixed(6) + ' ' + (field.dec >= 0 ? '+' : '') + field.dec.toFixed(6);
  const table = await rows(field.id, 'I/259/tyc2', 'TYC1,TYC2,TYC3,RAmdeg,DEmdeg,VTmag,Num', {
    '-c': coord,
    '-c.rd': '4.8',
    VTmag: '<=11.52',
  });
  tycho[field.id] = matchCutout(field, table);
  if (tycho[field.id].some((row) => !row))
    throw new Error('Unidentified or ambiguous Tycho entry in ' + field.id);
  console.log(field.id, tycho[field.id].filter(Boolean).length, '/', tycho[field.id].length);
}
const gaia = {};
for (const target of chinese.otherStars) {
  const id = target.id.slice(5);
  const table = await rows('gaia-' + id, 'I/355/gaiadr3', 'Source,o_Gmag,Gmag', { Source: id });
  if (table.length !== 1 || table[0][0] !== id || Math.abs(Number(table[0][2]) - target.mag) > 1e-6)
    throw new Error('Gaia identity or G magnitude differs for ' + id);
  gaia[id] = Number(table[0][1]);
}
await writeFile(
  new URL('../src/stellar-observing-records.json', import.meta.url),
  JSON.stringify({ hipparcos, tycho, gaia }) + '\n'
);
console.log(
  hipparcos.length,
  'HIP targets;',
  hipparcos.filter(([, , sp]) => sp).length,
  'HD spectra;',
  Object.keys(gaia).length,
  'Gaia sources'
);
