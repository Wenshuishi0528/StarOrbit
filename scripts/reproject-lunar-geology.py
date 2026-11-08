#!/usr/bin/env python3
"""Registered Mollweide poster map to a 4K equirectangular educational RGB texture.

Uses Pillow and NumPy. Does not infer geological classes or remove annotations.
Coordinates refer to pixel centres in the pinned original 29999 x 12978 JPEG.
"""
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image

CENTER = (15007.410546941146, 6439.233338522413)
RADII = (10628.4803278404, 5313.503859211767)
SOURCE_SIZE = (29999, 12978)
WIDTH, HEIGHT = 4096, 2048
BORDER_MARGIN_PX = 8.0
# Independently visually read graticule intersections, not fitted to these values.
# Fine printed grid and geological overlays limit manual reading to about 3 px.
CONTROLS = [
    {'longitude': 0, 'latitude': 0, 'observedPixel': [15006, 6441]},
    {'longitude': 60, 'latitude': 0, 'observedPixel': [18549, 6441]},
    {'longitude': -60, 'latitude': 0, 'observedPixel': [11465, 6441]},
    {'longitude': 0, 'latitude': 30, 'observedPixel': [15006, 4294]},
    {'longitude': 0, 'latitude': 60, 'observedPixel': [15006, 2389]},
    {'longitude': 0, 'latitude': -60, 'observedPixel': [15006, 10491]},
]


def theta_for_latitude(latitude):
    phi = np.deg2rad(np.asarray(latitude, dtype=float))
    # Bisection is stable at both poles, unlike unguarded Newton iterations.
    lo = np.full_like(phi, -math.pi / 2)
    hi = np.full_like(phi, math.pi / 2)
    target = math.pi * np.sin(phi)
    for _ in range(52):
        mid = (lo + hi) / 2
        lower = 2 * mid + np.sin(2 * mid) < target
        lo = np.where(lower, mid, lo)
        hi = np.where(lower, hi, mid)
    return (lo + hi) / 2


def project(longitude, latitude):
    theta = theta_for_latitude(latitude)
    return (CENTER[0] + RADII[0] * np.asarray(longitude) / 180 * np.cos(theta),
            CENTER[1] - RADII[1] * np.sin(theta))


def unproject(x, y):
    theta = np.arcsin(np.clip((CENTER[1] - np.asarray(y)) / RADII[1], -1, 1))
    lat = np.rad2deg(np.arcsin(np.clip((2 * theta + np.sin(2 * theta)) / math.pi, -1, 1)))
    lon = 180 * (np.asarray(x) - CENTER[0]) / (RADII[0] * np.cos(theta))
    return lon, lat


def valid_source(x, y, latitude):
    # First-order inward normal distance to the ellipse; conservatively discard
    # its printed outline and the polar pinch. Never stretch neighbouring classes.
    dx, dy = (x - CENTER[0]) / RADII[0], (y - CENTER[1]) / RADII[1]
    q = np.sqrt(dx * dx + dy * dy)
    grad = np.sqrt((dx / RADII[0])**2 + (dy / RADII[1])**2)
    distance = (1 - q) / np.maximum(grad, 1e-12)
    return distance > BORDER_MARGIN_PX


def control_report():
    out = []
    for c in CONTROLS:
        x, y = project(c['longitude'], c['latitude'])
        residual = math.hypot(x-c['observedPixel'][0], y-c['observedPixel'][1])
        out.append(dict(c, predictedPixel=[float(x), float(y)], residualPixels=residual))
    return out


