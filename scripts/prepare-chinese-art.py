#!/usr/bin/env python3
"""Place unchanged illustrations with one equal-scale celestial similarity.

Real members establish an overall centre, direction and angular extent. Image
features are approximate semantic correspondences, not a claim that every star
coincides with the drawing. No local warp, shear or unequal scaling is allowed.
The explicit UV mesh preserves the same gnomonic projection in every view.
"""
import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'assets/chinese-sky/art'
REPORTS = ROOT / 'output/release121'
# One restored gnomonic plane is exact between vertices. This coarse grid is
# only for bounded tiles and diagnostics, not an approximation of a curved warp.
GRID = 5
THEMES = {
    'azure-dragon': 'azuredragon', 'white-tiger': 'whitetiger',
    'vermilion-bird': 'vermilionbird', 'black-tortoise': 'blacktortoise',
}
SMALL = {'northern-dipper': '北斗', 'weaving-maiden': '织女', 'river-drum': '河鼓', 'celestial-wolf': '天狼'}


def unit(value):
    value = np.asarray(value, dtype=float)
    length = np.linalg.norm(value, axis=-1, keepdims=True)
    if np.any(length < 1e-12):
        raise ValueError('Degenerate physical direction')
    return value / length


def vector(ra, dec):
    r, d = math.radians(ra), math.radians(dec)
    return np.array([math.cos(d) * math.cos(r), math.cos(d) * math.sin(r), math.sin(d)])


def area(a, b, c):
    return float((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))


def visible_subject_diameter(image, threshold=32):
    """Maximum separation of visible alpha pixels, excluding transparent margins.

    Each convex-hull vertex is a row's first/last opaque pixel. This is exact
    at source resolution and avoids a quadratic comparison of all image pixels.
    """
    mask = np.asarray(image.getchannel('A')) > threshold
    rows = np.flatnonzero(mask.any(axis=1))
    if not len(rows):
        raise ValueError('The source illustration has no visible subject')
    left = mask[rows].argmax(axis=1)
    right = mask.shape[1] - 1 - mask[rows, ::-1].argmax(axis=1)
    points = sorted(set(zip(left.tolist(), rows.tolist())) | set(zip(right.tolist(), rows.tolist())))
    def half(values):
        hull = []
        for point in values:
            while len(hull) >= 2 and area(np.asarray(hull[-2]), np.asarray(hull[-1]), np.asarray(point)) <= 0:
                hull.pop()
            hull.append(point)
        return hull
    hull = np.asarray(half(points)[:-1] + half(reversed(points))[:-1], dtype=float)
    if len(hull) < 2:
        raise ValueError('The visible subject has no measurable extent')
    return float(np.max(np.linalg.norm(hull[:, None] - hull[None, :], axis=2)))


def similarity(source, target, *, mirror='auto', scale_mode='least-squares'):
    x, y = np.asarray(source), np.asarray(target)
    xc, yc = x.mean(axis=0), y.mean(axis=0)
    x0, y0 = x - xc, y - yc
    u, singular, vt = np.linalg.svd(x0.T @ y0)
    signs = np.ones(2)
    if mirror != 'auto' and (np.linalg.det(u @ vt) < 0) != bool(mirror):
        signs[-1] = -1
    rotation = u @ np.diag(signs) @ vt
    scale = (math.sqrt(float(np.sum(y0 * y0)) / float(np.sum(x0 * x0)))
             if scale_mode == 'rms-extent' else float(np.dot(singular, signs)) / float(np.sum(x0 * x0)))
    if not np.isfinite(scale) or scale <= 1e-10:
        raise ValueError('The real landmarks do not establish a usable scale')
    return Similarity(xc, yc, rotation, scale)


class Similarity:
    def __init__(self, source_origin, target_origin, orthogonal, scale):
        self.source_origin = np.asarray(source_origin, dtype=float)
        self.target_origin = np.asarray(target_origin, dtype=float)
        self.orthogonal = np.asarray(orthogonal, dtype=float)
        self.scale = float(scale)
        if not np.isfinite(self.scale) or self.scale <= 1e-10:
            raise ValueError('The placement must have a finite positive uniform scale')
        if not np.allclose(self.orthogonal @ self.orthogonal.T, np.eye(2), atol=1e-10):
            raise ValueError('Only a rotation and optional global reflection are permitted')

    def __call__(self, points):
        return (np.asarray(points) - self.source_origin) @ self.orthogonal * self.scale + self.target_origin

    def metadata(self, pixel_scale):
        return {'sourceOrigin': (self.source_origin * pixel_scale).tolist(),
                'targetOriginPlane': self.target_origin.tolist(),
                'orthogonalMatrix': self.orthogonal.tolist(),
                'uniformScalePerSourcePixel': self.scale / pixel_scale,
                'mirrored': bool(np.linalg.det(self.orthogonal) < 0)}


def circumcircle(a, b, c):
    ax, ay = a; bx, by = b; cx, cy = c
    det = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(det) < 1e-16:
        return None
    aa, bb, cc = ax * ax + ay * ay, bx * bx + by * by, cx * cx + cy * cy
    x = (aa * (by - cy) + bb * (cy - ay) + cc * (ay - by)) / det
    y = (aa * (cx - bx) + bb * (ax - cx) + cc * (bx - ax)) / det
    return x, y, (x - ax) ** 2 + (y - ay) ** 2


