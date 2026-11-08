// In telescope views the neighbouring station is one spacecraft. Assembly
// views retain module names, and only an actually visible free telescope
// activates the condensed station label.
export function spacecraftLabelNames(
  instances,
  { enabled = true, cameraTarget, scopeActive = false, translate = (key) => key } = {}
) {
  if (!enabled) return {};
  const visible = instances.filter((item) => item.visible);
  const names = Object.fromEntries(
    visible.map((item) => [item.id, item.id === 'freeXT' ? translate('巡天望远镜') : item.name])
  );
  if (visible.some((item) => item.id === 'freeXT') && (cameraTarget === 'xuntian' || scopeActive)) {
    const station = visible.filter((item) => item.id !== 'freeXT');
    const anchor = station.find((item) => item.type === 'TH') || station[0];
    for (const item of station) delete names[item.id];
    if (anchor) names[anchor.id] = translate('中国空间站');
  }
  return names;
}
