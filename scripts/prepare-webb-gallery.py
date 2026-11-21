#!/usr/bin/env python3
"""Refresh the text-only ESA/Webb observation index. Build-time dependency: beautifulsoup4.

Run python3 scripts/prepare-webb-gallery.py from the project root. The public
gallery supplies the titles, credits and aliases. Read only JPEG header ranges
for AVM coordinates; verify each Zoomify pyramid against its own metadata.
"""
import argparse
import concurrent.futures
import hashlib
import json
import math
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

from bs4 import BeautifulSoup

SITE = "https://esawebb.org"
ARCHIVE = "https://cdn.esawebb.org/archives/images"
FIRST = SITE + "/images/search/?facility=1&type=Observation"
AVM = "{http://www.communicatingastronomy.org/avm/1.0/}"
RDF = "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}"
# Labelled montages, moving bodies and diagrams belong in the preview gallery.
COMPOSITE_LAYOUT = re.compile(r"annotated|labelled|labeled|inset|infographic|comparison|side.by.side|spectrum|spectra|compass|illustration|artist.s|light curve|diagram|collage|montage|sonification|graphic|close.up and|\b(?:jupiter|saturn|neptune|uranus|mars|pluto|asteroid|comet|europa|ganymede|callisto|enceladus|titan|triton)\b", re.I)


# The archive's facility search also includes comparison plates. The Epsilon
# Indi Ab release explicitly describes an artificial star and masked-circle
# outline. Retain both entries as credited gallery previews.
PREVIEW_ONLY = {"weic2307f", "weic2421a"}


def fetch(url, header=False):
    key = hashlib.sha256((str(header) + url).encode()).hexdigest()
    path = CACHE / key
    if not path.exists():
        opts = ["--range", "0-65535"] if header else []
        result = subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location",
                                 "--retry", "2", "--max-time", "24", *opts, url], capture_output=True)
        if result.returncode:
            raise RuntimeError(f"{url}: {result.stderr.decode().strip()}")
        path.write_bytes(result.stdout)
    return path.read_bytes()


def soup(data):
    return BeautifulSoup(data, "html.parser")


def catalog_page(page):
    entries = []
    for anchor in page.select("#jGallery a[aria-label]"):
        ident = anchor["href"].rstrip("/").split("/")[-1]
        entries.append((ident, anchor["aria-label"]))
    return entries


def calibration(ident, data):
    packet = re.search(b"<x:xmpmeta.*?</x:xmpmeta>", data, re.S)
    if not packet:
        return None, []
    root = ET.fromstring(packet.group())
    desc = root.find(".//" + RDF + "Description")
    if desc is None:
        return None, []
    def values(key):
        return [v.text for v in desc.findall(".//" + AVM + key + "//" + RDF + "li") if v.text]
    instruments = list(dict.fromkeys(
        {"NIRCAM": "NIRCam"}.get(i, i) for i in values("Instrument") if i and i.lower() != "none"
    ))
    attr = lambda key: desc.get(AVM + "Spatial." + key)
    if attr("CoordinateFrame") != "ICRS" or attr("CoordsystemProjection") != "TAN" or attr("Quality") != "Full":
        return None, instruments
    arrays = [values("Spatial." + k) for k in ["ReferenceDimension", "ReferenceValue", "ReferencePixel"]]
    if any(len(a) != 2 for a in arrays):
        return None, instruments
    dims, ref, pix = ([float(v) for v in a] for a in arrays)
    # AVM CDMatrix takes precedence over the reduced scale/rotation form.
    cd = list(map(float, values("Spatial.CDMatrix")))
    if not cd:
        scale = values("Spatial.Scale")
        if not attr("Rotation") or len(scale) != 2:
            return None, instruments
        theta = math.radians(float(attr("Rotation")))
        sx, sy = -abs(float(scale[0])), abs(float(scale[1]))
        cd = [sx*math.cos(theta), -sy*math.sin(theta), sx*math.sin(theta), sy*math.cos(theta)]
    if (len(cd) != 4 or not all(math.isfinite(v) for v in [*dims, *ref, *pix, *cd])
            or min(dims) <= 0 or cd[0]*cd[3] == cd[1]*cd[2]):
        return None, instruments
    info = ET.fromstring(fetch(f"{ARCHIVE}/zoomable/{ident}/ImageProperties.xml"))
    width, height, size, count = (int(info.attrib[k]) for k in ["WIDTH", "HEIGHT", "TILESIZE", "NUMTILES"])
    if size != 256 or abs(width / height / (dims[0] / dims[1]) - 1) > 0.001:
        return None, instruments
    return [width, height, *dims, *ref, *pix, *cd, count], instruments


def row(entry):
    ident, title = entry
    page = soup(fetch(f"{SITE}/images/{ident}/"))
    fields = {tr.th.get_text(strip=True): tr.td for tr in page.select("tr") if tr.th and tr.td}
    credit = page.select_one(".credit")
    if credit is None:
        raise ValueError(f"No credit for {ident}")
    people = " ".join(credit.stripped_strings)
    aliases = [a.get_text(strip=True) for a in fields.get("Name:", []).select("a")] if "Name:" in fields else []
    category = fields["Category:"].get_text(" ", strip=True) if "Category:" in fields else ""
    released = datetime.strptime(fields["Release date:"].get_text(strip=True).split(",")[0], "%d %B %Y").date().isoformat()
    plate = None
    instruments = []
    if page.select_one('a[href="zoomable/"]') and ident not in PREVIEW_ONLY and not COMPOSITE_LAYOUT.search(" ".join([title, *aliases, category])) and "Solar System" not in category:
        plate, instruments = calibration(ident, fetch(f"{ARCHIVE}/screen/{ident}.jpg", True))
    if not instruments:
        instruments = list(dict.fromkeys(re.findall(r"NIRCam|MIRI|NIRSpec|NIRISS|Hubble|ALMA|Chandra", title + " " + category)))
    return {"id": ident, "title": title, "aliases": aliases, "credit": people, "released": released,
            "bands": " + ".join(instruments), **({"plate": plate} if plate else {})}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, help="Reuse this directory for an interrupted metadata collection.")
    parser.add_argument("--out", type=Path, default=Path("src/webb-gallery-data.json"))
    args = parser.parse_args()
    temporary = tempfile.TemporaryDirectory() if args.cache is None else None
    CACHE = args.cache or Path(temporary.name)
    CACHE.mkdir(parents=True, exist_ok=True)
    first = soup(fetch(FIRST))
    entries = catalog_page(first)
    assert entries, "No observations in ESA/Webb archive"
    last = max(int(a.get_text(strip=True)) for a in first.select(".pagination a"))
    for page in range(2, last + 1):
        entries.extend(catalog_page(soup(fetch(f"{SITE}/images/archive/search/page/{page}/?facility=1&type=Observation"))))
    assert len(entries) == len(set(k for k, _ in entries))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        records = list(pool.map(row, entries))
    args.out.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")).replace("},{", "},\n{") + "\n")
    print(f"{len(records)} observations, {sum('plate' in r for r in records)} calibrated pyramids")
