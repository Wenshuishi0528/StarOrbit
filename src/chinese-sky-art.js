import { lazyData } from './lazy-data.js';

// The registered geometry (2.5 MB) is parsed only when Chinese art is first
// needed. A failed request is forgotten so the next selection can retry.
const registered = lazyData(() =>
  import('../assets/chinese-sky/art/manifest.json', { with: { type: 'json' } }).then(
    ({ default: manifest }) => manifest
  )
);
export function loadChineseSkyArt() {
  return registered.load().catch((error) => {
    console.error('中国星官插画数据加载失败', error);
    throw error;
  });
}

// Geometry stays in the hashed application payload; the entry only carries
// image URLs and small metadata.
export function chineseSkyArtProvider(runtime = {}, registeredArt) {
  const images = new Map((runtime.images || []).map((image) => [image.imageId, image]));
  return {
    ...registeredArt,
    ...runtime,
    images: registeredArt.images.flatMap((record) => {
      const image = images.get(record.imageId);
      return image ? [{ ...record, ...image }] : [];
    }),
  };
}
