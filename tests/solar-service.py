import json, struct, sys, threading, time, urllib.parse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from solar_service import SolarService, parse_metadata, API, MAX_IMAGE_BYTES

raw=dict(id='193672473',date='2026-11-06 00:01:21',scale=.594816360351502,scaleCorrection=1.0087147227,
 width=4096,height=4096,refPixelX=2048.5,refPixelY=2048.5,rotation=0,offsetX=0,offsetY=0,rsun=1613.3464)
header=b'<meta><fits><TELESCOP>SDO</TELESCOP><INSTRUME>AIA_3</INSTRUME><WAVELNTH>171</WAVELNTH><DATE-OBS>2026-11-06T00:01:21.348</DATE-OBS><CROTA2>0</CROTA2></fits><helioviewer><HV_ROTATION>0</HV_ROTATION></helioviewer></meta>'
frame=parse_metadata(raw,header,'aia171',2048)
assert frame['observedAt']=='2026-11-06T00:01:21.348Z'
assert abs(frame['radiusFraction']-2*1613.3464/4096)<1e-12
assert frame['solarCenterUV']==[.5,.5] and frame['solarNorthUp']
params=urllib.parse.parse_qs(urllib.parse.urlsplit(frame['sourceUrl']).query,keep_blank_values=True)
assert params['watermark']==['false'] and params['events']==[''] and params['layers']==['[10,1,100]']
assert float(params['imageScale'][0])==float(f'{raw["scale"]*2:.12f}')
assert params['date']==['2026-11-06T00:01:21.000Z']
for changes in [dict(rotation=5),dict(refPixelX=1024),dict(rsun=4000),dict(id='../../etc/passwd'),dict(scale=float('nan'))]:
 try:parse_metadata({**raw,**changes},header,'aia171',2048);assert False,changes
 except ValueError:pass
for other in ['aia304','hmi']:
 try:parse_metadata(raw,header,other,2048);assert False,other
 except ValueError:pass

calls=[];now=[1793937600.]
png=b'\x89PNG\r\n\x1a\n'+b'\x00'*8+struct.pack('>II',2048,2048)+b'validated png fixture'
def download(url,**limits):
 calls.append((url,limits))
 assert url.startswith(API) and limits['attempts']==1
 if 'getClosestImage/' in url:return json.dumps(raw).encode()
 if 'getJP2Header/' in url:return header
 assert 'takeScreenshot/' in url and limits['limit']==MAX_IMAGE_BYTES
 time.sleep(.02);return png
service=SolarService(download,lambda:now[0]);frames=[]
threads=[threading.Thread(target=lambda:frames.append(service.latest('aia171','2048'))) for _ in range(3)]
for thread in threads:thread.start()
for thread in threads:thread.join()
assert len(calls)==2 and len({f['token'] for f in frames})==1
token=frames[0]['token'];images=[]
threads=[threading.Thread(target=lambda:images.append(service.image(token))) for _ in range(3)]
for thread in threads:thread.start()
for thread in threads:thread.join()
assert len(calls)==3 and images==[png]*3
for args in [('http://attacker.test',2048),('aia171','4096')]:
 try:service.latest(*args);assert False,args
 except ValueError:pass
for bad in ['http://attacker.test','../../private','a'*32]:
 try:service.image(bad);assert False,bad
 except ValueError:pass
assert len(calls)==3,'invalid requests must not reach network'
now[0]+=61;service.latest('aia171',2048);assert len(calls)==5
old=service.images['aia171'];service.download=lambda *a,**k:b'not an image'
service.images.clear()
try:service.image(token);assert False
except ValueError:pass
assert not service.images,'invalid downloads are never cached'
print('Solar relay: fixed SDO sources, capture timestamps, north-up full-disc geometry, bounded requests, per-band dedup and invalid image rejection passed')
