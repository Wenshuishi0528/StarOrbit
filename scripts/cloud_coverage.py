"""Bounded, asynchronous SatCORPS observation-coverage estimates before download.

Only compressed cloud_phase / relative_time and latitude fields are fetched.
The optical-depth retrieval and image-quality checks remain part of full import.
"""
import datetime, json, subprocess, tempfile, threading, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from http_download import DownloadError, response_headers
from satcorps import BASE, RangeFile

METHOD = 'phase-time-stratified-v1'
BYTE_LIMIT = 48 * 1024 * 1024
TIME_LIMIT = 150
CACHE_TTL = 24 * 3600
RECENT_TTL = 15 * 60
ERROR_TTL = 5 * 60


def validate_item(item):
    date = datetime.date.fromisoformat(item['date'])
    hour = int(item['slot'])
    if not 0 <= hour <= 23 or date.isoformat() != item['date']:
        raise ValueError('NASA 时次无效')
    stamp = datetime.datetime.combine(date, datetime.time(hour), datetime.timezone.utc).timestamp()
    if stamp > time.time(): raise ValueError('不能检查未来时次')
    source = BASE + date.strftime('%Y/%m/%d/satcorps-gcc.v02a.geoleo.glob-comp.%Y%j.') + f'{hour:02d}00.3km.nc'
    if item.get('source') != source or item.get('key') != f'satcorps:{date}:{hour}':
        raise ValueError('NASA 来源与时次不符')
    return source, stamp


def source_revision(url, deadline=None):
    """Official validators distinguish an upstream replacement at the same URL."""
    remaining = TIME_LIMIT if deadline is None else deadline-time.monotonic()
    if remaining <= 0: raise DownloadError('timeout','NASA 覆盖预核查达到时间上限',retryable=True)
    budget = min(18, remaining)
    result = subprocess.run(['curl','--silent','--show-error','--head','--location',
        '--proto','=https','--proto-redir','=https','--connect-timeout',str(min(8,budget)),'--max-time',str(budget),url],
        capture_output=True, timeout=budget+1)
    status, headers = response_headers(result.stdout.decode(errors='replace'))
    if result.returncode or status != 200:
        raise DownloadError('revision','NASA 源版本暂不可核查',status or None,retryable=True)
    size = headers.get('content-length','')
    revision = {'etag':headers.get('etag',''), 'lastModified':headers.get('last-modified',''),
                'size':int(size) if size.isdigit() else None}
    # With no validator, don't reuse an estimate without sampling again.
    return revision


class BoundedRangeFile(RangeFile):
    def __init__(self, url, path, deadline):
        self.network_bytes = 0; self.requests = 0; self.network_lock = threading.Lock()
        super().__init__(url, path, deadline=deadline)
    def download(self, byte_range, limit):
        expected = byte_range[1] - byte_range[0] + 1
        with self.network_lock:
            if self.network_bytes + expected > BYTE_LIMIT:
                raise DownloadError('budget','NASA 覆盖预核查达到分段预算',retryable=False)
            self.network_bytes += expected; self.requests += 1
        return super().download(byte_range, limit)


def observation_estimate(phase, relative, latitude, reference, now):
    import numpy as np
    valid_phase = np.isin(phase, [0,1,2,4,6,7])
    fresh = (relative != -32768) & (np.abs(relative.astype(np.float64)) <= 43200)
    fresh &= reference + relative.astype(np.float64) <= now + 300
    valid = valid_phase & fresh
    weights = np.maximum(0, np.cos(np.deg2rad(latitude.astype(np.float64))))
    def fraction(rows):
        weight = weights[rows]
        return float((valid[rows].mean(axis=1) * weight).sum() / weight.sum()) if weight.sum() else 0
    coverage = fraction(np.ones(len(latitude), dtype=bool))
    polar = {'north':fraction(latitude >= 67.5), 'south':fraction(latitude <= -67.5)}
    return {'coverage':coverage, 'polarCoverage':polar,
            'classification':'global' if coverage >= .95 and min(polar.values()) >= .85 else 'partial',
            'sampleCount':int(valid.size), 'validSampleCount':int(valid.sum()),
            'weighting':'cos(latitude); regular 1 degree cell-centre samples',
            'globalThreshold':.95, 'polarThreshold':.85}


