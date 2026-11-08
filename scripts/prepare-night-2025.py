"""Prepare native 15-arcsecond 2025 night-light display tiles, encoded as AVIF.

Dependencies: rasterio, numpy, Pillow >= 11.3 with AVIF support. Input is the
public VIIRS 2025 raw GeoTIFF linked in lightpollutionmap.info FAQ 30, derived
from NASA VJ146A4.002 AllAngle_Composite_Snow_Free. This retains original samples
within the source coverage. Polar fallback is explicitly the older 2016 1km map.
Raw TIFF, ZIP and the temporary byte mosaic are not runtime assets.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse
import hashlib
import json
import time
import numpy as np
import rasterio
from rasterio.windows import Window
from PIL import Image, features

ROOT=Path(__file__).resolve().parents[1]
SOURCE_URL='https://www2.lightpollutionmap.info/data/v2/viirs_2025_raw.zip'
WIDTH,HEIGHT,SIZE,GUTTER,COLS,ROWS=86400,43200,1800,8,48,24
QUALITY,SPEED=92,8

def sha256(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
 return h.hexdigest()

def display_radiance(radiance):
 # The same fixed global display curve as the existing 2024 1km atlas.
 # No sharpening, local histogram changes or artificial point lights.
 light=np.maximum(np.nan_to_num(radiance,nan=0,posinf=0,neginf=0)-.5,0)
 return np.rint(np.clip(np.log1p(light*2)/np.log1p(200),0,1)*255).astype('uint8')

def encode(image,path):
 temporary=path.with_suffix('.avif.part')
 image.save(temporary,format='AVIF',quality=QUALITY,speed=SPEED,subsampling='4:4:4',max_threads=2)
 temporary.replace(path)

def crop_proof(data,output):
 # Beijing: same 2025 samples compared before/after encoding, not two years.
 x=int((116.4+180)*240)-256;y=int((75-39.9)*240)-256
 values=data.read(1,window=Window(x,y,512,512),masked=True).filled(0)
 reference=display_radiance(values)
 image=Image.fromarray(reference)
 image.save(output/'beijing-native-reference.png')
 encode(image,output/'beijing-avif-check.avif')
 with Image.open(output/'beijing-avif-check.avif') as decoded:
  restored=np.array(decoded.convert('L'))
  decoded.convert('L').save(output/'beijing-avif-decoded.png')
 coarse=values.reshape(256,2,256,2).mean(axis=(1,3))
 Image.fromarray(display_radiance(coarse)).resize((512,512),Image.Resampling.BILINEAR).save(output/'beijing-2025-1km-comparison.png')
 error=np.abs(reference.astype('int16')-restored.astype('int16'))
 bright=reference>=64
 return {'site':[116.4,39.9],'dimensions':[512,512],'sourceWindow':[x,y,512,512],
  'quality':QUALITY,'speed':SPEED,'meanAbsoluteCodeError':float(error.mean()),
  'p99AbsoluteCodeError':float(np.quantile(error,.99)),'maxAbsoluteCodeError':int(error.max()),
  'brightPixelCount':int(bright.sum()),'brightPixelMeanAbsoluteCodeError':float(error[bright].mean()) if bright.any() else 0,
  'referencePNGBytes':(output/'beijing-native-reference.png').stat().st_size,
  'avifBytes':(output/'beijing-avif-check.avif').stat().st_size}

def prepare(source,output,evidence,workers=2):
 if not features.check('avif'):raise RuntimeError('Pillow AVIF encoding support is required')
 output.mkdir(parents=True,exist_ok=True);evidence.mkdir(parents=True,exist_ok=True)
 temporary=source.parent/'night-2025-native-display.dat'
 started=time.monotonic();mosaic=None
 try:
  with rasterio.open(source) as data:
   assert (data.width,data.height,data.count)==(86400,33600,1)
   assert data.crs.to_epsg()==4326
   assert np.allclose(tuple(data.bounds),(-180,-65,180,75))
   assert np.allclose((data.transform.a,data.transform.e),(1/240,-1/240))
   proof=crop_proof(data,evidence)
   (evidence/'avif-comparison.json').write_text(json.dumps(proof,indent=2)+'\n')
   print('AVIF comparison',json.dumps(proof),flush=True)
   mosaic=np.memmap(temporary,dtype='uint8',mode='w+',shape=(HEIGHT,WIDTH))
   # Preserve the existing polar observations, with their actual old date and
   # 1km information content recorded in the manifest. Resampling is not new data.
   for y in [0,10,11]:
    for x in range(24):
     with Image.open(ROOT/f'assets/earth/night-detail/{x}-{y}.jpg') as image:
      coarse=image.crop((8,8,1808,1808)).resize((3600,3600),Image.Resampling.BILINEAR)
      mosaic[y*3600:(y+1)*3600,x*3600:(x+1)*3600]=np.asarray(coarse)
   for row in range(0,data.height,128):
    count=min(128,data.height-row)
    values=data.read(1,window=Window(0,row,data.width,count),masked=True).filled(0)
    mosaic[3600+row:3600+row+count]=display_radiance(values)
    if row%4096==0:print(f'Native radiance rows {row}/{data.height}',flush=True)
   source_info={'sourceSize':[data.width,data.height],'sourceBounds':list(data.bounds),
    'crs':str(data.crs),'pixelDegrees':[data.transform.a,data.transform.e],'sourceDtype':data.dtypes[0],
    'sourceNoData':data.nodata,'sourceTags':data.tags()}
  mosaic.flush()
  base=Image.new('L',(COLS*171,ROWS*171))
  def write_tile(x,y):
   xs=np.arange(x*SIZE-GUTTER,(x+1)*SIZE+GUTTER)%WIDTH
   ys=np.clip(np.arange(y*SIZE-GUTTER,(y+1)*SIZE+GUTTER),0,HEIGHT-1)
   with Image.fromarray(mosaic[np.ix_(ys,xs)]) as tile:
    encode(tile,output/f'{x}-{y}.avif')
    return x,tile.crop((GUTTER,GUTTER,SIZE+GUTTER,SIZE+GUTTER)).resize((171,171),Image.Resampling.LANCZOS)
  with ThreadPoolExecutor(max_workers=max(1,min(4,workers))) as pool:
   for y in range(ROWS):
    for x,small in pool.map(lambda x:write_tile(x,y),range(COLS)):
     base.paste(small,(x*171,y*171));small.close()
    print(f'AVIF tiles {y+1}/{ROWS}, elapsed {time.monotonic()-started:.1f}s',flush=True)
  for tier,width in [('simple',1024),('medium',2048),('standard',4096),('high',8192)]:
   encode(base.resize((width,width//2),Image.Resampling.LANCZOS),output/f'{tier}.avif')
  files={p.name:sha256(p) for p in sorted(output.glob('*.avif'))}
  meta={'year':2025,'product':'VJ146A4.002','band':'AllAngle_Composite_Snow_Free',
   'observed':'2025-01-01 / 2025-12-31','source':SOURCE_URL,
   'sourceDocumentation':'https://www.lightpollutionmap.info/help.html#FAQ',
   'scienceDocumentation':'https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VJ146A4',
   'credit':"NASA's Black Marble nighttime lights product; Jurij Stare, www.lightpollutionmap.info",
   'license':'NASA open science data; raw product listed under CC0 by the distributor; retain source attribution',
   'sourceSHA256':sha256(source),**source_info,
   'polarFallback':'NASA Black Marble 2016, 1km; bilinear display resampling only, not 2025 observations',
   'polarFallbackBounds':[[-180,75,180,90],[-180,-90,180,-65]],
   'width':WIDTH,'height':HEIGHT,'columns':COLS,'rows':ROWS,'tileSize':SIZE,'gutter':GUTTER,
   'nominalResolutionMeters':500,'sampleArcSeconds':15,
   'resampling':'Native 15 arc second samples inside sourceBounds; missing observations display black',
   'displayCurve':'round(255 * clamp(log1p(max(radiance-0.5,0)*2)/log1p(200),0,1))',
   'encoding':{'format':'AVIF','quality':QUALITY,'speed':SPEED,'subsampling':'4:4:4','bitDepth':8},
   'files':files,'totalBytes':sum((output/f).stat().st_size for f in files)}
  (output/'manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
  (evidence/'preparation.json').write_text(json.dumps({'seconds':time.monotonic()-started,'assets':len(files),'bytes':meta['totalBytes'],'source':source_info,'comparison':proof},ensure_ascii=False,indent=2)+'\n')
  print(f'Complete: {len(files)} AVIF assets, {meta["totalBytes"]/1e6:.2f} MB, {time.monotonic()-started:.1f}s',flush=True)
 finally:
  if mosaic is not None:del mosaic
  temporary.unlink(missing_ok=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',type=Path)
 parser.add_argument('--output',type=Path,default=ROOT/'assets/earth/night-2025-500m')
 parser.add_argument('--evidence',type=Path,default=ROOT/'output/release136/night-validation')
 parser.add_argument('--workers',type=int,default=2)
 args=parser.parse_args();prepare(args.source,args.output,args.evidence,args.workers)
