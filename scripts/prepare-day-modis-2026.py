"""Prepare reproducible, QA-filtered 2026 Q2 MODIS NBAR 1km composites.

Python dependencies: numpy, rasterio, Pillow, requests. Anonymous Planetary
Computer signing; no credentials. All source acquisition windows must lie
entirely within Q2. Native 500m QA is applied before temporal/spatial averaging; full inversions
are preferred, with separately marked magnitude-inversion fallback only when absent.
Sample: python scripts/prepare-day-modis-2026.py --tile h27v06 --cadence 8day
Global: add --fetch --workers 12 --out PATH; completed tile hashes enable resume.
Only final per-tile composites are persisted; global native COGs stay in memory.
"""
from pathlib import Path
from datetime import date, timedelta, datetime, timezone
import argparse, json, re, warnings, time, hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock, local
import numpy as np
import requests
import rasterio
from rasterio.transform import Affine, from_bounds
from rasterio.warp import reproject, transform as transform_coordinates
from rasterio.enums import Resampling
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
COLLECTION = 'modis-43A4-061'
CENTERS = ('2026-04-16', '2026-05-16', '2026-06-16')
EIGHT_DAY_CENTERS=tuple((date(2026,4,9)+timedelta(days=8*i)).isoformat() for i in range(10))
BANDS = (1, 4, 3)
CACHE = ROOT / 'assets/earth/source/day-modis-2026-q2'
warnings.filterwarnings('ignore',message='All-NaN slice encountered',category=RuntimeWarning)
_SESSION_LOCAL=local()
_ASSET_POOL=None


def get_response(url, **kwargs):
    for attempt in range(4):
        try:
            if not hasattr(_SESSION_LOCAL,'session'):
                _SESSION_LOCAL.session=requests.Session()
                adapter=requests.adapters.HTTPAdapter(pool_connections=4,pool_maxsize=4)
                _SESSION_LOCAL.session.mount('https://',adapter)
            response=_SESSION_LOCAL.session.get(url,timeout=90,**kwargs);response.raise_for_status();return response
        except requests.RequestException:
            if attempt==3: raise
            time.sleep(2**attempt)

def get_json(url, params=None):
    return get_response(url,params=params).json()


def inventory(tile, cache, centers=CENTERS):
    dest = cache / f'{tile}-{len(centers)}dates-metadata.json'
    if dest.exists():
        return json.loads(dest.read_text())
    m = re.fullmatch(r'h(\d{2})v(\d{2})', tile)
    if not m:
        raise ValueError('Expected MODIS tile hNNvNN')
    query = {'modis:horizontal-tile': {'eq': int(m[1])},
             'modis:vertical-tile': {'eq': int(m[2])}}
    params = dict(collections=COLLECTION, datetime='2026-04-01/2026-06-30',
                  query=json.dumps(query), limit=200)
    page = get_json(STAC + '/search', params)
    items = page['features']
    while (nxt := next((x for x in page.get('links', []) if x['rel']=='next'), None)):
        page = get_json(nxt['href']); items.extend(page['features'])
    selected = []
    for date in centers:
        candidates = [x for x in items if x['properties']['datetime'].startswith(date)
            and x['properties']['start_datetime'] >= '2026-04-01T00:00:00Z'
            and x['properties']['end_datetime'] < '2026-07-01T00:00:00Z']
        if not candidates:
            raise RuntimeError(f'{tile}: missing exact date {date}; refusing visual/date cherry-picking')
        selected.append(sorted(candidates, key=lambda x:x['id'])[-1])
    dest.write_text(json.dumps(selected, indent=2))
    return selected


_TOKENS = {}
_TOKEN_LOCK = Lock()

def validate_item(item):
    if item.get('collection')!=COLLECTION: raise ValueError('Unexpected source collection')
    prop=item['properties']
    if not (prop['start_datetime']>='2026-04-01T00:00:00Z' and prop['end_datetime']<'2026-07-01T00:00:00Z'):
        raise ValueError('Source acquisition window extends outside Q2')
    for b in BANDS:
        spec=item['assets'][f'Nadir_Reflectance_Band{b}']['raster:bands'][0]
        if spec['scale']!=.0001 or spec.get('offset',0)!=0 or spec['data_type']!='int16':
            raise ValueError('MODIS reflectance encoding changed')
        quality=item['assets'][f'BRDF_Albedo_Band_Mandatory_Quality_Band{b}']
        if quality['raster:bands'][0]['data_type']!='uint8': raise ValueError('Quality dtype changed')
        classes={c['value']:c['description'].lower() for c in quality['classification:classes']}
        if set(classes)!={0,1} or 'full brdf' not in classes[0] or 'magnitude brdf' not in classes[1]:
            raise ValueError('Quality classification semantics changed')


