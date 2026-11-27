"""Regenerate pro-forces.json using an independent offline reference stack.

Requires numpy, scipy, pyerfa, jplephem, orekit-jpype 13.1.3.0 and a JDK.
Supply a local copy of the NASA/JPL DE440s planetary kernel:
  python tests/reference/pro-forces.py /path/to/de440s.bsp
  https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp
No StarOrbit source, JavaScript ephemerides or density tables are used here.
"""
import argparse
import hashlib
import json
from importlib.metadata import version
from math import acos, asin, cos, pi, sin, sqrt
from pathlib import Path

import erfa
import numpy as np
import orekit_jpype
import scipy
from jplephem.spk import SPK
from scipy.integrate import solve_ivp
from scipy.interpolate import CubicSpline


def solar_system(kernel):
    # GCRS/ICRF SPK positions -> mean dynamical axes at J2000.0. Take care
    # with the Earth-Moon barycentre and use simultaneous geometric positions.
    utc = erfa.dtf2d("UTC", 2026, 11, 23, 0, 0, 0.0)
    tt1, tt0 = erfa.taitt(*erfa.utctai(*utc))
    t = np.arange(-120, 86400 + 240, 120)
    tt2 = tt0 + t / 86400
    tdb = tt2 + erfa.dtdb(tt1, tt2, 0.0, 0.0, 0.0, 0.0) / 86400
    bias = erfa.bp06(2451545.0, 0.0)[0]
    sun = (kernel[0, 10].compute(tt1, tdb) - kernel[0, 3].compute(tt1, tdb)
           - kernel[3, 399].compute(tt1, tdb))
    moon = kernel[3, 301].compute(tt1, tdb) - kernel[3, 399].compute(tt1, tdb)
    pole = erfa.pnm06a(tt1, tt2)[:, 2, :].T
    return CubicSpline(t, np.concatenate((bias @ sun, bias @ moon, bias @ pole)).T)


def disc_angles(r, sun_relative):
    central_angle = acos(np.clip(-r @ sun_relative / (
        np.linalg.norm(r) * np.linalg.norm(sun_relative)), -1, 1))
    small = asin(695700 / np.linalg.norm(sun_relative))
    large = asin(6371 / np.linalg.norm(r))
    return central_angle, small, large


