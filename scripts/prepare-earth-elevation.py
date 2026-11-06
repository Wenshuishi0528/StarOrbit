"""Prepare the small ETOPO 2022 global elevation base, without a full-grid download.

Requires Python 3, numpy and requests. Downloads one bounded ERDDAP DAP2 subset
(2700 x 1350 samples, approximately 14.6 MB), not the 21600 x 10800 source grid.
Run: python3 scripts/prepare-earth-elevation.py
Intermediate source bytes stay in ignored output/earth-elevation-source/.
"""

import argparse
import gzip
import hashlib
import io
import json
import re
import struct
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests


ROOT = Path(__file__).resolve().parents[1]
DATASET = "ETOPO_2022_v1_60s"
SERVER = "https://oceanwatch.pifsc.noaa.gov/erddap"
QUERY = "z[4:8:10796][4:8:21596]"
DATA_URL = f"{SERVER}/griddap/{DATASET}.dods?{QUERY}"
INFO_URL = f"{SERVER}/info/{DATASET}/index.json"
NCEI_URL = "https://www.ncei.noaa.gov/metadata/geoportal/rest/metadata/item/gov.noaa.ngdc.mgg.dem:etopo_2022/html"
MAX_DOWNLOAD = 20_000_000
MAX_PACKAGE = 3 * 1024 * 1024
MAX_RAW = 4 * 1024 * 1024
OCEAN_SEEDS = [
    ("Pacific west seam", 179.8, 0), ("Pacific east seam", -179.8, 0),
    ("North Atlantic", -30, 30), ("South Atlantic", -20, -30),
    ("Arctic Ocean", 0, 85), ("Indian Ocean", 80, -20),
    ("Southern Ocean", 0, -60),
    # These are seas connected to the ocean through narrow straits that a
    # roughly 20 km display grid may close. Inland lakes are not ocean seeds.
    ("Mediterranean Sea", 18, 36), ("Black Sea", 34, 43),
    ("Red Sea", 38, 20), ("Baltic Sea", 19, 56),
    ("Persian Gulf", 51.5, 26.5), ("Hudson Bay", -85, 60),
    ("Puget Sound", -122.5, 47.8), ("Gulf of Saint Lawrence", -62, 48),
    ("Gulf of Bothnia", 20, 61),
]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def download(url, path, limit):
    """Keep only a complete bounded response; a failed attempt cannot poison reuse."""
    if path.exists():
        data = path.read_bytes()
        if not 0 < len(data) <= limit:
            raise ValueError(f"Invalid cached source size: {path}")
        return data
    with requests.get(url, timeout=(15, 90), stream=True) as response:
        response.raise_for_status()
        if int(response.headers.get("content-length", 0)) > limit:
            raise ValueError("Server response exceeds the source download limit")
        data = bytearray()
        for part in response.iter_content(256 * 1024):
            data.extend(part)
            if len(data) > limit:
                raise ValueError("Source download exceeded its byte limit")
    temporary = path.with_suffix(path.suffix + ".part")
    temporary.write_bytes(data)
    temporary.replace(path)
    return bytes(data)


def read_dap_grid(data):
    """Read this fixed DAP2 Grid: Float32 z and its Float64 latitude/longitude maps.

    DAP2 numeric vectors prefix XDR data with two copies of the element count.
    Checking the DDS, lengths and final offset avoids accepting error documents,
    an unexpected variable, incomplete transfer or a differently ordered grid.
    """
    header, payload = data.split(b"Data:\n", 1)
    match = re.search(rb"Float32 z\[latitude = (\d+)\]\[longitude = (\d+)\];", header)
    if not match or b"Float64 latitude[latitude" not in header or b"Float64 longitude[longitude" not in header:
        raise ValueError("Unexpected ETOPO DAP2 declaration")
    height, width = map(int, match.groups())
    offset = 0

    def vector(count, dtype):
        nonlocal offset
        if offset + 8 > len(payload) or struct.unpack_from(">II", payload, offset) != (count, count):
            raise ValueError("Invalid or incomplete DAP2 vector count")
        offset += 8
        array = np.frombuffer(payload, dtype=dtype, count=count, offset=offset)
        offset += array.nbytes
        return array.astype("float64")

    heights = vector(height * width, ">f4").reshape(height, width)
    latitudes = vector(height, ">f8")
    longitudes = vector(width, ">f8")
    if offset != len(payload):
        raise ValueError("Unexpected data after the ETOPO grid")
    return heights, latitudes, longitudes


