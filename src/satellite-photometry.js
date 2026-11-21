// Optical magnitude relative to a documented pass geometry. Positions are in
// the same inertial kilometre frame. This is a diffuse-reflection estimate.
export function validSatellitePhotometry(reference) {
  return (
    !!reference &&
    Number.isFinite(reference.magnitude) &&
    reference.magnitude >= -30 &&
    reference.magnitude <= 40 &&
    Number.isFinite(reference.rangeKm) &&
    reference.rangeKm > 0 &&
    Number.isFinite(reference.phaseDeg) &&
    reference.phaseDeg >= 0 &&
    reference.phaseDeg < 180 &&
    typeof reference.source === 'string' &&
    reference.source.trim().length > 0 &&
    reference.source.length <= 600
  );
}

function phaseFlux(phase) {
  const crescent = Math.PI - phase;
  // At a thin crescent, the two ordinary terms nearly cancel.
  return (
    (crescent < 0.01
      ? crescent ** 3 * (1 / 3 - crescent ** 2 / 30)
      : Math.sin(phase) + crescent * Math.cos(phase)) / Math.PI
  );
}

export function estimateSatelliteMagnitude(
  reference,
  observerKm,
  satelliteKm,
  sunKm,
  illumination
) {
  if (
    !validSatellitePhotometry(reference) ||
    !Number.isFinite(illumination) ||
    illumination <= 0 ||
    illumination > 1
  )
    return null;
  if (![observerKm, satelliteKm, sunKm].every((v) => v?.length === 3 && v.every(Number.isFinite)))
    return null;
  const eye = observerKm.map((v, i) => v - satelliteKm[i]),
    light = sunKm.map((v, i) => v - satelliteKm[i]);
  const range = Math.hypot(...eye),
    sunDistance = Math.hypot(...light);
  if (!range || !sunDistance) return null;
  const cosPhase = eye.reduce((sum, x, i) => sum + (x / range) * (light[i] / sunDistance), 0);
  const phase = Math.acos(Math.min(1, Math.max(-1, cosPhase)));
  const fluxRatio =
    (illumination * phaseFlux(phase)) / phaseFlux((reference.phaseDeg * Math.PI) / 180);
  if (!(fluxRatio > 0)) return null;
  return (
    reference.magnitude + 5 * Math.log10(range / reference.rangeKm) - 2.5 * Math.log10(fluxRatio)
  );
}
