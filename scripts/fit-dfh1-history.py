"""Offline reconstruction from minute-resolution newspaper pass times.

Requires numpy/scipy; never runs in the app. Run from the repository root.
Apr 25, 26 and 29 fit the phase, perigee argument and effective period;
Apr 27, 30 and May 1–2 are held out. The node uses a Jiuquan launch-plane prior.
The newspaper
does not define "fly-over" as culmination: this is an approximate reconstruction,
not measured elements. See docs/v0.78-details.md for assumptions and limitations.
"""
import argparse
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from scipy.optimize import differential_evolution, least_squares

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = json.loads((ROOT / 'tests/fixtures/dfh1-historical-passes.json').read_text())
DEG = np.pi / 180
EPOCH = datetime.fromisoformat('1970-04-25T20:29:00+08:00').timestamp()
A = 6371 + (439 + 2384) / 2
E = (2384 - 439) / (2 * A)
I = 68.5 * DEG
EARTH_RATE = 2 * np.pi / 86164.0905
J2_FACTOR = 1.08262668e-3 * (6378.137 / (A * (1 - E * E))) ** 2


def with_launch_plane(parameters):
    argument, anomaly, period = parameters
    launch = FIXTURES['launchPlanePrior']
    dt = datetime.fromisoformat(launch['time']).timestamp() - EPOCH
    # WGS84 geodetic latitude to geocentric latitude; select the descending
    # solution. Approximate launch-region geometry, not an ascent trajectory.
    latitude = np.arctan((1-6.69437999014e-3) * np.tan(launch['latitude'] * DEG))
    u = np.pi - np.arcsin(np.sin(latitude) / np.sin(I))
    node_rate = -1.5 * J2_FACTOR * (2*np.pi/period) * np.cos(I)
    node = launch['longitude']*DEG + EARTH_RATE*dt - np.arctan2(np.cos(I)*np.sin(u), np.cos(u)) - node_rate*dt
    return np.array([node/DEG % 360, argument, anomaly, period])


def positions(parameters, times):
    node, argument, anomaly = parameters[:3] * DEG
    n = 2 * np.pi / parameters[3]
    node = node - 1.5 * J2_FACTOR * n * np.cos(I) * times
    argument = argument + .75 * J2_FACTOR * n * (5 * np.cos(I) ** 2 - 1) * times
    mean = (anomaly + n * times) % (2 * np.pi)
    eccentric = mean.copy()
    for _ in range(8):
        eccentric -= (eccentric - E * np.sin(eccentric) - mean) / (1 - E * np.cos(eccentric))
    x = A * (np.cos(eccentric) - E)
    y = A * np.sqrt(1 - E * E) * np.sin(eccentric)
    co, so = np.cos(node), np.sin(node)
    cw, sw = np.cos(argument), np.sin(argument)
    ci, si = np.cos(I), np.sin(I)
    return np.array([(co*cw-so*sw*ci)*x + (-co*sw-so*cw*ci)*y,
                     (so*cw+co*sw*ci)*x + (-so*sw+co*cw*ci)*y,
                     sw*si*x + cw*si*y])


def elevation(parameters, times, latitude, longitude):
    # Constant sidereal rotation is sufficient for this minute-resolution fit.
    # App regression checks independently use Astronomy Engine's full Earth axes.
    lat, lon = latitude * DEG, longitude * DEG + EARTH_RATE * times
    up = np.array([np.cos(lon)*np.cos(lat), np.sin(lon)*np.cos(lat), np.sin(lat)+np.zeros_like(lon)])
    eccentricity2 = 6.69437999014e-3
    radius = 6378.137 / np.sqrt(1 - eccentricity2 * np.sin(lat)**2)
    observer = np.array([radius*up[0], radius*up[1], radius*(1-eccentricity2)*up[2]])
    relative = positions(parameters, times) - observer
    return np.sum(relative * up, axis=0) / np.sqrt(np.sum(relative**2, axis=0))


def peaks(parameters, rows):
    times = np.array([datetime.fromisoformat(r['time']).timestamp()-EPOCH for r in rows])
    lat = np.array([r['latitude'] for r in rows])
    lon = np.array([r['longitude'] for r in rows])
    grid = times + np.arange(-720, 721, 30)[:, None]
    best = grid[np.argmax(elevation(parameters, grid, lat, lon), axis=0), np.arange(len(rows))]
    left, right = best - 30, best + 30
    for _ in range(30):
        a, b = left + (right-left)*.381966, left + (right-left)*.618034
        choose = elevation(parameters, a, lat, lon) > elevation(parameters, b, lat, lon)
        left, right = np.where(choose, left, a), np.where(choose, b, right)
    best = (left + right) / 2
    return best-times, np.arcsin(elevation(parameters, best, lat, lon)) / DEG


def residual(parameters):
    delta, height = peaks(with_launch_plane(parameters), TRAIN)
    return np.r_[delta / 60, np.maximum(0, 3-height)]


TRAIN = [r for r in FIXTURES['observations'] if r['split'] == 'train']
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--global-search', action='store_true', help='Repeat the slower seeded global search before refinement')
    args = parser.parse_args()
    # The period is constrained to round to the communiqué's 114 minutes.
    bounds = ([0, 0, 6810], [360, 360, 6870])
    initial = [196, 314, 6845]
    if args.global_search:
        initial = differential_evolution(lambda x: sum(residual(x)**2), list(zip(*bounds)),
                                         seed=52, popsize=10, maxiter=150, tol=1e-5, polish=False).x
    fit = least_squares(residual, initial, bounds=bounds, diff_step=1e-4, max_nfev=300)
    parameters = with_launch_plane(fit.x)
    print(json.dumps(dict(zip(['nodeLongitudeDeg', 'argumentDeg', 'meanAnomalyDeg', 'reconstructedPeriodSeconds'], parameters.tolist())), indent=2))
    for split in ['train', 'holdout']:
        rows = [r for r in FIXTURES['observations'] if r['split'] == split]
        delta, height = peaks(parameters, rows)
        print(split, 'RMS seconds', float(np.sqrt(np.mean(delta**2))), 'max seconds', float(max(abs(delta))))
        for row, error, el in zip(rows, delta, height):
            print(row['time'], row['city'], round(float(error), 1), round(float(el), 1))
