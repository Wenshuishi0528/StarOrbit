import { buildImageArchive } from './space-image-archive.js';
import { lazyData } from './lazy-data.js';

// 哈勃作品档案（约 1.8 MB）不进入启动包：首次选择哈勃影像或打开星空影像图集时再加载。
const archive = lazyData(
  () =>
    import('./hubble-gallery-data.json', { with: { type: 'json' } }).then((m) =>
      buildImageArchive(m.default, {
        source: 'hubble',
        site: 'https://esahubble.org',
        archive: 'https://cdn.esahubble.org/archives/images',
        prefix: 'hubble',
        // These Zoomify pyramids differ spatially or tonally from the publication.
        // Their official large renditions retain every native pixel at the registered WCS.
        nativeImages: {
          heic0513d: { bytes: 99928, profile: 'srgb' },
          heic0608d: { bytes: 87785, profile: 'srgb' },
          heic0816a: { bytes: 910819, profile: 'adobe' },
        },
        editions: {
          heic1501a: ['创生之柱（哈勃可见光）', '创造之柱', 'M16', '鹰状星云'],
          heic1502a: ['仙女座星系 M31（PHAT 拼接图）', 'Andromeda', 'NGC 224'],
          heic0506a: ['涡状星系 M51 与伴星系', '漩涡星系', 'NGC 5194'],
        },
      })
    ),
  { label: '哈勃影像档案' }
);

/** 加载哈勃档案，得到 { providers, artworks }；并发调用共享同一次加载，失败后可重试。 */
export const loadHubbleArchive = archive.load;
