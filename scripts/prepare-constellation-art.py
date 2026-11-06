"""Prepare the complete, separately licensed Stellarium illustration collection.

Requires Python 3, Pillow with AVIF support, and curl. Original downloads stay in
ignored output/. --offline rebuilds from that cache without any network access.
No star catalogue is downloaded: the 255 HIP anchors join the existing XHIP data.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]
COMMIT = "daace2add6a1bf886e8ee1934f51e9c69f818d18"
BASE = f"https://raw.githubusercontent.com/Stellarium/stellarium/{COMMIT}/skycultures/modern/"
GROUPS = {"Pup": "Car", "Vel": "Car", "Ser": "Oph"}
FAL = "https://artlibre.org/licence/lal/en/"
CC = "https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def direction(ra, dec):
    ra, dec = math.radians(ra), math.radians(dec)
    return [round(v, 15) for v in (math.cos(dec) * math.cos(ra),
                                  math.cos(dec) * math.sin(ra), math.sin(dec))]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path,
                        default=ROOT / "output/constellation-art-work/upstream")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets/constellation-art")
    parser.add_argument("--quality", type=int, default=95)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    assert 85 <= args.quality <= 100, "Quality must preserve faint artwork strokes"
    args.source_dir.mkdir(parents=True, exist_ok=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    def fetch(name, url):
        path = args.source_dir / name
        if not path.exists():
            if args.offline:
                raise FileNotFoundError(path)
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(path.suffix + ".part")
            subprocess.run(["curl", "-fsSL", "--retry", "2", "--max-time", "45",
                            url, "-o", str(temporary)], check=True)
            temporary.replace(path)
        return path

    index_path = fetch("index.json", BASE + "index.json")
    description_path = fetch("description.md", BASE + "description.md")
    index = json.loads(index_path.read_text())
    assert index["id"] == "modern"
    constellations = {c["id"].split()[-1]: c for c in index["constellations"]}
    assert len(constellations) == 88
    assert {key for key, c in constellations.items() if "image" not in c} == set(GROUPS)
    chart = json.loads((ROOT / "assets/star-chart.json").read_text())
    assert set(constellations) == {c["id"] for c in chart["constellations"]}
    stars_path = ROOT / "assets/stars.json"
    stars = {int(row[0]): row for row in json.loads(stars_path.read_text())}
    image_id = lambda c: Path(c["image"]["file"]).stem
    mapping = {key: image_id(constellations[GROUPS.get(key, key)]) for key in constellations}
    source_images = [c for c in constellations.values() if "image" in c]
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda c: fetch(c["image"]["file"], BASE + c["image"]["file"]),
                      source_images))

    records = []
    for c in source_images:
        info = c["image"]
        source = args.source_dir / info["file"]
        original = Image.open(source)
        assert original.mode in ("L", "RGB"), f"Unexpected source mode: {source}"
        if original.mode == "RGB":
            red, green, blue = original.split()
            assert ImageChops.difference(red, green).getextrema()[1] <= 4
            assert ImageChops.difference(green, blue).getextrema()[1] <= 4
        original = original.convert("L")
        assert list(original.size) == info["size"]
        # A continuous luminance-to-alpha transfer preserves the original ink,
        # including dark line detail. White RGB allows a runtime tint without
        # dark rectangles or colour fringes under bilinear/mipmap sampling.
        rgba = Image.new("RGBA", original.size, (255, 255, 255, 255))
        rgba.putalpha(original)
        name = image_id(c) + ".avif"
        out = args.output_dir / name
        rgba.save(out, quality=args.quality, speed=6, max_threads=2,
                  subsampling="4:4:4", alpha_premultiplied=False)
        decoded = Image.open(out)
        alpha = decoded.getchannel("A")
        error = ImageChops.difference(alpha, original)
        pairs = list(zip(original.getdata(), alpha.getdata()))
        faint = [(a, b) for a, b in pairs if 1 <= a <= 12]
        metrics = {
            "alphaMeanAbsoluteError": round(ImageStat.Stat(error).mean[0], 6),
            "alphaMaximumError": error.getextrema()[1],
            "faintMeanAbsoluteError": round(sum(abs(a-b) for a, b in faint) / max(1, len(faint)), 6),
        }
        assert metrics["alphaMeanAbsoluteError"] < 0.7, (name, metrics)
        assert metrics["faintMeanAbsoluteError"] < 1.5, (name, metrics)
        anchors = []
        for anchor in info["anchors"]:
            hip, ra, dec, *_ = stars[anchor["hip"]]
            anchors.append({"pos": anchor["pos"], "hip": hip, "ra": ra, "dec": dec,
                            "direction": direction(ra, dec)})
        assert len(anchors) == 3
        records.append({
            "imageId": image_id(c), "file": "assets/constellation-art/" + name,
            "width": original.width, "height": original.height, "size": info["size"],
            "constellationIds": [key for key, value in mapping.items() if value == image_id(c)],
            "anchors": anchors, "mimeType": "image/avif", "alpha": "source luminance",
            "bytes": out.stat().st_size, "sha256": sha(out.read_bytes()),
            "sourceFile": info["file"], "sourceBytes": source.stat().st_size,
            "sourceSha256": sha(source.read_bytes()), "quality": args.quality,
            "validation": metrics,
        })

    fal = fetch("LICENSE-FAL-1.3.html", FAL)
    cc = fetch("LICENSE-CC-BY-SA-4.0.txt", CC)
    for path in [fal, cc]:
        shutil.copyfile(path, args.output_dir / path.name)
    (args.output_dir / "upstream-description.md").write_bytes(description_path.read_bytes())
    manifest = {
        "version": 1,
        "source": {
            "project": "Stellarium", "culture": "modern", "commit": COMMIT,
            "url": f"https://github.com/Stellarium/stellarium/tree/{COMMIT}/skycultures/modern",
            "indexUrl": BASE + "index.json", "indexSha256": sha(index_path.read_bytes()),
            "descriptionSha256": sha(description_path.read_bytes()),
            "artCredit": "Johan Meuris / Stellarium Project; converted by Wenshuishi",
            "artLicense": "Free Art License 1.3", "artLicenseUrl": FAL,
            "dataLicense": "CC BY-SA 4.0", "dataLicenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
            "starCoordinates": "assets/stars.json; existing XHIP / d3-celestial J2000 equatorial catalogue",
            "starCoordinatesSha256": sha(stars_path.read_bytes()),
            "frame": "ICRS/J2000 equatorial unit directions: x=RA0, y=RA90, z=north",
            "imageCoordinates": "Anchor pos [x,y] starts at the image upper-left; size is the source reference size",
            "processing": f"Original dimensions retained; near-monochrome source luminance copied continuously to alpha with white RGB; AVIF quality {args.quality}, 4:4:4, straight alpha. No thresholding, retouching or upscaling.",
            "groups": {"argonavis": ["Car", "Pup", "Vel"], "ophiuchus": ["Oph", "Ser"]},
        },
        "constellationImages": dict(sorted(mapping.items())),
        "images": sorted(records, key=lambda r: r["imageId"]),
    }
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False,
                                                              separators=(",", ":")) + "\n")
    (args.output_dir / "README.md").write_text(f"""# Constellation illustrations / 星座示意绘图