def sample_item(item, cache, persist=True):
    """Fetch six small native COGs concurrently; retain QA0 and QA1 separately."""
    validate_item(item)
    dest = cache / (item['id']+'.npz')
    if dest.exists():
        with np.load(dest) as x:
            if 'quality' in x.files:
                data={k:x[k] for k in x.files}
                rgb=data['rgb'];q=data['quality'];tr=Affine(*data['transform'][:6])
                if rgb.shape!=(3,2400,2400) or q.shape!=(2400,2400) or not np.isin(q,[0,1,2]).all():
                    raise ValueError('Invalid native cache shape or quality schema')
                if not np.array_equal(np.isfinite(rgb),np.broadcast_to(q>0,rgb.shape)) or np.isinf(rgb).any():
                    raise ValueError('Native cache quality and reflectance validity differ')
                if not np.isclose(abs(tr.a),463.3127165279,rtol=0,atol=1e-5) or rasterio.crs.CRS.from_wkt(str(data['crs'])).to_dict().get('proj')!='sinu':
                    raise ValueError('Invalid native cache grid')
                return data, {'cached':True,'bodyBytes':0,'cachedSampleSHA256':hashlib.sha256(dest.read_bytes()).hexdigest()}
    assets = {}
    for b in BANDS:
        for key in (f'Nadir_Reflectance_Band{b}',f'BRDF_Albedo_Band_Mandatory_Quality_Band{b}'):
            assets[key] = item['assets'][key]
    href=next(iter(assets.values()))['href']; account=href.split('/')[2].split('.')[0]; container=href.split('/')[3]
    pair=(account,container)
    with _TOKEN_LOCK:
        if pair not in _TOKENS or time.time()>_TOKENS[pair][1]-120:
            signed=get_json(f'https://planetarycomputer.microsoft.com/api/sas/v1/token/{account}/{container}')
            expiry=datetime.fromisoformat(signed['msft:expiry'].replace('Z','+00:00')).timestamp()
            _TOKENS[pair]=(signed['token'],expiry)
        token=_TOKENS[pair][0]
    started=time.monotonic()
    def read_asset(entry):
        key,asset=entry
        r=get_response(asset['href']+'?'+token)
        with rasterio.io.MemoryFile(r.content) as mem:
            with mem.open() as ds:
                expected_type=asset['raster:bands'][0]['data_type']
                if ds.count!=1 or ds.shape!=(2400,2400) or ds.dtypes[0]!=expected_type:
                    raise ValueError('Unexpected COG shape, band count, or dtype')
                if ds.crs.to_dict().get('proj')!='sinu' or not np.isclose(abs(ds.transform.a),463.3127165279,rtol=0,atol=1e-5):
                    raise ValueError('Unexpected MODIS native grid')
                return key,ds.read(1),ds.read_masks(1)>0,(ds.shape,ds.transform,ds.crs),len(r.content),hashlib.sha256(r.content).hexdigest()
    if _ASSET_POOL is not None:
        rows=list(_ASSET_POOL.map(read_asset,assets.items()))
    else:
        with ThreadPoolExecutor(max_workers=6) as pool:
            rows=list(pool.map(read_asset,assets.items()))
    fetched={r[0]:r for r in rows}; reference=rows[0][3]; arrays=[]; valid=None; full=None
    for b in BANDS:
        name=f'Nadir_Reflectance_Band{b}'; _,dn,mask,grid,_,_=fetched[name]
        _,qa,qmask,qgrid,_,_=fetched[f'BRDF_Albedo_Band_Mandatory_Quality_Band{b}']
        if grid!=reference or qgrid!=reference: raise ValueError('Mismatched RGB/QA grids')
        good=(dn>=0)&(dn<32767)&mask&qmask&(qa<=1)
        high=good&(qa==0)
        valid=good if valid is None else valid&good
        full=high if full is None else full&high
        scale=assets[name]['raster:bands'][0]['scale']
        arrays.append(dn.astype('float32')*scale)
    rgb=np.stack(arrays);rgb[:,~valid]=np.nan
    quality=np.where(full,2,np.where(valid,1,0)).astype('uint8')
    data=dict(rgb=rgb,quality=quality,transform=np.array(tuple(reference[1])),crs=np.array(reference[2].to_wkt()))
    if persist:
        temp=dest.with_suffix('.part.npz');np.savez_compressed(temp,**data);temp.replace(dest)
    transfer=dict(cached=False,bodyBytes=sum(r[4] for r in rows),getRequests=len(rows),assetSHA256={r[0]:r[5] for r in rows},elapsedSeconds=time.monotonic()-started,
                  fullQualityFraction=float(full.mean()),fallbackQualityFraction=float((valid&~full).mean()),method='6 concurrent full small COG GETs; no global/native persistent COG cache')
    if persist: dest.with_suffix('.transfer.json').write_text(json.dumps(transfer,indent=2))
    return data,transfer


