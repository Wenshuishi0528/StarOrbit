// CPU counterpart of cloudAt(), sampled on small cached masks for event placement.
// It constrains illustrative events, not a retrieved convection/lightning product.
import { climateMasks } from './cloud-geography.js';
import { githubCloudOpacity } from './cloud-texture.js';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)),
  mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const fract = (v) => v - Math.floor(v);
const rotate = (p, a) => [
  p[0] * Math.cos(a) - p[1] * Math.sin(a),
  p[0] * Math.sin(a) + p[1] * Math.cos(a),
  p[2],
];
const normalize = (p) => {
  const l = Math.hypot(...p);
  return p.map((v) => v / l);
};
function hash(p) {
  const q = p.map((v, i) => fract(v * 0.3183099 + [0.1, 0.2, 0.3][i]) * 17);
  return fract(q[0] * q[1] * q[2] * (q[0] + q[1] + q[2]));
}
function noise(p) {
  const base = p.map(Math.floor),
    f = p.map((v) => {
      const a = fract(v);
      return a * a * (3 - 2 * a);
    }),
    h = (x, y, z) => hash([base[0] + x, base[1] + y, base[2] + z]);
  return mix(
    mix(mix(h(0, 0, 0), h(1, 0, 0), f[0]), mix(h(0, 1, 0), h(1, 1, 0), f[0]), f[1]),
    mix(mix(h(0, 0, 1), h(1, 0, 1), f[0]), mix(h(0, 1, 1), h(1, 1, 1), f[0]), f[1]),
    f[2]
  );
}
export function cloudCoverage(p, u, sample) {
  if (u.cloudMode < 0.5) {
    const n = rotate(p, u.cloudMotion * u.motionTime * 0.004 * (0.5 + 0.5 * Math.sin(p[2] * 4)));
    if (u.cloudChannel > 1.5)
      return clamp(sample('cloud', n, 0) + sample('template', n, 0) * (1 - sample('cloud', n, 3)));
    const v = sample('cloud', n, u.cloudChannel > 0.5 ? 3 : 0);
    return u.cloudTone > 0.5 ? githubCloudOpacity(v) : v;
  }
  const lat = (Math.asin(clamp(p[2], -1, 1)) * 180) / Math.PI,
    lon = Math.atan2(p[1], p[0]),
    ab = Math.abs(lat),
    ocean = smooth(0.15, 0.85, sample('ocean', p, 0)),
    region = climateMasks((lon * 180) / Math.PI, lat);
  const itcz = Math.exp(-(((lat - (3 + u.cloudSeason * 7 + Math.sin(lon * 2) * 2)) / 9) ** 2)),
    storms = Math.exp(-(((ab - 48 - 3 * Math.sin(lon * 3)) / 13) ** 2)),
    subtropics = Math.exp(-(((ab - 25) / 10) ** 2));
  const moisture = clamp(
    0.5 +
      0.18 * ocean +
      0.32 * itcz +
      0.28 * storms -
      0.18 * subtropics +
      region[1] * (1 - ocean) * 0.22 -
      region[0] * (1 - ocean) * 0.67 +
      region[2] * ocean * 0.22,
    0.07,
    1.25
  );
  const time = u.weatherTime * u.cloudMotion,
    phase = u.seed * 0.017,
    wind = mix(-1, 1, smooth(24, 40, ab)),
    shift = wind * 0.035 * Math.sin(time * 0.025 + phase) + 0.018 * Math.sin(phase * 2);
  let moved = rotate(p, shift);
  moved[2] += 0.009 * Math.sin(lon * 5 + phase + time * 0.018);
  moved = normalize(moved);
  const base = sample('template', moved, 0),
    secondary = sample('template', rotate(moved, 0.055 * Math.sin(phase + 1)), 0),
    weather = noise(
      moved.map((v, i) => v * 12 + [u.seed * 0.003, time * 0.015, u.seed * 0.002][i])
    );
  const coverage = mix(base, secondary, 0.15 + 0.2 * weather);
  return clamp(
    Math.max(coverage, 0) ** mix(2.8, 0.72, clamp(moisture)) *
      (0.7 + 0.3 * moisture) *
      (0.85 + 0.3 * weather)
  );
}
// DataTexture pixels cannot be passed to Canvas.drawImage. Keep only a small
// north-up sample for storm placement, without reading back the GPU texture.
export function sampleDataTexture(image, flipY) {
  const channels = image.data.length / (image.width * image.height);
  if (channels !== 1 && channels !== 4) return null;
  const width = Math.min(512, image.width),
    height = Math.min(256, image.height),
    data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(((y + 0.5) * image.height) / height);
    const sourceRow = flipY ? row : image.height - 1 - row;
    for (let x = 0; x < width; x++) {
      const source =
        (sourceRow * image.width + Math.floor(((x + 0.5) * image.width) / width)) * channels;
      const dst = (y * width + x) * 4;
      data[dst] = image.data[source];
      data[dst + 3] = channels === 4 ? image.data[source + 3] : 255;
    }
  }
  return { width, height, data };
}
export function maskSample(mask, n, channel = 0) {
  if (!mask) return 0;
  const { data, width, height } = mask,
    fx = (Math.atan2(n[1], n[0]) / (Math.PI * 2) + 0.5) * width - 0.5,
    fy = (0.5 - Math.asin(clamp(n[2], -1, 1)) / Math.PI) * height - 0.5,
    x = Math.floor(fx),
    y = Math.floor(fy);
  const at = (dx, dy) =>
    data[
      (Math.max(0, Math.min(height - 1, y + dy)) * width + ((((x + dx) % width) + width) % width)) *
        4 +
        channel
    ] / 255;
  return mix(mix(at(0, 0), at(1, 0), fract(fx)), mix(at(0, 1), at(1, 1), fract(fx)), fract(fy));
}
