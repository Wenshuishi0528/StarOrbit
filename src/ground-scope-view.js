import * as THREE from 'three';
import { createSharedWorldEarth, groundRenderPose } from './shared-world-earth.js';
import { createGroundSky } from './ground-world-sky.js';

// One WebGL context serves both cameras. Only the instrument allocates this
// field-sized target. Photographing temporarily renders the same field at export size.
export function createGroundScopeView({
  environment,
  renderer,
  stage,
  window,
  panel,
  pose,
  surface,
}) {
  const sky = createGroundSky({ environment, renderer, id: 'ground-scope' });
  const earth = createSharedWorldEarth({ environment, renderer, id: 'ground-scope-earth' });
  const floatTarget = renderer.extensions.has('EXT_color_buffer_float');
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: floatTarget ? THREE.HalfFloatType : THREE.UnsignedByteType,
    // Hardware sRGB storage preserves shadow detail in the eight-bit eyepiece and photo.
    colorSpace: floatTarget ? THREE.NoColorSpace : THREE.SRGBColorSpace,
    depthBuffer: true,
  });
  const quadScene = new THREE.Scene(),
    camera = new THREE.Camera();
  const display = new THREE.MeshBasicMaterial({
    map: target.texture,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), display);
  quad.frustumCulled = false;
  quadScene.add(quad);
  const viewport = new THREE.Vector4(),
    scissor = new THREE.Vector4();
  let status,
    view,
    lastPaint = -Infinity,
    lastRect,
    lastPose,
    lastTime = -Infinity,
    interactiveUntil = -Infinity;
  const blocked = (x, y) => earth.terrainBlocksScreen(x, y, true);
  const photoBlocked = (x, y) => earth.terrainBlocksScreen(x, y);
  Object.defineProperty(blocked, 'revision', { get: () => earth.maskRevision });
  function render(buffer, time, settings, observatory, sample, width, height, dpr) {
    const previous = renderer.getRenderTarget();
    try {
      buffer.setSize(Math.max(1, Math.round(width * dpr)), Math.max(1, Math.round(height * dpr)));
      renderer.setRenderTarget(buffer);
      view = {
        ...panel.view({ ...settings, finderEnhanced: observatory.finderEnhanced }, width, height),
        finderEnhanced: observatory.finderEnhanced,
        pixelRatio: dpr,
      };
      status = sky.update(pose.site, time, pose, view, width, height, sample);
      sky.render();
      earth.update({
        time,
        ...groundRenderPose(pose.site, time, sky.camera.quaternion),
        fov: view.fov,
        aspect: width / height,
        width,
        height,
        pixelRatio: dpr,
        nearPatch: surface.getPatch(),
        landscapeView:
          buffer === target
            ? {
                site: pose.site,
                rotation: sky.camera.quaternion,
                clearSky: surface.clearsSky(pose.site, pose.elevation, view.fov, width / height),
              }
            : null,
        daylightTerrain: observatory.daylightTerrain,
        hideGeography: true,
        finderEnhanced: observatory.finderEnhanced,
      });
      renderer.clearDepth();
      earth.render();
    } finally {
      renderer.setRenderTarget(previous);
    }
  }
  function present(rect) {
    const base = stage.getBoundingClientRect(),
      x = rect.left - base.left,
      y = base.bottom - rect.bottom;
    renderer.getViewport(viewport);
    renderer.getScissor(scissor);
    const test = renderer.getScissorTest();
    try {
      renderer.setViewport(x, y, rect.width, rect.height);
      renderer.setScissor(x, y, rect.width, rect.height);
      renderer.setScissorTest(true);
      renderer.render(quadScene, camera);
    } finally {
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(test);
    }
  }
  return {
    sky,
    earth,
    // Only credit the foreground in a photograph that includes visible terrain.
    photoHasGround() {
      for (const y of [-0.98, -0.7, 0, 0.7, 0.98]) {
        for (const x of [-0.98, -0.7, 0, 0.7, 0.98]) {
          if (photoBlocked(x, y)) return true;
        }
      }
      return false;
    },
    get view() {
      return view;
    },
    clearsSky() {
      const { width, height } = window.frame.getBoundingClientRect();
      return (
        width > 0 &&
        height > 0 &&
        surface.clearsSky(
          pose.site,
          pose.elevation,
          panel.cameraField(width, height),
          width / height
        )
      );
    },
    interacting(wall) {
      return wall < interactiveUntil;
    },
    invalidate() {
      interactiveUntil = performance.now() + 150;
      lastPaint = -Infinity;
    },
    update(wall, time, settings, observatory, reading) {
      const rect = window.frame.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const currentPose = [pose.azimuth, pose.elevation, pose.rollDegrees, panel.field].join('|');
      if (
        wall < interactiveUntil ||
        currentPose !== lastPose ||
        wall - lastPaint >= (Math.abs(time - lastTime) > 150 ? 32 : 100) ||
        rect.width !== lastRect?.width ||
        rect.height !== lastRect?.height
      ) {
        render(
          target,
          time,
          settings,
          observatory,
          reading.sky,
          rect.width,
          rect.height,
          // Keep the second live buffer within a 2560 × 1600 pixel budget on large displays.
          Math.min(renderer.getPixelRatio(), Math.sqrt((2560 * 1600) / (rect.width * rect.height)))
        );
        panel.paint({
          wall,
          width: rect.width,
          height: rect.height,
          status,
          blocked,
          hud: window.hud,
        });
        lastTime = time;
        lastPose = currentPose;
        lastPaint = wall;
        lastRect = rect;
      }
      present(rect);
    },
    capture(time, settings, observatory, reading) {
      const width =
        panel.prefs.photoWidth ||
        Math.max(
          1,
          Math.round(window.frame.getBoundingClientRect().width * renderer.getPixelRatio())
        );
      const height = Math.max(1, Math.round((width * 5) / 8));
      const photo = target.clone(),
        encoded = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false });
      // Write display-encoded RGB explicitly. A non-XR render target normally receives linear RGB.
      const encode = new THREE.ShaderMaterial({
        uniforms: { image: { value: photo.texture } },
        vertexShader: 'varying vec2 tex;void main(){tex=uv;gl_Position=vec4(position.xy,0.,1.);}',
        fragmentShader:
          'uniform sampler2D image;varying vec2 tex;void main(){vec3 c=max(texture2D(image,tex).rgb,vec3(0.));gl_FragColor=vec4(mix(12.92*c,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c)),1.);}',
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const prior = renderer.getRenderTarget();
      try {
        render(
          photo,
          time,
          { ...settings, photoAnnotations: panel.prefs.photoAnnotations },
          observatory,
          reading.sky,
          width,
          height,
          1
        );
        const overlay = panel.photoOverlay({
          width,
          height,
          annotations: panel.prefs.photoAnnotations,
          status,
          blocked: photoBlocked,
        });
        quad.material = encode;
        renderer.setRenderTarget(encoded);
        renderer.render(quadScene, camera);
        const pixels = new Uint8Array(width * height * 4);
        renderer.readRenderTargetPixels(encoded, 0, 0, width, height, pixels);
        const output = document.createElement('canvas');
        output.width = width;
        output.height = height;
        const ctx = output.getContext('2d'),
          img = ctx.createImageData(width, height),
          row = width * 4;
        for (let i = 0; i < height; i++)
          img.data.set(pixels.subarray(i * row, (i + 1) * row), (height - 1 - i) * row);
        ctx.putImageData(img, 0, 0);
        if (overlay) ctx.drawImage(overlay, 0, 0, width, height);
        return output;
      } finally {
        quad.material = display;
        renderer.setRenderTarget(prior);
        encoded.dispose();
        photo.dispose();
        encode.dispose();
        lastPaint = -Infinity;
      }
    },
    dispose() {
      sky.dispose();
      earth.dispose();
      target.dispose();
      quad.geometry.dispose();
      display.dispose();
    },
  };
}