def triangulate(points):
    """Bowyer-Watson Delaunay; no new runtime or preparation dependency."""
    points = [tuple(map(float, point)) for point in points]
    count = len(points)
    points.extend([(-16, -16), (32, -16), (-16, 32)])
    triangles = [(count, count + 1, count + 2)]
    circles = [circumcircle(*(points[i] for i in triangles[0]))]
    for index in range(count):
        x, y = points[index]
        bad = {i for i, circle in enumerate(circles)
               if (x - circle[0]) ** 2 + (y - circle[1]) ** 2 <= circle[2] + 1e-12}
        boundary = {}
        for i in bad:
            a, b, c = triangles[i]
            for edge in [(a, b), (b, c), (c, a)]:
                key = tuple(sorted(edge))
                if key in boundary:
                    del boundary[key]
                else:
                    boundary[key] = edge
        triangles = [triangle for i, triangle in enumerate(triangles) if i not in bad]
        circles = [circle for i, circle in enumerate(circles) if i not in bad]
        for a, b in boundary.values():
            if abs(area(points[a], points[b], points[index])) < 1e-14:
                continue
            if area(points[a], points[b], points[index]) < 0:
                a, b = b, a
            triangle = (a, b, index)
            circle = circumcircle(*(points[i] for i in triangle))
            if circle:
                triangles.append(triangle); circles.append(circle)
    result = [triangle for triangle in triangles if max(triangle) < count]
    if set(itertools.chain.from_iterable(result)) != set(range(count)):
        raise ValueError('Delaunay triangulation dropped an explicit mesh vertex')
    return result


def object_records(catalog, specification):
    if isinstance(specification, dict):
        identifiers = specification.get('targetIds')
        if identifiers:
            lookup = {record['targetId']: record for record in catalog['asterisms']}
            return [lookup[identifier] for identifier in identifiers]
        if specification.get('groupId'):
            return [record for record in catalog['asterisms'] if record['groupId'] == specification['groupId']]
        name = specification['imageId']
    else:
        name = specification
    if name in SMALL:
        return [next(record for record in catalog['asterisms'] if record['zh'] == SMALL[name])]
    result = []
    for group in catalog['groups']:
        if group['theme'] != THEMES[name]:
            continue
        base = group['zh'].removesuffix('宿')
        candidates = [record for record in catalog['asterisms'] if record['groupId'] == group['id']]
        result.append(next(record for record in candidates if record['zh'] in (base, base + '宿')))
    return result


def placement_members(spec, catalog, hip):
    records = object_records(catalog, spec)
    physical = {}
    for record in records:
        selected = {f'hip:{value}' for value in record.get('primaryMemberHips', [])}
        selected.update(record.get('primaryMemberObjectIds', []))
        for member in record.get('members', []):
            if member['physicalId'] in selected:
                physical[member['physicalId']] = member
        for value in record.get('primaryMemberHips', []):
            if value in hip:
                row = hip[value]
                physical[f'hip:{value}'] = {'physicalId': f'hip:{value}', 'ra': row[1], 'dec': row[2]}
    if not physical:
        raise ValueError('The target has no verified primary physical members')
    return physical


