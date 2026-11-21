import * as THREE from 'three';

// A cheap distance pass uses the *same* terrain meshes, tile holes and camera.
// Atmospheric integration then stops at the mountain, not at sea level.
// All allocations belong to this view and are released on leaving it.
export function createGroundEarthCompositor({ renderer, scene, camera, root, uniforms, surfaces }) {
  let distance = null,
    translucent = null;
  const size = new THREE.Vector2(),
    viewport = new THREE.Vector4(),
    configuredViewport = new THREE.Vector4(),
    configuredScissor = new THREE.Vector4(),
    clearColor = new THREE.Color(),
    pixel = new Uint8Array(4);
  const screen = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    uniforms: { image: { value: null }, opacity: { value: 0.32 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:
      'uniform sampler2D image;uniform float opacity;varying vec2 vUv;void main(){vec4 c=texture2D(image,vUv);gl_FragColor=vec4(c.a>0.?c.rgb/c.a:vec3(0.),c.a*opacity);\n#include <colorspace_fragment>\n}',
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  screen.add(quad);
  function target(old) {
    old ||= new THREE.WebGLRenderTarget(size.x, size.y, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    if (old.width !== size.x || old.height !== size.y) old.setSize(size.x, size.y);
    return old;
  }
  return {
    render(seeThrough, effects) {
      const previous = renderer.getRenderTarget(),
        auto = renderer.autoClear;
      const face = renderer.getActiveCubeFace?.() ?? 0,
        mip = renderer.getActiveMipmapLevel?.() ?? 0;
      const alpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      // This is the active viewport in physical pixels, including its origin on
      // a scissored canvas or render target. The distance pass starts at (0,0).
      if (renderer.getCurrentViewport) renderer.getCurrentViewport(viewport);
      else if (previous) viewport.copy(previous.viewport);
      else {
        renderer.getDrawingBufferSize(size);
        viewport.set(0, 0, size.x, size.y);
      }
      size.set(Math.max(1, viewport.z), Math.max(1, viewport.w));
      distance = target(distance);
      uniforms.terrainViewport.value.copy(size);
      uniforms.terrainFar.value = camera.far;
      const visible = root.children.map((child) => [child, child.visible]);
      const terrain = new Set(surfaces());
      // setViewport/setScissor after binding a target can differ from the
      // target's configured rectangles. Three re-applies those rectangles on
      // every bind, so preserve the active state across the two private passes.
      const customViewport = previous && !previous.viewport.equals(viewport);
      const scissorTest = previous?.scissorTest;
      const scissorContext =
        previous && (customViewport || scissorTest || renderer.getScissorTest?.())
          ? renderer.getContext?.()
          : null;
      renderer.autoClear = false;
      try {
        if (customViewport) {
          configuredViewport.copy(previous.viewport);
          previous.viewport.copy(viewport);
        }
        if (scissorContext) {
          configuredScissor.copy(previous.scissor);
          previous.scissorTest = scissorContext.isEnabled(scissorContext.SCISSOR_TEST);
          if (previous.scissorTest)
            previous.scissor.fromArray(scissorContext.getParameter(scissorContext.SCISSOR_BOX));
        }
        for (const [child] of visible) if (!terrain.has(child)) child.visible = false;
        uniforms.surfaceDepthPass.value = 1;
        uniforms.terrainOcclusion.value = 0;
        renderer.setRenderTarget(distance);
        renderer.setClearColor(0xffffff, 1);
        renderer.clear();
        renderer.render(scene, camera);
        uniforms.surfaceDepthPass.value = 0;
        for (const [child, value] of visible) child.visible = value;
        uniforms.terrainDistance.value = distance.texture;
        uniforms.terrainOcclusion.value = 1;
        uniforms.terrainViewportOrigin.value.set(
          seeThrough ? 0 : viewport.x,
          seeThrough ? 0 : viewport.y
        );
        if (seeThrough) {
          translucent = target(translucent);
          renderer.setRenderTarget(translucent);
          renderer.setClearColor(0, 0);
          renderer.clear();
        } else renderer.setRenderTarget(previous, face, mip);
        renderer.render(scene, camera);
        effects();
        if (seeThrough) {
          renderer.setRenderTarget(previous, face, mip);
          material.uniforms.image.value = translucent.texture;
          renderer.render(screen, camera);
        } else if (translucent) {
          translucent.dispose();
          translucent = null;
          material.uniforms.image.value = null;
        }
      } finally {
        for (const [child, value] of visible) child.visible = value;
        uniforms.surfaceDepthPass.value = 0;
        uniforms.terrainOcclusion.value = 0;
        renderer.setRenderTarget(previous, face, mip);
        if (customViewport) previous.viewport.copy(configuredViewport);
        if (scissorContext) {
          previous.scissor.copy(configuredScissor);
          previous.scissorTest = scissorTest;
        }
        renderer.setClearColor(clearColor, alpha);
        renderer.autoClear = auto;
      }
    },
    blocksScreen(x, y) {
      if (!distance) return false;
      renderer.readRenderTargetPixels(
        distance,
        Math.max(0, Math.min(distance.width - 1, Math.floor((x * 0.5 + 0.5) * distance.width))),
        Math.max(0, Math.min(distance.height - 1, Math.floor((y * 0.5 + 0.5) * distance.height))),
        1,
        1,
        pixel
      );
      // White means background. Terrain distances are packed below .999999.
      return pixel[0] !== 255 || pixel[1] !== 255 || pixel[2] !== 255 || pixel[3] !== 255;
    },
    dispose() {
      distance?.dispose();
      translucent?.dispose();
      quad.geometry.dispose();
      material.dispose();
    },
  };
}
