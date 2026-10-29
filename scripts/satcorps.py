"""Download selected compressed GCC fields by HTTP Range; never the full NetCDF.
NASA Langley Cloud and Radiation Research Group: https://satcorps.larc.nasa.gov
Run in a separate process. Temporary scientific chunks are removed on completion.
"""
import io, json, subprocess, tempfile, time, datetime, hashlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from http_download import download_bytes, DownloadError
BASE='https://satcorps.larc.nasa.gov/prod/GCC-GEO-LEO/visst-pixel-netcdf_v2a/'
DAY=86400
FIELDS=('cloud_phase','cloud_optical_depth','relative_time','lat','lon')

def request(url, byte_range=None, limit=2000000, deadline=None):
    budget=min(180,deadline-time.monotonic()) if deadline is not None else 180
    if budget<=0:raise DownloadError('timeout','本次 NASA 检查已到时间上限',retryable=True)
    return download_bytes(url,byte_range=byte_range,limit=limit,timeout=budget,attempt_timeout=75)

# Use daily 12:00 UTC GEO+LEO composites, newest first, inside a rolling
# 30-day window. A product name or a new timestamp does not establish coverage.
MAX_AGE=30*DAY
RETIRED_TIME=1719748800
CHECK_TTL=15*60
CHECK_FIELDS=('updateStatus','checkedAt','checkComplete','cachedCheck','updateMessage','retryable','checkSummary')

class NoQualifiedFrameError(ValueError):
    def __init__(self,message,check):
        super().__init__(message);self.check=check

def load_check(output,previous):
    try:
        value=json.loads((Path(output)/'last-check.json').read_text())
        if value.get('sha256')!=(previous or {}).get('sha256'):return None
        if value.get('updateStatus') not in ('updated','unchanged','partial','unavailable'):return None
        if not isinstance(value.get('checkedAt'),(int,float)) or not 0<value['checkedAt']<1e16:return None
        if not isinstance(value.get('checkComplete'),bool):return None
        return {k:value[k] for k in CHECK_FIELDS if k in value}
    except (OSError,ValueError,TypeError,AttributeError):return None

def recent_check(output,previous,now=None):
    check=load_check(output,previous);now=time.time() if now is None else now
    if previous and check and check['checkComplete'] and check['updateStatus'] in ('updated','unchanged') and 0<=now-check['checkedAt']/1000<CHECK_TTL:
        return {**check,'updateStatus':'unchanged','cachedCheck':True,'updateMessage':'最近 15 分钟已完成检查，沿用该次结果，未重复下载'}
    return None

def save_check(output,result):
    value={k:result[k] for k in (*CHECK_FIELDS,'sha256') if k in result}
    path=Path(output)/'last-check.json';temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(value));temp.replace(path)

def candidates(now):
    day=datetime.datetime.fromtimestamp(now,datetime.timezone.utc).replace(hour=12,minute=0,second=0,microsecond=0)
    if day.timestamp()>now:day-=datetime.timedelta(days=1)
    while day.timestamp()>=now-MAX_AGE:
        stamp=day.timestamp()
        url=BASE+day.strftime('%Y/%m/%d/satcorps-gcc.v02a.geoleo.glob-comp.%Y%j.1200.3km.nc')
        yield stamp,url
        day-=datetime.timedelta(days=1)

def acceptable(info):
    return min(info['footprint'].values())>=.995 and info['coverage']>=.995 and min(info['polarCoverage'].values())>=.99

