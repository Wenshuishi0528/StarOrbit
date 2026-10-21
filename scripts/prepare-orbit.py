from pathlib import Path
import re,html,json,datetime
root=Path(__file__).resolve().parents[1]
s=html.unescape(re.sub('<[^>]+>','\n',(root/'assets/official-orbit-source.html').read_text()))
get=lambda k: re.search(r'\b'+k+r'\s*=\s*(\S+)',s).group(1)
assert get('REF_FRAME')=='EME2000' and get('TIME_SYSTEM')=='UTC'
rows=[]
for m in re.finditer(r'(20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+)\s+((?:[+-]?\d+\.\d+\s+){5}[+-]?\d+\.\d+)',s):
 t=datetime.datetime.fromisoformat(m[1]).replace(tzinfo=datetime.timezone.utc).timestamp()*1000
 row=[round(t),*map(float,m[2].split())]
 if not rows or row[0]>rows[-1][0]:rows.append(row)
assert len(rows)>1000
obj=dict(source='中国载人航天工程办公室 / BACC',url='https://en.cmse.gov.cn/news/202107/t20210722_48418.html',created=get('CREATION_DATE')+'Z',frame='EME2000',timeSystem='UTC',units='km, km/s',rows=rows)
(root/'assets/orbit.json').write_text(json.dumps(obj,separators=(',',':'),ensure_ascii=False))
print(len(rows),datetime.datetime.fromtimestamp(rows[0][0]/1000,datetime.timezone.utc),datetime.datetime.fromtimestamp(rows[-1][0]/1000,datetime.timezone.utc))
