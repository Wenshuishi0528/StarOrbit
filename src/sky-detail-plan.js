import { planWebbPlate } from './webb-plate.js';
import { hipsDirection, hipsOrderForView, selectHipsTiles } from './sky-detail-math.js';

export const SKY_GPU_BUDGET = 64 * 1024 * 1024;
export const SKY_TILE_BYTES = ((4 * 512 * 512 - 1) / 3) * 4;
export const SKY_TILE_LIMIT = Math.floor(SKY_GPU_BUDGET / SKY_TILE_BYTES);
export const SKY_DETAIL_SOURCES = Object.freeze([
  'auto',
  'galaxy',
  'dss',
  'panstarrs',
  'recent',
  'hubble',
]);
export const normalizeSkyDetailSource = (source) =>
  SKY_DETAIL_SOURCES.includes(source) ? source : 'auto';
export const resolveSkyDetailSource = (settings = {}) =>
  settings?.skyDetail === false ? 'galaxy' : normalizeSkyDetailSource(settings?.skyDetailSource);
export const normalizeWebbBackground = (value) =>
  value === 'dss' || value === 'panstarrs' ? value : 'galaxy';
export const skyTileKey = (provider, order, pixel) =>
  `${provider.id}@${provider.revision ?? 1}/${order}/${pixel}.${provider.format || 'jpg'}`;

function tile(provider, order, pixel, priority) {
  return { provider, order, pixel, priority, key: skyTileKey(provider, order, pixel) };
}

const groups = new WeakMap();
function groupProviders(providers) {
  if (!groups.has(providers)) {
    const plates = { hubble: [], recent: [] };
    for (const p of providers) {
      if (p.plate) plates[p.source === 'hubble' ? 'hubble' : 'recent'].push(p);
    }
    groups.set(providers, {
      plates,
      local: providers.find((p) => p.tiles),
      dss: providers.find((p) => p.id === 'dss-color'),
      ps1: providers.find((p) => p.id === 'panstarrs'),
    });
  }
  return groups.get(providers);
}

