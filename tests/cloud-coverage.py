import sys, unittest, tempfile, threading, time, datetime
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import numpy as np
import cloud_coverage as c
from satcorps import BASE
from http_download import DownloadError

def item(hour=12):
    date='2026-10-23';dt=datetime.datetime(2026,10,23,hour,tzinfo=datetime.timezone.utc)
    return {'provider':'satcorps','date':date,'slot':str(hour),'key':f'satcorps:{date}:{hour}',
            'time':int(dt.timestamp()*1000),'source':BASE+dt.strftime('%Y/%m/%d/satcorps-gcc.v02a.geoleo.glob-comp.%Y%j.%H00.3km.nc')}
def result(coverage=1):
    return {'state':'ready','estimated':True,'fullVerified':False,'method':c.METHOD,'metric':'valid-observation',
            'coverage':coverage,'polarCoverage':{'north':coverage,'south':coverage},'classification':'global' if coverage>=.95 else 'partial',
            'checkedAt':int(time.time()*1000),'validatedAt':int(time.time()*1000),'sourceRevision':{'etag':'v1','lastModified':'today','size':100}}
def settle(service):
    until=time.monotonic()+3
    while service.thread is not None:
        if time.monotonic()>until:raise AssertionError('coverage worker did not settle')
        time.sleep(.005)

class CoverageTests(unittest.TestCase):
    def test_clear_sky_is_observed_and_unknown_phase_is_not(self):
        lat=np.linspace(-89.5,89.5,180);phase=np.zeros((180,360),np.uint8);relative=np.zeros_like(phase,dtype=np.int16)
        self.assertEqual(c.observation_estimate(phase,relative,lat,1000,1000)['coverage'],1)
        for code in [0,1,2,4,6,7]:
            phase.fill(code);self.assertEqual(c.observation_estimate(phase,relative,lat,1000,1000)['classification'],'global')
        for code in [3,5,13,127]:
            phase.fill(code);self.assertEqual(c.observation_estimate(phase,relative,lat,1000,1000)['coverage'],0)
        phase.fill(4);relative.fill(-32768)
        self.assertEqual(c.observation_estimate(phase,relative,lat,1000,1000)['coverage'],0)
        relative.fill(1000)
        self.assertEqual(c.observation_estimate(phase,relative,lat,1000,1000)['coverage'],0,'future observations are not counted')
    def test_area_weighting_and_missing_poles_prevent_global_claim(self):
        lat=np.linspace(-89.5,89.5,180);phase=np.full((180,360),4,np.uint8);relative=np.zeros_like(phase,dtype=np.int16)
        phase[lat>=67.5]=127
        estimated=c.observation_estimate(phase,relative,lat,1000,1000)
        self.assertGreater(estimated['coverage'],.95,'polar cap has less area than equal pixel count implies')
        self.assertEqual(estimated['polarCoverage']['north'],0)
        self.assertEqual(estimated['classification'],'partial','whole missing polar cap must not pass the filter')
        self.assertEqual(estimated['sampleCount'],64800)
    def test_only_exact_official_directory_urls_are_accepted(self):
        c.validate_item(item())
        for patch_value in [{'source':'https://example.org/file.nc'},{'slot':'24'},{'key':'x'}]:
            with self.assertRaises((ValueError,TypeError)):c.validate_item({**item(),**patch_value})
    def test_range_budget_prevents_network_before_exceeding_limit(self):
        header=bytearray(65536);header[:8]=b'\x89HDF\r\n\x1a\n';header[13]=8;header[40:48]=(2000000).to_bytes(8,'little')
        with tempfile.TemporaryDirectory() as tmp,patch('satcorps.request',return_value=bytes(header)) as request,patch.object(c,'BYTE_LIMIT',65536):
            remote=c.BoundedRangeFile(item()['source'],Path(tmp)/'sample.nc',time.monotonic()+1)
            try:
                with self.assertRaises(DownloadError):remote.download((65536,65599),64)
                self.assertEqual(request.call_count,1)
            finally:remote.close()
    def test_directory_is_nonblocking_prioritizes_noon_and_persists_cache(self):
        gate=threading.Event();calls=[]
        def probe(candidate,previous):
            calls.append(candidate['slot']);gate.wait(2);return result()
        with tempfile.TemporaryDirectory() as tmp:
            service=c.CoverageService(tmp,probe);start=time.monotonic()
            first=service.submit({'items':[item(15),item(12)]})
            self.assertLess(time.monotonic()-start,.2)
            self.assertEqual(first['coverageStatus']['pending']+first['coverageStatus']['running'],2)
            gate.set();settle(service)
            self.assertEqual(calls,['12','15'])
            self.assertEqual(service.snapshot('2026-10')['coverageStatus']['ready'],2)
            again=c.CoverageService(tmp,lambda *_:self.fail('fresh persisted result should not refetch'))
            self.assertEqual(again.submit({'items':[item(12)]})['items'][0]['coverageCheck']['coverage'],1)
            self.assertIsNone(again.thread)
            self.assertTrue(again.snapshot('2026-10','2026-10-23')['items'])
    def test_force_rechecks_same_version_and_errors_remain_unknown(self):
        calls=[]
        def probe(candidate,previous):
            calls.append(previous)
            if len(calls)==2:return {**result(.7),'sourceRevision':{'etag':'v2','lastModified':'tomorrow','size':101}}
            return result()
        with tempfile.TemporaryDirectory() as tmp:
            service=c.CoverageService(tmp,probe);service.submit({'items':[item()]});settle(service)
            service.submit({'items':[item()]},force=True);settle(service)
            self.assertEqual(service.snapshot('2026-10')['items'][0]['coverageCheck']['coverage'],.7)
            self.assertEqual(calls[1]['sourceRevision']['etag'],'v1')
            service.probe=lambda *_:(_ for _ in ()).throw(DownloadError('timeout','timeout',retryable=True))
            service.submit({'items':[item()]},force=True);settle(service)
            check=service.snapshot('2026-10')['items'][0]['coverageCheck']
            self.assertEqual(check['classification'],'unknown');self.assertEqual(check['state'],'error');self.assertNotIn('coverage',check)
    def test_same_validator_reuses_sample_and_new_validator_does_not(self):
        previous=result()
        with patch.object(c,'source_revision',return_value=previous['sourceRevision']),patch.object(c,'BoundedRangeFile') as remote:
            reused=c.probe(item(),previous);remote.assert_not_called();self.assertTrue(reused['cached'])
        with patch.object(c,'source_revision',return_value={**previous['sourceRevision'],'etag':'v2'}),patch.object(c,'BoundedRangeFile',side_effect=RuntimeError('new source sampled')):
            with self.assertRaisesRegex(RuntimeError,'new source sampled'):c.probe(item(),previous)

if __name__=='__main__':unittest.main()
