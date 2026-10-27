# -*- coding: utf-8 -*-
"""Build the offline globe atlas. Requires Python 3, Shapely and OpenCC.

Natural Earth is pinned to v5.1.2. China's geometry comes directly from the
public Tianditu administrative-division viewer, including its offshore marks.
The captured official response is retained so rebuilds never silently update it.
"""
from pathlib import Path
import argparse, gzip, hashlib, json, math, struct, urllib.request
from shapely.geometry import shape, mapping, Point, LineString
from shapely.ops import unary_union, substring
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/'
CHINA_URL = 'https://cloudcenter.tianditu.gov.cn/api/portal/region/map?gb=156000000&level=2'
CHINA_FILE = ROOT / 'assets/geography/china-tianditu-20261026.bin.gz'
SIMPLIFY = OpenCC('t2s')
RIVERS = {'Amazonas':'亚马孙河','Nile':'尼罗河','Chang Jiang':'长江','Huang':'黄河','Jinsha':'金沙江','Lancang':'澜沧江','Mekong':'湄公河','Mississippi':'密西西比河','Missouri':'密苏里河','Congo':'刚果河','Danube':'多瑙河','Donau':'多瑙河','Volga':'伏尔加河','Lena':'勒拿河','Yenisey':'叶尼塞河','Yenisei':'叶尼塞河','Ob':'鄂毕河','Ob’':'鄂毕河','Amur':'黑龙江','Heilong Jiang':'黑龙江','Indus':'印度河','Ganges':'恒河','Brahmaputra':'布拉马普特拉河','Yarlung Zangbo':'雅鲁藏布江','Irtysh':'额尔齐斯河','Ertix':'额尔齐斯河','Ertis':'额尔齐斯河','Niger':'尼日尔河','Zambezi':'赞比西河','Mackenzie':'麦肯齐河','Yukon':'育空河','Columbia':'哥伦比亚河','Colorado':'科罗拉多河','Murray':'墨累河','Darling':'达令河','Paraná':'巴拉那河','Parana':'巴拉那河','Orinoco':'奥里诺科河','Rhine':'莱茵河','Rhein':'莱茵河','Seine':'塞纳河','Thames':'泰晤士河','Euphrates':'幼发拉底河','Al Furat':'幼发拉底河','Firat':'幼发拉底河','Tigris':'底格里斯河','Ayeyarwady':'伊洛瓦底江','Salween':'萨尔温江','Nu Jiang':'怒江','Pearl':'珠江','Xi Jiang':'西江','Songhua':'松花江','Songhua Jiang':'松花江','Ural':'乌拉尔河','Dnieper':'第聂伯河','Don':'顿河','Tocantins':'托坎廷斯河','São Francisco':'圣弗朗西斯科河','Sao Francisco':'圣弗朗西斯科河','Rio Grande':'格兰德河','Orange':'奥兰治河','Limpopo':'林波波河','Angara':'安加拉河','Madeira':'马德拉河','Tapajós':'塔帕若斯河','Tapajos':'塔帕若斯河','Xingu':'欣古河','Negro':'内格罗河','Purus':'普鲁斯河','Juruá':'茹鲁阿河','Jurua':'茹鲁阿河','Ubangi':'乌班吉河','Kasai':'开赛河','Lualaba':'卢阿拉巴河','El Bahr el Azraq':'青尼罗河','Abay':'青尼罗河','El Bahr el Abyad':'白尼罗河','Bahr el Jebel':'白尼罗河','Sutlej':'萨特莱杰河','Chenab':'杰纳布河','Yellow':'黄河'}
ALIASES = {'Beijing':'北京','Plateau of Tibet':'青藏高原','Tibetan Plateau':'青藏高原','Himalayas':'喜马拉雅山脉','Mount Everest':'珠穆朗玛峰','Everest':'珠穆朗玛峰','South China Sea':'南海','East China Sea':'东海','Yellow Sea':'黄海','Qinghai Hu':'青海湖'}

def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n')

def polygons(g):
    if g.geom_type == 'Polygon': return [g]
    return [p for child in getattr(g, 'geoms', []) for p in polygons(child)]

def lines(g):
    if g.geom_type in ('LineString', 'LinearRing'): return [list(g.coords)]
    if g.geom_type == 'Polygon': return [list(g.exterior.coords)] + [list(r.coords) for r in g.interiors]
    return [p for child in getattr(g, 'geoms', []) for p in lines(child)]

