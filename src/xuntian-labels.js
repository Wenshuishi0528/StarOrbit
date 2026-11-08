import { buildSkyAnnotationLayout } from './sky-annotation-layout.js';

// Lay out in logical pixels. The preview and exported image each use their own
// detector dimensions while the projection uses the same rolled optical axes.
export function finderLabels(frame, size, scale, blocked, { hud = false } = {}) {
  const { axes, language } = frame,
    width = size.w / scale,
    height = size.h / scale;
  return {
    scale,
    ...buildSkyAnnotationLayout({
      settings: frame.chartSettings,
      axes,
      eyeKm: frame.eyeKm,
      q: frame.q,
      fovY: frame.fovY,
      width,
      height,
      language,
      focusTargetId: frame.focusTargetId,
      // Only the preview has clock/coordinate readouts. There is deliberately
      // no reserved region around the reticle; photos use the whole detector.
      verticalInset: hud ? 24 : 0,
      blocked,
    }),
  };
}
export function paintFinderLabels(canvas, layout) {
  if (!layout?.labels.length) return;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(layout.scale, layout.scale);
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(2,8,15,.94)';
  for (const label of layout.labels) {
    const { text, rect, symbol } = label;
    ctx.font = '500 ' + (label.font || 13) + 'px sans-serif';
    if (symbol) {
      ctx.save();
      ctx.translate(label.x, label.y);
      ctx.rotate(symbol.rotation || 0);
      ctx.beginPath();
      const rx = symbol.width / 2,
        ry = symbol.height / 2;
      if (symbol.shape === 'box') ctx.rect(-rx, -ry, rx * 2, ry * 2);
      else ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      if (symbol.shape === 'cross-circle') {
        ctx.moveTo(-rx, 0);
        ctx.lineTo(rx, 0);
        ctx.moveTo(0, -ry);
        ctx.lineTo(0, ry);
      }
      ctx.strokeStyle = '#06121bc0';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = symbol.color;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle =
      (label.selected ? '#ffe5b3' : null) ||
      label.color ||
      symbol?.labelColor ||
      (label.kind === 'solar' ? '#ffdcab' : label.kind === 'constellation' ? '#d0c09a' : '#d0e5f3');
    ctx.strokeText(text, rect.x + 2, rect.y + 2);
    ctx.fillText(text, rect.x + 2, rect.y + 2);
  }
  ctx.restore();
}
