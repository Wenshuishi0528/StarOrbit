"""Local viewer plus a fixed-origin official orbit relay. No arbitrary URL proxy."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import urllib.request, urllib.error, urllib.parse, argparse, os, webbrowser, json, ssl, subprocess
ROOT=Path(__file__).resolve().parents[1]
URL='https://en.cmse.gov.cn/news/202107/t20210722_48418.html'
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path=='/api/status':
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"app":"tiangong-earth-viewer"}');return
  if self.path=='/api/orbit':
   # Only local, same-origin requests; never relay credentials or arbitrary paths.
   origin=self.headers.get('Origin')
   if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'):
    self.send_error(403);return
   try:
    try:
     with urllib.request.urlopen(urllib.request.Request(URL,headers={'User-Agent':'Tiangong-Viewer/0.16'}),timeout=20) as r:body=r.read(6000001)
    except urllib.error.URLError as error:
     if not isinstance(error.reason,ssl.SSLError):raise
     # macOS Python can lack the system CA bundle; curl still verifies TLS normally.
     body=subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','20','--max-filesize','6000000',URL],capture_output=True,check=True,timeout=22).stdout
    if len(body)>6000000:raise ValueError('Response too large')
    self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
   except Exception:self.send_error(502,'Official orbit source unavailable; existing data retained')
   return
  if self.path.startswith('/api/') or any(p.startswith('.') for p in urllib.parse.unquote(self.path).split('/') if p):self.send_error(404);return
  super().do_GET()
 def list_directory(self,path):self.send_error(403);return None
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8771);p.add_argument('--open',action='store_true');a=p.parse_args();os.chdir(ROOT)
 try:server=ThreadingHTTPServer(('127.0.0.1',a.port),Handler)
 except OSError:
  # Reuse this app's existing local server and its remembered browser origin.
  try:
   with urllib.request.urlopen(f'http://127.0.0.1:{a.port}/api/status',timeout=2) as r:existing=json.load(r)
  except Exception:raise SystemExit(f'Port {a.port} is occupied; close its existing server and retry.')
  if existing.get('app')!='tiangong-earth-viewer':raise SystemExit(f'Port {a.port} belongs to another application.')
  if a.open:webbrowser.open(f'http://127.0.0.1:{a.port}/天宫空间站交互预览.html')
  raise SystemExit(0)
 if a.open:webbrowser.open(f'http://127.0.0.1:{a.port}/天宫空间站交互预览.html')
 print(f'Tiangong: http://127.0.0.1:{a.port}',flush=True);server.serve_forever()
