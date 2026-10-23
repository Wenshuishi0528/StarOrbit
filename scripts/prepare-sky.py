"""Reproject the native NASA SVS 4851 16K galactic EXR to seamless cube faces.
Usage: python3 scripts/prepare-sky.py /path/milkyway_2020_16k_gal.exr
Requires OpenEXR, numpy, Pillow; the raw EXR is not distributed.
"""
import sys
from pathlib import Path
import OpenEXR
import numpy as np
from PIL import Image
source = OpenEXR.File(sys.argv[1]).channels()['RGB'].pixels
assert source.shape == (8192, 16384, 3), 'Use the native 16K source'
out = Path(__file__).resolve().parents[1] / 'assets' / 'sky'
out.mkdir(exist_ok=True)
size = 4096
# OpenGL cube mapping, uploaded with flipY=false (CubeTexture convention).
for face in ['px', 'nx', 'py', 'ny', 'pz', 'nz']:
    pixels = np.empty((size, size, 3), dtype=np.uint8)
    for row in range(0, size, 64):
        u, v = np.meshgrid((np.arange(size, dtype=np.float32)+.5)*2/size-1,
                          (np.arange(row, row+64, dtype=np.float32)+.5)*2/size-1)
        one = np.ones_like(u)
        x, y, z = {'px':(one,-v,-u), 'nx':(-one,-v,u), 'py':(u,one,v),
                   'ny':(u,-one,-v), 'pz':(u,-v,one), 'nz':(-u,-v,-one)}[face]
        lon = np.arctan2(y, x)
        lat = np.arctan2(z, np.sqrt(x*x+y*y))
        sx = (.5-lon/(2*np.pi))*16384-.5
        sy = np.clip((.5-lat/np.pi)*8192-.5, 0, 8191)
        ix, iy = np.floor(sx).astype(int), np.floor(sy).astype(int)
        tx, ty = (sx-ix)[...,None], (sy-iy)[...,None]
        a, b = source[iy, ix%16384].astype(np.float32), source[iy, (ix+1)%16384].astype(np.float32)
        c, d = source[np.minimum(iy+1,8191), ix%16384].astype(np.float32), source[np.minimum(iy+1,8191), (ix+1)%16384].astype(np.float32)
        linear = np.maximum(((a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty)*8, 0)
        linear /= 1+linear
        srgb = np.where(linear<=.0031308,linear*12.92,1.055*np.power(linear,1/2.4)-.055)
        pixels[row:row+64] = np.rint(np.clip(srgb,0,1)*255).astype(np.uint8)
    image = Image.fromarray(pixels)
    for level, width in [(16,4096),(8,2048),(4,1024)]:
        texture = image if width==4096 else image.resize((width,width),Image.Resampling.LANCZOS)
        target=out/f'milkyway-{level}k-{face}.jpg'
        texture.save(target,quality=95,subsampling=0,optimize=True)
        print(target.name,target.stat().st_size,flush=True)
