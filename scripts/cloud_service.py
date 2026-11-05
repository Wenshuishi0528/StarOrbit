"""Shared NASA asset library and one background conversion job."""
import json, subprocess, sys, threading, tempfile, shutil, os, time
from pathlib import Path
from satcorps import cached_frames,load_check,recent_check,CHECK_FIELDS
from cloud_quality import quality_ok,SCHEMA,describe_reasons
LEGACY_CACHE=Path(tempfile.gettempdir())/'tiangong-satcorps-cache'
CACHE=Path(os.environ.get('TIANGONG_CLOUD_CACHE',Path.home()/'Library/Application Support/Tiangong Orbit Simulator/clouds'))
class CloudService:
 def __init__(self,cache=CACHE,legacy=LEGACY_CACHE):
  self.cache=Path(cache);self.lock=threading.Lock();self.state={'state':'idle'};self.process=None;self.image=None;self.result=None;self.check={}
  self.cache.mkdir(parents=True,exist_ok=True)
  frames=cached_frames(self.cache)
  if not frames and not (self.cache/'migration-complete').exists() and legacy and Path(legacy)!=self.cache:
   old=cached_frames(Path(legacy))
   if old:
    source=Path(old[0]['file'])
    for p in (source,source.with_suffix('.json')):shutil.copy2(p,self.cache/p.name)
    frames=cached_frames(self.cache)
   (self.cache/'migration-complete').touch()
  if frames:self.publish(frames[0]);self.state={'state':'ready'}
  self.check=load_check(self.cache,self.result,allow_recovery=True) or {}
  if self.result:
   # Restore the newest accepted asset, while disclosing a newer rejected one.
   rejected=[]
   for path in self.cache.glob('*.json'):
    try:
     item=json.loads(path.read_text());quality=item.get('quality',{})
     if item.get('provider')=='satcorps' and quality.get('schema')==SCHEMA and quality.get('status')=='rejected' and item.get('time',0)>self.result['time']:
      rejected.append(item)
    except (ValueError,OSError,TypeError,AttributeError):continue
   if rejected:
    latest=max(rejected,key=lambda item:item['time'])
    message='较新的本地云图未通过质量检查（'+describe_reasons(latest['quality'].get('reasons',[]))+'）；已恢复上一份通过检查的云图，原始档案保留。'
    if self.check.get('retryable') and self.check.get('updateMessage'):message+=' '+self.check['updateMessage']
    self.check={**self.check,'updateStatus':'partial','checkedAt':self.check.get('checkedAt',int(time.time()*1000)),'checkComplete':False,'cachedCheck':False,'retryable':self.check.get('retryable',False),'updateMessage':message}
  if not self.result and self.check.get('updateStatus')=='unavailable':self.state={'state':'error','error':self.check.get('updateMessage','NASA 云图暂不可用')}
  if not self.result and any(self.cache.glob('*.png')):
   message='本机没有通过当前质量检查的可用云图；原始档案保留，可继续使用浏览器中已核验的旧图或内置静态云图。'
   if self.check.get('updateMessage'):message+=' '+self.check['updateMessage']
   self.state={'state':'error','error':message}
   self.check={'updateStatus':'unavailable','checkComplete':False,'cachedCheck':False,'retryable':False,**self.check,'updateMessage':message}
 def publish(self,result):
  if not quality_ok(result.get('quality')) or result['quality'].get('sha256')!=result.get('sha256'):raise ValueError('NASA 云图质量检查未通过')
  self.image=Path(result['file']);self.result={k:v for k,v in result.items() if k!='file' and k not in CHECK_FIELDS}
 def cache_usage(self):
  size=count=0
  for path in self.cache.iterdir():
   try:
    if path.is_file():size+=path.stat().st_size;count+=path.suffix=='.png'
   except OSError:continue
  return {'bytes':size,'count':count}
 def _snapshot(self):
  return {**self.state,**self.check,'cache':self.cache_usage(),**({'result':{**self.result,**self.check}} if self.result else {})}
 def snapshot(self):
  with self.lock:return self._snapshot()
 def image_bytes(self,sha=None):
  with self.lock:
   if not self.image or not self.image.exists():return None
   if sha and sha!=self.result.get('sha256'):return None
   return self.image.read_bytes()
 def start(self):
  with self.lock:
   if self.state['state']!='running':
    recent=recent_check(self.cache,self.result) if self.image and self.image.exists() else None
    if recent:
     self.check=recent;self.state={'state':'ready'};return self._snapshot()
    self.state={'state':'running','status':'连接 NASA 云图源'}
    try:
     self.process=subprocess.Popen([sys.executable,str(Path(__file__).with_name('satcorps.py')),str(self.cache)],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
     threading.Thread(target=self.run,args=(self.process,),daemon=True).start()
    except OSError:self.failed('NASA 云图处理程序未能启动')
   return self._snapshot()
 def failed(self,message,check=None):
  self.state={'state':'error','error':message}
  self.check={'updateStatus':'partial' if self.result else 'unavailable','checkedAt':int(time.time()*1000),'checkComplete':False,'cachedCheck':False,**(check or {})}
 def run(self,process):
  try:
   for line in process.stdout:
    try:message=json.loads(line)
    except ValueError:continue
    with self.lock:
     if self.process is not process:return
     if 'result' in message:
      self.publish(message['result']);self.check={k:message['result'][k] for k in CHECK_FIELDS if k in message['result']};self.state={'state':'ready'}
     elif 'error' in message:self.failed(message['error'],{k:message[k] for k in CHECK_FIELDS if k in message})
     else:self.state={'state':'running',**message}
   code=process.wait()
   with self.lock:
    if self.process is process and self.state['state']=='running':self.failed('NASA 云图处理失败；请检查 Python 的 numpy、Pillow、h5py 依赖' if code else 'NASA 未返回云图')
  except Exception:
   with self.lock:
    if self.process is process:self.failed('NASA 云图处理失败')
 def clear(self):
  with self.lock:
   if self.state['state']=='running':return False
   shutil.rmtree(self.cache,ignore_errors=True);self.cache.mkdir(parents=True,exist_ok=True)
   # A cleared library stays empty after restart instead of importing the old cache again.
   (self.cache/'migration-complete').touch();self.state={'state':'idle'};self.image=None;self.result=None;self.check={};return True
 def cancel(self):
  with self.lock:
   if self.process and self.process.poll() is None:self.process.terminate()
   self.process=None;self.state={'state':'idle'};self.check={}
   return True
service=CloudService()
