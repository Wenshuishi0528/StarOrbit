"""Meaningful geometry regression for every expanded target, including all 56 new single-member groups."""
import importlib.util
import json
import math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare_chinese_art', ROOT / 'scripts/prepare-chinese-art.py')
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)
catalog = json.loads((ROOT / 'assets/chinese-sky/catalog.json').read_text())
brief = json.loads((ROOT / 'assets/chinese-sky/art/expansion-brief.json').read_text())
hip = {x[0]:x for x in json.loads((ROOT / 'assets/stars.json').read_text())}
hip.update({x[0]:x for x in catalog['additionalStars']})
assert len(brief['entries']) == 280
assert len(set(x['artworkId'] for x in brief['entries'])) == 280
assert brief['memberAudit']['withoutPrimaryMembers'] == 0
assert brief['memberAudit']['newSinglePrimaryMember'] == 56
floor_applied = 0
for entry in brief['entries']:
    assert entry['promptSubject'] and entry['interpretationCaution']
    assert not entry['basis']['uniqueHistoricalImageClaimed']
    subject = {'imageId':entry['artworkId'], 'sourcePixelSize':[1000,1000], 'targetIds':entry['targetIds'], 'landmarks':[],
               'placement':{'method':'member-extent','sourceAxisPixels':[[100,500],[900,500]],
                            'sourceVisibleBox':[100,100,900,900],'orientation':'north-up','coveragePadding':1.12,
                            'minimumAngularDiameterDegrees':3}}
    result = art.registration(subject, hip, catalog)
    check = result[-2]
    placement = check['placement']
    assert check['flippedTriangles'] == 0, entry['artworkId']
    assert math.isclose(check['maximumScaleRatio'], 1, abs_tol=1e-10)
    assert placement['coveredPrimaryMembers'] == placement['primaryMemberCount'], entry['artworkId']
    assert check['realLandmarks'] == 0
    assert all(x.get('notAstronomicalAnchor') and x.get('basis')=='modern-layout' for x in result[-1])
    assert all(math.isfinite(float(value)) for row in result[1] for value in row)
    json.dumps(check)  # numpy scalar regressions must not break report/export.
    floor_applied += placement['minimumExtentApplied']
    if entry['primaryMemberCount'] == 1:
        assert placement['minimumExtentApplied'], entry['artworkId']
        assert placement['primaryMemberCount'] == 1
        assert placement['centerResidualPlane'] < 1e-10
print(f'Chinese art expansion: 280 complete briefs; all target geometries valid; {floor_applied} synthetic-square layouts use the declared 3-degree minimum.')
