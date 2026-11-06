#!/usr/bin/env python3
"""Reproject ESA/Webb's AVM-calibrated Carina TIFF to sparse AVIF HiPS tiles.

Build dependencies only: Pillow (with AVIF), numpy, astropy, astropy-healpix,
pyavm. They are not application/runtime dependencies. See assets/sky-detail/README.md.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy_healpix import HEALPix
from PIL import Image, features
from pyavm import AVM


SOURCE_URL = "https://esawebb.org/media/archives/images/publicationtiff10k/weic2205a.tif"
SOURCE_SHA256 = "a3907d9881a827851593cd76b25993b23ce29e877d2bf1fda65439b138efdf2c"
SOURCE_PAGE = "https://esawebb.org/images/weic2205a/"
DATE_SOURCE = "https://science.nasa.gov/asset/webb/cosmic-cliffs-in-the-carina-nebula-nircam-image/"
PROVIDER_ID = "jwst-carina-2022"
TILE_SIZE = 512
REMOTE_PROVIDERS = [
    {
        "id": "panstarrs",
        "title": "Pan-STARRS DR1",
        "baseUrl": "https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/PanSTARRS",
        "format": "jpg",
        "tileSize": 512,
        "frame": "equatorial",
        "minOrder": 0,
        "maxOrder": 11,
        "observed": "2009–2015",
        "observedRange": ["2009-06-13", "2015-02-09"],
        "bands": "Pan-STARRS i / r / g · 光学波段合成",
        "credit": "PS1 Science Consortium · MAST/STScI · HiPS: CDS/CNRS/Université de Strasbourg",
        "license": "ODbL-1.0 (HiPS); PS1 Science Consortium (images)",
        "licenseUrl": "https://panstarrs.stsci.edu/",
        "sourceUrl": "https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/PanSTARRS/properties",
        "skyFraction": 0.7639,
        "mirrorStatus": "public mirror unclonable",
        "cachePolicy": "Bounded view cache only; no bulk mirroring",
    },
    {
        "id": "dss-color",
        "title": "DSS2 Color",
        "baseUrl": "https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/DSSColor",
        "format": "jpg",
        "tileSize": 512,
        "frame": "equatorial",
        "minOrder": 0,
        "maxOrder": 9,
        "observed": "1975–1999",
        "observedRange": ["1975-01-01", "1999-01-01"],
        "bands": "DSS 摄影巡天彩色合成",
        "credit": "Digitized Sky Survey - STScI/NASA, Colored & Healpixed by CDS",
        "license": "DSS/STScI image use conditions; HiPS CNRS/Unistra",
        "licenseUrl": "https://archive.stsci.edu/dss/copyright.html",
        "sourceUrl": "https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/DSSColor/properties",
        "skyFraction": 1,
        "mirrorStatus": "public mirror unclonable",
        "cachePolicy": "Bounded view cache only; no bulk mirroring",
    },
]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def bilinear(pixels, x, y):
    """Sample already antialiased source pyramid, preserving its exact footprint."""
    height, width = pixels.shape[:2]
    x = np.clip(x, 0, width - 1)
    y = np.clip(y, 0, height - 1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    x1, y1 = np.minimum(x0 + 1, width - 1), np.minimum(y0 + 1, height - 1)
    wx, wy = (x - x0)[..., None], (y - y0)[..., None]
    top = pixels[y0, x0] * (1 - wx) + pixels[y0, x1] * wx
    bottom = pixels[y1, x0] * (1 - wx) + pixels[y1, x1] * wx
    return np.rint(top * (1 - wy) + bottom * wy).astype(np.uint8)


def build(source, destination, min_order, max_order, quality):
    if not features.check("avif"):
        raise RuntimeError("This Pillow build does not support AVIF encoding.")
    input_sha256 = sha256(source)
    if input_sha256 != SOURCE_SHA256:
        raise ValueError("Source hash differs from the verified ESA/Webb TIFF; verify its revision before rebuilding.")
    original = Image.open(source)
    if original.size != (10000, 5791) or original.tag_v2.get(259) != 5:
        raise ValueError("Expected the unmodified 10K LZW TIFF linked in the recipe.")
    avm = AVM.from_xml(original.info["xmp"])
    wcs = avm.to_wcs(target_shape=original.size)
    width, height = original.size
    image = original.convert("RGB")
    center_ra, center_dec = wcs.pixel_to_world_values((width - 1) / 2, (height - 1) / 2)
    center = SkyCoord(center_ra * u.deg, center_dec * u.deg, frame="icrs")
    # AVM/FITS coordinates run upwards. The source raster runs downwards.
    corner_ra, corner_dec = wcs.pixel_to_world_values(
        np.array([-0.5, width - 0.5, width - 0.5, -0.5]),
        np.array([-0.5, -0.5, height - 0.5, height - 0.5]),
    )
    corners = SkyCoord(corner_ra * u.deg, corner_dec * u.deg)
    radius = center.separation(corners).max() * 1.001
    row, column = np.indices((TILE_SIZE, TILE_SIZE), dtype=np.float64)
    # HiPS JPEG/PNG image convention: u = HEALPix dy, v = HEALPix dx.
    # Thus child 0 is top-left, 1 bottom-left, 2 top-right, 3 bottom-right.
    dx, dy = (row + 0.5) / TILE_SIZE, (column + 0.5) / TILE_SIZE
    tiles = {}
    tile_records = {}
    by_order = {}
    source_scale = float(abs(wcs.wcs.cdelt[0]))
    destination.mkdir(parents=True, exist_ok=True)

    for order in range(min_order, max_order + 1):
        hp = HEALPix(nside=2**order, order="nested", frame="icrs")
        candidates = hp.cone_search_skycoord(center, radius)
        # Pre-filtering avoids aliasing when a coarse tile samples the 10K source.
        output_scale = math.degrees(math.sqrt(4 * math.pi / (12 * (2**order * TILE_SIZE) ** 2)))
        reduction = max(1, output_scale / source_scale)
        mip_width = max(1, round(width / reduction))
        mip_height = max(1, round(height / reduction))
        mip = np.array(image.resize((mip_width, mip_height), Image.Resampling.LANCZOS))
        pixels_at_order = []

        for pixel in sorted(int(value) for value in candidates):
            ra, dec = hp.healpix_to_lonlat(pixel, dx=dx, dy=dy)
            source_x, source_y_up = wcs.world_to_pixel_values(ra.to_value(u.deg), dec.to_value(u.deg))
            source_y = height - 1 - source_y_up
            inside = (
                np.isfinite(source_x)
                & np.isfinite(source_y)
                & (source_x >= -0.5)
                & (source_x < width - 0.5)
                & (source_y >= -0.5)
                & (source_y < height - 0.5)
            )
            if not inside.any():
                continue
            sample_x = (np.nan_to_num(source_x) + 0.5) * mip_width / width - 0.5
            sample_y = (np.nan_to_num(source_y) + 0.5) * mip_height / height - 0.5
            rgb = bilinear(mip, sample_x, sample_y)
            # Preserve edge RGB outside alpha to prevent dark bilinear fringes.
            rgba = np.dstack((rgb, inside.astype(np.uint8) * 255))
            partial = not inside.all()
            target = destination / PROVIDER_ID / f"Norder{order}" / f"Dir{pixel // 10000 * 10000}" / f"Npix{pixel}.avif"
            target.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(rgba if partial else rgb).save(
                target,
                format="AVIF",
                quality=quality,
                subsampling="4:4:4",
                speed=6,
                max_threads=2,
                codec="aom",
                # Lossless alpha is independent of photographic RGB quality.
                advanced={"a:lossless": "1"} if partial else None,
            )
            # This is a data footprint, so its alpha must not become lossy.
            if partial:
                decoded_alpha = np.asarray(Image.open(target).convert("RGBA"))[..., 3]
                if not np.array_equal(decoded_alpha, rgba[..., 3]):
                    raise RuntimeError(f"Lossy alpha mask in {target}")
            key = f"{order}/{pixel}"
            relative = f"assets/sky-detail/{target.relative_to(destination).as_posix()}"
            tiles[key] = relative
            tile_records[key] = {"bytes": target.stat().st_size, "sha256": sha256(target)}
            pixels_at_order.append(pixel)

        by_order[str(order)] = pixels_at_order
        print(f"order {order}: {len(pixels_at_order)} nonempty tiles", flush=True)

    byte_count = sum(item["bytes"] for item in tile_records.values())
    if byte_count > 15 * 1024 * 1024:
        raise RuntimeError(f"Pack exceeds 15 MiB delivery budget: {byte_count} bytes")
    provider = {
        "id": PROVIDER_ID,
        "title": "JWST 宇宙悬崖 · NGC 3324",
        "baseUrl": "",
        "format": "avif",
        "tileSize": TILE_SIZE,
        "frame": "equatorial",
        "minOrder": min_order,
        "maxOrder": max_order,
        "observed": "2022-06-03",
        "released": "2022-07-12",
        "bands": "JWST NIRCam 0.90 / 1.87 / 2.00 / 3.35 / 4.44 / 4.70 µm · 红外波段映射",
        "credit": "NASA, ESA, CSA, and STScI",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://esawebb.org/copyright/",
        "sourceUrl": SOURCE_PAGE,
        "dateSourceUrl": DATE_SOURCE,
        "sourcePixelScaleArcsec": source_scale * 3600,
        "center": {"raDeg": float(center_ra), "decDeg": float(center_dec)},
        "fieldSizeArcmin": [7.29, 4.22],
        "coverage": {"type": "nested-tile-sets", "byOrder": by_order},
        "alpha": "Exact source footprint, 0 or 255; no fabricated outside data",
    }
    manifest = {
        "version": 1,
        "providers": [provider, *REMOTE_PROVIDERS],
        "local": {"providerId": PROVIDER_ID, "tiles": tiles, "bytes": byte_count},
        "provenance": {
            "sourceUrl": SOURCE_URL,
            "sourceBytes": source.stat().st_size,
            "sourceSha256": input_sha256,
            "sourceDimensions": [width, height],
            "sourceEncoding": "8-bit RGB, LZW TIFF, sRGB",
            "sourceAvm": {
                "referenceDimension": list(avm.Spatial.ReferenceDimension),
                "referencePixel": list(avm.Spatial.ReferencePixel),
                "referenceValue": list(avm.Spatial.ReferenceValue),
                "scale": list(avm.Spatial.Scale),
                "rotation": avm.Spatial.Rotation,
                "projection": avm.Spatial.CoordsystemProjection,
                "frame": avm.Spatial.CoordinateFrame,
            },
            "imageConvention": "u=HEALPix dy; v=HEALPix dx; row zero is image top; texture flipY=false",
            "resampling": "AVM ICRS TAN to HEALPix NESTED; Lanczos source pyramid then bilinear sampling",
            "encoding": {"format": "AVIF", "codec": "aom", "quality": quality, "alpha": "lossless", "subsampling": "4:4:4", "speed": 6},
            "changes": "Reprojected, downsampled, tiled and AVIF-encoded by StarOrbit; original infrared color mapping retained",
            "tiles": tile_records,
        },
    }
    (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (destination / "source-avm.xml").write_bytes(original.info["xmp"])
    # A lower-order rebuild must not silently retain unused higher-order tiles.
    expected = {path.removeprefix("assets/sky-detail/") for path in tiles.values()}
    for old in (destination / PROVIDER_ID).glob("Norder*/Dir*/Npix*.avif"):
        if old.relative_to(destination).as_posix() not in expected:
            old.unlink()
    print(f"{len(tiles)} tiles, {byte_count / 1048576:.2f} MiB", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("assets/sky-detail"))
    parser.add_argument("--min-order", type=int, default=6)
    parser.add_argument("--max-order", type=int, default=13)
    parser.add_argument("--quality", type=int, default=90)
    args = parser.parse_args()
    if not 0 <= args.min_order <= args.max_order <= 13:
        parser.error("Order range must be within 0..13; do not invent detail beyond the source resolution.")
    if not 1 <= args.quality <= 100:
        parser.error("Quality must be in 1..100.")
    build(args.source, args.output, args.min_order, args.max_order, args.quality)
