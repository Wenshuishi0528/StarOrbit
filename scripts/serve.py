"""Local viewer plus a fixed-origin official orbit relay. No arbitrary URL proxy."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import urllib.request, urllib.error, urllib.parse, argparse, os, webbrowser, json, ssl, subprocess, tempfile, time
from cloud_service import service as clouds
from http_download import download_bytes, DownloadError
ROOT=Path(__file__).resolve().parents[1]
URL='https://en.cmse.gov.cn/news/202107/t20210722_48418.html'
class Handler(SimpleHTTPRequestHandler):
 def translate_path(self,path):
  # Keep the saved origin/URL, while avoiding a 237 MB HTML document in the
  # browser and its host app. The local bundle retains the NASA/orbit APIs.
  route=urllib.parse.unquote(urllib.parse.urlparse(path).path)
  compact=ROOT/'dist-local'
  if route in ('/','/StarOrbit.html') and (compact/'index.html').is_file():return str(compact/'index.html')
  if route.startswith('/assets/'):
   candidate=(compact/route.lstrip('/')).resolve()
   if candidate.is_relative_to((compact/'assets').resolve()) and candidate.is_file():return str(candidate)
  return super().translate_path(path)
 def cloud_origin_ok(self):
  return self.headers.get('Origin') in (None,f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}')
 def send_json(self,value,code=200):
  self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(json.dumps(value,ensure_ascii=False).encode())
 def do_POST(self):
  if not self.cloud_origin_ok():self.send_error(403);return
  if self.path=='/api/cloud/satcorps/update':self.send_json(clouds.start());return
  if self.path=='/api/cloud/satcorps/clear':self.send_json({'cleared':clouds.clear()});return
  self.send_error(404)
 def do_GET(self):
  if self.path.startswith('/api/cloud/'):
   if not self.cloud_origin_ok():self.send_error(403);return
   if self.path=='/api/cloud/satcorps/status':self.send_json(clouds.snapshot());return
   parsed=urllib.parse.urlparse(self.path)
   if parsed.path=='/api/cloud/satcorps/image':
    data=clouds.image_bytes(urllib.parse.parse_qs(parsed.query).get('sha256',[None])[0])
    if data is None:self.send_error(404);return
    self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
   self.send_error(404);return
  if self.path=='/api/status':
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"app":"tiangong-earth-viewer"}');return
  route=urllib.parse.urlparse(self.path)
  if route.path in ('/api/orbit','/api/orbit/dfh1','/api/orbit/gp'):
   gp=route.path!='/api/orbit';catalog=urllib.parse.parse_qs(route.query).get('norad',['4382' if route.path.endswith('/dfh1') else ''])[0]
   if gp and (not catalog.isascii() or not catalog.isdigit() or not 1<=int(catalog)<=999999999):self.send_error(400);return
   source=f'https://celestrak.org/NORAD/elements/gp.php?CATNR={int(catalog)}&FORMAT=JSON' if gp else URL
   # Only local, same-origin requests; never relay credentials or arbitrary paths.
   origin=self.headers.get('Origin')
   if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'):
    self.send_error(403);return
   try:
    body=download_bytes(source,limit=6000000,timeout=90,attempt_timeout=65)
    self.send_response(200);self.send_header('Content-Type','application/json' if gp else 'text/html; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
   except DownloadError as error:self.send_json({'error':{'code':'UPSTREAM_'+error.code.upper(),'message':str(error),'status':error.status,'retryable':error.retryable}},502)
   except (BrokenPipeError,ConnectionResetError):pass
   except Exception:self.send_json({'error':{'code':'UPSTREAM_UNAVAILABLE','message':'官方轨道数据源暂不可用'}},502)
   return
  if self.path.startswith('/api/') or any(p.startswith('.') for p in urllib.parse.unquote(self.path).split('/') if p):self.send_error(404);return
  super().do_GET()
 def list_directory(self,path):self.send_error(403);return None
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8771);p.add_argument('--open',action='store_true');p.add_argument('--background',action='store_true');a=p.parse_args();os.chdir(ROOT)
 if a.background:
  # A launcher may close its terminal after startup. Detach the server so the
  # remembered localhost address keeps working for the current login session.
  def running():
   try:
    with urllib.request.urlopen(f'http://127.0.0.1:{a.port}/api/status',timeout=.5) as r:return json.load(r).get('app')=='tiangong-earth-viewer'
   except Exception:return False
  if not running():
   log=Path(tempfile.gettempdir())/f'tiangong-viewer-{a.port}.log'
   with log.open('ab') as output:
    child=subprocess.Popen([os.sys.executable,str(Path(__file__).resolve()),'--port',str(a.port)],cwd=ROOT,stdin=subprocess.DEVNULL,stdout=output,stderr=output,start_new_session=True)
   ready=False
   for _ in range(30):
    if running():ready=True;break
    if child.poll() is not None:break
    time.sleep(.1)
   if not ready:raise SystemExit(f'Viewer server could not start; see {log}')
  if a.open:webbrowser.open(f'http://127.0.0.1:{a.port}/StarOrbit.html')
  print(f'StarOrbit is running: http://127.0.0.1:{a.port}')
  raise SystemExit(0)
 try:server=ThreadingHTTPServer(('127.0.0.1',a.port),Handler)
 except OSError:
  # Reuse this app's existing local server and its remembered browser origin.
  try:
   with urllib.request.urlopen(f'http://127.0.0.1:{a.port}/api/status',timeout=2) as r:existing=json.load(r)
  except Exception:raise SystemExit(f'Port {a.port} is occupied; close its existing server and retry.')
  if existing.get('app')!='tiangong-earth-viewer':raise SystemExit(f'Port {a.port} belongs to another application.')
  if a.open:webbrowser.open(f'http://127.0.0.1:{a.port}/StarOrbit.html')
  raise SystemExit(0)
 if a.open:webbrowser.open(f'http://127.0.0.1:{a.port}/StarOrbit.html')
 print(f'StarOrbit: http://127.0.0.1:{a.port}',flush=True);server.serve_forever()
