import { layoutSpacecraftLabels } from './spacecraft-label-layout.js';

// 主画面上会盖住航天器标签的浮动窗口、工具栏与侧栏（沉浸模式下浮在画面上）。
export const SPACECRAFT_LABEL_OBSTACLES = Object.freeze([
  '#telemetry',
  '#orbitMinimap',
  '#toolsToggle',
  '#toolbarActions',
  '#viewActions',
  '#xuntianScope',
  '#helpPanel',
  '#attitudeNavballPanel',
  '#eventTimeline',
  '#orbitEventDetail',
  '#musicWidget',
  '#musicPanel',
  '#musicVolumePanel',
  '#dfh1Panel',
  'aside',
]);
const LOOKUP_FRAMES = 120,
  RETRY_FRAMES = 30;
const VISIBILITY = {
  checkOpacity: true,
  checkVisibilityCSS: true,
  opacityProperty: true,
  visibilityProperty: true,
};
const px = (value) => `${Math.round(value * 10) / 10}px`;

// 无法读取排版信息时按 11px 字号粗估尺寸：内边距 8+8、边框 1+1。
export function estimateLabelSize(text = '') {
  let width = 18;
  for (const char of String(text)) width += char.codePointAt(0) > 0x2e80 ? 11 : 6.2;
  return { width, height: 23 };
}

// 每帧把标签放进画面：先完成所有读取（遮挡窗口矩形、需要重新测量的标签尺寸），
// 再计算布局，最后只写入有变化的样式，避免读写交错造成的强制重排。
export function createSpacecraftLabelPlacer({
  stage = null,
  root = null,
  obstacles = SPACECRAFT_LABEL_OBSTACLES,
  layout = {},
} = {}) {
  const sizes = new WeakMap();
  let memory = null,
    frame = 0,
    elements = [],
    lookupAt = 0;
  function obstacleElements() {
    if (!root?.querySelector) return [];
    if (frame >= lookupAt || elements.some((el) => !el.isConnected)) {
      elements = [...new Set(obstacles.map((selector) => root.querySelector(selector)))].filter(
        Boolean
      );
      lookupAt = frame + LOOKUP_FRAMES;
    }
    return elements;
  }
  function readObstacles() {
    const list = obstacleElements();
    if (!list.length || !stage?.getBoundingClientRect) return [];
    const origin = stage.getBoundingClientRect(),
      boxes = [];
    for (const el of list) {
      if (el.hidden || el.checkVisibility?.(VISIBILITY) === false) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      boxes.push({
        left: r.left - origin.left,
        top: r.top - origin.top,
        right: r.right - origin.left,
        bottom: r.bottom - origin.top,
      });
    }
    return boxes;
  }
  return {
    // entries: [{ id, el, x, y, visible, priority }]，x/y 为画面内锚点像素坐标。
    place(entries, { width, height, language = '' } = {}) {
      frame++;
      const active = entries.filter((entry) => entry.visible),
        view = `${language}|${width}x${height}`;
      // 文字、语言或视口变化后才重新测量；被隐藏的标签临时以 visibility:hidden 显示。
      const measure = [],
        revealed = [];
      for (const entry of active) {
        const key = `${view}|${entry.el.textContent}`,
          cached = sizes.get(entry.el);
        if (cached?.key === key && !(cached.retryAt && frame >= cached.retryAt)) continue;
        measure.push({ entry, key });
        if (entry.el.style.display === 'none') {
          entry.el.style.visibility = 'hidden';
          entry.el.style.display = 'block';
          revealed.push(entry.el);
        }
      }
      // —— 读取阶段 ——
      const blockers = active.length ? readObstacles() : [];
      for (const { entry, key } of measure) {
        const rect = entry.el.getBoundingClientRect?.();
        if (!rect) sizes.set(entry.el, { key, ...estimateLabelSize(entry.el.textContent) });
        else if (rect.width && rect.height)
          sizes.set(entry.el, { key, width: rect.width, height: rect.height });
        // 尺寸为零说明被样式规则隐藏：暂不参与避让，稍后重新测量。
        else sizes.set(entry.el, { key, width: 0, height: 0, retryAt: frame + RETRY_FRAMES });
      }
      // —— 计算 ——
      const { placements, state } = layoutSpacecraftLabels({
        ...layout,
        width,
        height,
        previous: memory,
        obstacles: blockers,
        labels: entries.map(({ id, el, x, y, visible, priority }) => {
          const size = visible ? sizes.get(el) : null;
          return {
            id,
            x,
            y,
            width: size?.width,
            height: size?.height,
            priority,
            visible: !!visible,
          };
        }),
      });
      memory = state;
      // —— 写入阶段 ——
      for (const el of revealed) el.style.visibility = '';
      for (const { id, el } of entries) {
        const placement = placements[id],
          style = el.style,
          display = placement?.visible ? 'block' : 'none';
        if (style.display !== display) style.display = display;
        if (!placement?.visible) continue;
        const left = px(placement.left),
          top = px(placement.top);
        if (style.left !== left) style.left = left;
        if (style.top !== top) style.top = top;
      }
      return placements;
    },
  };
}
