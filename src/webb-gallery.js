import records from './webb-gallery-data.json' with { type: 'json' };
import { createWebbPlate } from './webb-plate.js';

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

export const WEBB_PLATE_PROVIDERS = [];
export const WEBB_ARTWORKS = records.map((record) => {
  const { id, title, credit, released } = record;
  const edition = editions[id] || [];
  const plate = record.plate && createWebbPlate(record.plate);
  const builtin = id === 'weic2205a';
  const sourceUrl = `https://esawebb.org/images/${id}/`;
  const thumbnailUrl = `${archive}/thumb300y/${id}.jpg`;
  const providerId = builtin ? 'jwst-carina-2022' : plate ? 'webb-' + id : null;
  const center = builtin
    ? { raDeg: 159.21303687393092, decDeg: -58.62016558917656 }
    : plate
      ? {
          raDeg: ((Math.atan2(plate.direction[1], plate.direction[0]) * 180) / Math.PI + 360) % 360,
          decDeg: (Math.asin(plate.direction[2]) * 180) / Math.PI,
        }
      : null;
  const fieldSizeArcmin = builtin ? [7.29, 4.22] : plate ? plate.fieldSizeArcmin : null;
  const bands = record.bands || 'ESA/Webb';
  if (plate && !builtin)
    WEBB_PLATE_PROVIDERS.push({
      id: providerId,
      artworkSlug: id,
      thumbnailUrl,
      title,
      format: 'jpg',
      revision: released,
      plate,
      minOrder: 0,
      maxOrder: plate.levels.length - 1,
      baseUrl: `${archive}/zoomable/${id}`,
      center,
      fieldSizeArcmin,
      sourceUrl,
      credit,
      bands,
      observed: '',
      released,
      licenseUrl: 'https://esawebb.org/copyright/',
    });
  return {
    id,
    title,
    titleZh: edition[0],
    aliases: [...record.aliases, ...edition.slice(1)],
    credit,
    bands,
    released,
    thumbnailUrl,
    sourceUrl,
    center,
    fieldSizeArcmin,
    providerId,
  };
});
