"""Regressions for the actual art: arrow/head direction, size and preserved source pixels."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import unittest
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare_art', ROOT / 'scripts/prepare-chinese-art.py')
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)
CONFIG = json.loads((ROOT / 'assets/chinese-sky/art/rigid-placements.json').read_text())
CATALOG = json.loads((ROOT / 'assets/chinese-sky/catalog.json').read_text())
MANIFEST = json.loads((ROOT / 'assets/chinese-sky/art/manifest.json').read_text())
SPECS = {s['imageId']:s for s in CONFIG['images']}
HIP = {s[0]:s for s in json.loads((ROOT / 'assets/stars.json').read_text())}
HIP.update({s[0]:s for s in CATALOG['additionalStars']})


def dot_angle(a, b):
    return math.degrees(math.acos(float(np.clip(np.dot(art.unit(a), art.unit(b)), -1, 1))))


def transform(record):
    p = record['registration']['placement']
    center, east, north = [np.array(p[k]) for k in ('center', 'east', 'north')]
    def project(hip):
        v = art.vector(*HIP[hip][1:3])
        return np.array([v @ east, v @ north]) / (v @ center)
    def placed(pixel):
        return ((np.asarray(pixel) - p['sourceOrigin']) @ np.array(p['orthogonalMatrix']) * p['uniformScalePerSourcePixel'] + p['targetOriginPlane'])
    return placed, project


class ChineseArtPlacement(unittest.TestCase):
    def test_reimporting_generation_brief_preserves_reviewed_directions(self):
        config = json.loads(json.dumps(CONFIG))
        updated = art.import_expansion(config, ROOT / 'assets/chinese-sky/art/expansion-brief.json')
        self.assertEqual(updated['images'], CONFIG['images'])

    def test_every_actual_placement_is_built_and_has_a_finite_uniform_scale(self):
        self.assertEqual(len(SPECS), 319)
        for s in CONFIG['images']:
            records = [r for r in MANIFEST['images'] if r['original'] == s['sourceFile']]
            self.assertTrue(records, s['imageId'])
            expected = hashlib.sha256(json.dumps(s, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
            for r in records:
                self.assertEqual(r['registration']['sourceControlSha256'], expected, s['imageId'])
                p = r['registration']['placement']
                matrix = np.array(p['orthogonalMatrix'])
                np.testing.assert_allclose(matrix @ matrix.T, np.eye(2), atol=1e-10)
                self.assertGreater(p['uniformScalePerSourcePixel'], 0)
                self.assertTrue(np.isfinite(r['mesh']['positions']).all())
            if s['placement']['method'] == 'member-extent':
                p = records[0]['registration']['placement']
                # A long thin drawing cannot grow several times larger merely
                # because its short axis cannot contain the whole star group.
                measured = p['sourceExtentPixels'] * p['uniformScalePerSourcePixel']
                if not p['minimumExtentApplied']:
                    self.assertLessEqual(measured, p['memberDiameterPlane'] * 1.13, s['imageId'])
                    self.assertGreaterEqual(measured, p['memberDiameterPlane'], s['imageId'])
                else:
                    self.assertAlmostEqual(2 * math.degrees(math.atan(measured / 2)), p['minimumAngularDiameterDegrees'], places=7)

    def test_bow_arrow_tip_and_tail_follow_the_actual_stellar_arrow(self):
        r = next(r for r in MANIFEST['images'] if r['imageId'] == 'asterism-097')
        placed, project = transform(r)
        # Independently inspected pixels: actual tip and shaft nock, not the
        # diagonal bow axis or the bounding rectangle of the arrow feathers.
        tip, tail = placed([232,158]), placed([1257,852])
        np.testing.assert_allclose(tip, project(34444), atol=1e-10)
        np.testing.assert_allclose(tail, project(37819), atol=1e-10)
        self.assertLess(dot_angle(tip-tail, project(32349)-tip), 5)
        self.assertNotIn(32349, next(a for a in CATALOG['asterisms'] if a['id']=='097')['primaryMemberHips'])

    def test_semantic_head_tail_axes_cannot_silently_flip(self):
        for s in CONFIG['images']:
            p = s['placement']
            if not p.get('targetAxisHips'):
                continue
            r = next(r for r in MANIFEST['images'] if r['original'] == s['sourceFile'])
            placed, project = transform(r)
            src = placed(p['sourceAxisPixels'][1]) - placed(p['sourceAxisPixels'][0])
            center = np.array(r['registration']['placement']['center'])
            east = np.array(r['registration']['placement']['east'])
            north = np.array(r['registration']['placement']['north'])
            directions = [art.unit(np.sum([art.vector(*HIP[h][1:3]) for h in group], axis=0)) for group in p['targetAxisHips']]
            target = [np.array([east @ v, north @ v]) / (center @ v) for v in directions]
            self.assertLess(dot_angle(src, target[1]-target[0]), .001, s['imageId'])

    def test_single_star_size_does_not_invent_a_stellar_direction(self):
        for s in CONFIG['images']:
            if s['placement']['method'] != 'member-extent':
                continue
            r = next(r for r in MANIFEST['images'] if r['original'] == s['sourceFile'])
            p = r['registration']['placement']
            if p['primaryMemberCount'] == 1:
                self.assertTrue(p['minimumExtentApplied'])
                self.assertEqual(p['axisPolicy'], 'north-up-visual-design')
                self.assertEqual(r['anchors'], [])


if __name__ == '__main__':
    unittest.main()
