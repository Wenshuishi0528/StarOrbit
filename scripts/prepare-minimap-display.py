"""Freeze the v0.91 display palette; remove the old polar-ocean white band.
The map is a navigation backdrop, independent of scene imagery/seasonal ice.
"""
from pathlib import Path
import gzip,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1]
source=root/'assets/earth/simple/day.jpg'
coast=root/'assets/earth/day-2026-q2-500m/coastline.geojson.gz'
features=json.loads(gzip.decompress(coast.read_bytes()))['features']
im=Image.open(source).convert('RGB');w,h=im.size;scale=4
mask=Image.new('L',(w*scale,h*scale));draw=ImageDraw.Draw(mask)
for feature in features:
 for i,ring in enumerate(feature['coordinates']):
  points=[((lon+180)/360*w*scale,(90-lat)/180*h*scale) for lon,lat in ring]
  draw.polygon(points,fill=255 if i==0 else 0)
land=np.asarray(mask.resize((w,h),Image.Resampling.LANCZOS),dtype=float)/255
rgb=np.asarray(im,dtype=float);lat=90-(np.arange(h)+.5)/h*180
weight=np.clip((lat-60)/10,0,1)[:,None]*(1-land)
rgb=rgb*(1-weight[:,:,None])+np.array([32,59,114])*weight[:,:,None]
out=root/'assets/earth/minimap';out.mkdir(exist_ok=True)
Image.fromarray(np.uint8(np.clip(np.rint(rgb),0,255))).save(out/'display.avif',quality=90,speed=6,subsampling='4:4:4')
(out/'manifest.json').write_text(json.dumps({'source':'../simple/day.jpg','sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'coastline':'../day-2026-q2-500m/coastline.geojson.gz','coastlineSHA256':hashlib.sha256(coast.read_bytes()).hexdigest(),'file':'display.avif','width':w,'height':h,'role':'Fixed v0.91 display palette. North-polar ocean is blue; coastline and land retained. Not a seasonal sea-ice map.','sha256':hashlib.sha256((out/'display.avif').read_bytes()).hexdigest()},indent=2)+'\n')
print(out/'display.avif',(out/'display.avif').stat().st_size)
