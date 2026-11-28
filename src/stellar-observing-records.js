import records from './stellar-observing-records.json' with { type: 'json' };

const hipById = new Map(records.hipparcos.map((row) => [row[0], row]));
const hdEntries = new Map();
for (const [hip, hd] of records.hipparcos) {
  if (!hd) continue;
  const entries = hdEntries.get(hd);
  if (entries) entries.push(hip);
  else hdEntries.set(hd, [hip]);
}

export function hipEntriesForHD(hd) {
  return hdEntries.get(hd) || [];
}

export function hipObservations(id) {
  return hipById.get(Number(id));
}

export function tychoObservations(id) {
  const parts = /^(?:tycho:)?([a-z]+):(\d+)$/.exec(id);
  return parts && records.tycho[parts[1]]?.[parts[2]];
}

export function gaiaObservationCount(id) {
  return records.gaia[id];
}

// A split HD identification can lead to more than one HIP entry.
export function matchObservingDesignation(query) {
  const hd = /^HD\s*(\d+)$/i.exec(query);
  if (hd) return hipEntriesForHD(Number(hd[1])).map((hip) => 'hip:' + hip);
  const tyc = /^TYC\s*(\d{1,4})\s*[-–]\s*(\d{1,5})\s*[-–]\s*([1-3])$/i.exec(query);
  if (!tyc) return [];
  const matches = [];
  for (const [field, rows] of Object.entries(records.tycho))
    rows.forEach((row, i) => {
      if (
        row &&
        row[0] === Number(tyc[1]) &&
        row[1] === Number(tyc[2]) &&
        row[2] === Number(tyc[3])
      )
        matches.push('tycho:' + field + ':' + i);
    });
  return matches;
}
