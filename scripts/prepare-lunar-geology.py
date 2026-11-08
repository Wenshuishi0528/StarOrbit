#!/usr/bin/env python3
"""Prepare attributed original-projection views and registered globe texture.

Requires Pillow and NumPy. No recolouring, watermark removal or geological-class
inference is performed. Full poster remains beside legend/timescale crops and a
separately registered central-panel globe texture with explicit no-data mask.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://upload.wikimedia.org/wikipedia/commons/1/1d/The_geologic_map_of_the_Moon_at_1-2.5M_scale.jpg'
SOURCE_SHA256 = 'dfc7efe5ec59aecd7b345f322fefb71ac918a89eb7b61f1bfa6f41728b547dd7'
SOURCE_BYTES = 206245173
AUTHORS = ['Jinzhu Ji', 'Dijun Guo', 'Jianzhong Liu', 'Shengbo Chen', 'Zongcheng Ling', 'Xiaozhong Ding', 'Kunying Han', 'Jianping Chen', 'Weiming Cheng', 'Kai Zhu', 'Jingwen Liu', 'Juntao Wang', 'Jian Chen', 'Ziyuan Ouyang']
VIEWS = [
    ('poster', None, 8192),
    ('overview', None, 2400),
    ('legend', (0.86, 0.56, 0.994, 0.965), 2000),
    ('timescale', (0.018, 0.55, 0.145, 0.81), 2000),
]


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'output/lunar-geology-source/igcas-geologic-map-2022-original.jpg')
    parser.add_argument('--output', type=Path, default=ROOT / 'assets/moon/geology')
    parser.add_argument('--download', action='store_true', help='Fetch the public CC BY 4.0 source mirror only if absent.')
    args = parser.parse_args()
    if not args.source.exists() and args.download:
        args.source.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['curl', '--fail', '--location', '--max-time', '180', '--output', str(args.source), SOURCE_URL], check=True)
    if not args.source.is_file():
        parser.error('Source absent; supply --source or request the public download with --download.')
    if args.source.stat().st_size != SOURCE_BYTES or digest(args.source) != SOURCE_SHA256:
        parser.error('Source identity mismatch; refuse to prepare a different map/version.')
    # The verified original is a 389-megapixel scientific poster. JPEG draft
    # decoding halves both axes, keeping enough information for an 8192px view.
    Image.MAX_IMAGE_PIXELS = 500_000_000
    image = Image.open(args.source)
    if image.size != (29999, 12978):
        parser.error('Unexpected original dimensions.')
    image.draft('RGB', (8192, 3544))
    image.load()
    args.output.mkdir(parents=True, exist_ok=True)
    outputs = []
    for name, box, target_width in VIEWS:
        pixels = None if box is None else tuple(round(v * n) for v, n in zip(box, [image.width, image.height, image.width, image.height]))
        view = image.copy() if pixels is None else image.crop(pixels)
        width = min(target_width, view.width)
        height = round(view.height * width / view.width)
        view = view.resize((width, height), Image.Resampling.LANCZOS)
        path = args.output / (name + '.webp')
        view.save(path, 'WEBP', quality=92, method=6)
        outputs.append({'id': name, 'file': 'assets/moon/geology/' + path.name, 'width': width, 'height': height, 'bytes': path.stat().st_size, 'sha256': digest(path), 'cropNormalized': box})
    manifest = {
        'schema': 1,
        'id': 'igcas-global-geologic-map-2022-v1',
        'title': 'The 1:2,500,000-Scale Geologic Map of the Global Moon',
        'version': 'V1 / public pre-proofs / 2022-06-15',
        'scaleDenominator': 2500000,
        'authors': AUTHORS,
        'leadInstitution': 'Institute of Geochemistry, Chinese Academy of Sciences',
        'doi': '10.12176/03.99.02797',
        'sourceRecord': 'https://www.scidb.cn/en/detail?dataSetId=972277454573928448',
        'articleDoi': '10.1016/j.scib.2022.05.021',
        'original': {'url': SOURCE_URL, 'width': 29999, 'height': 12978, 'bytes': SOURCE_BYTES, 'sha256': SOURCE_SHA256},
        'mirrorRecord': 'https://commons.wikimedia.org/wiki/File:The_geologic_map_of_the_Moon_at_1-2.5M_scale.jpg',
        'license': 'CC BY 4.0',
        'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
        'access': 'PUBLIC',
        'sourceDescriptionUseNote': 'The official description also specifies non-commercial scientific research and science promotion with proper citation; preserved here alongside its CC BY 4.0 metadata. StarOrbit uses the map for non-commercial science education.',
        'projection': {'main': 'Mollweide', 'layout': 'Composite poster with separate polar maps, lithologic and tectonic insets, legend, chronology and credits', 'georeferencedRaster': False, 'globeTexture': False},
        'processing': 'JPEG draft decode, proportional Lanczos downsample and WebP compression; legend and time-scale views are identified crops. Complete poster and all original pre-proofs watermarks retained. No reprojection, recolouring or geologic class extraction.',
        'outputs': outputs,
    }
    (args.output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    subprocess.run(['python3', str(ROOT / 'scripts/reproject-lunar-geology.py'), str(args.source), str(args.output)], check=True)
    print(json.dumps({'sourceVerified': True, 'outputs': [{k: item[k] for k in ['id', 'width', 'height', 'bytes']} for item in outputs]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
