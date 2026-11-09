"""Reproducible Earth observation atlas: NASA GIBS, NOAA ETOPO and USGS MRDS.

Original responses stay in output/; shipped raster derivatives use AVIF. No
synthetic fill, temporal interpolation or inferred mineral reserves are used.
Run from the repository root with requests, numpy and Pillow (AVIF support).
"""
import concurrent.futures
import gzip
import hashlib
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image
import requests

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'output/earth-observation-source'
OUT = ROOT / 'assets/earth/observation'
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'
MRDS = 'https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services/Mineral_Resources_Data_System_MRDS_Compact_Version/FeatureServer/0'
DATE = '2026-10-24'


def fetch(name, url, params=None):
    path = CACHE / name
    if not path.exists():
        r = requests.get(url, params=params, timeout=(15, 150))
        r.raise_for_status()
        temp = path.with_suffix(path.suffix + '.part')
        temp.write_bytes(r.content)
        temp.replace(path)
        (CACHE / (name + '.url')).write_text(r.url)
    return path


def digest(path):
    data = path.read_bytes()
    return dict(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())


def rasters():
    products = [
        ('reflectance', '可见光组合 · 1–4–3', 'MODIS_Terra_L3_SurfaceReflectance_Bands143_8Day',
         'RGB = MODIS 1 / 4 / 3', '红、绿、蓝可见光波段组合，展示陆地表面颜色。'),
        ('nearIR', '近红外组合 · 1–2–1', 'MODIS_Terra_L3_SurfaceReflectance_Bands121_8Day',
         'RGB = MODIS 1 / 2 / 1', '近红外分配到绿色通道，植被通常呈绿色，水体较暗。'),
        ('shortIR', '短波红外组合 · 7–2–1', 'MODIS_Terra_L3_SurfaceReflectance_Bands721_8Day',
         'RGB = MODIS 7 / 2 / 1', '短波红外、近红外与红光组合，突出植被、水体、积雪和地表差异。'),
        ('temperatureDay', '地表温度 · 白昼', 'MODIS_Terra_L3_Land_Surface_Temp_8Day_Day',
         'MOD11A2 · 8-day daytime land surface temperature', '由热红外观测反演的晴空地表温度，表示地表而非空气温度。'),
        ('temperatureNight', '地表温度 · 夜间', 'MODIS_Terra_L3_Land_Surface_Temp_8Day_Night',
         'MOD11A2 · 8-day nighttime land surface temperature', '由热红外观测反演的晴空夜间地表温度，可与白昼对照。'),
    ]
    def one(row):
        key, label, product, bands, description = row
        path = fetch(key + '.png', WMS, dict(SERVICE='WMS', VERSION='1.1.1', REQUEST='GetMap',
            LAYERS=product, STYLES='', SRS='EPSG:4326', BBOX='-180,-90,180,90',
            WIDTH=4096, HEIGHT=2048, FORMAT='image/png', TRANSPARENT='TRUE', TIME=DATE))
        img = Image.open(path).convert('RGBA')
        assert img.size == (4096, 2048)
        alpha = np.asarray(img)[..., 3]
        weights = np.cos(np.deg2rad(90 - (np.arange(img.height) + .5) * 180 / img.height))[:, None]
        coverage = float(((alpha > 0) * weights).sum() / (weights.sum() * img.width))
        assert coverage > .05, (key, 'empty or error response', coverage)
        output = OUT / (key + '.avif')
        img.save(output, quality=92, speed=6, subsampling='4:4:4')
        # Alpha is the science footprint, not a cosmetic mask.
        decoded = np.asarray(Image.open(output).convert('RGBA'))[..., 3]
        assert np.array_equal(alpha == 0, decoded == 0), 'AVIF changed no-data coverage'
        return key, dict(file=str(output.relative_to(ROOT)), label=label, product=product,
            description=description, bands=bands, periodStart=DATE, periodEnd='2026-10-31',
            period='8-day composite', width=img.width, height=img.height,
            displayPixelDegrees=360 / img.width, sourcePixelMeters=1000 if key.startswith('temperature') else 250 if key == 'nearIR' else 500,
            alphaAreaFraction=coverage, noData='transparent' if key.startswith('temperature') else 'Source black includes water and missing observations; alpha alone is not a validity mask.', credit='NASA EOSDIS GIBS · Terra / MODIS',
            sourceUrl=(CACHE / (path.name + '.url')).read_text(), sourceSHA256=digest(path)['sha256'],
            **digest(output))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        return dict(pool.map(one, products))


