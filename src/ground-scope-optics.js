import { GROUND_TELESCOPE, groundEyepiece, groundEyepieceCameraFov } from './ground-stargazing.js';
export const GROUND_FIELD_MIN = 0.006;
export const GROUND_FIELD_MAX = 80;
export const GROUND_SCOPE_DETAIL = 'ground-scope-detail';
const bound = (x, min, max) => Math.max(min, Math.min(max, x));
export function groundPresetField(ocular) {
  if (ocular === 'finder') return GROUND_TELESCOPE.finderFovDeg;
  const mm = Number(ocular);
  if (!GROUND_TELESCOPE.eyepiecesMm.includes(mm)) return null;
  return groundEyepiece(GROUND_TELESCOPE.tubeMm, mm, GROUND_TELESCOPE.apparentFovDeg).fov;
}

export function groundFieldAtZoom(logZoom) {
  return GROUND_FIELD_MAX * (GROUND_FIELD_MIN / GROUND_FIELD_MAX) ** bound(logZoom, 0, 1);
}

export function groundZoomAtField(field) {
  return (
    Math.log(bound(field, GROUND_FIELD_MIN, GROUND_FIELD_MAX) / GROUND_FIELD_MAX) /
    Math.log(GROUND_FIELD_MIN / GROUND_FIELD_MAX)
  );
}

export function groundScopeOptics(field, width, height, apertureMm, exposureEV) {
  const circularStop = 0.9 * Math.min(width, height);
  // The wide finder spans the viewport height. As the optics zoom in, bring
  // the field stop onto the screen continuously, including in portrait.
  const wide = 50,
    narrow = Math.min(5, (wide * circularStop) / (3 * height));
  const blend = bound(Math.log(wide / field) / Math.log(wide / narrow), 0, 1);
  const imageScale = height * (circularStop / height) ** blend;
  const corners = Math.hypot(width, height) + 2;
  const eyeCircleDiameter = blend ? corners + (circularStop - corners) * blend : 0;
  const exposureGain = 2 ** exposureEV;
  const apertureGain = (apertureMm / GROUND_TELESCOPE.apertureMm) ** 2;
  // Stellar flux at fixed focal length is proportional to exposure and area.
  // 80 mm at EV 0 preserves the 6.5 mag finder and 8 mag ocular defaults.
  const autoMagnitudeLimit = 6.5 + 1.5 * blend + 2.5 * Math.log10(apertureGain * exposureGain);
  return {
    eyeCircleDiameter,
    fov: groundEyepieceCameraFov(field, height, imageScale),
    exposureGain,
    apertureGain,
    autoMagnitudeLimit,
  };
}
