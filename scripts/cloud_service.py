"""Shared NASA asset library and one background conversion job."""
import json, subprocess, sys, threading, tempfile, shutil, os
from pathlib import Path
from satcorps import cached_frames
LEGACY_CACHE=Path(tempfile.gettempdir())/'tiangong-satcorps-cache'
CACHE=Path(os.environ.get('TIANGONG_CLOUD_CACHE',Path.home()/'Library/Application Support/Tiangong Orbit Simulator/clouds'))
class CloudService:
 def __init__(self,cache=CACHE,legacy=LEGACY_CACHE):
  self.cache=Path(cache);self.lock=threading.Lock();self.state={'state':'idle'};self.process=None;self.image=None;self.result=None
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
 def publish(self,result):
  self.image=Path(result['file']);self.result={k:v for k,v in result.items() if k!='file'}
 def snapshot(self):
  with self.lock:return {**self.state,**({'result':dict(self.result)} if self.result else {})}
 def image_bytes(self,sha=None):
  with self.lock:
   if not self.image or not self.image.exists():return None
   if sha and sha!=self.result.get('sha256'):return None
   return self.image.read_bytes()
 def start(self):
  with self.lock:
   if self.state['state']!='running':
    self.state={'state':'running','status':'连接 NASA 云图源'}
    try:
     self.process=subprocess.Popen([sys.executable,str(Path(__file__).with_name('satcorps.py')),str(self.cache)],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
     threading.Thread(target=self.run,args=(self.process,),daemon=True).start()
    except OSError:self.state={'state':'error','error':'NASA 云图处理程序未能启动'}
   return {**self.state,**({'result':dict(self.result)} if self.result else {})}
 def run(self,process):
  try:
   for line in process.stdout:
    try:message=json.loads(line)
    except ValueError:continue
    with self.lock:
     if self.process is not process:return
     if 'result' in message:self.publish(message['result']);self.state={'state':'ready'}
     elif 'error' in message:self.state={'state':'error','error':message['error']}
     else:self.state={'state':'running',**message}
   code=process.wait()
   with self.lock:
    if self.process is process and self.state['state']=='running':self.state={'state':'error','error':'NASA 云图处理失败；请检查 Python 的 numpy、Pillow、h5py 依赖' if code else 'NASA 未返回云图'}
  except Exception:
   with self.lock:
    if self.process is process:self.state={'state':'error','error':'NASA 云图处理失败'}
 def clear(self):
  with self.lock:
   if self.state['state']=='running':return False
   shutil.rmtree(self.cache,ignore_errors=True);self.cache.mkdir(parents=True,exist_ok=True)
   # A cleared library stays empty after restart instead of importing the old cache again.
   (self.cache/'migration-complete').touch();self.state={'state':'idle'};self.image=None;self.result=None;return True
service=CloudService()
