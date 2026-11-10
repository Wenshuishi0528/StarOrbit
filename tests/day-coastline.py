"""Data-tooling regression for the observed Bohai water colour artefact."""
import gzip, importlib.util, json, pathlib, unittest
import numpy as np
root=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('atlas',root/'scripts/assemble-day-500m.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class CoastCoverage(unittest.TestCase):
 @classmethod
 def setUpClass(cls): cls.coast=a.Coastline(root/'assets/earth/day-2026-q2-500m/coastline.geojson.gz')
 def test_beijing_land_and_bohai_water(self):
  mask=self.coast.fraction(39,6)
  def sample(lon,lat):return mask[int((45-lat)*240)+8,int((lon-112.5)*240)+8]
  self.assertEqual(sample(116.4,39.9),1)
  self.assertEqual(sample(119,39),0)
  self.assertEqual(sample(119.5,38.6),0)
  self.assertGreater(np.count_nonzero((mask>0)&(mask<1)),0,'coast is fractional, not a hard block boundary')
 def test_neighbouring_land_gutters(self):
  left=self.coast.fraction(38,6);right=self.coast.fraction(39,6)
  np.testing.assert_array_equal(left[:,1800:1816],right[:,:16])
 def test_dateline_gutters(self):
  left=self.coast.fraction(47,11);right=self.coast.fraction(0,11)
  np.testing.assert_array_equal(left[:,1800:1816],right[:,:16])
if __name__=='__main__':unittest.main()
