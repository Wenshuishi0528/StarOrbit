"""Download one NOAA longwave IR mosaic and draw a 4K, validity-masked cloud proxy."""
import datetime as dt
import hashlib
import io
import json
import re
import sys
import tempfile
import threading
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlencode

from http_download import download_bytes

BUCKET = 'noaa-gmgsi-pds'
BASE = 'https://' + BUCKET + '.s3.amazonaws.com/'
UTC = dt.timezone.utc
WIDTH, HEIGHT = 4096, 2048
RAW_LIMIT = 30_000_000
IMAGE_LIMIT = 50_000_000
# OSPO describes the operational product's coverage as 60 N to 60 S.
LAT_LIMIT = 60
KEY = re.compile(
    r'GMGSI_LW/(\d{4}/\d{2}/\d{2}/\d{2})/GLOBCOMPLIR_(v\d+r\d+)_blend_'
    r's(\d{15})_e(\d{15})_c(\d{15})\.nc'
)
_latest_lock = threading.Lock()
_cached = None


def _key_time(value):
    # Filenames have tenths of seconds. The CF time_coverage_* fields use seconds.
    return dt.datetime.strptime(value[:14], '%Y%m%d%H%M%S').replace(
        microsecond=int(value[-1]) * 100000, tzinfo=UTC)


def _millis(value):
    return int(value.timestamp() * 1000)


def _iso_time(value):
    if isinstance(value, bytes):
        value = value.decode('ascii')
    stamp = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if stamp.tzinfo is None:
        raise ValueError('NOAA 文件缺少 UTC 时间信息')
    return stamp.astimezone(UTC)


def _listing(prefix, now):
    query = urlencode({'list-type': 2, 'prefix': prefix, 'max-keys': 512})
    xml = download_bytes(BASE + '?' + query, limit=512_000, timeout=22, attempts=2,
                         attempt_timeout=10)
    root = ET.fromstring(xml)
    if (root.findtext('{*}Name') != BUCKET or root.findtext('{*}Prefix') != prefix
            or root.findtext('{*}IsTruncated') != 'false'):
        raise ValueError('NOAA 时次目录不完整，请稍后重试')
    records = []
    for entry in root.findall('{*}Contents'):
        key = entry.findtext('{*}Key', '')
        match = KEY.fullmatch(key)
        if not match or not key.startswith(prefix):
            continue
        try:
            start, end, created = (_key_time(s) for s in match.groups()[2:])
            published = _iso_time(entry.findtext('{*}LastModified'))
            size = int(entry.findtext('{*}Size', '0'))
        except (AttributeError, TypeError, ValueError):
            continue
        if (start.strftime('%Y/%m/%d/%H') != match[1] or start.minute or start.second or start.microsecond
                or not start <= end < start + dt.timedelta(hours=1)
                or not end <= created <= now or start > published or published > now
                or not 64_000 <= size <= RAW_LIMIT):
            continue
        records.append({
            'provider': 'gmgsi', 'date': start.date().isoformat(), 'slot': str(start.hour),
            'time': _millis(start), 'source': BASE + key, 'release': 'NOAA GMGSI LW ' + match[2],
            'rawBytes': size, 'publishedAt': _millis(published), 'remote': True,
            'createdAt': _millis(created), 'sceneEnd': _millis(end),
        })
    return records


def _latest_at(now):
    # Query two day prefixes (not 24 individual hours) so midnight UTC works.
    for day in (now.date(), now.date() - dt.timedelta(days=1)):
        rows = _listing(day.strftime('GMGSI_LW/%Y/%m/%d/'), now)
        if rows:
            return max(rows, key=lambda r: (r['time'], r['createdAt'], r['publishedAt']))
    raise ValueError('NOAA 最近两天的目录没有可用长波红外合成图')


def latest(force=False):
    global _cached
    with _latest_lock:
        if not force and _cached and time.monotonic() < _cached[0]:
            return dict(_cached[1])
        result = _latest_at(dt.datetime.now(UTC))
        _cached = (time.monotonic() + 120, result)
        return dict(result)


