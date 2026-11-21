import records from './hubble-gallery-data.json' with { type: 'json' };
import { buildImageArchive } from './space-image-archive.js';

export const { providers: HUBBLE_PLATE_PROVIDERS, artworks: HUBBLE_ARTWORKS } = buildImageArchive(
  records,
  {
    source: 'hubble',
    site: 'https://esahubble.org',
    archive: 'https://cdn.esahubble.org/archives/images',
    prefix: 'hubble',
    editions: {
      heic1501a: ['创生之柱（哈勃可见光）', '创造之柱', 'M16', '鹰状星云'],
      heic1502a: ['仙女座星系 M31（PHAT 拼接图）', 'Andromeda', 'NGC 224'],
      heic0506a: ['涡状星系 M51 与伴星系', '漩涡星系', 'NGC 5194'],
    },
  }
);
