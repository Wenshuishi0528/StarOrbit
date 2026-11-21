import { registeredPlate } from './pillar-astrometry.js';
import { createWebbPlate } from './webb-plate.js';

export function buildImageArchive(records, { source, site, archive, prefix, editions = {} }) {
  const providers = [];
  const artworks = records.map((record) => {
    const { id, title, credit, released } = record;
    const edition = editions[id] || [];
    const plate = record.plate && createWebbPlate(registeredPlate(id, record.plate));
    const builtin = source === 'recent' && id === 'weic2205a';
    const sourceUrl = `${site}/images/${id}/`;
    const thumbnailUrl = record.thumb || `${archive}/thumb300y/${id}.jpg`;
    const providerId = builtin ? 'jwst-carina-2022' : plate ? prefix + '-' + id : null;
    const center = builtin
      ? { raDeg: 159.21303687393092, decDeg: -58.62016558917656 }
      : plate
        ? {
            raDeg:
              ((Math.atan2(plate.direction[1], plate.direction[0]) * 180) / Math.PI + 360) % 360,
            decDeg: (Math.asin(plate.direction[2]) * 180) / Math.PI,
          }
        : null;
    const fieldSizeArcmin = builtin ? [7.29, 4.22] : plate ? plate.fieldSizeArcmin : null;
    const bands = record.bands || (source === 'recent' ? 'ESA/Webb' : '');
    if (plate && !builtin)
      providers.push({
        source,
        id: providerId,
        artworkSlug: id,
        thumbnailUrl,
        title,
        format: 'jpg',
        revision: released,
        plate,
        minOrder: 0,
        maxOrder: plate.maxOrder,
        baseUrl: (record.tilesBase || `${archive}/zoomable/${id}`).replace(/\/$/, ''),
        center,
        fieldSizeArcmin,
        sourceUrl,
        credit,
        bands,
        observed: '',
        released,
        licenseUrl: `${site}/copyright/`,
      });
    return {
      id,
      title,
      source,
      instruments: record.instruments || [],
      filters: record.filters || [],
      previewUrl: record.preview,
      thumbnailFallbackUrl: source === 'hubble' ? `${archive}/news/${id}.jpg` : undefined,
      reason: record.reason,
      titleZh: record.titleZh || edition[0],
      aliases: [...(record.aliases || []), ...edition.slice(1)],
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
  return { providers, artworks };
}
