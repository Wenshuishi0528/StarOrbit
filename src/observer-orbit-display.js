import { t } from './i18n.js';
import { clockText } from './time-format.js';
import { predictionSource } from './pass-prediction.js';

export function orbitDescription(data, { archived = false } = {}) {
  try {
    const s = predictionSource(data, { allowEstimate: true, archived }),
      end = s.recordEnd ?? s.end;
    const lines = [
      data.source,
      t('数据历元') + ' · ' + clockText(s.epoch) + ' UTC+8',
      t(s.kind === 'sgp4' ? 'SGP4 有效区间' : '原始星历区间') +
        ' · ' +
        clockText(s.start) +
        ' — ' +
        clockText(end) +
        ' UTC+8',
    ];
    if (s.end > end)
      lines.push(
        t('本地估算止于 {end}，最多延伸 72 小时，不含之后的轨道机动。', {
          end: clockText(s.end) + ' UTC+8',
        })
      );
    return lines.filter(Boolean).join('\n');
  } catch (error) {
    return t(error.message);
  }
}
export const resultMode = (mode, historical = false) =>
  mode === 'estimate'
    ? '本地短期估算'
    : mode === 'mixed'
      ? '含区间外本地估算'
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
