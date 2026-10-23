"""Tile NASA's native 21,600 px July Blue Marble; no image enlargement.
Source: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/
"""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('source',type=Path);a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'assets/earth/detail';out.mkdir(exist_ok=True)
Image.MAX_IMAGE_PIXELS=250_000_000
im=Image.open(a.source).convert('RGB');assert im.size==(21600,10800)
size=1800;gutter=8
for y in range(6):
 for x in range(12):
  # Wrap longitude and extend polar rows. Eight real neighbouring pixels protect filtering seams.
  box=(x*size-gutter,y*size-gutter,(x+1)*size+gutter,(y+1)*size+gutter)
  tile=im.crop(box)
  if x==0:tile.paste(im.crop((21600-gutter,max(0,box[1]),21600,min(10800,box[3]))),(0,max(0,-box[1])))
  if x==11:tile.paste(im.crop((0,max(0,box[1]),gutter,min(10800,box[3]))),(size+gutter,max(0,-box[1])))
  if y==0:tile.paste(tile.crop((0,gutter,tile.width,gutter+1)).resize((tile.width,gutter)),(0,0))
  if y==5:tile.paste(tile.crop((0,size+gutter-1,tile.width,size+gutter)).resize((tile.width,gutter)),(0,size+gutter))
  tile.save(out/f'{x}-{y}.jpg',quality=90,subsampling=0,optimize=True)
# Matching global colour and coastlines prevent LOD colour changes.
im.resize((8192,4096),Image.Resampling.LANCZOS).save(root/'assets/earth/high/day.jpg',quality=90,optimize=True)
meta={'source':'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/july/world.topo.200407.3x21600x10800.jpg','credit':'NASA Earth Observatory / Blue Marble Next Generation, July 2004 composite with topography','sourceSHA256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'width':21600,'height':10800,'columns':12,'rows':6,'tileSize':1800,'gutter':8,'files':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(out.glob('*.jpg'))}}
(out/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n')
p=root/'assets/environment-manifest.json';m=json.loads(p.read_text());m['earth_detail']=meta;m['files']['high/day.jpg']=hashlib.sha256((root/'assets/earth/high/day.jpg').read_bytes()).hexdigest();p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
print('Detail tiles MB:',sum(f.stat().st_size for f in out.glob('*.jpg'))/1e6)
