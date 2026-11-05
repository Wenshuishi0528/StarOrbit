"""Prepare a bounded-memory 1 km display atlas from 2024 Black Marble radiance.

Dependencies: rasterio, numpy, Pillow. Input: viirs_2024_raw.tif from the public
download linked at https://www.lightpollutionmap.info/help.html (FAQ 29).
The source is NASA VJ146A4.002 AllAngle_Composite_Snow_Free, not sky brightness.
No 500 m display tiles are generated. Source rasters are excluded from builds.
"""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
import rasterio
from rasterio.windows import Window
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://www2.lightpollutionmap.info/data/v2/viirs_2024_raw.zip'


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def display_radiance(radiance):
    # One fixed global curve, no per-tile contrast changes or artificial sharpening.
    # Values below 0.5 nW/cm²/sr are background. The result is a display texture,
    # not a radiometrically calibrated or true-colour photograph.
    light = np.maximum(np.nan_to_num(radiance, nan=0, posinf=0, neginf=0) - .5, 0)
    return np.rint(np.clip(np.log1p(light * 2) / np.log1p(200), 0, 1) * 255).astype('uint8')


def prepare(source, output):
    output.mkdir(parents=True, exist_ok=True)
    temp = source.parent / 'night-2024-1km.dat'
    mosaic = np.memmap(temp, dtype='uint8', mode='w+', shape=(21600, 43200))
    try:
        # Retain actual 2016 lights outside the newer raster's 75N..65S coverage.
        for y in [0, 10, 11]:
            for x in range(24):
                with Image.open(ROOT / f'assets/earth/night-detail/{x}-{y}.jpg') as image:
                    mosaic[y*1800:(y+1)*1800, x*1800:(x+1)*1800] = np.asarray(image)[8:1808, 8:1808]
        with rasterio.open(source) as data:
            assert (data.width, data.height, data.count) == (86400, 33600, 1)
            assert data.crs.to_epsg() == 4326
            assert np.allclose(tuple(data.bounds), (-180, -65, 180, 75))
            assert np.allclose((data.transform.a, data.transform.e), (1/240, -1/240))
            for row in range(0, data.height, 256):
                count = min(256, data.height-row)
                values = data.read(1, window=Window(0, row, data.width, count))
                # Average valid radiance samples before the display stretch.
                valid = np.isfinite(values) & (values >= 0)
                values[~valid] = 0
                total = values.reshape(count//2, 2, 43200, 2).sum(axis=(1, 3))
                samples = valid.reshape(count//2, 2, 43200, 2).sum(axis=(1, 3))
                reduced = np.divide(total, samples, out=np.zeros_like(total), where=samples>0)
                mosaic[1800+row//2:1800+(row+count)//2] = display_radiance(reduced)
                if row % 4096 == 0:
                    print(f'Radiance {row}/{data.height}', flush=True)
        mosaic.flush()
        size, gutter = 1800, 8
        base = Image.new('L', (24*342, 12*342))
        for y in range(12):
            for x in range(24):
                xs = np.arange(x*size-gutter, (x+1)*size+gutter) % 43200
                ys = np.clip(np.arange(y*size-gutter, (y+1)*size+gutter), 0, 21599)
                with Image.fromarray(mosaic[np.ix_(ys, xs)]) as tile:
                    tile.save(output/f'{x}-{y}.jpg', quality=94, optimize=True)
                    base.paste(tile.crop((8,8,1808,1808)).resize((342,342), Image.Resampling.LANCZOS), (x*342,y*342))
            print(f'Tiles {y+1}/12', flush=True)
        for tier, width in [('simple',1024),('medium',2048),('standard',4096),('high',8192)]:
            base.resize((width,width//2), Image.Resampling.LANCZOS).save(output/f'{tier}.jpg',quality=94,optimize=True)
        files = {p.name:sha256(p) for p in sorted(output.glob('*.jpg'))}
        meta = dict(year=2024, product='VJ146A4.002', band='AllAngle_Composite_Snow_Free',
                    source=SOURCE_URL, sourceDocumentation='https://www.lightpollutionmap.info/help.html',
                    credit="NASA's Black Marble nighttime lights product; Jurij Stare, www.lightpollutionmap.info",
                    sourceSHA256=sha256(source), sourceSize=[86400,33600], sourceBounds=[-180,-65,180,75],
                    polarFallback='NASA Black Marble 2016, 1 km', width=43200, height=21600,
                    columns=24, rows=12, tileSize=1800, gutter=8,
                    resampling='2x2 valid radiance average; missing observations display black',
                    displayCurve='round(255 * clamp(log1p(max(radiance-0.5,0)*2)/log1p(200),0,1))',
                    files=files, totalBytes=sum((output/f).stat().st_size for f in files))
        (output/'manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
        print('Display assets MB:',meta['totalBytes']/1e6,flush=True)
    finally:
        del mosaic
        temp.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('--output',type=Path,default=ROOT/'assets/earth/night-2024-1km')
    args = parser.parse_args()
    prepare(args.source,args.output)
