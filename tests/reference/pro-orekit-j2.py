"""Independent Orekit double-precision propagation of a StarOrbit central + J2 result.

python tests/reference/pro-orekit-j2.py result.json
Verification-only dependencies: orekit-jpype 13.1.9.0, Java 17+ (or jdk4py).
"""
import json
import math
import os
from pathlib import Path
import sys

import orekit_jpype

try:
    import jdk4py
    os.environ.setdefault("JAVA_HOME", str(jdk4py.JAVA_HOME))
except ImportError:
    pass
orekit_jpype.initVM()

from org.hipparchus.geometry.euclidean.threed import Vector3D
from org.hipparchus.ode.nonstiff import DormandPrince853Integrator
from org.orekit.forces.gravity import J2OnlyPerturbation
from org.orekit.frames import FramesFactory
from org.orekit.orbits import CartesianOrbit, OrbitType
from org.orekit.propagation import SpacecraftState
from org.orekit.propagation.numerical import NumericalPropagator
from org.orekit.time import AbsoluteDate
from org.orekit.utils import PVCoordinates

r = json.loads(Path(sys.argv[1]).read_text(encoding="utf8"))
assert (r["frame"], r["timeSystem"], r["trajectoryInfo"]["appliedGravity"]) == ("EME2000", "UTC", "j2")
assert not any(r["trajectoryInfo"]["appliedForces"][k] for k in ("drag", "srp", "thirdBody"))
mu = 398600.4418e9
frame = FramesFactory.getEME2000()
# This gravity field is fixed in the inertial frame and has no epoch dependence.
epoch = AbsoluteDate.J2000_EPOCH
s = [x * 1000 for x in r["orbit"][0]]
pv = PVCoordinates(Vector3D(*s[:3]), Vector3D(*s[3:]))
integrator = DormandPrince853Integrator(1e-3, 90.0, 1e-8, 1e-13)
model = NumericalPropagator(integrator)
model.setOrbitType(OrbitType.CARTESIAN)
model.setInitialState(SpacecraftState(CartesianOrbit(pv, frame, epoch, mu)))
model.addForceModel(J2OnlyPerturbation(mu, 6378136.3, 0.00108262668, frame))
rows = []
for second in [0, 21600, 43200, 64800, 86400]:
    external = model.propagate(epoch.shiftedBy(float(second))).getPVCoordinates(frame)
    local = [x * 1000 for x in r["orbit"][second // r["stepSeconds"]]]
    rows.append({
        "elapsed_s": second,
        "position_m": math.dist(external.getPosition().toArray(), local[:3]),
        "velocity_mm_s": 1000 * math.dist(external.getVelocity().toArray(), local[3:]),
    })
assert max(x["position_m"] for x in rows) < 0.02
assert max(x["velocity_mm_s"] for x in rows) < 0.02
print(json.dumps(rows, indent=2))
