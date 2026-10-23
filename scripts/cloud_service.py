"""One bounded NASA conversion job shared by local tabs."""
import json, subprocess, sys, threading, tempfile, shutil
from pathlib import Path
CACHE=Path(tempfile.gettempdir())/'tiangong-satcorps-cache'
class CloudService:
 def __init__(self):self.lock=threading.Lock();self.state={'state':'idle'};self.process=None
 def snapshot(self):
  with self.lock:return dict(self.state)
 def start(self):
  with self.lock:
   if self.state['state']=='running':return dict(self.state)
   self.state={'state':'running','status':'连接 NASA 云图源'}
   self.process=subprocess.Popen([sys.executable,str(Path(__file__).with_name('satcorps.py')),str(CACHE)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
   threading.Thread(target=self.run,args=(self.process,),daemon=True).start()
   return dict(self.state)
 def run(self,process):
  try:
   for line in process.stdout:
    try:message=json.loads(line)
    except ValueError:continue
    with self.lock:
     if self.process is not process:return
     if 'result' in message:
      self.state={'state':'ready','result':{k:v for k,v in message['result'].items() if k!='file'}}
      self.image=Path(message['result']['file'])
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
   shutil.rmtree(CACHE,ignore_errors=True);self.state={'state':'idle'};self.image=None;return True
service=CloudService()
