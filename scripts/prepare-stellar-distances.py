#!/usr/bin/env python3
"""Build the small, offline high-S/N HIP parallax lookup (no network required)."""
from pathlib import Path
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/stellar-distances/source/I-311-hip2.tsv'
hips = {r[0] for r in json.loads((ROOT / 'assets/stars.json').read_text())}
hips.update(r[0] for r in json.loads((ROOT / 'assets/chinese-sky/catalog.json').read_text())['additionalStars'])
rows = []
source_rows = 0
for line in SOURCE.read_text().splitlines():
    cells = line.split('\t')
    if len(cells) != 3 or not cells[0].strip().isdigit():
        continue
    source_rows += 1
    hip = int(cells[0])
    try:
        p, e = float(cells[1]), float(cells[2])
    except ValueError:
        continue
    if hip in hips and all(math.isfinite(x) for x in (p, e)) and p > 0 and e > 0 and e / p <= .1:
        rows.append([hip, p, e])
assert source_rows == 117955, f'Unexpected/truncated input: {source_rows}'
rows.sort()
result = {
    'schema': 1,
    'source': 'Hipparcos new reduction (van Leeuwen 2007), VizieR I/311/hip2',
    'sourceUrl': 'https://cdsarc.cds.unistra.fr/viz-bin/cat/I/311',
    'queryUrl': 'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?-source=I/311/hip2&-out=HIP,Plx,e_Plx&-out.max=unlimited',
    'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'fields': ['HIP', 'parallaxMas', 'parallaxErrorMas'],
    'selection': 'Current physical HIP catalogue; positive parallax and formal error; error/parallax <= 0.1',
    'rows': rows,
}
(ROOT / 'assets/stellar-distances/catalog.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'{len(rows)} / {len(hips)} physical HIP entries; {source_rows} source rows')
