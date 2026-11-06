"""Prepare the two built-in 2025 Sentinel-2 city packs, without downloading full scenes.

Requires numpy, rasterio, pyproj, Pillow with AVIF support, and requests.
Intermediate crops stay in ignored output/earth-city-source-work/native-scenes.
Example: python3 scripts/prepare-city-terrain.py --quality 80
"""

import argparse
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image, ImageFilter
from pyproj import Geod
from rasterio.enums import Resampling
from rasterio.fill import fillnodata
from rasterio.transform import from_bounds
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "output/earth-city-source-work/native-scenes"
OUT = ROOT / "assets/earth/cities"
STAC = "https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/"
LICENSE_URL = "https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice"
TILE_SIZE = 512
GUTTER = 4
CORE = TILE_SIZE - 2 * GUTTER
JOBS = [
    {
        "id": "beijing",
        "names": {"zh": "北京", "en": "Beijing"},
        "center": [116.3974, 39.9093],
        "extentKm": 40,
        "maxLevel": 3,
        "sceneIds": ["S2B_T50TMK_20250730T031615_L2A", "S2A_T50TMK_20251104T031151_L2A"],
    },
    {
        "id": "seattle",
        "names": {"zh": "西雅图", "en": "Seattle"},
        "center": [-122.3321, 47.6062],
        "extentKm": 20,
        "maxLevel": 2,
        "sceneIds": ["S2B_T10TET_20250708T191951_L2A", "S2B_T10TET_20250923T190651_L2A", "S2B_T10TET_20250119T191626_L2A"],
    },
]
ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
    "GDAL_HTTP_TIMEOUT": "30",
    "GDAL_HTTP_CONNECTTIMEOUT": "20",
    "GDAL_HTTP_MAX_RETRY": "1",
    "GDAL_HTTP_MULTIRANGE": "SERIAL",
    "GDAL_CACHEMAX": 32,
    "CPL_VSIL_CURL_CACHE_SIZE": 2000000,
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def public_cog_url(asset):
    # AWS's global virtual-host endpoint addresses the identical public bucket
    # and object key. It avoids regional-host proxy stalls seen while preparing
    # these assets; provenance keeps the publisher's canonical URL as well.
    return asset["href"].replace("e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com", "e84-earth-search-sentinel-data.s3.amazonaws.com")


def city_grid(job):
    lon, lat = job["center"]
    half = job["extentKm"] * 500
    geod = Geod(ellps="WGS84")
    bounds = [geod.fwd(lon, lat, 270, half)[0], geod.fwd(lon, lat, 180, half)[1], geod.fwd(lon, lat, 90, half)[0], geod.fwd(lon, lat, 0, half)[1]]
    size = job["extentKm"] * 100
    return bounds, size, from_bounds(*bounds, size, size)


def source_window(ds, bounds, pad=3):
    west, south, east, north = transform_bounds("EPSG:4326", ds.crs, *bounds, densify_pts=21)
    r0, c0 = ds.index(west, north)
    r1, c1 = ds.index(east, south)
    c0, r0 = max(c0 - pad, 0), max(r0 - pad, 0)
    c1, r1 = min(c1 + pad + 1, ds.width), min(r1 + pad + 1, ds.height)
    return Window(c0, r0, c1 - c0, r1 - r0)


def stac_item(scene_id):
    path = CACHE / f"{scene_id}.json"
    if not path.exists():
        response = requests.get(STAC + scene_id, timeout=30)
        response.raise_for_status()
        item = response.json()
        assert item["id"] == scene_id and item["properties"]["datetime"].startswith("2025-")
        path.write_text(json.dumps(item, indent=2) + "\n")
    return json.loads(path.read_text())


