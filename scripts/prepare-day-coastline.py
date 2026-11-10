"""Preserve Natural Earth 1:10m reference shorelines for the 500m display grid.

Optional data tooling: requests and pyshp. The 1:10m name is a map scale, not
10-metre imagery. Original public-domain archive hashes are pinned below.
"""
from pathlib import Path
from io import BytesIO
import argparse, gzip, hashlib, json, zipfile
import requests
import shapefile
SOURCES = {
    'land': 'e547d749445eaa0964aba76738090ec88f5e63c4585122170f98c67a7ea922dc',
    'lakes': '0803a06f9c3cb4671d89b68c48b142aad9366ba40f665245e12a913fbc61722a',
}
def prepare(out):
    meta = {'sourceScale': '1:10 million cartographic coastline; not 10-metre imagery',
            'license': 'Natural Earth public domain'}
    for kind, expected in SOURCES.items():
        stem = 'ne_10m_'+kind
        url = 'https://naturalearth.s3.amazonaws.com/10m_physical/'+stem+'.zip'
        response = requests.get(url, timeout=90); response.raise_for_status()
        actual = hashlib.sha256(response.content).hexdigest()
        if actual != expected:
            raise ValueError(kind+': source archive changed; inspect before updating pinned data')
        with zipfile.ZipFile(BytesIO(response.content)) as archive:
            reader = shapefile.Reader(**{ext: BytesIO(archive.read(stem+'.'+ext))
                                         for ext in ['shp', 'shx', 'dbf']})
            features = []
            for shape in reader.iterShapes():
                geometry = shape.__geo_interface__
                for coordinates in ([geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates']):
                    features.append({'type': 'Polygon', 'coordinates': coordinates})
        prefix = '' if kind == 'land' else 'water'
        meta[prefix+'Source' if prefix else 'source'] = url
        meta[prefix+'SourceSHA256' if prefix else 'sourceSHA256'] = actual
        meta['features' if kind == 'land' else 'waterFeatures'] = features
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(gzip.compress(json.dumps(meta, separators=(',', ':')).encode(), mtime=0))
    print(out, out.stat().st_size)
if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[1]/'assets/earth/day-2026-q2-500m/coastline.geojson.gz')
    prepare(p.parse_args().out)
