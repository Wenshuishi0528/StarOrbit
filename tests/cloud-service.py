import os,sys,tempfile,json,hashlib,io,time,types
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
with tempfile.TemporaryDirectory() as temp:
 os.environ['TIANGONG_CLOUD_CACHE']=str(Path(temp)/'default')
 from cloud_service import CloudService
 old=Path(temp)/'legacy';old.mkdir();image=old/'frame.png';image.write_bytes(b'verified asset')
 meta={'provider':'satcorps','time':1792497600000,'coverage':1,'polarCoverage':{'north':1,'south':1},'footprint':{'global':1,'north':1,'south':1},'sha256':hashlib.sha256(image.read_bytes()).hexdigest()};image.with_suffix('.json').write_text(json.dumps(meta))
 target=Path(temp)/'shared';service=CloudService(target,old)
 assert service.snapshot()['state']=='ready' and service.image_bytes()==image.read_bytes()
 restarted=CloudService(target,old);assert restarted.snapshot()['result']==meta
 restarted.state={'state':'running','status':'updating'}
 assert restarted.image_bytes(meta['sha256'])==image.read_bytes() and restarted.image_bytes('wrong') is None
 assert restarted.snapshot()['result']==meta and not restarted.clear()
 class Process:
  stdout=io.StringIO('{"error":"offline"}\n')
  def wait(self):return 1
 process=Process();restarted.process=process;restarted.run(process)
 assert restarted.snapshot()['state']=='error' and restarted.image_bytes()==image.read_bytes()
 assert restarted.snapshot()['updateStatus']=='partial' and restarted.snapshot()['checkComplete'] is False
 assert restarted.snapshot()['result']['checkedAt']==restarted.snapshot()['checkedAt']
 assert restarted.clear() and CloudService(target,old).snapshot()['state']=='idle'
 # Corrupt assets never become the shared last-good frame.
 image.write_bytes(b'corrupt');assert CloudService(Path(temp)/'corrupt',old).image_bytes() is None
 print('NASA restore, restart, running/error availability, digest identity, clear persistence and corruption checks passed')

 from satcorps import build,save_check,candidates,DAY,CHECK_TTL,NoQualifiedFrameError,fetch_frame
 def fixture(folder,reference,name='cached'):
  folder.mkdir(parents=True,exist_ok=True);path=folder/(name+'.png');path.write_bytes(name.encode())
  info={**meta,'time':reference*1000,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
  path.with_suffix('.json').write_text(json.dumps(info));return {**info,'file':str(path)}
 now=time.time();folder=Path(temp)/'recent';frame=fixture(folder,now-DAY)
 checked=int((now-60)*1000);save_check(folder,{**frame,'updateStatus':'updated','checkedAt':checked,'checkComplete':True,'cachedCheck':False})
 recent=CloudService(folder,None)
 with patch('cloud_service.subprocess.Popen') as popen:
  job=recent.start();assert not popen.called
 assert job['state']=='ready' and job['updateStatus']==job['result']['updateStatus']=='unchanged'
 assert job['cachedCheck'] and job['checkComplete'] and job['checkedAt']==job['result']['checkedAt']==checked
 assert job['cache']=={'bytes':sum(p.stat().st_size for p in folder.iterdir()),'count':1}
 with patch('satcorps.fetch_frame',side_effect=AssertionError('TTL must avoid network and conversion')):
  same=build(folder,now=now);assert same['updateStatus']=='unchanged' and same['checkedAt']==checked and same['cachedCheck']
 # An incomplete check is never reused as an assertion that the source is current.
 save_check(folder,{**frame,'updateStatus':'partial','checkedAt':checked,'checkComplete':False,'cachedCheck':False})
 partial=CloudService(folder,None)
 with patch('cloud_service.subprocess.Popen',return_value=Process()) as popen,patch('cloud_service.threading.Thread'):
  first=partial.start();second=partial.start();assert popen.call_count==1
 assert first['state']==second['state']=='running' and first['checkComplete'] is False
 assert first['result']['sha256']==frame['sha256']
 print('NASA successful-check TTL, truthful timestamps, helper cache usage and running-job deduplication passed')

 class Image:
  def save(self,path,*args,**kwargs):Path(path).write_bytes(b'converted cloud')
 clock=1800000000;rows=list(candidates(clock))[:2]
 def good(reference):return {k:v for k,v in {**meta,'time':reference*1000}.items() if k!='sha256'}
 # Fresh successful release: phase bytes are included, later clicks skip transfer.
 folder=Path(temp)/'updated'
 with patch('satcorps.candidates',side_effect=lambda now:iter(rows[:1])),patch('satcorps.fetch_frame',return_value=10) as fetch,patch('satcorps.phase_coverage',return_value=good(rows[0][0])),patch('satcorps.convert',return_value=(Image(),None,good(rows[0][0]))):
  changed=build(folder,now=clock);assert changed['updateStatus']=='updated' and changed['checkComplete'] and changed['downloadBytes']==20
  same=build(folder,now=clock+1);assert same['updateStatus']=='unchanged' and same['cachedCheck'] and same['checkedAt']==changed['checkedAt'];assert fetch.call_count==2
  later=build(folder,now=clock+CHECK_TTL+1);assert later['updateStatus']=='unchanged' and not later['cachedCheck'] and later['checkedAt']==(clock+CHECK_TTL+1)*1000;assert fetch.call_count==2
 # If a more recent candidate failed, a usable older replacement is only a partial check.
 folder=Path(temp)/'partial';previous=fixture(folder,clock-3*DAY)
 with patch('satcorps.candidates',side_effect=lambda now:iter(rows)),patch('satcorps.fetch_frame',side_effect=[RuntimeError('offline'),10,10]),patch('satcorps.phase_coverage',return_value=good(rows[1][0])),patch('satcorps.convert',return_value=(Image(),None,good(rows[1][0]))):
  result=build(folder,now=clock)
 assert result['updateStatus']=='partial' and not result['checkComplete'] and result['time']==rows[1][0]*1000
 assert Path(previous['file']).exists() and len(list(folder.glob('*.png')))==2
 with patch('satcorps.candidates',side_effect=lambda now:iter(rows)),patch('satcorps.fetch_frame',side_effect=RuntimeError('offline')) as fetch:
  result=build(folder,now=clock+1);assert fetch.call_count==1 and result['updateStatus']=='partial' and not result['cachedCheck']
 folder=Path(temp)/'unavailable'
 with patch('satcorps.candidates',return_value=iter(rows[:1])),patch('satcorps.fetch_frame',side_effect=RuntimeError('offline')):
  try:build(folder,now=clock);raise AssertionError('no usable frame must report unavailability')
  except NoQualifiedFrameError as error:assert error.check['updateStatus']=='unavailable' and error.check['checkComplete'] is False
 unavailable=CloudService(folder,None).snapshot();assert unavailable['state']=='error' and unavailable['updateStatus']=='unavailable' and 'result' not in unavailable
 print('NASA updated/unchanged/partial/unavailable outcomes, identical releases and last-good retention passed')

 # Exercise real RangeFile/fetch_frame reuse with synthetic HDF5 chunk locations.
 # This checks bytes and preserved sparse-file content without scientific dependencies.
 offsets={'cloud_phase':131072,'lat':196608,'cloud_optical_depth':262144,'relative_time':327680,'lon':393216}
 class Dataset:
  def __init__(self,offset):self.id=self;self.offset=offset
  def get_num_chunks(self):return 1
  def get_chunk_info(self,index):return types.SimpleNamespace(byte_offset=self.offset,size=8)
 class HDF:
  attrs={}
  def __init__(self,*args):pass
  def __enter__(self):return self
  def __exit__(self,*args):pass
  def __getitem__(self,name):return Dataset(offsets[name])
 header=bytearray(65536);header[:8]=b'\x89HDF\r\n\x1a\n';header[13]=8;header[40:48]=(2000000).to_bytes(8,'little');requests=[]
 def request(url,byte_range,limit):
  requests.append(byte_range)
  return bytes(header) if byte_range==(0,65535) else bytes([byte_range[0]//65536])*(byte_range[1]-byte_range[0]+1)
 path=Path(temp)/'fields.nc';reuse={}
 with patch.dict(sys.modules,{'h5py':types.SimpleNamespace(File=HDF)}),patch('satcorps.request',side_effect=request):
  first=fetch_frame('https://example.invalid/data',path,lambda _:None,('cloud_phase','lat'),reuse=reuse)
  second=fetch_frame('https://example.invalid/data',path,lambda _:None,reuse=reuse)
 assert first==65536+16 and second==24 and len(requests)==6 and len(set(requests))==6
 with path.open('rb') as file:
  for offset in offsets.values():file.seek(offset);assert file.read(8)==bytes([offset//65536])*8
 print('NASA phase screening reuses metadata and compressed chunks; each selected field downloads once')
