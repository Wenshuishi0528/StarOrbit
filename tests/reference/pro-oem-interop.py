"""Check a real StarOrbit CLI OEM with Orekit and read an Orekit-written analytic OEM back.

    python -m pip install orekit-jpype==13.1.9.0 jdk4py astropy-iers-data
    python tests/reference/pro-oem-interop.py output/pro-v168/orbit.oem output/pro-v168/result.json

Node must be on PATH. The optional validation packages are independent of the application.
The default fetches Orekit's 32 KiB JPL header fixture into a temporary directory.
Pass --orekit-data /path/to/orekit-data to run completely offline with local DE files.
"""

import argparse
import hashlib
from importlib.metadata import version
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.request import urlopen

import astropy_iers_data
import jdk4py
import orekit_jpype


ROOT = Path(__file__).resolve().parents[2]
EARTH_MU_SI = 3.986004418e14
SYNTHETIC_EPOCH = "2026-11-23T00:00:00.000Z"
DE405_URL = ("https://raw.githubusercontent.com/CS-SI/Orekit/13.1.3/"
             "src/test/resources/regular-data/de405-ephemerides/unxp0002.405")
DE405_SHA256 = "898714d59d445b988602ca9fbeacd11c533abb98515e98019429b2601f7cade2"


def start_orekit(data_directory):
    os.environ["JAVA_HOME"] = str(jdk4py.JAVA_HOME)
    orekit_jpype.initVM(vmargs="--enable-native-access=ALL-UNNAMED")
    from java.io import File
    from java.util import ArrayList
    from jpype import JProxy
    from org.orekit.data import DataContext, DirectoryCrawler
    from org.orekit.time import DateComponents, OffsetModel, TimeScalesFactory

    # Orekit resolves the Earth center name using JPL header constants even for a
    # same-frame read. This check never evaluates the truncated DE405's trajectories.
    DataContext.getDefault().getDataProvidersManager().addProvider(DirectoryCrawler(File(str(data_directory.resolve()))))
    offsets = ArrayList()
    leap_file = Path(astropy_iers_data.__file__).parent / "data" / "Leap_Second.dat"
    for line in leap_file.read_text(encoding="ascii").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        _, day, month, year, offset = line.split()
        offsets.add(OffsetModel(DateComponents(int(year), int(month), int(day)), int(offset)))
    loader = JProxy("org.orekit.time.UTCTAIOffsetsLoader", dict(loadOffsets=lambda: offsets))
    TimeScalesFactory.clearUTCTAIOffsetsLoaders()
    TimeScalesFactory.addUTCTAIOffsetsLoader(loader)
    return TimeScalesFactory.getUTC()


def inspect_cli(path, result_path, utc):
    from org.orekit.data import DataSource
    from org.orekit.files.ccsds.ndm import ParserBuilder
    from org.orekit.time import AbsoluteDate

    result = json.loads(result_path.read_text(encoding="utf-8-sig"))
    message = ParserBuilder().withMu(EARTH_MU_SI).buildOemParser().parseMessage(DataSource(str(path.resolve())))
    header = message.getHeader()
    assert header.getFormatVersion() == 3 and header.getOriginator() == "STARORBIT"
    assert message.getSegments().size() == 1, "This fixture is a single continuous propagated arc."
    segment = message.getSegments().get(0)
    metadata = segment.getMetadata()
    assert metadata.getCenter().getName() == "EARTH"
    assert metadata.getReferenceFrame().getName() == result["frame"] == "EME2000"
    assert metadata.getTimeSystem().name() == result["timeSystem"] == "UTC"
    assert metadata.getInterpolationMethod().name() == "HERMITE" and metadata.getInterpolationDegree() == 3
    mission = result["mission"]
    assert mission["trajectory"]["mode"] == "oemInitial", "Pass the documented CSS initialized CLI case."
    assert metadata.getObjectID() == result["trajectoryInfo"]["objectId"]
    assert metadata.getObjectName() == result["trajectoryInfo"]["objectName"]
    epoch = AbsoluteDate(mission["epochUtc"], utc)
    duration = result["durationSec"]
    assert metadata.getStartTime().durationFrom(epoch) == 0
    assert metadata.getStopTime().durationFrom(epoch) == duration
    coords = segment.getCoordinates()
    assert coords.size() >= 2
    previous = -math.inf
    max_position = max_velocity = 0
    for knot in coords:
        elapsed = knot.getDate().durationFrom(epoch)
        assert previous < elapsed <= duration
        previous = elapsed
        # Published CLI case exports every 60 s on a 5 s solver grid. Compare the
        # entire file in Orekit SI to the original JSON, independently of the JS parser.
        step = round(elapsed / result["stepSeconds"])
        assert abs(elapsed - step * result["stepSeconds"]) < 1e-9, "Expected a native solver knot."
        xyz = knot.getPosition().toArray()
        velocity = knot.getVelocity().toArray()
        truth = result["orbit"][step]
        max_position = max(max_position, math.dist(xyz, [v * 1000 for v in truth[:3]]))
        max_velocity = max(max_velocity, math.dist(velocity, [v * 1000 for v in truth[3:]]))
    assert coords.get(0).getDate().durationFrom(epoch) == 0
    assert coords.get(coords.size() - 1).getDate().durationFrom(epoch) == duration
    assert max_position < 1e-7 and max_velocity < 1e-10
    return {
        "objectId": metadata.getObjectID(),
        "knots": coords.size(),
        "utcDuration_s": duration,
        "maxNodePositionDifference_m": max_position,
        "maxNodeVelocityDifference_mps": max_velocity,
    }


