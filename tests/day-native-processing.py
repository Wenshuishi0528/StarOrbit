import importlib.util, pathlib, unittest, warnings
import numpy as np
p=pathlib.Path(__file__).resolve().parents[1]/'scripts/prepare-day-modis-2026.py'
s=importlib.util.spec_from_file_location('native_day',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class NativeDay(unittest.TestCase):
 def test_same_median_and_quality(self):
  rng=np.random.default_rng(42)
  for n,h,w in [(1,17,23),(2,17,23),(3,17,23),(10,17,23),(10,129,9)]:
   qualities=[rng.integers(0,3,(h,w),dtype='uint8') for _ in range(n)]
   cubes=[np.where(q[None]>0,rng.random((3,h,w),dtype='float32'),np.nan) for q in qualities]
   m.NATIVE_RESOLUTION=False
   with warnings.catch_warnings():
    warnings.simplefilter('ignore');expected=m.compose_blocks(cubes,qualities)
   actual=m.compose_native_blocks(cubes,qualities)
   for a,b in zip(actual,expected):np.testing.assert_allclose(a,b,equal_nan=True,atol=0,rtol=0)
 def test_native_spatial_samples_survive(self):
  rgb=np.arange(48,dtype='float32').reshape(3,4,4)/100
  data={'rgb':rgb,'quality':np.full((4,4),2,dtype='uint8'),'transform':np.array([463.3127165279,0,0,0,-463.3127165279,0,0,0,1]),'crs':'EPSG:4326'}
  result=m.compose_native_blocks([rgb],[data['quality']])[0]
  np.testing.assert_array_equal(result,rgb)
  reduced=m.reduce_native(data)
  self.assertEqual(reduced['rgb'].shape,(3,2,2))
  self.assertEqual(result.shape,(3,4,4))
 def test_empty_water(self):
  rgb=np.full((3,3,4),np.nan,dtype='float32');q=np.zeros((3,4),dtype='uint8')
  out=m.compose_native_blocks([rgb],[q]);self.assertTrue(np.isnan(out[0]).all());self.assertEqual(out[3].tolist(),[12,0,0])
if __name__=='__main__':unittest.main()
