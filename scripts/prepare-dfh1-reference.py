# Optional independent reference generator: Python + skyfield 1.55.
from pathlib import Path
import json, datetime
import skyfield
from skyfield.api import load,EarthSatellite
from skyfield.framelib import ICRS_to_J2000
root=Path(__file__).resolve().parents[1]
gp=json.loads((root/'assets/spacecraft/dfh1-gp.json').read_text())[0]
ts=load.timescale(builtin=True);sat=EarthSatellite.from_omm(ts,gp)
epoch=datetime.datetime.fromisoformat(gp['EPOCH']).replace(tzinfo=datetime.timezone.utc)
rows=[]
for seconds in [-259200,-172800,-86400,-1980,0,1980,86400,172800,259200]:
 date=epoch+datetime.timedelta(seconds=seconds);ms=int(date.timestamp()*1000);instant=datetime.datetime.fromtimestamp(ms/1000,datetime.timezone.utc);p=sat.at(ts.from_datetime(instant))
 rows.append({'time':ms,'position':(ICRS_to_J2000@p.position.km).tolist(),'velocity':(ICRS_to_J2000@p.velocity.km_per_s).tolist()})
output={'reference':'Skyfield '+skyfield.__version__+' / Python sgp4; independent GP initialization and TEME to ICRS then ICRS_to_J2000 frame bias','gp':gp,'samples':rows}
(root/'tests/reference/dfh1-skyfield.json').write_text(json.dumps(output,indent=2)+'\n')