def registration(spec, hip, catalog=None):
    source_size = spec['sourcePixelSize']
    scale = max(source_size)
    true = []
    for point in spec.get('landmarks', []):
        if len(point['pos']) != 2 or not all(np.isfinite(value) and 0 <= value <= source_size[i] for i, value in enumerate(point['pos'])):
            raise ValueError('A real semantic landmark must lie inside its source PNG')
        row = hip[point['hip']]
        true.append({**point, 'physicalId': 'hip:' + str(point['hip']),
                     'direction': vector(row[1], row[2]), 'virtual': False})
    placement = spec.get('placement', {})
    method = placement.get('method', 'similarity')
    members = placement_members(spec, catalog, hip) if catalog is not None else {}
    member_directions = np.asarray([vector(member['ra'], member['dec']) for member in members.values()])
    if method == 'member-extent':
        if not len(member_directions):
            raise ValueError('Member-extent placement requires the physical culture catalogue')
        center = unit(np.sum(member_directions, axis=0))
    else:
        if not true:
            raise ValueError('A semantic similarity requires explicitly declared source landmarks')
        center = unit(np.sum([point['direction'] for point in true], axis=0))
    ra = math.atan2(center[1], center[0])
    east = np.array([-math.sin(ra), math.cos(ra), 0])
    north = unit(np.cross(center, east))

    def to_plane(direction):
        z = float(np.dot(center, direction))
        if z <= .06:
            raise ValueError('A semantic landmark is too close to the tangent horizon')
        return np.array([np.dot(east, direction) / z, np.dot(north, direction) / z])

    source = [np.array(point['pos'], dtype=float) / scale for point in true]
    target = [to_plane(point['direction']) for point in true]
    virtual = []
    for guide in spec.get('virtualGuides', []):
        if len(true) != 1:
            raise ValueError('Relative virtual guides currently require one real star')
        offset = np.tan(np.radians(guide['tangentOffsetDegrees']))
        virtual.append({**guide, 'virtual': True, 'notAstronomicalAnchor': True,
                        'plane': target[0] + offset})
    for guide in virtual:
        source.append(np.asarray(guide['pos'], dtype=float) / scale)
        target.append(np.asarray(guide['plane'], dtype=float))
        guide['direction'] = unit(center + guide['plane'][0] * east + guide['plane'][1] * north)
    axis_metadata = {}
    if method == 'member-extent':
        source_axis_pixels = np.asarray(placement['sourceAxisPixels'], dtype=float)
        a = source_axis_pixels[1] - source_axis_pixels[0]
        if np.linalg.norm(a) < 1e-8:
            raise ValueError('A declared visual body axis must have a nonzero length')
        a = a / np.linalg.norm(a)
        member_planes = np.asarray([to_plane(direction) for direction in member_directions])
        if placement.get('targetAxisHips'):
            target_endpoints = [to_plane(unit(np.sum([vector(*hip[value][1:3]) for value in group], axis=0)))
                                for group in placement['targetAxisHips']]
            b = target_endpoints[1] - target_endpoints[0]
            b = b / np.linalg.norm(b)
            axis_policy, axis_ratio = 'declared-real-member-axis', None
        else:
            centered = member_planes - member_planes.mean(axis=0)
            eigenvalues, eigenvectors = np.linalg.eigh(centered.T @ centered)
            axis_ratio = float(eigenvalues[-1] / max(eigenvalues[0], 1e-16))
            if placement.get('orientation') == 'north-up' or axis_ratio < placement.get('minimumAxisRatio', 2.0):
                # Image right points west and image up points north. A near-round
                # group has no scientifically privileged long-axis direction.
                b = -a
                axis_policy = 'north-up-visual-design'
            else:
                b = eigenvectors[:, -1]
                # A PCA has no head/tail. Choose the sign that rotates the
                # authored pose least from celestial north-up; semantic axes
                # above take precedence whenever the endpoints are known.
                if np.dot(b, -a) < 0:
                    b = -b
                axis_policy = 'verified-primary-member-pca-minimum-rotation'
        parity = -1 if placement.get('mirror', False) else 1
        source_basis = np.asarray([a, [-a[1], a[0]]])
        target_basis = np.asarray([b, np.asarray([-b[1], b[0]]) * parity])
        rotation = source_basis.T @ target_basis
        bounds = np.asarray(placement['sourceVisibleBox'], dtype=float)
        corners = np.asarray([[bounds[0], bounds[1]], [bounds[2], bounds[1]],
                              [bounds[2], bounds[3]], [bounds[0], bounds[3]]]) / scale
        # Use the actual source-image rectangle, not the larger rectangle around
        # its rotated corners; otherwise a quoted coverage could include stars
        # outside the PNG itself.
        source_aligned = corners
        target_aligned = member_planes @ rotation.T
        source_min, source_max = source_aligned.min(axis=0), source_aligned.max(axis=0)
        target_min, target_max = target_aligned.min(axis=0), target_aligned.max(axis=0)
        source_span, target_span = source_max - source_min, target_max - target_min
        padding = placement.get('coveragePadding', 1.08)
        member_diameter = float(np.max(np.linalg.norm(member_planes[:, None] - member_planes[None, :], axis=2)))
        source_diameter = float(placement.get('sourceExtentPixels', max(bounds[2:] - bounds[:2]))) / scale
        if not math.isfinite(source_diameter) or source_diameter <= 0:
            raise ValueError('The visible subject diameter must be finite and positive')
        # An illustration is not a stellar boundary. Requiring every member to
        # fit inside both axes of a thin drawing inflated some images 4–7x.
        # Match the overall spans instead; local stars may lie outside the art.
        uniform_scale = member_diameter / source_diameter * padding
        minimum_diameter = float(placement.get('minimumAngularDiameterDegrees', 0))
        if not math.isfinite(minimum_diameter) or not 0 <= minimum_diameter < 90:
            raise ValueError('Minimum visual angular diameter must be finite and in [0, 90) degrees')
        # A single real member has no astronomical extent. Give only the image
        # an explicit modern visual size; never invent additional stellar anchors.
        minimum_scale = 2 * math.tan(math.radians(minimum_diameter) / 2) / source_diameter
        minimum_extent_applied = bool(uniform_scale < minimum_scale)
        uniform_scale = max(uniform_scale, minimum_scale)
        source_origin = (source_min + source_max) / 2
        target_origin = (target_min + target_max) / 2 @ rotation
        fit = Similarity(source_origin, target_origin, rotation, uniform_scale)
        covered = (member_planes - target_origin) @ rotation.T
        half = source_span * uniform_scale / 2
        axis_metadata = {'axisPolicy': axis_policy, 'axisRole': placement.get('axisRole', 'Declared source subject axis'),
                         'sourceAxisPixels': source_axis_pixels.tolist(),
                         'targetAxisHips': placement.get('targetAxisHips'),
                         'targetAxisPlane': b.tolist(), 'memberPcaEigenvalueRatio': axis_ratio,
                         'targetExtentInSourceBasis': [target_min.tolist(), target_max.tolist()],
                         'sourceVisibleBox': bounds.tolist(), 'coveragePadding': padding,
                         'scalePolicy': 'visible-subject-diameter',
                         'sourceExtentPixels': source_diameter * scale,
                         'memberDiameterPlane': member_diameter,
                         'illustrationDiameterPlane': source_diameter * uniform_scale,
                         'minimumAngularDiameterDegrees': minimum_diameter,
                         'minimumExtentApplied': minimum_extent_applied,
                         'minimumExtentBasis': 'modern-layout' if minimum_diameter else None,
                         'coveredPrimaryMembers': int(np.sum(np.all(np.abs(covered) <= half + 1e-12, axis=1))),
                         'primaryMemberCount': len(member_planes),
                         'axisErrorDegrees': math.degrees(math.acos(float(np.clip(np.dot(a @ rotation, b), -1, 1)))),
                         'centerResidualPlane': float(np.linalg.norm(fit([source_origin])[0] - target_origin))}
        for point, role in [(source_origin * scale, 'Visual extent centre'),
                            (source_axis_pixels[0], 'Visual body-axis start'), (source_axis_pixels[1], 'Visual body-axis end')]:
            plane = fit([np.asarray(point) / scale])[0]
            virtual.append({'pos': point.tolist(), 'plane': plane, 'virtual': True,
                            'notAstronomicalAnchor': True, 'basis': 'modern-layout', 'role': role,
                            'direction': unit(center + plane[0] * east + plane[1] * north)})
            source.append(np.asarray(point) / scale)
    elif method == 'center-axis':
        origin = np.asarray(placement['sourceOrigin'], dtype=float) / scale
        tip = np.asarray(placement['sourceTip'], dtype=float) / scale
        target_origin_direction = unit(np.sum([vector(*hip[value][1:3]) for value in placement['targetOriginHips']], axis=0))
        target_tip_direction = unit(np.sum([vector(*hip[value][1:3]) for value in placement['targetTipHips']], axis=0))
        target_origin, target_tip = to_plane(target_origin_direction), to_plane(target_tip_direction)
        source_axis, target_axis = tip - origin, target_tip - target_origin
        source_length, target_length = np.linalg.norm(source_axis), np.linalg.norm(target_axis)
        if min(source_length, target_length) < 1e-8:
            raise ValueError('Declared source and physical axes must have a nonzero length')
        a, b = source_axis / source_length, target_axis / target_length
        source_basis = np.asarray([a, [-a[1], a[0]]])
        candidates = []
        for reflected in (False, True):
            if placement.get('mirror', 'auto') != 'auto' and reflected != bool(placement['mirror']):
                continue
            target_basis = np.asarray([b, np.asarray([-b[1], b[0]]) * (-1 if reflected else 1)])
            candidate = Similarity(origin, target_origin, source_basis.T @ target_basis, target_length / source_length)
            candidates.append((float(np.sum((candidate(source) - np.asarray(target)) ** 2)), candidate))
        fit = min(candidates, key=lambda item: item[0])[1]
        axis_metadata = {'sourceAxisTip': (tip * scale).tolist(),
                         'targetOriginDirection': target_origin_direction.tolist(),
                         'targetAxisTipDirection': target_tip_direction.tolist(),
                         'targetOriginHips': placement['targetOriginHips'],
                         'targetTipHips': placement['targetTipHips']}
        for pos, plane, role in [(origin, target_origin, 'Declared overall pivot: member-group centre'),
                                 (tip, target_tip, 'Declared overall axis endpoint')]:
            virtual.append({'pos': (pos * scale).tolist(), 'plane': plane, 'virtual': True,
                            'notAstronomicalAnchor': True, 'basis': 'modern-layout', 'role': role,
                            'direction': unit(center + plane[0] * east + plane[1] * north)})
            source.append(pos)
    elif method == 'similarity':
        if len(source) < 2:
            raise ValueError('One real star requires explicitly declared visual orientation/scale guides')
        fit = similarity(source, target, mirror=placement.get('mirror', 'auto'),
                         scale_mode=placement.get('scaleMode', 'least-squares'))
    else:
        raise ValueError('Unsupported rigid placement method: ' + method)
    # The physical targets remain evidence. Placed directions are deliberately
    # distinct: an unchanged silhouette need not pass through every real star.
    residuals = []
    for point in true:
        plane = fit([np.asarray(point['pos']) / scale])[0]
        placed = unit(center + plane[0] * east + plane[1] * north)
        target_direction = point['direction']
        residual = math.degrees(math.atan2(np.linalg.norm(np.cross(placed, target_direction)), np.dot(placed, target_direction)))
        residuals.append(residual)
        point.update({'direction': placed, 'targetDirection': target_direction,
                      'angularResidualDegrees': residual, 'correspondence': 'approximate-overall-placement'})
    extent = np.asarray(source_size) / scale
    coordinates, keys = [], {}

    def insert(point):
        key = tuple(round(float(value), 12) for value in point)
        if key not in keys:
            keys[key] = len(coordinates); coordinates.append(np.asarray(point))
        return keys[key]

    # Control landmarks come first and cannot be replaced by a nearby grid node.
    for point in source:
        insert(point)
    for y in np.linspace(0, extent[1], GRID):
        for x in np.linspace(0, extent[0], GRID):
            point = np.array([x, y])
            if any(np.linalg.norm(point - control) < 1e-7 for control in source):
                continue
            insert(point)
    coordinates = np.asarray(coordinates)
    planes = fit(coordinates)
    triangles = triangulate(coordinates)
    areas = np.asarray([area(planes[a], planes[b], planes[c]) for a, b, c in triangles])
    orientation = 1 if np.median(areas) > 0 else -1
    # Every triangle shares this one Jacobian; nonuniform shape deformation is
    # impossible in the preparation model, including across split-image seams.
    singular = np.linalg.svd(fit.orthogonal * fit.scale, compute_uv=False)
    ratio = float(singular[0] / singular[1])
    diagnostics = {'method': 'uniform-similarity-gnomonic', 'placementMethod': method,
                   'shapePreserved': True, 'individualStarsPinned': False,
                   'realLandmarks': len(true), 'virtualGuides': len(virtual),
                   'grid': GRID, 'globalVertices': len(coordinates), 'globalTriangles': len(triangles),
                   'orientation': 'preserved' if orientation > 0 else 'reflected',
                   'flippedTriangles': int(np.sum(areas * orientation <= 1e-13)),
                   'minimumTriangleArea': float(np.min(np.abs(areas))),
                   'maximumScaleRatio': ratio, 'p95ScaleRatio': ratio,
                   'foldedJacobianSamples': 0,
                   'rmsLandmarkResidualDegrees': math.sqrt(float(np.mean(np.square(residuals)))) if residuals else None,
                   'maximumLandmarkResidualDegrees': max(residuals) if residuals else None,
                   'placement': {**fit.metadata(scale), **axis_metadata,
                                 'center': center.tolist(), 'east': east.tolist(), 'north': north.tolist()}}
    if diagnostics['flippedTriangles'] or abs(ratio - 1) > 1e-10:
        raise RegistrationError('Rigid placement contains a fold or unequal scale', diagnostics)
    global_controls = []
    for point in true + virtual:
        global_controls.append({k: (v.tolist() if isinstance(v, np.ndarray) else v)
                                for k, v in point.items() if k != 'plane'})
    return coordinates, planes, triangles, true, virtual, center, east, north, diagnostics, global_controls


