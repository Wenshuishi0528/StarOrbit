import { interpolate, orbitEllipse, stateAt } from './orbit.js';

const DAY = 86400000;
export const OEM_ESTIMATE_LIMIT = 3 * DAY;
const fits = new WeakMap();

// The last day of OEM ascending nodes measures the recent draconitic period
// and plane drift. Reuse the existing endpoint ellipse for orbital phase.
function recentNodes(rows, end) {
  const nodes = [];
  for (let i = rows.length - 1; i > 0 && rows[i][0] > end - DAY; i--) {
    const a = rows[i - 1],
      b = rows[i];
    if (a[3] >= 0 || b[3] < 0) continue;
    let lo = a[0],
      hi = b[0];
    while (hi - lo > 10) {
      const t = (lo + hi) / 2;
      if (interpolate(rows, t).position[2] < 0) lo = t;
      else hi = t;
    }
    const time = (lo + hi) / 2,
      position = interpolate(rows, time).position;
    nodes.unshift({ time, node: Math.atan2(position[1], position[0]) });
  }
  return nodes;
}
export function oemEstimate(data) {
  if (fits.has(data)) return fits.get(data);
  const end = data.rows.at(-1)[0],
    ellipse = orbitEllipse(data, end);
  if (!ellipse) {
    fits.set(data, null);
    return null;
  }
  const nodes = recentNodes(data.rows, end),
    first = nodes[0],
    last = nodes.at(-1);
  let periodRatio = 1,
    planeRate = 0;
  if (nodes.length >= 4) {
    const duration = last.time - first.time,
      period = duration / (nodes.length - 1);
    const nodeAngle = Math.atan2(
      Math.sin(last.node - first.node),
      Math.cos(last.node - first.node)
    );
    // Ignore a broken cycle or abrupt orbital change in recent records.
    const ratio = (ellipse.period * 1000) / period;
    if (
      Math.abs(ratio - 1) < 0.03 &&
      Math.abs(nodeAngle / duration) * DAY < 0.25 &&
      nodes.slice(1).every((node, i) => Math.abs((node.time - nodes[i].time) / period - 1) < 0.02)
    ) {
      periodRatio = ratio;
      planeRate = nodeAngle / duration;
    }
  }
  const fit = {
    end,
    periodRatio,
    planeRate,
    position(time) {
      if (time < end || time > end + OEM_ESTIMATE_LIMIT) return null;
      const elapsed = time - end,
        p = stateAt(data, end + elapsed * periodRatio)?.position;
      if (!p) return null;
      const c = Math.cos(planeRate * elapsed),
        s = Math.sin(planeRate * elapsed);
      return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]];
    },
  };
  fits.set(data, fit);
  return fit;
}
