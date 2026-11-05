"""Package QA-filtered MODIS reflectance caches as the app's 1 km day atlas.

Run only after prepare-day-modis-2026.py has completed its declared inventory.
No geographic colour corrections, histogram matching or artificial gap filling.
The legacy NASA image remains explicit fallback for water/missing observations.
"""
from pathlib import Path
import argparse, hashlib, importlib.util, json
import numpy as np
import rasterio
from rasterio.transform import Affine, from_origin
from rasterio.warp import reproject, transform_bounds
from rasterio.enums import Resampling
from PIL import Image, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'assets/earth/source/day-modis-2026-q2/composites'
OUT=ROOT/'assets/earth/day-2026-q2-1km'
W,H=43200,21600
Image.MAX_IMAGE_PIXELS=250_000_000
spec=importlib.util.spec_from_file_location('legacy_day',ROOT/'scripts/prepare-day-2026.py')
legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)

def encode(x):
    x=np.clip(x,0,1)
    return np.rint(255*np.where(x<=.0031308,12.92*x,1.055*x**(1/2.4)-.055)).astype('uint8')

def decode(x):
    x=np.asarray(x,dtype='float32')/255
    return np.where(x<=.04045,x/12.92,((x+.055)/1.055)**2.4)

def resize_linear(x,size):
    return np.stack([np.asarray(Image.fromarray(x[:,:,b]).resize(size,Image.Resampling.BOX)) for b in range(3)],axis=-1)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def gap_weight(valid):
    # Three-pixel interior distance: the first valid pixel next to a gap has
    # zero weight, unlike multiplying a Gaussian mask by a hard validity edge.
    eroded=Image.fromarray(valid.astype('uint8')*255)
    distance=np.zeros(valid.shape,dtype='float32')
    for _ in range(3):
        eroded=eroded.filter(ImageFilter.MinFilter(3))
        distance+=np.asarray(eroded,dtype='float32')/255
    t=distance/3
    return t*t*(3-2*t)

def geographic_bounds(tile, shape, transform, crs):
    bounds=transform_bounds(crs,'EPSG:4326',*rasterio.transform.array_bounds(*shape,transform),densify_pts=41)
    west,south,east,north=bounds
    # Sinusoidal poles are singular: densification can omit valid longitudes.
    # The subsequent inverse reprojection still determines real source validity.
    if tile.endswith(('v00','v17')): west,east=-180,180
    return west,south,east,north

def project_quality(src, quality, transform, crs, destination_transform, shape):
    dest=np.full((3,*shape),np.nan,dtype='float32')
    low=np.full(shape,np.nan,dtype='float32')
    options=dict(src_transform=transform,src_crs=crs,src_nodata=np.nan,
                 dst_transform=destination_transform,dst_crs='EPSG:4326',
                 dst_nodata=np.nan,resampling=Resampling.bilinear,num_threads=1)
    reproject(src,dest,**options)
    # Match the RGB interpolation support; any magnitude-inversion contribution
    # conservatively marks the destination as lower quality.
    reproject(np.where(quality>0,(quality==1).astype('float32'),np.nan),low,**options)
    dq=np.where(np.isfinite(low),np.where(low>1e-7,1,2),0).astype('uint8')
    return dest,dq

def sample_legacy_tile(image, x, y):
    # Each modern core covers half of a legacy core. Parent 8px gutters become
    # 16px at twice the scale; the output retains only the central 8px gutter.
    left=4+(x%2)*900;top=4+(y%2)*900
    # Include one extra parent pixel of interpolation support. Cropping before
    # resize without this margin clamps the outer gutter and breaks agreement
    # between neighbouring output tiles.
    old=decode(image.crop((left-1,top-1,left+909,top+909)))
    return np.stack([np.asarray(Image.fromarray(old[:,:,b]).resize((1820,1820),Image.Resampling.BILINEAR).crop((2,2,1818,1818))) for b in range(3)],axis=-1)

