import { t } from './i18n.js';
import { clockText } from './time-format.js';
import { predictionSource } from './pass-prediction.js';

export function orbitDescription(data, { archived = false } = {}) {
  try {
    const s = predictionSource(data, { allowEstimate: true, archived }),
      end = s.recordEnd;
    const lines = [
      data.source,
      t('数据历元') + ' · ' + clockText(s.epoch) + ' UTC+8',
      t('原始星历区间') + ' · ' + clockText(s.recordStart) + ' — ' + clockText(end) + ' UTC+8',
    ];
    lines.push(t('区间外按当前轨道状态继续演算，包含轨道摄动。'));
    return lines.filter(Boolean).join('\n');
  } catch (error) {
    return t(error.message);
  }
}
export const resultMode = (mode, historical = false) =>
  mode === 'estimate'
    ? '轨道延续演算'
    : mode === 'mixed'
      ? '含轨道延续演算'
      : historical
        ? '原始星历回放'
        : '有效星历';
export function updateReport(weather, id, outcome) {
  const message = weather.resourceState?.('orbit', id)?.message;
  return typeof message === 'string'
    ? t(message)
    : message?.key
      ? t(message.key, message.params)
      : t(outcome.status === 'unchanged' ? '已是最新可用数据' : '轨道已更新，请重新计算。');
}
