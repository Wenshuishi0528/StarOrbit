"""Convert one exact SATCORPS frame; the service saves it in the shared library."""
import datetime, hashlib, json, tempfile, time
from pathlib import Path
from satcorps import BASE, request, fetch_resuming, phase_coverage, acceptable, convert, write_cloud_png
from cloud_quality import inspect_image, quality_ok, describe_reasons
from http_download import DownloadError

def selection(date, hour):
    day = datetime.date.fromisoformat(date)
    if day.isoformat() != date or str(int(hour)) != str(hour) or not 0 <= int(hour) <= 23:
        raise ValueError('请选择有效日期和 UTC 小时')
    dt = datetime.datetime.combine(day, datetime.time(int(hour)), datetime.timezone.utc)
    if dt.timestamp() > time.time():
        raise ValueError('不能查询未来时刻')
    return dt.timestamp(), BASE + dt.strftime('%Y/%m/%d/satcorps-gcc.v02a.geoleo.glob-comp.%Y%j.%H00.3km.nc')

def query(date, hour):
    reference, url = selection(date, hour)
    try:
        header = request(url, (0, 65535), 65536, time.monotonic()+60)
    except DownloadError as error:
        if error.status == 404:
            return {'available': False, 'message': '该日期／时次没有此版本数据；可选择其他时次查询'}
        raise
    if len(header) < 48 or header[:8] != b'\x89HDF\r\n\x1a\n' or header[8] != 0 or header[13] != 8:
        raise ValueError('图源格式已变化，不能确认可用性')
    size = int.from_bytes(header[40:48], 'little')
    if not 1000000 < size < 4_000_000_000:
        raise ValueError('图源文件头无效')
    return {'available': True, 'time': int(reference*1000), 'source': url,
            'release': 'GCC V2A', 'rawBytes': size,
            'message': '时次文件存在，下载后检查覆盖和图像质量。科学字段最多下载 220 MB，最终云图以 30 MB 为目标，上限 50 MB。'}

def build(date, hour, output, progress=lambda message: None):
    reference, url = selection(date, hour)
    output = Path(output); output.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic()+16*60
    with tempfile.TemporaryDirectory(prefix='fields-',dir=output) as tmp:
        path = Path(tmp)/'fields.nc'; reuse = {}
        downloaded = fetch_resuming(url, path, lambda s:progress('观测覆盖：'+s), ('cloud_phase', 'lat'), reuse=reuse, deadline=deadline)
        progress('正在检查观测覆盖…');coverage=phase_coverage(path)
        if not 0 < coverage.get('coverage',0) <= 1:
            raise ValueError('该时次没有有效观测数据，请选择列表中的其他版本')
        downloaded += fetch_resuming(url, path, lambda s:progress('云层数据：'+s), reuse=reuse, deadline=deadline)
        progress('正在转换 8K 云图…');image, mask, meta = convert(path, reference)
    if not 0 < meta.get('coverage',0) <= 1:
        raise ValueError('该时次没有有效云层数据，不能加载')
    progress('正在检查图像并保存…')
    from PIL import Image
    target = output/'image.png'; pending = output/'image.tmp'
    try:
        encoding = write_cloud_png(pending, image, mask)
        with Image.open(pending) as texture:quality = inspect_image(texture)
        pending.replace(target)
    finally:
        pending.unlink(missing_ok=True)
    warnings=list(encoding.get('warnings', []))
    if not acceptable(meta):warnings.append('局部或极区缺测；缺测位置显示内置静态云图')
    if not quality_ok(quality):warnings.append(describe_reasons(quality['reasons']))
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    return {**meta, 'source': url, 'release': 'GCC V2A', 'downloadBytes': downloaded,
            **encoding, 'sha256': digest, 'quality': {**quality, 'sha256': digest},
            'warnings':warnings,'manualEligible':True}

if __name__ == '__main__':
    import sys
    try:
        result = build(*sys.argv[1:4], progress=lambda s: print(json.dumps({'status': s}), flush=True))
        print(json.dumps({'result': result}), flush=True)
    except Exception as error:
        print(json.dumps({'error': str(error), 'retryable': getattr(error, 'retryable', False)}), flush=True)
        sys.exit(1)
