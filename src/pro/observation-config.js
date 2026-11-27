// Decimal MB and Mbit/s. Values are editable study assumptions.
export const observationFields = {
  maxOffNadirDeg: [50, 0, 90, '°'],
  minSunElevationDeg: [10, -90, 90, '°'],
  minStationElevationDeg: [25, 0, 90, '°'],
  settlingSec: [8, 0, 3600, 's'],
  cadenceSec: [20, 10, 86400, 's'],
  exposureSec: [3, 0.1, 3600, 's'],
  rawMB: [32, 0.001, 100000, 'MB'],
  storeMB: [192, 0.001, 10000000, 'MB'],
  downlinkMbps: [1.6, 0.001, 10000, 'Mbit/s'],
  cameraW: [12, 0, 1000, 'W'],
  radioW: [10, 0, 1000, 'W'],
  processorW: [14, 0, 1000, 'W'],
  processingSec: [14, 0.1, 86400, 's'],
  outputFraction: [0.35, 0.001, 1, ''],
  usefulFraction: [0.65, 0, 1, ''],
  usefulKeep: [0.9, 0, 1, ''],
  otherKeep: [0.15, 0, 1, ''],
  seed: [42, 0, 4294967295, ''],
};

export function defaultObservation() {
  return {
    target: { name: '青海湖', latDeg: 36.9, lonDeg: 100.2, heightM: 3200 },
    station: { name: '北京示例站', latDeg: 40, lonDeg: 116, heightM: 50 },
    ...Object.fromEntries(Object.entries(observationFields).map(([k, [initial]]) => [k, initial])),
    strategies: [
      { mode: 'raw', delaySec: 0 },
      { mode: 'filter', delaySec: 0 },
    ],
    parameterSource:
      '方案研究假设。设备功耗、处理时间、压缩比和有用影像比例可替换为实测数据，站点与链路为示例配置。',
  };
}

function numeric(value, min, max, field) {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(field);
  return value;
}

function readSite(site, field) {
  if (!site || typeof site.name !== 'string' || !site.name.trim() || site.name.trim().length > 60) {
    throw new RangeError(field);
  }
  return {
    name: site.name.trim(),
    latDeg: numeric(site.latDeg, -90, 90, field),
    lonDeg: numeric(site.lonDeg, -180, 180, field),
    heightM: numeric(site.heightM, -500, 9000, field),
  };
}

export function validateObservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new RangeError('observation');
  const target = readSite(input.target, 'observationTarget'),
    station = readSite(input.station, 'observationStation');
  const numbers = {};
  for (const [key, [, min, max]] of Object.entries(observationFields)) {
    numbers[key] = numeric(input[key], min, max, key);
  }
  if (!Number.isInteger(numbers.seed)) throw new RangeError('seed');
  if (numbers.cadenceSec < numbers.exposureSec) throw new RangeError('observationCadence');
  if (!Array.isArray(input.strategies) || input.strategies.length !== 2)
    throw new RangeError('observationStrategy');
  const strategies = input.strategies.map((strategy) => {
    if (!strategy || !['raw', 'filter'].includes(strategy.mode))
      throw new RangeError('observationStrategy');
    return { mode: strategy.mode, delaySec: numeric(strategy.delaySec, 0, 86400, 'delaySec') };
  });
  const parameterSource = input.parameterSource ?? '';
  if (typeof parameterSource !== 'string' || parameterSource.length > 300)
    throw new RangeError('parameterSource');
  return { target, station, ...numbers, strategies, parameterSource: parameterSource.trim() };
}
