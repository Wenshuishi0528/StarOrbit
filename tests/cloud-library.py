import hashlib, io, json, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from cloud_history_service import HistoryService
from cloud_versions import library

class Process:
    pid=111
    stdout=io.StringIO('')
    def wait(self,timeout=None):return 0

class LibraryPersistence(unittest.TestCase):
    def publish(self, service, date='2026-10-23'):
        process=Process()
        with patch('cloud_history_service.subprocess.Popen',return_value=process),patch('cloud_history_service.threading.Thread'):
            job=service.start(date,'12')
        from cloud_history import selection
        data=b'fixture-completed-image';sha=hashlib.sha256(data).hexdigest()
        (Path(service.temp.name)/'image.png').write_bytes(data)
        result={'provider':'satcorps','time':int(selection(date,'12')[0]*1000),'sha256':sha,'resolution':'8192×4096','coverage':1,'channel':'validity'}
        process.stdout=io.StringIO(json.dumps({'result':result})+'\n');service.run(process,job['id'])
        self.assertEqual(service.snapshot()['state'],'ready')
        return data,service.snapshot()
    def test_finished_map_survives_restart_and_new_job(self):
        with tempfile.TemporaryDirectory() as folder:
            service=HistoryService(folder);data,job=self.publish(service)
            restarted=HistoryService(folder)
            self.assertEqual(restarted.snapshot()['state'],'ready')
            self.assertEqual(restarted.image_bytes(job['id'],job['result']['sha256']),data)
            self.assertEqual(len(library(folder)),1)
            with patch('cloud_history_service.subprocess.Popen',return_value=Process()),patch('cloud_history_service.threading.Thread'):
                restarted.start('2026-10-22','12')
            self.assertTrue((Path(folder)/job['result']['disk']).exists(),'a new conversion cannot discard a completed map')
            with patch('cloud_history_service.os.killpg'):restarted.cancel(restarted.snapshot()['id'])
            service.clear()
    def test_existing_saved_map_never_downloads_again(self):
        with tempfile.TemporaryDirectory() as folder:
            service=HistoryService(folder);_,job=self.publish(service);service.clear()
            with patch('cloud_history_service.subprocess.Popen') as spawn:
                existing=service.start('2026-10-23','12')
            spawn.assert_not_called();self.assertEqual(existing['result']['sha256'],job['result']['sha256']);service.clear()
    def test_interrupted_restart_reports_retry_instead_of_fake_progress(self):
        with tempfile.TemporaryDirectory() as folder:
            service=HistoryService(folder)
            with patch('cloud_history_service.subprocess.Popen',return_value=Process()),patch('cloud_history_service.threading.Thread'):
                job=service.start('2026-10-23','12')
            restarted=HistoryService(folder);self.assertEqual(restarted.snapshot()['state'],'error');self.assertTrue(restarted.snapshot()['retryable'])
            with patch('cloud_history_service.os.killpg'):service.cancel(job['id'])
    def test_another_viewer_cache_clear_cannot_delete_scientific_fields(self):
        from cloud_service import CloudService
        with tempfile.TemporaryDirectory() as folder:
            other=CloudService(folder,legacy=None)
            service=HistoryService(folder,job_name='download-job-8798')
            with patch('cloud_history_service.subprocess.Popen',return_value=Process()),patch('cloud_history_service.threading.Thread'):
                job=service.start('2026-10-23','12')
            fields=Path(service.temp.name)/'fields.nc';fields.write_bytes(b'partial scientific fields')
            self.assertTrue(other.clear())
            self.assertEqual(fields.read_bytes(),b'partial scientific fields')
            with patch('cloud_history_service.os.killpg'):service.cancel(job['id'])
    def test_stop_must_be_confirmed_before_starting_next_job(self):
        import subprocess
        with tempfile.TemporaryDirectory() as folder:
            service=HistoryService(folder)
            process=Process()
            with patch('cloud_history_service.subprocess.Popen',return_value=process),patch('cloud_history_service.threading.Thread'):
                job=service.start('2026-10-23','12')
            with patch.object(process,'wait',side_effect=subprocess.TimeoutExpired('worker',3)),patch('cloud_history_service.os.killpg'):
                self.assertFalse(service.cancel(job['id']))
            self.assertEqual(service.snapshot()['state'],'cancelling')
            with self.assertRaises(ValueError):service.start('2026-10-22','12')
            with patch('cloud_history_service.os.killpg'):self.assertTrue(service.cancel(job['id']))

if __name__=='__main__':unittest.main()
