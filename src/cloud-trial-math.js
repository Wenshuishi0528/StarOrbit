// Coordinates refer to a north-first, global equirectangular preview.
export const trialRegions = {
  global: { label: '全球', bbox: [-180, -90, 180, 90], width: 1280, height: 640 },
  asia: { label: '亚洲', bbox: [60, 5, 150, 65], width: 960, height: 640 },
  dateline: { label: '太平洋日期线', bbox: [160, 3.24, 200, 43.24], width: 640, height: 640 },
  north: { label: '北极 · 60°N 以北', polar: true, width: 640, height: 640 },
};
export function trialCoordinate(region, x, y) {
  if (region.polar) {
    const dx = 2 * x - 1,
      dy = 1 - 2 * y,
      r = Math.hypot(dx, dy);
    if (r > 1) return null;
    return [(Math.atan2(dx, dy) * 180) / Math.PI, (Math.acos(r * 0.5) * 180) / Math.PI];
  }
  const [w, s, e, n] = region.bbox;
  return [((((w + x * (e - w) + 180) % 360) + 360) % 360) - 180, n - y * (n - s)];
}
export function trialPixel(lon, lat, width, height) {
  return [
    Math.min(width - 1, Math.floor((((((lon + 180) % 360) + 360) % 360) / 360) * width)),
    Math.max(0, Math.min(height - 1, Math.floor(((90 - lat) / 180) * height))),
  ];
}
export function trialProject(source, width, height, region) {
  const out = new Uint8ClampedArray(region.width * region.height * 4);
  let valid = 0,
    inside = 0;
  for (let y = 0; y < region.height; y++)
    for (let x = 0; x < region.width; x++) {
      const p = trialCoordinate(region, (x + 0.5) / region.width, (y + 0.5) / region.height);
      if (!p) continue;
      inside++;
      const [sx, sy] = trialPixel(...p, width, height),
        i = (sy * width + sx) * 4,
        j = (y * region.width + x) * 4;
      out.set(source.subarray(i, i + 4), j);
      if (source[i + 3] > 0) valid++;
    }
  return { pixels: out, validFraction: inside ? valid / inside : 0 };
}
export function trialConfidence(rgba, palette) {
  if (!rgba || rgba[3] === 0) return '无数据';
  const entry = palette.find(({ rgb }) => rgb.every((v, i) => v === rgba[i]));
  return entry ? '晴空置信度 ' + entry.range : '预览重采样颜色 · 无精确数值';
}