def encode(rgb):
    x=np.clip(np.nan_to_num(rgb),0,1)
    return np.rint(255*np.where(x<=.0031308,12.92*x,1.055*x**(1/2.4)-.055)).astype('uint8')


def run(tile,cache,out,centers=CENTERS):
    """Single-tile diagnostic uses exactly the production processing rule."""
    cache.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
    items=inventory(tile,cache,centers)
    result=fetch_tile(tile,items,cache,out,centers);print(json.dumps(result),flush=True)
    with np.load(out/(tile+'.npz')) as x:
        rgb=x['rgb'];quality=x['quality'];observations=x['observations'];tr=Affine(*x['transform'][:6]);crs=str(x['crs'])
    rgba=np.concatenate([encode(rgb).transpose(1,2,0),(quality>0)[...,None].astype('uint8')*255],axis=-1)
    Image.fromarray(rgba).save(out/f'{tile}-q2-1km.png')
    # A fixed, unchanged diagnostic region permits direct before/after comparison.
    region=np.full((3,1000,700),np.nan,dtype='float32')
    reproject(rgb,region,src_transform=tr,src_crs=crs,src_nodata=np.nan,
              dst_transform=from_bounds(103,21,110,31,700,1000),dst_crs='EPSG:4326',
              dst_nodata=np.nan,resampling=Resampling.bilinear)
    rgba=np.concatenate([encode(region).transpose(1,2,0),np.isfinite(region[0])[...,None].astype('uint8')*255],axis=-1)
    Image.fromarray(rgba).save(out/f'{tile}-guizhou-region.png')
    points=[]
    for lon,lat in [(106.5,28),(107.5,26),(106,26),(106,24)]:
        xx,yy=transform_coordinates('EPSG:4326',crs,[lon],[lat]);col,row=(~tr)*(xx[0],yy[0]);row,col=int(row),int(col)
        if not (0<=row<rgb.shape[1] and 0<=col<rgb.shape[2]): continue
        points.append(dict(lon=lon,lat=lat,reflectance=None if quality[row,col]==0 else rgb[:,row,col].tolist(),
                           quality=int(quality[row,col]),validDates=int(observations[row,col])))
    diagnostics=dict(tile=tile,processingRule=COMPOSITE_RULE,points=points,
              outputMissingFraction=float((quality==0).mean()),qualityCounts=np.bincount(quality.ravel(),minlength=3).tolist())
    (out/f'{tile}-diagnostics.json').write_text(json.dumps(diagnostics,indent=2));print(json.dumps(diagnostics,indent=2),flush=True)


def global_inventory(cache, centers):
    """Public metadata only; preserve exact acquisition windows and source URLs."""
    dest=cache/f'global-{len(centers)}dates-inventory.json'
    if dest.exists():
        saved=json.loads(dest.read_text())
        if saved['centers']==list(centers): return saved
        raise ValueError('Inventory date rule changed; use a separate cache directory')
    grouped={}
    for center in centers:
        # PC indexes interval items' datetime query against window start, while
        # returned properties.datetime is the ninth (center) day. Validate both.
        window_start=(date.fromisoformat(center)-timedelta(days=8)).isoformat()
        query={'datetime':{'eq':window_start+'T00:00:00Z'}}
        page=get_json(STAC+'/search',dict(collections=COLLECTION,datetime=window_start,
                      query=json.dumps(query),limit=1000))
        found=0
        while True:
            for item in page['features']:
                prop=item['properties']
                if not prop['datetime'].startswith(center):
                    raise ValueError('STAC time semantics changed; refusing unexpected date')
                if not (prop['start_datetime']>='2026-04-01T00:00:00Z' and prop['end_datetime']<'2026-07-01T00:00:00Z'):
                    raise ValueError('Acquisition window extends outside Q2')
                tile=f"h{prop['modis:horizontal-tile']:02d}v{prop['modis:vertical-tile']:02d}"
                grouped.setdefault(tile,{})[center]=item;found+=1
            nxt=next((x for x in page.get('links',[]) if x['rel']=='next'),None)
            if not nxt: break
            page=get_json(nxt['href'])
        print(f'Metadata {center}: {found} tiles',flush=True)
    result=dict(collection=COLLECTION,centers=list(centers),tiles={t:[v[d] for d in centers if d in v] for t,v in sorted(grouped.items())})
    result['missingDates']={t:[d for d in centers if d not in v] for t,v in grouped.items() if len(v)!=len(centers)}
    temp=dest.with_suffix('.part.json');temp.write_text(json.dumps(result));temp.replace(dest)
    return result


