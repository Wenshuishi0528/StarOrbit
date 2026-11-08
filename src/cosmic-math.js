// Small teaching models. SI constants are IAU nominal solar GM and exact c.
// No stellar equation of state, hydrodynamic explosion or GR ray tracing is solved.
const SOLAR_GM = 1.3271244e20;
const G = 6.6743e-11;
const C = 299792458;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const numeric = (value, fallback, min, max) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
export const COSMIC_DEFAULTS = Object.freeze({
  bhMass: 10,
  bhInclination: 55,
  nsMass: 1.4,
  nsRadius: 12,
  period: 0.5,
  tilt: 55,
  inclination: 55,
  meteorSpeed: 35,
  meteorAngle: 45,
});
const limits = {
  bhMass: [3, 100],
  bhInclination: [10, 85],
  nsMass: [1, 2.2],
  nsRadius: [10, 14],
  period: [0.05, 2],
  tilt: [5, 85],
  inclination: [10, 85],
  meteorSpeed: [11, 72],
  meteorAngle: [10, 80],
};
export function normalizeCosmicParams(input = {}) {
  return Object.fromEntries(
    Object.entries(COSMIC_DEFAULTS).map(([key, value]) => [
      key,
      numeric(input?.[key], value, ...limits[key]),
    ])
  );
}
export const cosmicPhase = (phase) => numeric(phase, 0, 0, 1);
export function magneticAxis(phase, tilt = COSMIC_DEFAULTS.tilt) {
  const angle = cosmicPhase(phase) * Math.PI * 2;
  const t = numeric(tilt, COSMIC_DEFAULTS.tilt, 5, 85) * DEG;
  return [Math.sin(t) * Math.cos(angle), Math.cos(t), -Math.sin(t) * Math.sin(angle)];
}
export function observerDirection(inclination = COSMIC_DEFAULTS.inclination) {
  const angle = numeric(inclination, COSMIC_DEFAULTS.inclination, 10, 85) * DEG;
  return [Math.sin(angle), Math.cos(angle), 0];
}
export function pulseIntensity(
  phase,
  tilt = COSMIC_DEFAULTS.tilt,
  inclination = COSMIC_DEFAULTS.inclination
) {
  const beam = magneticAxis(phase, tilt),
    observer = observerDirection(inclination);
  const cosine = clamp(Math.abs(beam.reduce((sum, v, i) => sum + v * observer[i], 0)), 0, 1);
  // Smooth, symmetric two-pole beam; 10-degree sigma, normalized to unity on-axis.
  const angle = Math.acos(cosine);
  return Math.exp(-0.5 * (angle / (10 * DEG)) ** 2);
}
export function pulseProfile(input = {}, count = 160) {
  const params = normalizeCosmicParams(input);
  const n = Math.max(2, Math.min(1024, Math.round(Number.isFinite(count) ? count : 160)));
  return Array.from({ length: n }, (_, i) =>
    pulseIntensity(i / (n - 1), params.tilt, params.inclination)
  );
}
export function supernovaStage(phase) {
  const p = cosmicPhase(phase);
  return p < 0.2 ? 'progenitor' : p < 0.34 ? 'collapse' : p < 0.68 ? 'explosion' : 'remnant';
}
export function meteorState(phase, input = {}) {
  const params = normalizeCosmicParams(input),
    progress = cosmicPhase(phase);
  const path = 80 / Math.sin(params.meteorAngle * DEG);
  return {
    altitudeKm: 120 - 80 * progress,
    pathKm: path,
    travelledKm: path * progress,
    durationSeconds: path / params.meteorSpeed,
    brightness: Math.sin(Math.PI * progress) ** 1.5,
  };
}
export function cosmicMetrics(topic, input = {}, phase = 0) {
  const params = normalizeCosmicParams(input);
  const gm = SOLAR_GM * params.nsMass,
    radius = params.nsRadius * 1000;
  const meteor = meteorState(phase, params);
  return {
    schwarzschildKm: (2 * SOLAR_GM * params.bhMass) / (C * C * 1000),
    neutronDensity: (3 * gm) / (G * 4 * Math.PI * radius ** 3),
    compactness: (2 * gm) / (radius * C * C),
    surfaceGravity: gm / (radius * radius),
    periodSeconds: params.period,
    pulseIntensity: pulseIntensity(phase, params.tilt, params.inclination),
    meteorAltitudeKm: meteor.altitudeKm,
    meteorPathKm: meteor.pathKm,
    meteorDurationSeconds: meteor.durationSeconds,
    supernovaStage: supernovaStage(phase),
  };
}
