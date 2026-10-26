"""Build offline labels and constellation geometry from a pinned d3-celestial revision.

Run with Python 3, curl and the project's Node dependencies. --source-dir may
contain the upstream files named in SOURCE_URLS for an offline rebuild.
"""
import argparse
import hashlib
import gzip
import json
import math
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
COMMIT = '7e720a3de062059d4c5400a379146a601d9010e0'
BASE = f'https://raw.githubusercontent.com/ofrohn/d3-celestial/{COMMIT}/'
FILES = ['starnames.json', 'constellations.json', 'constellations.lines.json', 'constellations.bounds.json']
CDS = 'https://cdsarc.cds.unistra.fr/ftp/VI/49/'
SOURCE_URLS = {name: BASE + ('data/' if name in FILES else '') + name for name in FILES + ['readme.md']}
SOURCE_URLS.update({'VI49.bound_20.dat.gz': CDS + 'bound_20.dat.gz', 'VI49.ReadMe': CDS + 'ReadMe', 'VI49.constell.txt': CDS + 'constell.txt'})
CDS_SHA256 = {
    'VI49.bound_20.dat.gz': '879cd6e7a1c908f1e19a5f5fe8cc75fb1d1077564e3890f9152a3680affe9aac',
    'VI49.ReadMe': 'af906e494b7390de1257a06934b69ce1a87e1c4a55776d2e8c16de8e3b468705',
    'VI49.constell.txt': '4d906000d1647aab4b65fc1319116f16a65f35ed6017d4101817c9806976486b',
}
# Ordinary character conversion only; no external dictionary/runtime dependency.
SIMPLIFY = str.maketrans(dict(zip('寶鷹壇獵馬鯨圓規鴿髮烏鴉鵝劍魚龍爐雙鶴時鐘長蠍獅貓顯鏡蒼蠅極戶飛鳳繪羅盤網儀遠鵑處',
                                  '宝鹰坛猎马鲸圆规鸽发乌鸦鹅剑鱼龙炉双鹤时钟长蝎狮猫显镜苍蝇极户飞凤绘罗盘网仪远鹃处')))
STAR_ALIASES = {91262: '织女星', 97649: '牛郎星', 102098: '天津四', 11767: '北极星', 32349: '天狼星'}
CONSTELLATION_ALIASES = {'Cha': '蝘蜓座', 'Vir': '室女座', 'Vol': '飞鱼座'}


def clean(text):
    return re.sub(r'\s+', ' ', str(text or '')).strip().strip("' ").translate(SIMPLIFY)


def point(value):
    ra, dec = value
    assert math.isfinite(ra) and math.isfinite(dec) and -90 <= dec <= 90
    return [round((ra + 180) % 360 - 180, 4), round(dec, 4)]


def vector(p):
    ra, dec = map(math.radians, p)
    return [math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)]


def separation(a, b):
    chord = math.sqrt(sum((x-y)**2 for x, y in zip(vector(a), vector(b))))
    return math.degrees(2 * math.asin(min(1, chord/2)))


def dense_boundaries(features, raw):
    """Keep CDS's precessed small-circle samples, using d3 only for edge topology.

    The current CDS download is globally sorted, rather than ordered by polygon.
    Astronomy Engine's B1875 conversion is used ONLY to identify and sort samples.
    Output coordinates are the published J2000 samples, not a new precession.
    """
    assert 'one degree intervals' in raw['VI49.constell.txt'].decode()
    text = gzip.decompress(raw['VI49.bound_20.dat.gz']).decode()
    rows = {}
    for line in text.splitlines():
        ra, dec = float(line[:11]), float(line[12:23])
        p = (round((ra + 180) % 360 - 180, 7), round(dec, 7))
        owner = line[24:28].strip()
        owner = 'SER' if owner.startswith('SER') else owner
        rows.setdefault(p, set()).add(owner)
    assert len(text.splitlines()) == 12948
    owners = {}
    for feature in features:
        for ring in feature['geometry']['coordinates']:
            path = [tuple(point(p)) for p in ring]
            assert path[0] == path[-1]
            for a, b in zip(path, path[1:]):
                if a != b:
                    owners.setdefault(tuple(sorted((a, b))), set()).add(feature['id'].upper())

    # Upstream d3 includes three obsolete polar intermediate vertices. CDS's
    # July 2024 Cepheus/Ursa Minor correction restores this B1875 +88° parallel.
    old_north = [(-20.739, 88.6639), (0.9483, 88.6092), (24.7077, 88.3564),
                 (57.6647, 88.0063), (135.8325, 87.5689)]
    for a, b in zip(old_north, old_north[1:]):
        assert owners.pop(tuple(sorted((a, b)))) == {'CEP', 'UMI'}
    owners[tuple(sorted((old_north[0], old_north[-1])))] = {'CEP', 'UMI'}

    points = list(rows)
    endpoints = sorted({p for edge in owners for p in edge})
    js = """const A=require('astronomy-engine');let s='';
process.stdin.on('data',x=>s+=x).on('end',()=>{
 console.log(JSON.stringify(JSON.parse(s).map(([r,d])=>{const c=A.Constellation(r/15,d);return[c.ra1875*15,c.dec1875]})))
});"""
    converted = json.loads(subprocess.check_output(['node', '-e', js], cwd=ROOT,
                                                  input=json.dumps(points + endpoints).encode()))
    p1875 = dict(zip(points, converted))
    e1875 = dict(zip(endpoints, converted[len(points):]))
    wrap = lambda a: (a+180) % 360-180
    result = []
    for (a, b), adjacent in sorted(owners.items()):
        ra, da = e1875[a]
        rb, db = e1875[b]
        horizontal = abs(da-db) < .01
        assert horizontal or abs(wrap(rb-ra)) < .1, f'Unexpected B1875 boundary: {a}, {b}'
        total = wrap(rb-ra) if horizontal else db-da
        candidates = []
        for p in points:
            if not adjacent.intersection(rows[p]):
                continue
            rp, dp = p1875[p]
            ratio = (wrap(rp-ra) if horizontal else dp-da)/total
            if not 0 < ratio < 1:
                continue
            cross = abs(dp-(da+(db-da)*ratio)) if horizontal else abs(wrap(rp-ra-wrap(rb-ra)*ratio))
            if cross > (.01 if horizontal else .1) or min(separation(a,p), separation(b,p)) < .0002:
                continue
            candidates.append((ratio, p))
        path = [a]
        for _, p in sorted(candidates):
            # Shared source vertices sometimes differ at the last decimal place.
            if separation(path[-1], p) > .00002:
                path.append(p)
        path.append(b)
        assert path[0] == a and path[-1] == b
        assert max(separation(x,y) for x,y in zip(path,path[1:])) <= 1.01, (a,b)
        result.append(path)
    return result