def probe(item, previous=None):
    import h5py
    import numpy as np
    url, reference = validate_item(item)
    started = time.monotonic(); deadline = started+TIME_LIMIT; revision = source_revision(url, deadline)
    if previous and previous.get('state') == 'ready' and previous.get('method') == METHOD and \
       (revision['etag'] or revision['lastModified']) and previous.get('sourceRevision') == revision:
        return {**previous, 'validatedAt':int(time.time()*1000), 'cached':True}
    remote = None
    with tempfile.TemporaryDirectory(prefix='starorbit-coverage-') as tmp:
        path = Path(tmp)/'sample.nc'
        try:
            remote = BoundedRangeFile(url, path, deadline)
            if revision['size'] is not None and revision['size'] != remote.size:
                raise DownloadError('changed','NASA 源文件仍在更新，稍后重新核查',retryable=True)
            with h5py.File(remote,'r') as data:
                stamp = data.attrs['reference_time']
                if isinstance(stamp,bytes): stamp=stamp.decode()
                actual = datetime.datetime.fromisoformat(str(stamp).replace('Z','+00:00')).timestamp()
                if actual != reference: raise ValueError('NASA 文件观测时间与目录时次不符')
                chunks=[]
                for name in ['cloud_phase','relative_time','lat']:
                    field=data[name]
                    expected=(6480,) if name=='lat' else (1,6480,12960)
                    if field.shape != expected: raise ValueError('NASA 覆盖网格已变化')
                    for index in range(field.id.get_num_chunks()):
                        chunk=field.id.get_chunk_info(index)
                        chunks.append((chunk.byte_offset,chunk.size))
                # This is intentionally not a full NetCDF fetch. Large HDF chunks
                # mean even sparse spatial samples need these compressed fields.
                if sum(size for _,size in chunks)+remote.network_bytes > BYTE_LIMIT:
                    raise DownloadError('budget','NASA 覆盖字段超出预核查预算',retryable=False)
                dict(data['relative_time'].attrs); dict(data['cloud_phase'].attrs)
            def read_chunk(chunk):
                offset,size=chunk
                return offset,remote.download((offset,offset+size-1),size)
            with ThreadPoolExecutor(max_workers=2) as pool:
                for start in range(0,len(chunks),2):
                    for offset,payload in pool.map(read_chunk,chunks[start:start+2]):
                        remote.file.seek(offset);remote.file.write(payload)
            remote.file.flush()
            with h5py.File(path,'r') as data:
                phase=data['cloud_phase'][0,18::36,18::36]
                relative=data['relative_time'][0,18::36,18::36]
                latitude=data['lat'][18::36]
                if not np.isfinite(latitude).all() or min(latitude)>-89 or max(latitude)<89:
                    raise ValueError('NASA 纬度坐标无效')
                result=observation_estimate(phase,relative,latitude,reference,time.time())
            after=source_revision(url, deadline)
            if after != revision: raise DownloadError('changed','NASA 源文件在检查期间更新，稍后重新核查',retryable=True)
            now=int(time.time()*1000)
            return {**result,'state':'ready','estimated':True,'fullVerified':False,
                    'method':METHOD,'metric':'valid-observation','checkedAt':now,'validatedAt':now,
                    'downloadedBytes':remote.network_bytes,'rangeRequests':remote.requests,
                    'durationMs':round((time.monotonic()-started)*1000),'sourceRevision':revision,'cached':False}
        finally:
            if remote is not None: remote.close()


