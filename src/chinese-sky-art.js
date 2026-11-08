import registeredArt from '../assets/chinese-sky/art/manifest.json';

// Geometry stays in the hashed application payload; the entry only carries
// image URLs and small metadata.
export function chineseSkyArtProvider(runtime = {}) {
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
