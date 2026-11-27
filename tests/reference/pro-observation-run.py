"""Generate the offline observation/execution reference using a fixed tick grid.

Run from any directory with Python 3. The reference enumerates candidate jobs
every quarter second and recomputes all buffer occupancy directly. All service
times, contacts, exposures and bytes per tick in these fixtures are commensurate
with the grid. The JS implementation uses a different, event-driven algorithm.
"""
import json
from pathlib import Path

DT = 0.25
END = 100
MASK = (1 << 32) - 1
S = dict(seed=44371, usefulFraction=0.58, usefulKeep=0.76, otherKeep=0.20,
         rawMB=4, storeMB=11, downlinkMbps=16, processingSec=1.5,
         outputFraction=0.5, cameraW=4, radioW=8, processorW=6)
OPS = [dict(id=n + 1, windowIndex=n // 7, startSec=3*n + 0.5, endSec=3*n + 1.5)
       for n in range(33)]
STATIONS = [[2.25, 4.75], [9, 12.25], [19.5, 22.5], [40, 46.5], [54, 57.25],
            [72.75, 74.25], [80.25, 86.5], [89.5, 93]]
OUTAGES = [[1, 2.5], [13, 16], [41.25, 43.75], [55, 56.5], [73, 75.5], [95, 97]]


def roll(identifier, salt):
    value = (S["seed"] ^ (identifier * 0x9e3779b1) ^ salt) & MASK
    value = ((value ^ (value >> 16)) * 0x85ebca6b) & MASK
    value = ((value ^ (value >> 13)) * 0xc2b2ae35) & MASK
    return (value ^ (value >> 16)) / (1 << 32)


def simulate(mode, delay):
    rows = []
    for op in OPS:
        useful = roll(op["id"], 0x243f6a88) < S["usefulFraction"]
        keep = roll(op["id"], 0xb7e15162) < (S["usefulKeep"] if useful else S["otherKeep"])
        rows.append(dict(status="notReached", useful=useful, filterKeep=keep,
                         captureEndSec=None, readySec=None, processEndSec=None, deliveredSec=None,
                         sentMB=0, remainingMB=0))
    work = [0.0 for _ in rows]
    energy_ws = [0.0, 0.0, 0.0]
    peak = 0
    for tick in range(int(END / DT) + 1):
        t = tick * DT
        e = t + DT
        for r in rows:
            if r["status"] == "pendingDelay" and r["captureEndSec"] + delay <= t:
                r["status"] = "pendingDownlink" if mode == "raw" else "pendingProcessing"
                if mode == "raw":
                    r["readySec"] = t
        if t == END:
            break
        powered = not any(a <= t < b for a, b in OUTAGES)
        contact = any(a <= t < b for a, b in STATIONS)
        tx = next((r for r in rows if r["status"] in ("pendingDownlink", "partialDownlink")), None)
        cpu = next((i for i, r in enumerate(rows) if r["status"] == "pendingProcessing"), None)
        cam = next((i for i, op in enumerate(OPS) if op["startSec"] <= t < op["endSec"]), None)
        if powered and contact and tx is not None:
            amount = S["downlinkMbps"] / 8 * DT
            assert tx["remainingMB"] >= amount
            tx["sentMB"] += amount
            tx["remainingMB"] -= amount
            energy_ws[2] += S["radioW"] * DT
            tx["status"] = "partialDownlink"
            if tx["remainingMB"] == 0:
                tx["status"] = "delivered"
                tx["deliveredSec"] = e
        if powered and cpu is not None:
            r = rows[cpu]
            work[cpu] += DT
            energy_ws[1] += S["processorW"] * DT
            if work[cpu] == S["processingSec"]:
                r["processEndSec"] = e
                if r["filterKeep"]:
                    r.update(status="pendingDownlink", remainingMB=S["rawMB"] * S["outputFraction"], readySec=e)
                else:
                    r.update(status="filteredOut", remainingMB=0)
        if cam is not None:
            r = rows[cam]
            if not powered:
                r["status"] = "capturePower"
            if r["status"] != "capturePower":
                energy_ws[0] += S["cameraW"] * DT
                if e == OPS[cam]["endSec"]:
                    r["captureEndSec"] = e
                    occupied = sum(item["remainingMB"] for item in rows)
                    if occupied + S["rawMB"] <= S["storeMB"]:
                        r.update(status="pendingDelay", remainingMB=S["rawMB"])
                    else:
                        r["status"] = "storageOverflow"
        peak = max(peak, sum(item["remainingMB"] for item in rows))
    return dict(strategy=dict(mode=mode, delaySec=delay), images=rows, peakStoredMB=peak,
                energyWh=[v / 3600 for v in energy_ws])


ref = dict(method="Independent quarter-second grid, ideal power or full outage",
           durationSec=END, settings=S, opportunities=OPS, stationWindows=STATIONS, outages=OUTAGES,
           cases=[simulate("raw", 0.5), simulate("filter", 1.25)])
Path(__file__).with_suffix(".json").write_text(json.dumps(ref, indent=2) + "\n", encoding="utf-8")
