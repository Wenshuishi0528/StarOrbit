// Cloud masks are scalar data, never sRGB colour. Legacy JPEG snapshots use red;
// Live Cloud Maps PNGs store the unblurred mask in alpha (their RGB is shaded).
export const LIVE_CLOUD_PROCESSING = 'live-cloud-cropped-v1';
export const CLOUD_PNG = 'https://clouds.matteason.co.uk/images/8192x4096/clouds-alpha.png';
export const CLOUD_JPEG = 'https://clouds.matteason.co.uk/images/8192x4096/clouds.jpg';
// RGBA validity masks are larger than the retired single-channel derivatives.
export const CLOUD_MAX_BYTES = 64 * 1024 * 1024;
export const CLOUD_SNAPSHOT_MAX_BYTES = 96 * 1024 * 1024;
export function cloudChannel(record) {
  return record.channel === 'validity' || record.provider === 'viirs'
    ? 'validity'
    : record.channel === 'alpha' || record.source === CLOUD_PNG
      ? 'alpha'
      : 'red';
}
// Fixed regional observations and forecast fields use the stored intensity alone.
// Validity is already multiplied into red on decode, so missing pixels stay clear.
export function fixedCloudField(record) {
  return record?.provider === 'himawari' || record?.provider === 'gdps';
}
export function textureChannel(record) {
  if (fixedCloudField(record)) return 0;
  const channel = cloudChannel(record);
  return channel === 'validity' ? 2 : channel === 'alpha' ? 1 : 0;
}
export function cloudDecodeSize(width, height, tier, maxSize) {
  if (width < 1024 || width > 8192 || width !== height * 2) throw Error('云图尺寸无效');
  const cap = tier === 'high' ? 8192 : tier === 'standard' ? 4096 : tier === 'simple' ? 1024 : 2048;
  const w = Math.min(width, cap, maxSize);
  return { width: w, height: w / 2 };
}

// Read the source dimensions rather than trusting an archived metadata record.
export async function decodeCloudBitmap(blob, tier, maxSize, keepSourceGrid) {
  const options = {
    imageOrientation: 'flipY',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  };
  const header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  let size;
  if (
    header.length === 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82].every((v, i) => header[i] === v)
  ) {
    const view = new DataView(header.buffer);
    const width = view.getUint32(16);
    size = cloudDecodeSize(width, view.getUint32(20), tier, maxSize);
    if (!keepSourceGrid && size.width < width) {
      const bitmap = await createImageBitmap(blob, {
        ...options,
        resizeWidth: size.width,
        resizeHeight: size.height,
        resizeQuality: 'high',
      });
      if (bitmap.width === size.width && bitmap.height === size.height) return { bitmap, size };
      bitmap.close();
      throw Error('云图尺寸无效');
    }
  }
  let bitmap = await createImageBitmap(blob, options);
  try {
    size = cloudDecodeSize(bitmap.width, bitmap.height, tier, maxSize);
    if (!keepSourceGrid && size.width < bitmap.width) {
      bitmap.close();
      bitmap = await createImageBitmap(blob, {
        ...options,
        resizeWidth: size.width,
        resizeHeight: size.height,
        resizeQuality: 'high',
      });
      if (bitmap.width !== size.width || bitmap.height !== size.height) throw Error('云图尺寸无效');
    }
    return { bitmap, size };
  } catch (error) {
    bitmap.close();
    throw error;
  }
}

// This provider exports display-enhanced IR/dust/visible intensity, not physical
// cloud opacity. Counter its gamma-2 display lift, then softly suppress the weak floor.
// This is a conservative display approximation, NOT a retrieved clear-sky mask:
// the visible branch has another gamma and the merged channels are irreversible.
// Keep this display transfer provider-specific; archived source pixels stay intact.
export function cloudTone(record) {
  return record &&
    record.processing !== LIVE_CLOUD_PROCESSING &&
    (!record.provider || record.provider === 'github') &&
    (record.provider === 'github' || record.source === CLOUD_PNG || record.source === CLOUD_JPEG)
    ? 1
    : 0;
}
export function githubCloudOpacity(value) {
  const v = Math.max(0, Math.min(1, value)) ** 2,
    t = Math.max(0, Math.min(1, (v - 0.01) / 0.07));
  return v * t * t * (3 - 2 * t);
}
export const cloudToneGLSL = `uniform float cloudTone;
float cloudOpacity(float value){float v=clamp(value,0.,1.);v*=v;return mix(value,v*smoothstep(.01,.08,v),cloudTone);}`;
