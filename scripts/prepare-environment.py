"""Prepare local, attributed textures and catalogue; never fetch at runtime."""
from pathlib import Path
from PIL import Image
import json, shutil, hashlib, argparse

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--stars-source', type=Path, help='Optional StarSky Studio data/stars.js to migrate; otherwise retain the bundled catalogue.')
args = parser.parse_args()

root = Path(__file__).resolve().parents[1]
earth = root / 'assets/earth'
source = earth / 'source'
for tier, day_size, detail_size in [('simple', 1024, 0), ('medium', 2048, 2048), ('standard', 4096, 4096), ('high', 8192, 8192)]:
    out = earth / tier
    out.mkdir(exist_ok=True)
    for kind, src, size in [('day', '8k_earth_daymap.jpg', day_size), ('night', '8k_earth_nightmap.jpg', detail_size), ('cloud', '8k_earth_clouds.jpg', detail_size), ('ocean', '2k_earth_specular_map.tif', min(detail_size, 2048))]:
        if tier == 'high' and kind == 'night' and (earth / 'night-detail/manifest.json').exists():
            continue
        if tier == 'high' and kind == 'day' and (earth / 'detail/manifest.json').exists():
            continue  # Native NASA base must stay colour-matched to the detail tiles.
        if not size:
            continue
        im = Image.open(source / src).convert('L' if kind in ('cloud', 'ocean') else 'RGB')
        im = im.resize((size, size // 2), Image.Resampling.LANCZOS)
        im.save(out / (kind + '.jpg'), quality=90, optimize=True)
        print(tier, kind, im.size, (out / (kind + '.jpg')).stat().st_size)

if args.stars_source:
    raw = args.stars_source.read_text()
    stars = json.loads(raw.split('=', 1)[1].split(';', 1)[0])
    stars.sort(key=lambda row: row[3])
    (root / 'assets/stars.json').write_text(json.dumps(stars, separators=(',', ':')))
    shutil.copyfile(args.stars_source.parent / 'D3-CELESTIAL-LICENSE.txt', root / 'assets/D3-CELESTIAL-LICENSE.txt')
else:
    stars = json.loads((root / 'assets/stars.json').read_text())
existing = json.loads((root / 'assets/environment-manifest.json').read_text()) if (root / 'assets/environment-manifest.json').exists() else {}
manifest = {**existing, 'projection': 'equirectangular; left=-180°, centre=0°, top=+90°',
            'earth_source': 'https://www.solarsystemscope.com/textures/',
            'earth_license': 'CC BY 4.0; Solar System Scope / INOVE',
            'star_count': len(stars), 'star_frame': 'J2000 equatorial',
            'files': {str(p.relative_to(earth)): hashlib.sha256(p.read_bytes()).hexdigest() for p in earth.rglob('*') if p.is_file()}}
(root / 'assets/environment-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