class RangeFile(io.RawIOBase):
    def __init__(self,url,path,reuse=None,deadline=None):
        self.url=url;self.pos=0;self.blocks=set();self.chunks=set();self.bytes=0;self.reuse=reuse;self.deadline=deadline
        if reuse and reuse.get('url')==url and Path(path).exists():
            self.file=open(path,'r+b');self.size=reuse['size'];self.blocks=reuse['blocks'];self.chunks=reuse['chunks'];return
        self.file=open(path,'w+b')
        # HDF5 v0 superblock provides the EOF address; no 1.3 GB download.
        header=self.download((0,65535),65536)
        if header[:8]!=b'\x89HDF\r\n\x1a\n' or header[8]!=0 or header[13]!=8:raise ValueError('NASA 文件格式已变化')
        self.size=int.from_bytes(header[40:48],'little')
        if not 1000000<self.size<4_000_000_000:raise ValueError('NASA 文件大小无效')
        self.file.truncate(self.size);self.file.seek(0);self.file.write(header);self.blocks.add(0);self.bytes=len(header)
    def download(self,byte_range,limit):
        return request(self.url,byte_range,limit,**({'deadline':self.deadline} if self.deadline is not None else {}))
    def readable(self):return True
    def seekable(self):return True
    def tell(self):return self.pos
    def seek(self,n,w=0):
        self.pos=n if w==0 else self.pos+n if w==1 else self.size+n
        return self.pos
    def readinto(self,b):
        if not len(b):return 0
        end=min(self.pos+len(b),self.size);bs=65536
        for block in range(self.pos//bs,(end-1)//bs+1):
            if block not in self.blocks:
                start=block*bs;stop=min(start+bs,self.size)-1
                data=self.download((start,stop),bs)
                self.file.seek(start);self.file.write(data);self.blocks.add(block);self.bytes+=len(data)
        self.file.seek(self.pos);data=self.file.read(end-self.pos);b[:len(data)]=data;self.pos+=len(data);return len(data)
    def close(self):
        if not self.closed:
            if self.reuse is not None and hasattr(self,'size'):
                self.reuse.update(url=self.url,size=self.size,blocks=self.blocks,chunks=self.chunks)
                self.reuse['downloaded']=self.reuse.get('downloaded',0)+self.bytes
            self.file.close()
        super().close()

def scalar(attrs,name,default):
    import numpy as np
    return np.asarray(attrs.get(name,default)).reshape(-1)[0].item()

def opacity(phase,depth,relative,attrs,reference,now):
    import numpy as np
    clear=(phase==0)|(phase==4);cloud=np.isin(phase,[1,2,6,7])
    fresh=(relative!=-32768)&(np.abs(relative.astype(np.float64))<=12*3600)&(reference+relative.astype(np.float64)<=now+300)
    good_depth=(depth!=scalar(attrs,'_FillValue',65535))
    valid=fresh&(clear|(cloud&good_depth))
    tau=depth.astype(np.float32)*scalar(attrs,'scale_factor',1)+scalar(attrs,'add_offset',0)
    # Effective reflectance of a scattering slab, preserving thick-cloud structure.
    # This is a display opacity derived from retrievals, not an observed RGBA photograph.
    alpha=np.where(cloud&good_depth,tau/(tau+7.7),0)
    return np.rint(np.clip(alpha,0,1)*255).astype('uint8'),valid

def convert(path,reference,now=None):
    import h5py,numpy as np
    from PIL import Image
    now=time.time() if now is None else now
    with h5py.File(path,'r') as f:
        lat=f['lat'][:];lon=f['lon'][:];h,w=len(lat),len(lon)
        if (w,h)!=(12960,6480) or abs(float(lat[0]))<89 or abs(float(lon[0]))<179:raise ValueError('NASA 网格已变化')
        reference_actual=datetime.datetime.fromisoformat(f.attrs['reference_time'].decode().replace('Z','+00:00')).timestamp()
        if reference_actual!=reference or reference>now:raise ValueError('NASA 观测时间无效')
        canvas=np.empty((h,w),np.uint8);valid_map=np.empty((h,w),np.uint8);invalid=0;oldest=now;newest=0;polar={};missing_rows=[];footprint_rows=[]
        for y in range(0,h,540):
            p=f['cloud_phase'][0,y:y+540,:];d=f['cloud_optical_depth'][0,y:y+540,:];r=f['relative_time'][0,y:y+540,:]
            alpha,valid=opacity(p,d,r,f['cloud_optical_depth'].attrs,reference,now)
            invalid+=int((~valid).sum());missing_rows.append((~valid).sum(axis=1));footprint_rows.append(((p!=127)&(r!=-32768)).sum(axis=1))
            if valid.any():oldest=min(oldest,reference+float(r[valid].min()));newest=max(newest,reference+float(r[valid].max()))
            # Missing retrievals stay explicit. Do not fill polar gaps with mirrored clouds.
            alpha[~valid]=0;canvas[y:y+len(alpha)]=alpha;valid_map[y:y+len(alpha)]=valid
        rows=np.concatenate(missing_rows)
        for name,mask in [('north',lat>=67.5),('south',lat<=-67.5)]:polar[name]=1-float(rows[mask].sum())/(int(mask.sum())*w)
        coverage=1-invalid/(w*h)
        footprints=np.concatenate(footprint_rows)
        footprint={'global':float(footprints.sum())/(w*h),'north':float(footprints[lat>=67.5].sum())/(int((lat>=67.5).sum())*w),'south':float(footprints[lat<=-67.5].sum())/(int((lat<=-67.5).sum())*w)}
        if lat[0]<lat[-1]:canvas=canvas[::-1];valid_map=valid_map[::-1]
        if lon[0]>lon[-1]:canvas=canvas[:,::-1];valid_map=valid_map[:,::-1]
        im=Image.fromarray(canvas).resize((8192,4096),Image.Resampling.LANCZOS)
        valid_image=Image.fromarray(valid_map).resize((8192,4096),Image.Resampling.NEAREST)
    return im,valid_image,{'provider':'satcorps','time':int(reference*1000),'observedStart':int(oldest*1000),'observedEnd':int(newest*1000),'coverage':coverage,'polarCoverage':polar,'footprint':footprint,'resolution':'8192×4096','nativeResolution':'12960×6480','channel':'red'}

def fetch_frame(url,path,progress,fields=FIELDS,reuse=None,deadline=None):
    import h5py
    remote=RangeFile(url,path,reuse,deadline)
    try:
        with h5py.File(remote,'r') as f:
            chunks=[]
            for name in fields:
                d=f[name]
                for i in range(d.id.get_num_chunks()):
                    c=d.id.get_chunk_info(i);chunks.append((c.byte_offset,c.size))
            dict(f.attrs)
        total=sum(size for _,size in chunks)
        if total>220_000_000:raise ValueError('NASA 必需字段超过下载预算')
        chunks=[chunk for chunk in chunks if chunk not in remote.chunks]
        def load(chunk):
            offset,size=chunk
            return offset,remote.download((offset,offset+size-1),size)
        # Submit only two chunks at a time; completed chunks cannot accumulate in RAM.
        with ThreadPoolExecutor(max_workers=2) as pool:
            for start in range(0,len(chunks),2):
                for i,(offset,data) in enumerate(pool.map(load,chunks[start:start+2])):
                    progress(f'下载 NASA 云层字段 {start+i+1}/{len(chunks)}')
                    remote.file.seek(offset);remote.file.write(data);remote.bytes+=len(data)
                    remote.chunks.add((offset,len(data)))
        remote.file.flush();return remote.bytes
    finally:remote.close()

def fetch_resuming(url,path,progress,fields=FIELDS,reuse=None,deadline=None):
    # Preserve validated chunks within this job if a later chunk loses its
    # connection. The same deadline still bounds both attempts.
    reuse={} if reuse is None else reuse
    before=reuse.get('downloaded',0)
    for attempt in range(2):
        try:
            received=fetch_frame(url,path,progress,fields,reuse,deadline)
            return reuse.get('downloaded',before+received)-before
        except DownloadError as error:
            if attempt or not error.retryable or not reuse.get('chunks') or (deadline is not None and time.monotonic()+2>=deadline):raise
            progress('连接中断，正在继续未完成的 NASA 分段…')
            time.sleep(2)

def phase_coverage(path):
    """Cheap upper bound: missing/unknown phase cannot yield a valid retrieval."""
    import h5py,numpy as np
    with h5py.File(path,'r') as f:
        lat=f['lat'][:];d=f['cloud_phase']
        if d.shape!=(1,6480,12960) or len(lat)!=6480:raise ValueError('NASA 网格已变化')
        valid=[];present=[]
        for y in range(0,6480,540):
            p=d[0,y:y+540,:]
            valid.append(np.isin(p,[0,1,2,4,6,7]).sum(axis=1));present.append((p!=127).sum(axis=1))
        valid=np.concatenate(valid);present=np.concatenate(present)
        fp={};coverage={}
        for name,rows in [('global',np.ones(len(lat),bool)),('north',lat>=67.5),('south',lat<=-67.5)]:
            fp[name]=float(present[rows].sum())/(int(rows.sum())*12960)
            coverage[name]=float(valid[rows].sum())/(int(rows.sum())*12960)
        return {'coverage':coverage['global'],'polarCoverage':{k:coverage[k] for k in ('north','south')},'footprint':fp}

def cached_frames(output):
    frames=[]
    for p in output.glob('*.json'):
        if p.name=='checks.json':continue
        try:
            info=json.loads(p.read_text());image=p.with_suffix('.png')
            if info.get('provider')!='satcorps' or info.get('time')==RETIRED_TIME*1000:continue
            if acceptable(info) and hashlib.sha256(image.read_bytes()).hexdigest()==info.get('sha256'):
                frames.append({**info,'file':str(image)})
        except (ValueError,KeyError,OSError):continue
    return sorted(frames,key=lambda x:x['time'],reverse=True)

def build(output,progress=lambda s:None,now=None):
    live=now is None;now=time.time() if live else now
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    # Explicit retirement applies only to our old NASA derivative, never GitHub.
    for ext in ('.png','.json'):(output/('20240630T1200-v1a'+ext)).unlink(missing_ok=True)
    checkfile=output/'checks.json'
    try:checks=json.loads(checkfile.read_text())
    except (OSError,ValueError):checks={}
    checks={k:v for k,v in checks.items() if 0<=now-v.get('checked',0)<(CHECK_TTL if v.get('reason')=='not published' else 6*3600)}
    cached=cached_frames(output);previous=cached[0] if cached else None
    recent=recent_check(output,previous,now)
    if recent:return {**previous,**recent}
    errors=0;connection_failures=0;last_error=None;retryable=False;deadline=time.monotonic()+16*60
    summary={'checked':0,'missing':0,'rejected':0,'failed':0}
    def finish(result,status,message):
        if last_error:message+='；'+last_error
        summary['failed']=errors
        check={'updateStatus':'partial' if errors and result else status,'checkedAt':int((time.time() if live else now)*1000),'checkComplete':not errors,'cachedCheck':False,'updateMessage':message,'retryable':retryable,'checkSummary':summary}
        value={**(result or {}),**check};save_check(output,value)
        if not result:raise NoQualifiedFrameError(message,check)
        return value
    for reference,url in candidates(now):
        if previous and previous['time']>=reference*1000:
            return finish(previous,'unchanged','近期候选未发现更新的合格云图，保留已下载云图' if not errors else '部分候选暂不可访问，未能完整确认是否有更新，保留已下载云图')
        if time.monotonic()>deadline:errors+=1;retryable=True;last_error='本次 NASA 检查已到时间上限';break
        summary['checked']+=1
        if url in checks:
            summary['missing' if checks[url].get('reason')=='not published' else 'rejected']+=1;continue
        date=datetime.datetime.fromtimestamp(reference,datetime.timezone.utc).strftime('%Y-%m-%d')
        progress('检查 NASA 全球与极区覆盖 · '+date+' 12:00 UTC')
        try:
            with tempfile.TemporaryDirectory(prefix='tiangong-gcc-') as tmp:
                path=Path(tmp)/'fields.nc';reuse={}
                downloaded=fetch_resuming(url,path,progress,('cloud_phase','lat'),reuse=reuse,deadline=deadline)
                coverage=phase_coverage(path)
                if not acceptable(coverage):
                    summary['rejected']+=1;checks[url]={'checked':now,'reason':'phase coverage',**coverage};checkfile.write_text(json.dumps(checks));continue
                downloaded+=fetch_resuming(url,path,progress,reuse=reuse,deadline=deadline)
                im,mask,info=convert(path,reference,now)
            if not acceptable(info):
                summary['rejected']+=1;checks[url]={'checked':now,'reason':'retrieval coverage'};checkfile.write_text(json.dumps(checks));continue
            # A candidate must still be within the window when conversion finishes.
            if not now-MAX_AGE<=info['time']/1000<=now:raise ValueError('NASA 云图不在最近 30 天内')
            target=output/(datetime.datetime.fromtimestamp(reference,datetime.timezone.utc).strftime('%Y%m%dT1200-v2a.png'))
            temp=target.with_suffix('.tmp');im.save(temp,'PNG',compress_level=4);temp.replace(target)
            info.update(source=url,release='GCC V2A',downloadBytes=downloaded)
            info['sha256']=hashlib.sha256(target.read_bytes()).hexdigest()
            target.with_suffix('.json').write_text(json.dumps(info))
            for p in output.iterdir():
                if p.suffix in ('.png','.json') and p not in (target,target.with_suffix('.json'),checkfile,output/'last-check.json') and (not previous or p.stem!=Path(previous['file']).stem):p.unlink()
            return finish({**info,'file':str(target)},'updated','已找到最近 30 天内覆盖合格的 NASA 全球云图' if not errors else '已下载覆盖合格的 NASA 云图；部分较新候选暂不可访问，未能完整确认最新状态')
        except DownloadError as e:
            if e.status in (404,410):
                summary['missing']+=1;checks[url]={'checked':now,'reason':'not published'};checkfile.write_text(json.dumps(checks));continue
            errors+=1;last_error=str(e);retryable=retryable or e.retryable
            if e.status in (401,403) or (e.status==429 and not e.retryable):retryable=False;break
            if e.code in ('network','tls','timeout') or e.status in (429,500,502,503,504):
                connection_failures+=1
                # A host-wide outage is not a reason to probe all 30 days.
                if connection_failures>=2 or not e.retryable:break
            progress('该候选未通过检查，继续查找 · '+date+' · '+str(e))
        except (RuntimeError,ValueError,OSError,subprocess.TimeoutExpired) as e:
            errors+=1;last_error=str(e);progress('该候选未通过检查，继续查找 · '+date+' · '+str(e))
    if previous:
        return finish(previous,'unchanged','本次未找到最近 30 天内可用的完整云图，保留已下载云图' if not errors else '部分候选暂不可访问，未能完整确认是否有更新，保留已下载云图')
    return finish(None,'unavailable','本次未找到最近 30 天内可用的完整 NASA 云图，原图源保持不变')

if __name__=='__main__':
    import sys
    def progress(s):print(json.dumps({'status':s},ensure_ascii=False),flush=True)
    try:print(json.dumps({'result':build(sys.argv[1],progress)},ensure_ascii=False),flush=True)
    except Exception as e:print(json.dumps({'error':str(e),**getattr(e,'check',{'updateStatus':'unavailable','checkedAt':int(time.time()*1000),'checkComplete':False,'cachedCheck':False})},ensure_ascii=False),flush=True);sys.exit(1)
