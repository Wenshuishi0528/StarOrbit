#!/usr/bin/env python3
"""Prepare compact Mars maps from NASA/ASU/USGS science products, not artwork.
Requires requests, numpy, Pillow, pyproj, rasterio, pyshp. Download cache stays in
output/mars-source (not shipped). Run from repository root. All exported maps
have east longitude -180..180 left-to-right and planetocentric +90..-90 top-to-bottom.
"""
from pathlib import Path
import concurrent.futures, gzip, hashlib, json, io, zipfile
import requests
import numpy as np
from PIL import Image
from pyproj import CRS, Transformer
import rasterio.features
from rasterio.transform import from_bounds
import shapefile

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'output/mars-source'; OUT=ROOT/'assets/mars'
CACHE.mkdir(parents=True,exist_ok=True); OUT.mkdir(parents=True,exist_ok=True)
WMS='https://planetarymaps.usgs.gov/cgi-bin/mapserv'
GIS='https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Tanaka_et_al_2014_Mars_Global_Map_Features/FeatureServer/3'
PDS='https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/'
NAMES='https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip'

def fetch(name,url,params=None):
    path=CACHE/name
    if not path.exists():
        response=requests.get(url,params=params,timeout=180); response.raise_for_status()
        path.write_bytes(response.content)
        (CACHE/(name+'.request.txt')).write_text(response.url)
    return path

def metadata(path):
    data=path.read_bytes()
    return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}

def source_record(name,url):
    path=CACHE/name
    request=CACHE/(name+'.request.txt')
    return {'file':name,'url':request.read_text() if request.exists() else url,**metadata(path)}

def download():
    tasks=[('megt90n000cb.img',PDS+'megt90n000cb.img',None),('megt90n000cb.lbl',PDS+'megt90n000cb.lbl',None),('names.zip',NAMES,None),('geology-layer-3.json',GIS,{'f':'json'}),('geology-polygons-original.json',GIS+'/query',dict(f='json',where='1=1',outFields='Unit,UnitDesc,UnitGroup',returnGeometry='true',maxAllowableOffset=0,resultRecordCount=2000))]
    for layer in ['MDIM21_color','THEMIS','THEMIS_night']:
        tasks.append((layer+'.png',WMS,dict(map='/maps/mars/mars_simp_cyl.map',SERVICE='WMS',VERSION='1.1.1',REQUEST='GetMap',LAYERS=layer,STYLES='',SRS='EPSG:4326',BBOX='-180,-90,180,90',WIDTH=2048,HEIGHT=1024,FORMAT='image/png',TRANSPARENT='TRUE')))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda t:fetch(*t),tasks))
    return [source_record(name,url) for name,url,_ in tasks]

def rasters():
    Image.open(CACHE/'MDIM21_color.png').convert('RGB').save(OUT/'visible.jpg',quality=85,optimize=True,subsampling=0)
    # Preserve measured mosaic intensity, no invented temperature scale or false colour.
    for source,name in [('THEMIS','day-ir'),('THEMIS_night','night-ir')]:
        rgba=Image.open(CACHE/(source+'.png')).convert('RGBA')
        rgba.save(OUT/(name+'.webp'),quality=88,method=6)