COMPOSITE_RULE='spatial-mean-then-temporal-qa-median-v1'

def reduce_native(data):
    rgb=data['rgb'];q=data['quality'];h,w=q.shape
    blocks_rgb=rgb.reshape(3,h//2,2,w//2,2)
    counts=np.isfinite(blocks_rgb).sum(axis=(2,4))
    reduced=np.full((3,h//2,w//2),np.nan,dtype='float32')
    np.divide(np.nansum(blocks_rgb,axis=(2,4)),counts,out=reduced,where=counts>0)
    blocks=q.reshape(h//2,2,w//2,2);coverage=(blocks>0).sum(axis=(1,3)).astype('uint8')
    quality=np.where(coverage>0,np.where((blocks==1).any(axis=(1,3)),1,2),0).astype('uint8')
    return dict(rgb=reduced,quality=quality,coverage=coverage,
                transform=np.array(tuple(Affine(*data['transform'][:6])*Affine.scale(2))),crs=data['crs'])


def compose_blocks(cubes, qualities):
    """Already spatially averaged 1km dates; bound temporary memory by rows."""
    h,w=cubes[0].shape[1:];rgb=np.full((3,h,w),np.nan,dtype='float32')
    quality=np.zeros((h,w),dtype='uint8');counts=np.zeros_like(quality)
    histogram=np.zeros(3,dtype='int64');dates_hist=np.zeros(len(cubes)+1,dtype='int64')
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', RuntimeWarning)
        for row in range(0,h,160):
            end=min(row+160,h)
            stack=np.stack([x[:,row:end] for x in cubes]);q=np.stack([x[row:end] for x in qualities])
            high=np.nanmedian(np.where(q[:,None]==2,stack,np.nan),axis=0)
            fallback=np.nanmedian(stack,axis=0)
            median=np.where(np.isfinite(high),high,fallback)
            selected_quality=np.where(np.isfinite(high[0]),2,np.where(np.isfinite(median[0]),1,0)).astype('uint8')
            count=(q>0).sum(axis=0)
            histogram+=np.bincount(selected_quality.ravel(),minlength=3)
            dates_hist+=np.bincount(count.ravel(),minlength=len(cubes)+1)
            rgb[:,row:end]=median;quality[row:end]=selected_quality;counts[row:end]=count
    return rgb,quality,counts,histogram,dates_hist


def fetch_tile(tile, items, cache, out, centers):
    dest=out/(tile+'.npz');report_path=out/(tile+'.json')
    metadata_hash=hashlib.sha256(json.dumps(items,sort_keys=True).encode()).hexdigest()
    if dest.exists() and report_path.exists():
        report=json.loads(report_path.read_text())
        if report.get('centers')!=list(centers) or report.get('processingRule')!=COMPOSITE_RULE: raise ValueError('Composite date/processing rule mismatch')
        if report.get('sourceMetadataSHA256')!=metadata_hash:
            raise ValueError('Source metadata changed; move the old composite/report aside and rebuild this tile')
        if report.get('sha256')==hashlib.sha256(dest.read_bytes()).hexdigest(): return dict(tile=tile,cached=True,bodyBytes=0)
        raise ValueError('Composite hash mismatch; inspect before rebuilding')
    if not items: raise ValueError('No source dates; do not silently skip')
    started=time.monotonic();cubes=[];qualities=[];transfers=[];reference=None
    for item in items:
        native,transfer=sample_item(item,cache,persist=False)
        data=reduce_native(native);del native
        current=(tuple(data['transform']),str(data['crs']))
        if reference is None: reference=current
        if current!=reference: raise ValueError('Source dates have incompatible grids')
        cubes.append(data['rgb']);qualities.append(data['quality']);transfers.append(transfer)
    rgb,quality,observations,histogram,dates_hist=compose_blocks(cubes,qualities)
    tr=Affine(*reference[0][:6])
    temp=dest.with_suffix('.part.npz');np.savez_compressed(temp,rgb=rgb,quality=quality,observations=observations,
          transform=np.array(tuple(tr)),crs=np.array(reference[1]));temp.replace(dest)
    report=dict(tile=tile,centers=list(centers),processingRule=COMPOSITE_RULE,
          unavailableDates=[d for d in centers if not any(i['properties']['datetime'].startswith(d) for i in items)],sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),
          sourceWindows=[dict(id=i['id'],center=i['properties']['datetime'],start=i['properties']['start_datetime'],end=i['properties']['end_datetime']) for i in items],
          sourceMetadataSHA256=metadata_hash,transfers=transfers,
          bodyBytes=sum(t['bodyBytes'] for t in transfers),elapsedSeconds=time.monotonic()-started,
          outputQualityCounts=histogram.tolist(),outputValidDatesCounts=dates_hist.tolist(),
          rule='Each date: native RGB valid and QA<=1 filter, linear 2x2 valid-pixel mean, any magnitude contribution marks lower QA; then 1km temporal median of full-QA dates, otherwise magnitude-QA median; no geographic/color balancing')
    temp=report_path.with_suffix('.part.json');temp.write_text(json.dumps(report,indent=2));temp.replace(report_path)
    return dict(tile=tile,cached=False,bodyBytes=report['bodyBytes'],elapsedSeconds=report['elapsedSeconds'],qualityCounts=report['outputQualityCounts'])


def fetch(cache,out,centers,tiles=None,workers=4,metadata_only=False):
    global _ASSET_POOL
    cache.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
    inventory=global_inventory(cache,centers)
    summary=dict(collection=COLLECTION,source='NASA MODIS MCD43A4.061 NBAR via Microsoft Planetary Computer',
         sourceUrl='https://planetarycomputer.microsoft.com/dataset/modis-43A4-061',
         centers=list(centers),tiles=sorted(inventory['tiles']),missingDates=inventory['missingDates'],
         metadataFile=str(cache/f'global-{len(centers)}dates-inventory.json'),
         qualityCodes={'0':'missing','1':'contains magnitude inversion fallback','2':'all contributing pixels full BRDF inversion'},
         sampling='Fixed dates; complete 16-day acquisition windows strictly within 2026 Q2; RGB bands 1,4,3',
         processingRule=COMPOSITE_RULE,compositing='Per-date native QA filtering then linear 2x2 mean (any magnitude contribution marks lower QA); temporal median prefers full-QA 1km dates, otherwise magnitude-QA dates; no color adjustments')
    (out/'inventory.json').write_text(json.dumps(summary,indent=2))
    if metadata_only: return
    chosen=tiles or list(inventory['tiles']);errors={};started=time.monotonic();total=0
    with ThreadPoolExecutor(max_workers=workers*6) as assets, ThreadPoolExecutor(max_workers=workers) as pool:
        _ASSET_POOL=assets
        jobs={pool.submit(fetch_tile,t,inventory['tiles'][t],cache,out,centers):t for t in chosen}
        for done,future in enumerate(as_completed(jobs),1):
            tile=jobs[future]
            try:
                result=future.result();total+=result['bodyBytes'];print(json.dumps(result),flush=True)
            except Exception as exc:
                errors[tile]=str(exc).split('?')[0];print(f'FAILED {tile}: {errors[tile]}',flush=True)
            print(f'{done}/{len(chosen)}; {total/1e6:.1f} MB; {time.monotonic()-started:.1f}s',flush=True)
    _ASSET_POOL=None
    (out/'fetch-report.json').write_text(json.dumps(dict(centers=list(centers),requestedTiles=chosen,errors=errors,
              downloadedBytes=total,elapsedSeconds=time.monotonic()-started),indent=2))
    if errors: raise RuntimeError(f'{len(errors)} tiles failed; rerun resumes verified completed tiles')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cadence',choices=['monthly','8day'],default='monthly');p.add_argument('--tile',default='h27v06')
    p.add_argument('--cache',type=Path,default=CACHE);p.add_argument('--out',type=Path,default=Path('/tmp/starorbit-modis-q2-sample'))
    p.add_argument('--fetch',action='store_true');p.add_argument('--inventory-only',action='store_true')
    p.add_argument('--tiles',help='Comma separated fixed validation tiles; omit for full inventory');p.add_argument('--workers',type=int,default=4)
    a=p.parse_args();centers=EIGHT_DAY_CENTERS if a.cadence=='8day' else CENTERS
    if a.fetch or a.inventory_only: fetch(a.cache,a.out,centers,a.tiles.split(',') if a.tiles else None,a.workers,a.inventory_only)
    else: run(a.tile,a.cache,a.out,centers)