// The panorama remains the wide-angle background. Only magnified views need a
// photographic survey; small recent patches can also appear in the main sky.
export function planSkyDetailSelection(
  providers,
  view,
  requestedSource = 'auto',
  artworkId = null,
  webbBackground = 'galaxy',
  savedPyramidOrder
) {
  const source = normalizeSkyDetailSource(requestedSource);
  if (source === 'galaxy') return { source, tiles: [], fallback: 'background' };
  const family = source === 'hubble' ? 'hubble' : 'recent';
  const { local, dss, ps1, plates } = groupProviders(providers);
  const plans = [],
    half = Math.atan(Math.tan((view.fovY * Math.PI) / 360) * Math.hypot(1, view.aspect)),
    dec = Math.asin(Math.max(-1, Math.min(1, view.forward[2]))) * (180 / Math.PI),
    ps1Covered = dec - half * (180 / Math.PI) > -28;
  const artworkSource = source === 'recent' || source === 'hubble';
  const optical = artworkSource ? normalizeWebbBackground(webbBackground) : source;
  const provider =
    optical === 'dss'
      ? dss
      : optical === 'panstarrs'
        ? ps1Covered
          ? ps1
          : null
        : optical === 'auto'
          ? ps1 && ps1Covered
            ? ps1
            : dss
          : null;
  if ((view.fovY <= 18 || (view.wideField === true && optical === 'dss')) && provider) {
    // Stay clear of PS1's irregular southern boundary. DSS is a complete parent
    // layer, including when an individual PS1 tile is missing or offline.
    // An explicit choice uses that same survey at every level. Automatic mode
    // retains the complete DSS fallback beneath the northern PS1 detail.
    const parentProvider = source === 'auto' ? dss || provider : provider;
    const selection = selectHipsTiles({
      ...view,
      minOrder: 0,
      maxOrder: provider.maxOrder,
      maxTiles: 18,
    });
    const parents = new Map();
    for (const t of selection.tiles) {
      const order = Math.max(
          parentProvider.minOrder || 0,
          Math.min(parentProvider.maxOrder, t.order - 2)
        ),
        pixel = Math.floor(t.pixel / 4 ** (t.order - order));
      parents.set(pixel, tile(parentProvider, order, pixel, 0));
    }
    plans.push(...parents.values());
    plans.push(...selection.tiles.map((t) => tile(provider, t.order, t.pixel, 2)));
  }
  let localVisible = !!local;
  if (local?.center && local.fieldSizeArcmin?.length === 2) {
    const ra = (local.center.raDeg * Math.PI) / 180,
      dec = (local.center.decDeg * Math.PI) / 180,
      center = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)],
      radius = (Math.hypot(...local.fieldSizeArcmin) * Math.PI) / (180 * 120);
    localVisible =
      center.reduce((sum, value, i) => sum + value * view.forward[i], 0) >=
      Math.cos(Math.min(Math.PI, half + radius));
  }
  if (localVisible && (source === 'auto' || source === 'recent')) {
    const desired = hipsOrderForView(view.fovY, view.pixelHeight, {
      minOrder: local.minOrder,
      maxOrder: local.maxOrder,
    });
    let selection = selectHipsTiles({
      ...view,
      order: desired,
      minOrder: local.minOrder,
      maxOrder: local.maxOrder,
      maxTiles: 18,
    });
    if (!selection.tiles.length) {
      // A recent image covers only a tiny field. At wide angles there is no
      // reason to enumerate the rest of that order's entire celestial sphere.
      selection = {
        tiles: Object.keys(local.tiles)
          .filter((key) => key.startsWith(`${local.minOrder}/`))
          .map((key) => ({ order: local.minOrder, pixel: Number(key.split('/')[1]) }))
          .filter((t) => {
            const d = hipsDirection(t.order, t.pixel),
              dot = d.reduce((s, v, i) => s + v * view.forward[i], 0);
            return dot > Math.cos(Math.min(Math.PI, half + 2 / 2 ** t.order));
          }),
      };
    }
    const available = selection.tiles.filter((t) => local.tiles[`${t.order}/${t.pixel}`]);
    const parents = new Map();
    for (const t of available) {
      const order = Math.max(local.minOrder, t.order - 2),
        pixel = Math.floor(t.pixel / 4 ** (t.order - order));
      if (local.tiles[`${order}/${pixel}`]) parents.set(pixel, tile(local, order, pixel, 1));
    }
    plans.push(...parents.values(), ...available.map((t) => tile(local, t.order, t.pixel, 3)));
  }
  if (source === 'auto' || artworkSource) {
    const hasLocal = plans.some((t) => t.provider === local);
    if (!hasLocal || (artworkId && artworkId !== local?.id)) {
      const overlay = planWebbPlate(plates[family], view, artworkId, savedPyramidOrder);
      if (overlay.length && (!hasLocal || overlay[0].provider.id === artworkId)) {
        // A chosen edition replaces the overlapping rendition in all shared views.
        if (hasLocal)
          for (let i = plans.length - 1; i >= 0; i--) {
            if (plans[i].provider === local) plans.splice(i, 1);
          }
        plans.push(...overlay);
      }
    }
  }
  const tiles = [...new Map(plans.map((t) => [t.key, t])).values()];
  let fallback = null;
  if (!tiles.length) {
    if (artworkSource)
      fallback =
        (family === 'recent' && local) || plates[family].length
          ? 'outside-coverage'
          : 'unavailable';
    else if (source === 'panstarrs' && !ps1Covered) fallback = 'outside-coverage';
    else if (!provider) fallback = 'unavailable';
    else fallback = 'wide';
  }
  return {
    source,
    tiles,
    fallback,
    backgroundOutsideCoverage: artworkSource && optical === 'panstarrs' && !ps1Covered,
  };
}

export function planSkyDetail(providers, view, source = 'auto') {
  return planSkyDetailSelection(providers, view, source).tiles;
}

export function skyDetailView(frame, size) {
  return { ...frame.axes, fovY: frame.fovY, aspect: size.aspect, pixelHeight: size.h };
}