def write_globe(source, output):
    digest = hashlib.sha256()
    with Path(source).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != 'dfc7efe5ec59aecd7b345f322fefb71ac918a89eb7b61f1bfa6f41728b547dd7':
        raise ValueError('Pinned original source hash mismatch')
    Image.MAX_IMAGE_PIXELS = 500_000_000
    im = Image.open(source)
    if im.size != SOURCE_SIZE:
        raise ValueError('Wrong source dimensions')
    # Decode at 1/2 original dimensions. This still exceeds the output sampling
    # density away from the excluded polar pinch and avoids a >1GB RGB allocation.
    im.draft('RGB', (12000, 5000))
    rgb = np.asarray(im.convert('RGB'))
    sx, sy = rgb.shape[1] / SOURCE_SIZE[0], rgb.shape[0] / SOURCE_SIZE[1]
    result = np.empty((HEIGHT, WIDTH, 4), np.uint8)
    longitude = ((np.arange(WIDTH) + .5) / WIDTH * 360 - 180)[None, :]
    n_valid = 0
    valid_area_weight = 0.0
    total_area_weight = 0.0
    for start in range(0, HEIGHT, 64):
        rows = np.arange(start, min(start + 64, HEIGHT))
        latitude = (90 - (rows + .5) / HEIGHT * 180)[:, None]
        x, y = project(longitude, latitude)
        y = np.broadcast_to(y, x.shape)
        valid = valid_source(x, y, latitude)
        # Pixel-centre preserving conversion into JPEG draft coordinates.
        px, py = (x + .5) * sx - .5, (y + .5) * sy - .5
        ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
        fx, fy = (px - ix)[..., None], (py - iy)[..., None]
        colour = ((rgb[iy, ix] * (1-fx) + rgb[iy, ix+1] * fx) * (1-fy)
                  + (rgb[iy+1, ix] * (1-fx) + rgb[iy+1, ix+1] * fx) * fy)
        result[rows, :, :3] = np.clip(np.rint(colour), 0, 255).astype(np.uint8)
        result[rows, :, 3] = valid.astype(np.uint8) * 255
        # Explicit neutral no-data RGB; alpha remains zero. No geological filling.
        result[rows, :, :3][~valid] = [64, 66, 70]
        n_valid += int(valid.sum())
        weights = np.cos(np.deg2rad(latitude))
        valid_area_weight += float((valid * weights).sum())
        total_area_weight += float(weights.sum()) * WIDTH
    target = Path(output) / 'globe.webp'
    Image.fromarray(result).save(target, 'WEBP', quality=92, method=6)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    registration = {
        'sourceProjection': 'Mollweide', 'centralMeridianDegrees': 0,
        'sourcePixelOrigin': 'top-left, pixel centres; x right, y down',
        'sourceCenterPixel': list(CENTER), 'sourceEllipseRadiiPixels': list(RADII),
        'outputProjection': 'equirectangular / spherical latitude',
        'longitudeConvention': 'east-positive; -180 left, 0 centre, +180 right',
        'latitudeConvention': '+90 top, -90 bottom; pixel-centre samples',
        'outputSize': [WIDTH, HEIGHT], 'alphaNoData': 0,
        'validLatitudeLimitDegrees': None, 'outlineExclusionPixels': BORDER_MARGIN_PX,
        'latitudeLimitPolicy': 'No arbitrary latitude cap; validity follows distance from the printed elliptical outline only.',
        'validPixelFraction': n_valid / (WIDTH * HEIGHT),
        'validSphericalAreaFraction': valid_area_weight / total_area_weight,
        'areaWeighting': 'cos(latitude) weights on equal longitude/latitude pixel centres',
        'ellipseFit': {'sampleCount': 360, 'rmsPixels': 1.3552785, 'maxResidualPixels': 15.46326,
                       'inlierCountWithin5Pixels': 358, 'inlierRmsPixels': .8861085,
                       'sampleRecord': 'assets/moon/geology/outline-fit.json',
                       'method': 'Dark printed ellipse outline sampled every 1 degree; least-squares ellipse with independent x/y scale.'},
        'controlPointReadingUncertaintyPixels': 3, 'graticuleControls': control_report(),
        'landmarkChecks': [
            {'name': 'Tycho', 'latitude': -43.30, 'longitude': -11.22,
             'source': 'https://planetarynames.wr.usgs.gov/Feature/6163'},
            {'name': 'Copernicus', 'latitude': 9.62, 'longitude': -20.08,
             'source': 'https://planetarynames.wr.usgs.gov/Feature/1296'},
            {'name': 'Tsiolkovskiy', 'latitude': -20.38, 'longitude': 128.97,
             'source': 'https://planetarynames.wr.usgs.gov/Feature/6108'},
        ],
        'landmarkCheckMethod': 'Official IAU/USGS centres projected and visually overlaid on the original; all fall inside the corresponding named crater. This is an independent direction/location check, not a measured boundary-accuracy claim.',
        'method': 'Backward output resampling: equirectangular pixel centre -> spherical Mollweide forward equations -> registered original raster; bilinear RGB sampling. Independent graticule controls not used in ellipse fit.',
        'precision': 'Educational visual registration, not analytical GIS. Grid controls agree within 3 original pixels; output spacing is 0.087890625 degree per pixel. Polar pinch and printed outline excluded; printed geological boundaries are not a numerical classification dataset.',
        'retained': 'Original colours, labels, hatching, graticule and pre-proofs watermarks within the global map; full credits and legend remain in the original-poster viewer.',
        'sources': ['https://pubs.usgs.gov/pp/1395/report.pdf', 'https://proj.org/en/stable/operations/projections/moll.html'],
    }
    (Path(output) / 'registration.json').write_text(json.dumps(registration, indent=2) + '\n')
    record = {'id': 'globe', 'file': 'assets/moon/geology/globe.webp', 'width': WIDTH, 'height': HEIGHT,
              'bytes': target.stat().st_size, 'sha256': digest, 'cropNormalized': None,
              'projection': 'equirectangular', 'hasAlphaNoData': True}
    return record, registration


if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path)
    p.add_argument('output', type=Path)
    args = p.parse_args()
    record, registration = write_globe(args.source, args.output)
    manifest_path = args.output / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    manifest['outputs'] = [o for o in manifest['outputs'] if o['id'] != 'globe'] + [record]
    manifest['projection']['globeTexture'] = True
    manifest['projection']['derivedGeoreferencedRaster'] = True
    manifest['projection']['registration'] = 'assets/moon/geology/registration.json'
    globe_note = ' A separate registered 4096×2048 equirectangular globe view is derived from the central Mollweide panel; source watermarks retained, polar pinch and outline marked transparent no-data. See registration.json.'
    manifest['processing'] = manifest['processing'].split(' A separate registered 4096')[0] + globe_note
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': record, 'validPixelFraction': registration['validPixelFraction'], 'controls': registration['graticuleControls']}, indent=2))
