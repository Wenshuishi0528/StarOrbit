import os,sys,tempfile,threading,json,urllib.request,urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
with tempfile.TemporaryDirectory() as folder:
 os.environ['TIANGONG_CLOUD_CACHE']=folder
 from serve import Handler,ThreadingHTTPServer,URL
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
  with patch('serve.download_bytes',return_value=b'official OEM') as download:
   status,headers,body=get('/api/orbit');assert status==200 and body==b'official OEM' and headers['Content-Length']=='12'
   download.assert_called_once_with(URL,limit=6000000,timeout=90,attempt_timeout=65)
  with patch('serve.download_bytes',side_effect=DownloadError('tls','数据源 TLS 连接中断',retryable=True)):
   status,headers,body=get('/api/orbit');error=json.loads(body)['error']
   assert status==502 and error==dict(code='UPSTREAM_TLS',message='数据源 TLS 连接中断',status=None,retryable=True)
  with patch('serve.download_bytes') as download:
   assert get('/api/orbit',{'Origin':'https://unrelated.example'})[0]==403
   assert get('/api/orbit/gp?norad=not-a-number')[0]==400
   assert not download.called
  # Compact local assets are served at the original URL, retaining storage and APIs.
  with tempfile.TemporaryDirectory() as local:
   root=Path(local);compact=root/'dist-local';assets=compact/'assets';assets.mkdir(parents=True)
   (compact/'index.html').write_bytes(b'<html>small entry</html>');(assets/'example-abc.js').write_bytes(b'local bundle')
   with patch('serve.ROOT',root):
    for path in ['/','/StarOrbit.html','/StarOrbit.html?scene=keep']:
     status,headers,body=get(path);assert status==200 and body==b'<html>small entry</html>'
    assert get('/assets/example-abc.js')[2]==b'local bundle'
    assert get('/assets/../index.html')[2]!=b'<html>small entry</html>'
 finally:server.shutdown();server.server_close();thread.join()
print('Orbit relay: fixed sources, complete response length, structured retryable failures and origin checks passed')
