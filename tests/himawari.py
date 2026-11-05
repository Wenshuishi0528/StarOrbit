"""Ten-minute H-9 frame identity, HDF range limits and native-grid validity."""
import datetime as dt
import hashlib
import io
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import h5py
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import himawari as h


nominal = dt.datetime(2025,12,31,23,50,tzinfo=h.UTC)
key = h.ROOT + '2025/12/31/2350/AHI-CMSK_v1r1_h09_s202512312350210_e202512312359404_c202601010004265.nc'
record = {'provider':'himawari','date':'2025-12-31','slot':'23:50','time':h._millis(nominal),'source':h.BASE+key,
          'observedStart':h._millis(nominal+dt.timedelta(seconds=21)),
          'observedEnd':h._millis(nominal+dt.timedelta(minutes=9,seconds=40,milliseconds=400)),
          'createdAt':h._millis(nominal+dt.timedelta(minutes=14,seconds=26,milliseconds=500)),
          'publishedAt':h._millis(nominal+dt.timedelta(minutes=18,seconds=5))}


def listing(prefix, files):
    root = ET.Element('ListBucketResult',{'xmlns':'http://s3.amazonaws.com/doc/2006-03-01/'})
    for k,v in [('Prefix',prefix),('Name',h.BUCKET),('IsTruncated','false')]:
        ET.SubElement(root,k).text = v
    for file in files:
        c = ET.SubElement(root,'Contents')
        for k,v in [('Key',file),('Size','373855589'),('LastModified','2026-01-01T00:08:05Z')]:
            ET.SubElement(c,k).text = v
    return ET.tostring(root)


def synthetic(wrong_navigation=False):
    raw = io.BytesIO()
    with h5py.File(raw,'w') as f:
        for k,v in {'title':'AHI-CMSK','instrument_name':'AHI','satellite_name':'Himawari-9',
                    'time_coverage_start':'2025-12-31T23:50:21Z','time_coverage_end':'2025-12-31T23:59:40Z',
                    'date_created':'2026-01-01T00:04:26Z'}.items():
            f.attrs[k] = np.bytes_(v)
        f['granule_level_quality_flag'] = np.int64(0)
        mask = f.create_dataset('CloudMask',(5500,5500),dtype='i1',chunks=(200,200),compression='gzip',
                                shuffle=True,fillvalue=-128)
        mask.attrs['flag_values'] = np.array([0,1,2,3],dtype='i1')
        mask.attrs['flag_meanings'] = np.bytes_('clear probably_clear probably_cloudy cloudy')
        mask[2600:2800,2540:2750] = 0
        mask[2600:2800,2750:2960] = 3
        # These are independent navigation control points from the real 5500 x 5500 H-9 file.
        lat = f.create_dataset('Latitude',(5500,5500),dtype='f4',chunks=(200,200),compression='gzip',fillvalue=-999)
        lon = f.create_dataset('Longitude',(5500,5500),dtype='f4',chunks=(200,200),compression='gzip',fillvalue=-999)
        for r,c,latitude,longitude in [(2750,2750,-.0090436945,140.70898),(1500,2050,23.77048,126.55030),
                                      (3500,3150,-13.806084,148.17944)]:
            lat[r,c],lon[r,c] = latitude, longitude + (3 if wrong_navigation else 0)
        f['unneeded_data'] = np.zeros(1000000,dtype=np.uint8)
    return raw.getvalue()


