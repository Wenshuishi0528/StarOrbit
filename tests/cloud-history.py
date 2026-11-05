import sys, tempfile, unittest, json
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import cloud_history as h
from cloud_history_service import HistoryService
import io
from http_download import DownloadError

class HistoricalCloudTests(unittest.TestCase):
 def test_service_identity_cleanup_and_failure(self):
  service=HistoryService()
  class Process:
   stdout=io.StringIO('{"error":"测试断网"}\n')
   def wait(self):return 1
  with patch('cloud_history_service.subprocess.Popen',return_value=Process()) as spawn,patch('cloud_history_service.threading.Thread'):
   first=service.start('2026-10-28','12');second=service.start('2026-10-28','12')
   self.assertEqual(first['id'],second['id']);self.assertEqual(spawn.call_count,1)
   with self.assertRaises(ValueError):service.start('2026-10-27','12')
  self.assertFalse(service.clear());self.assertIsNone(service.image_bytes('wrong','wrong'))
  service.run(Process(),first['id']);self.assertEqual(service.snapshot()['state'],'error')
  directory=Path(service.temp.name);self.assertTrue(service.clear());self.assertFalse(directory.exists());self.assertEqual(service.snapshot()['state'],'idle')
 def test_exact_selection(self):
  stamp,url=h.selection('2024-02-29','23')
  self.assertIn('/2024/02/29/',url);self.assertIn('2024060.2300.3km.nc',url)
  for date,hour in [('2025-02-29','12'),('2026-10-28','24'),('2026-10-28','../'),('9999-01-01','0')]:
   with self.assertRaises(ValueError):h.selection(date,hour)
 def test_missing_is_not_network_failure(self):
  with patch.object(h,'request',side_effect=DownloadError('http','missing',status=404)):
   self.assertFalse(h.query('2026-10-28','12')['available'])
  with patch.object(h,'request',side_effect=DownloadError('timeout','offline',retryable=True)):
   with self.assertRaises(DownloadError):h.query('2026-10-28','12')
 def test_header_query_is_bounded(self):
  with patch.object(h,'request',return_value=b'\x89HDF\r\n\x1a\n'):
   with self.assertRaises(ValueError):h.query('2026-10-28','12')
  header=bytearray(64);header[:8]=b'\x89HDF\r\n\x1a\n';header[13]=8;header[40:48]=(1400000000).to_bytes(8,'little')
  with patch.object(h,'request',return_value=bytes(header)) as request:
   result=h.query('2026-10-28','12');self.assertTrue(result['available']);self.assertEqual(result['rawBytes'],1400000000)
   self.assertEqual(request.call_args.args[1:3],((0,65535),65536))
 def test_reject_before_commit(self):
  with tempfile.TemporaryDirectory() as tmp:
   previous=Path(tmp)/'previous.png';previous.write_bytes(b'previous good frame')
   with patch.object(h,'fetch_resuming',return_value=10),patch.object(h,'phase_coverage',return_value={}),patch.object(h,'acceptable',return_value=True),patch.object(h,'convert',return_value=(object(),None,{})),patch.object(h,'inspect_image',return_value={'schema':1,'status':'rejected','reasons':['high-opacity-plateau']}):
    with self.assertRaisesRegex(ValueError,'没有有效观测数据'):h.build('2026-10-28','12',tmp)
   self.assertEqual(previous.read_bytes(),b'previous good frame');self.assertFalse((Path(tmp)/'image.png').exists())
 def test_old_exact_frame_without_latest_window(self):
  reference,_=h.selection('2024-02-29','23')
  from PIL import Image
  image=Image.new('L',(8,4),80);mask=Image.new('L',(8,4),1)
  with tempfile.TemporaryDirectory() as tmp:
   with patch.object(h,'fetch_resuming',return_value=10) as fetch,patch.object(h,'phase_coverage',return_value={'coverage':1}),patch.object(h,'acceptable',return_value=True),patch.object(h,'convert',return_value=(image,mask,{'time':int(reference*1000),'coverage':1})) as convert,patch.object(h,'inspect_image',return_value={'schema':1,'status':'accepted','reasons':[]}):
    result=h.build('2024-02-29','23',tmp)
    self.assertEqual(convert.call_args.args[1],reference);self.assertEqual(result['time'],int(reference*1000));self.assertEqual(len({c.args[0] for c in fetch.call_args_list}),1)
    self.assertEqual(set(p.name for p in Path(tmp).iterdir()),{'image.png'},'never writes latest-cache check/state files')

if __name__=='__main__':unittest.main()
