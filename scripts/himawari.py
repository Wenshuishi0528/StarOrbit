"""Remap the NOAA/JMA Himawari-9 AHI 2 km cloud classes to a global validity-masked texture."""
from bisect import bisect_right
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import hashlib
import io
import json
import re
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import urlencode
import xml.etree.ElementTree as ET

from http_download import download_bytes

UTC = dt.timezone.utc
BUCKET = 'noaa-himawari9'
BASE = 'https://' + BUCKET + '.s3.amazonaws.com/'
ROOT = 'AHI-L2-FLDK-Clouds/'
KEY = re.compile(ROOT + r'(\d{4}/\d{2}/\d{2}/\d{4})/AHI-CMSK_(v\d+r\d+)_h09_'
                 r's(\d{15})_e(\d{15})_c(\d{15})\.nc')
WIDTH, HEIGHT = 4096, 2048
# Budget for transfers from one scientific object, including failed/retried ranges.
TRANSFER_LIMIT = 30_000_000
IMAGE_LIMIT = 50_000_000
BLOCK = 65536
WORKERS = 6
_latest_lock = threading.Lock()
_cached = None


def _millis(stamp):
    return int(stamp.timestamp() * 1000)


def _key_time(value):
    return dt.datetime.strptime(value[:14], '%Y%m%d%H%M%S').replace(
        microsecond=int(value[-1]) * 100000, tzinfo=UTC)


def _iso_time(value):
    if isinstance(value, bytes):
        value = value.decode('ascii')
    stamp = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if stamp.tzinfo is None:
        raise ValueError('向日葵文件缺少时区')
    return stamp.astimezone(UTC)


def selection(date, slot, now=None):
    if (not isinstance(date, str) or not isinstance(slot, str)
            or not re.fullmatch(r'\d{4}-\d\d-\d\d', date)
            or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]0', slot)):
        raise ValueError('请选择有效的向日葵日期和 UTC 十分钟时次')
    stamp = dt.datetime.fromisoformat(date + 'T' + slot).replace(tzinfo=UTC)
    if stamp > (now or dt.datetime.now(UTC)):
        raise ValueError('不能查询未来时刻')
    return stamp


def _listing(prefix, now):
    # Only keys on this fixed public bucket, product, satellite and date can become sources.
    params = {'list-type': 2, 'prefix': prefix, 'max-keys': 600}
    records = []
    for _ in range(3):
        raw = download_bytes(BASE + '?' + urlencode(params), limit=600_000, timeout=25, attempts=2, attempt_timeout=10)
        try:
            root = ET.fromstring(raw)
        except ET.ParseError as error:
            raise ValueError('向日葵时次目录无效') from error
        if root.findtext('{*}Name') != BUCKET or root.findtext('{*}Prefix') != prefix:
            raise ValueError('向日葵时次目录来源有误')
        for entry in root.findall('{*}Contents'):
            key = entry.findtext('{*}Key', '')
            match = KEY.fullmatch(key)
            if not match or not key.startswith(prefix):
                continue
            try:
                start, end, created = map(_key_time, match.groups()[2:])
                published = _iso_time(entry.findtext('{*}LastModified', ''))
                size = int(entry.findtext('{*}Size', '0'))
            except (ValueError, TypeError):
                continue
            nominal = start.replace(second=0, microsecond=0)
            if (start.minute % 10 or nominal.strftime('%Y/%m/%d/%H%M') != match[1]
                    or not start <= end <= nominal + dt.timedelta(minutes=10)
                    or not end <= created <= published <= now or not BLOCK < size <= 1_000_000_000):
                continue
            records.append({'provider': 'himawari', 'date': nominal.date().isoformat(),
                            'slot': nominal.strftime('%H:%M'), 'time': _millis(nominal),
                            'createdAt': _millis(created), 'publishedAt': _millis(published),
                            'observedStart': _millis(start), 'observedEnd': _millis(end),
                            'source': BASE + key, 'release': 'Himawari-9 AHI-CMSK ' + match[2],
                            'rawBytes': size, 'remote': True})
        if root.findtext('{*}IsTruncated') == 'false':
            return records
        token = root.findtext('{*}NextContinuationToken')
        if not token or len(token) > 2048:
            break
        params['continuation-token'] = token
    raise ValueError('向日葵时次目录不完整，请稍后重试')