def terrain():
    label=(CACHE/'megt90n000cb.lbl').read_text()
    for text in ['MSB_INTEGER','1440','720','METER','PLANETOCENTRIC']:
        assert text in label
    raw=np.frombuffer((CACHE/'megt90n000cb.img').read_bytes(),dtype='>i2').reshape(720,1440)
    assert -9000<raw.min()<-7000 and 19000<raw.max()<22000
    # Original 0..360E. Half-turn permutation and 2x2 area average, not invented relief.
    height=np.roll(raw,720,axis=1).astype('float64').reshape(360,2,720,2).mean(axis=(1,3))
    height=np.rint(height).astype('<i2')
    (OUT/'mola-height.i16.gz').write_bytes(gzip.compress(height.tobytes(),compresslevel=9,mtime=0))
    # A separate topographic colour layer. Colours denote metres above the MOLA areoid.
    stops=np.array([-8200,-6000,-4000,-2000,0,2000,5000,10000,16000,22000],float)
    colours=np.array([[20,30,90],[38,86,154],[49,141,181],[87,186,176],[189,206,122],[228,181,93],[205,115,67],[162,76,72],[210,181,167],[255,255,255]])
    rgb=np.stack([np.interp(height,stops,colours[:,i]) for i in range(3)],axis=-1).astype('uint8')
    # Native 0.5° raster; no claim of high-resolution terrain.
    Image.fromarray(rgb).save(OUT/'elevation.jpg',quality=90,optimize=True,subsampling=0)
    return {'url':'assets/mars/mola-height.i16.gz','width':720,'height':360,'scaleMeters':1,'offsetMeters':0,'encoding':'int16-le-gzip','pixelRegistration':'cell-centre','longitudeRange':[-180,180],'latitudeRange':[90,-90],'noData':None,'reference':'MOLA GMM3 areoid','sourceResolutionDeg':0.25,'resolutionDeg':0.5,'minMeters':int(height.min()),'maxMeters':int(height.max()),'credit':'NASA/GSFC · MGS MOLA MEGDR v2','sourceUrl':PDS+'megt90n000cb.lbl','colorLegend':[{'meters':int(v),'color':'#'+''.join(f'{c:02x}' for c in rgb)} for v,rgb in zip(stops,colours)]}


def geology():
    doc=json.loads((CACHE/'geology-polygons-original.json').read_text())
    meta=json.loads((CACHE/'geology-layer-3.json').read_text())
    assert len(doc['features'])==1311 and not doc.get('exceededTransferLimit')
    info=meta['drawingInfo']['renderer']['uniqueValueInfos']
    classes={row['value']:i+1 for i,row in enumerate(info)}
    # Preserve the Mars sphere: invert actual Robinson GIS coordinates into their
    # native GCS_Mars_2000_Sphere, never a WGS84 terrestrial datum transformation.
    crs=CRS.from_wkt(doc['spatialReference']['wkt'])
    inverse=Transformer.from_crs(crs,crs.geodetic_crs,always_xy=True)
    forward=Transformer.from_crs(crs.geodetic_crs,crs,always_xy=True)
    pole_y=forward.transform(0,90)[1]
    polys=[]
    for feature in doc['features']:
        rings=feature['geometry']['rings']
        points=[]; parts=[]
        for ring in rings:
            parts.append(len(points)); points.extend(ring)
        shp=shapefile.Shape(shapefile.POLYGON, points=points, parts=parts)
        # pyshp correctly groups outer rings and their holes in multipart polygons.
        geom=shp.__geo_interface__
        def convert_ring(ring):
            xy=np.asarray(ring)
            # Robinson is separable: latitude depends only on y, and x is linear
            # in longitude for a fixed latitude. GIS boundary rounding pushes some
            # x coordinates just beyond ±180°, where PROJ inverse returns infinity.
            # Invert y on the central meridian, then recover longitude using x at
            # 180° for that latitude. Clip only numerical map-edge overshoots.
            y=np.clip(xy[:,1],-pole_y,pole_y)
            _,lat=inverse.transform(np.zeros(len(y)),y)
            x180,_=forward.transform(np.full(len(y),180.),lat)
            lon=180*xy[:,0]/x180
            assert np.isfinite(lon).all() and np.isfinite(lat).all()
            return np.stack([np.clip(lon,-180,180),np.clip(lat,-90,90)],axis=1).tolist()
        parts=[geom['coordinates']] if geom['type']=='Polygon' else geom['coordinates']
        for part in parts:
            transformed=[convert_ring(ring) for ring in part]
            # Dateline borders already split by the source Robinson map boundary.
            polys.append(({'type':'Polygon','coordinates':transformed},classes[feature['attributes']['Unit']]))
    raster=rasterio.features.rasterize(polys,out_shape=(1024,2048),transform=from_bounds(-180,-90,180,90,2048,1024),fill=0,dtype='uint8')
    print('GIS coverage:',np.count_nonzero(raster)/raster.size)
    assert np.count_nonzero(raster)/raster.size>.999, 'Unexpected GIS coverage gap'
    Image.fromarray((raster>0).astype('uint8')*255).save(CACHE/'geology-coverage.png')
    palette=[0,0,0]+[c for row in info for c in row['symbol']['color'][:3]]
    palette += [0]*(768-len(palette))
    image=Image.fromarray(raster,'P');image.putpalette(palette);image.save(OUT/'geology.png',transparency=0,optimize=True)
    legend=[{'id':row['value'],'label':row['label'],'color':'#'+''.join(f'{c:02x}' for c in row['symbol']['color'][:3])} for row in info]
    (OUT/'geology-legend.json').write_text(json.dumps({'sourceUrl':'https://pubs.usgs.gov/sim/3292/','units':legend},ensure_ascii=False,indent=2)+'\n')
    return len(info)


