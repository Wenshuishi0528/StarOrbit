#!/usr/bin/env python3
"""Build text-only reading cues from the same cached official pages as the gallery indices.

Run after prepare-hubble-gallery.py and prepare-webb-gallery.py, passing their
cache directories. Requires lxml. Rereads the caption, AVM object classes and
the instrument table, never the image pixels. Each key is the official work ID.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

from lxml import html

ROOT = Path(__file__).resolve().parents[1]
# Specific features first. Each term must occur in the work's own caption.
CUES = {
    "lightEcho": r"light echo",
    "greatdark": r"great dark spot|dark vortex",
    "plume": r"plumes? of (?:gas|water|material|dust)|volcanic plumes?",
    "ice": r"surface ice|icy surface",
    "impactor": r"comet fragments?|fragments? of (?:the )?comet",
    "terminator": r"day.night (?:boundary|line)|\bterminator\b",
    "faceon": r"face.on",
    "edgeon": r"edge.on",
    "lobes": r"twin lobes|bipolar lobes|two lobes",
    "halo": r"stellar halo|halo of stars|galactic halo",
    "bulge": r"central bulge|galactic bulge",
    "core": r"crowded core|dense core|bright core|dense central region",
    "redgiants": r"red giant stars?|red giants",
    "bluestars": r"blue stars|blue young stars",
    "redstars": r"red stars",
    "darkpatch": r"dark patches|dark clouds?|dust silhouettes?",
    "lanespiral": r"curving arms|sweeping arms|winding arms|swirling arms",
    "ringgal": r"ring of stars|star.forming ring",
    "merger": r"merging galaxies|colliding galaxies|galaxy merger|galactic collision",
    "hii": r"star.forming regions?|sites? of star formation",
    "xray": r"X.ray emission|X.ray emitting gas",
    "lens": r"gravitational lens(?:es|ing)?",
    "galgroup": r"galax(?:y|ies) cluster|cluster of galaxies",
    "deepgal": r"distant galaxies|faraway galaxies",
    "diskgal": r"galactic di[sc][kc]|galaxy.s di[sc][kc]",
    "dustgas": r"dust and gas|gas and dust",
    "ionized": r"ionised gas|ionized gas|glowing gas",
    "wind": r"stellar winds?",
    "burst": r"burst of star formation|starburst",
    "protostars": r"protostars?",
    "whitedwarf": r"white dwarf",
    "supernova": r"supernova explosion|exploding star",
    "variable": r"variable star|cepheid",
    "quasar": r"quasars?",
    "protoplanet": r"planets? (?:forming|in formation)",
    "surface": r"surface features|surface markings",
    "clouds": r"cloud tops|atmospheric clouds|planet.s atmosphere",
    "clusterstars": r"thousands of stars|millions of stars|dense collection of stars",
    "pillars": r"pillars? of creation|pillars? of (?:gas|dust)",
    "aurora": r"\baurora(?:e|s|l)?\b",
    "impact": r"impact (?:site|scar|mark)s?",
    "spot": r"great red spot",
    "polar": r"polar caps?|polar ice caps?",
    "rings": r"ring system|planet.s rings|saturn.s rings|uranus.s rings|rings of (?:saturn|uranus|neptune)",
    "belts": r"cloud bands|bands of clouds|cloud belts",
    "tail": r"(?:comet.s|cometary|dust|ion) tails?|tail of (?:the|this) comet",
    "knots": r"cometary knots|knots of (?:gas|dust)|knots of star formation",
    "shell": r"shells? of gas|gaseous shells?|shells? of material",
    "shock": r"shock fronts?|bow shocks?",
    "jet": r"\bjets? of (?:material|gas)|\bbipolar jets?|\bstellar jets?",
    "spirals": r"\bspiral arms?\b",
    "bar": r"central bar|bar of stars|bar-shaped",
    "lanes": r"dust lanes?|lanes? of (?:dark )?dust",
    "tidal": r"tidal tails?|tidal streams?",
    "companion": r"companion galax(?:y|ies)|neighbouring companion",
    "nucleus": r"bright (?:central )?(?:nucleus|core)|galactic nucleus|bright galactic cent(?:er|re)",
    "arcs": r"lensed arcs?|arcs of light|gravitational arcs?|stretched into arcs",
    "diffraction": r"diffraction spikes?",
    "filaments": r"\bfilaments?\b",
    "bubbles": r"bubbles? of (?:gas|hot gas)|gas bubbles?|expanding bubbles?",
    "dust": r"clouds? of dust|dust clouds?|clouds? of gas and dust",
    "clusters": r"\bstar clusters?\b|clusters? of (?:young )?stars",
    "young": r"\byoung stars?\b|\bnewborn stars?\b",
    "background": r"background galaxies|galaxies in the background",
    "globules": r"dust globules?|globules of (?:gas|dust)|bok globules?",
    "starfield": r"star-filled|a field of stars|crowded (?:field of stars|star field)|densely packed stars",
    "disks": r"protoplanetary (?:discs?|disks?)|planet-forming (?:discs?|disks?)",
    "streamers": r"streamers of (?:dust|gas|material)|dust streamers",
    "hotspots": r"bright knots|bright clumps",
    "redshift": r"redshifted galaxies|high-redshift galaxies",
}
# Match full classification paths where a leaf such as 'Cluster' is ambiguous.
TYPES = {
    "globular": r": Globular",
    "open": r": Open",
    "galcluster": r"Galaxy : Grouping : (?:Cluster|Supercluster)",
    "starcluster": r"Star : Grouping : Cluster",
    "superrem": r": Supernova Remnant",
    "supernova": r": Supernova$",
    "planetary": r"Nebula : Type : Planetary",
    "starform": r": (?:Star Formation|H II Region|Young Stellar Object)",
    "reflection": r"Nebula : Appearance : Reflection",
    "dustdisk": r": (?:Proplyd|Protoplanetary)|Circumstellar Material : Disk",
    "quasar": r": Quasar",
    "active": r": (?:Seyfert|AGN|Central Black Hole)",
    "lensing": r": (?:Gravitationally Lensed|Lensing)",
    "interacting": r": Interacting",
    "barred": r": Barred",
    "spiral": r": Spiral",
    "elliptical": r": Elliptical",
    "lenticular": r": Lenticular",
    "irregular": r": Irregular",
    "dwarf": r"Galaxy : Size : Dwarf",
    "deep": r": Deep Field",
    "starburst": r": Starburst",
    "comet": r": Comet",
    "asteroid": r": Asteroid",
    "moon": r"Planet : (?:Satellite|Moon)",
    "dwarfplanet": r": Dwarf planet",
    "planet": r"Solar System : Planet",
    "exoplanet": r": Planetary System",
    "binary": r": Binary",
    "variable": r": (?:Variable|Pulsating)",
    "protostar": r": Protostar",
    "blackhole": r": Black Hole",
    "star": r": Star(?: :|$)",
    "nebula": r": Nebula",
    "galaxy": r": Galaxy",
    "cosmology": r": Cosmology",
}
CATEGORIES = {
    "Star Clusters": "starcluster",
    "Galaxies": "galaxy",
    "Nebulae": "nebula",
    "Solar System": "solar",
    "Exoplanets": "exoplanet",
    "Quasars and Black Holes": "active",
    "Stars": "star",
    "Cosmology": "cosmology",
}
TITLE_CLASSES = {
    "galcluster": r"galaxy cluster|cluster of galaxies",
    "globular": r"globular cluster",
    "spiral": r"spiral galax",
    "interacting": r"interacting galaxies",
    "planetary": r"planetary nebula",
    "dustdisk": r"protoplanetary (?:disk|disc)",
    "starform": r"star.forming region|stellar nursery",
    "comet": r"\bcomet\b",
    "deep": r"deep field",
    "moon": r"\b(?:ganymede|europa|enceladus|titan|io|triton)\b",
    "planet": r"\b(?:jupiter|saturn|mars|uranus|neptune)\b",
    "superrem": r"supernova remnant",
    "supernova": r"supernova",
    "starcluster": r"star cluster",
    "quasar": r"\bquasar\b",
    "nebula": r"\bnebula\b",
    "galaxy": r"\bgalax(?:y|ies)\b",
    "asteroid": r"asteroid",
    "star": r"\bstars?\b",
}
# Restrict acquisition claims to the official title or explicit statements about this work.
LAYOUTS = {
    "screenshot": r"screen\s?shot|still from",
    "spectrum": r"\b(?:spectrum|spectra)\b",
    "curve": r"light curve",
    "annotated": r"annotated|compass image|labelled|labeled",
    "comparison": r"side.by.side|comparison",
    "sequence": r"time.lapse|time sequence|evolution of|image sequence",
    "mosaic": r"\bmosaic\b|photomosaic",
    "crop": r"cropped|\bcrop\b|close.up|detail of",
}
EXPLICIT_MOSAIC = re.compile(
    r"(?:this (?:image|view|picture|panorama) is (?:a |an )?(?:large |colour |color |composite )?mosaic|mosaic (?:was |is )?(?:made|assembled|constructed)|(?:combined|stitched) (?:together )?(?:to (?:create|produce|make|form)|into) (?:this |a )?(?:single )?(?:image|mosaic))",
    re.I,
)


def matches(rules, text):
    return [key for key, expr in rules.items() if re.search(expr, text, re.I)]


def clean(node):
    return " ".join("".join(node.itertext()).split())


def fields(tree, label):
    cells = tree.xpath("//tr[normalize-space(th)=$label]/td", label=label)
    if not cells:
        return []
    return [" ".join(t.split()) for t in cells[-1].itertext() if t.strip()]


def reading(path, work, webb):
    page = html.fromstring(path.read_bytes().decode())
    if clean(page.xpath("//h1")[0]) != work["title"] and fields(page, "Id:") != [
        work["id"]
    ]:
        raise ValueError(f"Wrong cached page for {work['id']}")
    content = page.xpath('//*[contains(@class,"left-column")]')
    if webb:
        paragraphs = page.xpath('//*[contains(@class,"left-column")]/p')
    else:
        paragraphs = content[0].xpath('.//div[contains(@style,"margin-top: 10px")][1]')
    caption = " ".join(clean(p) for p in paragraphs)
    visual = re.search(r"\[image description\s*[:\-]\s*(.*?)(?:\]|$)", caption, re.I)
    title = work["title"]
    # Technical and scientific background can mention targets and structures in other frames.
    # Prefer the accessible description of this picture and its opening caption.
    intro = re.split(
        r"\[image description|\bNotes\b|\bLinks\b", caption, 1, flags=re.I
    )[0][:800]
    intro = " ".join(
        s
        for s in re.split(r"(?<=[.!?])\s+", intro)
        if not re.search(
            r"\b(?:unlike|invisible|unseen|absence of|lacks?|lack of|without|no sign of|not seen|not visible|other images?|previous images?)\b",
            s,
            re.I,
        )
    )
    primary = re.split(r"(?<=\.)\s+", caption, 3)[:3]
    primary = " ".join(primary)
    cues = list(
        dict.fromkeys(
            matches(CUES, title)
            + matches(CUES, visual[1] if visual else "")
            + matches(CUES, intro)
        )
    )[:2]
    paths = fields(page, "Type:")
    kind = next(
        (k for k, pat in TYPES.items() if any(re.search(pat, p, re.I) for p in paths)),
        None,
    )
    if re.search(r"\bdeep field\b", title, re.I):
        kind = "deep"
    if not kind or kind in {"galaxy", "star", "nebula"}:
        primary_types = [
            (
                "galcluster",
                r"cluster of galaxies (?:called|named)|galaxy cluster (?:known as |named |called )?(?:MACS|Abell|WHL|SPT)",
            ),
            (
                "starcluster",
                r"(?:globular |young |open )?star cluster (?:called |named |known as )?(?:NGC|IC|Westerlund|Messier|R136|Arches|Quintuplet)",
            ),
            (
                "starform",
                r"(?:this|it) is (?:a |an )?(?:nearby |young |massive )?star.forming region",
            ),
        ]
        kind = next(
            (k for k, expr in primary_types if re.search(expr, primary, re.I)), kind
        )
    kind = kind or next(iter(matches(TITLE_CLASSES, title)), None)
    kind = kind or next(
        (CATEGORIES[v] for v in fields(page, "Category:") if v in CATEGORIES), None
    )
    kind = kind or next(iter(matches(TITLE_CLASSES, intro[:350])), None)
    if re.search(
        r"\b(?:supernova remnant|remnants? of (?:a |the )?supernova)",
        title + " " + primary,
        re.I,
    ):
        if kind in {"supernova", "nebula"}:
            kind = "superrem"
        cues = [c for c in cues if c != "supernova"]
    clean_title = re.sub(
        r"\b(?:non[- ]?annotated|unannotated|unlabelled|unlabeled|without (?:annotations|labels))\b",
        "",
        title,
        flags=re.I,
    )
    layout = next(iter(matches(LAYOUTS, clean_title)), None)
    if layout is None and EXPLICIT_MOSAIC.search(intro):
        layout = "mosaic"
    row = {"kind": kind or "field"}
    if cues:
        row["cues"] = cues
    if layout:
        row["layout"] = layout
    if not work["aliases"]:
        # Recognise formal identifiers only. Retain the original spelling and punctuation.
        marker = re.search(
            r"\b(?:NGC\s*\d+[A-Z]?|IC\s*\d+|Messier\s*\d+|Abell\s*\d+|Westerlund\s+\d+|HH\s*\d+|Arp\s*\d+|UGC\s*\d+)\b",
            title,
            re.I,
        )
        if marker:
            row["name"] = marker[0]
        else:
            # Restrict caption-derived names to explicit identifications; a nearby
            # catalogue number alone might instead denote a background object.
            named = re.search(
                r"(?:named|called|known as|(?:features|shows|depicts) (?:the )?(?:(?:barred |spiral |dwarf |elliptical )?galaxy |(?:young )?star cluster |the nebula )?|pictured here is (?:the )?(?:galaxy cluster |star.cluster |galaxy )?)(?:\s+)?((?:LHA\s+\d+-N\s*\d+|(?:NGC|IC|Arp|UGC|Messier|Abell)\s*\d+[A-Z]?|ESO\s*\d+-\d+|MACS\s*J[0-9.+-]+))\b",
                primary,
                re.I,
            )
            if named:
                row["name"] = named[1]
    if re.search(
        r"\b(?:debris|planetary dust) (?:disc|disk)\b", title + " " + primary, re.I
    ):
        row["kind"] = "debris"
    if webb:
        reviewed = {
            "weic2425a": "starcluster",
            "L1527-1": "protostar",
            "weic2409a": "field",
            "weic2619g": "lensing",
            "weic2619f": "starform",
            "potm2601a": "galcluster",
            "potm2610a": "starform",
        }
        if work["id"] in reviewed:
            row["kind"] = reviewed[work["id"]]
        if work["id"] == "weic2409a":
            row["cues"] = []
            row["name"] = ""
            row["layout"] = "parallel"
        if work["id"] == "weic2619g":
            row["cues"] = ["arcs", "lens"]
    if not webb and work["id"] == "ann1311a":
        row["layout"] = "screenshot"
    if webb:
        # Some comparison and context images in the Webb gallery come from other facilities.
        # Use the actual filter-table instruments, not the gallery's telescope name.
        instruments = []
        for cell in page.xpath('//tr[td[1]/span[starts-with(@class,"band_")]]/td[3]'):
            pieces = [s.strip() for s in cell.itertext() if s.strip()]
            if len(pieces) > 1 and pieces[-1] not in instruments:
                instruments.append(pieces[-1])
        if instruments:
            row["inst"] = instruments
    if row["kind"] == "field" and not row.get("cues") and not row.get("layout"):
        size = re.search(r"(\d+)\s*[x×]\s*(\d+)", " ".join(fields(page, "Size:")))
        if size:
            row["size"] = [int(size[1]), int(size[2])]
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hubble-cache", required=True, type=Path)
    parser.add_argument("--webb-cache", required=True, type=Path)
    args = parser.parse_args()
    notes = {"hubble": {}, "recent": {}}
    for prefix in ("hubble", "webb"):
        for work in json.loads(
            (ROOT / "src" / f"{prefix}-gallery-data.json").read_text()
        ):
            ident = work["id"]
            if prefix == "webb":
                path = (
                    args.webb_cache
                    / hashlib.sha256(
                        f"Falsehttps://esawebb.org/images/{ident}/".encode()
                    ).hexdigest()
                )
            else:
                path = args.hubble_cache / "details" / ident
            records = notes["recent" if prefix == "webb" else "hubble"]
            if ident in records:
                raise ValueError(f"Duplicate official ID {ident}")
            records[ident] = reading(path, work, prefix == "webb")
    output = ROOT / "src/sky-artwork-facts.json"
    output.write_text(
        json.dumps(notes, ensure_ascii=False, separators=(",", ":")).replace(
            '},"', '},\n"'
        )
        + "\n"
    )
    rows = [v for group in notes.values() for v in group.values()]
    print(
        f'{len(rows)} works; {sum(bool(v.get("cues")) for v in rows)} with caption cues; {sum("layout" in v for v in rows)} with layout'
    )


if __name__ == "__main__":
    main()
