"""Build a 1/120-degree display atlas from 2026 Q2 Sentinel-2 COG overviews.

Dependencies: numpy, rasterio, Pillow, pyarrow. Only reduced RGB is retained;
raw 10 m assets are never downloaded. Interrupted runs resume from NPZ tiles.
Copernicus Sentinel data 2026, mirrored by Taylor Geospatial / Source Cooperative.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse, hashlib, json, os, time, urllib.request
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import Affine, from_origin
from rasterio.warp import transform_bounds, reproject
from PIL import Image, ImageFilter, ImageOps
from rasterio.features import rasterize
Image.MAX_IMAGE_PIXELS = 250_000_000

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://data.source.coop/tge-labs/sentinel-2-quarterly-cloudless-mosaics/'
MANIFEST = BASE+'manifest/manifest_2026_Q2.parquet'
CACHE = ROOT/'assets/earth/source/day-2026-q2'
OUT = ROOT/'assets/earth/day-2026-q2-1km'

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def inventory():
    import pyarrow.parquet as pq
    CACHE.mkdir(parents=True, exist_ok=True)
    manifest=CACHE/'manifest.parquet'
    if not manifest.exists():
        urllib.request.urlretrieve(MANIFEST, manifest)
    rows=pq.read_table(manifest).to_pylist()
    assert rows and all(r['year']==2026 and r['quarter']=='Q2' for r in rows), 'Unexpected quarter manifest'
    return sorted({r['item_id'].replace('Sentinel-2_mosaic_2026_Q2_', '') for r in rows})

def download(tile):
    dest=CACHE/(tile+'.npz')
    if dest.exists():
        return tile, None
    for attempt in range(3):
        try:
            bands=[]
            with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',
                              GDAL_HTTP_TIMEOUT='25', GDAL_HTTP_CONNECTTIMEOUT='10', GDAL_HTTP_MAX_RETRY='1',
                              GDAL_CACHEMAX=16, CPL_VSIL_CURL_CACHE_SIZE=2000000):
                for band in ['B04','B03','B02']:
                    with rasterio.open(BASE+f'2026/Q2/{tile}/{band}.tif') as ds:
                        assert ds.nodata == -32768 and ds.count == 1
                        assert ds.width == ds.height == 10008
                        bands.append(ds.read(1, out_shape=(101,101), resampling=Resampling.average))
                        transform=ds.transform*Affine.scale(ds.width/101, ds.height/101)
                        crs=ds.crs.to_epsg()
            temp=dest.with_suffix(f'.{os.getpid()}.part.npz')
            np.savez_compressed(temp, rgb=np.stack(bands), transform=np.array(tuple(transform)), epsg=crs)
            temp.replace(dest)
            return tile, None
        except Exception as e:
            if attempt==2:
                return tile, str(e)
            time.sleep(attempt+1)

def fetch(workers,limit,reverse=False):
    tiles=inventory()
    if reverse: tiles.reverse()
    if limit: tiles=tiles[:limit]
    todo=[t for t in tiles if not (CACHE/(t+'.npz')).exists()]
    print(f'Cached {len(tiles)-len(todo)}/{len(tiles)}; downloading {len(todo)} tiles with {workers} workers',flush=True)
    errors={}; started=time.time()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        tasks=[pool.submit(download,t) for t in todo]
        for i,future in enumerate(as_completed(tasks),1):
            tile,error=future.result()
            if error: errors[tile]=error
            if i%50==0 or i==len(todo):
                print(f'{i}/{len(todo)} in {time.time()-started:.0f}s; failed {len(errors)}',flush=True)
    (CACHE/'errors.json').write_text(json.dumps(errors,indent=2))
    if errors: raise RuntimeError(f'{len(errors)} downloads failed; rerun to resume')

def stretch(rgb):
    # Fixed global RGB display: basic True Color gain for ordinary terrain;
    # a smooth bright-pixel transition protects desert/snow highlights without
    # lifting dark vegetation. No per-tile histograms or geographic recolouring.
    # Highlight transform adapted from Sentinel Hub Quarterly True Color,
    # CC BY-SA 4.0: https://custom-scripts.sentinel-hub.com/sentinel2-quarterly-cloudless-mosaic/true-color/
    reflectance = np.maximum(rgb.astype('float32') / 10000., 0)
    basic = np.clip(reflectance * 2.5, 0, 1)
    x = np.clip(reflectance / 3., 0, 1); midpoint = .13 / 3.
    contrast = x * (x * midpoint - 1) / (x * (2 * midpoint - 1) - midpoint)
    linear = ((contrast + .01)**1.8 - .01**1.8) / (1.01**1.8 - .01**1.8)
    linear = np.clip(linear * 1.2 - linear.mean(axis=-1, keepdims=True) * .2, 0, 1)
    highlight = np.where(linear <= .0031308, linear * 12.92, 1.055 * linear**(1/2.4) - .055)
    weight = np.clip((reflectance.max(axis=-1, keepdims=True) - .20) / .20, 0, 1)
    weight = weight * weight * (3 - 2 * weight)
    return np.rint((basic * (1-weight) + highlight * weight) * 255).astype('uint8')

def ocean_mask():
    # Reuse the app's existing land/lake polygons (~2 km simplified boundary),
    # which retain islands and shallow seas far better than the 2K shader mask.
    path=CACHE/'ocean-mask-2km.png'
    if not path.exists():
        atlas=json.loads((ROOT/'assets/geography/atlas.json').read_text())
        shapes=[({'type':'Polygon','coordinates':p['rings']},255) for c in atlas['countries'] for p in c['parts']]
        shapes += [({'type':'Polygon','coordinates':p['rings']},0) for lake in atlas['regions'] if lake['kind']=='lake' for p in lake['parts']]
        land=rasterize(shapes,out_shape=(10800,21600),transform=from_origin(-180,90,1/60,1/60),fill=0,dtype='uint8')
        sea=ImageOps.invert(Image.fromarray(land).filter(ImageFilter.GaussianBlur(.6)))
        sea.save(path,optimize=True)
    with Image.open(path) as im:
        return np.asarray(im).copy()


def land_weight(ocean, x0, y0, width, height):
    # Sample the existing sea/land mask at pixel centres. Smooth coastal blending
    # avoids replacing shallow seas with discontinuous Sentinel land-footprint tiles.
    sx=((x0+np.arange(width)+.5)*ocean.shape[1]/43200-.5)%ocean.shape[1]
    sy=np.clip((y0+np.arange(height)+.5)*ocean.shape[0]/21600-.5,0,ocean.shape[0]-1)
    ix=sx.astype('int32');iy=sy.astype('int32');fx=sx-ix;fy=sy-iy
    top=ocean[iy[:,None],ix[None,:]]*(1-fx)+ocean[iy[:,None],((ix+1)%ocean.shape[1])[None,:]]*fx
    bottom=ocean[np.minimum(iy+1,ocean.shape[0]-1)[:,None],ix[None,:]]*(1-fx)+ocean[np.minimum(iy+1,ocean.shape[0]-1)[:,None],((ix+1)%ocean.shape[1])[None,:]]*fx
    sea=top*(1-fy[:,None])+bottom*fy[:,None]
    return 1-np.clip((sea-5)/245,0,1)


def assemble():
    tiles=inventory()
    missing=[t for t in tiles if not (CACHE/(t+'.npz')).exists()]
    if missing: raise RuntimeError(f'{len(missing)} missing tiles; complete fetch before packaging')
    OUT.mkdir(parents=True,exist_ok=True)
    legacy=ROOT/'assets/earth/day-2004';legacy.mkdir(exist_ok=True)
    with Image.open(ROOT/'assets/earth/high/day.jpg') as old:
        for tier,width in [('simple',1024),('medium',2048),('standard',4096)]:
            old.resize((width,width//2),Image.Resampling.LANCZOS).save(legacy/(tier+'.jpg'),quality=90,optimize=True)
    # Disk-backed atlas keeps peak RAM bounded; old NASA map supplies uncovered pixels.
    mosaic=np.memmap(CACHE/'mosaic.dat',mode='w+',dtype='uint8',shape=(21600,43200,3))
    mask=np.memmap(CACHE/'coverage.dat',mode='w+',dtype='uint8',shape=(21600,43200))
    mask[:]=0
    ocean=ocean_mask()
    for y in range(6):
        for x in range(12):
            with Image.open(ROOT/f'assets/earth/detail/{x}-{y}.jpg') as im:
                mosaic[y*3600:(y+1)*3600,x*3600:(x+1)*3600]=np.asarray(im.resize((3632,3632),Image.Resampling.BILINEAR).crop((16,16,3616,3616)))
    for i,tile in enumerate(tiles):
        with np.load(CACHE/(tile+'.npz')) as z:
            src=z['rgb']; st=Affine(*z['transform'][:6]); crs=f'EPSG:{int(z["epsg"])}'
            bounds=rasterio.transform.array_bounds(101,101,st)
            west,south,east,north=transform_bounds(crs,'EPSG:4326',*bounds,densify_pts=21)
            # Dateline-crossing source tiles are projected independently into both edges.
            spans=[(west,180),(-180,east)] if east<west else [(west,east)]
            for left,right in spans:
                x0=max(0,int(np.floor((left+180)*120)));x1=min(43200,int(np.ceil((right+180)*120)))
                y0=max(0,int(np.floor((90-north)*120)));y1=min(21600,int(np.ceil((90-south)*120)))
                if x1<=x0 or y1<=y0: continue
                dest=np.full((3,y1-y0,x1-x0),-32768,dtype='int16')
                reproject(src,dest,src_transform=st,src_crs=crs,src_nodata=-32768,
                          dst_transform=from_origin(-180+x0/120,90-y0/120,1/120,1/120),dst_crs='EPSG:4326',
                          dst_nodata=-32768,resampling=Resampling.bilinear,num_threads=1)
                valid=np.all(dest!=-32768,axis=0)
                # Deterministic overlap: first valid tile; no random worker-order seams.
                target=mosaic[y0:y1,x0:x1];coverage=mask[y0:y1,x0:x1]
                old=target.astype('float32')
                water=(old[:,:,2]>old[:,:,1]*1.5)&(old[:,:,2]>old[:,:,0]*1.8)&(old[:,:,1]<90)
                weight=land_weight(ocean,x0,y0,x1-x0,y1-y0)
                take=valid&(coverage==0)&~water&(weight>.005)
                alpha=weight[take,None]
                target[take]=np.rint(stretch(dest.transpose(1,2,0)[take])*alpha+old[take]*(1-alpha)).astype('uint8')
                coverage[take]=np.maximum(1,np.rint(weight[take]*255)).astype('uint8')
        if i%1000==0: print(f'Projected {i}/{len(tiles)}',flush=True)
    mosaic.flush();mask.flush()
    base=Image.new('RGB',(8208,4104));cover=Image.new('L',(4320,2160))
    for y in range(12):
        for x in range(24):
            xs=np.arange(x*1800-8,(x+1)*1800+8)%43200
            ys=np.clip(np.arange(y*1800-8,(y+1)*1800+8),0,21599)
            im=Image.fromarray(mosaic[np.ix_(ys,xs)])
            im.save(OUT/f'{x}-{y}.jpg',quality=83,subsampling=2,optimize=True)
            base.paste(im.crop((8,8,1808,1808)).resize((342,342),Image.Resampling.LANCZOS),(x*342,y*342))
            cover.paste(Image.fromarray(mask[y*1800:(y+1)*1800,x*1800:(x+1)*1800]).resize((180,180),Image.Resampling.BOX),(x*180,y*180))
        print(f'JPEG row {y+1}/12',flush=True)
    for tier,width in [('simple',1024),('medium',2048),('standard',4096),('high',8192)]:
        base.resize((width,width//2),Image.Resampling.LANCZOS).save(OUT/f'{tier}.jpg',quality=88,optimize=True)
    cover.save(OUT/'coverage.png',optimize=True)
    files={p.name:digest(p) for p in sorted(OUT.glob('*.jpg'))}
    meta=dict(year=2026,quarter=2,period=['2026-04-01','2026-06-30'],product='S2MSI_L3__MCQ',
              source=BASE,sourceManifest=MANIFEST,sourceManifestSHA256=digest(CACHE/'manifest.parquet'),
              sourceTiles=len(tiles),coverageSHA256=digest(OUT/'coverage.png'),bands=['B04','B03','B02'],
              credit='Contains modified Copernicus Sentinel data (2026); mirror: Taylor Geospatial / Source Cooperative',
              fallback='NASA Blue Marble Next Generation July 2004, for unavailable observations, open ocean and polar gaps',
              width=43200,height=21600,columns=24,rows=12,tileSize=1800,gutter=8,
              grid='EPSG:4326, 1/120 degree, about 928 m at equator; not uniform 1 km at every latitude',
              resampling='Average COG overviews to 101x101 per ~100km UTM tile; bilinear reproject to geographic grid',
              displayCurve='Basic RGB gain 2.5 blended with Sentinel Hub quarterly highlight curve using smoothstep(.20,.40,max reflectance); no additional gamma lift on ordinary midtones',
              highlightReference='https://custom-scripts.sentinel-hub.com/sentinel2-quarterly-cloudless-mosaic/true-color/',
              displayReference='https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/true_color/',
              oceanTreatment='Existing atlas land/lake polygons rasterized at 1/60 degree, 0.6px coastal feather; preserve 2004 water and missing observations',
              maskSource='assets/geography/atlas.json',maskSourceSHA256=digest(ROOT/'assets/geography/atlas.json'),
              files=files,totalBytes=sum((OUT/f).stat().st_size for f in files))
    (OUT/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n')
    print(f'Display atlas: {meta["totalBytes"]/1e6:.2f} MB',flush=True)
    del mosaic,mask
    (CACHE/'mosaic.dat').unlink();(CACHE/'coverage.dat').unlink()

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['fetch','assemble']);p.add_argument('--workers',type=int,default=24);p.add_argument('--limit',type=int);p.add_argument('--reverse',action='store_true')
    a=p.parse_args()
    if a.action=='fetch':fetch(a.workers,a.limit,a.reverse)
    else:assemble()
