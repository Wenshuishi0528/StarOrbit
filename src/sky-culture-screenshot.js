import { paintConstellationArtCaption } from './constellation-art-layer.js';
import { skyCulturePhotoCredit } from './sky-culture-caption.js';

export function skyCultureScreenshot(source, environment) {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  out.getContext('2d').drawImage(source, 0, 0);
  const starsVisible = environment?.settings.stars !== false;
  const artworkVisible = starsVisible && environment?.constellationArtLayer?.group.visible;
  paintConstellationArtCaption(
    out,
    skyCulturePhotoCredit(
      artworkVisible ? environment?.constellationArt?.status('main') : null,
      environment?.settings,
      !!(starsVisible && environment?.starChart?.group.visible),
      environment?.sim?.current?.t
    )
  );
  return out;
}

export function saveSkyCultureScreenshot(source, environment, name, onError) {
  try {
    skyCultureScreenshot(source, environment).toBlob((blob) => {
      if (!blob) {
        onError();
        return;
      }
      let url;
      try {
        url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
      } catch {
        onError();
      } finally {
        if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    }, 'image/png');
  } catch {
    onError();
  }
}