def resample(source, latitudes, longitudes, width, height):
    """Bilinear point resampling, periodic longitude, output pixel centers north-up."""
    dlat, dlon = latitudes[1] - latitudes[0], longitudes[1] - longitudes[0]
    if not (dlat > 0 and dlon > 0):
        raise ValueError("Expected ascending ERDDAP coordinate arrays")
    if not np.allclose(np.diff(latitudes), dlat, atol=1e-10, rtol=0) or not np.allclose(np.diff(longitudes), dlon, atol=1e-10, rtol=0):
        raise ValueError("Expected equally spaced coordinates")
    if not np.isclose(dlon * len(longitudes), 360, atol=1e-8, rtol=0):
        raise ValueError("Source does not wrap longitude exactly once")
    if not np.isfinite(source).all() or source.min() < -12000 or source.max() > 10000:
        raise ValueError("ETOPO source contains fill values or implausible elevations")
    target_lat = 90 - (np.arange(height) + 0.5) * 180 / height
    target_lon = -180 + (np.arange(width) + 0.5) * 360 / width
    if target_lat.min() < latitudes[0] or target_lat.max() > latitudes[-1]:
        raise ValueError("Source subset does not bracket the target polar pixel centers")
    x = ((target_lon % 360 - longitudes[0]) / dlon) % len(longitudes)
    y = (target_lat - latitudes[0]) / dlat
    left = np.floor(x).astype("int64")
    low = np.floor(y).astype("int64")
    right = (left + 1) % len(longitudes)
    high = np.minimum(low + 1, len(latitudes) - 1)
    fx, fy = x - left, (y - low)[:, None]
    first = source[low[:, None], left] * (1 - fx) + source[low[:, None], right] * fx
    second = source[high[:, None], left] * (1 - fx) + source[high[:, None], right] * fx
    values = first * (1 - fy) + second * fy
    # Meter quantization is explicit; gzip is lossless. No colour/image codec,
    # bathymetry clamp, exaggerated relief or artificial mountain peaks.
    return np.rint(values).astype("<i2")


def sample(grid, longitude, latitude):
    """Reference consumer sampling: wrap longitude and clamp polar latitude."""
    height, width = grid.shape
    x = ((longitude + 180) % 360) * width / 360 - 0.5
    y = np.clip((90 - latitude) * height / 180 - 0.5, 0, height - 1)
    left, low = int(np.floor(x)), int(np.floor(y))
    fx, fy = x - left, y - low
    right, high = (left + 1) % width, min(low + 1, height - 1)
    left %= width
    first = float(grid[low, left]) * (1 - fx) + float(grid[low, right]) * fx
    second = float(grid[high, left]) * (1 - fx) + float(grid[high, right]) * fx
    return first * (1 - fy) + second * fy


def ocean_surface(grid, seeds=OCEAN_SEEDS):
    """Flood only nonpositive cells reachable from ocean seeds, wrapping x only."""
    height, width = grid.shape
    eligible = (grid <= 0).tobytes()
    ocean = bytearray(grid.size)
    queue, used = deque(), []
    for name, lon, lat in seeds:
        x = int(((lon + 180) % 360) * width / 360)
        y = min(height - 1, max(0, int((90 - lat) * height / 180)))
        index = y * width + x
        if not eligible[index]:
            raise ValueError(f"Ocean seed is on positive land: {name}")
        if not ocean[index]:
            ocean[index] = 1
            queue.append(index)
        used.append({"name": name, "longitude": lon, "latitude": lat,
                     "pixel": [x, y], "originalMeters": int(grid[y, x])})
    while queue:
        index = queue.popleft()
        x = index % width
        neighbours = [index - 1 if x else index + width - 1,
                      index + 1 if x + 1 < width else index - width + 1]
        if index >= width:
            neighbours.append(index - width)
        if index + width < grid.size:
            neighbours.append(index + width)
        for neighbour in neighbours:
            if eligible[neighbour] and not ocean[neighbour]:
                ocean[neighbour] = 1
                queue.append(neighbour)
    mask = np.frombuffer(ocean, dtype="uint8").reshape(grid.shape).astype(bool)
    surface = grid.copy()
    surface[mask] = 0
    return surface, mask, used


def pack(grid):
    raw = grid.tobytes(order="C")
    compressed = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=compressed, compresslevel=9, mtime=0) as stream:
        stream.write(raw)
    packed = compressed.getvalue()
    assert gzip.decompress(packed) == raw
    return raw, packed