def _hour_record(date, hour):
    day = dt.date.fromisoformat(date)
    hour = str(hour)
    if day.isoformat() != date or not re.fullmatch(r'([0-9]|1[0-9]|2[0-3])', hour):
        raise ValueError('请选择有效日期和 UTC 小时')
    start = dt.datetime.combine(day, dt.time(int(hour)), UTC)
    now = dt.datetime.now(UTC)
    if start > now:
        raise ValueError('不能查询未来时刻')
    rows = _listing(start.strftime('GMGSI_LW/%Y/%m/%d/%H/'), now)
    if not rows:
        raise ValueError('该时次没有可用的 NOAA 长波红外合成图')
    return max(rows, key=lambda r: (r['createdAt'], r['publishedAt']))


def _nearest(axis, targets):
    """Index of the nearest cell on a sorted one-dimensional coordinate axis."""
    import numpy as np
    right = np.clip(np.searchsorted(axis, targets), 1, len(axis) - 1)
    left = right - 1
    return np.where(targets - axis[left] <= axis[right] - targets, left, right)


def _sample_indices(f, shape, width, height):
    import numpy as np
    ny, nx = shape
    if (f['lat'].shape != shape or f['lon'].shape != shape
            or not (3 <= nx <= 10000 and 3 <= ny <= 5000 and nx * ny <= 25_000_000)):
        raise ValueError('NOAA 网格尺寸无效')
    lat = f['lat'][:, 0].astype('float64')
    lon = f['lon'][0, :].astype('float64')
    if (not np.all(np.isfinite(lat) & (abs(lat) <= 90)) or not np.all(np.isfinite(lon) & (abs(lon) <= 180))
            or not (np.all(np.diff(lat) > 0) or np.all(np.diff(lat) < 0))
            or not np.allclose(f['lat'][:, [nx//2, nx-1]], lat[:, None], atol=.0001, rtol=0)
            or not np.allclose(f['lon'][[ny//2, ny-1], :], lon[None, :], atol=.0001, rtol=0)):
        raise ValueError('NOAA 网格已变化，不能安全定位')
    # The source starts near +180, wraps, then runs east. Extend it cyclically
    # so an output pixel at the antimeridian can sample either side of the seam.
    ix = np.argsort(lon)
    ordered = lon[ix]
    wrapped = np.r_[ordered[-1] - 360, ordered, ordered[0] + 360]
    if np.any(np.diff(wrapped) <= 0) or np.diff(wrapped).max() > 3 * 360 / nx:
        raise ValueError('NOAA 经度覆盖不完整')
    x = -180 + (np.arange(width) + .5) * 360 / width
    cols = ix[(_nearest(wrapped, x) - 1) % nx]
    y = 90 - (np.arange(height) + .5) * 180 / height
    iy = np.argsort(lat)
    rows = iy[_nearest(lat[iy], y)]
    usable = (abs(y) <= LAT_LIMIT) & (y >= lat.min()) & (y <= lat.max())
    return rows, cols, y, usable


def _convert(raw, record, width=WIDTH, height=HEIGHT):
    import h5py
    import numpy as np
    from PIL import Image

    with h5py.File(io.BytesIO(raw), 'r') as f:
        if f.attrs.get('title') != b'GLOBCOMPLIR' or not all(k in f for k in ('data', 'dqf', 'lat', 'lon')):
            raise ValueError('NOAA 文件不是长波红外合成图')
        start = _iso_time(f.attrs['time_coverage_start'])
        end = _iso_time(f.attrs['time_coverage_end'])
        if (abs(_millis(start) - record['time']) >= 1000 or abs(_millis(end) - record['sceneEnd']) >= 1000
                or end < start):
            raise ValueError('NOAA 文件覆盖的观测时间与所选时次不匹配')
        data, flags = f['data'], f['dqf']
        if (len(data.shape) != 3 or data.shape[0] != 1 or flags.shape != data.shape
                or data.attrs.get('long_name') != b'0-255 Brightness Temperature'):
            raise ValueError('NOAA 红外亮度编码已变化，不能套用当前显示映射')
        ny, nx = data.shape[1:]
        rows, cols, y, usable = _sample_indices(f, (ny, nx), width, height)
        density = np.zeros((height, width), dtype=np.uint8)
        validity = np.zeros_like(density)
        fill = np.asarray(data.attrs.get('_FillValue', -9999)).item()
        for top in range(0, height, 64):
            bottom = min(top + 64, height)
            if not usable[top:bottom].any():
                continue
            rr = rows[top:bottom]
            lo, hi = int(rr.min()), int(rr.max()) + 1
            values = data[0, lo:hi, :][np.ix_(rr - lo, cols)]
            dqf = flags[0, lo:hi, :][np.ix_(rr - lo, cols)]
            good = (usable[top:bottom, None] & (dqf == 0) & (values != fill)
                    & np.isfinite(values) & (values >= 0) & (values <= 255))
            # NOAA distributes LW as display brightness, not calibrated Kelvin.
            # This fixed contrast curve emphasizes cool cloud systems; it is not
            # a cloud classifier. Warm low clouds and cool ground can look alike.
            t = np.clip((np.where(good, values, 0).astype('float32') - 95) / 110, 0, 1)
            density[top:bottom] = np.rint(255 * t * t * (3 - 2*t)).astype('uint8')
            validity[top:bottom] = good.astype('uint8') * 255
    coverage = np.count_nonzero(validity) / validity.size
    if not coverage:
        raise ValueError('NOAA 该时次没有可用像元')
    polar = {k: float(np.count_nonzero(validity[mask])) / validity[mask].size
             for k, mask in [('north', y >= 67.5), ('south', y <= -67.5)]}
    # Fade only the last three degrees inside the valid belt to blend with the
    # app's fallback without inventing observations on the other side. Coverage
    # above is measured from DQF, before this display-only feather.
    fade = np.clip((LAT_LIMIT - abs(y)) / 3, 0, 1)
    fade = fade * fade * (3 - 2*fade)
    edge = usable & (fade < 1)
    validity[edge] = np.rint(validity[edge] * fade[edge, None]).astype('uint8')
    return Image.fromarray(density), Image.fromarray(validity), {
        'observedStart': _millis(start), 'observedEnd': _millis(end),
        'coverage': coverage, 'polarCoverage': polar, 'nativeResolution': f'{nx}×{ny}',
        'resolution': f'{width}×{height}', 'channel': 'validity',
    }


def build(date, hour, output, progress=lambda s: None):
    from PIL import Image
    from cloud_quality import inspect_image

    progress('正在核对 NOAA 小时目录…')
    record = _hour_record(date, hour)
    progress('正在下载 NOAA 长波红外文件…')
    raw = download_bytes(record['source'], limit=record['rawBytes'], timeout=95, attempts=3,
                         attempt_timeout=40)
    if len(raw) != record['rawBytes'] or not raw.startswith(b'\x89HDF\r\n\x1a\n'):
        raise ValueError('NOAA 原始文件尺寸或格式不匹配，未保存')
    progress('正在定位红外像元并裁去无效区域…')
    density, mask, meta = _convert(raw, record)
    quality = inspect_image(density)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    # 4K grayscale + validity is 16.8 MB even before lossless PNG compression.
    with tempfile.TemporaryDirectory(dir=output) as tmp:
        pending = Path(tmp) / 'image.png'
        Image.merge('LA', (density, mask)).save(pending, compress_level=4)
        size = pending.stat().st_size
        if size > IMAGE_LIMIT:
            raise ValueError('NOAA 处理后云图超过 50 MB，未保存')
        digest = hashlib.sha256(pending.read_bytes()).hexdigest()
        pending.replace(output / 'image.png')
    return {**record, **meta, 'sha256': digest, 'size': size, 'downloadBytes': len(raw),
            'quality': {**quality, 'sha256': digest}, 'manualEligible': True,
            'processing': 'gmgsi-ir-v1', 'attribution': 'NOAA/NESDIS GMGSI; StarOrbit IR visualization'}


if __name__ == '__main__':
    try:
        result = build(*sys.argv[1:4], progress=lambda s: print(json.dumps({'status': s}), flush=True))
        print(json.dumps({'result': result}), flush=True)
    except Exception as error:
        print(json.dumps({'error': str(error), 'retryable': getattr(error, 'retryable', False)}), flush=True)
        sys.exit(1)
