"""Standard reflectance encoding and packaged water continuity, not aesthetic targets.
Run in the data preparation Python environment (NumPy, Rasterio, Pillow).
"""
from pathlib import Path
import importlib.util
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('day',root/'scripts/assemble-day-modis-2026.py')
day=importlib.util.module_from_spec(spec);spec.loader.exec_module(day)
# Independent sRGB transfer-function reference levels.
values=np.array([0,.001,.01,.05,.18,.5,1],dtype='float32')
np.testing.assert_array_equal(day.encode(values),[0,3,25,63,118,188,255])
gray=day.encode(np.linspace(0,1,10001))
assert np.all(np.diff(gray.astype('int16'))>=0)
assert np.max(np.abs(day.decode(day.encode(values))-values))<.003
# Water remains the explicit legacy fallback, not an artificial satellite mosaic.
with Image.open(root/'assets/earth/day-2026-q2-1km/high.jpg') as modern, Image.open(root/'assets/earth/high/day.jpg') as old:
    for lon,lat in [(123,34),(126,29),(125,35.5),(141,32),(-40,0)]:
        pixel=(int((lon+180)/360*8192),int((90-lat)/180*4096))
        delta=np.abs(np.asarray(modern.getpixel(pixel),dtype='int16')-np.asarray(old.getpixel(pixel),dtype='int16'))
        assert delta.max()<18, f'Offshore fallback changed at {lon},{lat}: {delta}'
print('Standard sRGB references and packaged offshore fallback passed')

# Adjacent files contain the same 16-pixel geographic gutter. Compression can
# differ slightly, but an indexing/registration seam must not be packaged.
worst=(0,None)
for y in range(12):
    for x in range(24):
        with Image.open(root/f'assets/earth/day-2026-q2-1km/{x}-{y}.jpg') as im:
            right=np.asarray(im.crop((1800,8,1816,1808)),dtype='int16')
            bottom=np.asarray(im.crop((8,1800,1808,1816)),dtype='int16')
        with Image.open(root/f'assets/earth/day-2026-q2-1km/{(x+1)%24}-{y}.jpg') as im:
            delta=np.abs(right-np.asarray(im.crop((0,8,16,1808)),dtype='int16')).mean()
            if delta>worst[0]: worst=(float(delta),f'{x},{y} east')
        if y<11:
            with Image.open(root/f'assets/earth/day-2026-q2-1km/{x}-{y+1}.jpg') as im:
                delta=np.abs(bottom-np.asarray(im.crop((8,0,1808,16)),dtype='int16')).mean()
                if delta>worst[0]: worst=(float(delta),f'{x},{y} south')
assert worst[0]<4, f'Geographic gutter discontinuity: {worst}'
print('Global tile gutter registration including date line:',worst)
