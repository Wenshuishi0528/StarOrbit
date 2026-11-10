"""Render native MODIS 500m QA composites into bounded AVIF display tiles.

Temporary global byte arrays are disk-backed, never GPU textures. Reflectance
is interpolated before display encoding. Deep water and unavailable pixels use
the documented stable NASA atlas; valid near-shore observations are retained.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse
import gzip
import hashlib
import importlib.util
import json
import time
import numpy as np
from PIL import Image
from rasterio.transform import Affine, from_origin
from rasterio.features import rasterize

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('day_atlas_math', ROOT/'scripts/assemble-day-modis-2026.py')
math = importlib.util.module_from_spec(spec)
spec.loader.exec_module(math)
WIDTH, HEIGHT, SIZE, GUTTER, COLS, ROWS = 86400, 43200, 1800, 8, 48, 24
PPD = WIDTH / 360


class Coastline:
    """Fractional land coverage; the NBAR land model is not an ocean-colour map."""
    def __init__(self, path):
        self.path = path
        meta = json.loads(gzip.decompress(path.read_bytes()))
        self.source = {k: v for k, v in meta.items() if k not in ['features', 'waterFeatures']}
        self.shapes, bounds = [], []
        for key, value in [('features', 1), ('waterFeatures', 0)]:
            for shape in meta[key]:
                points = np.asarray(shape['coordinates'][0])
                west, south = points.min(axis=0); east, north = points.max(axis=0)
                for shift in [0] + ([360] if west < -179 else []) + ([-360] if east > 179 else []):
                    geometry = shape if not shift else {'type': 'Polygon', 'coordinates': [
                        [[p[0]+shift, p[1]] for p in ring] for ring in shape['coordinates']]}
                    self.shapes.append((geometry, value))
                    bounds.append([west+shift, south, east+shift, north])
        self.bounds = np.asarray(bounds)

    def fraction(self, x, y):
        size = SIZE + 2*GUTTER
        west = -180+(x*SIZE-GUTTER)/PPD; north = 90-(y*SIZE-GUTTER)/PPD
        east, south = west+size/PPD, north-size/PPD
        b = self.bounds
        selected = np.flatnonzero((b[:, 0] < east) & (b[:, 2] > west) &
                                 (b[:, 1] < north) & (b[:, 3] > south))
        if not len(selected): return np.zeros((size, size), dtype='float32')
        pixels = rasterize([self.shapes[i] for i in selected], out_shape=(size*2, size*2),
                           transform=from_origin(west, north, 1/(PPD*2), 1/(PPD*2)),
                           fill=0, dtype='uint8')
        fraction = pixels.reshape(size, 2, size, 2).mean(axis=(1, 3), dtype='float32')
        if y == 0: fraction[:GUTTER] = fraction[GUTTER]
        if y == ROWS-1: fraction[-GUTTER:] = fraction[-GUTTER-1]
        return fraction


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(4*1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()


def fallback_tile(x, y):
    """Sample the existing 1km complete atlas with matching global gutters.

    It supplies stable ocean colour and fallback only; valid native MODIS pixels
    replace it. It is never described as new 500m satellite observations.
    """
    path = ROOT/f'assets/earth/day-2026-q2-1km/{x//2}-{y//2}.jpg'
    with Image.open(path) as image:
        return math.sample_legacy_tile(image, x, y)


def project(cache, work, inventory, wait=False):
    work.mkdir(parents=True, exist_ok=True)
    rgb_path, qa_path = work/'atlas-rgb.dat', work/'atlas-quality.dat'
    signature = sha(inventory)
    marker = work/'projected.json'
    if marker.exists() and rgb_path.exists() and qa_path.exists():
        if json.loads(marker.read_text())['inventorySHA256'] != signature:
            raise ValueError('Projection inventory changed; use a separate work directory')
        return
    meta = json.loads(inventory.read_text())
    if meta.get('nativeResolutionMeters') != 500:
        raise ValueError('Require native 500m composites, not enlarged 1km data')
    progress_path = work/'projection-progress.json'
    progress = json.loads(progress_path.read_text()) if progress_path.exists() else {'inventorySHA256': signature, 'tiles': {}}
    if progress['inventorySHA256'] != signature: raise ValueError('Projection checkpoint inventory mismatch')
    resume = progress_path.exists() and rgb_path.exists() and qa_path.exists()
    mosaic = np.memmap(rgb_path, mode='r+' if resume else 'w+', dtype='uint8', shape=(HEIGHT, WIDTH, 3))
    quality = np.memmap(qa_path, mode='r+' if resume else 'w+', dtype='uint8', shape=(HEIGHT, WIDTH))
    if not resume: quality[:] = 0
    for i, tile in enumerate(meta['tiles']):
        path = cache/(tile+'.npz')
        report_path = cache/(tile+'.json')
        while not path.exists() or not report_path.exists():
            if not wait: raise RuntimeError(tile+': native composite not ready')
            time.sleep(1)
        report = json.loads(report_path.read_text())
        if progress['tiles'].get(tile) == report['sha256']: continue
        if report.get('nativeResolutionMeters') != 500 or sha(path) != report['sha256']:
            raise ValueError(tile+': invalid native composite or checksum')
        with np.load(path) as z:
            src, q = z['rgb'], z['quality']
            transform, crs = Affine(*z['transform'][:6]), str(z['crs'])
            if q.shape != (2400, 2400) or not np.isclose(transform.a, 463.3127165279):
                raise ValueError(tile+': source has been spatially reduced')
            west, south, east, north = math.geographic_bounds(tile, q.shape, transform, crs)
            spans = [(west, 180), (-180, east)] if east < west else [(west, east)]
            for left, right in spans:
                x0, x1 = max(0, int(np.floor((left+180)*PPD))), min(WIDTH, int(np.ceil((right+180)*PPD)))
                y0, y1 = max(0, int(np.floor((90-north)*PPD))), min(HEIGHT, int(np.ceil((90-south)*PPD)))
                if x1 <= x0 or y1 <= y0:
                    continue
                for row in range(y0, y1, 128):
                    end = min(row+128, y1)
                    dt = from_origin(-180+x0/PPD, 90-row/PPD, 1/PPD, 1/PPD)
                    dest, dq = math.project_quality(src, q, transform, crs, dt, (end-row, x1-x0))
                    old = quality[row:end, x0:x1]
                    take = np.all(np.isfinite(dest), axis=0) & (dq > old)
                    mosaic[row:end, x0:x1][take] = math.encode(dest.transpose(1, 2, 0)[take])
                    old[take] = dq[take]
        mosaic.flush(); quality.flush()
        progress['tiles'][tile] = report['sha256']
        checkpoint = progress_path.with_suffix('.tmp')
        checkpoint.write_text(json.dumps(progress)); checkpoint.replace(progress_path)
        if i % 10 == 0 or i+1 == len(meta['tiles']):
            mosaic.flush(); quality.flush()
            print(f'Projected native tiles {i+1}/{len(meta["tiles"])}', flush=True)
    mosaic.flush(); quality.flush()
    del mosaic, quality
    marker.write_text(json.dumps({'inventorySHA256': signature})+'\n')


def assemble(work, out, cache, inventory, workers=3):
    out.mkdir(parents=True, exist_ok=True)
    mosaic = np.memmap(work/'atlas-rgb.dat', mode='r', dtype='uint8', shape=(HEIGHT, WIDTH, 3))
    quality = np.memmap(work/'atlas-quality.dat', mode='r', dtype='uint8', shape=(HEIGHT, WIDTH))
    base = np.empty((ROWS*171, COLS*171, 3), dtype='float32')
    cover = Image.new('L', (4320, 2160))
    counts = np.zeros(3, dtype='int64')
    coast = Coastline(out/'coastline.geojson.gz')

    def tile(cell):
        x, y = cell
        xs = np.arange(x*SIZE-GUTTER, (x+1)*SIZE+GUTTER) % WIDTH
        ys = np.clip(np.arange(y*SIZE-GUTTER, (y+1)*SIZE+GUTTER), 0, HEIGHT-1)
        q = quality[np.ix_(ys, xs)]
        rgb = math.decode(mosaic[np.ix_(ys, xs)])
        # Rasterize the detailed shoreline on this actual 500m grid, with 2x
        # fractional coverage and identical neighbouring gutters. The land BRDF
        # product's water retrievals produced visible coloured noise in Bohai.
        weight = math.gap_weight(q > 0) * coast.fraction(x, y)
        rgb = rgb*weight[:, :, None] + fallback_tile(x, y)*(1-weight[:, :, None])
        encoded = math.encode(rgb)
        path = out/f'{x}-{y}.avif'
        Image.fromarray(encoded).save(path, format='AVIF', quality=90, speed=6,
                                      max_threads=2, subsampling='4:4:4')
        small = math.resize_linear(rgb[GUTTER:GUTTER+SIZE, GUTTER:GUTTER+SIZE], (171, 171))
        coverage = np.rint(weight[GUTTER:GUTTER+SIZE, GUTTER:GUTTER+SIZE]*255).astype('uint8')
        localcounts = np.bincount(q[GUTTER:GUTTER+SIZE, GUTTER:GUTTER+SIZE].ravel(), minlength=3)
        return x, y, small, Image.fromarray(coverage).resize((90, 90), Image.Resampling.BOX), localcounts

    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for i, (x, y, small, coverage, localcounts) in enumerate(pool.map(tile, [(x, y) for y in range(ROWS) for x in range(COLS)])):
            base[y*171:(y+1)*171, x*171:(x+1)*171] = small
            cover.paste(coverage, (x*90, y*90))
            counts += localcounts
            if (i+1) % COLS == 0:
                print(f'AVIF row {(i+1)//COLS}/{ROWS}; {time.monotonic()-started:.0f}s', flush=True)
    for tier, width in [('simple', 1024), ('medium', 2048), ('standard', 4096), ('high', 8192)]:
        Image.fromarray(math.encode(math.resize_linear(base, (width, width//2)))).save(
            out/f'{tier}.avif', format='AVIF', quality=92, speed=6, max_threads=2, subsampling='4:4:4')
    cover.save(out/'coverage.png', optimize=True)
    source = json.loads(inventory.read_text())
    metadata = Path(source.pop('metadataFile'))
    reports = {t: json.loads((cache/(t+'.json')).read_text()) for t in source['tiles']}
    # Preserve original unsigned STAC URLs, asset hashes and per-date QA reports;
    # the many-GB native matrices are disposable after the final atlas is checked.
    provenance = out/'provenance.json.gz'
    with provenance.open('wb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as packed:
            packed.write(json.dumps({'metadata': json.loads(metadata.read_text()),
                                     'reports': reports}, separators=(',', ':')).encode())
    files = {p.name: sha(p) for p in sorted(out.glob('*.avif'))}
    meta = dict(year=2026, quarter=2, period=['2026-04-01', '2026-06-30'],
                product='MCD43A4.061', bands=['1', '4', '3'], sourceTiles=len(source['tiles']),
                source='https://planetarycomputer.microsoft.com/dataset/modis-43A4-061',
                sourceInventory=source, sourceInventorySHA256=sha(inventory),
                provenanceFile=provenance.name, provenanceSHA256=sha(provenance),
                shoreline={**coast.source, 'file': coast.path.name, 'sha256': sha(coast.path),
                           'method': '1:10 million reference polygons rasterized at 2x display sampling for fractional 500m-grid coast coverage; cartographic reference, not 2026 measured shorelines'},
                sourceComposites={t: {k: reports[t][k] for k in ['sha256', 'sourceWindows', 'processingRule', 'nativeResolutionMeters']} for t in source['tiles']},
                width=WIDTH, height=HEIGHT, columns=COLS, rows=ROWS, tileSize=SIZE, gutter=GUTTER,
                grid='EPSG:4326, 1/240 degree, about 464 m at equator',
                nativeResolutionMeters=500, codec='AVIF', quality=90, encoderSpeed=6, chromaSubsampling='4:4:4',
                displayCurve='Linear reflectance encoded with standard sRGB OETF; no gain, sharpening or regional colour correction',
                resampling='Native 500m temporal QA median without spatial averaging; bilinear geographic reprojection in linear reflectance',
                oceanTreatment='Native 500m land and mixed coastal pixels retained with fractional shore coverage; ocean/lake water and absent observations use stable complete atlas to avoid land-BRDF water colour noise',
                fallback='Existing 2026 Q2 1km composite (including NASA Blue Marble July 2004 stable water and missing-observation fallback); not new 500m observations',
                credit='NASA MODIS Terra+Aqua MCD43A4 Collection 6.1; Microsoft Planetary Computer; NASA Blue Marble Next Generation; Natural Earth coastline reference (public domain)',
                reprojectedPixelCounts=counts.tolist(), coverageSHA256=sha(out/'coverage.png'),
                files=files, totalBytes=sum((out/f).stat().st_size for f in files))
    (out/'manifest.json').write_text(json.dumps(meta, indent=2)+'\n')
    print(f'Native 500m atlas: {meta["totalBytes"]/1e6:.2f} MB', flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cache', type=Path, required=True)
    p.add_argument('--work', type=Path, required=True)
    p.add_argument('--out', type=Path, default=ROOT/'assets/earth/day-2026-q2-500m')
    p.add_argument('--workers', type=int, default=3)
    p.add_argument('--wait-for-tiles', action='store_true')
    p.add_argument('--project-only', action='store_true')
    a = p.parse_args()
    project(a.cache, a.work, a.cache/'inventory.json', a.wait_for_tiles)
    if a.project_only: raise SystemExit(0)
    assemble(a.work, a.out, a.cache, a.cache/'inventory.json', a.workers)