def scene_mask(item, bounds, size, target):
    """Keep land, water, dark terrain and unclassified pixels; exclude clouds/snow."""
    # A complete SCL is only a few MB and is reused between attempts. Large RGB
    # rasters still use bounded HTTP range reads below.
    scl_path = CACHE / f"{item['id']}-SCL.tif"
    if not scl_path.exists():
        assert item["assets"]["scl"]["file:size"] < 12000000
        response = requests.get(public_cog_url(item["assets"]["scl"]), timeout=30)
        response.raise_for_status()
        temporary = scl_path.with_suffix(".part")
        temporary.write_bytes(response.content)
        expected = item["assets"]["scl"].get("file:checksum", "")
        assert not expected.startswith("1220") or digest(temporary) == expected[4:]
        temporary.replace(scl_path)
    with rasterio.open(scl_path) as src:
        window = source_window(src, bounds, pad=5)
        scl = src.read(1, window=window)
        invalid = (~np.isin(scl, [2, 4, 5, 6, 7])).astype("uint8") * 255
        # A 5x5 footprint adds a conservative 40 m margin at native 20 m SCL.
        invalid = np.asarray(Image.fromarray(invalid).filter(ImageFilter.MaxFilter(5)))
        mask = np.zeros((size, size), dtype="uint8")
        reproject(source=(invalid == 0).astype("uint8"), destination=mask, src_transform=src.window_transform(window), src_crs=src.crs, src_nodata=0, dst_transform=target, dst_crs="EPSG:4326", dst_nodata=0, resampling=Resampling.nearest, num_threads=1)
    return mask.astype(bool)


def scene_rgb(item, bounds, size, target, city_id, needed):
    cache_path = CACHE / f"{city_id}-{item['id']}-rgb.npz"
    if cache_path.exists():
        with np.load(cache_path) as cached:
            return cached["rgb"], cached["valid"]
    rgb = np.zeros((3, size, size), dtype="uint16")
    valid = np.ones((size, size), dtype=bool)
    # A fallback usually fills only a few dozen pixels. Read that bounding box,
    # instead of fetching another complete 40 km three-band crop for a tiny gap.
    rows, cols = np.nonzero(needed)
    crop_bounds = [target.c + max(0, cols.min() - 2) * target.a, target.f + min(size, rows.max() + 3) * target.e, target.c + min(size, cols.max() + 3) * target.a, target.f + max(0, rows.min() - 2) * target.e]
    for channel, band in enumerate(["red", "green", "blue"]):
        asset = item["assets"][band]
        encoding = asset["raster:bands"][0]
        assert encoding["scale"] == 0.0001 and encoding["offset"] == -0.1 and encoding["nodata"] == 0
        band_cache = CACHE / f"{city_id}-{item['id']}-{band}.npy"
        if band_cache.exists():
            rgb[channel] = np.load(band_cache)
        else:
            print(f"{city_id}: reading {item['id']} {band} window", flush=True)
            with rasterio.open(public_cog_url(asset)) as src:
                assert src.transform.a == 10 and src.transform.e == -10
                window = source_window(src, crop_bounds)
                raw = np.zeros((int(window.height), int(window.width)), dtype="uint16")
                # Bounded requests also avoid large multipart requests through
                # proxies; each completed band is cached for safe resumption.
                for y in range(0, raw.shape[0], 512):
                    count = min(512, raw.shape[0] - y)
                    raw[y:y + count] = src.read(1, window=Window(window.col_off, window.row_off + y, window.width, count))
                    print(f"{city_id}: {band} rows {min(y + count, raw.shape[0])}/{raw.shape[0]}", flush=True)
                reproject(source=raw, destination=rgb[channel], src_transform=src.window_transform(window), src_crs=src.crs, src_nodata=0, dst_transform=target, dst_crs="EPSG:4326", dst_nodata=0, resampling=Resampling.bilinear, num_threads=1)
            temporary = band_cache.with_suffix(".part.npy")
            np.save(temporary, rgb[channel])
            temporary.replace(band_cache)
        valid &= rgb[channel] > 0
    temporary = cache_path.with_suffix(".part.npz")
    np.savez_compressed(temporary, rgb=rgb, valid=valid)
    temporary.replace(cache_path)
    return rgb, valid


