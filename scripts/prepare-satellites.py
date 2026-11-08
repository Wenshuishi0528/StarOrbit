#!/usr/bin/env python3
"""Extract a small JPL SPK type-2 subset using HTTP byte ranges.

Requires requests and numpy. No full multi-GB kernel download is performed.
Run from repository root: python3 scripts/prepare-satellites.py
Raw source records are cached under output/satellite-source (not shipped).
"""
import concurrent.futures
import datetime
import gzip
import hashlib
import json
import math
import pathlib
import struct
import requests
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / 'output/satellite-source'
OUT = ROOT / 'assets/satellites'
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
START, STOP = '2026-01-01T00:00:00Z', '2031-01-01T00:00:00Z'
KERNELS = {'mar099': [499, 401, 402], 'sat441l': [699, 601, 602, 603, 604, 605, 606, 608],
           'ura182': [799, 701, 702, 703, 704, 705], 'nep098': [899, 801]}


def et(utc):
    base = datetime.datetime.fromisoformat(utc.replace('Z', '+00:00')).timestamp() - 946728000 + 69.184
    result = base
    for _ in range(3):
        mean = 6.239996 + 1.99096871e-7 * result
        result = base + .001657 * math.sin(mean + .01671 * math.sin(mean))
    return result


def read_range(url, start, length, cache):
    if cache.exists() and cache.stat().st_size == length:
        return cache.read_bytes()
    # Reject a server ignoring Range; never download the entire kernel.
    with requests.get(url, headers={'Range': f'bytes={start}-{start + length - 1}'}, timeout=90, stream=True) as response:
        response.raise_for_status()
        expected = f'bytes {start}-{start + length - 1}/'
        if response.status_code != 206 or not response.headers.get('Content-Range', '').startswith(expected):
            raise ValueError('Server did not honor requested SPK byte range')
        data = response.raw.read(length + 1)
        if len(data) != length:
            raise ValueError('Incomplete SPK byte range')
    cache.write_bytes(data)
    return data


def descriptors(kernel):
    url = f'https://ssd.jpl.nasa.gov/ftp/eph/satellites/bsp/{kernel}.bsp'
    header = read_range(url, 0, 1024, CACHE / f'{kernel}-header.bin')
    if header[:7] != b'DAF/SPK' or header[88:96].strip() != b'LTL-IEEE':
        raise ValueError('Expected a little-endian DAF/SPK kernel')
    if struct.unpack_from('<2i', header, 8) != (2, 6):
        raise ValueError('Unexpected SPK summary format')
    record = struct.unpack_from('<i', header, 76)[0]
    result = []
    while record:
        raw = read_range(url, (record - 1) * 1024, 1024, CACHE / f'{kernel}-summary-{record}.bin')
        next_record, _, count = struct.unpack_from('<3d', raw)
        for index in range(int(count)):
            row = struct.unpack_from('<2d6i', raw, 24 + index * 40)
            if row[2] in KERNELS[kernel] and row[0] <= et(START) and row[1] >= et(STOP):
                if row[4:6] != (1, 2):
                    raise ValueError('Expected J2000 SPK type 2')
                result.append((kernel, row))
        record = int(next_record)
    if sorted(row[2] for _, row in result) != sorted(KERNELS[kernel]):
        raise ValueError('Kernel does not cover all requested bodies and dates')
    return result


def extract(job):
    kernel, row = job
    url = f'https://ssd.jpl.nasa.gov/ftp/eph/satellites/bsp/{kernel}.bsp'
    tail = read_range(url, (row[-1] - 4) * 8, 32, CACHE / f'{kernel}-{row[2]}-tail.bin')
    init, interval, record_size, _ = struct.unpack('<4d', tail)
    record_size = int(record_size)
    first, last = math.floor((et(START) - init) / interval), math.floor((et(STOP) - init) / interval) + 1
    start = (row[-2] - 1 + first * record_size) * 8
    length = (last - first) * record_size * 8
    raw = read_range(url, start, length, CACHE / f'{row[2]}-raw.bin')
    array = np.frombuffer(raw, dtype='<f8').reshape(-1, record_size)
    if not np.allclose(array[:, 0], init + (np.arange(first, last) + .5) * interval) or not np.all(array[:, 1] == interval / 2):
        raise ValueError('Unexpected type-2 record timing')
    coefficients = array[:, 2:]
    quantum = .01
    if np.max(np.abs(coefficients / quantum)) > np.iinfo(np.int32).max - 1:
        raise ValueError('Coefficient exceeds int32 range')
    packed = np.rint(coefficients / quantum).astype('<i4')
    error = np.abs(coefficients - packed.astype(float) * quantum).reshape(len(array), 3, -1).sum(axis=2)
    bound = float(np.linalg.norm(error, axis=1).max())
    tests = []
    for index in sorted(set([0, len(array) // 3, len(array) // 2, len(array) - 1])):
        for tau in [-1, -.43, 0, .37, .999999]:
            position = [float(np.polynomial.chebyshev.chebval(tau, c)) for c in coefficients[index].reshape(3, -1)]
            tests.append({'et': float(array[index, 0] + tau * array[index, 1]), 'positionKm': position})
    metadata = {'target': row[2], 'center': row[3], 'frame': 'J2000', 'source': url,
                'sourceRange': [start, start + length - 1], 'sourceRangeSHA256': hashlib.sha256(raw).hexdigest(),
                'startET': init + first * interval, 'intervalSeconds': interval, 'count': len(array),
                'coefficientsPerAxis': int(coefficients.shape[1] / 3), 'quantumKm': quantum,
                'quantizationErrorBoundKm': bound, 'tests': tests}
    return metadata, packed.tobytes()


def main():
    jobs = [job for kernel in KERNELS for job in descriptors(kernel)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        items = list(executor.map(extract, jobs))
    metadata, chunks, offset = [], [], 0
    for meta, data in items:
        meta['offset'] = offset
        offset += len(data) // 4
        chunks.append(data)
        metadata.append(meta)
    blob = b''.join(chunks)
    compressed = gzip.compress(blob, compresslevel=9, mtime=0)
    filename = 'major-2026-2030.bin.gz'
    (OUT / filename).write_bytes(compressed)
    manifest = {'schema': 'starorbit-satellite-chebyshev-1', 'startUTC': START, 'endUTCExclusive': STOP,
                'encoding': 'gzip little-endian int32 Chebyshev coefficients', 'file': filename,
                'bytes': len(compressed), 'decodedBytes': len(blob), 'sha256': hashlib.sha256(compressed).hexdigest(),
                'timeScale': 'TDB seconds past J2000',
                'utcConversion': 'NAIF naif0012.tls DELTET; TAI-UTC=37s (no future leap seconds assumed)',
                'sources': sorted(set(m['source'] for m in metadata)), 'segments': metadata}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'{len(metadata)} segments, {len(compressed):,} gzip bytes, {len(blob):,} decoded bytes')


if __name__ == '__main__':
    main()