85 illustrations cover all 88 IAU constellation IDs. The complete Argo Navis
drawing is shared by Carina/Puppis/Vela; Ophiuchus and Serpens share the serpent
bearer drawing. Shared illustrations must be drawn only once. These are artistic
figures aligned to HIP stars, not photographs or official IAU boundary polygons.

Original art: **Johan Meuris / Stellarium Project**, **Free Art License 1.3**.
Source culture: [Stellarium modern at {COMMIT}]({manifest['source']['url']}).
The [official Web culture's author credits](https://github.com/Stellarium/stellarium-skycultures/blob/master/western/description.md)
identify Johan Meuris. Upstream modern data and anchor positions: **CC BY-SA 4.0**.
The existing StarOrbit HIP coordinates keep their existing catalogue attribution.

Conversions by **Wenshuishi**: original 128/256/512 dimensions retained; grayscale
intensity becomes continuous straight alpha over white RGB; AVIF quality
{args.quality}, 4:4:4. No thresholding, upscaling, positional adjustment or
repainting. Source and derivative SHA-256 hashes are in manifest.json.

**These assets are excluded from the enclosing application's CC BY-NC license.**
The modified images remain under Free Art License 1.3; this derived placement
manifest remains under CC BY-SA 4.0. Keep this directory, its originals' links
and the complete LICENSE-FAL-1.3.html / LICENSE-CC-BY-SA-4.0.txt accessible and
separable when distributing the application, including an embedded/offline HTML.
Do not restrict reuse of these individual assets to noncommercial use.

The bundled FAL HTML is the unmodified official license page; upstream-description.md
preserves the source culture's license declaration. Rebuild with:

```sh
python3 scripts/prepare-constellation-art.py
python3 scripts/prepare-constellation-art.py --offline
```

The script downloads only the pinned metadata and 85 tiny originals into ignored
output/constellation-art-work/upstream. It joins all 255 anchors to assets/stars.json
and measures alpha error, including faint 1–12/255 strokes, after encoding.

图案是与真实恒星对应的艺术示意，不是星座的物理外形或官方天区边界。全部
88 个星座均有映射；南船三座及巨蛇/蛇夫共用原作，不能重复叠加。图片与定位
数据保留以上各自的自由许可证，不受本软件非商业许可的额外限制。
""")
    size = sum(p.stat().st_size for p in args.output_dir.iterdir() if p.is_file())
    assert size <= 2 * 1024 * 1024, f"Art package exceeds 2 MiB: {size}"
    print(json.dumps({"images": len(records), "constellations": len(mapping),
                      "imageBytes": sum(r["bytes"] for r in records), "packageBytes": size,
                      "maxAlphaMAE": max(r["validation"]["alphaMeanAbsoluteError"] for r in records),
                      "maxFaintMAE": max(r["validation"]["faintMeanAbsoluteError"] for r in records)}, indent=2))


if __name__ == "__main__":
    main()
