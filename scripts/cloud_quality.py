"""Conservative image QA for derived cloud opacity, not meteorological truth.

This gate flags extensive quantized bright plateaus and long straight steps.
It does not infer whether a region is really cloudy, reconstruct observations,
or repair pixels. NASA retrieval validity/coverage must be checked separately.
Sampling and thresholds are mirrored in src/cloud-quality.js for offline import.
"""

SCHEMA = 1
WIDTH, HEIGHT = 1024, 512
REASON_LABELS = {
    "high-opacity-plateau": "高不透明度异常平台",
    "dateline-seam": "日期线长直接缝",
    "internal-seam": "内部长直接缝",
    "invalid-image": "图像数据无效",
}


def describe_reasons(reasons):
    return "、".join(REASON_LABELS.get(reason, "未知图像异常") for reason in reasons) or "异常接缝或色块"


def quality_ok(report):
    return (isinstance(report, dict) and report.get('schema') == SCHEMA
            and report.get('status') == 'accepted' and report.get('reasons') == [])


def _longest(mask, axis):
    """Longest consecutive true run, considering every orthogonal scanline."""
    import numpy as np
    run = np.zeros(mask.shape[1-axis], dtype=np.int32)
    longest = 0
    for line in np.moveaxis(mask, axis, 0):
        run = np.where(line, run + 1, 0)
        longest = max(longest, int(run.max(initial=0)))
    return longest


def _step_runs(left, right, outside_left, outside_right, axis):
    import numpy as np
    delta = right-left
    quiet = (np.abs(left-outside_left) <= 12) & (np.abs(right-outside_right) <= 12)
    return max(_longest(quiet & (delta >= 64), axis),
               _longest(quiet & (delta <= -64), axis))


def inspect_image(image):
    """Return a reproducible schema-1 report; callers bind it to image SHA.

    NEAREST uses pixel centers, x wraps at longitude, and latitude clamps.
    In particular, large cloud coverage alone is not a rejection criterion.
    """
    import numpy as np
    from PIL import Image
    if not isinstance(image, Image.Image) or image.width < 2 or image.height < 2:
        return {'schema':SCHEMA,'status':'rejected','reasons':['invalid-image'],'metrics':{}}
    # Derived NASA opacity is in red; never luminance-convert an RGBA texture.
    sample = image.resize((WIDTH, HEIGHT), Image.Resampling.NEAREST)
    if sample.mode == 'LA':sample = sample.getchannel('L')
    elif sample.mode != 'L':sample = sample.convert('RGB').getchannel('R')
    a = np.asarray(sample, dtype=np.int16)
    lo, hi = a.copy(), a.copy()
    padded = np.pad(a, ((1,1),(0,0)), mode='edge')
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            neighbor = np.roll(padded[1+dy:HEIGHT+1+dy], dx, axis=1)
            lo = np.minimum(lo, neighbor)
            hi = np.maximum(hi, neighbor)
    flat = (a >= 180) & (hi-lo <= 2)
    histogram = np.bincount(a[flat], minlength=256)
    value = int(histogram.argmax())
    count, flat_count = int(histogram[value]), int(flat.sum())
    fraction = count/(WIDTH*HEIGHT)
    dominance = count/flat_count if flat_count else 0.
    dateline = _step_runs(a[:,-1:], a[:,:1], a[:,-2:-1], a[:,1:2], 0)
    vertical = _step_runs(a[:,1:-2], a[:,2:-1], a[:,:-3], a[:,3:], 0)
    horizontal = _step_runs(a[1:-2,:], a[2:-1,:], a[:-3,:], a[3:,:], 1)
    reasons = []
    if fraction >= .005 and dominance >= .60:
        reasons.append('high-opacity-plateau')
    if dateline >= 32:
        reasons.append('dateline-seam')
    if vertical >= 64 or horizontal >= 128:
        reasons.append('internal-seam')
    return {'schema':SCHEMA,'status':'rejected' if reasons else 'accepted','reasons':reasons,
            'metrics':{'plateauFraction':fraction,'plateauValue':value,'plateauDominance':dominance,
                       'datelineRun':dateline,'verticalRun':vertical,'horizontalRun':horizontal}}
