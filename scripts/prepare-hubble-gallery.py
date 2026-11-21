#!/usr/bin/env python3
"""Build the text-only ESA/Hubble gallery from the official facility/observation search.

Requires beautifulsoup4 and Pillow. Reuse --cache when resuming. Temporary HTTP
failures stop publication of the index; a documented missing asset is retained
as a gallery preview. No science image or tile is copied into the application.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import io
import json
import math
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
from urllib.parse import parse_qs, urljoin, urlsplit

from bs4 import BeautifulSoup
from PIL import Image

SITE = "https://esahubble.org"
ARCHIVE = "https://cdn.esahubble.org/archives/images"
AVM = "{http://www.communicatingastronomy.org/avm/1.0/}"
RDF = "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}"
SAMPLE = ["heic1501a", "heic1502a", "heic0506a", "heic1410a"]
MOTION = re.compile(
    r"\b(jupiter|saturn|neptune|uranus|mars|pluto|asteroids?|comets?|mercury|venus|ceres|vesta|eris|haumea|makemake|europa|ganymede|callisto|enceladus|titan|triton|io|kuiper belt|solar system)\b",
    re.I,
)
LAYOUT = re.compile(
    r"\b(annotated|labelled|labeled|insets?|infographic|comparison|side.by.side|spectra|spectrum|compass|illustration|artist.s|light curve|diagram|collage|montage|panels?|sonification|infographic|before and after|time.lapse|location of|finder chart|mass map|mass distribution|mass overlay|dark matter map)\b",
    re.I,
)
CAPTION_LAYOUT = re.compile(
    r"(?:left|right)[ -]hand panel|(?:left|right|upper|lower|top|bottom|middle|central) (?:panel|inset)|(?:left|right|upper|lower) (?:image|frame) (?:shows|is|reveals)|(?:two|three|four|individual|upper|lower) panels|inset (?:shows|reveals|at|image)|(?:superimposed|overlaid) (?:circles|arrows)|(?:compass|scale bar) (?:and|at|is|indicates)",
    re.I,
)

MARKUP = re.compile(
    r"\b(?:marked|indicated|identified|highlighted|outlined|encircled) (?:by|with|in) "
    r"(?:(?:a|an|the|small|large|dashed|dotted|white|black|yellow|green|red|blue|orange) ){0,4}"
    r"(?:circles?|arrows?|boxes|box|rectangles?|crosshairs?)\b",
    re.I,
)


# Where the credits/filter table omits these fields, the official caption
# explicitly identifies the acquisition instrument or observed wavelengths.
CAPTION_INSTRUMENTS = {
    "heic0815j": ["ACS", "ACIS"],
    "opo1024a": ["WFPC2", "ACS"],
    "opo1036a": ["WFPC2", "ACS", "WFC3"],
    "opo9443b": ["Planetary Camera"],
    "opo9443f": ["WFPC2"],
}
CAPTION_BANDS = {
    "opo0005a": "Optical / Infrared",
    "opo1335a": "Optical / Infrared",
    "opo1506b": "Optical",
    "opo9711c": "Infrared",
    "opo9722a": "Optical",
    "opo9730b": "Optical",
    "opo9730c": "Optical",
    "opo9733a": "Infrared",
    "opo9933g": "Optical",
}


class Missing(Exception):
    """The server explicitly reported that a particular asset is unavailable."""


def fetch(path, url, header=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return path.read_bytes()
    absent = path.with_suffix(".missing")
    if absent.exists():
        raise Missing(url)
    temp = path.with_name(path.name + ".download")
    flags = ["--range", "0-65535", "--max-filesize", "3000000"] if header else []
    cmd = [
        "curl",
        "-sSL",
        "--compressed",
        "--max-time",
        "30",
        "--retry",
        "2",
        "--retry-delay",
        "1",
        "--output",
        str(temp),
        "--write-out",
        "%{http_code}",
        *flags,
        url,
    ]
    reply = subprocess.run(cmd, capture_output=True)
    code = reply.stdout.decode().strip()
    if code in ("404", "410"):
        absent.touch()
        temp.unlink(missing_ok=True)
        raise Missing(url)
    if reply.returncode or code not in ("200", "206"):
        raise RuntimeError(f"{url}: HTTP {code}, curl {reply.returncode}")
    temp.replace(path)
    return path.read_bytes()


def listing(cache):
    def page(n):
        url = f"{SITE}/images/archive/search/page/{n}/?type=Observation&facility=2"
        data = fetch(cache / "pages" / str(n), url)
        block = data.split(b"var images = [", 1)[1].split(b"];", 1)[0]
        total = int(re.search(rb"Showing\s+\d+ to \d+ of (\d+)", data)[1])
        return total, [x.decode() for x in re.findall(rb"id: '([^']+)'", block)]

    total, ids = page(1)
    with ThreadPoolExecutor(6) as pool:
        for count, more in pool.map(page, range(2, math.ceil(total / len(ids)) + 1)):
            if count != total:
                raise ValueError("Catalogue changed during pagination")
            ids.extend(more)
    if len(ids) != total or len(set(ids)) != total:
        raise ValueError("Official catalogue changed or duplicate work IDs encountered")
    return ids


def clean(node):
    return " ".join(node.get_text().split()) if node else ""


def filters(page):
    out = []
    for tr in page.select('table[aria-describedby="Colours & filters"] tr'):
        cols = tr.find_all("td", recursive=False)
        if len(cols) != 3:
            continue
        band, instrument = (cols[i].select_one("span.band_instrument") for i in [0, 2])

        def text_except(node, skip):
            return " ".join(
                s.strip() for s in node.strings if s.strip() and (not skip or skip not in s.parents)
            )

        out.append(
            [
                text_except(cols[2], instrument),
                clean(instrument),
                text_except(cols[0], band),
                clean(band),
                clean(cols[1]),
            ]
        )
    return out


def semantic_reason(title, aliases, category, caption):
    subject = " ".join([title, *aliases, category])
    # Object categories distinguish M62 (called "Comet or cluster?") and
    # the "Comet Galaxy" from actual Solar System targets.
    deep_sky = re.search(r"galaxies|nebulae|star clusters|cosmology|quasars", category, re.I)
    if re.search(r"solar system", category, re.I) or (MOTION.search(subject) and not deep_sky):
        return "moving-target"
    # Multi-wavelength images can be continuous, unlike spectral plots.
    title = re.sub(r"across the (?:electromagnetic )?spectrum", "across bands", title, flags=re.I)
    # Do not exclude a non-annotated plate merely because of this suffix.
    if (
        LAYOUT.search(re.sub(r"(?:non|un)[ -]?annotated", "", title, flags=re.I))
        or CAPTION_LAYOUT.search(caption)
        or MARKUP.search(caption)
    ):
        return "illustrated-layout"
    return ""


def xmp(data):
    packet = re.search(rb"<x:xmpmeta.*?</x:xmpmeta>", data, re.S)
    if not packet:
        return None
    root = ET.fromstring(packet.group())
    values = {}
    for node in root.findall(".//" + RDF + "Description"):
        values.update({k[len(AVM) :]: v for k, v in node.attrib.items() if k.startswith(AVM)})
        for child in node:
            if not child.tag.startswith(AVM):
                continue
            elems = [item.text for item in child.iter(RDF + "li") if item.text]
            values[child.tag[len(AVM) :]] = elems or (child.text or "").strip()
    return values


def plate_values(data):
    if not data or (
        data.get("Spatial.CoordinateFrame", "").upper(),
        data.get("Spatial.CoordsystemProjection", "").upper(),
        data.get("Spatial.Quality", "").upper(),
    ) != ("ICRS", "TAN", "FULL"):
        return None

    def numbers(field):
        val = data.get("Spatial." + field, [])
        return list(map(float, val)) if isinstance(val, list) else []

    dims, ref, px = [numbers(k) for k in ("ReferenceDimension", "ReferenceValue", "ReferencePixel")]
    if any(len(a) != 2 for a in (dims, ref, px)) or min(dims) < 1 or abs(ref[1]) > 90:
        return None
    cd = numbers("CDMatrix")
    if not cd:
        scale, rotation = numbers("Scale"), data.get("Spatial.Rotation")
        if len(scale) != 2 or rotation in (None, ""):
            return None
        sx, sy = scale
        theta = math.radians(float(rotation))
        cd = [sx * math.cos(theta), -sy * math.sin(theta), sx * math.sin(theta), sy * math.cos(theta)]
    if (
        len(cd) != 4
        or cd[0] * cd[3] == cd[1] * cd[2]
        or not all(map(math.isfinite, dims + ref + px + cd))
    ):
        return None
    return dims + ref + px + cd


def matches_published_coordinates(cal, fields, page):
    # The web table gives the WCS reference pixel, which need not be the image
    # centre. Compare against CRVAL before checking both axes and north angle.
    w, h, ra, dec, _, _, a, b, c, d = cal

    def triple(key):
        value = clean(fields.get(key))
        parts = re.findall(r"[0-9.]+", value)
        if len(parts) != 3:
            return None
        degrees, minutes, seconds = map(float, parts)
        return (-1 if value.lstrip().startswith(("-", "−")) else 1) * (
            degrees + minutes / 60 + seconds / 3600
        )

    ra_hours, declination = triple("Position (RA):"), triple("Position (Dec):")
    # Some formatted tables lose the minus sign on declinations from -1 to 0.
    # ESA's full-precision WWT link on the same page preserves the signed value.
    link = page.select_one('a[href*="ShowImage.aspx"]')
    if link:
        params = parse_qs(urlsplit(link["href"]).query)
        if params.get("ra") and params.get("dec"):
            ra_hours = float(params["ra"][0]) / 15
            declination = float(params["dec"][0])
    if (
        ra_hours is not None
        and abs((ra_hours * 15 - ra + 180) % 360 - 180) * abs(math.cos(math.radians(dec))) > 0.001
    ):
        return False
    if declination is not None and abs(declination - dec) > 0.001:
        return False
    extent = clean(fields.get("Field of view:"))
    size = re.search(r"([0-9.]+)\s*[x×]\s*([0-9.]+)\s*(arcminutes|arcseconds|degrees)", extent)
    if size:
        unit = {"degrees": 1, "arcminutes": 60, "arcseconds": 3600}[size[3]]
        for observed, expected in zip(
            [float(size[1]), float(size[2])], [w * math.hypot(a, c) * unit, h * math.hypot(b, d) * unit]
        ):
            if abs(observed - expected) > max(0.012, observed * 0.01):
                return False
    angle = re.search(r"([0-9.]+).*?\b(left|right)\b", clean(fields.get("Orientation:")))
    if angle:
        det = a * d - b * c
        north = math.degrees(math.atan2(-b / det, a / det))
        official = float(angle[1]) * (1 if angle[2] == "right" else -1)
        if abs((north - official + 180) % 360 - 180) > 1:
            return False
    return True


def levels(width, height, count):
    for half in (math.ceil, math.floor):
        w, h = width, height
        items = []
        while True:
            items.append((w, h, math.ceil(w / 256), math.ceil(h / 256)))
            if max(w, h) <= 256:
                break
            w, h = max(1, half(w / 2)), max(1, half(h / 2))
        items.reverse()
        if sum(x * y for _, _, x, y in items) == count:
            return items
    return []


def check_pyramid(cache, ident, cal, original):
    base = f"{ARCHIVE}/zoomable/{ident}/"
    try:
        xml = ET.fromstring(fetch(cache / "props" / ident, base + "ImageProperties.xml"))
        w, h, tile, count = (int(xml.attrib[k]) for k in ("WIDTH", "HEIGHT", "TILESIZE", "NUMTILES"))
        viewer_metadata = False
    except Missing:
        # Some working ESA pyramids have no ImageProperties.xml. Read their
        # actual OpenSeadragon viewer configuration; version 2.4 computes
        # each lower grid by integer halving with 256-pixel tiles.
        viewer = fetch(cache / "viewers" / ident, f"{SITE}/images/{ident}/zoomable/").decode()
        src = re.search(r"tileSources:\s*\[\s*\{([^{}]+)\}", viewer)
        if not src or "zoomifytileservice" not in src[1] or base not in src[1]:
            return "missing-asset"
        viewer_size = [re.search(key + r":\s*(\d+)", src[1]) for key in ("width", "height")]
        if not all(viewer_size):
            return "missing-asset"
        w, h = [int(match[1]) for match in viewer_size]
        tile = 256
        count = 0
        ww, hh = w, h
        while ww > 0 and hh > 0:
            count += math.ceil(ww / tile) * math.ceil(hh / tile)
            if max(ww, hh) <= tile:
                break
            ww, hh = ww // 2, hh // 2
        viewer_metadata = True
    if (
        tile != 256
        or min(w, h) < 1
        or abs(w / h / (cal[0] / cal[1]) - 1) > 0.001
        or (original and abs(w / h / (original[0] / original[1]) - 1) > 0.001)
    ):
        return "pyramid-mismatch"
    tiers = levels(w, h, count)
    if not tiers:
        return "pyramid-mismatch"
    probes = [(0, 0, 0), (len(tiers) - 1, tiers[-1][2] - 1, tiers[-1][3] - 1)]
    if viewer_metadata:
        probes.extend((i, tier[2] - 1, tier[3] - 1) for i, tier in enumerate(tiers))
    if ident in SAMPLE:
        probes.append((len(tiers) - 1, tiers[-1][2] // 2, tiers[-1][3] // 2))
    for z, x, y in dict.fromkeys(probes):
        width, height, cols, rows = tiers[z]
        offset = sum(a * b for _, _, a, b in tiers[:z]) + y * cols + x
        name = f"{z}-{x}-{y}"
        jpg = fetch(cache / "checks" / ident / name, f"{base}TileGroup{offset//256}/{name}.jpg")
        with Image.open(io.BytesIO(jpg)) as image:
            if image.format != "JPEG":
                return "pyramid-mismatch"
            image.load()
            for actual, nominal in zip(
                image.size, [min(256, width - 256 * x), min(256, height - 256 * y)]
            ):
                if not 1 <= actual <= 256 or (
                    actual != nominal and (nominal == 256 or abs(actual - nominal) > 1)
                ):
                    return "pyramid-mismatch"
    return [w, h, *cal, count]


def record(cache, ident):
    page = BeautifulSoup(fetch(cache / "details" / ident, f"{SITE}/images/{ident}/"), "html.parser")
    heading = page.select_one("h1")
    title = clean(heading)
    fields = {tr.th.get_text(strip=True): tr.td for tr in page.select("tr") if tr.th and tr.td}
    if clean(fields.get("Id:")) != ident or not title:
        raise ValueError(f"Invalid official detail page {ident}")
    credit = page.select_one(".credit")
    # Some releases nest paragraphs, use <br>, or attach an acknowledgement
    # after a formatted paragraph. Preserve the full credit block and its breaks.
    if credit:
        for node in credit.find_all(["p", "div", "br", "li"]):
            node.insert_after("\n")
    attribution = "\n".join(
        line
        for part in (credit.get_text() if credit else "").splitlines()
        if (line := " ".join(part.split()))
    )

    aliases = [clean(a) for a in fields["Name:"].select("a")] if "Name:" in fields else []
    aliases = [s for s in dict.fromkeys(aliases) if s]
    photo = page.select_one(".left-column img[srcset]")
    thumb = f"{ARCHIVE}/thumb300y/{ident}.jpg"
    if photo:
        urls = re.findall(r"(\S+)\s+(\d+)w", photo.get("srcset", ""))
        if urls:
            thumb = urljoin(SITE, min(urls, key=lambda item: int(item[1]))[0])
    release = (
        datetime.strptime(clean(fields["Release date:"]).split(",")[0], "%d %B %Y").date().isoformat()
    )
    # The official preview may be hosted on either esahubble.org or its CDN.
    preview = (
        urljoin(SITE, photo.parent.get("href") or photo.get("src", ""))
        if photo and photo.parent
        else thumb
    )
    flt = filters(page)
    instruments = list(dict.fromkeys(f[1] for f in flt if f[1]))
    bands = " / ".join(dict.fromkeys(f[2] for f in flt if f[2]))
    row = {
        "id": ident,
        "title": title,
        "aliases": aliases,
        "credit": attribution,
        "released": release,
        "bands": bands,
        "instruments": instruments,
        "filters": flt,
        "thumb": thumb,
        "preview": preview,
    }
    body = credit.find_previous("div", style=lambda v: v and "margin-top: 10px" in v) if credit else None
    description = " ".join(clean(p) for p in body.find_all("p", recursive=False)) if body else ""
    reason = semantic_reason(title, aliases, clean(fields.get("Category:")), description)
    # Reviewed against their official captions: GOODS-N-774 is the standalone
    # crop itself; the listed lensing works overlay inferred mass maps.
    if ident == "heic1418d":
        reason = ""
    if ident in {"heic1215a", "heic1005a", "opo0639a", "heic1111a", "heic0709a", "heic0802b"}:
        reason = "illustrated-layout"
    if not page.select_one('a[href="zoomable/"]'):
        reason = reason or "no-pyramid"
    data = None
    if not reason or not instruments or not bands or not row["credit"]:
        try:
            data = xmp(fetch(cache / "headers" / ident, preview, header=True)) or {}
        except (Missing, ET.ParseError):
            data = {}

        def strings(key):
            value = data.get(key, [])
            values = value if isinstance(value, list) else [value]
            return [v.strip() for v in values if v and v.strip().lower() not in ("", "none")]

        if not row["credit"]:
            row["credit"] = " ".join(strings("Credit"))
        if not instruments:
            row["instruments"] = list(dict.fromkeys(strings("Instrument")))
        if not bands:
            row["bands"] = " / ".join(dict.fromkeys(strings("Spectral.Band")))
        if not flt:
            series = [
                strings(k)
                for k in (
                    "Facility",
                    "Instrument",
                    "Spectral.Band",
                    "Spectral.Bandpass",
                    "Spectral.CentralWavelength",
                )
            ]
            n = max(map(len, series))
            if n and all(len(x) in (0, 1, n) for x in series):
                row["filters"] = [
                    [v[i] if len(v) == n else v[0] if v else "" for v in series] for i in range(n)
                ]
                for item in row["filters"]:
                    if item[-1] and re.fullmatch(r"[0-9.]+", item[-1]):
                        item[-1] += " nm"
        row["aliases"] = list(dict.fromkeys([*aliases, *strings("Subject.Name")]))
    if not row["instruments"]:
        row["instruments"] = CAPTION_INSTRUMENTS.get(ident, [])
    if not row["bands"]:
        row["bands"] = CAPTION_BANDS.get(ident, "")
    if not row["credit"]:
        raise ValueError(f"Missing credit: {ident}")
    if not reason:
        try:
            cal = plate_values(data)
            if cal and not matches_published_coordinates(cal, fields, page):
                reason = "wcs-disagreement"
            elif cal:
                original = [int(m) for m in re.findall(r"\d+", clean(fields.get("Size:")))]
                result = check_pyramid(cache, ident, cal, original if len(original) == 2 else [])
                if isinstance(result, list):
                    row["plate"] = result
                else:
                    reason = result
            else:
                reason = "no-reliable-wcs"
        except Missing:
            reason = "missing-asset"
        except (ET.ParseError, KeyError, ValueError, Image.UnidentifiedImageError):
            reason = "invalid-metadata"
    if reason:
        row["reason"] = reason
    return row


def write_json(path, data):
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("},{", "},\n{") + "\n"
    )
    temp.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache",
        type=Path,
        required=True,
        help="A dated working directory; reuse for retries, choose a fresh directory for a new catalogue snapshot.",
    )
    parser.add_argument("--out", type=Path, default=Path("src/hubble-gallery-data.json"))
    parser.add_argument(
        "--recheck", action="store_true", help="Revalidate cached rows using cached official responses."
    )
    parser.add_argument("--jobs", type=int, default=10)
    parser.add_argument(
        "--sample", action="store_true", help="Write only four real works for integration testing."
    )
    args = parser.parse_args()
    cache = args.cache
    (cache / "rows").mkdir(parents=True, exist_ok=True)
    ids = SAMPLE if args.sample else listing(cache)

    def one(ident):
        path = cache / "rows" / ident
        if path.exists() and not args.recheck:
            return json.loads(path.read_text())
        row = record(cache, ident)
        write_json(path, row)
        return row

    records = {}
    errors = []
    with ThreadPoolExecutor(args.jobs) as pool:
        tasks = {pool.submit(one, id): id for id in ids}
        for future in as_completed(tasks):
            id = tasks[future]
            try:
                records[id] = future.result()
            except Exception as error:
                errors.append(id)
                print(f"FAILED {id}: {error}", flush=True)
            if len(records) and len(records) % 100 == 0:
                print(f"{len(records)} ready / {len(ids)}", flush=True)
    if errors:
        raise SystemExit(f"Retry {len(errors)} items; previous output retained")
    write_json(args.out, [records[id] for id in ids])
    print(
        f'{len(ids)} works, {sum("plate" in r for r in records.values())} verified pyramids', flush=True
    )


if __name__ == "__main__":
    main()