def _newest(rows):
    return max(rows, key=lambda r: (r['time'], r['createdAt'], r['publishedAt']))


def _latest_at(now):
    for day in (now.date(), now.date() - dt.timedelta(days=1)):
        rows = _listing(ROOT + day.strftime('%Y/%m/%d/'), now)
        if rows:
            return _newest(rows)
    raise ValueError('向日葵最近两天没有已发布的云分类图')


def latest(force=False):
    global _cached
    with _latest_lock:
        if not force and _cached and time.monotonic() < _cached[0]:
            return dict(_cached[1])
        frame = _latest_at(dt.datetime.now(UTC))
        _cached = time.monotonic() + 90, frame
        return dict(frame)


class _RangeReader(io.RawIOBase):
    """Serve h5py's seeks from metadata blocks and coalesced cloud-mask chunks, not a full file."""
    def __init__(self, record):
        self.url = record['source']
        if not self.url.startswith(BASE) or not KEY.fullmatch(self.url[len(BASE):]):
            raise ValueError('向日葵数据地址无效')
        self.size = record['rawBytes']
        self.pos = self.received = self.reserved = 0
        self.blocks = {}
        self.starts = []
        self.groups = []
        self.lock = threading.Lock()
        self.deadline = time.monotonic() + 7 * 60

    def fetch(self, start, end):
        # end is exclusive. download_bytes verifies HTTPS, 206 and exact Content-Range.
        if not 0 <= start < end <= self.size or end - start > 2_000_000:
            raise ValueError('向日葵分段索引无效')
        length = end - start
        with self.lock:
            if self.reserved + 2 * length > TRANSFER_LIMIT:
                raise ValueError('向日葵必要字段超过 30 MB 分段传输预算')
            self.reserved += 2 * length  # Both transport attempts are bounded, including failures.
        left = self.deadline - time.monotonic()
        if left <= 0:
            raise ValueError('向日葵分段下载超时，请重新下载')
        data = download_bytes(self.url, byte_range=(start, end-1), limit=length,
                              timeout=min(40, left), attempts=2, attempt_timeout=14)
        with self.lock:
            self.received += len(data)
        return data

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        if whence not in (0, 1, 2):
            raise ValueError('向日葵 HDF 寻址无效')
        position = (0, self.pos, self.size)[whence] + offset
        if not 0 <= position <= self.size:
            raise ValueError('向日葵 HDF 索引超出文件')
        self.pos = position
        return position

    def readinto(self, buffer):
        end = min(self.size, self.pos + len(buffer))
        written = 0
        while self.pos < end:
            index = bisect_right(self.starts, self.pos) - 1
            if index >= 0 and self.pos < self.groups[index][1]:
                start, _, data = self.groups[index]
            else:
                start = self.pos // BLOCK * BLOCK
                if start not in self.blocks:
                    self.blocks[start] = self.fetch(start, min(start + BLOCK, self.size))
                data = self.blocks[start]
            offset = self.pos - start
            n = min(len(data)-offset, end-self.pos)
            buffer[written:written+n] = data[offset:offset+n]
            written += n
            self.pos += n
        return written

    def preload(self, dataset, progress):
        chunk_shape = dataset.chunks
        if not chunk_shape or dataset.dtype.name != 'int8' or dataset.compression != 'gzip':
            raise ValueError('向日葵云分类分块格式已变化')
        chunks = []
        expected = ((dataset.shape[0]+chunk_shape[0]-1)//chunk_shape[0]
                    * ((dataset.shape[1]+chunk_shape[1]-1)//chunk_shape[1]))
        count = dataset.id.get_num_chunks()
        if not 0 < count <= min(expected, 4096):
            raise ValueError('向日葵云分类分块数无效')
        for i in range(count):
            c = dataset.id.get_chunk_info(i)
            start = c.byte_offset
            if start is None or start < 0 or start+c.size > self.size or not 0 < c.size <= 2_000_000:
                raise ValueError('向日葵云分类分块超出文件')
            chunks.append((start, start+c.size))
        ranges = []
        for start,end in sorted(chunks):
            if ranges and start < ranges[-1][1]:
                raise ValueError('向日葵云分类分块重叠')
            if ranges and start-ranges[-1][1] <= BLOCK and end-ranges[-1][0] <= 2_000_000:
                ranges[-1][1] = end
            else:
                ranges.append([start,end])
        if self.reserved + 2 * sum(e-s for s,e in ranges) > TRANSFER_LIMIT:
            # Irregular layouts can make joined gaps expensive. Retry the plan with only data chunks.
            ranges = sorted(chunks)
            if self.reserved + 2 * sum(e-s for s,e in ranges) > TRANSFER_LIMIT:
                raise ValueError('向日葵必要字段超过 30 MB 分段传输预算')
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            for i in range(0, len(ranges), WORKERS):
                batch = ranges[i:i+WORKERS]
                for (s,e), data in zip(batch, pool.map(lambda pair:self.fetch(*pair), batch)):
                    self.groups.append((s,e,data))
                progress(f'读取向日葵云分类 {len(self.groups)}/{len(ranges)}，已读 {self.received/1e6:.1f} MB')
        self.starts = [g[0] for g in self.groups]


def _project(lat, lon):
    # JMA Himawari Standard Data full-disk 2 km grid. H-9 subpoint 140.7 E.
    # Match navigation in the product itself before applying these fixed-grid coefficients.
    import numpy as np
    lat, dlon = np.radians(lat), np.radians(lon-140.7)
    ecc = 1 - (6356.7523/6378.137)**2
    n = 6378.137 / np.sqrt(1-ecc*np.sin(lat)**2)
    x = n * np.cos(lat) * np.cos(dlon)
    y = n * np.cos(lat) * np.sin(dlon)
    z = n * (1-ecc) * np.sin(lat)
    dx = 42164. - x
    scale = np.degrees(1) * 20466275 / 65536
    col = 2749.5 + scale * np.arctan2(y,dx)
    row = 2749.5 - scale * np.arctan2(z,np.hypot(dx,y))
    return row, col, dx*x - y*y - z*z/(1-ecc) > 0


def _read_mask(reader, record, progress):
    import h5py
    import numpy as np
    reader.seek(0)
    if reader.read(8) != b'\x89HDF\r\n\x1a\n':
        raise ValueError('向日葵文件不是 HDF5')
    with h5py.File(reader, 'r') as f:
        if (f.attrs.get('satellite_name') != b'Himawari-9' or f.attrs.get('instrument_name') != b'AHI'
                or f.attrs.get('title') != b'AHI-CMSK' or not all(k in f for k in ('CloudMask','Latitude','Longitude','granule_level_quality_flag'))):
            raise ValueError('向日葵产品或云分类字段无效')
        for key,attr in [('observedStart','time_coverage_start'),('observedEnd','time_coverage_end'),('createdAt','date_created')]:
            stamp = _millis(_iso_time(f.attrs[attr]))
            if abs(stamp-record[key]) >= 1000:
                raise ValueError('向日葵文件观测或制作时间与时次目录不符')
        if not 0 <= int(f['granule_level_quality_flag'][()]) < 63:
            raise ValueError('向日葵整幅红外通道失效，未生成云图')
        ds, lat, lon = f['CloudMask'], f['Latitude'], f['Longitude']
        if (ds.shape != (5500,5500) or lat.shape != ds.shape or lon.shape != ds.shape
                or ds.attrs.get('flag_meanings') != b'clear probably_clear probably_cloudy cloudy'
                or list(ds.attrs.get('flag_values',[])) != [0,1,2,3] or ds.fillvalue != -128):
            raise ValueError('向日葵云分类图例或网格已变化')
        for row, col in [(2750,2750),(1500,2050),(3500,3150)]:
            latitude, longitude = float(lat[row,col]), float(lon[row,col])
            r, c, visible = _project(latitude, longitude)
            if not visible or not np.isfinite(r+c) or abs(r-row) > 1 or abs(c-col) > 1:
                raise ValueError('向日葵实际导航网格与投影不符')
        reader.preload(ds, progress)
        pixels = ds[:]
    if not np.all((pixels == -128) | ((pixels >= 0) & (pixels <= 3))):
        raise ValueError('向日葵返回未知云分类值')
    return pixels


def _render(mask, width=WIDTH, height=HEIGHT):
    import numpy as np
    from PIL import Image
    shades = np.array([0, 60, 195, 255], dtype=np.uint8)
    texture = np.zeros((height,width,2), dtype=np.uint8)
    lon = ((np.arange(width)+.5)*360/width-180)[None,:]
    lat = 90-(np.arange(height)+.5)*180/height
    for y in range(0,height,64):
        r,c,visible = _project(lat[y:y+64,None],lon)
        rr,cc = np.rint(r).astype(int),np.rint(c).astype(int)
        sampled = visible & (rr >= 0) & (rr < mask.shape[0]) & (cc >= 0) & (cc < mask.shape[1])
        classes = np.full(rr.shape,-128,dtype=np.int8)
        classes[sampled] = mask[rr[sampled],cc[sampled]]
        valid = classes != -128
        texture[y:y+64,:,0] = np.where(valid,shades[np.where(valid,classes,0)],0)
        texture[y:y+64,:,1] = valid.astype(np.uint8)*255
    alpha = texture[:,:,1]
    coverage = np.count_nonzero(alpha)/alpha.size
    if not coverage:
        raise ValueError('向日葵该时次没有可用的云分类')
    polar = {name:float(np.count_nonzero(alpha[rows])) / alpha[rows].size
             for name,rows in [('north',lat>=67.5),('south',lat<=-67.5)]}
    return Image.fromarray(texture), {'coverage': coverage, 'polarCoverage': polar,
            'nativeResolution': '5500×5500', 'resolution': f'{width}×{height}', 'channel': 'validity'}


def build(date, slot, output, progress=lambda s: None):
    now = dt.datetime.now(UTC)
    nominal = selection(date,slot,now)
    progress('正在核对向日葵十分钟观测目录…')
    rows = _listing(ROOT + nominal.strftime('%Y/%m/%d/%H%M/'),now)
    if not rows:
        raise ValueError('该时次没有已发布的向日葵云分类图')
    record = _newest(rows)
    with _RangeReader(record) as reader:
        mask = _read_mask(reader,record,progress)
        received = reader.received
    progress('正在重投影向日葵云分类并保存…')
    image, meta = _render(mask)
    output = Path(output)
    output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output) as tmp:
        path = Path(tmp)/'image.png'
        image.save(path, compress_level=6)
        size = path.stat().st_size
        if size > IMAGE_LIMIT:
            raise ValueError('向日葵云图超过 50 MB，未保存')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        path.replace(output/'image.png')
    return {**record, **meta, 'size':size, 'sha256':digest, 'downloadBytes':received,
            'processing':'himawari-class-v1', 'manualEligible':True,
            'attribution':'JMA Himawari-9 / NOAA NESDIS AHI-CMSK; reprojected by StarOrbit'}


if __name__ == '__main__':
    try:
        data = build(*sys.argv[1:4],progress=lambda s:print(json.dumps({'status':s}),flush=True))
        print(json.dumps({'result':data}),flush=True)
    except Exception as error:
        print(json.dumps({'error':str(error),'retryable':getattr(error,'retryable',False)}),flush=True)
        sys.exit(1)