def rounded(x):
    if isinstance(x, (list, tuple)): return [rounded(v) for v in x]
    return round(float(x), 4)

def parts(g):
    return [{'box':rounded(p.bounds),'rings':rounded([list(p.exterior.coords)]+[list(r.coords) for r in p.interiors])} for p in polygons(g)]

def label(p, g, kind, key, rank=None):
    en=p.get('name_en') or p.get('name') or p.get('admin')
    if not en: return None
    en=en.title() if en.isupper() else en
    zh=SIMPLIFY.convert(ALIASES.get(en) or p.get('name_zh') or en)
    if g.geom_type=='Point': anchor=g
    elif g.geom_type in ('LineString','MultiLineString'): anchor=max([g] if g.geom_type=='LineString' else g.geoms,key=lambda a:a.length).interpolate(.5,normalized=True)
    else:
        biggest=max(polygons(g),key=lambda a:a.area)
        anchor=biggest.centroid
        if not biggest.covers(anchor): anchor=biggest.representative_point()
    return {'id':key,'kind':kind,'en':en,'zh':zh,**{lang:p['name_'+lang] for lang in ['ru','fr'] if p.get('name_'+lang)},'lon':round(anchor.x,4),'lat':round(anchor.y,4),'rank':rank if rank is not None else min(6,max(0,p.get('scalerank') or 0))}

