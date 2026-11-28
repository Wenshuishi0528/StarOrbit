import { Camera, SRGBColorSpace, WebGLRenderTarget } from 'three';
import { SkyDetailLayer } from './sky-detail-layer.js';
import { withSharedRenderer } from './xuntian-view-render.js';

// Use the same WCS/HiPS projection, cache, colours and GL context as the
// finder. Keep an independent view selection for each photographic plan.
export function createSurveyImagery(sim) {
  const manager = sim.environment.skyDetail,
    renderer = sim.api?.renderer;
  const size = 1320,
    camera = new Camera();
  let layer,
    target,
    key = '',
    overlay = null;
  function release() {
    layer?.dispose();
    target?.dispose();
    layer = target = overlay = null;
    key = '';
  }
  return {
    release,
    update(field, selection) {
      if (!manager || !renderer)
        return {
          status: {
            ...selection,
            enabled: true,
            active: true,
            fallback: 'unavailable',
            sources: [],
          },
        };
      layer ??= new SkyDetailLayer(manager, 'survey-plan', false, false, true);
      const view = {
        forward: field.center,
        right: field.east.map((v) => -v),
        up: field.north,
        fovY: 6,
        aspect: 1,
        pixelHeight: size,
        detailSelection: selection,
      };
      const status = layer.update(view, true);
      const ready = manager.ready(layer.id);
      const next = [
        field.id,
        selection.source,
        selection.background,
        ...ready.map((tile) => tile.key),
      ].join('|');
      if (next !== key) {
        overlay = null;
        if (ready.length) {
          target ??= new WebGLRenderTarget(size, size, {
            depthBuffer: false,
            colorSpace: SRGBColorSpace,
          });
          const bytes = new Uint8Array(4 * size * size);
          withSharedRenderer(renderer, () => {
            renderer.setRenderTarget(target);
            renderer.clear(true, false, false);
            renderer.render(layer.scene, camera);
            renderer.readRenderTargetPixels(target, 0, 0, size, size, bytes);
          });
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          const ctx = canvas.getContext('2d'),
            image = ctx.createImageData(size, size),
            row = size * 4;
          for (let y = 0; y < size; y++) {
            image.data.set(bytes.subarray((size - y - 1) * row, (size - y) * row), y * row);
          }
          // WebGL composited over transparent black, while ImageData takes
          // straight RGBA. Do not darken a soft coverage edge a second time.
          for (let i = 0; i < image.data.length; i += 4) {
            const alpha = image.data[i + 3];
            if (alpha > 0 && alpha < 255) {
              for (let channel = 0; channel < 3; channel++) image.data[i + channel] *= 255 / alpha;
            }
          }
          ctx.putImageData(image, 0, 0);
          overlay = canvas;
        }
        key = next;
      }
      return { status, overlay, key };
    },
  };
}
