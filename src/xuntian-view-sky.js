import { DETECTOR_SIGMA } from './xuntian-view-math.js';

// These are the same display choices as Environment.setSkyStyle/beginFrame.
// The scope borrows the main scene's loaded cube. It never allocates a second
// sky texture or labels an in-flight/failed texture as the selected resolution.
export function xuntianSkySource(env = {}, frame = {}) {
  const settings = env.settings || {};
  const showStars = frame.showStars ?? settings.stars !== false;
  const showGalaxy = frame.showGalaxy ?? settings.milky !== false;
  const mode = frame.skyExposure ?? settings.exposure ?? 'cinematic';
  const multiplier = frame.skyBrightness ?? settings.starBrightness ?? 1;
  const gain =
    Math.max(0, Math.min(2, Number.isFinite(multiplier) ? multiplier : 1)) *
    (mode === 'photo' ? 0.025 : 1);
  let status = 'off',
    faceSize = 0,
    level = null;
  if (showStars) {
    if (!showGalaxy) status = 'catalog';
    else if (mode !== 'cinematic') status = 'ordinary';
    else if (env.galaxyTexture) {
      status = 'panorama';
      const face = env.galaxyTexture.image?.[0];
      faceSize =
        face?.naturalWidth ||
        face?.width ||
        ([4, 8, 16].includes(env.skySize) ? env.skySize * 256 : 0);
      if ([1024, 2048, 4096].includes(faceSize)) level = faceSize / 256;
    } else
      status = env.skyLoading
        ? 'loading'
        : env.skyUnsupported
          ? 'unsupported'
          : env.skyFailed
            ? 'failed'
            : 'ordinary';
  }
  return {
    status,
    presentation: mode,
    level,
    faceSize,
    sourceWidth: faceSize * 4,
    gain,
    showStars,
  };
}

// Monochromatic diffraction scales with aperture and angle per detector pixel.
// The detector integrates each whole pixel in the fragment shader; only the
// smaller charge-diffusion term belongs in this pre-integration Gaussian.
export function xuntianStarPSF(optics, height) {
  const optical = (optics.diffraction * height) / (2 * optics.tangent);
  return {
    core: Math.hypot(DETECTOR_SIGMA, optical),
    wing: Math.hypot(DETECTOR_SIGMA, 2.3 * optical),
    signalScale: 1,
  };
}
