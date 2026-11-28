import { equatorial } from './environment-math.js';
import { dot } from './orbit.js';
import { frameOutline, locationChart, northUpBasis, skyAngles } from './sky-location-math.js';

const radians = Math.PI / 180;
const samples = (size, f) => Array.from({ length: size + 1 }, (_, i) => f(i / size));
const meridians = [0, 45, 90, 135, 180, 225, 270, 315].map((ra) =>
  samples(48, (t) => equatorial(ra, 180 * t - 90))
);
const parallels = [-60, -30, 0, 30, 60].map((dec) => samples(80, (t) => equatorial(360 * t, dec)));

function surface(canvas) {
  const width = Math.max(1, canvas.clientWidth || 200),
    height = Math.max(1, canvas.clientHeight || 145);
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(width * ratio),
    h = Math.round(height * ratio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const c = canvas.getContext('2d');
  c.setTransform(w / width, 0, 0, h / height, 0, 0);
  c.clearRect(0, 0, width, height);
  c.font = '11px system-ui';
  return { c, width, height };
}

function path(c, points, project, colour, lineWidth = 1) {
  c.beginPath();
  let pen = false;
  for (const ray of points) {
    const p = project(ray);
    if (!p) {
      pen = false;
      continue;
    }
    if (pen) c.lineTo(...p);
    else c.moveTo(...p);
    pen = true;
  }
  c.strokeStyle = colour;
  c.lineWidth = lineWidth;
  c.stroke();
}
function dotAt(c, point, r, color) {
  if (!point) return;
  c.fillStyle = color;
  c.beginPath();
  c.arc(...point, r, 0, 2 * Math.PI);
  c.fill();
}

export function drawLocation(local, globe, view, culture, region, labels) {
  const { ra, dec } = skyAngles(view.forward);
  const basis = northUpBasis(ra, dec);
  const field = frameOutline(view);
  const chart = locationChart(culture);
  const { c, width, height } = surface(local);
  const radius = Math.min(82, Math.max(18, view.fovY * 0.8 * Math.max(1, view.aspect)));
  const scale = (height * 0.47) / Math.tan(radius * radians);
  const project = (ray) => {
    const z = dot(basis.forward, ray);
    return z > 0.08
      ? [
          width / 2 + (scale * dot(basis.right, ray)) / z,
          height / 2 - (scale * dot(basis.up, ray)) / z,
        ]
      : null;
  };
  for (const line of chart.boundaries) path(c, line, project, '#284956');
  for (const group of chart.groups) {
    if (dot(basis.forward, group.center) < -0.2) continue;
    for (const line of group.lines) {
      path(
        c,
        line,
        project,
        group.item === region ? '#eac277' : '#537384',
        group.item === region ? 1.65 : 1
      );
      for (const p of line) dotAt(c, project(p), group.item === region ? 1.8 : 1, '#ccdce5');
    }
    if (!group.lines.length && group.item === region) dotAt(c, project(group.center), 2, '#eac277');
  }
  path(c, field, project, '#6ce4ce', 1.8);
  dotAt(c, [width / 2, height / 2], 2.5, '#9af8e4');
  c.fillStyle = '#c1d1db';
  c.fillText(labels.north, width / 2 - 4, 12);
  c.fillText(labels.east, 5, height / 2);
  const { c: g, width: gw, height: gh } = surface(globe);
  // A hemisphere centred on the nearest quarter of RA preserves a reference
  // grid while letting a target move inside the globe. Draw the visible side only.
  const gridRa = Math.round(ra / 90) * 90;
  const sphere = northUpBasis(gridRa, Math.abs(dec) > 65 ? Math.sign(dec) * 50 : 12);
  const r = Math.min(gw - 18, gh - 22) * 0.5,
    cx = gw / 2,
    cy = gh / 2;
  const globeProject = (ray) =>
    dot(sphere.forward, ray) >= -1e-6
      ? [cx + r * dot(ray, sphere.right), cy - r * dot(ray, sphere.up)]
      : null;
  g.beginPath();
  g.arc(cx, cy, r, 0, 2 * Math.PI);
  g.fillStyle = '#0d2534';
  g.fill();
  g.strokeStyle = '#587585';
  g.lineWidth = 1;
  g.stroke();
  for (const line of meridians) path(g, line, globeProject, '#335263');
  parallels.forEach((line, i) => path(g, line, globeProject, i === 2 ? '#7897a8' : '#335263'));
  g.fillStyle = '#adc1cc';
  for (const hour of [0, 6, 12, 18]) {
    const p = globeProject(equatorial(hour * 15, 0));
    if (p) g.fillText(hour + 'h', Math.max(1, Math.min(gw - 21, p[0] + 2)), p[1] - 3);
  }
  if (view.zenith) {
    const zenith = skyAngles(view.zenith);
    const hori = northUpBasis(zenith.ra, zenith.dec);
    const circle = samples(128, (t) =>
      hori.right.map(
        (v, i) => v * Math.cos(2 * Math.PI * t) + hori.up[i] * Math.sin(2 * Math.PI * t)
      )
    );
    g.setLineDash([4, 3]);
    path(g, circle, globeProject, '#e7b173', 1.5);
    g.setLineDash([]);
  }
  path(g, field, globeProject, '#6ce4ce', 1.8);
  dotAt(g, globeProject(view.forward), 3, '#9af8e4');
}
