"""Small fixed-source SDO relay. No user URL, historical scan, or background polling.

Helioviewer normalizes image scales; use its returned rsun/scale together when
choosing the screenshot field. DATE-OBS is the observation time, never HTTP mtime.
"""
from datetime import datetime, timezone
from hashlib import sha256
import json
import math
import re
import struct
import threading
import time
import urllib.parse
import xml.etree.ElementTree as ET

from http_download import download_bytes, DownloadError

API = 'https://api.helioviewer.org/v2/'
CHANNELS = {'hmi': 18, 'aia171': 10, 'aia304': 13, 'aia131': 9}
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_METADATA_BYTES = 64 * 1024


def iso_time(value):
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError('太阳图像的观测时间无效')
    text = value.replace(' ', 'T')
    if not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z?', text):
        raise ValueError('太阳图像的观测时间无效')
    parsed = datetime.fromisoformat(text.rstrip('Z')).replace(tzinfo=timezone.utc)
    if not 2010 <= parsed.year <= 2100:
        raise ValueError('太阳图像的观测时间超出范围')
    return parsed.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def number(value, minimum, maximum):
    if isinstance(value, bool):
        raise ValueError('太阳图像的几何元数据无效')
    result = float(value)
    if not math.isfinite(result) or not minimum <= result <= maximum:
        raise ValueError('太阳图像的几何元数据无效')
    return result


def parse_metadata(raw, header, channel, resolution):
    """Validate metadata from one exact JP2 before requesting its screenshot."""
    image_id = str(raw.get('id', ''))
    if not re.fullmatch(r'\d{1,12}', image_id):
        raise ValueError('太阳图像编号无效')
    closest_at = iso_time(raw.get('date'))
    root = ET.fromstring(header)
    observed_at = iso_time(root.findtext('./fits/DATE-OBS'))
    if abs((datetime.fromisoformat(closest_at.replace('Z', '+00:00')) - datetime.fromisoformat(observed_at.replace('Z', '+00:00'))).total_seconds()) > 2:
        raise ValueError('太阳图像与观测时间不匹配')
    if root.findtext('./fits/TELESCOP') != 'SDO':
        raise ValueError('太阳观测来源不是 SDO')
    instrument = root.findtext('./fits/INSTRUME', '')
    if (channel == 'hmi' and not instrument.startswith('HMI')) or (channel != 'hmi' and not instrument.startswith('AIA')):
        raise ValueError('太阳观测波段不匹配')
    if channel != 'hmi' and round(number(root.findtext('./fits/WAVELNTH'), 1, 10000)) != int(channel[3:]):
        raise ValueError('太阳观测波段不匹配')
    # Our renderer deliberately supports north-up, centred SDO frames only.
    for value in [raw.get('rotation', 0), root.findtext('./helioviewer/HV_ROTATION', '0'), root.findtext('./fits/CROTA2', '0')]:
        if abs(number(value, -360, 360)) > .01:
            raise ValueError('太阳图像不是太阳北极向上的标准画幅')
    width = number(raw.get('width'), 1024, 8192)
    height = number(raw.get('height'), 1024, 8192)
    if width != height:
        raise ValueError('太阳图像画幅不是方形')
    for axis, length in [('X', width), ('Y', height)]:
        if abs(number(raw.get('refPixel' + axis), 0, length + 1) - (length + 1) / 2) > 2 or abs(number(raw.get('offset' + axis, 0), -length, length)) > 2:
            raise ValueError('太阳图像中心不符合标准画幅')
    radius = number(raw.get('rsun'), width * .25, width * .49)
    scale = number(raw.get('scale'), .1, 2)
    ratio = 2 * radius / width
    scale_out = scale * width / resolution
    parameters = dict(date=closest_at, imageScale=f'{scale_out:.12f}', layers=f'[{CHANNELS[channel]},1,100]',
                      events='', eventLabels='false', scale='false', x0=0, y0=0,
                      width=resolution, height=resolution, display='true', watermark='false')
    source_url = API + 'takeScreenshot/?' + urllib.parse.urlencode(parameters)
    token = sha256(f'{channel}:{image_id}:{resolution}'.encode()).hexdigest()[:32]
    return dict(id=f'sdo:{channel}:{image_id}:{resolution}', imageId=image_id, channel=channel,
                observedAt=observed_at, provider='SDO / Helioviewer', sourceUrl=source_url,
                metadataUrl=API + 'getJP2Header/?id=' + image_id,
                width=resolution, height=resolution, radiusFraction=ratio,
                solarCenterUV=[.5, .5], solarNorthUp=True, imageScaleArcsec=scale_out,
                angularRadiusArcsec=radius * scale * number(raw.get('scaleCorrection', 1), .8, 1.2),
                token=token, imageUrl='/api/solar/image?token=' + token)


