import { planWebbPlate } from './webb-plate.js';
import { hipsDirection, hipsOrderForView, selectHipsTiles } from './sky-detail-math.js';
import { panstarrsTileCoverage, panstarrsViewCoverage } from './panstarrs-coverage.js';

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
  ['blank', 'dss', 'panstarrs'].includes(value) ? value : 'galaxy';
// A deliberately selected survey owns its entire sky, including empty pixels
// during loading or outside coverage. On a plate, this choice belongs to its base.
export function photographicSkyBase(source, background) {
  const base =
    source === 'hubble' || source === 'recent' ? normalizeWebbBackground(background) : source;
  return ['blank', 'dss', 'panstarrs'].includes(base) ? base : null;
}
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
  const explicitSurvey = optical === 'dss' || optical === 'panstarrs';
  const opticalCoverage = optical === 'panstarrs' ? panstarrsViewCoverage(view) : null;
  const provider =
    optical === 'dss'
      ? dss
      : optical === 'panstarrs'
        ? ps1
        : optical === 'auto'
          ? ps1 && ps1Covered
            ? ps1
            : dss
          : null;
  if (provider && opticalCoverage !== 'none' && (explicitSurvey || view.fovY <= 18)) {
    const parentProvider = source === 'auto' ? dss || provider : provider;
    const selection = selectHipsTiles({
      ...view,
      minOrder: 0,
      maxOrder: provider.maxOrder,
      maxTiles: 18,
    });
    const visible = selection.tiles.filter(
      (t) => provider !== ps1 || panstarrsTileCoverage(t.order, t.pixel) !== 'none'
    );
    const parents = new Map(),
      roots = new Map();
    for (const t of visible) {
      const order = Math.max(
          parentProvider.minOrder || 0,
          Math.min(parentProvider.maxOrder, t.order - 2)
        ),
        pixel = Math.floor(t.pixel / 4 ** (t.order - order));
      parents.set(pixel, tile(parentProvider, order, pixel, 0));
      if (explicitSurvey) {
        const root = Math.floor(t.pixel / 4 ** t.order);
        roots.set(root, tile(provider, 0, root, 0));
      }
    }
    // Keep the same real low-order base while zoom changes detail levels.
    plans.push(...roots.values(), ...parents.values());
    plans.push(...visible.map((t) => tile(provider, t.order, t.pixel, 2)));
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
      const overlay = planWebbPlate(
        plates[family],
        view,
        artworkId,
        savedPyramidOrder,
        optical === 'blank' ? 0.7 : 8
      );
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
  const unique = new Map();
  for (const t of plans) if (!unique.has(t.key)) unique.set(t.key, t);
  const tiles = [...unique.values()];
  let fallback = null;
  if (!tiles.length) {
    if (artworkSource)
      fallback =
        (family === 'recent' && local) || plates[family].length
          ? 'outside-coverage'
          : 'unavailable';
    else if (source === 'panstarrs' && opticalCoverage === 'none') fallback = 'outside-coverage';
    else if (!provider) fallback = 'unavailable';
    else fallback = 'wide';
  }
  return {
    source,
    tiles,
    fallback,
    opticalCoverage,
    backgroundOutsideCoverage: artworkSource && opticalCoverage === 'none',
  };
}

export function planSkyDetail(providers, view, source = 'auto') {
  return planSkyDetailSelection(providers, view, source).tiles;
}

export function skyDetailView(frame, size) {
  return {
    ...frame.axes,
    fovY: frame.fovY,
    aspect: size.aspect,
    pixelHeight: size.h,
    ...(frame.detailSelection && { detailSelection: frame.detailSelection }),
  };
}
