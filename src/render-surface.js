import { Vector2 } from 'three';

// The active view owns the shared canvas. CSS controls its display size;
// backing pixels and viewport follow the host and current browser zoom/DPR.
const size = new Vector2();
export function resizeRenderSurface(
  renderer,
  width,
  height,
  pixelRatio = globalThis.devicePixelRatio || 1
) {
  if (width < 1 || height < 1) return false;
  const ratio = Math.min(Math.max(pixelRatio, 0.1), 1.6);
  renderer.getSize(size);
  if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
  if (size.x !== width || size.y !== height) renderer.setSize(width, height, false);
  renderer.setViewport(0, 0, width, height);
  renderer.setScissorTest(false);
  return true;
}
