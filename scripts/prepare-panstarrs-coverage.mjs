// Run explicitly to refresh the small, offline-readable footprint of PS1 DR1.
// Only the survey's region metadata is converted. No image tiles are downloaded.
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source =
  'https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/PanSTARRS/Moc.fits';
const response = await fetch(source);
if (!response.ok) throw new Error(`Could not read the MOC: HTTP ${response.status}`);
const fits = Buffer.from(await response.arrayBuffer());
function header(offset) {
  const cards = {};
  for (let i = offset; i + 80 <= fits.length; i += 80) {
    const card = fits.toString('ascii', i, i + 80);
    const key = card.slice(0, 8).trim();
    if (key === 'END') return { cards, next: Math.ceil((i + 80) / 2880) * 2880 };
    if (card[8] === '=')
      cards[key] = card.slice(10).split('/')[0].trim().replaceAll("'", '').trim();
  }
  throw new Error('Incomplete FITS header');
}
const { cards, next } = header(header(0).next);
if (
  cards.XTENSION !== 'BINTABLE' ||
  cards.ORDERING !== 'NUNIQ' ||
  cards.COORDSYS !== 'C' ||
  cards.TFORM1 !== '1J' ||
  cards.NAXIS1 !== '4'
)
  throw new Error('Unsupported celestial MOC format');
const order = Number(cards.MOCORDER);
const spans = [];
for (let row = 0; row < Number(cards.NAXIS2); row++) {
  const uniq = fits.readUInt32BE(next + row * 4);
  const cellOrder = Math.floor(Math.log2(uniq / 4) / 2);
  const pixel = uniq - 4 * 4 ** cellOrder;
  const scale = 4 ** (order - cellOrder);
  spans.push([pixel * scale, (pixel + 1) * scale]);
}
spans.sort((a, b) => a[0] - b[0]);
const ranges = [];
for (const [start, end] of spans) {
  const previous = ranges.at(-1);
  if (previous && start <= previous[1]) previous[1] = Math.max(end, previous[1]);
  else ranges.push([start, end]);
}
const packed = [];
function put(value) {
  while (value >= 128) {
    packed.push((value % 128) + 128);
    value = Math.floor(value / 128);
  }
  packed.push(value);
}
let previousEnd = 0;
for (const [start, end] of ranges) {
  put(start - previousEnd);
  put(end - start);
  previousEnd = end;
}
const result = {
  source,
  sourceSha256: createHash('sha256').update(fits).digest('hex'),
  license: 'ODbL-1.0',
  order,
  intervals: ranges.length,
  data: Buffer.from(packed).toString('base64'),
};
await writeFile(
  new URL('../assets/sky-detail/panstarrs-moc.json', import.meta.url),
  JSON.stringify(result, null, 2) + '\n'
);