def assemble(cache,out,inventory):
    provenance=json.loads(inventory.read_text())
    tiles=provenance['tiles']
    missing=[t for t in tiles if not (cache/(t+'.npz')).exists()]
    if missing: raise RuntimeError(f'Missing {len(missing)} declared tiles: {missing[:5]}')
    reports={}
    for tile in tiles:
        report=json.loads((cache/(tile+'.json')).read_text())
        if sha(cache/(tile+'.npz'))!=report['sha256']: raise ValueError(tile+': composite checksum mismatch')
        for source in report['sourceWindows']:
            if not ('2026-04-01T00:00:00Z'<=source['start'] and source['end']<'2026-07-01T00:00:00Z'):
                raise ValueError(tile+': source window outside requested quarter')
        reports[tile]=dict(sha256=report['sha256'],sourceWindows=report['sourceWindows'])
    out.mkdir(parents=True,exist_ok=True)
    mosaic=np.memmap(cache/'atlas-rgb.dat',mode='w+',dtype='uint8',shape=(H,W,3))
    quality=np.memmap(cache/'atlas-quality.dat',mode='w+',dtype='uint8',shape=(H,W));quality[:]=0
    # Only reflectance is reprojected. Encoding takes place after interpolation.
    for i,tile in enumerate(tiles):
        with np.load(cache/(tile+'.npz')) as z:
            src=z['rgb']; st=Affine(*z['transform'][:6]); crs=str(z['crs']); q=z['quality']
            if src.shape[0]!=3 or q.shape!=src.shape[1:]: raise ValueError(tile+': unexpected cache shape')
            west,south,east,north=geographic_bounds(tile,q.shape,st,crs)
            spans=[(west,180),(-180,east)] if east<west else [(west,east)]
            for left,right in spans:
                x0=max(0,int(np.floor((left+180)*120)));x1=min(W,int(np.ceil((right+180)*120)))
                y0=max(0,int(np.floor((90-north)*120)));y1=min(H,int(np.ceil((90-south)*120)))
                if x1<=x0 or y1<=y0: continue
                for row in range(y0,y1,192):
                    end=min(row+192,y1);shape=(end-row,x1-x0)
                    dt=from_origin(-180+x0/120,90-row/120,1/120,1/120)
                    dest,dq=project_quality(src,q,st,crs,dt,shape)
                    oldq=quality[row:end,x0:x1];take=np.all(np.isfinite(dest),axis=0)&(dq>oldq)
                    mosaic[row:end,x0:x1][take]=encode(dest.transpose(1,2,0)[take]);oldq[take]=dq[take]
        if i%10==0 or i==len(tiles)-1: print(f'Projected {i+1}/{len(tiles)}',flush=True)
    mosaic.flush();quality.flush()
    ocean=legacy.ocean_mask()
    # Assemble one complete global base in linear space, not per-tile tone mapping.
    base=np.empty((4104,8208,3),dtype='float32');cover=Image.new('L',(4320,2160));counts=np.zeros(3,dtype='int64');areas=np.zeros(4)
    for y in range(12):
        for x in range(24):
            xs=np.arange(x*1800-8,(x+1)*1800+8)%W;ys=np.clip(np.arange(y*1800-8,(y+1)*1800+8),0,H-1)
            q=quality[np.ix_(ys,xs)];rgb=decode(mosaic[np.ix_(ys,xs)])
            # Parent 2004 tile includes 8px gutters; a new tile spans half a parent.
            with Image.open(ROOT/f'assets/earth/detail/{x//2}-{y//2}.jpg') as im:
                old=sample_legacy_tile(im,x,y)
            feather=gap_weight(q>0)
            # Small gap/coast transition only; never smooth valid source interiors.
            land=legacy.land_weight(ocean,x*1800-8,y*1800-8,1816,1816)
            weight=feather*land
            rgb=rgb*weight[:,:,None]+old*(1-weight[:,:,None])
            Image.fromarray(encode(rgb)).save(out/f'{x}-{y}.jpg',quality=83,subsampling=2,optimize=True)
            base[y*342:(y+1)*342,x*342:(x+1)*342]=resize_linear(rgb[8:1808,8:1808],(342,342))
            cv=np.rint(weight[8:1808,8:1808]*255).astype('uint8')
            cover.paste(Image.fromarray(cv).resize((180,180),Image.Resampling.BOX),(x*180,y*180))
            for k in range(3): counts[k]+=np.count_nonzero(q[8:1808,8:1808]==k)
            area=np.cos(np.deg2rad(90-(y*1800+np.arange(1800)+.5)/120))[:,None]
            landarea=land[8:1808,8:1808]*area
            areas[0]+=landarea.sum()
            for k in (1,2): areas[k]+=(landarea*feather[8:1808,8:1808]*(q[8:1808,8:1808]==k)).sum()
        print(f'JPEG row {y+1}/12',flush=True)
    for tier,width in [('simple',1024),('medium',2048),('standard',4096),('high',8192)]:
        Image.fromarray(encode(resize_linear(base,(width,width//2)))).save(out/f'{tier}.jpg',quality=88,optimize=True)
    cover.save(out/'coverage.png',optimize=True)
    files={p.name:sha(p) for p in sorted(out.glob('*.jpg'))}
    provenance.pop('metadataFile',None)
    meta=dict(year=2026,quarter=2,period=['2026-04-01','2026-06-30'],product='MCD43A4.061',bands=['1','4','3'],source='https://planetarycomputer.microsoft.com/dataset/modis-43A4-061',sourceTiles=len(tiles),sourceInventory=provenance,sourceInventorySHA256=sha(inventory),sourceComposites=reports,credit='NASA MODIS Terra+Aqua MCD43A4 Collection 6.1; Microsoft Planetary Computer mirror',fallback='NASA Blue Marble Next Generation July 2004 for water and unavailable observations',width=W,height=H,columns=24,rows=12,tileSize=1800,gutter=8,grid='EPSG:4326, 1/120 degree, about 928 m at equator',displayCurve='Linear reflectance encoded with standard sRGB OETF; no gain, saturation, highlight stretch or per-region colour correction',resampling='QA-filtered native 500m reflectance reduced to 1km; bilinear geographic reprojection; base averaged in linear space',oceanTreatment='Existing atlas land/lake mask; legacy water and missing observations with narrow edge blend',reprojectedPixelCounts=counts.tolist(),landAreaFractionDefinition='Area-weighted fraction of terrestrial coverage, using atlas land fraction and cos(latitude); includes interior gap feather. Coastal ocean blend is already represented by the land fraction and is not counted a second time.',landAreaFractions=dict(fullQuality=areas[2]/areas[0],magnitudeFallback=areas[1]/areas[0],legacy=1-(areas[1]+areas[2])/areas[0]),coverageSHA256=sha(out/'coverage.png'),files=files,totalBytes=sum((out/f).stat().st_size for f in files))
    (out/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n')
    del mosaic,quality
    (cache/'atlas-rgb.dat').unlink();(cache/'atlas-quality.dat').unlink()
    print(f'Atlas {meta["totalBytes"]/1e6:.2f} MB',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--cache',type=Path,default=CACHE);p.add_argument('--out',type=Path,default=OUT);p.add_argument('--inventory',type=Path,required=True)
    a=p.parse_args();assemble(a.cache,a.out,a.inventory)
