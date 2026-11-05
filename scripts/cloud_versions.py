"""Small official directory listings and local metadata; never download cloud fields."""
import datetime, hashlib, io, json, re, threading, time, math
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from satcorps import BASE
from http_download import download_bytes

class Links(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.links=[]; self.feed(text)
    def handle_starttag(self, tag, attrs):
        if tag=='a': self.links.extend(v for k,v in attrs if k=='href' and v)

def directory(path):
    return Links(download_bytes(path,limit=1000000,timeout=25,attempt_timeout=12).decode(errors='replace')).links

def month_value(month):
    if not re.fullmatch(r'\d{4}-\d{2}',month): raise ValueError('请选择有效月份')
    value=datetime.date.fromisoformat(month+'-01')
    if value>datetime.datetime.now(datetime.timezone.utc).date(): raise ValueError('不能选择未来月份')
    return value

def day_items(date):
    dt=datetime.date.fromisoformat(date); root=BASE+dt.strftime('%Y/%m/%d/')
    pattern=re.compile(r'satcorps-gcc\.v02a\.geoleo\.glob-comp\.(\d{7})\.(\d{2})00\.3km\.nc$')
    out=[]
    for href in directory(root):
        url=urljoin(root,href); p=urlparse(url); match=pattern.fullmatch(p.path.rsplit('/',1)[-1])
        if not match or not url.startswith(root) or p.query or p.fragment: continue
        if match[1]!=dt.strftime('%Y%j') or int(match[2])>23: continue
        timestamp=datetime.datetime.combine(dt,datetime.time(int(match[2])),datetime.timezone.utc).timestamp()
        if timestamp>time.time(): continue
        out.append({'provider':'satcorps','date':date,'slot':str(int(match[2])),'time':int(timestamp*1000),
                    'key':'satcorps:'+date+':'+str(int(match[2])),'source':url,'release':'GCC V2A','remote':True})
    return sorted({v['key']:v for v in out}.values(),key=lambda x:x['time'],reverse=True)

_cache={}; _lock=threading.Lock()
def catalog(month,date=None,force=False):
    month_value(month)
    if date and (datetime.date.fromisoformat(date).isoformat()!=date or not date.startswith(month+'-')): raise ValueError('日期不在所选月份')
    key=(month,date);now=time.time()
    with _lock:
        if key in _cache and now-_cache[key][0]<300 and not force: return {**_cache[key][1],'cached':True}
    root=BASE+month.replace('-','/')+'/'
    days=sorted({urlparse(urljoin(root,h)).path.rstrip('/').rsplit('/',1)[-1] for h in directory(root)
                 if urljoin(root,h).startswith(root) and re.fullmatch(r'\d{2}',urlparse(urljoin(root,h)).path.rstrip('/').rsplit('/',1)[-1])},reverse=True)
    dates=[]
    for day in days:
        try:
            d=datetime.date.fromisoformat(month+'-'+day)
            if d<=datetime.datetime.now(datetime.timezone.utc).date(): dates.append(d.isoformat())
        except ValueError: continue
    if date and date not in dates: return {'items':[],'dates':dates,'checkedAt':int(now*1000),'message':'目录没有此日期'}
    chosen=[date] if date else dates[:3];items=[];errors=[]
    # At most three small HTML directories; no scientific fields or image decoding.
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures={d:pool.submit(day_items,d) for d in chosen}
        for d,f in futures.items():
            try:items.extend(f.result())
            except Exception:errors.append(d)
    result={'items':items,'dates':dates,'checkedAt':int(now*1000),'cached':False,
            'message':('列出最近三个目录日期；可用日期中选择更早版本。' if not date else '已列出所选日期的发布时次。')+('部分日期目录暂不可读：'+', '.join(errors) if errors else '')}
    with _lock:
        if len(_cache)>32:_cache.clear()
        if not errors:_cache[key]=(now,result)
    return result

def library(cache):
    result=[]
    for path in Path(cache).glob('*.json'):
        try:
            meta=json.loads(path.read_text()); image=path.with_suffix('.png')
            if meta.get('provider')!='satcorps' or not image.is_file():continue
            timestamp=meta.get('time')
            if not isinstance(timestamp,(int,float)) or not 0<timestamp<8640000000000000 or not math.isfinite(timestamp):continue
            if not isinstance(meta.get('sha256'),str) or not re.fullmatch(r'[a-f0-9]{64}',meta['sha256']):continue
            result.append({**meta,'disk':image.name,'size':image.stat().st_size})
        except (ValueError,OSError,AttributeError):continue
    return result

def known_checks(result,cache):
    try:checks=json.loads((Path(cache)/'checks.json').read_text())
    except (ValueError,OSError):return result
    if not isinstance(checks,dict):return result
    from cloud_quality import describe_reasons
    items=[]
    for item in result['items']:
        check=checks.get(item.get('source'),{});warnings=[]
        if not isinstance(check,dict):check={}
        if check.get('reason')=='image quality':warnings.append('上次检查提示：'+describe_reasons([x for x in check['details'] if isinstance(x,str)] if isinstance(check.get('details'),list) else []))
        coverage=check.get('coverage')
        if check.get('reason')=='phase coverage' and isinstance(coverage,(int,float)) and 0<=coverage<=1:warnings.append('上次检查有效覆盖 '+str(round(coverage*100,1))+'%；选择下载可重新检查此时次')
        items.append({**item,**({'warnings':warnings} if warnings else {})})
    return {**result,'items':items}

def local_image(cache,name,sha,thumbnail=False):
    if not re.fullmatch(r'[\w-]+\.png',name or ''):return None
    root=Path(cache);path=root/name
    try:
        meta=json.loads(path.with_suffix('.json').read_text());data=path.read_bytes()
        if meta.get('provider')!='satcorps' or sha!=meta.get('sha256') or hashlib.sha256(data).hexdigest()!=sha:return None
        if thumbnail:
            from PIL import Image
            with Image.open(io.BytesIO(data)) as im:
                im.thumbnail((1024,512));out=io.BytesIO();im.save(out,'PNG');return out.getvalue()
        return data
    except (ValueError,OSError,AttributeError):return None