def city_labels(rows):
    labels=[]
    for p,g in rows:
        if p.get('featurecla') in ['Scientific station','Historic place']:continue
        capital=p.get('adm0cap')==1 and p.get('adm0_a3') not in ['TWN','HKG','MAC']
        scale=p.get('scalerank') or 0
        city_tier=1 if scale<=2 else 2 if scale==3 else 3
        kind='capital' if capital else 'city'
        item=label(p,g,kind,kind+'-'+str(p['ne_id']),max(1,min(5,scale)) if capital else [1,3,4][city_tier-1])
        item['cityTier']=city_tier
        if capital and p.get('adm0_a3')=='CHN':item.update(id='beijing',zh='北京',en='Beijing',ru='Пекин',fr='Pékin',lon=116.4074,lat=39.9042,rank=0,marker='star')
        labels.append(item)
    return labels

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--cache',type=Path,default=Path('/tmp/tiangong-geodata'));ap.add_argument('--cities-only',action='store_true');args=ap.parse_args();args.cache.mkdir(parents=True,exist_ok=True)
    out=ROOT/'assets/geography';out.mkdir(exist_ok=True)
    sources=[]
    def load(name):
        path=args.cache/(name+'.geojson');url=BASE+path.name
        if not path.exists(): path.write_bytes(urllib.request.urlopen(url,timeout=60).read())
        blob=path.read_bytes();sources.append({'url':url,'sha256':hashlib.sha256(blob).hexdigest()})
        return [(dict((k.lower(),v) for k,v in f['properties'].items()),shape(f['geometry'])) for f in json.loads(blob)['features'] if f['geometry']]
    if args.cities_only:
        atlas=json.loads((out/'atlas.json').read_text(encoding='utf-8'))
        cities=city_labels(load('ne_50m_populated_places'))
        first=next(i for i,p in enumerate(atlas['labels']) if p['kind'] in ['capital','city'])
        labels=[p for p in atlas['labels'] if p['kind'] not in ['capital','city']]
        atlas['labels']=labels[:first]+cities+labels[first:]
        atlas['sources']=[sources[0] if p['url']==sources[0]['url'] else p for p in atlas['sources']]
        dump(out/'atlas.json',atlas)
        print('city anchors',len(cities))
        return
    blob=CHINA_FILE.read_bytes()
    decoded=bytes((v[0]>>2)&255 for v in struct.iter_unpack('>i',gzip.decompress(blob)))
    china_features=json.loads(decoded)['features']
    china=unary_union([shape(f['geometry']) for f in china_features if f['geometry']['type']=='MultiPolygon'])
    assert china.is_valid and china.covers(Point(116.4074,39.9042)) and china.covers(Point(121,24))
    offshore=unary_union([shape(f['geometry']) for f in china_features if f['properties']['gb']=='156990000'])
    frontier=unary_union([shape(f['geometry']) for f in china_features if f['properties']['gb']=='156970000'])
    # The official viewer interrupts this section with a dashed overlay. Keep
    # that distinction rather than turning the polygon closure into a solid line.
    china_outline=lines(china.boundary.difference(frontier.buffer(.002)))
    for path in lines(frontier):
        line=LineString(path)
        for i in range(math.ceil(line.length/.16)):
            piece=substring(line,i*.16,min(line.length,i*.16+.08))
            if piece.geom_type=='LineString':china_outline.extend(lines(piece))
    sources.append({'url':CHINA_URL,'page':'https://cloudcenter.tianditu.gov.cn/administrativeDivision','provider':'国家基础地理信息中心 · 天地图','captured':'2026-10-26','sha256':hashlib.sha256(blob).hexdigest(),'coordinateSystem':'geographic longitude/latitude, degrees','content':'34 provincial polygons dissolved to national outline; interrupted frontier (156970000) and original offshore line segments (156990000)'})
    labels=[];countries=[];regions=[];world_lines=[];river_lines=[];lake_lines=[]
    rows=load('ne_50m_admin_0_countries');ne_china=unary_union([g for p,g in rows if p['adm0_a3'] in ['CHN','TWN','HKG','MAC']]);china_zone=unary_union([china,ne_china]).buffer(.35)
    for p,g in rows:
        code=p['adm0_a3']
        if code in ['TWN','HKG','MAC']:continue
        if code=='CHN':g=china;p.update(name_en='China',name_zh='中国')
        else:
            # Remove conflicting duplicate outlines around the official China layer.
            world_lines.extend(lines(g.boundary.difference(china_zone).simplify(.035)))
            g=g.difference(china)
        if g.is_empty:continue
        item=label(p,g,'country','country-'+code, max(0,min(5,(p.get('labelrank') or 3)-1)))
        labels.append(item);countries.append({**item,'parts':parts(g.simplify(.018,preserve_topology=True))})
    labels.extend(city_labels(load('ne_50m_populated_places')))
    for name,kind in [('geography_marine_polys','marine'),('geography_regions_polys','landform'),('lakes','lake')]:
        for i,(p,g) in enumerate(load('ne_50m_'+name)):
            if kind=='landform' and p.get('featurecla') not in ['Range/mtn','Plateau','Desert','Basin','Plain','Valley','Lowland','Geoarea']:continue
            if (p.get('scalerank') or 0)>4:continue
            item=label(p,g,kind,kind+'-'+str(i))
            if not item:continue
            if kind=='lake':item['rank']=min(6,max(0,p.get('min_zoom') or 1))
            labels.append(item);regions.append({**item,'area':round(g.area,5),'parts':parts(g.simplify(.025,preserve_topology=True))})
            if kind=='lake':lake_lines.extend(lines(g.simplify(.025)))
    for i,(p,g) in enumerate(load('ne_10m_geography_regions_elevation_points')):
        if (p.get('scalerank') or 0)>2:continue
        item=label(p,g,'landform','peak-'+str(i),3)
        if item:labels.append(item)
    rivers={}
    for p,g in load('ne_50m_rivers_lake_centerlines'):
        en=p.get('name');zh=RIVERS.get(en)
        if not zh or p.get('featurecla')!='River':continue
        rivers.setdefault(zh,[]).append(g)
        river_lines.extend(lines(g.simplify(.025)))
    for i,(zh,gs) in enumerate(rivers.items()):
        g=unary_union(gs);en=next(k for k,v in RIVERS.items() if v==zh)
        labels.append(label({'name':en,'name_zh':zh},g,'river','river-'+str(i),2))
    def lod(paths,tolerance):
        return rounded([list(LineString(p).simplify(tolerance).coords) for p in paths if len(p)>1])
    line_layers={'borders':world_lines,'china':china_outline,'offshore':lines(offshore),'rivers':river_lines,'lakes':lake_lines}
    geometry={key:{'fine':lod(paths,.018),'coarse':lod(paths,.12)} for key,paths in line_layers.items()}
    result={'format':'tiangong-geography-1','sources':sources,'labels':labels,'countries':countries,'regions':regions,'lines':geometry}
    dump(out/'atlas.json',result)
    print('labels',len(labels),'countries',len(countries),'regions',len(regions),'bytes',(out/'atlas.json').stat().st_size)
    print('categories',{k:sum(x['kind']==k for x in labels) for k in {x['kind'] for x in labels}})

if __name__=='__main__':main()