class CoverageService:
    def __init__(self, cache, probe_fn=None):
        self.path=Path(cache)/'coverage-estimates.json'
        self.lock=threading.RLock();self.items={};self.records={};self.queue=[];self.active=None;self.thread=None
        self.probe=probe_fn or probe
        try:
            saved=json.loads(self.path.read_text())
            if saved.get('method')==METHOD:
                self.records={key:value for key,value in saved.get('records',{}).items()
                              if isinstance(value,dict) and value.get('state') in ('ready','error')}
        except (OSError,ValueError,AttributeError): pass
    @staticmethod
    def pending(state):
        return {'state':state,'estimated':True,'fullVerified':False,'method':METHOD,'metric':'valid-observation','classification':'unknown'}
    def fresh(self, item, record):
        if not record: return False
        ttl=ERROR_TTL if record.get('state')=='error' else RECENT_TTL if time.time()-item['time']/1000 < 2*86400 else CACHE_TTL
        stamp=record.get('validatedAt',record.get('checkedAt',0))
        return isinstance(stamp,(int,float)) and 0 <= time.time()-stamp/1000 < ttl
    def submit(self, result, force=False):
        valid=[]
        for item in result.get('items',[]):
            if item.get('provider')!='satcorps':continue
            try:validate_item(item)
            except (ValueError,TypeError,KeyError):continue
            valid.append(item)
        with self.lock:
            keys={item['key'] for item in valid}
            # Prioritize the currently requested directory, not stale background
            # work from a previously selected month. Completed results remain cached.
            self.queue=[key for key in self.queue if key in keys]
            for item in valid:
                key=item['key'];self.items[key]=dict(item)
                if key!=self.active and key not in self.queue and (force or not self.fresh(item,self.records.get(key))):
                    self.queue.append(key)
            def priority(key):
                item=self.items[key];hour=int(item['slot'])
                return (0 if hour==12 else 1 if hour==0 else 2 if hour in (6,18) else 3,-item['time'])
            self.queue.sort(key=priority);self.queue=self.queue[:96]
            if self.queue and (self.thread is None or not self.thread.is_alive()):
                self.thread=threading.Thread(target=self.run,daemon=True,name='cloud-coverage');self.thread.start()
            enriched=[]
            for item in result.get('items',[]):
                enriched.append({**item,**({'coverageCheck':self.record(item['key'])} if item.get('key') in keys else {})})
            return {**result,'items':enriched,'coverageStatus':self.counts(keys)}
    def record(self,key):
        if key==self.active:return self.pending('running')
        if key in self.queue:return self.pending('queued')
        return self.records.get(key,self.pending('queued'))
    def counts(self,keys):
        states=[self.record(key)['state'] for key in keys]
        return {'pending':states.count('queued'),'running':states.count('running'),'ready':states.count('ready'),'error':states.count('error')}
    def snapshot(self,month,date=None):
        from cloud_versions import month_value
        month_value(month)
        if date and (datetime.date.fromisoformat(date).isoformat()!=date or not date.startswith(month+'-')):
            raise ValueError('日期不在所选月份')
        with self.lock:
            keys=[key for key,item in self.items.items() if item['date'].startswith(month+'-') and (not date or item['date']==date)]
            return {'items':[{'key':key,'coverageCheck':self.record(key)} for key in keys],'coverageStatus':self.counts(keys)}
    def save(self):
        self.path.parent.mkdir(parents=True,exist_ok=True)
        records=dict(sorted(self.records.items(),key=lambda pair:pair[1].get('checkedAt',0),reverse=True)[:2048])
        temporary=self.path.with_suffix('.tmp');temporary.write_text(json.dumps({'method':METHOD,'records':records}));temporary.replace(self.path)
    def run(self):
        while True:
            with self.lock:
                if not self.queue:self.active=None;self.thread=None;return
                key=self.queue.pop(0);self.active=key;item=self.items[key];previous=self.records.get(key)
            try:record=self.probe(item,previous)
            except Exception as error:
                record={**self.pending('error'),'checkedAt':int(time.time()*1000),'error':str(error),
                        'retryable':getattr(error,'retryable',True)}
            with self.lock:
                self.records[key]=record;self.active=None
                try:self.save()
                except OSError:pass

_services={};_services_lock=threading.Lock()
def coverage_service(cache):
    key=str(Path(cache).resolve())
    with _services_lock:
        if key not in _services:_services[key]=CoverageService(cache)
        return _services[key]