def fetch_city(job):
    CACHE.mkdir(parents=True, exist_ok=True)
    bounds, size, target = city_grid(job)
    cache = CACHE / f"{job['id']}-2025-composite.npz"
    info_path = CACHE / f"{job['id']}-2025-source.json"
    if cache.exists() and info_path.exists():
        return cache, json.loads(info_path.read_text())
    rgb = np.zeros((3, size, size), dtype="uint16")
    valid = np.zeros((size, size), dtype=bool)
    source_index = np.full((size, size), -1, dtype="int8")
    scenes = []
    with rasterio.Env(**ENV):
        for i, scene_id in enumerate(job["sceneIds"]):
            item = stac_item(scene_id)
            mask = scene_mask(item, bounds, size, target)
            selected = mask & ~valid
            selected_count = int(selected.sum())
            print(f"{job['id']}: {scene_id} SCL-valid {mask.mean():.6%}; new pixels {selected_count}", flush=True)
            if selected_count:
                scene, data_valid = scene_rgb(item, bounds, size, target, job["id"], selected)
                selected &= data_valid
                rgb[:, selected] = scene[:, selected]
                source_index[selected] = i
                valid |= selected
            scenes.append({"id": scene_id, "url": STAC + scene_id, "observed": item["properties"]["datetime"], "sceneCloudPercent": item["properties"]["eo:cloud_cover"], "contributedPixels": int(selected.sum()), "license": "Copernicus Sentinel Data Legal Notice", "licenseUrl": LICENSE_URL, "assets": {band: {"url": item["assets"][band]["href"], "downloadUrl": public_cog_url(item["assets"][band]), "sha256Multihash": item["assets"][band].get("file:checksum"), "scale": item["assets"][band].get("raster:bands")} for band in ["red", "green", "blue", "scl"]}})
            if valid.all():
                break
    temporary = cache.with_suffix(".part.npz")
    np.savez_compressed(temporary, rgb=rgb, valid=valid, source_index=source_index)
    temporary.replace(cache)
    info = {"bounds": bounds, "width": size, "height": size, "crs": "EPSG:4326", "transform": list(target), "validFraction": float(valid.mean()), "validPixels": int(valid.sum()), "scenes": scenes, "rawSha256": digest(cache), "recipe": "2025 low-cloud primary scene, fill only SCL/cloud/nodata gaps from the listed same-year fallback. This is a StarOrbit selection, not an official annual mosaic. SCL allowed: 2,4,5,6,7; excluded: 0,1,3,8,9,10,11, with a 40 m exclusion margin. RGB bands come from the same scene for each pixel. Raw DN*0.0001-0.1; bilinear reprojection to WGS84."}
    info_path.write_text(json.dumps(info, indent=2) + "\n")
    return cache, info


def srgb_oetf(linear):
    value = np.clip(linear, 0, 1)
    return np.where(value <= 0.0031308, value * 12.92, 1.055 * value ** (1 / 2.4) - 0.055)


