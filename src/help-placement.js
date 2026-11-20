// A labelled control can have a separate caption (for example, above a select).
export function readingBounds(control) {
  const row =
    control.closest('label, .row, .sky-detail-row, .presets, .photo-actions, .angle-actions') ||
    control;
  const parts = [row, ...(control.labels || [])].flatMap((el) => Array.from(el.getClientRects()));
  return parts.length
    ? {
        left: Math.min(...parts.map((r) => r.left)),
        right: Math.max(...parts.map((r) => r.right)),
        top: Math.min(...parts.map((r) => r.top)),
        bottom: Math.max(...parts.map((r) => r.bottom)),
      }
    : control.getBoundingClientRect();
}

// Prefer leaving the whole working panel free. In a short viewport the card can
// scroll internally, but the label, the target and the guide controls stay visible.
export function placeGuide(target, workspace, width, height, cardWidth, cardHeight) {
  const margin = 8,
    gap = 15;
  const roomWidth = width - 2 * margin,
    roomHeight = height - 2 * margin;
  const cx = (target.left + target.right) / 2,
    cy = (target.top + target.bottom) / 2;
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), Math.max(lo, hi));
  function around(rect) {
    const zones = [];
    const right = rect.right + gap,
      left = rect.left - gap - cardWidth;
    if (right + cardWidth <= width - margin)
      zones.push({ x: right, top: margin, room: roomHeight, align: 'middle' });
    if (left >= margin) zones.push({ x: left, top: margin, room: roomHeight, align: 'middle' });
    const x = clamp(cx - cardWidth / 2, margin, margin + roomWidth - cardWidth);
    const below = rect.bottom + gap;
    zones.push(
      { x, top: below, room: height - margin - below, align: 'start' },
      { x, top: margin, room: rect.top - gap - margin, align: 'end' }
    );
    return zones.filter((z) => z.room > 0);
  }
  // A floating menu or a padded highlight can extend beyond its parent box.
  const outer = workspace
    ? around({
        left: Math.min(workspace.left, target.left),
        right: Math.max(workspace.right, target.right),
        top: Math.min(workspace.top, target.top),
        bottom: Math.max(workspace.bottom, target.bottom),
      })
    : [];
  const options = [...outer, ...around(target)];
  const zone =
    outer.find((z) => z.room >= Math.min(cardHeight, 248)) ||
    options.find((z) => z.room >= cardHeight) ||
    options.reduce((best, z) => (!best || z.room > best.room ? z : best), null);
  if (!zone) return { x: margin, y: margin, maxHeight: roomHeight };
  const used = Math.min(cardHeight, Math.floor(zone.room));
  const y =
    zone.align === 'middle'
      ? clamp(cy - used / 2, zone.top, zone.top + zone.room - used)
      : zone.align === 'end'
        ? zone.top + zone.room - used
        : zone.top;
  return { x: zone.x, y, maxHeight: used };
}
