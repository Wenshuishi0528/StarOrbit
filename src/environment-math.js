// All directions are J2000 equatorial; Earth maps use east-positive longitude.
export const QUALITY = {
  simple: { name: '简易', width: 1024, limit: 6, pixelRatio: 1, steps: 0 },
  medium: { name: '中等', width: 2048, limit: 7, pixelRatio: 1.25, steps: 8 },
  standard: { name: '标准', width: 4096, limit: 8, pixelRatio: 1.5, steps: 16 },
  high: { name: '精细', width: 8192, limit: 8, pixelRatio: 2, steps: 32 },
};
export function equatorial(ra, dec) {
  const r = (ra * Math.PI) / 180,
    d = (dec * Math.PI) / 180;
  return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)];
}
export function geographicUV(lon, lat) {
  return [(lon + 180) / 360, (lat + 90) / 180];
}
export function qualityFor(requested, maxTextureSize) {
  const tier = QUALITY[requested] ? requested : 'medium';
  return (
    ['high', 'standard', 'medium', 'simple'].find(
      (k) => QUALITY[k].width <= Math.min(maxTextureSize, QUALITY[tier].width)
    ) || 'simple'
  );
}

// The maximum WebGL texture dimension alone does not describe the memory available
// for a complete globe, six sky faces and the scene's render targets together.
export function deviceTextureLimits(device, capabilities) {
  const mobileApple =
    /iPhone|iPad|iPod/.test(device.userAgent) ||
    (device.platform === 'MacIntel' && device.maxTouchPoints > 1);
  return {
    staged: mobileApple,
    earthWidth: Math.min(capabilities.maxTextureSize, mobileApple ? 4096 : Infinity),
    cubeFace: Math.min(capabilities.maxCubemapSize, mobileApple ? 1024 : Infinity),
    pixelRatio: mobileApple ? 1.5 : Infinity,
  };
}
