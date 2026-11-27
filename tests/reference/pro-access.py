"""Generate the v1.69 civil imaging geometry reference with SciPy and ERFA.

Run 'python tests/reference/pro-access.py' to regenerate the adjacent JSON.
The EME2000 trajectory, WGS84 geometry, Sun, frame rotation, root search and
culminations here are independent of the JavaScript implementation.
"""

from pathlib import Path
import json
import math

import erfa
import numpy as np
import scipy
from scipy.integrate import solve_ivp
from scipy.optimize import brentq, minimize_scalar


DEG = math.pi / 180
MU, RE, J2 = 398600.4418, 6378.1363, 1.08262668e-3
DAY = 86400.
JD0, JD1 = erfa.cal2jd(2026, 11, 25)
TARGET = {"name": "青海湖", "latDeg": 36.9, "lonDeg": 100.2, "heightM": 3200}
STATION = {"name": "北京示例站", "latDeg": 40, "lonDeg": 116, "heightM": 50}
CONDITIONS = {"target": TARGET, "station": STATION, "maxOffNadirDeg": 50,
              "minSunElevationDeg": 10, "minStationElevationDeg": 25,
              "settlingSec": 8, "exposureSec": 3, "cadenceSec": 20}


def trajectory():
    def equation(_t, state):
        r = state[:3]
        radius = np.linalg.norm(r)
        z2 = 5 * (r[2] / radius)**2
        return np.r_[state[3:], -MU / radius**3 * r
                      * (1 + 1.5*J2*(RE/radius)**2 * (np.array([1., 1., 3.]) - z2))]

    raan, inc, radius = 150 * DEG, 51.6 * DEG, RE + 550
    c, s = math.cos(raan), math.sin(raan)
    seed = np.r_[radius*np.array([c, s, 0]), math.sqrt(MU/radius)*np.array([-s*math.cos(inc), c*math.cos(inc), math.sin(inc)])]
    result = solve_ivp(equation, [0, DAY], seed, method="DOP853", rtol=2.5e-13, atol=1e-13, dense_output=True)
    if not result.success:
        raise RuntimeError(result.message)
    return result.sol


def frame(site):
    lat, lon = site["latDeg"] * DEG, site["lonDeg"] * DEG
    pos = erfa.gd2gc(1, lon, lat, site["heightM"]) / 1000  # ERFA WGS84
    up = np.array([math.cos(lat)*math.cos(lon), math.cos(lat)*math.sin(lon), math.sin(lat)])
    return pos, up


def angles_function():
    orbit = trajectory()
    target, up_t = frame(TARGET)
    station, up_s = frame(STATION)
    eme_to_gcrs = erfa.bp06(erfa.DJ00, 0.)[0].T

    def elevation(los, up):
        return np.arctan2(los @ up, np.linalg.norm(np.cross(los, up), axis=-1)) / DEG

    def angles(t):
        # Identical UT1-UTC=0 and xp=yp=0 assumptions isolate the geometry.
        # TAI-UTC was 37 s on 2026-11-25. The Earth heliocentre uses ERFA EPV00.
        ut = JD1 + np.asarray(t)/DAY
        tt = ut + (37. + 32.184)/DAY
        rotation = erfa.c2t06a(JD0, tt, JD0, ut, 0., 0.)
        gcrs = np.einsum('ij,...j->...i', eme_to_gcrs, orbit(t)[:3].T)
        r = np.einsum('...ij,...j->...i', rotation, gcrs)
        sun = -erfa.epv00(JD0, tt)[0]['p'] * erfa.DAU / 1000
        sun_fixed = np.einsum('...ij,...j->...i', rotation, sun)
        los = r-target
        off = np.arctan2(np.linalg.norm(np.cross(r, los),axis=-1), np.sum(r*los,axis=-1)) / DEG
        return np.stack((elevation(los, up_t), off, elevation(sun_fixed-target, up_t), elevation(r-station, up_s)),axis=-1)

    return angles


def evaluate_case(conditions, grid, series, angles):
    def margins(a):
        return (np.minimum.reduce([a[..., 0], conditions["maxOffNadirDeg"] - a[..., 1],
                                   a[..., 2] - conditions["minSunElevationDeg"]]),
                a[..., 3] - conditions["minStationElevationDeg"])

    output = {}
    for channel, key in enumerate(["targetWindows", "stationWindows"]):
        inside = margins(series)[channel] >= 0
        edges = [0.] if inside[0] else []
        for i in np.flatnonzero(inside[1:] != inside[:-1]):
            edges.append(brentq(lambda t: margins(angles(t))[channel], grid[i], grid[i+1], xtol=1e-8))
        if inside[-1]:
            edges.append(DAY)
        assert len(edges) % 2 == 0
        windows = []
        which = 0 if channel == 0 else 3
        for a, b in zip(edges[::2], edges[1::2]):
            peak = minimize_scalar(lambda t: -angles(t)[which], bounds=(a,b), method="bounded",
                                   options={"xatol": 1e-6}).x
            peak = max((a, peak, b), key=lambda t: angles(t)[which])
            windows.append(dict(startSec=a,endSec=b,peakSec=peak,peakElevationDeg=angles(peak)[which]))
        output[key] = windows
    output["opportunityCount"] = sum(max(0, 1 + math.floor((w["endSec"]-w["startSec"] - conditions["settlingSec"]
                                    - conditions["exposureSec"]) / conditions["cadenceSec"])) for w in output["targetWindows"])
    return output


def main():
    grid = np.arange(0, DAY+5, 5.)
    angles = angles_function()
    series = angles(grid)
    baseline = evaluate_case(CONDITIONS, grid, series, angles)
    # Place the Sun threshold halfway through a geometric pass to exercise a
    # genuinely solar-limited boundary as well as station pointing/limb events.
    w = baseline["targetWindows"][0]
    solar_cut = float(angles((w["startSec"] + w["endSec"])/2)[2])
    twilight = evaluate_case(dict(CONDITIONS, minSunElevationDeg=solar_cut), grid, series, angles)
    document = {"epochUtc":"2026-11-25T00:00:00Z", "orbit":{"perigeeKm":550,"apogeeKm":550,
                "inclinationDeg":51.6,"raanDeg":150,"argPerigeeDeg":0,"anomalyDeg":0},
                "reference":{"earthOrientation":"ERFA c2t06a IAU 2006/2000A, xp=yp=0, UT1=UTC, EME2000 frame bias",
                             "sun":"ERFA epv00", "orbit":"SciPy DOP853 fixed inertial-z WGS84 J2",
                             "pyerfa":erfa.__version__,"scipy":scipy.__version__,"numpy":np.__version__},
                "observation":CONDITIONS, "baseline":baseline, "solarCutDeg":solar_cut, "solarLimited":twilight}
    Path(__file__).with_suffix(".json").write_text(json.dumps(document, ensure_ascii=False, indent=2)+"\n",encoding="utf8")


if __name__ == "__main__":
    main()