def elevation():
    # Preserve bathymetry from the original ETOPO-derived grid, before the shared
    # visual Earth flattened connected ocean cells to sea level.
    raw = ROOT / 'output/earth-elevation-source/base-raw-i16.bin.gz'
    heights = np.frombuffer(gzip.decompress(raw.read_bytes()), dtype='<i2').reshape(1024, 2048)
    stops = [-11000, -6000, -3000, -1000, -1, 0, 200, 1000, 2000, 4000, 6000, 9000]
    colors = ['#071b40', '#124478', '#217dae', '#62adca', '#b4dbe1', '#427c54', '#7da36b', '#c4bf84', '#c59a67', '#976e61', '#d5c5bf', '#ffffff']
    rgb = np.array([[int(c[i:i+2], 16) for i in [1, 3, 5]] for c in colors])
    pixels = np.stack([np.interp(heights, stops, rgb[:, i]) for i in range(3)], axis=-1).astype('uint8')
    path = OUT / 'elevation.avif'
    Image.fromarray(pixels).save(path, quality=95, speed=6, subsampling='4:4:4')
    height_file = OUT / 'etopo-height.i16.gz'
    height_file.write_bytes(raw.read_bytes())
    return dict(file=str(path.relative_to(ROOT)), label='地形与海底高程',
        description='陆地高程与海底深度，共用 ETOPO 2022 来源；相对 EGM2008 大地水准面，单位米。',
        width=2048, height=1024, credit='NOAA NCEI · ETOPO 2022',
        sourceUrl='https://doi.org/10.25921/fd45-gt74', displayPixelDegrees=360/2048,
        legend=[dict(meters=h, color=c) for h, c in zip(stops, colors)],
        heightFile=str(height_file.relative_to(ROOT)), heightSHA256=digest(height_file)['sha256'],
        **digest(path))


def minerals():
    meta = json.loads(fetch('mrds-layer.json', MRDS, {'f': 'json'}).read_text())
    count = json.loads(fetch('mrds-count.json', MRDS + '/query',
        {'f': 'json', 'where': '1=1', 'returnCountOnly': 'true'}).read_text())['count']
    def page(offset):
        p = fetch(f'mrds-{offset:06}.json', MRDS + '/query', dict(f='json', where='1=1',
            outFields='OBJECTID,DEP_ID,SITE_NAME,DEV_STAT,CODE_LIST,Grade', outSR=4326,
            orderByFields='OBJECTID ASC', resultOffset=offset, resultRecordCount=2000))
        data = json.loads(p.read_text())
        assert 'error' not in data, data.get('error')
        rows = data['features']
        assert len(rows) == min(2000, count - offset), (offset, len(rows))
        return rows
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        pages = list(pool.map(page, range(0, count, 2000)))
    rows, ids, excluded = [], set(), 0
    codes = {}
    for page in pages:
        for feature in page:
            a, g = feature['attributes'], feature.get('geometry')
            assert a['OBJECTID'] not in ids
            ids.add(a['OBJECTID'])
            if not g or not (-180 <= g['x'] <= 180 and -90 <= g['y'] <= 90):
                excluded += 1
                continue
            commodities = (a.get('CODE_LIST') or '').split()
            for c in set(commodities):
                codes[c] = codes.get(c, 0) + 1
            rows.append([a['DEP_ID'], a['SITE_NAME'] or a['DEP_ID'], round(g['x'], 5), round(g['y'], 5),
                         ' '.join(commodities), a.get('DEV_STAT') or '', a.get('Grade') or ''])
    assert len(ids) == count
    packed = gzip.compress(json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    path = OUT / 'minerals.json.gz'
    path.write_bytes(packed)
    return dict(file=str(path.relative_to(ROOT)), count=len(rows), sourceCount=count,
        excludedInvalidCoordinates=excluded, fields=['id', 'name', 'longitude', 'latitude', 'commodities', 'historicalStatus', 'grade'],
        commodities=dict(sorted(codes.items())), sourceUrl=MRDS,
        sourceItem='https://www.arcgis.com/home/item.html?id=579544a8423e40bbba6c1229082554d1',
        snapshotDate='2026-11-09', systematicUpdatesThrough=2011,
        credit='Map services and data are available from the U.S. Geological Survey Mineral Resources Data System (MRDS), provided by the U.S. Geological Survey via https://doi.org/10.3133/ds20.',
        license='Public domain', **digest(path))


if __name__ == '__main__':
    layers = rasters()
    colormap_url = 'https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Land_Surface_Temp.xml'
    root = ET.parse(fetch('temperature-colormap.xml', colormap_url))
    entries = [e.attrib for e in root.findall('.//ColorMapEntry') if 'value' in e.attrib]
    legend = []
    for k in [200, 220, 240, 260, 273.15, 280, 300, 320, 340, 350]:
        for e in entries:
            lo, hi = map(float, e['value'].strip('[]()').split(','))
            if lo <= k < hi:
                legend.append(dict(celsius=round(k - 273.15, 2), color='#'+''.join(f'{int(v):02x}' for v in e['rgb'].split(','))))
                break
    if legend[-1]['celsius'] != 76.85:
        legend.append(dict(celsius=76.85, color='#ff0100'))
    for key in ['temperatureDay', 'temperatureNight']:
        layers[key]['legend'] = legend
        layers[key]['legendSource'] = colormap_url
    layers['earthElevation'] = elevation()
    mineral = minerals()
    names = json.loads(fetch('commodity-names.json', MRDS.rsplit('/', 1)[0] + '/10/query',
        dict(f='json', where='1=1', outFields='Commodity_code,Commodity_name',
        returnGeometry='false', returnDistinctValues='true', orderByFields='Commodity_code', resultRecordCount=2000)).read_text())
    assert not names.get('exceededTransferLimit') and 'error' not in names
    mineral['commodityNames'] = {x['attributes']['Commodity_code']: x['attributes']['Commodity_name'] for x in names['features']}
    manifest = dict(version=1, longitudeRange=[-180, 180], latitudeRange=[90, -90],
        crs='EPSG:4326', layers=layers, minerals=mineral)
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(layers=list(layers), minerals=mineral['count'], mineralBytes=mineral['bytes'])))
