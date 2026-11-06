// Source maps and the image delivered to the display have different resolutions.
export const PHOTO_WIDTHS = [1440, 2560, 3840];
export const PREVIEW_MAX_WIDTH = 2048;
export function detectorSize(cssWidth, dpr, aspect = 1.6, maxTextureSize = 16384, photoWidth) {
  const limit = Math.max(1, Math.floor(Math.min(maxTextureSize, maxTextureSize * aspect)));
  const wanted =
    photoWidth ?? Math.min(PREVIEW_MAX_WIDTH, Math.max(1, cssWidth) * Math.max(1, dpr || 1));
  const w = Math.max(1, Math.min(limit, Math.round(wanted)));
  return { w, h: Math.max(1, Math.round(w / aspect)), aspect };
}
function textureWidth(texture) {
  const image = texture?.image,
    source = Array.isArray(image) ? image[0] : image;
  const width = source?.naturalWidth || source?.videoWidth || source?.width || 0;
  return width > 1 ? width : 0;
}
export function earthMapSizes(env) {
  const u = env.uniforms;
  return {
    day: textureWidth(u.dayMap.value),
    night: textureWidth(u.nightMap.value),
    loading: !!env.loading,
  };
}
export const resolutionTag = (width) =>
  width >= 1024 && width % 1024 === 0 ? width / 1024 + 'K' : width ? String(width) + ' px' : '—';
