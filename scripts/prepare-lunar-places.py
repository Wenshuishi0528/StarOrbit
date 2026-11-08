#!/usr/bin/env python3
"""Build offline Moon place catalogue from the complete official Gazetteer table.

python3 scripts/prepare-lunar-places.py --refresh  # fetch latest official source
python3 scripts/prepare-lunar-places.py            # deterministic bundled snapshot
Python standard library + curl; no credentials, browser or third-party API.
"""
import argparse, csv, gzip, hashlib, io, json, subprocess
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/moon/places'
URL = 'https://planetarynames.wr.usgs.gov/SearchResults?Target=16_Moon'
HEADERS = ['id','name','cleanName','target','diameterKm','latitude','longitude','north','south','east','west','coordinateSystem','continent','ethnicity','featureTypeLabel','featureType','quad','status','approvalDate','reference','origin','additionalInfo','updated']
class GazetteerParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.active=False; self.row=None; self.cell=None
    def handle_starttag(self,tag,attrs):
        if tag=='tbody' and dict(attrs).get('id')=='results_body': self.active=True
        if self.active and tag=='tr': self.row=[]
        if self.active and tag=='td': self.cell=[]
    def handle_data(self,data):
        if self.cell is not None: self.cell.append(data)
    def handle_endtag(self,tag):
        if tag=='td' and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()));self.cell=None
        if tag=='tr' and self.active and self.row is not None:
            self.rows.append(self.row);self.row=None
        if tag=='tbody': self.active=False

class LandingTableParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None
    def handle_starttag(self,tag,attrs):
        if tag=='tr': self.row=[]
        if tag in ['td','th'] and self.row is not None: self.cell=[]
    def handle_data(self,data):
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self,tag):
        if tag in ['td','th'] and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()));self.cell=None
        if tag=='tr' and self.row is not None:
            if len(self.row)==9:self.rows.append(self.row)
            self.row=None

def build_landings(refresh=False):
    url='https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html'
    path=OUT/'landing-source.html.gz'
    if refresh:
        html=subprocess.check_output(['curl','--fail','--location','--max-time','180',url])
        path.write_bytes(gzip.compress(html,mtime=0))
    raw=gzip.decompress(path.read_bytes())
    parser=LandingTableParser();parser.feed(raw.decode('utf-8'))
    sources={r[0]:r for r in parser.rows}
    inventory=json.loads((OUT/'landing-inventory.json').read_text())
    records=[]
    for entry in inventory['records']:
        r=sources[entry['sourceName']]
        if 'Unknown' in r[4]: latitude=longitude=None
        else:
            latitude,longitude=map(float,r[4].split(','))
            if longitude>180:longitude=round(longitude-360,8)
        record={k:v for k,v in entry.items() if k!='sourceName'}
        record['id']='landing:'+entry['id']
        record.update(latitude=latitude,longitude=longitude,sourceUrl=url,
          locationAccuracy='unknown' if latitude is None else 'lro-imaged' if r[5]=='d' else 'approximate')
        record.setdefault('outcome','impact-failed' if r[1].startswith('Impact') else 'soft-success')
        record.setdefault('date',datetime.strptime(r[2],'%d %B %Y').date().isoformat())
        records.append(record)
    records.sort(key=lambda r:r['date'])
    result={'snapshotDate':inventory['reviewedAt'],
      'scope':'Lunar surface contact by attempted soft-landing missions, including failed and abnormal touchdowns. Excludes intentional impact probes, orbital disposals, launch/transit failures and future plans. Rover names identify shared landing/deployment sites, not current rover positions.',
      'coordinateSystem':'Spherical latitude; east-positive longitude -180..180; NASA NSSDCA DE421 mean-Earth/polar-axis reference.',
      'sourceLastUpdated':'2025-08-13','sourceSha256':hashlib.sha256(raw).hexdigest(),'records':records}
    (OUT/'landings.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('Landing catalogue:',len(records),'attempted soft-landing missions;',sum(r['latitude'] is not None for r in records),'located.')

def main():
    p=argparse.ArgumentParser();p.add_argument('--refresh',action='store_true');p.add_argument('--html',type=Path);p.add_argument('--refresh-landings',action='store_true');a=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    snapshot=OUT/'gazetteer-source.csv.gz'; provenance=OUT/'gazetteer-source.json'
    if a.refresh or a.html:
        html=a.html.read_bytes() if a.html else subprocess.check_output(['curl','--fail','--location','--max-time','180',URL])
        parser=GazetteerParser();parser.feed(html.decode('utf-8'))
        if len(parser.rows)<9000 or any(len(r)!=23 for r in parser.rows): raise ValueError('Incomplete or changed Gazetteer table; review source before update.')
        text=io.StringIO();w=csv.writer(text,lineterminator='\n');w.writerow(HEADERS);w.writerows(parser.rows)
        raw=text.getvalue().encode('utf-8');snapshot.write_bytes(gzip.compress(raw,mtime=0))
        provenance.write_text(json.dumps({'url':URL,'retrievedAt':datetime.now(timezone.utc).isoformat(timespec='seconds'),'htmlSha256':hashlib.sha256(html).hexdigest(),'csvSha256':hashlib.sha256(raw).hexdigest(),'rawCount':len(parser.rows)},ensure_ascii=False,indent=2)+'\n')
    raw=gzip.decompress(snapshot.read_bytes());meta=json.loads(provenance.read_text())
    if hashlib.sha256(raw).hexdigest()!=meta['csvSha256']:raise ValueError('Source snapshot checksum mismatch')
    rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8'))));approved=[];types={}
    for r in rows:
        if r['target']!='Moon' or r['coordinateSystem']!='Planetographic, +East, -180 - 180':raise ValueError('Unexpected target/coordinate convention')
        if r['status']!='Approved':continue
        types[r['featureType']]=r['featureTypeLabel']
        approved.append([int(r['id']),r['name'],float(r['latitude']),float(r['longitude']),float(r['diameterKm'] or 0),r['featureType']])
    if len({r[0] for r in approved})!=len(approved):raise ValueError('Duplicate IDs')
    approved.sort(key=lambda r:r[0])
    catalogue={'meta':{'snapshotDate':meta['retrievedAt'][:10],'sourceUrl':URL,'sourceSha256':meta['csvSha256'],'rawCount':len(rows),'featureCount':len(approved),'satelliteFeatureCount':sum(r[5]=='SF' for r in approved),'approvalFilter':'Approved','excludedStatuses':dict(Counter(r['status'] for r in rows if r['status']!='Approved')),'coordinateSystem':'Moon spherical latitude; east-positive longitude, -180..180 degrees','columns':['usgsId','name','latitude','longitude','diameterKm','featureType']},'types':types,'features':approved}
    (OUT/'gazetteer.json').write_text(json.dumps(catalogue,ensure_ascii=False,separators=(',',':'))+'\n')
    build_landings(a.refresh_landings)
    print(f"Moon Gazetteer: {len(approved)} approved features, {catalogue['meta']['satelliteFeatureCount']} satellite features; {len(rows)-len(approved)} unapproved/dropped excluded.")
if __name__=='__main__':main()
