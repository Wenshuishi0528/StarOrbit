"""NOAA hourly catalog, date line, image registration and missing-data regressions."""
import datetime as dt
import hashlib
import importlib.util
import io
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
import sys

import h5py
import numpy as np
from PIL import Image

scripts = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(scripts))
# This test is also called gmgsi.py. Load the runtime module by its actual path.
spec = importlib.util.spec_from_file_location('noaa_gmgsi', scripts / 'gmgsi.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

START = dt.datetime(2025, 12, 31, 23, tzinfo=dt.timezone.utc)
NOW = dt.datetime(2026, 1, 1, 0, 15, tzinfo=dt.timezone.utc)
PREFIX = 'GMGSI_LW/2025/12/31/23/'
KEY = PREFIX + 'GLOBCOMPLIR_v3r0_blend_s202512312300000_e202512312309599_c202512312333550.nc'


def listing_response(prefix, files, truncated=False):
    root = ET.Element('ListBucketResult', {'xmlns': 'http://s3.amazonaws.com/doc/2006-03-01/'})
    for k, v in [('Name', g.BUCKET), ('Prefix', prefix), ('IsTruncated', str(truncated).lower())]:
        ET.SubElement(root, k).text = v
    for key, size in files:
        entry = ET.SubElement(root, 'Contents')
        for k, v in [('Key', key), ('Size', str(size)), ('LastModified', '2025-12-31T23:57:00Z')]:
            ET.SubElement(entry, k).text = v
    return ET.tostring(root)


def synthetic(start=START, corrupt_coords=False, all_missing=False):
    # Irregular rows. Longitude begins on the east side of the date line and wraps.
    lat = np.array([75, 55, 42, 18, 0, -11, -28, -55, -75], np.float32)
    lon = np.array([157.5, -157.5, -112.5, -67.5, -22.5, 22.5, 67.5, 112.5], np.float32)
    lon2d, lat2d = np.meshgrid(lon, lat)
    if corrupt_coords:
        lat2d[1, -1] = -40
    counts = (98 + 5*np.arange(len(lat))[:, None] + 3*np.arange(len(lon))[None, :]).astype('f4')
    flags = np.zeros(counts.shape, dtype='i1')
    flags[2, 3] = 20
    counts[7, 1] = -9999
    counts[3, 6] = np.nan
    counts[5, 5] = 0  # Valid dark surface must remain distinct from missing data.
    if all_missing:
        flags[:] = -128
    file = io.BytesIO()
    with h5py.File(file, 'w') as f:
        f.attrs['title'] = np.bytes_('GLOBCOMPLIR')
        f.attrs['time_coverage_start'] = np.bytes_(start.strftime('%Y-%m-%dT%H:%M:%SZ'))
        f.attrs['time_coverage_end'] = np.bytes_((start + dt.timedelta(minutes=9, seconds=59)).strftime('%Y-%m-%dT%H:%M:%SZ'))
        f['lat'], f['lon'] = lat2d, lon2d
        f['data'], f['dqf'] = counts[None, ...], flags[None, ...]
        f['data'].attrs['long_name'] = np.bytes_('0-255 Brightness Temperature')
        f['data'].attrs['_FillValue'] = [-9999.]
    return file.getvalue()


def record():
    return {
        'date': '2025-12-31', 'slot': '23', 'time': g._millis(START), 'source': g.BASE + KEY,
        'sceneEnd': g._millis(START + dt.timedelta(minutes=9, seconds=59, milliseconds=900)),
        'provider': 'gmgsi',
    }


class Catalog(unittest.TestCase):
    def test_latest_uses_real_hour_across_midnight_and_picks_last_revision(self):
        newer = KEY.replace('c202512312333550', 'c202512312350020')
        bad_keys = [
            KEY.replace('s2025123123', 's2025123122'),
            KEY.replace('e202512312309599', 'e202601010309599'),
            KEY.replace('GLOBCOMPLIR', 'GLOBCOMP_VIS'),
            KEY.replace('/23/', '/23/../'),
            KEY.replace('c202512312333550', 'c202601010105000'),  # future revision
        ]
        checked = []

        def fake(url, **kwargs):
            prefix = parse_qs(urlsplit(url).query)['prefix'][0]
            checked.append(prefix)
            files = [(KEY, 7000000), (newer, 7000010), (newer.replace('50020','51020'), 50_000_001)]
            return listing_response(prefix, [] if prefix.endswith('01/01/') else files + [(k, 7000000) for k in bad_keys])

        with patch.object(g, 'download_bytes', side_effect=fake):
            item = g._latest_at(NOW)
        self.assertEqual(checked, ['GMGSI_LW/2026/01/01/', 'GMGSI_LW/2025/12/31/'])
        self.assertEqual((item['date'], item['slot'], item['time']), ('2025-12-31', '23', g._millis(START)))
        self.assertEqual((item['source'], item['rawBytes']), (g.BASE + newer, 7000010))

    def test_bad_selection_or_incomplete_directory_fails_closed(self):
        for date, hour in [('2025-02-30', '2'), ('2025-01-01/../../', '0'), ('2025-01-01', '00'),
                           ('2025-01-01', '24'), ('2025-01-01', '1/1'), ('2099-01-01', '0')]:
            with self.subTest(date=date, hour=hour), self.assertRaises(ValueError):
                g._hour_record(date, hour)
        with patch.object(g, 'download_bytes', return_value=listing_response(PREFIX, [], True)):
            with self.assertRaisesRegex(ValueError, '目录不完整'):
                g._hour_record('2025-12-31', '23')


class Conversion(unittest.TestCase):
    def test_irregular_latitude_longitude_wrap_fill_flags_and_clear_pixels(self):
        density, valid, meta = g._convert(synthetic(), record(), width=8, height=8)
        a, m = np.asarray(density), np.asarray(valid)
        self.assertTrue((m[[0, -1]] == 0).all())
        self.assertTrue((a[m == 0] == 0).all())
        # At latitude +33.75 / longitude -67.5 nearest source cell is +42, col 3 (flag 20).
        self.assertEqual(m[2, 2], 0)
        self.assertEqual(m[6, 0], 0)  # source fill
        self.assertEqual(m[3, 5], 0)  # NaN
        self.assertEqual((a[4, 4], m[4, 4]), (0, 255))  # valid clear cell
        # The first and last columns must read source columns 1 and 0 respectively.
        self.assertGreater(a[1, 0], a[1, -1])
        self.assertGreater(a[5, 0], a[1, 0])
        self.assertEqual(meta['coverage'], np.count_nonzero(m) / 64)
        self.assertEqual(meta['polarCoverage'], {'north': 0, 'south': 0})
        self.assertEqual(meta['observedEnd'], g._millis(START) + 599000)

    def test_wrong_hour_bad_georeferencing_or_missing_scene_rejected(self):
        for raw, message in [(synthetic(start=START - dt.timedelta(hours=1)), '观测时间'),
                             (synthetic(corrupt_coords=True), '网格'),
                             (synthetic(all_missing=True), '没有可用像元')]:
            with self.subTest(error=message), self.assertRaisesRegex(ValueError, message):
                g._convert(raw, record(), width=8, height=8)

    def test_saved_image_has_true_alpha_sha_and_enforced_budget(self):
        raw = synthetic()
        item = {**record(), 'rawBytes': len(raw)}
        with tempfile.TemporaryDirectory() as tmp, patch.object(g, '_hour_record', return_value=item), patch.object(g, 'download_bytes', return_value=raw):
            meta = g.build('2025-12-31', '23', tmp)
            image = Path(tmp) / 'image.png'
            saved = image.read_bytes()
            self.assertLess(len(saved), 30_000_000)
            self.assertEqual((meta['sha256'], meta['size']), (hashlib.sha256(saved).hexdigest(), len(saved)))
            with Image.open(image) as f:
                self.assertEqual(f.size, (4096, 2048))
                self.assertEqual(f.mode, 'LA')
                self.assertEqual(f.getpixel((0, 0)), (0, 0))
                self.assertEqual(f.getpixel((4095, 340))[1], 0)  # Outside 60 N.
                self.assertTrue(0 < f.getpixel((4095, 353))[1] < 255)
                self.assertEqual(f.getpixel((4095, 387))[1], 255)
            with patch.object(g, 'IMAGE_LIMIT', 10), self.assertRaisesRegex(ValueError, '超过'):
                g.build('2025-12-31', '23', tmp)
            self.assertEqual(image.read_bytes(), saved)
            with patch.object(g, 'download_bytes', return_value=raw[:-1]), self.assertRaisesRegex(ValueError, '尺寸'):
                g.build('2025-12-31', '23', tmp)


if __name__ == '__main__':
    unittest.main()
