"""Local viewer plus a fixed-origin official orbit relay. No arbitrary URL proxy."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import urllib.request, urllib.error, urllib.parse, argparse, os, webbrowser, json, ssl, subprocess, tempfile, time
from cloud_service import service as clouds
from cloud_history_service import HistoryService
from cloud_library_delete import remove_version
from cloud_coverage import coverage_service
from cloud_history import query as query_history
from cloud_versions import catalog as cloud_catalog, library as cloud_library, local_image, known_checks
import threading
from http_download import download_bytes, DownloadError
from balcony_motion import orientation_stream
from solar_service import service as solar_observations
ROOT=Path(__file__).resolve().parents[1]
URL='https://en.cmse.gov.cn/news/202107/t20210722_48418.html'
cloud_job_lock=threading.Lock()
# Several local viewer addresses may share saved maps. Their live job state must
# remain independent, including when a launcher probes an already-running app.
_port_index=os.sys.argv.index('--port')+1 if '--port' in os.sys.argv else None
_cloud_port=os.sys.argv[_port_index] if _port_index is not None else '8771'
history=HistoryService(clouds.cache,job_name='download-job-'+str(int(_cloud_port)))
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
  if self.path=='/api/balcony/orientation':
   # Only an opt-in, same-origin local app may start this stream; reject cross-site forms and DNS rebinding.
   hosts={f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
   host=self.headers.get('Host')
   if host not in hosts or self.headers.get('Origin')!='http://'+host or self.headers.get('X-StarOrbit-Motion')!='1':
    self.send_error(403);return
   self.send_response(200);self.send_header('Content-Type','application/x-ndjson');self.send_header('Cache-Control','no-store');self.send_header('Connection','close');self.end_headers()
   frames=orientation_stream()
   try:
    for pose in frames:self.wfile.write((json.dumps(pose)+'\n').encode());self.wfile.flush()
   except (BrokenPipeError,ConnectionResetError):pass
   finally:frames.close()
   return
  if self.path=='/api/cloud/satcorps/update':
   self.send_json({'state':'error','error':'请在云图版本列表中刷新目录并选择下载；已取消逐日回查','retryable':False});return
  route=urllib.parse.urlparse(self.path)
  if route.path=='/api/cloud/library/delete':
   args=urllib.parse.parse_qs(route.query)
   hosts={f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
   if self.headers.get('Host') not in hosts or self.headers.get('Sec-Fetch-Site')=='cross-site':self.send_error(403);return
   if set(args)!={'name','sha256','provider','time'} or any(len(v)!=1 for v in args.values()):self.send_json({'error':'云图删除参数无效'},400);return
   try:
    with cloud_job_lock:self.send_json(remove_version(history,clouds,args['name'][0],args['sha256'][0],args['provider'][0],args['time'][0]))
   except ValueError as error:self.send_json({'error':str(error)},409)
   except OSError:self.send_json({'error':'云图文件删除失败，请刷新图库后重试'},500)
   return
  if route.path=='/api/cloud/history/cancel':
   args=urllib.parse.parse_qs(route.query);self.send_json({'cancelled':history.cancel(args.get('id',[''])[0])});return
  if route.path=='/api/cloud/legacy-cancel':
   self.send_json({'cancelled':clouds.cancel()});return
  if route.path=='/api/cloud/history/download':
   args=urllib.parse.parse_qs(route.query)
   try:
    with cloud_job_lock:
     if clouds.snapshot()['state']=='running':self.send_json({'error':'最新云图正在更新，请稍后下载历史数据'},409);return
     self.send_json(history.start(args.get('date',[''])[0],args.get('hour',[''])[0],args.get('requestId',[None])[0],args.get('provider',['satcorps'])[0],args.get('revision',[None])[0]))
   except ValueError as error:self.send_json({'error':str(error)},400)
   return
  if self.path=='/api/cloud/satcorps/clear':
   with cloud_job_lock:
    if history.snapshot()['state'] in ('running','cancelling') or clouds.snapshot()['state']=='running':self.send_json({'cleared':False});return
    self.send_json({'cleared':history.clear() and clouds.clear()});return
  self.send_error(404)
 def do_GET(self):
  if self.path.startswith('/api/solar/'):
   hosts={f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
   if self.headers.get('Host') not in hosts or not self.cloud_origin_ok() or self.headers.get('Sec-Fetch-Site')=='cross-site':self.send_error(403);return
   parsed=urllib.parse.urlparse(self.path);args=urllib.parse.parse_qs(parsed.query)
   try:
    if parsed.path=='/api/solar/metadata' and set(args)<= {'channel','resolution'} and all(len(v)==1 for v in args.values()):
     self.send_json(solar_observations.latest(args.get('channel',[''])[0],args.get('resolution',['2048'])[0]));return
    if parsed.path=='/api/solar/image' and set(args)=={'token'} and len(args['token'])==1:
     data=solar_observations.image(args['token'][0]);self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
    self.send_error(400)
   except ValueError as error:self.send_json({'error':str(error)},400)
   except DownloadError as error:self.send_json({'error':{'code':'SOLAR_'+error.code.upper(),'message':'太阳观测更新失败：'+str(error)+'。已有影像已保留。','retryable':error.retryable}},502)
   except (BrokenPipeError,ConnectionResetError):pass
   except Exception:self.send_json({'error':'太阳观测源暂不可用；已有影像已保留'},502)
   return
  if self.path.startswith('/api/cloud/'):
   if not self.cloud_origin_ok():self.send_error(403);return
   if self.path=='/api/cloud/satcorps/status':self.send_json(clouds.snapshot());return
   parsed=urllib.parse.urlparse(self.path)
   if parsed.path=='/api/cloud/library':self.send_json({'items':cloud_library(clouds.cache)});return
   if parsed.path=='/api/cloud/versions':
    args=urllib.parse.parse_qs(parsed.query)
    try:
     force=args.get('force',['0'])[0]=='1'
     result=known_checks(cloud_catalog(args.get('month',[''])[0],args.get('date',[None])[0],force),clouds.cache)
     self.send_json(coverage_service(clouds.cache).submit(result,force=force))
    except ValueError as error:self.send_json({'error':str(error)},400)
    except DownloadError as error:self.send_json({'error':{'code':'UPSTREAM_'+error.code.upper(),'message':'NASA 目录查询失败：'+str(error)+'。已保存云图仍可使用。','retryable':error.retryable}},502)
    except Exception:self.send_json({'error':'官方目录暂不可访问；已保存云图仍可使用，请稍后重试'},502)
    return
   if parsed.path=='/api/cloud/coverage':
    args=urllib.parse.parse_qs(parsed.query)
    if not set(args)<={'month','date'} or any(len(v)!=1 for v in args.values()):self.send_json({'error':'云图覆盖查询参数无效'},400);return
    try:self.send_json(coverage_service(clouds.cache).snapshot(args.get('month',[''])[0],args.get('date',[None])[0]))
    except ValueError as error:self.send_json({'error':str(error)},400)
    return
   if parsed.path=='/api/cloud/library/image':
    args=urllib.parse.parse_qs(parsed.query);data=local_image(clouds.cache,args.get('name',[''])[0],args.get('sha256',[''])[0],args.get('preview',['0'])[0]=='1')
    if data is None:self.send_error(404);return
    self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
   if parsed.path in ('/api/cloud/gmgsi/latest','/api/cloud/himawari/latest'):
    label='NOAA' if parsed.path.endswith('/gmgsi/latest') else '向日葵'
    try:
     if label=='NOAA':
      from gmgsi import latest
     else:
      from himawari import latest
     self.send_json(latest())
    except ImportError:self.send_json({'error':label+'云图需要本机 Python 的云图依赖，请安装 scripts/cloud-requirements.txt'},503)
    except (ValueError,DownloadError,OSError) as error:self.send_json({'error':label+'最新时次查询失败：'+str(error)},502)
    return
   if parsed.path=='/api/cloud/history/query':
    args=urllib.parse.parse_qs(parsed.query)
    try:self.send_json(query_history(args.get('date',[''])[0],args.get('hour',[''])[0]))
    except ValueError as error:self.send_json({'error':str(error)},400)
    except DownloadError as error:self.send_json({'error':'暂时无法连接图源：'+str(error),'retryable':error.retryable},502)
    return
   if parsed.path=='/api/cloud/history/status':self.send_json(history.snapshot());return
   if parsed.path=='/api/cloud/history/image':
    args=urllib.parse.parse_qs(parsed.query);data=history.image_bytes(args.get('id',[''])[0],args.get('sha256',[''])[0])
    if data is None:self.send_error(404);return
    self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
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