class HimawariTests(unittest.TestCase):
    def test_source_directory_across_year_and_updated_revision(self):
        today = dt.datetime(2026,1,1,0,9,tzinfo=h.UTC)
        newer = key.replace('c202601010004265','c202601010006000')
        others = [key.replace('AHI-CMSK','AHI-CPHS'), key.replace('/2350/','/2330/'),
                  key.replace('_h09_','_h08_'),key.replace('/2350/','/2350/../'),
                  key.replace('c202601010004265','c202601010038000')]
        prefixes = []
        def fetch(url, **kwargs):
            self.assertTrue(url.startswith(h.BASE))
            p = parse_qs(urlsplit(url).query)['prefix'][0]
            prefixes.append(p)
            return listing(p,[] if p.endswith('01/01/') else [key,newer,*others])
        with patch.object(h,'download_bytes',side_effect=fetch):
            frame = h._latest_at(today)
        self.assertEqual(prefixes,[h.ROOT+'2026/01/01/',h.ROOT+'2025/12/31/'])
        self.assertEqual(frame['source'],h.BASE+newer)
        self.assertEqual((frame['time'],frame['slot'],frame['observedStart']), (record['time'],'23:50',record['observedStart']))
        self.assertEqual(frame['createdAt'],h._millis(dt.datetime(2026,1,1,0,6,tzinfo=h.UTC)))
        for day,slot in [('2025-12-31','23:55'),('2025-12-31','7:10'),('2025-02-30','23:50'),('2026-01-02','00:00')]:
            with self.subTest(slot=slot),self.assertRaises(ValueError):
                h.selection(day,slot,today)

    def test_real_hdf_index_only_checked_regions_and_atomic_output(self):
        raw = synthetic()
        item = {**record,'rawBytes':len(raw)}
        transferred = []
        def request(url, *, byte_range, limit, **opts):
            self.assertEqual(url,item['source'])
            start,end = byte_range
            self.assertEqual(limit,end-start+1)
            transferred.append(limit)
            return raw[start:end+1]
        with tempfile.TemporaryDirectory() as tmp,patch.object(h,'_listing',return_value=[item]),patch.object(h,'download_bytes',side_effect=request):
            out = h.build(item['date'],item['slot'],tmp)
            path = Path(tmp)/'image.png'
            self.assertEqual(out['sha256'],hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertEqual(out['size'],path.stat().st_size)
            self.assertEqual(out['downloadBytes'],sum(transferred))
            self.assertLess(out['downloadBytes'],len(raw))
            self.assertEqual(out['channel'],'validity')
            with Image.open(path) as im:
                self.assertEqual(im.size,(4096,2048))
                # Neither the far hemisphere nor a missing pixel on the near side is clear sky.
                def at(lon,lat):
                    return im.getpixel((int((lon+180)/360*im.width),int((90-lat)/180*im.height)))
                self.assertEqual(at(0,0),(0,0))
                self.assertEqual(at(140.6,70),(0,0))
                self.assertEqual(at(139.0,0),(0,255))
                self.assertEqual(at(142.0,0),(255,255))
            with patch.object(h,'IMAGE_LIMIT',1),self.assertRaisesRegex(ValueError,'50 MB'):
                h.build(item['date'],item['slot'],tmp)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),out['sha256'])

    def test_decline_untrusted_coordinates_source_time_and_budget(self):
        for wrong_nav,delta,message in [(True,0,'导航'),(False,-600_000,'时间')]:
            raw = synthetic(wrong_nav)
            item = {**record,'rawBytes':len(raw),'observedStart':record['observedStart']+delta}
            with h._RangeReader(item) as reader,patch.object(h,'download_bytes',side_effect=lambda url,*,byte_range,**kw:raw[byte_range[0]:byte_range[1]+1]):
                with self.assertRaisesRegex(ValueError,message):
                    h._read_mask(reader,item,lambda s:None)
        with self.assertRaisesRegex(ValueError,'地址'):
            h._RangeReader({**record,'source':h.BASE+'../../other'})
        with h._RangeReader({**record,'rawBytes':373855589}) as reader,patch.object(h,'TRANSFER_LIMIT',64),patch.object(h,'download_bytes') as fetch:
            with self.assertRaisesRegex(ValueError,'预算'):
                reader.fetch(0,1024)
            fetch.assert_not_called()


if __name__=='__main__':
    unittest.main()
