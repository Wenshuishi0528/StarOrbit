#!/usr/bin/env python3
"""Compare each frameable archive's tiles with its official, ICC-rendered image.

    python3 scripts/audit-archive-colors.py --cache /tmp/starorbit-colors \
        --report output/sky-color-audit.json --index src/sky-archive-color-data.json

Development dependencies: Python 3, Pillow with LittleCMS and AVIF, NumPy, curl
and Node. Cache HTTP responses outside the application. The detailed report
contains per-image hashes, tile coordinates and mean RGB errors (0–255).
Reuse the cache to reproduce a snapshot; use a fresh directory to check for
changes to the official files. Only a fully resolved audit replaces the index.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import subprocess

import numpy as np
from PIL import Image, ImageCms

ROOT = Path(__file__).resolve().parents[1]
SRGB = ImageCms.createProfile("sRGB")
PROFILES = ("srgb", "prophoto", "adobe", "p3", "lstar", "eci188", "mono", "dot15")

# Primary/white-point conversion in linear light, including Bradford D50 → D65
# for ROMM/ProPhoto. These are input hypotheses, not fitted color corrections.
TO_SRGB = {
    "prophoto": [[2.0340764, -0.7273342, -0.3067422],
                 [-0.2288131, 1.2317292, -0.0029161],
                 [-0.0085698, -0.1532866, 1.1618564]],
    "adobe": [[1.3983557, -0.3983557, 0], [0, 1, 0],
              [0, -0.0429280, 1.0429280]],
    # Official TIFF LStar-RGB/ECI D50 media-relative colorants. Two profiles
    # sharing the same descriptive name use different measured TRCs.
    "lstar": [[1.51999632, -0.44876042, -0.07118342],
              [-0.02275721, 0.98162401, 0.04115334],
              [-0.02655807, -0.02974473, 1.05587197]],
    "p3": [[1.2249402, -0.2249402, 0], [-0.0420570, 1.0420570, 0],
           [-0.0196376, -0.0786361, 1.0982737]],
}
TO_SRGB["eci188"] = TO_SRGB["lstar"]
VALUES = np.arange(256, dtype=np.float32) / 255
DECODE = {
    "prophoto": np.where(VALUES < 1 / 32, VALUES / 16, VALUES ** 1.8),
    "lstar": np.where(VALUES < 0.08, VALUES * (100 / 903.2962963), ((100 * VALUES + 16) / 116) ** 3),
    "eci188": VALUES ** (482 / 256),
    # Black-point-compensated ISOuncoated_mono kTRC, fitted to the published
    # 256-sample ICC table (max output residual < one 8-bit sRGB level).
    "mono": VALUES - VALUES * (1 - VALUES) * (
        0.72483621 + VALUES * (0.47403654 + VALUES * (-0.40923507 + VALUES * 0.23332050))),
    # The Dot Gain 15% master of heic0701g has a distinct neutral curve.
    "dot15": VALUES - VALUES * (1 - VALUES) * (
        0.88237940 + VALUES * (-1.30839914 + VALUES * (2.68559914 +
        VALUES * (-3.03884283 + VALUES * 1.32289039)))),
    "adobe": VALUES ** (563 / 256),
    "p3": np.where(VALUES <= 0.04045, VALUES / 12.92, ((VALUES + 0.055) / 1.055) ** 2.4),
}
MATRICES = {k: np.array(m, dtype=np.float32).T for k, m in TO_SRGB.items()}


def encode(rgb, space):
    if space == "srgb":
        return rgb
    if space in ("mono", "dot15"):
        linear = np.repeat(DECODE[space][rgb[..., :1]], 3, axis=-1)
    else:
        linear = np.clip(DECODE[space][rgb] @ MATRICES[space], 0, 1)
    result = np.where(linear <= 0.0031308, 12.92 * linear, 1.055 * linear ** (1 / 2.4) - 0.055)
    return np.rint(result * 255).astype(np.uint8)


def node(script):
    return json.loads(subprocess.check_output(["node", "--input-type=module", "-e", script], cwd=ROOT))


def catalog():
    # Use the production level rounding, eligibility and coordinates. Import the
    # geometry directly so the color index can also be rebuilt from scratch.
    return node("""
      import fs from 'node:fs';
      import {createWebbPlate} from './src/webb-plate.js';
      const entries=[];
      for (const source of ['hubble','webb']) {
        const records=JSON.parse(fs.readFileSync('src/'+source+'-gallery-data.json'));
        for (const r of records) {
          const plate=r.plate && createWebbPlate(r.plate);
          if (!plate && r.id !== 'weic2205a') continue;
          const archive='https://cdn.esa'+source+'.org/archives/images';
          entries.push({id:source+'-'+r.id, slug:r.id, source,
            preview:r.preview || archive+'/screen/'+r.id+'.jpg',
            base:r.tilesBase || archive+'/zoomable/'+r.id,
            levels:plate?.levels});
        }
      }
      console.log(JSON.stringify(entries));
    """)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_photo(cache, name, url):
    path = cache / (name + ".jpg")
    if path.exists():
        data = path.read_bytes()
    else:
        # Both hosts are official. Some older assets are served by just one.
        mirror = re.sub(r"https://cdn\.esa(webb|hubble)\.org/archives/",
                        r"https://esa\1.org/media/archives/", url)
        for host in dict.fromkeys([url, mirror]):
            try:
                data = subprocess.check_output(
                    ["curl", "-fsSL", "--retry", "2", "--connect-timeout", "8",
                     "--max-time", "24", host], stderr=subprocess.PIPE)
                with Image.open(io.BytesIO(data)) as candidate:
                    candidate.load()
                break
            except (subprocess.CalledProcessError, OSError) as error:
                last_error = error
        else:
            raise ValueError(f"Could not read {url}: {last_error}")
        cache.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_bytes(data)
        temporary.replace(path)
    photo = Image.open(io.BytesIO(data))
    photo.load()
    return photo, digest(data)


def reference(cache, url, name="screen"):
    preview, sha = read_photo(cache, name, url)
    embedded = preview.info.get("icc_profile")
    profile_name = "untagged"
    if embedded:
        profile = ImageCms.ImageCmsProfile(io.BytesIO(embedded))
        preview = ImageCms.profileToProfile(preview, profile, SRGB, outputMode="RGB")
        profile_name = ImageCms.getProfileDescription(profile).strip()
    return preview.convert("RGB"), {"url": url, "sha256": sha, "icc": profile_name}


def region(level, x, y):
    w, h = level["width"], level["height"]
    return (x * 256 / w, y * 256 / h, min(1, (x + 1) * 256 / w), min(1, (y + 1) * 256 / h))


def sample_grid(preview, box, target):
    x0, y0, x1, y1 = box
    # Average corresponding areas; never magnify the reference to the complete
    # native mosaic. Cap sampling to what the official reference can resolve.
    pw, ph = preview.size
    ref_pixels = (x0 * pw, y0 * ph, x1 * pw, y1 * ph)
    width, height = target
    grid = (max(1, min(20, int((x1 - x0) * pw / 3), width // 3)),
            max(1, min(20, int((y1 - y0) * ph / 3), height // 3)))
    ref = np.asarray(preview.resize(grid, Image.Resampling.BOX, box=ref_pixels), dtype=np.float32)
    return ref, grid


def best_tile(preview, level, exclude=()):
    # Focus additional measurements on well-exposed, chromatic parts. Sample
    # the interior of every complete cell, including dark targets with bright
    # central details. The right/bottom partial edge tiles may contain padding.
    w, h = level["width"], level["height"]
    nx, ny = max(1, w // 256), max(1, h // 256)
    box = (0, 0, min(1, nx * 256 / w) * preview.width, min(1, ny * 256 / h) * preview.height)
    colors = np.asarray(preview.resize((nx, ny), Image.Resampling.BOX, box=box), dtype=float)
    value = colors.max(axis=2)
    score = (value - colors.min(axis=2)) + np.minimum(value, 255 - value) * 0.45
    for x, y in exclude:
        if y < ny and x < nx:
            score[y, x] = -1
    y, x = np.unravel_index(np.argmax(score), score.shape)
    return int(x), int(y)


# The official full-size files for these two small images have complete rows.
# Old Zoomify files contain duplicated/missing rows in the lower portion.
# Only corresponding regions can be used to compare their color encoding.
ROW_DEFECTS = {"hubble-heic0513d", "hubble-heic0608d"}
NATIVE_JPEGS = {**{key:"srgb" for key in ROW_DEFECTS}, "hubble-heic0816a":"adobe"}

# These old releases have different official screen and publication renditions.
# Compare both when the screen derivative disagrees with the pyramid; these
# bounded-size links are the Large JPEG or Publication JPEG on each ESA page.
PUBLICATION_FORMATS = {
    "hubble-heic0502a": "publicationjpg", "hubble-heic0515a": "large",
    "hubble-heic0604a": "publicationjpg", "hubble-heic0606a": "large",
    "hubble-heic0607a": "large", "hubble-heic0609a": "publicationjpg",
    "hubble-heic0614a": "large", "hubble-heic0615a": "large",
    "hubble-heic0816a": "large", "hubble-heic1502a": "publicationjpg",
}


def measure(cache, record, preview, order, x, y):
    level = record["levels"][order]
    key = f"{order}-{x}-{y}"
    group = (level["offset"] + y * level["cols"] + x) // 256
    url = f'{record["base"]}/TileGroup{group}/{key}.jpg'
    tile, sha = read_photo(cache, key, url)
    w = min(level["width"] - 256 * x, 256)
    h = min(level["height"] - 256 * y, 256)
    # Some pyramids have the same tile count under floor and ceil rounding.
    # Match the one-pixel edge tolerance used by the actual renderer.
    def valid(actual, expected):
        return actual == expected or (expected < 256 and 0 < actual <= 256 and abs(actual - expected) <= 1)
    if not valid(tile.width, w) or not valid(tile.height, h):
        raise ValueError(f"{url}: decoded {tile.size}, expected {(w,h)}")
    pixels = np.asarray(tile.convert("RGB"))
    ref, grid = sample_grid(preview, region(level, x, y), (w, h))
    active = ref.max(axis=2) > 25
    if active.sum() < min(4, active.size):
        active = np.ones(active.shape, dtype=bool)
    if record["id"] in ROW_DEFECTS:
        row = (y * 256 + (np.arange(grid[1]) + 0.5) * h / grid[1]) / level["height"]
        active &= row[:, None] < 0.36
        if not active.any():
            return None
    errors = {}
    is_gray = np.max(np.ptp(pixels, axis=2)) <= 2
    for space in PROFILES:
        if space in ("mono", "dot15") and not is_gray:
            errors[space] = 255
            continue
        candidate = Image.fromarray(encode(pixels, space)).resize(grid, Image.Resampling.BOX)
        errors[space] = round(float(np.abs(np.asarray(candidate) - ref)[active].mean()), 3)
    return {"tile": key, "cells": int(active.sum()), "sha256": sha,
            "icc": bool(tile.info.get("icc_profile")), "errors": errors}


def verdict(measures):
    # Every sampled level has a vote. Give a small extreme-zoom footprint
    # less influence when only a few reference pixels cover the whole tile.
    weights = np.sqrt(np.minimum(100, [m["cells"] for m in measures]))
    errors = {p: round(float(np.average([m["errors"][p] for m in measures], weights=weights)), 3)
              for p in PROFILES}
    best = min(errors, key=errors.get)
    raw = errors["srgb"]
    if best == "srgb" or raw - errors[best] < 1.25:
        return "srgb", ("matched" if raw < 5 else "review"), errors
    successes = sum(m["errors"]["srgb"] - m["errors"][best] >= 0.8 for m in measures)
    conflicts = sum(m["errors"][best] > m["errors"]["srgb"] + 2 for m in measures)
    gain = raw - errors[best]
    robust = errors[best] < 4 or (errors[best] < 8 and gain > raw * 0.55)
    if successes >= 2 and not conflicts and gain > raw * 0.22 and robust:
        return best, "matched", errors
    return "srgb", "review", errors


def zoomify(cache, record, preview, extended=False):
    levels = record["levels"]
    top = len(levels) - 1
    middle = min(2, top)
    mid = levels[middle]
    samples = [(0, 0, 0), (middle, (mid["width"] // 2) // 256, (mid["height"] // 2) // 256)]
    if top:
        samples.append((top, *best_tile(preview, levels[top])))
    def observe(key):
        return measure(cache, record, preview, *key)
    measurements = {s: result for s in dict.fromkeys(samples) if (result := observe(s)) is not None}
    space, decision, errors = verdict(list(measurements.values()))
    if decision == "review" or extended:
        for order in dict.fromkeys([min(1, top), min(3, top), max(0, top - 1)]):
            used = [(x,y) for z,x,y in measurements if z == order]
            s = (order, *best_tile(preview, levels[order], used))
            if s not in measurements:
                result = observe(s)
                if result is not None:
                    measurements[s] = result
        space, decision, errors = verdict(list(measurements.values()))
    return {"space": space, "decision": decision, "error": errors, "samples": list(measurements.values())}


def cosmic_cliffs(preview):
    # This one artwork uses our sparse AVIF HiPS projection of the source TIFF.
    # Map source UV through the production WCS/HEALPix functions and compare
    # the actual offline tiles, not the unrelated web Zoomify pyramid.
    sites = node("""
      import fs from 'node:fs';
      import {createWebbPlate,webbPlateRay} from './src/webb-plate.js';
      import {hipsPixel} from './src/sky-detail-math.js';
      const r=JSON.parse(fs.readFileSync('src/webb-gallery-data.json')).find(x=>x.id==='weic2205a');
      const p=createWebbPlate(r.plate),sites=[];
      for(const z of [9,10,11]) for(let j=0;j<33;j++) for(let i=0;i<33;i++){
        const x=.1+i/40,y=.1+j/40,h=hipsPixel(z,webbPlateRay(p,x,y));
        sites.push([x,y,z,h.pixel,h.u,h.v]);
      }
      console.log(JSON.stringify(sites));
    """)
    tiles = json.loads((ROOT / "assets/sky-detail/manifest.json").read_text())["local"]["tiles"]
    results = []
    for order in (9, 10, 11):
        source = []
        actual = []
        cache = {}
        hashes = {}
        for x, y, z, index, u, v in sites:
            if z != order:
                continue
            if index not in cache:
                path = ROOT / tiles[f"{z}/{index}"]
                data = path.read_bytes()
                hashes[index] = digest(data)
                cache[index] = Image.open(io.BytesIO(data)).convert("RGBA")
            def patch(im, a, b):
                px, py = int(a * im.width), int(b * im.height)
                return np.asarray(im.crop((px-2,py-2,px+3,py+3)), dtype=float).mean(axis=(0,1))
            rgba = patch(cache[index], u, v)
            if rgba[3] < 250:
                continue
            actual.append(rgba[:3])
            source.append(patch(preview, x, y))
        colors = np.rint(actual).astype(np.uint8)
        errors = {p: round(float(np.abs(encode(colors, p)-source).mean()), 3) for p in PROFILES}
        results.append({"order": order, "cells": len(colors), "tiles": hashes, "errors": errors})
    space, decision, errors = verdict(results)
    return {"space":space,"decision":decision,"error":errors,"samples":results}


def orient_reference(preview, root_tile):
    # Do not change sky registration. The legacy galaxy heic0614a is presented
    # upside down in the comparison JPEG relative to the official Zoomify tiles.
    def luma(im):
        return np.asarray(im.convert("L").resize((64,64), Image.Resampling.BOX), dtype=float)[1:-1,1:-1]
    ref, tile = luma(preview), luma(root_tile)
    if min(ref.std(), tile.std()) < 1:
        return preview, "identity"
    original = float(np.corrcoef(ref.ravel(), tile.ravel())[0,1])
    if original > 0.8:
        return preview, "identity"
    operations = [Image.Transpose.ROTATE_90, Image.Transpose.ROTATE_180, Image.Transpose.ROTATE_270,
                  Image.Transpose.FLIP_LEFT_RIGHT, Image.Transpose.FLIP_TOP_BOTTOM,
                  Image.Transpose.TRANSPOSE, Image.Transpose.TRANSVERSE]
    # Search on the already reduced image; transpose the full reference once.
    thumbnail = Image.fromarray(ref.astype(np.uint8))
    scores = [float(np.corrcoef(np.asarray(thumbnail.transpose(op)).ravel(), tile.ravel())[0,1]) for op in operations]
    best = int(np.argmax(scores))
    if scores[best] > 0.84 and scores[best] > original + 0.2:
        return preview.transpose(operations[best]), operations[best].name
    return preview, "identity"


# Exact ICC resources within the original files. Read bounded byte ranges; the
# Andromeda PSB alone is 4.6 GB. A changed master must be inspected again.
MASTER_SLICES = {
    "hubble-heic0701g": ("tif", 25574, 912, "cc8c66eabc9fa13b93bcabd6398e1c2bbdcc52292b61688a0473be00ae16abdd"),
    "hubble-heic1502a": ("psb", 17878, 3144, "3f6d674174f3804eb0dabdac90ae17486e898c5063a66f861c116ea033da8301"),
}


def master_profile(directory, record):
    ext, start, length, expected = MASTER_SLICES[record["id"]]
    url = f'https://esahubble.org/media/archives/images/original/{record["slug"]}.{ext}'
    path = directory / "source.icc"
    if not path.exists() or digest(path.read_bytes()) != expected:
        data = subprocess.check_output(
            ["curl", "-fsSL", "--retry", "2", "--range", f"{start}-{start+length-1}",
             "--max-filesize", str(length), "--max-time", "25", url])
        if digest(data) != expected:
            raise ValueError(f"Original embedded ICC changed or range was unavailable: {url}")
        path.write_bytes(data)
    name = ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(str(path))).strip()
    return {"url":url, "offset":start, "bytes":length, "icc":name, "sha256":expected}


def tiff_profile(directory, record):
    """Read the embedded ICC without downloading the master or image strips."""
    url = f'https://esa{record["source"]}.org/media/archives/images/original/{record["slug"]}.tif'
    path = directory / "source.icc"
    untagged = directory / "source.no-icc"

    def span(start, size):
        data = subprocess.check_output(
            ["curl", "-fsSL", "--retry", "2", "--range", f"{start}-{start+size-1}",
             "--max-filesize", str(size), "--max-time", "25", url], stderr=subprocess.PIPE)
        if len(data) != size:
            raise ValueError(f"Incomplete TIFF directory in {url}")
        return data

    if not path.is_file() and not untagged.is_file():
        header = span(0, 8)
        endian = {b"II": "<", b"MM": ">"}[header[:2]]
        version, offset = struct.unpack(endian + "HI", header[2:8])
        if version != 42:
            raise ValueError(f"Unsupported TIFF directory in {url}")
        count, = struct.unpack(endian + "H", span(offset, 2))
        if not 0 < count <= 4096:
            raise ValueError(f"Invalid TIFF directory size in {url}")
        entries = struct.iter_unpack(endian + "HHII", span(offset + 2, count * 12))
        for tag, _, size, pos in entries:
            if tag == 34675:
                if not 128 <= size <= 1_500_000:
                    raise ValueError(f"Invalid ICC size in {url}")
                path.write_bytes(span(pos, size))
                break
        else:
            untagged.touch()
    if not path.is_file():
        return {"url":url, "icc":"untagged"}
    raw = path.read_bytes()
    icc = ImageCms.ImageCmsProfile(io.BytesIO(raw))
    meta = {"url":url, "bytes":len(raw), "sha256":digest(raw), "icc":ImageCms.getProfileDescription(icc).strip()}
    # Identify the actual transform, including curves that share a profile
    # description. Require agreement with LittleCMS on a synthetic RGB grid.
    if icc.profile.xcolor_space.strip() == "RGB":
        steps = [0, 32, 96, 160, 224, 255]
        colors = np.array(np.meshgrid(steps, steps, steps), dtype=np.uint8).T.reshape(1, -1, 3)
        managed = ImageCms.profileToProfile(Image.fromarray(colors), icc, SRGB, outputMode="RGB")
        scores = {p:float(np.abs(encode(colors,p).astype(float)-np.asarray(managed)).mean())
                  for p in PROFILES if p not in ("mono","dot15")}
        closest = min(scores, key=scores.get)
        if scores[closest] < 0.5:
            meta["encoding"] = closest
    return meta


def verify_close_match(directory, record, preview, result):
    # Some dark or nearly neutral photos differ by only one display level on
    # average. Corroborate the original ICC against multiple independent tile
    # levels, including the native one, before applying a small correction.
    meta = tiff_profile(directory, record)
    result["master"] = meta
    profile = meta.get("encoding")
    if not profile or profile == "srgb":
        return
    extra = zoomify(directory, record, preview, extended=True)
    result.update(samples=extra["samples"], error=extra["error"])
    deltas = [(int(s["tile"].split("-")[0]), s["errors"]["srgb"]-s["errors"][profile])
              for s in extra["samples"]]
    native = len(record["levels"]) - 1
    gains = {level for level, delta in deltas if delta >= 0.3}
    scores = extra["error"]
    if (len(gains) >= 2 and any(z == native and delta > 0.1 for z, delta in deltas) and
            min(delta for _, delta in deltas) >= -0.5 and
            scores["srgb"] - scores[profile] >= 0.25 and scores[profile] <= min(scores.values()) + 0.25):
        result.update(space=profile, decision="matched-master")


def mosaic_samples(cache, record, publication):
    # At native scale a single M31 tile covers less than 16 pixels of the 4K
    # reference. Validate distributed positions in the disk at three scales.
    rng = np.random.default_rng(1502)
    results = []
    for order in (5,7,9):
        level = record["levels"][order]
        colors = np.asarray(publication.resize((level["cols"],level["rows"]), Image.Resampling.BOX))
        candidates = [(x,y) for y in range(1,level["rows"]-1) for x in range(1,level["cols"]-1)
                      if colors[y,x].max() > 45]
        for i in rng.choice(len(candidates), min(12,len(candidates)), replace=False):
            results.append(measure(cache, record, publication, order, *candidates[i]))
    return results


def audit(cache, record):
    directory = cache / record["id"]
    preview, ref = reference(directory, record["preview"])
    if record["slug"] == "weic2205a":
        return {"id":record["id"], "reference":ref, **cosmic_cliffs(preview)}
    root, _ = read_photo(directory, "0-0-0", record["base"] + "/TileGroup0/0-0-0.jpg")
    preview, ref["orientation"] = orient_reference(preview, root)
    result = {"id":record["id"], "reference":ref, **zoomify(directory, record, preview)}
    if (result["decision"] == "matched" and result["space"] == "srgb" and
            min(result["error"], key=result["error"].get) != "srgb"):
        verify_close_match(directory, record, preview, result)
    if record["id"] in MASTER_SLICES:
        result["master"] = master_profile(directory, record)
    if record["id"] == "hubble-heic0701g":
        # This grayscale original explicitly declares Dot Gain 15%. Some
        # mip levels have a different black level; high-resolution samples
        # confirm the tagged curve and strongly favor it over uncorrected sRGB.
        scores = [s["errors"] for s in result["samples"]]
        if result["master"]["icc"] == "Dot Gain 15%" and all(s["dot15"] < 4 and
                s["dot15"] + 5 < s["srgb"] for s in scores):
            result.update(space="dot15", decision="matched-master")
    native = NATIVE_JPEGS.get(record["id"])
    fmt = "large" if native else PUBLICATION_FORMATS.get(record["id"])
    if fmt:
        url = f'https://cdn.esahubble.org/archives/images/{fmt}/{record["slug"]}.jpg'
        publication, meta = reference(directory, url, "comparison-publication")
        if native:
            level = record["levels"][-1]
            if (publication.size != (level["width"], level["height"]) or
                    native not in meta["icc"].lower()):
                raise ValueError(f"Native full-frame JPEG changed for {record['id']}")
            err = np.abs(np.asarray(preview.resize((48,48), Image.Resampling.BOX), float) -
                         np.asarray(publication.resize((48,48), Image.Resampling.BOX), float))
            result["nativeJPEG"] = {**meta, "space":native, "dimensions":publication.size,
                                    "meanScreenError":round(float(err.mean()), 3)}
            if record["id"] in ROW_DEFECTS:
                result["legacySampleRegion"] = "top 36% (matching rows of the historical pyramid)"
            elif native == "adobe":
                # The native Adobe file gives the source encoding independently.
                # Check it improves the older mosaic in each sampled footprint.
                if all(s["errors"]["adobe"] + 0.5 < s["errors"]["srgb"] for s in result["samples"]):
                    result.update(space="adobe", decision="matched-native")
        else:
            publication, meta["orientation"] = orient_reference(publication, root)
            against_full = zoomify(directory, record, publication)
            result["publication"] = {**meta, **against_full}
            if result["decision"] == "review" and against_full["decision"] == "matched":
                result.update(space=against_full["space"], decision="matched-publication")
            if record["id"] == "hubble-heic1502a":
                extra = mosaic_samples(directory, record, publication)
                result["mosaicSamples"] = extra
                native_scores = [s["errors"] for s in extra if s["tile"].startswith("9-")]
                medians = {p:float(np.median([s[p] for s in native_scores])) for p in PROFILES}
                if (min(medians, key=medians.get) == "srgb" and medians["srgb"] < 3 and
                        "srgb" in result["master"]["icc"].lower()):
                    result.update(space="srgb", decision="matched-master")
    return result

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    temp.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--index", type=Path, help="write compact runtime index after a complete audit")
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()
    records = catalog()
    results = []
    failures = []
    with ThreadPoolExecutor(args.workers) as pool:
        futures = {pool.submit(audit, args.cache, r):r["id"] for r in records}
        for n, future in enumerate(as_completed(futures), 1):
            try:
                results.append(future.result())
            except Exception as error:
                failures.append({"id":futures[future],"reason":str(error)})
                print(f"failed: {futures[future]}: {error}", flush=True)
            if n % 100 == 0:
                print(f"{n}/{len(records)} measured, {len(failures)} fetch or decoding failures", flush=True)
    results.sort(key=lambda r:r["id"])
    counts = Counter((r["decision"],r["space"]) for r in results)
    report = {"measured":len(results),"total":len(records),"failures":failures,
              "counts":{"/".join(k):v for k,v in sorted(counts.items())},"results":results}
    write_json(args.report, report)
    print(json.dumps({k:v for k,v in report.items() if k != "results"}, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit("Resolve all retrieval failures before replacing the runtime index.")
    if args.index:
        unresolved = [r["id"] for r in results if r["decision"] == "review"]
        if unresolved:
            raise SystemExit(
                f"Unresolved works: {len(unresolved)}. See {args.report}. The runtime index was preserved.")
        index = {p:[r["id"] for r in results if r["space"] == p] for p in PROFILES if p != "srgb"}
        write_json(args.index, index)


if __name__ == "__main__":
    main()
