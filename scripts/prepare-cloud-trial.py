"""Fetch two independent NOAA-20 VIIRS GIBS browse samples, not raw L2 data.
Usage: python3 scripts/prepare-cloud-trial.py 2026-10-28 --output output/viirs-trial-new
Never changes the application cloud cache or enables the experimental source.
"""
import argparse, datetime, hashlib, json, time, urllib.parse, xml.etree.ElementTree as ET
from pathlib import Path
from http_download import download_bytes

def main():
 p=argparse.ArgumentParser();p.add_argument('date');p.add_argument('--output',required=True,type=Path);a=p.parse_args()
 if datetime.date.fromisoformat(a.date).isoformat()!=a.date:raise ValueError('Use YYYY-MM-DD')
 if a.output.exists():raise ValueError('Choose a new output directory; existing samples are never overwritten')
 base='https://gibs.earthdata.nasa.gov';ns={'w':'http://www.opengis.net/wmts/1.0','o':'http://www.opengis.net/ows/1.1'}
 caps=ET.fromstring(download_bytes(base+'/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml',limit=8000000,timeout=90,attempt_timeout=35))
 layers={kind:'VIIRS_NOAA20_Clear_Sky_Confidence_'+kind.title() for kind in ['day','night']}
 # Require a published daily interval. Never silently request a default/latest day.
 for layer in layers.values():
  el=next(e for e in caps.findall('.//w:Layer',ns) if e.findtext('o:Identifier',namespaces=ns)==layer)
  intervals=[e.text.split('/') for e in el.findall('w:Dimension/w:Value',ns)]
  if not any((len(r)==1 and a.date==r[0]) or (len(r)==3 and r[2]=='P1D' and r[0]<=a.date<=r[1]) for r in intervals):raise ValueError('Requested date is not listed for '+layer)
 a.output.mkdir(parents=True);files={};started=time.monotonic();palette_url=base+'/colormaps/v1.3/VIIRS_Clear_Sky_Confidence.xml'
 palette=download_bytes(palette_url,limit=100000,timeout=60);(a.output/'palette.xml').write_bytes(palette)
 for kind,layer in layers.items():
  params=dict(SERVICE='WMS',VERSION='1.1.1',REQUEST='GetMap',LAYERS=layer,STYLES='',SRS='EPSG:4326',BBOX='-180,-90,180,90',WIDTH=2048,HEIGHT=1024,FORMAT='image/png',TRANSPARENT='TRUE',TIME=a.date)
  url=base+'/wms/epsg4326/best/wms.cgi?'+urllib.parse.urlencode(params)
  data=download_bytes(url,limit=8000000,timeout=90,attempt_timeout=35)
  if data[:8]!=b'\x89PNG\r\n\x1a\n' or int.from_bytes(data[16:20],'big')!=2048 or int.from_bytes(data[20:24],'big')!=1024:raise ValueError('Not the expected PNG preview')
  (a.output/(kind+'.png')).write_bytes(data);files[kind]={'url':url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 report={'date':a.date,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'seconds':time.monotonic()-started,'files':files,'note':'GIBS daily browse only, 2048x1024; retain alpha nodata, keep day/night separate; not optical depth.'}
 (a.output/'download-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
if __name__=='__main__':main()
