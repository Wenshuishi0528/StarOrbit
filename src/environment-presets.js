// A saved view owns visual settings, never download policy or update history.
// Apply the same allowlist when reading legacy presets with extra fields.
const WEATHER_KEYS = [
  'cloud', 'aurora', 'cloudHistory', 'auroraHistory',
  'seed', 'auroraStrength', 'exposure', 'volume', 'motion',
];

export function presetWeatherSettings(settings = {}) {
  return Object.fromEntries(
    WEATHER_KEYS.filter(key => Object.hasOwn(settings, key)).map(key => [key, settings[key]]),
  );
}
