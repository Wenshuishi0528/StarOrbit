import { readFileSync } from 'node:fs';

// Keep the historical product's original metadata and state precision. The
// editable viewer's orbit.json can be newer than the archived source HTML.
export function archivedReference() {
  const source = readFileSync(
    new URL('../assets/official-orbit-source.html', import.meta.url),
    'utf8'
  );
  const lines = source
    .replace(/<[^>]*>/g, '\n')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&#160;', ' ')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const start = lines.findIndex((s) => s.startsWith('CCSDS_OEM_VERS ='));
  const states = lines.findIndex((line, i) => i > start && /^\d{4}-\d\d-\d\dT/.test(line));
  if (start < 0 || states < 0) throw new Error('Archived BACC OEM header or states missing');
  let end = states + 1;
  while (end < lines.length && /^\d{4}-\d\d-\d\dT/.test(lines[end])) end++;
  const metadata = lines.slice(start, states).join('\n');
  if (!/CREATION_DATE\s*=\s*2026-10-19T00:24:27/.test(metadata) || end - states !== 2521)
    throw new Error('Archived BACC example differs from the documented seven-day product');
  return lines.slice(start, end).join('\n') + '\n';
}
