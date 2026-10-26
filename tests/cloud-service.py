import os,sys,tempfile,json,hashlib,io
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
 assert restarted.clear() and CloudService(target,old).snapshot()['state']=='idle'
 # Corrupt assets never become the shared last-good frame.
 image.write_bytes(b'corrupt');assert CloudService(Path(temp)/'corrupt',old).image_bytes() is None
 print('NASA restore, restart, running/error availability, digest identity, clear persistence and corruption checks passed')
