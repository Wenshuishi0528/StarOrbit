// 航天器标签避让布局。纯函数：输入视口尺寸、锚点屏幕坐标、标签尺寸、优先级
// 与遮挡矩形，输出每个标签的最终位置与显隐，不读写 DOM。
//
// 标签元素以 transform: translate(-50%, -130%) 绘制：left/top 为锚点时，
// 标签水平居中，底边位于锚点上方 0.3 倍标签高度处。
export const LABEL_LAYOUT_DEFAULTS = Object.freeze({
  gap: 4, // 标签之间、标签与窗口之间的最小间距（像素）
  margin: 4, // 与视口边缘的最小距离
  holdFrames: 6, // 因拥挤而显隐切换前须连续满足的帧数
  hysteresis: 6, // 回到更近候选位时额外要求的空隙，避免在边界来回跳动
});
const LIFT = 1.3;
const CLAMP_SLOT = 'clamp';

export function labelBox(x, y, width, height) {
  const left = x - width / 2,
    top = y - LIFT * height;
  return { left, top, right: left + width, bottom: top + height };
}

// 候选偏移：默认（锚点正上方）、再上一格、锚点两侧、锚点下方以及更远一格，
// 按位移距离由近到远尝试。slot 编号与尺寸无关，可跨帧沿用。
const candidateCache = new Map();
export function labelCandidates(width, height, gap = LABEL_LAYOUT_DEFAULTS.gap) {
  const key = `${width}|${height}|${gap}`;
  let list = candidateCache.get(key);
  if (list) return list;
  const row = height + gap,
    half = (width + gap) / 2,
    side = (LIFT - 0.5) * height,
    below = 2 * (LIFT - 0.5) * height;
  const xs = [0, half, -half, 2 * half, -2 * half],
    ys = [0, -row, side, below, -2 * row, below + row];
  list = [];
  ys.forEach((dy, yi) =>
    xs.forEach((dx, xi) => {
      // 与锚点垂直居中且水平不偏移时会盖住舱体本身，不作候选。
      if (dy === side && dx === 0) return;
      list.push({ slot: yi * xs.length + xi, dx, dy, cost: Math.hypot(dx, dy) });
    })
  );
  list.sort((a, b) => a.cost - b.cost || a.slot - b.slot);
  if (candidateCache.size > 64) candidateCache.clear();
  candidateCache.set(key, list);
  return list;
}

const overlaps = (a, b, gap) =>
  a.left < b.right + gap &&
  b.left < a.right + gap &&
  a.top < b.bottom + gap &&
  b.top < a.bottom + gap;
const inside = (box, width, height, margin) =>
  box.left >= margin &&
  box.top >= margin &&
  box.right <= width - margin &&
  box.bottom <= height - margin;
const sized = (value) => Number.isFinite(value) && value > 0;

// 相机当前选中的航天器对应哪个标签：巡天望远镜、单个舱段，或以核心舱代表整站。
export function focusedLabelId(selected, labels = []) {
  if (typeof selected !== 'string') return null;
  const has = (id) => labels.some((item) => item.id === id);
  if (selected === 'xuntian') return has('freeXT') ? 'freeXT' : null;
  if (selected.startsWith('module:')) {
    const id = selected.slice('module:'.length);
    return has(id) ? id : null;
  }
  if (selected === 'mission') {
    const station = labels.filter((item) => item.id !== 'freeXT');
    return (station.find((item) => item.type === 'TH') || station[0])?.id ?? null;
  }
  return null;
}

// labels: [{ id, x, y, width, height, priority = 0, visible = true }]
// obstacles: [{ left, top, right, bottom }]，与 x/y 同一坐标系
// previous: 上一帧返回的 state；返回 { placements: { [id]: placement }, state }
export function layoutSpacecraftLabels({
  width,
  height,
  labels = [],
  obstacles = [],
  previous = null,
  ...overrides
} = {}) {
  const options = { ...LABEL_LAYOUT_DEFAULTS, ...overrides },
    { gap, margin, holdFrames, hysteresis } = options;
  const placements = {},
    state = new Map(),
    placed = [];
  const blockers = obstacles.filter(
    (box) =>
      box &&
      box.right > box.left &&
      box.bottom > box.top &&
      box.right > 0 &&
      box.bottom > 0 &&
      box.left < width &&
      box.top < height
  );
  const order = labels
    .map((label, index) => ({ label, index }))
    .sort((a, b) => (b.label.priority || 0) - (a.label.priority || 0) || a.index - b.index);
  for (const { label } of order) {
    const { id, x, y } = label,
      w = label.width,
      h = label.height;
    const hidden = { visible: false, left: x, top: y, dx: 0, dy: 0, slot: null, box: null };
    if (
      label.visible === false ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !sized(w) ||
      !sized(h)
    ) {
      // 不可见（关闭标签、离开视野）立即隐藏，并清除记忆，下次出现时直接判断。
      placements[id] = hidden;
      continue;
    }
    const base = labelBox(x, y, w, h);
    const boxAt = ({ dx, dy }) => ({
      left: base.left + dx,
      top: base.top + dy,
      right: base.right + dx,
      bottom: base.bottom + dy,
    });
    const fits = (candidate, pad = 0) => {
      const box = boxAt(candidate);
      return (
        inside(box, width, height, margin + pad) &&
        !blockers.some((other) => overlaps(box, other, gap + pad)) &&
        !placed.some((other) => overlaps(box, other, gap + pad))
      );
    };
    const candidates = labelCandidates(w, h, gap);
    // 锚点贴近视口边缘时，把默认位置平移进视口作为最后的候选。
    let clamped = null;
    if (w <= width - 2 * margin && h <= height - 2 * margin) {
      const dx = Math.min(Math.max(base.left, margin), width - margin - w) - base.left,
        dy = Math.min(Math.max(base.top, margin), height - margin - h) - base.top;
      if (dx || dy) clamped = { slot: CLAMP_SLOT, dx, dy, cost: Infinity };
    }
    const all = clamped ? [...candidates, clamped] : candidates;
    const memory = previous?.get?.(id) || null,
      kept = memory?.shown ? all.find((item) => item.slot === memory.slot) || null : null;
    let choice;
    if (kept && fits(kept)) {
      // 上一帧的位置仍然空闲：只有更近的位置留出额外空隙时才回迁。
      choice = kept;
      for (const candidate of all) {
        if (candidate === kept) break;
        if (fits(candidate, hysteresis)) {
          choice = candidate;
          break;
        }
      }
    } else choice = all.find((candidate) => fits(candidate)) || null;

    const wanted = !!choice;
    let shown = wanted,
      pending = 0;
    if (memory && memory.shown !== wanted) {
      pending = memory.pending + 1;
      if (pending < holdFrames) shown = memory.shown;
      else pending = 0;
    }
    if (!shown) {
      placements[id] = hidden;
      state.set(id, { shown: false, slot: null, pending });
      continue;
    }
    // 拥挤时暂留数帧：沿用上一帧的位置，随后再隐藏。
    const use = choice || kept || candidates[0],
      box = boxAt(use);
    placed.push(box);
    placements[id] = {
      visible: true,
      left: x + use.dx,
      top: y + use.dy,
      dx: use.dx,
      dy: use.dy,
      slot: use.slot,
      box,
    };
    state.set(id, { shown: true, slot: use.slot, pending });
  }
  return { placements, state };
}