def analytic_km(t):
    return [
        7010 + .64*t - .003*t**2 + .000004*t**3,
        -31 + 7.53*t + .0009*t**2 - .000007*t**3,
        339 - .75*t - .0003*t**2 + .000002*t**3,
        .64 - .006*t + .000012*t**2,
        7.53 + .0018*t - .000021*t**2,
        -.75 - .0006*t + .000006*t**2,
    ]


def write_synthetic(path, utc):
    from java.lang import StringBuilder
    from java.util import ArrayList
    from org.hipparchus.geometry.euclidean.threed import Vector3D
    from org.orekit.data import DataContext
    from org.orekit.files.ccsds.definitions import BodyFacade, FrameFacade, TimeSystem
    from org.orekit.files.ccsds.ndm import WriterBuilder
    from org.orekit.files.ccsds.ndm.odm import OdmHeader
    from org.orekit.files.ccsds.ndm.odm.oem import InterpolationMethod, Oem, OemData, OemMetadata, OemSegment
    from org.orekit.files.ccsds.utils.generation import KvnGenerator
    from org.orekit.frames import FramesFactory
    from org.orekit.time import AbsoluteDate
    from org.orekit.utils import IERSConventions, TimeStampedPVCoordinates

    epoch = AbsoluteDate(SYNTHETIC_EPOCH, utc)
    header = OdmHeader()
    header.setFormatVersion(3.0)
    header.setOriginator("OREKIT")
    header.setCreationDate(epoch)
    metadata = OemMetadata(3)
    metadata.setObjectName("ANALYTIC-CUBIC")
    metadata.setObjectID("UNKNOWN")
    metadata.setCenter(BodyFacade("EARTH", None))
    metadata.setReferenceFrame(FrameFacade.map(FramesFactory.getEME2000()))
    metadata.setTimeSystem(TimeSystem.UTC)
    times = [0, 17, 58, 83]
    metadata.setStartTime(epoch)
    metadata.setStopTime(epoch.shiftedBy(float(times[-1])))
    metadata.setInterpolationMethod(InterpolationMethod.HERMITE)
    metadata.setInterpolationDegree(3)
    data = OemData()
    for t in times:
        state = [component * 1000 for component in analytic_km(t)]
        coordinates = TimeStampedPVCoordinates(
            epoch.shiftedBy(float(t)), Vector3D(*state[:3]), Vector3D(*state[3:]), Vector3D.ZERO
        )
        data.addData(coordinates, False)
    segments = ArrayList()
    segments.add(OemSegment(metadata, data, EARTH_MU_SI))
    message = Oem(header, segments, IERSConventions.IERS_2010, DataContext.getDefault(), EARTH_MU_SI)
    buffer = StringBuilder()
    output = KvnGenerator(buffer, 24, path.name, 0., 0)
    WriterBuilder().buildOemWriter().writeMessage(output, message)
    output.close()
    path.write_text(str(buffer), encoding="ascii")
    return times


def read_with_starorbit(path, times):
    js = """
      import fs from 'node:fs';
      import {parseOem, sampleOem} from './src/pro/oem.js';
      const oem = parseOem(fs.readFileSync(process.argv[1], 'ascii'));
      const offsets = JSON.parse(process.argv[2]);
      console.log(JSON.stringify({originator: oem.originator, rowCount: oem.rowCount, name: oem.objectName,
        states: offsets.map(t => sampleOem(oem, oem.startMs + t*1000))}));
    """
    probes = sorted(times + [.125, 9.625, 46.3125, 72.75])
    completed = subprocess.run(
        ["node", "--input-type=module", "-e", js, str(path), json.dumps(probes)],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    reread = json.loads(completed.stdout)
    assert reread["originator"] == "OREKIT" and reread["name"] == "ANALYTIC-CUBIC"
    assert reread["rowCount"] == len(times)
    max_position = max_velocity = 0
    for t, state in zip(probes, reread["states"], strict=True):
        truth = analytic_km(t)
        max_position = max(max_position, math.dist(state[:3], truth[:3]) * 1000)
        max_velocity = max(max_velocity, math.dist(state[3:], truth[3:]) * 1000)
    assert max_position < 1e-7 and max_velocity < 1e-9
    return {"nativeKnots": len(times), "offGridChecks": len(probes) - len(times),
            "maxPositionDifference_m": max_position, "maxVelocityDifference_mps": max_velocity}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("oem", type=Path)
    parser.add_argument("result_json", type=Path)
    parser.add_argument("--orekit-data", type=Path, help="Orekit directory containing DE ephemerides for Earth constants.")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="starorbit-oem-interop-") as tmp:
        directory = args.orekit_data
        if directory is None:
            directory = Path(tmp)
            with urlopen(DE405_URL, timeout=20) as response:
                raw = response.read(32577)
            if len(raw) != 32576 or hashlib.sha256(raw).hexdigest() != DE405_SHA256:
                raise ValueError("Unexpected Orekit DE405 validation fixture")
            (directory / "unxp0002.405").write_bytes(raw)
        utc = start_orekit(directory)
        forward = inspect_cli(args.oem, args.result_json, utc)
        path = Path(tmp) / "orekit-cubic.oem"
        reverse = read_with_starorbit(path, write_synthetic(path, utc))
    print(json.dumps({"orekitJpype": version("orekit-jpype"), "jdk4py": version("jdk4py"),
                      "iersData": version("astropy-iers-data"),
                      "starOrbitToOrekit": forward, "orekitToStarOrbit": reverse}, indent=2))


if __name__ == "__main__":
    main()
