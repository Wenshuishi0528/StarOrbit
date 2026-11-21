import records from './webb-gallery-data.json' with { type: 'json' };
import { buildImageArchive } from './space-image-archive.js';

const archive = 'https://cdn.esawebb.org/archives/images';
const editions = {
  weic2205a: ['宇宙悬崖', 'Cosmic Cliffs', 'NGC 3324'],
  pillarsofcreation_composite: ['创生之柱（近红外与中红外合成）', '创造之柱', '鹰状星云'],
  weic2218a: ['创生之柱（中红外）', '创造之柱', '鹰状星云'],
  weic2216b: ['创生之柱（近红外全景）', '创造之柱', '鹰状星云'],
  weic2205b: ['宇宙悬崖（近红外与中红外合成）', 'Cosmic Cliffs'],
  weic2307f: ['沃尔夫–拉叶星 WR 124（哈勃对照影像）'],
  weic2207b: ['南环状星云（近红外）', '南环星云'],
  weic2207c: ['南环状星云（中红外）', '南环星云'],
  weic2209a: ['韦伯首幅深场', 'SMACS 0723'],
  weic2513a: ['猫爪星云（近红外）'],
  weic2601a: ['螺旋星云（近红外）'],
};

export const { providers: WEBB_PLATE_PROVIDERS, artworks: WEBB_ARTWORKS } = buildImageArchive(
  records,
  {
    source: 'recent',
    site: 'https://esawebb.org',
    archive,
    prefix: 'webb',
    editions,
  }
);
