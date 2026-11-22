// Sky geometry uses the same J2000 equatorial frame as the star catalogue.
export function sphereHidesDirection(direction, center, radius) {
  const along = direction[0] * center[0] + direction[1] * center[1] + direction[2] * center[2];
  return (
    along > 0 && center[0] ** 2 + center[1] ** 2 + center[2] ** 2 - along * along < radius * radius
  );
}
export function placeSkyLabels(
  candidates,
  width,
  height,
  density,
  reserved = [],
  { all = false, areaBudget = false, verticalInset = 0 } = {}
) {
  const gap = 4 + (1 - density) * 9,
    limit = all
      ? Infinity
      : areaBudget
        ? Math.max(8, Math.round(((width * height) / 9000) * (0.15 + 4 * density * density)))
        : Math.round(18 + density * 78),
    edgeY = Math.max(5, verticalInset),
    cell = 32,
    cols = Math.max(1, Math.ceil(width / cell)),
    rows = Math.max(1, Math.ceil(height / cell)),
    buckets = [],
    placed = [];
  function scan(rect, register) {
    const pad = register ? 0 : gap;
    const left = Math.min(cols - 1, Math.max(0, Math.floor((rect.x - pad) / cell)));
    const right = Math.max(0, Math.min(cols - 1, Math.floor((rect.x + rect.w + pad) / cell)));
    const top = Math.min(rows - 1, Math.max(0, Math.floor((rect.y - pad) / cell)));
    const bottom = Math.max(0, Math.min(rows - 1, Math.floor((rect.y + rect.h + pad) / cell)));
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        const key = y * cols + x;
        if (register) {
          (buckets[key] ??= []).push(rect);
          continue;
        }
        if (!buckets[key]) continue;
        for (const other of buckets[key]) {
          if (
            rect.x < other.x + other.w + gap &&
            rect.x + rect.w + gap > other.x &&
            rect.y < other.y + other.h + gap &&
            rect.y + rect.h + gap > other.y
          )
            return true;
        }
      }
    return false;
  }
  function tryPlace(item, dx, dy) {
    const x = item.x + dx,
      y = item.y + dy;
    if (x < 5 || y < edgeY || x + item.w > width - 5 || y + item.h > height - edgeY) return false;
    const rect = { x, y, w: item.w, h: item.h };
    if (scan(rect, false)) return false;
    scan(rect, true);
    placed.push({ ...item, dx, dy, rect });
    return true;
  }
  // Thousands of deep-sky symbols may reserve label space in a single wide
  // field. Look up only the cells a candidate touches, including its margin.
  if (!all) for (const rect of reserved) scan(rect, true);
  for (const item of candidates) {
    if (placed.length >= limit) break;
    const anchor = Math.max(
      8,
      Number.isFinite(item.anchorRadius) && item.anchorRadius > 0 ? item.anchorRadius + gap + 2 : 8
    );
    if (all) {
      const initialX = item.centered ? -item.w / 2 : anchor,
        initialY = -item.h / 2,
        x = Math.max(0, Math.min(width - item.w, item.x + initialX)),
        y = Math.max(verticalInset, Math.min(height - verticalInset - item.h, item.y + initialY));
      placed.push({
        ...item,
        dx: x - item.x,
        dy: y - item.y,
        rect: { x, y, w: item.w, h: item.h },
      });
      continue;
    }
    const verticalAnchor = Math.max(8, (item.symbol?.height || 0) / 2 + gap + 2);
    const centeredX = Math.max(5 - item.x, Math.min(width - 5 - item.w - item.x, -item.w / 2));
    if (item.centered) {
      tryPlace(item, -item.w / 2, -item.h / 2);
      continue;
    }
    const left = -item.w - anchor;
    if (tryPlace(item, anchor, -item.h / 2) || tryPlace(item, left, -item.h / 2)) continue;
    if (tryPlace(item, anchor, -item.h - 7) || tryPlace(item, anchor, 7)) continue;
    if (tryPlace(item, left, -item.h - 7) || tryPlace(item, left, 7)) continue;
    if (!tryPlace(item, centeredX, -item.h - verticalAnchor))
      tryPlace(item, centeredX, verticalAnchor);
  }
  return placed;
}
