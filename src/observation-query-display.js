import { t } from './i18n.js';
import { clockText } from './time-format.js';
import { resultMode } from './observer-orbit-display.js';

export function observationQuerySummary(result, models) {
  const lines = [];
  if (result.query) {
    const q = result.query;
    lines.push(
      `${t(q.list ? '条件过境列表' : q.direction === 1 ? '下一次高仰角过境' : '上一次高仰角过境')} · ≥${q.minimumPeakElevation}° · ${t({ any: '白天与黑夜', day: '白天', night: '黑夜' }[q.daylight])}`
    );
    if (q.visibleOnly) lines.push(t('仅看最高点适合目视观测'));
    lines.push(t('基准时间') + '：' + clockText(q.referenceTime) + ' UTC+8');
  }
  if (!result.query) lines.push(t('最低仰角 {elevation}°', { elevation: result.minimumElevation }));
  lines.push(t('找到 {count} 次过境', { count: result.passes.length }));
  if (result.passes.length) {
    const night = result.passes.filter((p) => p.maximum.sunElevation < 0).length;
    lines.push(
      t('最高点在白天 {day} 次 · 夜间 {night} 次', { day: result.passes.length - night, night })
    );
  }
  if (result.passes.length) {
    lines.push(t(resultMode(result.mode, result.end < Date.now())));
    lines.push(
      t('其中 {count} 次有候选可见时段', { count: models.filter((m) => m.windows.length).length })
    );
  } else if (result.status === 'unreachable') {
    lines.push(
      t('该轨道在此地点的仰角上限约为 {elevation}°，请降低门槛或更换地点。', {
        elevation: result.reachability.upperBoundElevation.toFixed(1),
      })
    );
  } else
    lines.push(
      t(
        result.query && !result.query.list
          ? '已搜索至可计算时间边界，未找到达标过境。'
          : '未找到符合条件的过境，可延长时段或降低最低仰角。'
      )
    );
  lines.push(
    t('预报区间') + '：' + clockText(result.start) + ' — ' + clockText(result.end) + ' UTC+8'
  );
  if (result.clipped) lines.push(t('所选时段已按计算上限截短。'));
  return lines.join('\n');
}
