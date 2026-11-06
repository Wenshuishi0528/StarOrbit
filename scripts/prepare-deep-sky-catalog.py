#!/usr/bin/env python3
"""Make compact catalogue facts; no images, runtime downloads or Python packages.

Pass a directory containing the pinned OpenNGC NGC.csv and addendum.csv files.
The upstream CSVs remain build inputs, not duplicate application resources.
"""
import argparse
import csv
import hashlib
from pathlib import Path


COMMIT = "be3cd6c5498806a2fbb2f7e0452ef802dbb02be0"
HASHES = {
    "NGC.csv": "54abea0b57b0a103831bfc7a8e3a99a23acfbf4bb581fcf3d8af539cbb826c84",
    "addendum.csv": "c93f983dda6780b76b7b2e9271a856a892627710148a982ee98101a54c642fdd",
}
TYPES = {"G", "GPair", "GTrpl", "GGroup", "OCl", "GCl", "Cl+N", "*Ass", "PN", "HII", "Neb", "EmN", "RfN", "SNR", "DrkN"}


def angle(value, hours=False):
    parts = [float(x) for x in value.lstrip("+-").split(":")]
    degrees = parts[0] + parts[1] / 60 + parts[2] / 3600
    return f"{degrees * (15 if hours else -1 if value.startswith('-') else 1):.6f}".rstrip("0").rstrip(".")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "src/deep-sky-openngc-data.js")
    args = parser.parse_args()
    records = []
    for name, expected in HASHES.items():
        raw = (args.source / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError(f"{name} differs from pinned OpenNGC {COMMIT}; verify its revision before regeneration")
        for row in csv.DictReader(raw.decode("utf-8-sig").splitlines(), delimiter=";"):
            if row["Type"] not in TYPES or not row["RA"] or not row["Dec"]:
                continue
            fields = [row["Name"], row["Type"], angle(row["RA"], True), angle(row["Dec"])]
            fields += [row[k] for k in ["MajAx", "MinAx", "PosAng", "V-Mag", "NGC", "IC", "Common names"]]
            if any("\t" in field or "\n" in field for field in fields):
                raise ValueError("Unexpected field delimiter")
            records.append("\t".join(fields))
    payload = "\n".join(records).replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    header = f"""// Generated compact facts from OpenNGC {COMMIT}.
// Mattia Verga and contributors; adapted under CC BY-SA 4.0.
// https://creativecommons.org/licenses/by-sa/4.0/ — docs/deep-sky-catalog.md
// Reproduce: python3 scripts/prepare-deep-sky-catalog.py /path/to/pinned/csvs
// {len(records)} real deep-sky rows; duplicate/nonexistent/stellar/unknown types excluded.
// Columns: id,type,RAdeg,Decdeg,major/minor arcmin,PA north-east deg,V,NGC,IC,names.
// Empty values stay unknown. Data is compact TSV, not thousands of JS objects.
export const OPENNGC_ROWS = `"""
    result = header + payload + "`;\n"
    if len(result.encode()) > 700000:
        raise ValueError("Compact catalogue exceeds the 700 KB budget")
    args.output.write_text(result)
    print(f"{len(records)} records, {len(result.encode())} bytes: {args.output}")


if __name__ == "__main__":
    main()