def main():
    sources=download();rasters();dem=terrain();classes=geology()
    layer_data=[
        ('visible','可见光 · Viking','visible.jpg','NASA/USGS · Viking MDIM 2.1 / NASA Ames 着色','https://mars.asu.edu/data/mdim_color/','visible','Viking 可见光镶嵌，经 MOLA 控制网配准并着色。'),
        ('dayIR','白昼热红外 · THEMIS','day-ir.webp','NASA/JPL/ASU · THEMIS 日间全球镶嵌 v12 (2014)','https://mars.asu.edu/data/thm_dir/','infrared','白昼热红外历史镶嵌；灰度呈现热辐射强度与地形纹理。'),
        ('nightIR','夜间热红外 · THEMIS','night-ir.webp','NASA/JPL/ASU/USGS · THEMIS 夜间控制镶嵌 (2018)','https://mars.asu.edu/data/themis_nightir/','infrared','夜间热红外历史镶嵌；覆盖约南北纬65°以内，透明区域为未覆盖。'),
        ('elevation','高程 · MOLA','elevation.jpg','NASA/GSFC · MGS MOLA MEGDR v2',PDS+'megt90n000cb.lbl','elevation','相对火星参考等位面（areoid）的实测高程，单位米。'),
        ('geology','全球地质 · USGS','geology.png','USGS · Tanaka et al. 2014 · SIM 3292','https://pubs.usgs.gov/sim/3292/','geology','由全球地质 GIS 的 Robinson 投影反投影至经纬网，保留官方地质单元配色。'),
    ]
    layers={}
    for id,label,file,credit,url,kind,description in layer_data:
        im=Image.open(OUT/file)
        layers[id]={'url':'assets/mars/'+file,'label':label,'credit':credit,'sourceUrl':url,'kind':kind,'description':description,'width':im.width,'height':im.height,**metadata(OUT/file)}
    layers['nightIR']['coverageLatitude']=[-65,65]
    layers['nightIR']['noData']='transparent'
    layers['dayIR']['noData']='transparent'
    layers['geology']['legendUrl']='assets/mars/geology-legend.json'
    manifest={'schemaVersion':1,'body':'Mars','coordinateSystem':'IAU Mars 2000 planetocentric; east-positive longitude','projection':'equirectangular','longitudeRange':[-180,180],'latitudeRange':[90,-90],'pixelRegistration':'cell-centre','layers':layers,'terrain':{**dem,**metadata(OUT/'mola-height.i16.gz')},'sources':sources,'geologyPolygonCount':1311,'geologyUnitCount':classes}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('Mars assets bytes:',sum(p.stat().st_size for p in OUT.iterdir() if p.is_file()))

if __name__=='__main__': main()