def generate(raw):
    for name, expected in CDS_SHA256.items():
        assert hashlib.sha256(raw[name]).hexdigest() == expected, f'CDS input changed: {name}'
    names, const_names, const_lines, const_bounds = [json.loads(raw[f]) for f in FILES]
    # Upstream readme explicitly says every GeoJSON asset is already J2000.
    assert 'All data converted to GeoJSON at J2000 epoch' in raw['readme.md'].decode()
    catalogue = json.loads((ROOT / 'assets/stars.json').read_text())
    by_position = {tuple(point(row[1:3])): row[0] for row in catalogue}
    outline_ids = set()
    constellations = {}
    for feature in const_names['features']:
        ident, p = feature['id'], feature['properties']
        ra, dec = point(feature['geometry']['coordinates'])
        if ident not in constellations:
            constellations[ident] = {'id': ident, 'zh': CONSTELLATION_ALIASES.get(ident, clean(p['zh'])),
                                    'en': clean(p['name']), 'ra': ra, 'dec': dec,
                                    'labelPositions': [], 'lines': []}
        constellations[ident]['labelPositions'].append([ra, dec])
    for feature in const_lines['features']:
        for line in feature['geometry']['coordinates']:
            path = [point(p) for p in line]
            constellations[feature['id']]['lines'].append(path)
            for p in path:
                assert tuple(p) in by_position, f'Constellation endpoint missing from star catalogue: {p}'
                outline_ids.add(by_position[tuple(p)])
    assert len(constellations) == 88

    stars = []
    for ident, ra, dec, mag, _ in catalogue:
        name = names.get(str(ident), {})
        zh = clean(name.get('zh', ''))
        if not re.search(r'[\u3400-\u9fff]', zh):
            zh = ''  # A few upstream zh fields contain mojibake such as "éé".
        en = clean(name.get('name', ''))
        proper = bool(zh or en)
        major = mag <= 3 or (ident in outline_ids and proper)
        if not proper and mag > 3 and ident not in outline_ids:
            continue
        designation = clean(' '.join([name.get('bayer') or name.get('desig', ''), name.get('c', '')]))
        designation = designation or f'HIP {ident}'
        zh = STAR_ALIASES.get(ident, zh) or designation
        en = en or designation
        stars.append({'id': ident, 'zh': zh, 'en': en, 'ra': ra, 'dec': dec, 'mag': mag,
                      'major': major, 'hasProperName': proper, 'nameType': 'proper' if proper else 'designation'})

    boundaries = dense_boundaries(const_bounds['features'], raw)
    source = {'project': 'd3-celestial', 'commit': COMMIT, 'frame': 'J2000 equatorial', 'units': 'degrees',
              'license': 'd3-celestial: BSD-3-Clause; assets/D3-CELESTIAL-LICENSE.txt. CDS VI/49: attributed scientific boundary data, Davenhall & Leggett (1989).',
              'urls': SOURCE_URLS,
              'sha256': {f: hashlib.sha256(data).hexdigest() for f, data in raw.items()},
              'frameEvidence': BASE + 'readme.md',
              'catalogue': 'assets/stars.json; XHIP / d3-celestial Hipparcos identifiers',
              'boundarySource': 'Davenhall & Leggett (1989), VizieR VI/49 bound_20.dat; J2000 one-degree samples including 2024-07-23 CEP/UMI correction',
              'boundaryFrameEvidence': CDS + 'constell.txt',
              'boundaryOrdering': 'Astronomy Engine 2.1.19 B1875 conversion is used only to classify/sort published J2000 samples; renderer uses CDS coordinates',
              'processing': 'HIP join; simplified Chinese and common-name aliases; <=3 mag or named outline stars marked major; duplicate boundary edges removed; Serpens components retained; 3 obsolete d3 polar vertices replaced by CDS corrected parallel'}
    return {'source': source, 'stars': stars, 'constellations': list(constellations.values()),
            'boundaries': boundaries}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path)
    args = parser.parse_args()
    raw = {}
    for name, url in SOURCE_URLS.items():
        if args.source_dir:
            raw[name] = (args.source_dir / name).read_bytes()
        else:
            raw[name] = subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '2', url])
    chart = generate(raw)
    target = ROOT / 'assets/star-chart.json'
    target.write_text(json.dumps(chart, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({'stars': len(chart['stars']), 'major': sum(s['major'] for s in chart['stars']),
                      'properNames': sum(s['hasProperName'] for s in chart['stars']),
                      'constellations': len(chart['constellations']), 'boundaryEdges': len(chart['boundaries']),
                      'bytes': target.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    main()
