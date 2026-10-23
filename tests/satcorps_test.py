import sys,unittest,datetime,tempfile,json,hashlib
from pathlib import Path
from unittest.mock import patch
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from satcorps import opacity,DAY,MAX_AGE,candidates,build
from PIL import Image
class Clouds(unittest.TestCase):
 def test_clouds_not_ice(self):
  phase=np.array([0,4,1,2,3,5,127,6],dtype='uint8')
  depth=np.array([65535,65535,200,1000,65535,65535,65535,200],dtype='uint16')
  r=np.zeros(8,dtype='int16');r[-1]=-32768
  a,v=opacity(phase,depth,r,{'scale_factor':.01},100000,100001)
  self.assertEqual(a[0],0);self.assertEqual(a[1],0);self.assertGreater(a[3],a[2]);self.assertTrue(v[:4].all());self.assertFalse(v[4:].any())
 def test_archive_observations(self):
  a,v=opacity(np.array([1,1,1]),np.array([200,200,200]),np.array([-100,0,-32768],dtype='int16'),{},100000,100000+1000*DAY)
  self.assertEqual(v.tolist(),[True,True,False])
 def test_rolling_window_and_year_boundary(self):
  for date in ['2026-10-23T09:00:00+00:00','2027-01-02T14:00:00+00:00']:
   now=datetime.datetime.fromisoformat(date).timestamp();rows=list(candidates(now))
   self.assertEqual(len(rows),30)
   self.assertTrue(all(now-MAX_AGE<=t<=now for t,u in rows))
   self.assertTrue(all(rows[i][0]>rows[i+1][0] for i in range(len(rows)-1)))
   for t,u in rows:
    d=datetime.datetime.fromtimestamp(t,datetime.timezone.utc)
    self.assertIn(d.strftime('%Y%j.1200'),u);self.assertIn('visst-pixel-netcdf_v2a',u)
  self.assertNotEqual(list(candidates(now))[0],list(candidates(now+DAY))[0])
 def info(self,t):
  return dict(provider='satcorps',time=t*1000,coverage=.999,polarCoverage=dict(north=.999,south=.999),footprint=dict(global_=1,north=1,south=1))
 def test_skips_phase_and_full_retrieval_gaps(self):
  now=1800000000;rows=list(candidates(now))[:3];bad=self.info(rows[0][0]);bad['coverage']=.8
  good=self.info(rows[2][0]);image=Image.new('L',(2,1))
  with tempfile.TemporaryDirectory() as out,patch('satcorps.candidates',return_value=iter(rows)),patch('satcorps.fetch_frame',return_value=10) as fetch,patch('satcorps.phase_coverage',side_effect=[bad,good,good]),patch('satcorps.convert',side_effect=[(image,None,bad),(image,None,good)]):
   result=build(out,now=now)
   self.assertEqual(result['time'],rows[2][0]*1000);self.assertEqual(result['source'],rows[2][1]);self.assertEqual(result['release'],'GCC V2A')
   self.assertEqual(fetch.call_count,5)
   checks=json.loads((Path(out)/'checks.json').read_text());self.assertEqual(len(checks),2)
 def test_failed_refresh_preserves_cached_image(self):
  now=1800000000;previous=self.info(now-31*DAY)
  with tempfile.TemporaryDirectory() as out:
   image=Path(out)/'previous.png';image.write_bytes(b'previous')
   previous['sha256']=hashlib.sha256(image.read_bytes()).hexdigest();image.with_suffix('.json').write_text(json.dumps(previous))
   for ext in ['.png','.json']:(Path(out)/('20240630T1200-v1a'+ext)).write_text('retired')
   with patch('satcorps.fetch_frame',side_effect=RuntimeError('offline')):
    result=build(out,now=now)
   self.assertEqual(result['time'],previous['time']);self.assertIn('保留',result['updateMessage']);self.assertEqual(image.read_bytes(),b'previous')
   self.assertFalse((Path(out)/'20240630T1200-v1a.png').exists())
 def test_rejection_cache_expires(self):
  now=1800000000;row=next(candidates(now));bad=self.info(row[0]);bad['coverage']=.8
  with tempfile.TemporaryDirectory() as out,patch('satcorps.candidates',side_effect=lambda now:iter([row])),patch('satcorps.phase_coverage',return_value=bad),patch('satcorps.fetch_frame',return_value=10) as fetch:
   for timestamp in [now,now+60,now+7*3600]:
    with self.assertRaises(ValueError):build(out,now=timestamp)
   self.assertEqual(fetch.call_count,2)
if __name__=='__main__':unittest.main()