def visible_solar_disc(r, sun_relative):
    central_angle, small, large = disc_angles(r, sun_relative)
    if central_angle >= large + small:
        return 1.0
    if central_angle <= large - small:
        return 0.0
    x = (central_angle**2 + small**2 - large**2) / (2 * central_angle)
    overlap = (small**2 * acos(np.clip(x / small, -1, 1))
               + large**2 * acos(np.clip((central_angle - x) / large, -1, 1))
               - central_angle * sqrt(max(0.0, small**2 - x**2)))
    return 1.0 - overlap / (pi * small**2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kernel", type=Path)
    parser.add_argument("--max-step", default=12.0, type=float, help="DOP853 maximum step [s]")
    parser.add_argument("--shadow-step", default=0.5, type=float, help="Maximum step near eclipse contacts [s]")
    parser.add_argument("--output", type=Path, default=Path(__file__).with_suffix(".json"))
    args = parser.parse_args()
    sha = hashlib.sha256(args.kernel.read_bytes()).hexdigest()
    if sha != "c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2":
        raise ValueError("Expected the NASA/JPL de440s.bsp release kernel")
    orbit_bodies = solar_system(SPK.open(str(args.kernel)))
    orekit_jpype.initVM()
    from org.orekit.bodies import OneAxisEllipsoid
    from org.orekit.frames import FramesFactory
    from org.orekit.models.earth.atmosphere import HarrisPriester
    from org.hipparchus.geometry.euclidean.threed import Vector3D
    shape = OneAxisEllipsoid(6378137, 1 / 298.257223563, FramesFactory.getEME2000())
    atmosphere = HarrisPriester(None, shape)

    def density(sun, r):
        # Orekit's overload directly evaluates its original default table with
        # inputs supplied in any equator-aligned, right-handed frame, in metres.
        return atmosphere.getDensity(Vector3D(*(1000 * sun)), Vector3D(*(1000 * r)))

    mu, re, j2 = 398600.4418, 6378.1363, 1.08262668e-3
    au, light_speed, omega = 149597870.7, 299792458, 7.292115e-5
    params = {"massKg": 12, "dragAreaM2": 0.18, "cd": 2.2, "srpAreaM2": 0.24,
              "cr": 1.3, "densityScale": 1.15}
    times = [0, 21600, 43200, 64800, 86400]
    elements = {"perigeeKm": 430, "apogeeKm": 590, "inclinationDeg": 63,
                "raanDeg": 38, "argPerigeeDeg": 42, "anomalyDeg": 10}
    rp, ra = re + elements["perigeeKm"], re + elements["apogeeKm"]
    semi_latus = 2 * rp * ra / (rp + ra)
    eccentricity = (ra - rp) / (ra + rp)
    inc, node, arg, anomaly = np.deg2rad([elements[k] for k in (
        "inclinationDeg", "raanDeg", "argPerigeeDeg", "anomalyDeg")])
    n = np.array([cos(node), sin(node), 0])
    q = np.array([-cos(inc) * sin(node), cos(inc) * cos(node), sin(inc)])
    peri = n * cos(arg) + q * sin(arg)
    lateral = -n * sin(arg) + q * cos(arg)
    initial = np.r_[(cos(anomaly) * peri + sin(anomaly) * lateral) * semi_latus
                    / (1 + eccentricity * cos(anomaly)),
                    sqrt(mu / semi_latus) * (-sin(anomaly) * peri
                                             + (eccentricity + cos(anomaly)) * lateral)]
    samples = []
    for h_km, lat_deg, lon_deg in [(100.001, 0, 0), (278.5, 0, 35), (410, 0, 129),
                                   (530, 49, 54), (800, -84, -42), (999.9, 0, 158)]:
        lat, lon = np.deg2rad([lat_deg, lon_deg])
        e2 = (1 / 298.257223563) * (2 - 1 / 298.257223563)
        normal = 6378.137 / sqrt(1 - e2 * sin(lat)**2)
        r = np.array([(normal + h_km) * cos(lat) * cos(lon),
                      (normal + h_km) * cos(lat) * sin(lon),
                      (normal * (1 - e2) + h_km) * sin(lat)])
        sun = orbit_bodies(0)[:3]
        samples.append({"heightKm": h_km, "latitudeDeg": lat_deg, "rKm": r.tolist(),
                        "sunKm": sun.tolist(), "densityKgM3": density(sun, r)})

    def integrate(drag, srp, third):
        def rates(t, state):
            r, v = state[:3], state[3:]
            length = np.linalg.norm(r)
            u = r / length
            k = np.array([0, 0, 1])
            a = (-mu * u / length**2 + 1.5 * mu * j2 * re**2 / length**4
                 * ((5 * u[2]**2 - 1) * u - 2 * u[2] * k))
            data = orbit_bodies(t)
            sun, moon, pole = data[:3], data[3:6], data[6:]
            if drag:
                pole = pole / np.linalg.norm(pole)
                east0 = np.array([pole[2], 0, -pole[0]])
                east0 /= np.linalg.norm(east0)
                into_equator = np.stack((east0, np.cross(pole, east0), pole))
                rho = density(into_equator @ sun, into_equator @ r) * params["densityScale"]
                # Aerodynamics in SI. Convert the acceleration to km/s² only once.
                air_velocity = 1000 * (v - omega * np.cross(pole, r))
                a -= (0.5 * rho * params["cd"] * params["dragAreaM2"] / params["massKg"]
                      * np.linalg.norm(air_velocity) * air_velocity / 1000)
            if srp:
                ray = sun - r
                distance = np.linalg.norm(ray)
                pressure = (1361 / light_speed) * (au / distance)**2
                a -= (visible_solar_disc(r, ray) * pressure * params["cr"] * params["srpAreaM2"]
                      / params["massKg"] / 1000 * ray / distance)
            if third:
                for body, gm in [(sun, 132712440041.279419), (moon, 4902.800118)]:
                    # Direct differential Newtonian acceleration, in km/s².
                    a += gm * ((body - r) / np.linalg.norm(body - r)**3
                               - body / np.linalg.norm(body)**3)
            return np.concatenate((v, a))

        contacts = []
        if srp:
            # Locate entry and exit of *both* apparent-disc contacts. A small
            # SRP acceleration at a shadow edge can evade a state-error tolerance.
            def contact(sign):
                def event(t, state):
                    r = state[:3]
                    sep, small, large = disc_angles(r, orbit_bodies(t)[:3] - r)
                    return sep - (large + sign * small)
                return event
            pre = solve_ivp(rates, (0, 86400), initial, method="DOP853", rtol=1e-10,
                            atol=1e-12, max_step=35, events=(contact(-1), contact(1)))
            if not pre.success:
                raise RuntimeError(pre.message)
            contacts = sorted(np.concatenate(pre.t_events))
        # Integrate through every contact with a margin for the preliminary
        # trajectory error. The two paired penumbra crossings also lie in this
        # refined regime for the reference orbit. End exactly on sample times.
        bounds = sorted(set(times + [max(0, min(86400, c + d))
                                     for c in contacts for d in (-20, 20)]))
        state, states = initial, [initial.tolist()]
        for start, end in zip(bounds, bounds[1:]):
            midpoint = (start + end) / 2
            fine = any(abs(midpoint - c) < 20 for c in contacts)
            step = min(args.max_step, args.shadow_step) if fine else args.max_step
            sol = solve_ivp(rates, (start, end), state, t_eval=[end], method="DOP853",
                            rtol=2e-13, atol=1e-13, max_step=step)
            if not sol.success:
                raise RuntimeError(sol.message)
            state = sol.y[:, -1]
            if end in times:
                states.append(state.tolist())
        return states, len(contacts)

    cases = []
    for name, flags in [("j2", (False, False, False)), ("drag", (True, False, False)),
                        ("srp", (False, True, False)), ("thirdBody", (False, False, True)),
                        ("combined", (True, True, True))]:
        states, contacts = integrate(*flags)
        cases.append({"name": name, "switches": dict(zip(("drag", "srp", "thirdBody"), flags)),
                      "refinedShadowContacts": contacts, "states": states})
        print(f"Integrated {name} for 24 h", flush=True)
    reference = {"reference": {"kernel": "JPL DE440s", "kernelSha256": sha,
                  "ephemeris": "Geometric SPK, ERFA TT/TDB and GCRS-to-EME2000 bias",
                  "pole": "IAU 2006/2000A precession-nutation", "knotSec": 120,
                  "atmosphere": f"orekit-jpype {version('orekit-jpype')} default HarrisPriester n=4",
                  "integrator": f"SciPy {scipy.__version__} DOP853", "rtol": 2e-13,
                  "atol": 1e-13, "maxStepSec": args.max_step,
                  "eclipseContactMarginSec": 20, "eclipseMaxStepSec": args.shadow_step},
                 "epochUtc": "2026-11-23T00:00:00Z", "elements": elements,
                 "initial": initial.tolist(), "parameters": params, "timesSec": times,
                 "densityTable": [[row[0] / 1000, row[1], row[2]]
                                  for row in atmosphere.getTabDensity()],
                 "densities": samples, "cases": cases}
    args.output.write_text(
        json.dumps(reference, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
