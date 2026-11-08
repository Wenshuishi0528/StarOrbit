export const STAR_CHART_DEFAULTS = Object.freeze({
  skyCulture: 'western',
  starChartEnabled: false,
  starLabels: true,
  catalogStarLabels: false,
  solarSystemLabels: true,
  constellationNames: true,
  constellationArt: true,
  westernArtBrightness: 1,
  chineseArtBrightness: 1,
  chineseSymbolArt: false,
  chineseSymbolOpacity: 0.2,
  constellationLines: true,
  constellationBoundaries: false,
  equatorialGrid: false,
  eclipticLine: false,
  deepSkyObjects: true,
  deepSkyScope: 'featured',
  starLabelDensity: 0.95,
});
const checkboxIds = {
  starChartEnabled: 'starChartEnabled',
  starLabels: 'starNames',
  catalogStarLabels: 'catalogStarNames',
  solarSystemLabels: 'solarSystemNames',
  constellationNames: 'constellationNames',
  constellationArt: 'constellationArt',
  chineseSymbolArt: 'chineseSymbolArt',
  constellationLines: 'constellationLines',
  constellationBoundaries: 'constellationBoundaries',
  equatorialGrid: 'equatorialGrid',
  eclipticLine: 'eclipticLine',
  deepSkyObjects: 'deepSkyObjects',
};
const own = (value, key) => Object.hasOwn(value, key);

// Categories are global; each viewing surface owns its display master. Legacy
// scope presets are migrated once and never remain as a hidden second filter.
export function normalizeStarChartSettings(input = {}, { strict = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    if (strict) throw Error('无效星图设置');
    input = {};
  }
  const invalid = () => {
      if (strict) throw Error('无效星图设置');
    },
    result = { ...STAR_CHART_DEFAULTS };
  if (own(input, 'skyCulture')) {
    if (['western', 'chinese'].includes(input.skyCulture)) result.skyCulture = input.skyCulture;
    else invalid();
  }
  for (const key of Object.keys(checkboxIds))
    if (own(input, key)) {
      if (typeof input[key] === 'boolean') result[key] = input[key];
      else invalid();
    }
  const legacy = !own(input, 'starChartEnabled');
  if (legacy) {
    result.starChartEnabled = own(input, 'starLabels') && input.starLabels === true;
    result.starLabels = true;
  }
  if (
    own(input, 'starLabelScope') &&
    !['major', 'all', 'catalog', 'classic'].includes(input.starLabelScope)
  )
    invalid();
  const classic =
    (own(input, 'starLabelScope') && input.starLabelScope === 'classic') ||
    (legacy && own(input, 'starLabels') && input.starLabels === true);
  if (classic) {
    for (const key of [
      'catalogStarLabels',
      'constellationNames',
      'constellationLines',
      'constellationBoundaries',
      'deepSkyObjects',
    ])
      if (!own(input, key)) result[key] = false;
  }
  if (!legacy && own(input, 'starLabels') && input.starLabels === false) {
    if (!own(input, 'catalogStarLabels')) result.catalogStarLabels = false;
    if (!own(input, 'solarSystemLabels')) result.solarSystemLabels = false;
  }
  if (own(input, 'deepSkyScope')) {
    if (['featured', 'messier', 'all'].includes(input.deepSkyScope))
      result.deepSkyScope = input.deepSkyScope;
    else invalid();
  }
  if (own(input, 'starLabelDensity')) {
    if (
      Number.isFinite(input.starLabelDensity) &&
      input.starLabelDensity >= 0 &&
      input.starLabelDensity <= 1
    )
      result.starLabelDensity = input.starLabelDensity;
    else invalid();
  }
  if (own(input, 'chineseSymbolOpacity')) {
    if (
      Number.isFinite(input.chineseSymbolOpacity) &&
      input.chineseSymbolOpacity >= 0 &&
      input.chineseSymbolOpacity <= 1
    )
      result.chineseSymbolOpacity = input.chineseSymbolOpacity;
    else invalid();
  }
  for (const key of ['westernArtBrightness', 'chineseArtBrightness'])
    if (own(input, key)) {
      if (Number.isFinite(input[key]) && input[key] >= 0 && input[key] <= 2)
        result[key] = input[key];
      else invalid();
    }
  return result;
}

