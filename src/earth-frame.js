import * as Astronomy from 'astronomy-engine';
import { gstime } from 'satellite.js';

// Keep the application's existing EQJ/J2000 Earth axes unchanged. UTC is used
// as UT1 and polar motion is omitted: these are visualization frame transforms.
export function earthAxes(t) {
  const date = new Date(t),
    a = (Astronomy.SiderealTime(date) * Math.PI) / 12,
    rot = Astronomy.Rotation_EQD_EQJ(date);
  return [
    [Math.cos(a), Math.sin(a), 0],
    [-Math.sin(a), Math.cos(a), 0],
    [0, 0, 1],
  ].map((v) => {
    const q = Astronomy.RotateVector(rot, new Astronomy.Vector(...v, date));
    return [q.x, q.y, q.z];
  });
}

const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const apply = (columns, v) => v.map((_, i) => columns.reduce((sum, c, j) => sum + c[i] * v[j], 0));

// Columns of TEME -> EQJ: Vallado's GMST82 TEME -> PEF followed by the same
// Earth axes used by the scene. The equation of equinoxes is included by GAST.
function temeAxes(time) {
  const a = gstime(new Date(time)),
    c = Math.cos(a),
    s = Math.sin(a),
    axes = earthAxes(time);
  return [
    axes[0].map((v, i) => c * v - s * axes[1][i]),
    axes[0].map((v, i) => s * v + c * axes[1][i]),
    axes[2],
  ];
}

export function temeToJ2000(vector, time) {
  return apply(temeAxes(time), vector);
}

export function j2000ToTEME(vector, time) {
  return temeAxes(time).map((axis) => dot(axis, vector));
}

// Only the slow frame rotation is differentiated, not the orbit itself.
// Clipping keeps the stencil inside JavaScript's representable Date range.
function frameDrift(vector, time) {
  const before = Math.max(-8.64e15, time - 500),
    after = Math.min(8.64e15, time + 500),
    a = temeToJ2000(vector, before),
    b = temeToJ2000(vector, after);
  return b.map((v, i) => ((v - a[i]) * 1000) / (after - before));
}

export function temeToJ2000State({ position, velocity }, time) {
  const axes = temeAxes(time),
    drift = frameDrift(position, time),
    rotated = apply(axes, velocity);
  return {
    position: apply(axes, position),
    velocity: rotated.map((v, i) => v + drift[i]),
  };
}

export function j2000ToTEMEState({ position, velocity }, time) {
  const axes = temeAxes(time),
    p = axes.map((axis) => dot(axis, position)),
    drift = frameDrift(p, time),
    v = velocity.map((x, i) => x - drift[i]);
  return { position: p, velocity: axes.map((axis) => dot(axis, v)) };
}
