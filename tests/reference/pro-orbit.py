"""Regenerate pro-orbit.json with SciPy DOP853, independent of the JS solver.

Run from the repository root. The production runtime needs neither SciPy nor Python.
"""
import json
import subprocess
from pathlib import Path
import numpy as np
from scipy.integrate import solve_ivp

mu, radius, j2 = 398600.4418, 6378.1363, 1.08262668e-3
times = [0, 21600, 43200, 64800, 86400]


def rotation(axis, angle):
    c, s = np.cos(np.deg2rad(angle)), np.sin(np.deg2rad(angle))
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]]) if axis == 'z' else np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def ephemeris(elements):
    rp, ra = radius + elements['perigeeKm'], radius + elements['apogeeKm']
    e, a = (ra - rp) / (ra + rp), (ra + rp) / 2
    p = a * (1 - e**2)
    f = np.deg2rad(elements['anomalyDeg'])
    transform = rotation('z', elements['raanDeg']) @ rotation('x', elements['inclinationDeg']) @ rotation('z', elements['argPerigeeDeg'])
    r = transform @ (p / (1 + e * np.cos(f)) * np.array([np.cos(f), np.sin(f), 0]))
    v = transform @ (np.sqrt(mu / p) * np.array([-np.sin(f), e + np.cos(f), 0]))

    def dynamics(t, x):
        # Gradient of the axisymmetric quadrupole potential in vector form.
        position = x[:3]
        distance = np.linalg.norm(position)
        u = position / distance
        polar = np.array([0., 0., 1.])
        sine = u @ polar
        quad = 1.5 * mu * j2 * radius**2 / distance**4 * ((5 * sine**2 - 1) * u - 2 * sine * polar)
        return np.r_[x[3:], -mu * u / distance**2 + quad]

    sol = solve_ivp(dynamics, [0, 86400], np.r_[r, v], method='DOP853', dense_output=True, rtol=2e-13, atol=1e-13)
    if not sol.success:
        raise RuntimeError(sol.message)
    return sol.sol


def electrical_thermal_reference(orbit):
    # Only the solar ephemeris is shared. Geometry, disc overlap, power flows,
    # thermal integration and orbital dynamics are evaluated separately here.
    js = """import {sunPosition} from './src/orbit.js';
      console.log(JSON.stringify(Array.from({length:97},(_,i)=>sunPosition(Date.UTC(2026,10,23)+i*900000))));"""
    solar_knots = np.array(json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js], text=True)))
    t = np.arange(86400) + .5
    r = orbit(t)[:3].T
    sun = np.array([np.interp(t, np.arange(97)*900, solar_knots[:, k]) for k in range(3)]).T - r
    d = np.linalg.norm(sun, axis=1)
    radius_sc = np.linalg.norm(r, axis=1)
    cosine = np.einsum('ij,ij->i', r, sun) / (d * radius_sc)
    sep = np.arccos(-np.clip(cosine, -1, 1))
    a, b = np.arcsin(695700 / d), np.arcsin(6371 / radius_sc)
    visible = np.where(sep <= b-a, 0., 1.)
    partial = (sep > b-a) & (sep < a+b)
    aa, bb, ss = a[partial], b[partial], sep[partial]
    x = (ss**2 + aa**2 - bb**2) / (2*ss)
    lens = aa**2*np.arccos(np.clip(x/aa,-1,1)) + bb**2*np.arccos(np.clip((ss-x)/bb,-1,1)) - ss*np.sqrt(np.maximum(0,aa**2-x**2))
    visible[partial] = 1 - lens/(np.pi*aa**2)
    flux = 1361*(149597870.7/d)**2
    earth_heat = .12*(1-np.sqrt(1-(6371/radius_sc)**2))/2 * (.82*237+.82*.3*flux*np.maximum(0,cosine))
    load = 7 + 6*((t >= 1200)&(t < 2100) | (t >= 29400)&(t < 30900) | (t >= 59400)&(t < 61200))
    outputs = []
    for incidence in [np.ones_like(t), np.maximum(0, cosine)]:
        direct = flux*.065*visible*incidence
        # Midpoint integration, 1 s. A 1000 Wh battery starts at 500 Wh, so the
        # comparison exercises charging and discharging away from saturation.
        energy, exterior, board = 500., 20., 20.
        minimum, peak, total = energy, board, 0.
        def rates(solar, earth, demand, outer, inner):
            pv = solar * max(0., min(.82,.26*(1-.003*(outer-25))))
            surplus = pv-demand
            stored = surplus*.93 if surplus>=0 else surplus/.94
            transfer = .6*(inner-outer)
            emitted = .82*5.670374419e-8*.12*((273.15+outer)**4-3**4)
            return stored/3600, (.82*solar+earth-emitted-pv+transfer)/2200, (demand+surplus-stored-transfer)/700, pv/3600
        for solar, earth, demand in zip(direct, earth_heat, load):
            _, do, db, _ = rates(solar, earth, demand, exterior, board)
            de, do, db, pv = rates(solar, earth, demand, exterior+do/2, board+db/2)
            energy += de; exterior += do; board += db; total += pv
            minimum, peak = min(minimum,energy), max(peak,board)
        assert 0 < minimum <= energy < 1000
        outputs.append(dict(minBatteryWh=minimum, peakBoardC=peak, solarUsedWh=total, finalWh=energy, finalBoardC=board))
    return outputs


cases = [
    dict(perigeeKm=550, apogeeKm=550, inclinationDeg=51.6, raanDeg=30, argPerigeeDeg=0, anomalyDeg=0),
    dict(perigeeKm=400, apogeeKm=840, inclinationDeg=73, raanDeg=125, argPerigeeDeg=32, anomalyDeg=18),
]
dest = Path(__file__).with_suffix('.json')
orbits = [ephemeris(c) for c in cases]
dest.write_text(json.dumps({'method': 'SciPy DOP853', 'timesSec': times,
    'cases': [{'elements':c, 'states':s(times).T.tolist()} for c,s in zip(cases,orbits)],
    'electrothermal': electrical_thermal_reference(orbits[0])}, indent=2) + '\n', encoding='utf-8')