def check_connectivity():
    grid = np.ones((4, 8), dtype="<i2")
    grid[1, [0, 7, 3]] = -5
    grid[1, 1] = 0
    surface, ocean, _ = ocean_surface(grid, [("test Pacific", -157.5, 22.5)])
    assert ocean[1, 0] and ocean[1, 7] and ocean[1, 1]
    assert surface[1, 0] == 0 and surface[1, 7] == 0
    assert not ocean[1, 3] and surface[1, 3] == -5


def verify_native_points(source, latitudes, longitudes, work):
    """Independently request three native cells to verify subset axis/byte order."""
    checks = []
    for name, lon, lat in [("tibet", 85, 32), ("greenland", -40, 72), ("pacific", -150, 0)]:
        row = int(np.argmin(abs(latitudes - lat)))
        col = int(np.argmin(abs(longitudes - (lon % 360))))
        query = f"z[{4 + 8 * row}][{4 + 8 * col}]"
        url = f"{SERVER}/griddap/{DATASET}.dods?{query}"
        data = download(url, work / f"point-{name}.dods", 10_000)
        z, a, b = read_dap_grid(data)
        if z.shape != (1, 1) or z[0, 0] != source[row, col] or abs(a[0] - latitudes[row]) > 1e-10 or abs(b[0] - longitudes[col]) > 1e-10:
            raise ValueError(f"Independent native source cell did not match: {name}")
        checks.append({"name": name, "query": query, "longitude": float(b[0]),
                       "latitude": float(a[0]), "native60sMeters": float(z[0, 0]),
                       "exactMatchToSubset": True, "downloadBytes": len(data)})
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--width", type=int, default=2048)
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--output", type=Path, default=ROOT / "assets/earth/elevation")
    parser.add_argument("--work", type=Path, default=ROOT / "output/earth-elevation-source")
    args = parser.parse_args()
    check_connectivity()
    if args.width != 2 * args.height or args.height < 512 or args.width * args.height * 2 > MAX_RAW:
        parser.error("Use a 2:1 grid of at least 1024 x 512 and at most 4 MiB of int16 data")
    args.work.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    info_bytes = download(INFO_URL, args.work / "etopo-2022-erddap-info.json", 512_000)
    info = json.loads(info_bytes)["table"]["rows"]
    attributes = {(row[1], row[2]): row[4] for row in info if row[0] == "attribute"}
    if attributes[("z", "units")] != "meters" or attributes[("z", "vert_crs_name")] != "EGM2008":
        raise ValueError("Unexpected elevation units or vertical reference")
    print("Reading bounded ETOPO 2022 subset:", QUERY, flush=True)
    data = download(DATA_URL, args.work / "etopo-2022-stride8-offset4.dods", MAX_DOWNLOAD)
    source, latitude, longitude = read_dap_grid(data)
    if source.shape != (1350, 2700):
        raise ValueError("Unexpected sampled-grid dimensions")
    native_checks = verify_native_points(source, latitude, longitude, args.work)
    original = resample(source, latitude, longitude, args.width, args.height)
    original_raw, original_packed = pack(original)
    (args.work / "base-raw-i16.bin.gz").write_bytes(original_packed)
    grid, ocean, seeds = ocean_surface(original)
    raw, packed = pack(grid)
    if len(packed) > MAX_PACKAGE:
        raise ValueError(f"Compressed base exceeds 3 MiB ({len(packed)} bytes); use --width 1920 --height 960")
    for lat in [-90, -45, 0, 45, 90]:
        assert sample(grid, -180, lat) == sample(grid, 180, lat)
    checks = []
    for name, lon, lat in [
        ("Tibetan Plateau", 85, 32), ("Andes", -68, -22),
        ("Greenland ice surface", -40, 72), ("Antarctic ice surface", 0, -89),
        ("Central Pacific seafloor", -150, 0), ("Beijing", 116.3974, 39.9093),
        ("Seattle", -122.3321, 47.6062), ("Dead Sea depression", 35.5, 31.5),
        ("Caspian Sea inland water", 51, 42),
    ]:
        checks.append({"name": name, "longitude": lon, "latitude": lat,
                       "originalBilinearMeters": round(sample(original, lon, lat), 3),
                       "surfaceBilinearMeters": round(sample(grid, lon, lat), 3)})
    filename = "base-surface-i16.bin.gz"
    (args.output / filename).write_bytes(packed)
    manifest = {
        "version": 1, "id": "etopo-2022-ice-surface",
        "base": {"file": "assets/earth/elevation/" + filename, "width": args.width, "height": args.height,
                 "compression": "gzip", "dtype": "int16-le", "rowOrder": "north-to-south",
                 "columnOrder": "west-to-east", "unit": "metre", "scale": 1, "offset": 0, "noData": None,
                 "crs": "EPSG:4326", "verticalCrs": "EPSG:3855", "verticalDatum": "EGM2008 geoid",
                 "bounds": [-180, -90, 180, 90], "registration": "pixel-center",
                 "longitudeStep": 360 / args.width, "latitudeStep": -180 / args.height,
                 "firstCenter": [-180 + 180 / args.width, 90 - 90 / args.height],
                 "longitudeAtColumn": "-180 + (x + 0.5) * 360 / width",
                 "latitudeAtRow": "90 - (y + 0.5) * 180 / height",
                 "wrapLongitude": True, "clampLatitude": True,
                 "duplicatedSeamColumn": False, "bytes": len(packed), "rawBytes": len(raw),
                 "sha256": sha256(packed), "rawSHA256": sha256(raw)},
        "source": {"provider": "NOAA NCEI", "title": "ETOPO 2022 v1, ice surface, 60 arc-second",
                   "url": "https://www.ncei.noaa.gov/products/etopo-global-relief-model",
                   "credit": "NOAA National Centers for Environmental Information, ETOPO 2022; resampled by StarOrbit",
                   "license": "CC0-1.0", "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
                   "licenseEvidenceUrl": NCEI_URL,
                   "citation": "NOAA National Centers for Environmental Information. 2022: ETOPO 2022 15 Arc-Second Global Relief Model. NOAA National Centers for Environmental Information. https://doi.org/10.25921/fd45-gt74",
                   "datasetId": DATASET, "variable": "z", "nativeGrid": [21600, 10800],
                   "nativeSpacingArcSeconds": 60, "sourceSubsetGrid": [2700, 1350],
                   "sourceSubsetSpacingArcSeconds": 480, "query": QUERY, "downloadUrl": DATA_URL,
                   "infoUrl": INFO_URL, "productUrl": "https://www.ncei.noaa.gov/products/etopo-global-relief-model",
                   "metadataUrl": NCEI_URL, "doi": "https://doi.org/10.25921/fd45-gt74",
                   "productPublicationDate": "2022-10-01", "productYear": 2022,
                   "observationDate": None, "metadataTimeCoverage": {"start": "1998-01-01", "end": "2022-09-01"},
                   "dateNote": "A compilation of many source surveys; 2022 is the product release, not a uniform observation year. Coverage is the product metadata time period, not a per-pixel acquisition date.",
                   "accessedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "downloadBytes": len(data), "downloadSHA256": sha256(data)},
        "processing": {"method": "Every eighth source sample, then periodic bilinear point resampling to output pixel centers; rounded to nearest integer metre (ties to even).",
                       "heightQuantizationMaxMeters": 0.5,
                       "quantizationNote": "Quantization bound excludes source error and spatial resampling; this base cannot preserve narrow peaks or city-scale elevations.",
                       "inlandNegativeElevationsPreserved": True,
                       "oceanDisplay": "Four-neighbour flood fill of height <= 0 m cells from the listed ocean/open-sea seeds, periodic longitude and nonperiodic latitude; only those connected cells become 0 m.",
                       "oceanSeeds": seeds, "oceanSamples": int(ocean.sum()),
                       "coastlineLimitation": "At roughly 20 km equatorial spacing, thin land barriers and straits can be lost. This flood mask is a display approximation, not a hydrographic shoreline or navigation dataset.",
                       "unmodifiedSampleSHA256": sha256(original_raw),
                       "unmodifiedSampleGzipBytes": len(original_packed),
                       "unmodifiedSampleLocation": "base-raw-i16.bin.gz in the preparation script's --work directory; not included in the application package"},
        "statistics": {"minimumMeters": int(grid.min()), "maximumMeters": int(grid.max()),
                       "negativeSamples": int((grid < 0).sum()), "positiveSamples": int((grid > 0).sum()),
                       "zeroSamples": int((grid == 0).sum())},
        "validation": {"gzipRoundTrip": True, "periodicLongitudeChecks": True,
                       "nativeSourceCells": native_checks,
                       "samples": checks,
                       "sampleNote": "Interpolated values of this coarse display base, not survey measurements at the named landmark or mountain-summit heights."},
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"file": filename, "compressedBytes": len(packed), "rawBytes": len(raw),
                      "sourceDownloadBytes": len(data), "statistics": manifest["statistics"],
                      "samples": checks}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