class SolarService:
    def __init__(self, downloader=download_bytes, now=time.time):
        self.download = downloader
        self.now = now
        self.metadata = {}
        self.tickets = {}
        self.images = {}
        self.lock = threading.RLock()
        self.channel_locks = {name: threading.Lock() for name in CHANNELS}
        self.capacity = threading.BoundedSemaphore(2)

    def latest(self, channel, resolution):
        if channel not in CHANNELS or str(resolution) not in ('1024', '2048'):
            raise ValueError('请选择有效的太阳波段和 1K / 2K 分辨率')
        resolution = int(resolution)
        # Same-band calls share a short metadata cache; at most two independent
        # channels occupy upstream workers. No loop over other wavelengths.
        with self.channel_locks[channel], self.capacity:
            cached = self.metadata.get(channel)
            if not cached or self.now() - cached['checked'] >= 60:
                params = urllib.parse.urlencode(dict(date=datetime.fromtimestamp(self.now(), timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), sourceId=CHANNELS[channel]))
                raw = json.loads(self.download(API + 'getClosestImage/?' + params, limit=MAX_METADATA_BYTES, timeout=15, attempts=1))
                image_id = str(raw.get('id', ''))
                if not re.fullmatch(r'\d{1,12}', image_id):
                    raise ValueError('太阳图像编号无效')
                header = self.download(API + 'getJP2Header/?id=' + image_id, limit=MAX_METADATA_BYTES, timeout=12, attempts=1)
                # Validate before replacing good metadata.
                parse_metadata(raw, header, channel, resolution)
                cached = dict(raw=raw, header=header, checked=self.now())
                self.metadata[channel] = cached
            record = parse_metadata(cached['raw'], cached['header'], channel, resolution)
            with self.lock:
                # Bound tickets to one per band/resolution; no caller-controlled
                # URL or arbitrary source/date can reach the download endpoint.
                for key, old in list(self.tickets.items()):
                    if old['channel'] == channel and old['width'] == resolution:
                        del self.tickets[key]
                self.tickets[record['token']] = record
            return dict(record)

    def image(self, token):
        if not isinstance(token, str) or not re.fullmatch(r'[a-f0-9]{32}', token):
            raise ValueError('太阳图像请求无效，请重新检查数据')
        with self.lock:
            record = self.tickets.get(token)
        if not record:
            raise ValueError('太阳图像请求已失效，请重新检查数据')
        channel = record['channel']
        with self.channel_locks[channel], self.capacity:
            with self.lock:
                cached = self.images.get(channel)
                if cached and cached['token'] == token:
                    return cached['data']
            data = self.download(record['sourceUrl'], limit=MAX_IMAGE_BYTES, timeout=35, attempts=1)
            if len(data) < 24 or data[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', data[16:24]) != (record['width'], record['height']):
                raise ValueError('太阳图像响应的格式或尺寸无效')
            with self.lock:
                # Four channels x <= 8 MiB, latest one image per channel.
                self.images[channel] = dict(token=token, data=data)
            return data


service = SolarService()
