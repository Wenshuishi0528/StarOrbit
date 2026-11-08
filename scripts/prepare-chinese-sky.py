#!/usr/bin/env python3
"""Build the Chinese sky culture from pinned, locally inspectable source files.

Normal runs are offline and deterministic. --refresh-source refreshes only the
explicit sources; it never guesses star membership or culture-region boundaries.
"""
import argparse
import collections
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/chinese-sky"
SOURCE = OUT / "source"
COMMIT = "3c4a720f313ada6124b86fef24131fa65900133f"
BASE = f"https://raw.githubusercontent.com/Stellarium/stellarium/{COMMIT}/skycultures/chinese/"
LANGUAGES = ("zh", "en", "ru", "fr")
GROUP_IDS = ["ziwei", "taiwei", "tianshi", "jiao", "kang", "di", "fang", "xin", "wei", "ji", "dou", "niu", "nv", "xu", "wei-roof", "shi", "bi-wall", "kui", "lou", "wei-stomach", "mao", "bi-net", "zi", "shen", "jing", "gui", "liu", "xing", "zhang", "yi", "zhen", "southern"]
ENCLOSURES = {
    "紫微垣": ("Пурпурный запретный дворец", "Enceinte pourpre interdite"),
    "太微垣": ("Верховный дворец", "Enceinte du Palais suprême"),
    "天市垣": ("Небесный рынок", "Enceinte du Marché céleste"),
    "近南极星区": ("Южная полярная область", "Région polaire australe"),
}
NUMBER_SUFFIX = re.compile(r"^(?:增)?[一二三四五六七八九十百廿卅卌零〇壹贰叁肆伍陆柒捌玖拾0123456789]+$")


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_urls():
    gaia_ids = [key.split()[-1] for key in json.loads((SOURCE / "index.json").read_text())["common_names"] if key.startswith("Gaia DR3 ")]
    selection = " WHERE source_id IN (" + ",".join(gaia_ids) + ")"
    query = "SELECT source_id,ra,dec,pmra,pmdec,phot_g_mean_mag,bp_rp FROM gaiadr3.gaia_source" + selection
    tap = lambda host, adql, fmt: host + "?" + urllib.parse.urlencode({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": fmt, "QUERY": adql})
    hip_query = lambda catalog: "https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?" + urllib.parse.urlencode({"-source": catalog, "HIP": "4714,40205,44637,115481", "-out": "*", "-out.max": "10"})
    return {"index.json": BASE + "index.json", "description.md": BASE + "description.md", "CC-BY-SA-4.0.txt": "https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt", "I-239-hip_main.tsv": hip_query("I/239/hip_main"), "I-311-hip2.tsv": hip_query("I/311/hip2"), "Gaia-DR3.csv": tap("https://gaia.ari.uni-heidelberg.de/tap/sync", query, "csv"), "Gaia-DR3-AIP.xml": tap("https://gaia.aip.de/tap/sync", query, "votable"), "Gaia-HIP-crossmatch.csv": tap("https://gaia.ari.uni-heidelberg.de/tap/sync", "SELECT * FROM gaiadr3.hipparcos2_best_neighbour" + selection, "csv")}


def clean(text):
    return re.sub(r"<[^>]*>", "", text).strip().replace("（", "(").replace("）", ")").replace("[", "(").replace("]", ")")


def names(zh, en, ru=None, fr=None):
    # Missing translations deliberately use the documented English source name.
    return dict(zip(LANGUAGES, (zh, en, ru or en, fr or en)))


def localized(item, translations):
    return {**item, "names": translations, **translations}


def normalized_ra(ra):
    return round((float(ra) + 180) % 360 - 180, 8)


def vector(ra, dec):
    ra, dec = math.radians(ra), math.radians(dec)
    return (math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec))


def angular_distance(a, b):
    return math.degrees(math.acos(max(-1, min(1, sum(x * y for x, y in zip(a, b))))))


def extent(rows):
    points = [vector(row[1], row[2]) for row in rows]
    mean = [sum(p[i] for p in points) for i in range(3)]
    length = math.sqrt(sum(x * x for x in mean))
    center = [x / length for x in mean] if length > 1e-10 else list(points[0])
    ra = normalized_ra(math.degrees(math.atan2(center[1], center[0])))
    dec = round(math.degrees(math.asin(max(-1, min(1, center[2])))), 8)
    radius = round(max(angular_distance(center, p) for p in points), 8)
    return ra, dec, max(radius, 0.08)


def source_tables(description):
    body = description.split("### The list of Xingguans", 1)[1].split("### Deep Space Objects", 1)[0]
    groups, rows, group = [], [], None
    for line in body.splitlines():
        if not line.startswith("|"):
            continue
        cells = [clean(cell) for cell in line.strip("|").split("|")]
        if len(cells) != 5 or cells[0] == "Chinese Name" or cells[0].startswith("-"):
            continue
        if not cells[3] and not cells[4]:
            group = cells[0]
            groups.append({"zh": group, "pinyin": cells[1], "en": cells[2]})
        else:
            rows.append({"group": group, "zh": cells[0], "pinyin": cells[1], "en": cells[2], "primaryCount": int(cells[3]) if cells[3].isdigit() else None, "addedCount": int(cells[4]) if cells[4].isdigit() else None})
    if len(groups) != 32 or len(rows) != 318:
        raise ValueError("Pinned source table structure changed: explicit review required")
    return groups, rows


def match_group(native, rows):
    exact = [row for row in rows if row["zh"] == native]
    if len(exact) == 1:
        return exact[0]
    base = native.split("(")[0]
    candidates = [row for row in rows if row["zh"] == base]
    qualifier = re.search(r"\(([^)]+)\)", native)
    if qualifier:
        candidates = [row for row in candidates if row["group"] == qualifier.group(1)]
    if len(candidates) != 1:
        raise ValueError(f"Unresolved source-table membership: {native}: {candidates}")
    return candidates[0]


def read_tsv(path):
    lines = [line for line in path.read_text().splitlines() if line and not line.startswith("#")]
    header = lines[0].split("\t")
    return [dict(zip(header, (value.strip() for value in line.split("\t")))) for line in lines[3:] if line.split("\t")[0].strip().isdigit()]


def supplemental_stars(needed, existing):
    rows = read_tsv(SOURCE / "I-239-hip_main.tsv")
    result = {}
    for record in rows:
        hip = int(record["HIP"])
        if hip in needed and hip not in existing:
            # CDS explicitly identifies these columns as ICRS at epoch J2000,
            # with proper motion applied, unlike RAICRS/DEICRS at J1991.25.
            result[hip] = [hip, normalized_ra(record["_RA.icrs"]), float(record["_DE.icrs"]), float(record["Vmag"]), record["B-V"]]
    missing = needed - existing.keys() - result.keys()
    if missing:
        raise ValueError(f"Missing astrometry; never synthesize coordinates: {sorted(missing)}")
    return result


def non_hip_positions():
    """Resolve actual Gaia/NGC source objects without inventing HIP numbers."""
    positions, metadata = {}, {}
    gaia = SOURCE / "Gaia-DR3.csv"
    for record in csv.DictReader(gaia.read_text().splitlines()):
        source_id = record["source_id"]
        ra, dec = float(record["ra"]), float(record["dec"])
        epoch = 2016
        if record.get("pmra") and record.get("pmdec"):
            # Gaia pmra is mu_alpha*cos(dec), in mas/year. Linear propagation
            # over 16 yr suffices for these tiny visual-star displacements.
            ra -= float(record["pmra"]) * 16 / (3600000 * math.cos(math.radians(dec)))
            dec -= float(record["pmdec"]) * 16 / 3600000
            epoch = 2000
        positions[source_id] = ["gaia:" + source_id, normalized_ra(ra), round(dec, 8), float(record["phot_g_mean_mag"]), "0.6"]
        metadata[source_id] = {"physicalId": "gaia:" + source_id, "catalogId": "Gaia DR3 " + source_id, "kind": "star", "epoch": epoch, "magnitudeBand": "Gaia G", "colorUnavailable": True, "astrometrySource": "ESA Gaia DR3 gaiadr3.gaia_source; ICRS J2016.0; proper motion propagated to J2000 where supplied"}
    text = (ROOT / "src/deep-sky-openngc-data.js").read_text()
    raw = text.split("`", 1)[1].rsplit("`", 1)[0]
    wanted = {"NGC0224", "NGC2632", "NGC5139", "NGC6231", "NGC6475"}
    for line in raw.splitlines():
        cells = line.split("\t")
        if cells[0] not in wanted:
            continue
        canonical = "NGC" + str(int(cells[0][3:]))
        key = "DSO:" + canonical
        mag = float(cells[7]) if cells[7] else None
        positions[key] = ["deep:" + canonical, normalized_ra(cells[2]), float(cells[3]), mag, None]
        metadata[key] = {"physicalId": "deep:" + canonical, "catalogId": canonical, "kind": "deep", "epoch": 2000, "magnitudeBand": "V" if mag is not None else None, "astrometrySource": "OpenNGC be3cd6c5498806a2fbb2f7e0452ef802dbb02be0; same pinned facts as application deep-sky catalogue"}
    return positions, metadata


def star_names(raw, fallback=None):
    english = raw.get("english") or raw.get("native") or fallback or ""
    return names(raw.get("native") or english, english)


def native_parts(value):
    value = clean(value).rstrip("*?")
    match = re.match(r"^(.*?)(?:\(([^)]*)\))?$", value)
    return match.group(1), match.group(2)


def name_memberships(native, asterisms, component_owners=None):
    # Membership follows an explicit culture name, never angular proximity.
    base, qualifier = native_parts(native)
    matches = []
    for item in asterisms:
        stem, item_qualifier = native_parts(item["zh"])
        if not base.startswith(stem):
            continue
        suffix = base[len(stem):]
        if suffix and not NUMBER_SUFFIX.fullmatch(suffix):
            continue
        if qualifier and item_qualifier and qualifier != item_qualifier:
            continue
        if qualifier and not item_qualifier and qualifier != item["regionName"]:
            continue
        matches.append(item)
    # An unqualified repeated name cannot be assigned by inference.
    if len(matches) == 1:
        return matches
    # Some additions are named for an individual official (e.g. 天枢),
    # not for its containing asterism (北斗). Only inherit a membership
    # independently established by that named star's primary membership.
    if "增" in base and component_owners:
        owner_ids = component_owners.get(base.split("增", 1)[0], set())
        inherited = [item for item in asterisms if item["id"] in owner_ids and (not qualifier or qualifier in (item["regionName"], native_parts(item["zh"])[1]))]
        if len(inherited) == 1:
            return inherited
    return []


def source_reference(key):
    if re.fullmatch(r"HIP \d+", key):
        return int(key.split()[1])
    if key.startswith("Gaia DR3 "):
        return key.removeprefix("Gaia DR3 ")
    if key.startswith("NGC "):
        return "DSO:" + key.replace(" ", "")
    return None


def canonical_memberships(raw_name, asterisms):
    """Use the source's first name, not an unrelated alternative proper name.

    Twelve States' unconnected single stars are explicitly identified by the
    English '(In Twelve States)' qualifier in common_names. This is source
    evidence of membership; neither position nor an expected count is used.
    """
    if "增" in raw_name.get("native", ""):
        return []
    matches = name_memberships(raw_name.get("native", ""), asterisms)
    qualifier = re.search(r"\(In ([^)]+)\)", raw_name.get("english", ""))
    if qualifier:
        explicit = [item for item in asterisms if item["en"] == qualifier.group(1)]
        # Other '(In ...)' qualifiers name a sky region (e.g. Net Mansion),
        # not an asterism. Native region qualifiers already disambiguate those.
        if len(explicit) == 1 and matches and matches != explicit:
            raise ValueError(f"Conflicting explicit source-name memberships: {raw_name}")
        if len(explicit) == 1:
            return explicit
    return matches


def split_member_paths(paths, excluded):
    """Remove documented foreign anchors without bridging the resulting gap."""
    result = []
    for path in paths:
        current = []
        for reference in path:
            if reference in excluded:
                if len(current) > 1:
                    result.append(current)
                current = []
            else:
                current.append(reference)
        if len(current) > 1:
            result.append(current)
    return result


def resolve_primary_members(asterisms, common_names, physical):
    """Separate actual asterism members from source drawing connection anchors.

    The only removed anchors have a canonical name of a different record AND
    that record is an explicitly documented parent/subsidiary. The untouched
    source paths remain available for audit. Unknown counts never create stars.
    """
    canonical = {}
    named_memberships = collections.defaultdict(list)
    for key, raw_names in common_names.items():
        reference = source_reference(key)
        if reference is None or not raw_names:
            continue
        raw_name = raw_names[0]
        canonical[reference] = (key, raw_name)
        for item in canonical_memberships(raw_name, asterisms):
            named_memberships[reference].append(item)
    primary_memberships = collections.defaultdict(list)
    for item in asterisms:
        raw_references = list(dict.fromkeys(reference for path in item["sourceMemberPaths"] for reference in path))
        excluded, corrections = set(), []
        for reference in raw_references:
            owners = named_memberships.get(reference, [])
            if len(owners) != 1 or owners[0]["id"] == item["id"]:
                continue
            owner = owners[0]
            if item["parentId"] != owner["id"] and owner["parentId"] != item["id"]:
                continue
            excluded.add(reference)
            key, raw_name = canonical[reference]
            corrections.append({"reference": reference, "physicalId": f"hip:{reference}" if isinstance(reference, int) else physical[reference][0], "sourceNameKey": key, "sourceName": raw_name["native"], "primaryAsterismId": owner["id"], "reason": "Canonical source name belongs to an explicitly documented parent/subsidiary; source drawing uses it as a connecting anchor."})
        primary = [reference for reference in raw_references if reference not in excluded]
        # Include expressly named members even when the source draws no edge
        # to them. In this pinned edition these are eight Twelve States stars.
        for reference, owners in named_memberships.items():
            if item in owners and reference not in primary:
                primary.append(reference)
        if not primary:
            raise ValueError(f"Asterism has no resolved primary members: {item['zh']}")
        display_paths = split_member_paths(item["sourceMemberPaths"], excluded)
        line_references = list(dict.fromkeys(reference for path in display_paths for reference in path))
        item["sourceLineMemberHips"] = sorted(reference for reference in raw_references if isinstance(reference, int))
        item["sourceLineMemberObjectIds"] = [physical[reference][0] for reference in raw_references if not isinstance(reference, int)]
        item["primaryMemberHips"] = sorted(reference for reference in primary if isinstance(reference, int))
        item["primaryMemberObjectIds"] = [physical[reference][0] for reference in primary if not isinstance(reference, int)]
        item["primaryUnlinkedMemberHips"] = sorted(reference for reference in primary if isinstance(reference, int) and reference not in line_references)
        item["primaryUnlinkedMemberObjectIds"] = [physical[reference][0] for reference in primary if not isinstance(reference, int) and reference not in line_references]
        item["lineMemberHips"] = sorted(reference for reference in line_references if isinstance(reference, int))
        item["lineMemberObjectIds"] = [physical[reference][0] for reference in line_references if not isinstance(reference, int)]
        item["memberHips"] = item["primaryMemberHips"].copy()
        item["memberObjectIds"] = item["primaryMemberObjectIds"].copy()
        item["addedMemberObjectIds"] = []
        item["objectReferences"] = [reference for reference in primary if not isinstance(reference, int)]
        item["displayMemberPaths"] = display_paths
        item["sourceConnectionCorrections"] = corrections
        item["lines"] = [[[physical[reference][1], physical[reference][2]] for reference in path] for path in display_paths]
        item["ra"], item["dec"], item["radius"] = extent([physical[reference] for reference in primary])
        item["labelPositions"] = [[item["ra"], item["dec"]]]
        item["lineRadius"] = extent([physical[reference] for reference in line_references])[2] if line_references else 0.08
        expected, resolved = item["declaredPrimaryCount"], len(primary)
        uncertain = [reference for reference in primary if any("?" in name.get("native", "") for name in common_names.get(canonical.get(reference, (None,))[0], []))]
        state = "source-count-unspecified" if expected is None else "source-incomplete" if resolved < expected else "source-count-inconsistent" if resolved > expected else "complete"
        item["primaryMemberStatus"] = {"state": state, "expected": expected, "resolved": resolved, "unlinked": len(primary) - len(set(primary) & set(line_references)), "uncertainPhysicalIds": [f"hip:{reference}" if isinstance(reference, int) else physical[reference][0] for reference in uncertain], "evidence": {"expected": "Pinned description.md, The list of Xingguans, Number of stars; a source assertion, not a completeness guarantee.", "resolved": "Pinned index.json canonical common_names and constellation paths; explicit (In ...) source-name qualifiers include unconnected members; documented foreign parent/subsidiary anchors excluded."}}
        for reference in primary:
            primary_memberships[reference].append(item)
    return primary_memberships


def build():
    if sha(SOURCE / "index.json") != "426118e6238ae69edb319c91d1a74b705eaa758222e962206e58c49b9dac9d8a" or sha(SOURCE / "description.md") != "f0dec3d4fb115bb8d5667e96fb9af0450f33489ec02747c8229903c15b3a2cac":
        raise ValueError("Pinned cultural source bytes changed; review before importing")
    original = json.loads((SOURCE / "index.json").read_text())
    description = (SOURCE / "description.md").read_text()
    sky = json.loads((ROOT / "assets/stars.json").read_text())
    western = json.loads((ROOT / "assets/star-chart.json").read_text())
    rendered = {row[0]: row for row in sky}
    modern_names = {star["id"]: star for star in western["stars"]}
    raw_groups, table_rows = source_tables(description)
    needed = {hip for item in original["constellations"] for path in item["lines"] for hip in path if isinstance(hip, int)}
    needed.update(int(key.split()[1]) for key in original["common_names"] if re.fullmatch(r"HIP \d+", key))
    extra = supplemental_stars(needed, rendered)
    non_hip, object_metadata = non_hip_positions()
    physical = {**rendered, **extra, **non_hip}
    groups = []
    for order, raw in enumerate(raw_groups):
        group_id = GROUP_IDS[order]
        theme = group_id if order < 3 or order == 31 else ("azuredragon", "blacktortoise", "whitetiger", "vermilionbird")[(order - 3) // 7]
        translated = ENCLOSURES.get(raw["zh"], (None, None))
        groups.append(localized({"id": group_id, "order": order, "type": "enclosure" if order < 3 else "southern" if order == 31 else "mansion", "theme": theme, "pinyin": raw["pinyin"], "asterismIds": [], "memberHips": []}, names(raw["zh"], raw["en"], *translated)))
    group_by_zh = {group["zh"]: group for group in groups}
    asterisms = []
    geometric_memberships = collections.defaultdict(list)
    for original_item in original["constellations"]:
        raw_name = original_item["common_name"]
        table = match_group(raw_name["native"], table_rows)
        group = group_by_zh[table["group"]]
        identifier = original_item["id"].split()[-1]
        references = list(dict.fromkeys(hip for path in original_item["lines"] for hip in path))
        unresolved = [key for key in references if key not in physical]
        if unresolved:
            raise ValueError(f"Unresolved culture object astrometry: {unresolved}")
        member_hips = sorted(hip for hip in references if isinstance(hip, int))
        member_objects = [key for key in references if not isinstance(key, int)]
        ra, dec, radius = extent([physical[key] for key in references])
        subsidiary = "(附" in raw_name["native"]
        aliases = list(dict.fromkeys([raw_name["native"], raw_name["english"], raw_name.get("pronounce", ""), table["pinyin"]]))
        if raw_name["native"] in [g["zh"] for g in groups if g["type"] == "mansion"]:
            aliases.append(raw_name["native"].removesuffix("宿"))
        item = localized({"id": identifier, "sourceId": original_item["id"], "targetId": "asterism:chinese:" + identifier, "culture": "chinese", "pinyin": raw_name.get("pronounce", table["pinyin"]), "aliases": [a for a in aliases if a], "ra": ra, "dec": dec, "radius": radius, "lineRadius": radius, "labelPositions": [[ra, dec]], "lineMemberHips": member_hips, "memberHips": member_hips.copy(), "lineMemberObjectIds": [physical[key][0] for key in member_objects], "memberObjectIds": [physical[key][0] for key in member_objects], "objectReferences": member_objects.copy(), "addedMemberHips": [], "sourceMemberPaths": original_item["lines"], "lines": [[[physical[hip][1], physical[hip][2]] for hip in path] for path in original_item["lines"]], "groupId": group["id"], "region": group["id"], "regionName": group["zh"], "theme": group["theme"], "isSubsidiary": subsidiary, "parentId": None, "declaredPrimaryCount": table["primaryCount"], "declaredAddedCount": table["addedCount"], "membershipSource": "pinned description.md: The list of Xingguans; exact name and explicit region qualifier", "namesSource": "pinned index.json: common_name"}, star_names(raw_name))
        for reference in references:
            geometric_memberships[reference].append(item)
        asterisms.append(item)
        group["asterismIds"].append(identifier)
    by_id = {item["id"]: item for item in asterisms}
    for item in asterisms:
        if item["isSubsidiary"]:
            parent_name = re.search(r"\(附([^)]*)\)", item["zh"]).group(1)
            matches = [parent for parent in asterisms if parent["zh"] == parent_name and parent["groupId"] == item["groupId"]]
            if len(matches) != 1:
                raise ValueError(f"Unresolved subsidiary parent: {item['zh']}")
            item["parentId"] = matches[0]["id"]
    geometric_memberships = resolve_primary_members(asterisms, original["common_names"], physical)
    component_owners = collections.defaultdict(set)
    for key, raw_names in original["common_names"].items():
        if not re.fullmatch(r"HIP \d+", key):
            continue
        owners = geometric_memberships.get(int(key.split()[1]), [])
        for raw_name in raw_names:
            base, _ = native_parts(raw_name.get("native", ""))
            if not base or "增" in base:
                continue
            stems = {base}
            if re.search(r"\b[IVXLCDM]+(?:\s*\([^)]*\))?$", raw_name.get("english", "")):
                stems.add(re.sub(r"[一二三四五六七八九十百廿卅卌]+$", "", base))
            for stem in stems:
                component_owners[stem].update(item["id"] for item in owners)
    stars, named_objects, other_stars, unassigned = [], [], [], []
    for key, original_names in original["common_names"].items():
        if not re.fullmatch(r"HIP \d+", key):
            reference = source_reference(key)
            assigned = {item["id"]: item for item in geometric_memberships.get(reference, [])}
            for raw_name in original_names:
                for item in name_memberships(raw_name.get("native", ""), asterisms, component_owners):
                    assigned[item["id"]] = item
                    if reference and reference not in item["objectReferences"]:
                        item["objectReferences"].append(reference)
                        item["memberObjectIds"].append(physical[reference][0])
                    if reference and "增" in raw_name.get("native", "") and physical[reference][0] not in item["addedMemberObjectIds"]:
                        item["addedMemberObjectIds"].append(physical[reference][0])
            entry = localized({"sourceId": key, "aliases": sorted({str(n[field]) for n in original_names for field in ("native", "english", "pronounce") if n.get(field)}), "sourceNames": original_names, "asterismIds": sorted(assigned)}, star_names(original_names[0]))
            if reference:
                row = physical[reference]
                entry.update({"id": row[0], "ra": row[1], "dec": row[2], "mag": row[3], "bv": row[4], "major": row[3] is not None and row[3] <= 3, "hasProperName": True, "nameType": "proper", "cultureNamed": True, **object_metadata[reference]})
                if entry["kind"] == "star":
                    other_stars.append(entry.copy())
            else:
                entry.update({"id": "solar:" + key.removeprefix("NAME ").lower(), "physicalId": "solar:" + key.removeprefix("NAME ").lower(), "kind": "solar", "catalogId": key.removeprefix("NAME ")})
            named_objects.append(entry)
    names_by_hip = {int(key.split()[1]): value for key, value in original["common_names"].items() if re.fullmatch(r"HIP \d+", key)}
    for hip in sorted(needed):
        row = physical[hip]
        raw_names = names_by_hip.get(hip, [])
        modern = modern_names.get(hip, {})
        translated = star_names(raw_names[0]) if raw_names else names(modern.get("zh", f"HIP {hip}"), modern.get("en", f"HIP {hip}"), modern.get("ru"), modern.get("fr"))
        assigned = {item["id"]: item for item in geometric_memberships[hip]}
        for raw_name in raw_names:
            # A primary star's alternative name may equal an unrelated
            # asterism (e.g. 北极一 alias 太子; 轩辕十七 alias 御女).
            # Verified primary membership takes precedence over bare-name
            # equality; drawing anchors cannot confer a second membership.
            if geometric_memberships[hip] and "增" not in raw_name.get("native", ""):
                continue
            for item in name_memberships(raw_name.get("native", ""), asterisms, component_owners):
                assigned[item["id"]] = item
                if hip not in item["memberHips"]:
                    item["memberHips"].append(hip)
                if "增" in raw_name.get("native", "") and hip not in item["addedMemberHips"]:
                    item["addedMemberHips"].append(hip)
        if raw_names and not assigned:
            unassigned.append({"hip": hip, "names": [name.get("native") for name in raw_names]})
        aliases = {str(name[field]) for name in raw_names for field in ("native", "english", "pronounce") if name.get(field)}
        aliases.update(str(modern[language]) for language in LANGUAGES if modern.get(language))
        stars.append(localized({"id": hip, "physicalId": f"hip:{hip}", "ra": row[1], "dec": row[2], "mag": row[3], "bv": row[4] if len(row) > 4 else "0.6", "major": row[3] <= 3 or bool(modern.get("major")), "hasProperName": bool(raw_names), "nameType": "proper" if raw_names else "designation", "cultureNamed": bool(raw_names), "identificationUncertain": any("?" in name.get("native", "") for name in raw_names), "aliases": sorted(aliases), "asterismIds": sorted(assigned), "sourceNames": raw_names}, translated))
    for item in asterisms:
        item["memberHips"].sort()
        # Some physical stars have BOTH a primary name and an added-star alias
        # in the source. Keep both source names; count the physical point once,
        # with primary membership taking precedence in the displayed sets.
        item["sourceAddedMemberHips"] = sorted(item["addedMemberHips"])
        item["addedMemberHips"] = [hip for hip in item["sourceAddedMemberHips"] if hip not in item["primaryMemberHips"]]
        item["sourceAddedMemberObjectIds"] = item["addedMemberObjectIds"].copy()
        item["addedMemberObjectIds"] = [key for key in item["sourceAddedMemberObjectIds"] if key not in item["primaryMemberObjectIds"]]
        references = [*item["memberHips"], *item["objectReferences"]]
        item["members"] = [{"id": physical[key][0], "physicalId": f"hip:{key}" if isinstance(key, int) else object_metadata[key]["physicalId"], "kind": "star" if isinstance(key, int) else object_metadata[key]["kind"], "ra": physical[key][1], "dec": physical[key][2], "mag": physical[key][3]} for key in references]
        center = vector(item["ra"], item["dec"])
        item["allMemberRadius"] = round(max(0.08, *(angular_distance(center, vector(physical[key][1], physical[key][2])) for key in references)), 8)
    for group in groups:
        group["memberHips"] = sorted({hip for identifier in group["asterismIds"] for hip in by_id[identifier]["primaryMemberHips"]})
        object_references = list(dict.fromkeys(reference for identifier in group["asterismIds"] for reference in by_id[identifier]["objectReferences"] if physical[reference][0] in by_id[identifier]["primaryMemberObjectIds"]))
        group["memberObjectIds"] = [physical[reference][0] for reference in object_references]
        group["ra"], group["dec"], group["radius"] = extent([physical[reference] for reference in [*group["memberHips"], *object_references]])
    sources = source_urls()
    return {"schema": 2, "id": "chinese", "names": names("中国传统星官", "Traditional Chinese sky", "Традиционное китайское небо", "Ciel chinois traditionnel"), "edition": names("清代通行整理", "Qing-era conventional compilation", "Традиционная система эпохи Цин", "Compilation traditionnelle de l’époque Qing"), "source": {"project": "Stellarium Chinese sky culture", "commit": COMMIT, "license": "CC BY-SA 4.0", "licenseFile": "source/CC-BY-SA-4.0.txt", "frame": "J2000 equatorial", "units": "degrees", "authors": ["Karrie Berglund / Digitalis Education Solutions, Inc.", "Sun Shuwei / 孙殳玮", "Stellarium contributors"], "references": ["Yi Shitong, Chinese and Western Contrast Star Chart and Catalogue 1950.0 (1981)", "Yixiang Kaocheng (1756) and continuation (1844)", "Pan Nai, The History of Stellar Observation in China (2009)", "ESA, The Hipparcos and Tycho Catalogues (1997), CDS I/239"], "urls": sources, "sha256": {name: sha(SOURCE / name) for name in sources}, "renderedStarCatalogSha256": sha(ROOT / "assets/stars.json"), "positionNote": "Existing application J2000 positions are preserved; four missing HIP stars use CDS I/239 J2000 proper-motion-propagated columns and Johnson V/B-V. Seven Gaia DR3 objects use Heidelberg TAP, independently checked against AIP; six are linearly propagated to J2000, while Eta Car lacks proper motion and retains ICRS J2016 with explicit epoch. Gaia G magnitudes and neutral unknown B-V display colors are identified separately. NGC positions use the existing pinned OpenNGC facts. This is not a reconstruction of Qing-era stellar positions.", "openNGCCommit": "be3cd6c5498806a2fbb2f7e0452ef802dbb02be0", "openNGCSourceSha256": sha(ROOT / "src/deep-sky-openngc-data.js"), "gaiaHipCrossmatch": "Official gaiadr3.hipparcos2_best_neighbour returns no records for these seven IDs; nearest existing HIP is at least 116 arcsec away. No positional merging was applied.", "translationFallback": "Native simplified Chinese and source English; missing Russian/French culture-object translations retain the source English rather than inventing a translation.", "membershipNote": "Source drawing paths are not a list of primary members: explicit parent/subsidiary connecting anchors are excluded from corrected display lines and primary membership, while source paths and their full member sets remain unchanged for audit. Canonically named unconnected primary members are retained without invented lines. Expected source-table counts, resolved membership and uncertain identifications are separate.", "boundaryNote": "No Chinese asterism polygons or exact lunar-mansion boundaries are supplied. Upstream lunar-system metadata is explicitly marked Needs confirmation and is not rendered as boundaries."}, "groups": groups, "asterisms": asterisms, "stars": stars, "namedObjects": named_objects, "otherStars": other_stars, "boundaries": [], "additionalStars": [extra[hip] for hip in sorted(extra)], "stats": {"asterismRecords": len(asterisms), "independentAsterisms": sum(not item["isSubsidiary"] for item in asterisms), "subsidiaryAsterisms": sum(item["isSubsidiary"] for item in asterisms), "groups": len(groups), "lineHips": len({hip for item in asterisms for hip in item["lineMemberHips"]}), "sourceLineHips": len({hip for item in asterisms for hip in item["sourceLineMemberHips"]}), "primaryHips": len({hip for item in asterisms for hip in item["primaryMemberHips"]}), "sourceConnectionCorrections": sum(len(item["sourceConnectionCorrections"]) for item in asterisms), "unlinkedPrimaryMemberships": sum(len(item["primaryUnlinkedMemberHips"]) + len(item["primaryUnlinkedMemberObjectIds"]) for item in asterisms), "primaryCountDiscrepancies": [{"id": item["id"], "zh": item["zh"], **item["primaryMemberStatus"]} for item in asterisms if item["primaryMemberStatus"]["state"] != "complete"], "resolvedHips": len(stars), "namedHips": len(names_by_hip), "nonHipNamedObjects": len(named_objects), "supplementalHips": sorted(extra), "singleObjectAsterisms": sum(len(item["primaryMemberHips"]) + len(item["primaryMemberObjectIds"]) == 1 for item in asterisms), "gaiaStars": len(other_stars), "unassignedNamedStars": unassigned}}


def refresh():
    SOURCE.mkdir(parents=True, exist_ok=True)
    urls = source_urls()
    for filename, url in urls.items():
        fetched = subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location", "--max-time", "45", url], check=True, capture_output=True)
        (SOURCE / filename).write_bytes(fetched.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh-source", action="store_true")
    parser.add_argument("--check", action="store_true", help="check deterministic output without writing")
    args = parser.parse_args()
    if args.refresh_source:
        refresh()
    product = build()
    target = OUT / "catalog.json"
    content = dump(product)
    if args.check:
        if target.read_text() != content:
            raise SystemExit("Chinese culture generated file differs: rerun the preparer")
    else:
        target.write_text(content)
    print(json.dumps({"bytes": len(content.encode()), **product["stats"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
