import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, extname, resolve } from 'node:path';
import { defaultMission, observationMission, runMission } from '../src/pro/mission.js';
import { parseOem, writeOem } from '../src/pro/oem.js';
import { writeEngineeringCsv, writeObservationCsv } from '../src/pro/products.js';
import { archivedReference } from './pro-reference.mjs';

const usage =
  'node scripts/pro-mission.mjs <mission.json | --example | --example-css | --example-lake> <output.json | output.oem | output.csv> [--oem reference.oem] [--mode elements|oemInitial|oemReplay] [--epoch-from-oem] [--images]';
const pathKey = (file) =>
  process.platform === 'win32' ? resolve(file).toLowerCase() : resolve(file);
function setReferenceEpoch(mission) {
  const reference = parseOem(mission.trajectory.oemText);
  mission.epochUtc = new Date(Math.ceil(reference.startMs)).toISOString().replace('.000Z', 'Z');
}
async function product(source, target, args) {
  if (!source || !target || pathKey(source) === pathKey(target)) throw new Error(usage);
  if (['--example', '--example-css', '--example-lake'].includes(source)) {
    if (args.length || ['.oem', '.csv'].includes(extname(target).toLowerCase()))
      throw new Error(usage);
    const m = source === '--example-lake' ? observationMission() : defaultMission();
    if (source === '--example-css') {
      m.trajectory = {
        mode: 'oemInitial',
        name: 'CSS-BACC-20261019.oem',
        oemText: archivedReference(),
      };
      setReferenceEpoch(m);
    }
    return JSON.stringify(m, null, 2) + '\n';
  }
  if (source.startsWith('--')) throw new Error(usage);
  const m = JSON.parse(await readFile(source, 'utf8'));
  let file,
    mode,
    adopt = false,
    images = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--images' && !images && extname(target).toLowerCase() === '.csv') {
      images = true;
      continue;
    }
    if (args[i] === '--epoch-from-oem' && !adopt) {
      adopt = true;
      continue;
    }
    if (args[i] === '--oem' && !file && args[i + 1] && !args[i + 1].startsWith('--')) {
      file = args[++i];
      continue;
    }
    if (
      args[i] === '--mode' &&
      !mode &&
      ['elements', 'oemInitial', 'oemReplay'].includes(args[i + 1])
    ) {
      mode = args[++i];
      continue;
    }
    throw new Error(usage);
  }
  if (file) {
    if (pathKey(file) === pathKey(target))
      throw new Error('Output must differ from reference ephemeris');
    m.trajectory = {
      mode: mode ?? 'oemInitial',
      name: basename(file),
      oemText: await readFile(file, 'utf8'),
    };
  } else if (mode) m.trajectory = { ...m.trajectory, mode };
  if (adopt) {
    if (!m.trajectory?.oemText)
      throw new Error('A reference ephemeris is required for --epoch-from-oem');
    setReferenceEpoch(m);
  }
  const result = runMission(m);
  switch (extname(target).toLowerCase()) {
    case '.oem':
      return writeOem(result);
    case '.csv':
      return images ? writeObservationCsv(result) : writeEngineeringCsv(result);
    default:
      return JSON.stringify(result) + '\n';
  }
}
const [source, target, ...args] = process.argv.slice(2);
let temp;
try {
  const bytes = await product(source, target, args);
  temp = resolve(target) + '.' + randomUUID() + '.tmp';
  await writeFile(temp, bytes, { flag: 'wx' });
  await rename(temp, target);
} catch (error) {
  if (temp) await rm(temp, { force: true });
  console.error([error.message, error.detail].filter(Boolean).join(' · '));
  process.exitCode = error.message === usage ? 2 : 1;
}
