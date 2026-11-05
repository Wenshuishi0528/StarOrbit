import sys,unittest,tempfile,io,json
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import cloud_versions as v
import cloud_history as h
from cloud_history_service import HistoryService

class VersionsTests(unittest.TestCase):
 def test_cancel_before_post_response_prevents_late_start(self):
  service=HistoryService();request_id='a'*32
  self.assertTrue(service.cancel(request_id))
  with patch('cloud_history_service.subprocess.Popen') as spawn:
   job=service.start('2026-10-23','12',request_id)
  self.assertEqual(job['state'],'cancelled');spawn.assert_not_called()
 def test_bad_sidecar_does_not_poison_library(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'bad.png').write_bytes(b'x');(root/'bad.json').write_text(json.dumps({'provider':'satcorps','time':'not-a-time','sha256':'a'*64}))
   self.assertEqual(v.library(root),[])
   for sha in [23,None,[]]:
    (root/'bad.json').write_text(json.dumps({'provider':'satcorps','time':1792756800000,'sha256':sha}));self.assertEqual(v.library(root),[])
   result={'items':[{'source':'test'}]}
   for bad in [[],{'test':None},{'test':{'reason':'image quality','details':[{}]}}]:
    (root/'checks.json').write_text(json.dumps(bad));self.assertEqual(len(v.known_checks(result,root)['items']),1)
 def test_catalog_only_reads_directories(self):
  v._cache.clear();calls=[]
  def directory(url):
   calls.append(url)
   if url.endswith('/2026/10/'):return ['23','22','https://evil.example/21']
   return [url+'satcorps-gcc.v02a.geoleo.glob-comp.2026296.1200.3km.nc',url+'../../evil.nc'] if url.endswith('/23/') else []
  with patch.object(v,'directory',side_effect=directory):
   result=v.catalog('2026-10','2026-10-23');again=v.catalog('2026-10','2026-10-23')
  self.assertEqual(len(result['items']),1);self.assertEqual(len(calls),2);self.assertTrue(again['cached']);self.assertTrue(all(url.endswith('/') for url in calls))
 def test_warnings_are_saved_with_validity(self):
  from PIL import Image
  image=Image.new('L',(8,4),206);mask=Image.new('L',(8,4),1);mask.putpixel((0,0),0)
  meta={'time':1792756800000,'coverage':.98,'polarCoverage':{'north':.9,'south':.9},'footprint':{'global':1,'north':1,'south':1}}
  with tempfile.TemporaryDirectory() as tmp,patch.object(h,'fetch_resuming',return_value=10),patch.object(h,'phase_coverage',return_value={'coverage':.98}),patch.object(h,'convert',return_value=(image,mask,meta)),patch.object(h,'inspect_image',return_value={'schema':1,'status':'rejected','reasons':['internal-seam']}):
   result=h.build('2026-10-23','12',tmp)
   self.assertTrue(result['warnings']);self.assertEqual(result['channel'],'validity')
   with Image.open(Path(tmp)/'image.png') as im:
    rgba=im.convert('RGBA')
    self.assertEqual(rgba.getpixel((0,0)),(0,0,0,0));self.assertEqual(rgba.getpixel((1,0)),(206,206,206,255))
   # An impossible budget fails before replacing a previously usable image.
   previous=(Path(tmp)/'image.png').read_bytes()
   with patch('satcorps.TEXTURE_TARGET_BYTES',1),patch('satcorps.TEXTURE_MAX_BYTES',1),self.assertRaisesRegex(ValueError,'50 MB'):
    h.build('2026-10-23','12',tmp)
   self.assertEqual((Path(tmp)/'image.png').read_bytes(),previous)
   self.assertEqual({p.name for p in Path(tmp).iterdir()},{'image.png'})
 def test_budget_preserves_footprint_and_opacity(self):
  import numpy as np
  from PIL import Image
  from satcorps import write_cloud_png
  rng=np.random.default_rng(23)
  opacity=rng.integers(0,256,(256,512),dtype=np.uint8)
  mask=rng.integers(0,16,opacity.shape)!=0
  hard_limit=opacity.size+4096
  with tempfile.TemporaryDirectory() as tmp,patch('satcorps.TEXTURE_TARGET_BYTES',512),patch('satcorps.TEXTURE_MAX_BYTES',hard_limit):
   # With a spare gray code the indexed PNG is exact; with all 256 and gaps the
   # compact fallback may change an opaque sample by at most one gray level.
   for shades,error in ((np.minimum(opacity,254),0),(opacity,1)):
    path=Path(tmp)/'texture.png'
    info=write_cloud_png(path,Image.fromarray(shades),Image.fromarray(mask.astype(np.uint8)))
    self.assertEqual(info['maxOpacityError'],error)
    self.assertLessEqual(path.stat().st_size,hard_limit)
    with Image.open(path) as png:rgba=np.asarray(png.convert('RGBA'))
    np.testing.assert_array_equal(rgba[:,:,3],mask.astype(np.uint8)*255)
    self.assertTrue((rgba[~mask,:3]==0).all())
    self.assertEqual(np.max(np.abs(rgba[:,:,0][mask].astype(int)-shades[mask])),error)
 def test_cancel_cannot_be_overwritten_by_late_result(self):
  service=HistoryService()
  class Process:
   pid=111
   stdout=io.StringIO('{"result":{"sha256":"late"}}\n')
   def wait(self,timeout=None):return -15
  with patch('cloud_history_service.subprocess.Popen',return_value=Process()),patch('cloud_history_service.threading.Thread'):
   job=service.start('2026-10-23','12')
  with patch('cloud_history_service.os.killpg') as kill:self.assertTrue(service.cancel(job['id']));kill.assert_called_once()
  service.run(Process(),job['id']);self.assertEqual(service.snapshot()['state'],'cancelled');service.clear()
 def test_month_validation(self):
  for month in ['2026/10','../../etc','2026-13']:
   with self.assertRaises(ValueError):v.month_value(month)

if __name__=='__main__':unittest.main()
