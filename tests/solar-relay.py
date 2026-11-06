import os, sys, tempfile, threading, json, urllib.request, urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
with tempfile.TemporaryDirectory() as folder:
 os.environ['TIANGONG_CLOUD_CACHE']=folder
 from serve import Handler,ThreadingHTTPServer
 from http_download import DownloadError
 class QuietHandler(Handler):
  def log_message(self,*args):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),QuietHandler)
 thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 base=f'http://127.0.0.1:{server.server_port}'
 def get(path,headers=None):
  try:r=urllib.request.urlopen(urllib.request.Request(base+path,headers=headers or {}),timeout=2)
  except urllib.error.HTTPError as error:r=error
  with r:return r.status,dict(r.headers),r.read()
 try:
  with patch('serve.solar_observations.latest',return_value={'channel':'hmi'}) as latest:
   status,headers,body=get('/api/solar/metadata?channel=hmi&resolution=2048')
   assert status==200 and json.loads(body)=={'channel':'hmi'}
   latest.assert_called_once_with('hmi','2048')
   latest.reset_mock()
   for path,headers in [('/api/solar/metadata?channel=hmi',{'Origin':'https://unrelated.example'}),
     ('/api/solar/metadata?channel=hmi',{'Host':'attacker.test'}),
     ('/api/solar/metadata?channel=hmi',{'Sec-Fetch-Site':'cross-site'})]:
    assert get(path,headers)[0]==403
   for query in ['channel=hmi&url=https://attacker.test','channel=hmi&channel=aia171','sourceId=18']:
    assert get('/api/solar/metadata?'+query)[0]==400
   assert not latest.called
  with patch('serve.solar_observations.image',return_value=b'png bytes') as image:
   status,headers,body=get('/api/solar/image?token='+'a'*32)
   assert status==200 and headers['Content-Type']=='image/png' and headers['Content-Length']=='9' and body==b'png bytes'
   image.assert_called_once_with('a'*32)
  with patch('serve.solar_observations.latest',side_effect=DownloadError('timeout','timeout',retryable=True)):
   status,headers,body=get('/api/solar/metadata?channel=hmi')
   assert status==502 and json.loads(body)['error']['retryable']
 finally:server.shutdown();server.server_close();thread.join()
print('Solar HTTP relay: local host/origin enforcement, no arbitrary URL parameters, bounded service routing and retryable errors passed')
