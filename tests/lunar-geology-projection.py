#!/usr/bin/env python3
"""Projection, registration and actual no-data pixels; no original download needed."""
import importlib.util
import json
import math
from pathlib import Path
import unittest
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('lunar_geology_projection', ROOT / 'scripts/reproject-lunar-geology.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)


class GeologyProjectionTests(unittest.TestCase):
    def test_recorded_outline_fit(self):
        record=json.loads((ROOT/'assets/moon/geology/outline-fit.json').read_text())
        points=np.asarray(record['points'])
        self.assertEqual(points.shape,(360,2))
        residual=(np.sqrt(((points[:,0]-g.CENTER[0])/g.RADII[0])**2+((points[:,1]-g.CENTER[1])/g.RADII[1])**2)-1)*g.RADII[1]
        np.testing.assert_allclose(residual,record['residuals'],atol=1e-9)
        self.assertLess(float(np.sqrt(np.mean(residual**2))),1.4)

    def test_published_mollweide_special_cases(self):
        # Equator linear in longitude; poles collapse all meridians. The
        # Mollweide equal-area standard parallel has sin(theta)=2/pi.
        x,y = g.project(np.array([-180,0,180]),0)
        np.testing.assert_allclose(x,[g.CENTER[0]-g.RADII[0],g.CENTER[0],g.CENTER[0]+g.RADII[0]],atol=1e-6)
        np.testing.assert_allclose(y,g.CENTER[1],atol=1e-6)
        theta = math.asin(2/math.pi)
        phi = math.asin((2*theta+math.sin(2*theta))/math.pi)
        _, y = g.project(0,math.degrees(phi))
        self.assertAlmostEqual(float(y),g.CENTER[1]-g.RADII[1]*2/math.pi,places=7)
        _, yn = g.project(0,90)
        _, ys = g.project(0,-90)
        self.assertAlmostEqual(float(yn),g.CENTER[1]-g.RADII[1],places=5)
        self.assertAlmostEqual(float(ys),g.CENTER[1]+g.RADII[1],places=5)

    def test_independent_printed_graticule_controls(self):
        controls = g.control_report()
        self.assertEqual(len(controls),6)
        self.assertLess(max(c['residualPixels'] for c in controls),3)
        for c in controls:
            lon,lat = g.unproject(*c['observedPixel'])
            self.assertLess(abs(lon-c['longitude']),.04)
            self.assertLess(abs(lat-c['latitude']),.04)

    def test_actual_alpha_matches_geometric_validity(self):
        im=np.asarray(Image.open(ROOT/'assets/moon/geology/globe.webp').convert('RGBA'))
        self.assertEqual(im.shape,(2048,4096,4))
        lon=((np.arange(4096)+.5)/4096*360-180)[None,:]
        lat=(90-(np.arange(2048)+.5)/2048*180)[:,None]
        x,y=g.project(lon,lat)
        valid=g.valid_source(x,y,lat)
        np.testing.assert_array_equal(im[:,:,3],valid.astype(np.uint8)*255)
        self.assertTrue(valid[1024,2048])
        self.assertFalse(valid[0,2048])
        self.assertFalse(valid[1024,0])
        # Do not unnecessarily remove the entire area north/south of 88 degrees.
        row=int((90-89)/180*2048)
        self.assertTrue(valid[row,2048])
        registration=json.loads((ROOT/'assets/moon/geology/registration.json').read_text())
        self.assertAlmostEqual(float(valid.mean()),registration['validPixelFraction'],places=12)
        weights=np.cos(np.deg2rad(lat))
        area=float((valid*weights).sum()/(weights.sum()*4096))
        self.assertAlmostEqual(area,registration['validSphericalAreaFraction'],places=12)
        self.assertGreater(area,.995)
        self.assertLess(area,1)

    def test_round_trip_and_direction(self):
        lon,lat=np.meshgrid(np.linspace(-179,179,37),np.linspace(-89,89,19))
        x,y=g.project(lon,lat);backlon,backlat=g.unproject(x,y)
        np.testing.assert_allclose(backlon,lon,atol=1e-8)
        np.testing.assert_allclose(backlat,lat,atol=1e-8)
        self.assertLess(g.project(-20,0)[0],g.project(20,0)[0])
        self.assertLess(g.project(0,20)[1],g.project(0,-20)[1])

if __name__=='__main__':unittest.main()