class RegistrationError(ValueError):
    def __init__(self, message, diagnostics):
        super().__init__(message); self.diagnostics = diagnostics


def clip_polygon(polygon, axis, bound, greater):
    output = []
    for current, following in zip(polygon, polygon[1:] + polygon[:1]):
        a, b = current[axis] - bound, following[axis] - bound
        inside_a = a >= -1e-12 if greater else a <= 1e-12
        inside_b = b >= -1e-12 if greater else b <= 1e-12
        if inside_a:
            output.append(current)
        if inside_a != inside_b:
            fraction = a / (a - b)
            vertex = current + fraction * (following - current)
            vertex[axis] = bound
            output.append(vertex)
    return output


def write_artwork(spec, catalog, hip, *, geometry_only=False):
    name = spec['imageId']
    original = ART / spec['sourceFile']
    image = Image.open(original).convert('RGBA')
    if list(image.size) != spec['sourcePixelSize']:
        raise ValueError(name + ': source PNG dimensions changed; landmarks need review')
    records = object_records(catalog, spec)
    primary_hips = {value for record in records for value in record.get('primaryMemberHips', record.get('lineMemberHips', []))}
    if any(point['hip'] not in primary_hips for point in spec.get('landmarks', [])):
        raise ValueError(name + ': every true image landmark must be a verified primary member')
    placement = spec.get('placement', {})
    axis_hips = [value for group in placement.get('targetAxisHips', []) for value in group]
    axis_hips += placement.get('targetOriginHips', []) + placement.get('targetTipHips', [])
    if any(value not in primary_hips for value in axis_hips):
        raise ValueError(name + ': declared physical axis endpoints must be verified primary members')
    control_hash = hashlib.sha256(json.dumps(spec, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    coords, planes, triangles, true, virtual, center, east, north, diagnostics, global_controls = registration(spec, hip, catalog)
    source_width, source_height = image.size; source_scale = max(image.size)
    large = spec.get('kind', 'symbols' if name in THEMES else 'asterisms') == 'symbols'
    image.thumbnail((1024, 768) if large else (640, 640), Image.Resampling.LANCZOS)
    width, height = image.size
    parts_x, parts_y = (3, 1) if large and width > height * 1.5 else (2, 2) if large else (1, 1)
    result = []
    for y in range(parts_y):
        for x in range(parts_x):
            box = (round(x * width / parts_x), round(y * height / parts_y),
                   round((x + 1) * width / parts_x), round((y + 1) * height / parts_y))
            tile = image.crop(box)
            if not tile.getchannel('A').getbbox():
                continue
            left, top = box[0] / width * source_width / source_scale, box[1] / height * source_height / source_scale
            right, bottom = box[2] / width * source_width / source_scale, box[3] / height * source_height / source_scale
            vertices, uv, directions, keys, faces = [], [], [], {}, []

            def insert(point):
                key = tuple(round(float(value), 12) for value in point[:2])
                if key not in keys:
                    keys[key] = len(vertices); vertices.append(point[:2])
                    direction = unit(center + point[2] * east + point[3] * north)
                    directions.append(direction.tolist())
                    u = (point[0] - left) / (right - left)
                    v = (point[1] - top) / (bottom - top)
                    uv.append([float(np.clip(u, 0, 1)), float(np.clip(1 - v, 0, 1))])
                return keys[key]

            for triangle in triangles:
                polygon = [np.concatenate([coords[i], planes[i]]) for i in triangle]
                for axis, bound, greater in [(0, left, True), (0, right, False), (1, top, True), (1, bottom, False)]:
                    if not polygon: break
                    polygon = clip_polygon(polygon, axis, bound, greater)
                if len(polygon) < 3: continue
                for i in range(1, len(polygon) - 1):
                    a, b, c = polygon[0], polygon[i], polygon[i + 1]
                    if abs(area(a[:2], b[:2], c[:2])) < 1e-13: continue
                    faces.extend([insert(a), insert(b), insert(c)])
            if len(vertices) > 16384 or len(faces) > 32768 * 3:
                raise ValueError(name + ': registered mesh exceeds renderer budget')
            controls = []
            for point in true + virtual:
                p = np.asarray(point['pos']) / source_scale
                if not (left - 1e-12 <= p[0] <= right + 1e-12 and top - 1e-12 <= p[1] <= bottom + 1e-12): continue
                vertex = keys.get(tuple(round(float(value), 12) for value in p))
                if vertex is None:
                    raise ValueError(name + ': source landmark is not an actual patch vertex')
                pixel = [(p[0] - left) / (right - left) * tile.width,
                         (p[1] - top) / (bottom - top) * tile.height]
                control = {k: (v.tolist() if isinstance(v, np.ndarray) else v)
                           for k, v in point.items() if k not in ('pos', 'plane', 'direction')}
                control.update({'pixel': pixel, 'vertex': vertex,
                                'direction': point['direction'].tolist()})
                controls.append(control)
            actual = [point for point in controls if not point['virtual']]
            # Retain only identifiable source-image stars inside this patch.
            # Mesh registration does not need an artificial three-anchor fit.
            anchors = [{**{k: v for k, v in point.items() if k != 'pixel'},
                        'pos': point['pixel']} for point in actual]
            image_id = name + (f'-{x}-{y}' if large else '')
            file = ART / (image_id + '.avif')
            if geometry_only:
                if not file.exists() or Image.open(file).size != tile.size:
                    raise ValueError(name + ': geometry-only preparation requires the existing matching texture')
            else:
                tile.save(file, quality=92, speed=6, subsampling='4:4:4', alpha_premultiplied=False)
            result.append({'imageId': image_id, 'file': str(file.relative_to(ROOT)),
                           'width': tile.width, 'height': tile.height, 'size': list(tile.size),
                           'anchors': anchors, 'mesh': {'positions': [round(value, 12) for row in directions for value in row],
                                                       'uv': [round(value, 12) for row in uv for value in row], 'indices': faces,
                                                       'planeNormal': center.tolist()},
                           'kind': 'symbols' if large else 'asterisms',
                           **{key: spec[key] for key in ('names', 'meaning', 'themeStatus', 'basis',
                                                         'historicalImageReconstruction', 'interpretationCaution', 'colorMode')
                              if key in spec},
                           'targetIds': [record['targetId'] for record in records],
                           **({'groupId': spec['groupId']} if spec.get('groupId') else {}),
                           'opacity': spec.get('opacity', .14 if large else .19), 'tint': '#d6c5a1',
                           'modernInterpretation': True, 'original': original.name,
                           'originalSha256': hashlib.sha256(original.read_bytes()).hexdigest(),
                           'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'bytes': file.stat().st_size,
                           'registration': {'schema': 'starorbit-art-registration-2',
                                            'method': diagnostics['method'],
                                            'placement': diagnostics['placement'],
                                            'pixelOrigin': 'top-left', 'frame': 'ICRS/J2000', 'sourceControlSha256': control_hash,
                                            'landmarks': actual,
                                            'virtualGuides': [point for point in controls if point['virtual']],
                                            'sourcePixelSize': spec['sourcePixelSize'],
                                            'sourceBox': [box[0] / width * source_width, box[1] / height * source_height, box[2] / width * source_width, box[3] / height * source_height],
                                            'encodedImageSize': [width, height], 'encodedSourceBox': list(box),
                                            'globalLandmarks': global_controls if x == 0 and y == 0 else [],
                                            'diagnostics': diagnostics}})
    if not result:
        raise ValueError(name + ': the source image has no visible registered patches')
    report = {'imageId': name, 'status': 'passed', **diagnostics,
              'patches': len(result), 'patchVertices': sum(len(record['mesh']['positions']) // 3 for record in result),
              'bytes': sum(record['bytes'] for record in result), 'visualReview': 'pending',
              'landmarks': global_controls}
    return result, report


def write_guides(specifications, catalog, hip):
    """Draw exact sky geometry for a constrained redraw; original art is untouched."""
    REPORTS.mkdir(parents=True, exist_ok=True)
    width, height = 1536, 1024
    plot = (60, 90, 1140, 930)
    fonts = [Path('/System/Library/Fonts/PingFang.ttc'), Path('/System/Library/Fonts/STHeiti Medium.ttc'), Path('/System/Library/Fonts/Supplemental/Arial Unicode.ttf')]
    font_file = next((str(path) for path in fonts if path.exists()), None)
    def font(size):
        return ImageFont.truetype(font_file or 'DejaVuSans.ttf', size)
    title_font, label_font, body_font, small_font = font(27), font(20), font(19), font(16)
    result = []
    for spec in specifications:
        name = spec['imageId']
        if name not in THEMES:
            continue
        controls = []
        for i, point in enumerate(spec['landmarks']):
            row = hip[point['hip']]
            controls.append({**point, 'letter': chr(65 + i), 'physicalId': 'hip:' + str(point['hip']),
                             'direction': vector(row[1], row[2])})
        center = unit(np.sum([point['direction'] for point in controls], axis=0))
        ra = math.atan2(center[1], center[0])
        east = np.array([-math.sin(ra), math.cos(ra), 0])
        right = -east
        north = unit(np.cross(center, east))
        def project(direction):
            denominator = float(np.dot(center, direction))
            if denominator <= .06:
                raise ValueError(name + ': a guide member crosses the tangent horizon')
            return np.array([np.dot(right, direction) / denominator, np.dot(north, direction) / denominator])
        records = object_records(catalog, spec)
        members = {}
        for record in records:
            hips = set(record.get('primaryMemberHips', record.get('lineMemberHips', [])))
            objects = set(record.get('primaryMemberObjectIds', record.get('lineMemberObjectIds', [])))
            for member in record['members']:
                if member['id'] in hips or member['physicalId'] in objects:
                    members[member['physicalId']] = member
        directions = {key: vector(member['ra'], member['dec']) for key, member in members.items()}
        points = [project(direction) for direction in directions.values()] + [project(point['direction']) for point in controls]
        points = np.asarray(points)
        minimum, maximum = points.min(axis=0), points.max(axis=0)
        midpoint = (minimum + maximum) / 2
        scale = min((plot[2] - plot[0]) / max(1e-8, (maximum[0] - minimum[0]) * 1.30),
                    (plot[3] - plot[1]) / max(1e-8, (maximum[1] - minimum[1]) * 1.42))
        pixel_center = np.array([(plot[0] + plot[2]) / 2, (plot[1] + plot[3]) / 2])
        def pixel(direction):
            point = project(direction) - midpoint
            return [float(pixel_center[0] + point[0] * scale), float(pixel_center[1] - point[1] * scale)]
        canvas = Image.new('RGB', (width, height), '#02050a')
        draw = ImageDraw.Draw(canvas)
        draw.text((60, 25), name.upper() + '  /  J2000 TRUE STELLAR GEOMETRY', fill='#dce4ee', font=title_font)
        draw.text((60, 61), 'North up / East left / one equal-scale gnomonic projection / stars must remain fixed', fill='#93a1b5', font=small_font)
        draw.rectangle(plot, outline='#27303f', width=1)
        lines = []
        for record in records:
            for path in record['lines']:
                polyline = [pixel(vector(*coordinate)) for coordinate in path]
                if len(polyline) > 1:
                    draw.line([tuple(point) for point in polyline], fill='#687787', width=2)
                    lines.append(polyline)
        core = []
        for key, direction in directions.items():
            member = members[key]
            x, y = pixel(direction)
            radius = max(2.3, min(5, 5 - (member.get('mag') or 3) * .38))
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill='#b8c2d1')
            core.append({'physicalId': key, 'pixel': [x, y], 'direction': direction.tolist(), 'hip': member['id'] if isinstance(member['id'], int) else None})
        occupied = []
        for point in controls:
            x, y = pixel(point['direction'])
            draw.ellipse((x - 9, y - 9, x + 9, y + 9), outline='#ffd84f', width=3)
            draw.line((x - 12, y, x + 12, y), fill='#ffd84f', width=2)
            draw.line((x, y - 12, x, y + 12), fill='#ffd84f', width=2)
            text = point['letter'] + '  ' + str(point['hip'])
            bbox = draw.textbbox((0, 0), text, font=label_font); tw, th = bbox[2], bbox[3] - bbox[1]
            choices = [(x + 15, y - 30), (x + 15, y + 12), (x - tw - 15, y - 30), (x - tw - 15, y + 12), (x - tw / 2, y - 48)]
            chosen = choices[0]
            for candidate in choices:
                rect = (candidate[0], candidate[1], candidate[0] + tw + 6, candidate[1] + th + 8)
                overlaps = any(rect[0] < old[2] + 5 and rect[2] > old[0] - 5 and rect[1] < old[3] + 5 and rect[3] > old[1] - 5 for old in occupied)
                if not overlaps and plot[0] <= rect[0] and rect[2] <= plot[2] and plot[1] <= rect[1] and rect[3] <= plot[3]:
                    chosen = candidate; occupied.append(rect); break
            draw.rectangle((chosen[0] - 3, chosen[1] - 3, chosen[0] + tw + 4, chosen[1] + th + 9), fill='#02050a')
            draw.text(chosen, text, fill='#ffe46b', font=label_font)
            point['guidePixel'] = [x, y]
        draw.text((1170, 96), 'SEMANTIC CONTROLS', fill='#ffe46b', font=label_font)
        y = 138
        for point in controls:
            draw.text((1170, y), point['letter'] + '  HIP ' + str(point['hip']), fill='#ffe46b', font=body_font)
            role = point['role']
            for start in range(0, len(role), 16):
                y += 24
                draw.text((1170, y), role[start:start + 16], fill='#aebbcf', font=body_font)
            y += 33
        draw.text((60, 954), 'Gray: identified principal members and sourced edges. Yellow: exact stars assigned to the modern image features.', fill='#97a8bf', font=small_font)
        draw.text((60, 980), 'The illustration may be redesigned around this fixed skeleton; no rotation, unequal scaling, invented stars or displaced controls.', fill='#97a8bf', font=small_font)
        filename = REPORTS / (name + '-stellar-guide.png')
        canvas.save(filename)
        result.append({'imageId': name, 'file': str(filename), 'canvasSize': [width, height],
                       'center': center.tolist(), 'right': right.tolist(), 'north': north.tolist(),
                       'scale': float(scale), 'planeCenter': midpoint.tolist(),
                       'pixelCenter': pixel_center.tolist(), 'plotBounds': list(plot),
                       'pixelOrigin': 'top-left', 'planeUnits': 'gnomonic tangent ratios',
                       'projection': 'x=pixelCenter.x+scale*(dot(right,d)/dot(center,d)-planeCenter.x); y=pixelCenter.y-scale*(dot(north,d)/dot(center,d)-planeCenter.y)',
                       'landmarks': [{k: (v.tolist() if isinstance(v, np.ndarray) else v) for k, v in point.items()} for point in controls],
                       'hipPixels': {str(point['hip']): point['pixel'] for point in core if point['hip'] is not None},
                       'coreStars': core, 'lines': lines})
    path = REPORTS / 'guide-layout.json'
    path.write_text(json.dumps({'schema': 'starorbit-stellar-art-guide-1', 'frame': 'ICRS/J2000',
                                'canvasSize': [width, height], 'orientation': 'north-up-east-left', 'images': result}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'guideLayout': str(path), 'images': [{'imageId': item['imageId'], 'file': item['file'], 'stars': len(item['coreStars'])} for item in result]}, ensure_ascii=False, indent=2))
    return 0


def import_expansion(config, brief_path):
    """Import only completed, explicitly described images; never invent anchors."""
    brief = json.loads(brief_path.read_text())
    metadata = {}
    paths = set(brief_path.parent.glob('art-expansion-generated-*.json')) | set(brief_path.parent.glob('art-generated-*.json'))
    for path in sorted(paths):
        generated = json.loads(path.read_text())
        items = generated.get('generated', generated.get('entries'))
        if items is None:
            items = [generated]
        for item in items:
            identifier = item.get('artworkId', item.get('id'))
            if identifier:
                metadata[identifier] = item
    specifications = {spec['imageId']: spec for spec in config['images']}
    pending = []
    for entry in brief['entries']:
        identifier = entry['artworkId']
        # Import adds new artwork. It must not erase a visually reviewed
        # semantic direction or pivot when the generation brief is rerun.
        if identifier in specifications:
            continue
        original = ROOT / entry['sourcePNG']
        description = metadata.get(identifier, {})
        if not original.exists():
            pending.append({'imageId': identifier, 'reason': 'source PNG not yet available'})
            continue
        if description.get('status') not in ('ready', 'generated-and-inspected', 'generated-cleaned-and-inspected'):
            pending.append({'imageId': identifier, 'reason': 'awaiting source-owner visual acceptance'})
            continue
        axis = description.get('axisUV')
        north_up = description.get('axisPolicy') == 'north-up'
        if not axis and not north_up:
            pending.append({'imageId': identifier, 'reason': 'authored subject-axis metadata not yet available'})
            continue
        image = Image.open(original).convert('RGBA')
        if image.getextrema()[3][0] == 255:
            raise ValueError(identifier + ': the source PNG is opaque, not a transparent overlay')
        bounds = image.getchannel('A').point(lambda value: 255 if value > 32 else 0).getbbox()
        if not bounds:
            raise ValueError(identifier + ': no visible source illustration')
        if north_up and not axis:
            axis = [[bounds[0] / image.width, .5], [bounds[2] / image.width, .5]]
        if len(axis) != 2 or any(len(point) != 2 or not all(0 <= value <= 1 for value in point) for point in axis):
            raise ValueError(identifier + ': invalid visual source-axis coordinates')
        spec = {'imageId': identifier, 'sourceFile': original.name, 'sourcePixelSize': list(image.size),
                'kind': 'symbols' if entry['category'] == 'overview' else 'asterisms',
                'colorMode': 'source',
                'targetIds': entry['targetIds'], 'groupId': entry['groupId'],
                'names': {'zh': entry['zh'], 'en': entry['sourceEnglish']},
                'landmarks': [], 'historicalImageReconstruction': False,
                **{key: entry[key] for key in ('meaning', 'themeStatus', 'basis', 'interpretationCaution') if key in entry},
                'placement': {'method': 'member-extent',
                              'sourceAxisPixels': [[float(point[0] * image.width), float(point[1] * image.height)] for point in axis],
                              'sourceVisibleBox': list(bounds), 'alphaThreshold': 32,
                              'sourceExtentPixels': visible_subject_diameter(image),
                              'axisRole': description.get('intrinsicPose', 'Declared modern subject axis'),
                              'sourceVisualCenterUV': description.get('centerUV'),
                              'orientation': 'north-up' if north_up else 'member-pca',
                              'minimumAngularDiameterDegrees': entry.get('minimumAngularDiameterDegrees', 3),
                              'minimumAngularDiameterBasis': 'modern-layout',
                              'minimumAxisRatio': 2.0, 'mirror': False, 'coveragePadding': 1.12},
                'notes': ['Whole-subject equal-scale placement from verified primary members; no image-to-star anatomical constraints.',
                          'A well-defined member PCA establishes the axis; a nearly round member distribution uses explicit north-up visual design.']}
        specifications[identifier] = spec
    config['images'] = list(specifications.values())
    config['evidence'] = brief.get('evidence', [])
    config['expansionBriefSchema'] = brief.get('schema')
    config['pendingExpansion'] = pending
    config['plannedArtworks'] = len({spec['imageId'] for spec in config['images']} |
                                    {entry['artworkId'] for entry in brief['entries']})
    return config


def main():
    global REPORTS
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', help='Prepare only these comma-separated imageIds; preserve every other artwork')
    parser.add_argument('--reports', type=Path, default=REPORTS, help='Registration and guide output directory')
    parser.add_argument('--placements', type=Path, default=ART / 'rigid-placements.json',
                        help='Generic image/target/overall-pose configuration; no fixed artwork count')
    parser.add_argument('--import-brief', type=Path,
                        help='Import available PNGs plus authored axis metadata from a generic expansion brief')
    parser.add_argument('--guides', action='store_true', help='Write fixed-star redraw guides to output/release121 only')
    parser.add_argument('--diagnose-only', action='store_true', help='Print numerical fit checks without writing any assets or reports')
    parser.add_argument('--geometry-only', action='store_true', help='Rebuild placement meshes while retaining existing encoded image bytes')
    args = parser.parse_args()
    REPORTS = args.reports
    selected_ids = {value.strip() for value in args.only.split(',') if value.strip()} if args.only else None
    catalog = json.loads((ROOT / 'assets/chinese-sky/catalog.json').read_text())
    configuration = json.loads(args.placements.read_text())
    if args.import_brief:
        configuration = import_expansion(configuration, args.import_brief)
        if not args.diagnose_only and not args.guides:
            args.placements.write_text(json.dumps(configuration, ensure_ascii=False, indent=2) + '\n')
    specifications = configuration['images']
    if selected_ids is not None and (not selected_ids or selected_ids - {spec['imageId'] for spec in specifications}):
        parser.error('--only includes an imageId absent from the placement configuration')
    hip = {row[0]: row for row in json.loads((ROOT / 'assets/stars.json').read_text())}
    hip.update({row[0]: row for row in catalog.get('additionalStars', [])})
    if args.guides:
        return write_guides([spec for spec in specifications if selected_ids is None or spec['imageId'] in selected_ids], catalog, hip)
    if args.diagnose_only:
        summaries = []
        for spec in specifications:
            if selected_ids is not None and spec['imageId'] not in selected_ids:
                continue
            try:
                result = registration(spec, hip, catalog)
                summaries.append({'imageId': spec['imageId'], 'status': 'passed', **result[-2]})
            except (ValueError, KeyError, np.linalg.LinAlgError) as error:
                summaries.append({'imageId': spec['imageId'], 'status': 'rejected', 'error': str(error), **getattr(error, 'diagnostics', {})})
        print(json.dumps(summaries, ensure_ascii=False, indent=2))
        return int(any(item['status'] != 'passed' for item in summaries))
    previous = json.loads((ART / 'manifest.json').read_text()) if (ART / 'manifest.json').exists() else {'images': []}
    images = previous['images']; summaries = []; failures = []
    REPORTS.mkdir(parents=True, exist_ok=True)
    selected = [spec for spec in specifications if selected_ids is None or spec['imageId'] in selected_ids]
    for spec in selected:
        name = spec['imageId']
        try:
            if args.geometry_only:
                source_hash = hashlib.sha256((ART / spec['sourceFile']).read_bytes()).hexdigest()
                old = [record for record in previous['images'] if record.get('original') == spec['sourceFile']]
                if not old or any(record.get('originalSha256') != source_hash for record in old):
                    raise ValueError(name + ': geometry-only mode cannot change source artwork')
            generated, report = write_artwork(spec, catalog, hip, geometry_only=args.geometry_only)
            images = [record for record in images if record.get('imageId') != name and not record.get('imageId', '').startswith(name + '-')] + generated
        except (ValueError, KeyError, np.linalg.LinAlgError) as error:
            report = {'imageId': name, 'status': 'rejected', 'error': str(error),
                      **getattr(error, 'diagnostics', {})}
            failures.append(name)
        (REPORTS / (name + '-registration.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        summaries.append({key: value for key, value in report.items() if key not in ('landmarks',)})
    # Keep partial regeneration independent of artwork names and fixed counts.
    for record in images:
        owner = next((spec for spec in specifications if record.get('imageId') == spec['imageId']
                      or record.get('imageId', '').startswith(spec['imageId'] + '-')), None)
        if owner:
            record['kind'] = owner.get('kind', 'asterisms')
    names = [spec['sourceFile'] for spec in specifications]
    expected = {spec['sourceFile']: hashlib.sha256(json.dumps(spec, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest() for spec in specifications}
    pending = [name for name in names if not any(record.get('original') == name and record.get('mesh') and record.get('registration', {}).get('sourceControlSha256') == expected[name] for record in images)]
    complete = not pending and not configuration.get('pendingExpansion')
    manifest = {'version': 2, 'culture': 'chinese', 'artworks': len(specifications),
                'plannedArtworks': configuration.get('plannedArtworks', len(specifications)),
                'registrationComplete': complete, 'pendingArtworkIds': pending,
                'credit': 'Wenshuishi / StarOrbit',
                'caption': 'Chinese sky art: Wenshuishi / StarOrbit · AI-assisted modern teaching interpretation · CC BY-NC 4.0',
                'source': 'Original illustrations retain their proportions under one uniform-scale gnomonic placement. Real J2000 members establish the overall centre, direction and scale; local image features need not coincide with every star. Modern visual parameters and residuals are explicit. Culture data remains separately CC BY-SA 4.0.',
                'evidence': configuration.get('evidence', []),
                'pendingExpansion': configuration.get('pendingExpansion', []),
                'images': images}
    (ART / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'registrationComplete': complete, 'failed': failures, 'results': summaries}, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
