"""Prepare 1 km light-only tiles from NASA's 500 m Black Marble 2016 grayscale map.
Usage: python3 scripts/prepare-night-detail.py /path/to/A1.jpg-through-D2.jpg
"""
from pathlib import Path
from PIL import Image
import argparse, json, hashlib
p=argparse.ArgumentParser();p.add_argument('source',type=Path);a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'assets/earth/night-detail';out.mkdir(parents=True,exist_ok=True)
Image.MAX_IMAGE_PIXELS=500_000_000
# Memory-mapped 43,200x21,600 grayscale mosaic keeps processing bounded.
import numpy as np
mosaic_path=a.source/'night-1km.dat'
mosaic=np.memmap(mosaic_path,dtype=np.uint8,mode='w+',shape=(21600,43200))
sources={}
for y in range(2):
 for x in range(4):
  key='ABCD'[x]+str(y+1);path=a.source/(key+'.jpg');sources[key]=hashlib.sha256(path.read_bytes()).hexdigest()
  with Image.open(path) as image:
   assert image.size==(21600,21600) and image.mode=='L'
   reduced=image.resize((10800,10800),Image.Resampling.LANCZOS)
   mosaic[y*10800:(y+1)*10800,x*10800:(x+1)*10800]=np.asarray(reduced);reduced.close()
  print('Prepared',key,flush=True)
mosaic.flush();size=1800;gutter=8;base=Image.new('L',(24*342,12*342))
for y in range(12):
 for x in range(24):
  xs=np.arange(x*size-gutter,(x+1)*size+gutter)%43200
  ys=np.clip(np.arange(y*size-gutter,(y+1)*size+gutter),0,21599)
  tile=Image.fromarray(mosaic[np.ix_(ys,xs)])
  tile.save(out/f'{x}-{y}.jpg',quality=94,optimize=True)
  base.paste(tile.crop((gutter,gutter,size+gutter,size+gutter)).resize((342,342),Image.Resampling.LANCZOS),(x*342,y*342))
base.resize((8192,4096),Image.Resampling.LANCZOS).save(root/'assets/earth/high/night.jpg',quality=94,optimize=True)
meta={'source':'https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/','urlTemplate':'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144897/BlackMarble_2016_{region}_gray.jpg','credit':'NASA Earth Observatory / Black Marble 2016, Suomi NPP VIIRS','sourceSize':[86400,43200],'width':43200,'height':21600,'columns':24,'rows':12,'tileSize':size,'gutter':gutter,'sourceSHA256':sources,'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.glob('*.jpg'))}}
(out/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n')
p=root/'assets/environment-manifest.json';data=json.loads(p.read_text());data['night_detail']=meta;data['files']['high/night.jpg']=hashlib.sha256((root/'assets/earth/high/night.jpg').read_bytes()).hexdigest();p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Night tiles MB:',sum(p.stat().st_size for p in out.glob('*.jpg'))/1e6,flush=True)
del mosaic;mosaic_path.unlink()
