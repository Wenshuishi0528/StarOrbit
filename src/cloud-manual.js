import { LIVE_CLOUD_PROCESSING } from './cloud-texture.js';
// Manual display is separate from the conservative automatic recommendation.
export function manualCloudUsable(record) {
  return (
    record?.kind === 'cloud' &&
    !record.integrityFailed &&
    record.provider !== 'viirs' &&
    /^[a-f0-9]{64}$/.test(record.sha256 || '') &&
    record.manualValidation?.schema === 1 &&
    record.manualValidation.sha256 === record.sha256 &&
    record.manualValidation.validPixels > 0
  );
}
export function cloudWarnings(record) {
  const out = Array.isArray(record.warnings)
    ? record.warnings.filter((x) => typeof x === 'string')
    : [];
  if (record.provider === 'viirs')
    out.push('VIIRS 扫描预览有分区和缺测，不支持作为完整全球云图加载');
  if (record.provider === 'himawari')
    out.push('只显示向日葵实际观测到的云。覆盖外和缺测位置留空。');
  if (record.provider === 'gdps') out.push('模式总云量预报，包含南北极。');
  if (record.provider === 'gmgsi')
    out.push('NOAA 红外亮温显示冷云系；暖低云可能不明显，缺测处使用内置静态图');
  if (record.provider === 'github' && record.processing === LIVE_CLOUD_PROCESSING)
    out.push('增强云图，极区镜像已裁去；缺测极区使用内置静态图');
  else if (record.provider === 'github')
    out.push('旧 GitHub 增强图可能包含地表信号和镜像极区，仅供手动对比');
  const labels = {
    'high-opacity-plateau': '亮度平台可能异常',
    'dateline-seam': '日期线可能有接缝',
    'internal-seam': '图内可能有接缝',
  };
  for (const reason of Array.isArray(record.quality?.reasons) ? record.quality.reasons : [])
    out.push(labels[reason] || '旧检查提示：' + reason);
  if (record.provider === 'satcorps' && record.coverage < 0.995)
    out.push(`有效覆盖 ${(record.coverage * 100).toFixed(1)}%`);
  return [...new Set(out)];
}
