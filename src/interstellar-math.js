// Heliocentric J2000 equatorial coordinates, Julian light-years. Navigation is
// independent of the simulation clock; this catalogue is a static epoch snapshot.
export const LY_KM = 9460730472580.8;
export const AU_LY = 149597870.7 / LY_KM;
export const PC_LY = 3.2615637771674336;
export const SOLAR_RADIUS_LY = 695700 / LY_KM;
export const TRAVEL_SPEEDS = Object.freeze({
  local: AU_LY * 0.1,
  nearby: 0.02,
  cruise: 2,
  fast: 50,
});

export function stellarPosition(ra, dec, parallax) {
  if (![ra, dec, parallax].every(Number.isFinite) || Math.abs(dec) > 90 || parallax <= 0)
    return null;
  const r = (ra * Math.PI) / 180,
    d = (dec * Math.PI) / 180,
    distance = (1000 / parallax) * PC_LY;
  return [
    Math.cos(d) * Math.cos(r) * distance,
    Math.cos(d) * Math.sin(r) * distance,
    Math.sin(d) * distance,
  ];
}
export function absoluteMagnitude(magnitude, distanceLy) {
  return magnitude - 5 * Math.log10(distanceLy / (10 * PC_LY));
}
export function apparentMagnitude(absolute, distanceLy) {
  return absolute + 5 * Math.log10(Math.max(1e-12, distanceLy) / (10 * PC_LY));
}
export function splitPosition(position, high = [], low = []) {
  for (let i = 0; i < 3; i++) {
    high[i] = Math.fround(position[i]);
    low[i] = position[i] - high[i];
  }
  return { high, low };
}
export function arrivalPosition(observer, target, standOff = 2 * AU_LY) {
  const delta = observer.map((v, i) => v - target[i]),
    length = Math.hypot(...delta);
  const direction = length > 1e-12 ? delta.map((v) => v / length) : [0, -1, 0];
  return target.map((v, i) => v + direction[i] * standOff);
}

// Exact first-order damping integration: equal travel for different frame rates.
// Direction is world-space, length <= 1. A nearby object lowers the speed cap;
// no force is inferred from this exploration-camera speed assistance.
export function stepTravel(position, velocity, direction, dt, speed, clearance = Infinity) {
  dt = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
  const moving = Math.hypot(...direction) > 0;
  const cap = Math.min(speed, Math.max(AU_LY * 0.00001, clearance * 0.6));
  const tau = moving ? 0.85 : 0.2,
    decay = Math.exp(-dt / tau);
  // Immediately honour a newly reduced safety cap before integrating a step.
  const oldSpeed = Math.hypot(...velocity);
  if (oldSpeed > cap) for (let i = 0; i < 3; i++) velocity[i] *= cap / oldSpeed;
  for (let i = 0; i < 3; i++) {
    const goal = moving ? direction[i] * cap : 0,
      old = velocity[i];
    position[i] += goal * dt + (old - goal) * tau * (1 - decay);
    velocity[i] = goal + (old - goal) * decay;
    if (!moving && Math.abs(velocity[i]) < 1e-18) velocity[i] = 0;
  }
  return Math.hypot(...velocity);
}

export function formatStellarDistance(ly, translate = (x) => x) {
  if (!Number.isFinite(ly)) return '—';
  const distance = Math.abs(ly);
  if (distance < AU_LY * 0.01)
    return `${(distance * LY_KM).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
  if (distance < 0.1)
    return `${(distance / AU_LY).toLocaleString(undefined, { maximumFractionDigits: 2 })} AU`;
  return `${distance.toLocaleString(undefined, { maximumFractionDigits: distance < 10 ? 3 : 1 })} ${translate('光年')}`;
}

export function buildSpatialCatalog(stars, distances) {
  const ranges = new Map(distances.map(([id, parallax, error]) => [id, [parallax, error]]));
  const records = [
    { id: 'Sun', hip: 0, position: [0, 0, 0], absolute: 4.83, bv: 0.65, radius: SOLAR_RADIUS_LY },
  ];
  const seen = new Set();
  for (const [hip, ra, dec, mag, bv] of stars) {
    const range = ranges.get(hip);
    if (seen.has(hip) || !range || !(range[0] > 0 && range[1] > 0 && range[1] / range[0] <= 0.1))
      continue;
    const position = stellarPosition(ra, dec, range[0]);
    if (!position || !Number.isFinite(mag)) continue;
    seen.add(hip);
    records.push({
      id: `hip:${hip}`,
      hip,
      position,
      absolute: absoluteMagnitude(mag, Math.hypot(...position)),
      bv: Number.isFinite(Number(bv)) ? Number(bv) : 0.6,
      // Davis et al. (2011), PASA 28:1, interferometric Sirius A radius.
      radius: hip === 32349 ? SOLAR_RADIUS_LY * 1.713 : 0,
    });
  }
  const count = records.length,
    positions = new Float64Array(count * 3),
    high = new Float32Array(count * 3),
    low = new Float32Array(count * 3),
    photometry = new Float32Array(count * 3);
  const byId = new Map(),
    hips = new Int32Array(count);
  records.forEach((r, i) => {
    byId.set(r.id, i);
    hips[i] = r.hip;
    positions.set(r.position, i * 3);
    for (let axis = 0; axis < 3; axis++) {
      high[i * 3 + axis] = r.position[axis];
      low[i * 3 + axis] = r.position[axis] - high[i * 3 + axis];
    }
    photometry.set([r.absolute, r.bv, r.radius], i * 3);
  });
  return {
    count,
    positions,
    high,
    low,
    photometry,
    byId,
    hips,
    bytes:
      positions.byteLength +
      high.byteLength +
      low.byteLength +
      photometry.byteLength +
      hips.byteLength,
  };
}