export function syncStarChartControls(settings) {
  const $ = (id) => document.getElementById(id);
  if ($('skyCulture')) $('skyCulture').value = settings.skyCulture || 'western';
  for (const culture of ['western', 'chinese']) {
    const key = culture + 'ArtBrightness',
      value = settings[key] ?? STAR_CHART_DEFAULTS[key];
    if ($(key)) $(key).value = String(value);
    if ($(key + 'Value')) $(key + 'Value').textContent = Math.round(value * 100) + '%';
    if ($(key + 'Control'))
      $(key + 'Control').hidden = (settings.skyCulture || 'western') !== culture;
  }
  for (const [key, id] of Object.entries(checkboxIds)) {
    if (!$(id)) continue;
    $(id).checked = settings[key];
    $(id).disabled = false;
  }
  if ($('chineseSymbolArt')?.parentElement)
    $('chineseSymbolArt').parentElement.hidden = settings.skyCulture !== 'chinese';
  if ($('chineseSymbolAppearance'))
    $('chineseSymbolAppearance').hidden = settings.skyCulture !== 'chinese';
  const overviewOpacity = settings.chineseSymbolOpacity ?? STAR_CHART_DEFAULTS.chineseSymbolOpacity;
  if ($('chineseSymbolOpacity')) $('chineseSymbolOpacity').value = String(overviewOpacity);
  if ($('chineseSymbolOpacityValue'))
    $('chineseSymbolOpacityValue').textContent = Math.round(overviewOpacity * 100) + '%';
  if ($('chineseSkyArtCoverage'))
    $('chineseSkyArtCoverage').hidden = settings.skyCulture !== 'chinese';
  if ($('constellationBoundaries')) {
    $('constellationBoundaries').disabled = settings.skyCulture === 'chinese';
    if ($('constellationBoundaries').parentElement)
      $('constellationBoundaries').parentElement.hidden = settings.skyCulture === 'chinese';
  }
  $('starLabelDensity').value = String(settings.starLabelDensity);
  $('starLabelDensity').disabled = false;
  $('deepSkyScope').value = settings.deepSkyScope;
  $('deepSkyScope').disabled = !settings.deepSkyObjects;
  $('starDensityAll').hidden = settings.starLabelDensity < 1;
  $('starDensityAuto').hidden = settings.starLabelDensity >= 1;
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined')
    window.dispatchEvent(
      new CustomEvent('starorbit-sky-culture', { detail: settings.skyCulture || 'western' })
    );
}

export function bindStarChartControls(settings, onChange) {
  const $ = (id) => document.getElementById(id),
    changed = () => {
      syncStarChartControls(settings);
      onChange();
    };
  if ($('skyCulture'))
    $('skyCulture').onchange = () => {
      settings.skyCulture = $('skyCulture').value === 'chinese' ? 'chinese' : 'western';
      changed();
    };
  for (const key of ['westernArtBrightness', 'chineseArtBrightness'])
    if ($(key))
      $(key).oninput = () => {
        const value = Number($(key).value);
        if (Number.isFinite(value)) settings[key] = Math.max(0, Math.min(2, value));
        changed();
      };
  for (const [key, id] of Object.entries(checkboxIds))
    if ($(id))
      $(id).onchange = () => {
        settings[key] = $(id).checked;
        changed();
      };
  if ($('chineseSymbolOpacity'))
    $('chineseSymbolOpacity').oninput = () => {
      const value = Number($('chineseSymbolOpacity').value);
      if (Number.isFinite(value)) settings.chineseSymbolOpacity = Math.max(0, Math.min(1, value));
      changed();
    };
  $('deepSkyScope').onchange = () => {
    settings.deepSkyScope = $('deepSkyScope').value;
    changed();
  };
  $('starLabelDensity').oninput = () => {
    settings.starLabelDensity = Number($('starLabelDensity').value);
    changed();
  };
  syncStarChartControls(settings);
}

export function skyCultureArtOptions(settings = {}) {
  return {
    culture: settings.skyCulture || 'western',
    asterisms: settings.constellationArt !== false,
    symbols: settings.skyCulture === 'chinese' && settings.chineseSymbolArt === true,
    overviewOpacity: settings.chineseSymbolOpacity ?? STAR_CHART_DEFAULTS.chineseSymbolOpacity,
    artBrightness:
      settings.skyCulture === 'chinese'
        ? (settings.chineseArtBrightness ?? STAR_CHART_DEFAULTS.chineseArtBrightness)
        : (settings.westernArtBrightness ?? STAR_CHART_DEFAULTS.westernArtBrightness),
  };
}

export function skyCultureArtEnabled(settings = {}) {
  return (
    settings.constellationArt !== false ||
    (settings.skyCulture === 'chinese' && settings.chineseSymbolArt === true)
  );
}

// Apply the requested quieter startup once; later explicit maximum selections
// and scene imports remain valid and are never silently reduced.
export function migrateStarDensityDefault(settings, storage) {
  const key = 'starorbit-star-density-default-v110';
  try {
    if (storage.getItem(key)) return;
    if (settings.starLabelDensity === 1)
      settings.starLabelDensity = STAR_CHART_DEFAULTS.starLabelDensity;
    storage.setItem('tiangong-environment-v1', JSON.stringify(settings));
    storage.setItem(key, '1');
  } catch {}
}

// Older releases did not record whether catalogue labels were explicitly
// chosen or inherited from their default. Apply this quieter default once;
// keeping the marker in the same JSON as the setting makes the save atomic.
// Later checkbox changes and imported scenes may freely enable the category.
export function migrateCatalogStarDefault(settings, storage) {
  if (settings.starChartCatalogDefaultVersion === 1) return;
  settings.catalogStarLabels = STAR_CHART_DEFAULTS.catalogStarLabels;
  settings.starChartCatalogDefaultVersion = 1;
  try {
    storage.setItem('tiangong-environment-v1', JSON.stringify(settings));
  } catch {
    // A later successful environment save still carries the migration marker.
  }
}
