"""Deletion fixtures use only an isolated temporary cloud library."""
import hashlib
import importlib.util
import urllib.request
import urllib.parse
import urllib.error
from unittest.mock import patch, Mock
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from cloud_history_service import HistoryService
from cloud_library_delete import remove_version


class DeleteVersion(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.history = HistoryService(self.root)
        self.clouds = SimpleNamespace(cache=self.root, lock=threading.Lock(), state={'state':'idle'}, result=None, image=None, check={})
        self.data = b'cloud deletion fixture'
        self.sha = hashlib.sha256(self.data).hexdigest()
        self.name = '20261108T0400-'+self.sha[:16]+'.png'
        self.meta = {'provider':'satcorps','time':1794110400000,'sha256':self.sha,'disk':self.name}
        (self.root/self.name).write_bytes(self.data)
        (self.root/self.name).with_suffix('.json').write_text(json.dumps(self.meta))
        self.other = self.root/'unrelated.png'
        self.other.write_bytes(b'keep this unrelated file')
    def tearDown(self):
        self.temp.cleanup()
    def remove(self, **changes):
        args = {'name':self.name,'sha':self.sha,'provider':'satcorps','timestamp':str(self.meta['time']), **changes}
        return remove_version(self.history, self.clouds, **args)
    def test_completed_latest_removed_from_files_jobs_and_restart(self):
        job = {'state':'ready','provider':'satcorps','date':'2026-11-08','hour':'4','id':'a'*32,'result':self.meta}
        self.history.state = job.copy();self.history._persist()
        self.clouds.result = self.meta.copy();self.clouds.image = self.root/self.name;self.clouds.state={'state':'ready'}
        second = self.root/'download-job-8798.json';second.write_text(json.dumps(job))
        self.assertTrue(self.remove()['deleted'])
        self.assertFalse((self.root/self.name).exists())
        self.assertFalse((self.root/self.name).with_suffix('.json').exists())
        self.assertTrue(self.other.exists())
        self.assertEqual(self.history.snapshot()['state'],'idle')
        self.assertEqual(HistoryService(self.root).snapshot()['state'],'idle')
        self.assertEqual(json.loads(second.read_text()),{'state':'idle'})
        self.assertIsNone(self.clouds.result)
        self.assertTrue((self.root/'migration-complete').exists())
        self.assertTrue(self.remove()['alreadyAbsent'],'retry after a lost response is idempotent')
    def test_changed_identity_or_bytes_preserve_files(self):
        for changed in ({'sha':'b'*64},{'provider':'gmgsi'},{'timestamp':str(self.meta['time']+3600000)}):
            with self.assertRaises(ValueError):self.remove(**changed)
            self.assertTrue((self.root/self.name).exists())
        (self.root/self.name).write_bytes(b'changed bytes')
        with self.assertRaises(ValueError):self.remove()
        self.assertTrue((self.root/self.name).with_suffix('.json').exists())
    def test_invalid_paths_and_symlinks_never_delete_targets(self):
        for name in ('../unrelated.png','/tmp/unrelated.png','nested/file.png','checks.json','x.png?x=1'):
            with self.assertRaises(ValueError):self.remove(name=name)
        target = self.root/self.name;target.unlink();target.symlink_to(self.other)
        with self.assertRaises(ValueError):self.remove()
        self.assertTrue(self.other.exists())
    def test_active_job_is_preserved(self):
        self.history.state={'state':'running'}
        with self.assertRaises(ValueError):self.remove()
        self.assertTrue((self.root/self.name).exists())
        self.history.state={'state':'idle'};self.clouds.state={'state':'running'}
        with self.assertRaises(ValueError):self.remove()
        self.assertTrue((self.root/self.name).exists())

    def test_http_delete_and_coverage_routes_are_isolated_and_validated(self):
        # Inject the temporary service before importing the server: never create
        # or inspect the user's real cache, and never contact NASA in this test.
        spec = importlib.util.spec_from_file_location('delete_fixture_server', Path(__file__).resolve().parents[1]/'scripts/serve.py')
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'cloud_service':SimpleNamespace(service=self.clouds)}), patch.object(sys, 'argv', ['fixture']):
            spec.loader.exec_module(module)
        module.history = self.history
        catalog = {'items':[], 'dates':[], 'coverageStatus':{'ready':0}}
        checker = Mock();checker.submit.return_value=catalog;checker.snapshot.return_value=catalog
        module.coverage_service = lambda cache:checker
        module.cloud_catalog = lambda *args: {'items':[], 'dates':[]}
        module.Handler.log_message = lambda *args:None
        server = module.ThreadingHTTPServer(('127.0.0.1',0), module.Handler)
        thread = threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base = 'http://127.0.0.1:'+str(server.server_port)
        def request(path, method='GET', origin=None):
            req=urllib.request.Request(base+path, method=method, headers={'Origin':origin or base})
            with urllib.request.urlopen(req,timeout=3) as response:return json.load(response)
        try:
            self.assertEqual(request('/api/cloud/versions?month=2026-11'),catalog)
            checker.submit.assert_called_once()
            self.assertEqual(request('/api/cloud/coverage?month=2026-11&date=2026-11-08'),catalog)
            checker.snapshot.assert_called_once_with('2026-11','2026-11-08')
            checker.snapshot.side_effect=ValueError('bad month')
            with self.assertRaises(urllib.error.HTTPError) as caught:request('/api/cloud/coverage?month=bad')
            self.assertEqual(caught.exception.code,400)
            query=urllib.parse.urlencode({'name':self.name,'sha256':self.sha,'provider':'satcorps','time':self.meta['time']})
            route='/api/cloud/library/delete?'+query
            with self.assertRaises(urllib.error.HTTPError) as caught:request(route,'POST','https://other.invalid')
            self.assertEqual(caught.exception.code,403)
            self.assertTrue((self.root/self.name).exists())
            with self.assertRaises(urllib.error.HTTPError) as caught:request(route+'&name=other.png','POST')
            self.assertEqual(caught.exception.code,400)
            self.assertTrue(request(route,'POST')['deleted'])
            self.assertFalse((self.root/self.name).exists())
            self.assertTrue(self.other.exists())
        finally:
            server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