def pack_city(job, cache_path, info, quality):
    output = OUT / job["id"]
    output.mkdir(parents=True, exist_ok=True)
    with np.load(cache_path) as raw:
        # Reflectance is linear. Every pyramid level resamples these same values.
        reflectance = np.clip(raw["rgb"].astype("float32") * 0.0001 - 0.1, 0, 1)
        valid = raw["valid"].astype("float32")
    mask_image = Image.fromarray(valid)
    linear_images = [Image.fromarray(reflectance[c] * valid) for c in range(3)]
    tiles = {}
    hashes = {}
    bytes_total = 0
    for level in range(job["maxLevel"] + 1):
        n = 1 << level
        resolution = n * CORE
        # Downsample in linear light. The top level is a tiny 4000->4032
        # (2000->2016) bilinear resampling, not an extra source detail level.
        filter_mode = Image.Resampling.BOX if resolution <= info["width"] else Image.Resampling.BILINEAR
        mask = np.asarray(mask_image.resize((resolution, resolution), filter_mode))
        channels = []
        for linear_image in linear_images:
            weighted = np.asarray(linear_image.resize((resolution, resolution), filter_mode))
            channels.append(np.divide(weighted, mask, out=np.zeros_like(weighted), where=mask > 1e-6))
        if np.any(mask <= 1e-6):
            # Texture mipmaps average colour independently from alpha. Extend
            # neighbouring RGB into transparent holes only, so zero-filled RGB
            # cannot add black fringes. Coverage/alpha is never filled or widened.
            present = (mask > 1e-6).astype("uint8")
            channels = [fillnodata(channel, mask=present, max_search_distance=64, smoothing_iterations=0) for channel in channels]
        linear = np.stack(channels, axis=2)
        rgb = np.rint(srgb_oetf(linear) * 255).astype("uint8")
        alpha = np.rint(np.clip(mask, 0, 1) * 255).astype("uint8")
        rgba = np.concatenate([rgb, alpha[:, :, None]], axis=2)
        padded = np.pad(rgba, ((GUTTER, GUTTER), (GUTTER, GUTTER), (0, 0)), mode="edge")
        for y in range(n):
            for x in range(n):
                path = output / f"{level}-{x}-{y}.avif"
                tile = padded[y * CORE:y * CORE + TILE_SIZE, x * CORE:x * CORE + TILE_SIZE]
                Image.fromarray(tile).save(path, format="AVIF", quality=quality, speed=6, subsampling="4:4:4", max_threads=2)
                key = f"{level}/{x}/{y}"
                tiles[key] = path.relative_to(ROOT).as_posix()
                hashes[key] = digest(path)
                bytes_total += path.stat().st_size
        print(f"{job['id']}: level {level} complete, {bytes_total / 1048576:.2f} MiB", flush=True)
    used = [scene for scene in info["scenes"] if scene["contributedPixels"]]
    dates = [scene["observed"][:10] for scene in used]
    manifest = {key: job[key] for key in ["id", "names", "center", "extentKm", "maxLevel"]}
    manifest.update({"bounds": info["bounds"], "pixelSizeMeters": 10, "year": "2025", "width": info["width"], "height": info["height"], "tileSize": TILE_SIZE, "gutter": GUTTER, "tiles": tiles, "tileSha256": hashes, "bytes": bytes_total, "validFraction": info["validFraction"], "encoding": {"format": "AVIF", "quality": quality, "chroma": "4:4:4", "colorSpace": "sRGB", "alpha": "data coverage", "radiometry": "L2A surface reflectance, standard sRGB OETF, no exposure gain or histogram stretch", "levelFiltering": "area average of linear reflectance, weighted by validity"}, "source": {"id": "copernicus-sentinel2-c1-l2a-2025", "title": "Sentinel-2 L2A · 2025 low-cloud scenes", "url": "https://registry.opendata.aws/sentinel-2-l2a-cogs/", "license": "Copernicus Sentinel Data Legal Notice", "licenseUrl": LICENSE_URL, "credit": "Contains modified Copernicus Sentinel data (2025). Source COGs: Element 84 / Earth Search. Crop, cloud-mask selection and sRGB conversion: StarOrbit.", "observed": " / ".join(dates), "observationDates": dates, "scenes": used, "method": info["recipe"], "nativeMetersPerPixel": 10, "nominalCityMetersPerPixel": 10, "projection": "North-up WGS84 rectangle; requested geodesic size through the city centre; ground sampling varies slightly across the rectangle."}})
    # A small review image is an ignored output artifact, not a distribution asset.
    preview = np.stack([np.asarray(im.resize((900, 900), Image.Resampling.BOX)) for im in linear_images], axis=2)
    preview_mask = np.asarray(mask_image.resize((900, 900), Image.Resampling.BOX))
    preview = np.divide(preview, preview_mask[:, :, None], out=np.zeros_like(preview), where=preview_mask[:, :, None] > 1e-6)
    Image.fromarray(np.rint(srgb_oetf(preview) * 255).astype("uint8")).save(CACHE / f"{job['id']}-preview.png")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quality", type=int, default=80)
    parser.add_argument("--fetch-only", action="store_true")
    args = parser.parse_args()
    assert 1 <= args.quality <= 100
    cities = []
    for job in JOBS:
        for attempt in range(3):
            try:
                cache, info = fetch_city(job)
                break
            except (requests.RequestException, rasterio.errors.RasterioIOError) as error:
                if attempt == 2:
                    raise
                print(f"{job['id']}: retrying interrupted range request: {error}", flush=True)
                time.sleep(2)
        if not args.fetch_only:
            cities.append(pack_city(job, cache, info, args.quality))
    if not args.fetch_only:
        OUT.mkdir(parents=True, exist_ok=True)
        manifest = {"version": 1, "cities": cities}
        (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        print(f"Total AVIF: {sum(city['bytes'] for city in cities) / 1048576:.2f} MiB", flush=True)


if __name__ == "__main__":
    main()
