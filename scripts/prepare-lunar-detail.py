"""Generate StarOrbit's bundled 16K LROC colour tiles from the pinned JPEG (Pillow)."""
import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA = '14ba95e251dd444ad408df91a7004ee1801c333f0fa8f963be0db692a00e4ebe'
SOURCE_URL = ('https://raw.githubusercontent.com/kvsankar/moon-mission/'
              '5d63408bdd826df38e100c7bc90c0b7cb3524beb/images/moon/lroc_color_2025_16k_quality.jpg')
WIDTH, HEIGHT = 16384, 8192
SIZE, GUTTER = 512, 8


def padded_tile(image, column, row):
    """Wrap longitude and extend the outermost polar row into the gutter."""
    left, top = column * SIZE - GUTTER, row * SIZE - GUTTER
    right, bottom = left + SIZE + 2 * GUTTER, top + SIZE + 2 * GUTTER
    y0, y1 = max(0, top), min(HEIGHT, bottom)
    tile = Image.new('RGB', (right - left, bottom - top))
    x = left
    while x < right:
        source_x = x % WIDTH
        length = min(WIDTH - source_x, right - x)
        tile.paste(image.crop((source_x, y0, source_x + length, y1)), (x - left, y0 - top))
        x += length
    for dest, source_y, rows in ((0, y0 - top, y0 - top),
                                 (y1 - top, y1 - top - 1, bottom - y1)):
        if rows:
            strip = tile.crop((0, source_y, tile.width, source_y + 1))
            tile.paste(strip.resize((tile.width, rows), Image.Resampling.NEAREST), (0, dest))
    return tile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path,
                        default=ROOT / 'output/lunar-source/lroc_color_2025_16k_quality.jpg')
    parser.add_argument('--output', type=Path, default=ROOT / 'assets/moon')
    args = parser.parse_args()
    original = args.source.read_bytes()
    if hashlib.sha256(original).hexdigest() != SOURCE_SHA:
        parser.error('Expected the 2025 16K LROC JPEG with SHA-256 ' + SOURCE_SHA)
    Image.MAX_IMAGE_PIXELS = WIDTH * HEIGHT
    columns, rows = WIDTH // SIZE, HEIGHT // SIZE
    digest = hashlib.sha256()
    total = 0
    with Image.open(io.BytesIO(original)) as image:
        if image.format != 'JPEG' or image.mode != 'RGB' or image.size != (WIDTH, HEIGHT):
            raise ValueError('Unexpected lunar colour image format')
        for y in range(rows):
            directory = args.output / 'lroc-16k' / str(y)
            directory.mkdir(parents=True, exist_ok=True)
            for x in range(columns):
                encoded = io.BytesIO()
                # DCT-aligned gutters and the original quantization tables preserve crater detail.
                padded_tile(image, x, y).save(encoded, 'JPEG', qtables=image.quantization,
                                               subsampling=0, optimize=True)
                data = encoded.getvalue()
                (directory / f'{x}.jpg').write_bytes(data)
                total += len(data)
                digest.update(data)
    manifest = {
        'edition': 'NASA SVS CGI Moon Kit, December 2025 LROC colour',
        'source': {'official': 'https://svs.gsfc.nasa.gov/4720/', 'jpeg': SOURCE_URL,
                   'sha256': SOURCE_SHA, 'bytes': len(original)},
        'width': WIDTH, 'height': HEIGHT, 'columns': columns, 'rows': rows,
        'tileSize': SIZE, 'gutter': GUTTER, 'filePattern': 'lroc-16k/{y}/{x}.jpg',
        'bytes': total, 'sha256RowMajorBytes': digest.hexdigest(),
    }
    (args.output / 'colour-detail.json').write_text(json.dumps(manifest, indent=2) + '\n',
                                                   encoding='utf-8', newline='\n')
    print(f'{columns * rows} tiles, {total:,} bytes ({total / 2**20:.2f} MiB), {digest.hexdigest()}')


if __name__ == '__main__':
    main()
