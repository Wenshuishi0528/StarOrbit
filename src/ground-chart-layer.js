import * as THREE from 'three';

// Dense catalogue text has fixed celestial anchors. Reuse its native-resolution
// transparent layer through short turns; stars, photographs, guides and the
// terrain silhouette still use the current camera on every frame.
export function createGroundChartLayer(renderer) {
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const camera = new THREE.PerspectiveCamera(),
    screen = new THREE.Scene(),
    screenCamera = new THREE.Camera();
  const rotation = new THREE.Quaternion(),
    relative = new THREE.Quaternion(),
    previous = new THREE.Quaternion();
  const matrix = new THREE.Matrix4(),
    projection = new THREE.Matrix3(),
    scale = new THREE.Matrix3();
  const viewport = new THREE.Vector4(),
    colour = new THREE.Color();
  const material = new THREE.ShaderMaterial({
    uniforms: { image: { value: target.texture }, projection: { value: projection } },
    vertexShader:
      'varying vec2 uvScreen; void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `varying vec2 uvScreen;uniform sampler2D image;uniform mat3 projection;
void main(){vec3 ray=projection*vec3(uvScreen*2.-1.,1.);vec4 c=texture2D(image,.5+.5*ray.xy/ray.z);
gl_FragColor=vec4(c.rgb/max(c.a,1./255.),c.a);
#include <colorspace_fragment>
}`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  screen.add(quad);
  let captureKey,
    movedAt = -Infinity,
    settled = false;
  return {
    draw(chart, host) {
      const mesh = chart.labels,
        u = mesh.material.uniforms,
        clock = u.clock.value;
      renderer.getCurrentViewport(viewport);
      const width = viewport.z,
        height = viewport.w;
      const margin = Math.min(1.14, renderer.capabilities.maxTextureSize / Math.max(width, height));
      // Integer borders keep a settled frame pixel-aligned with the atlas.
      const paddedWidth = width + 2 * Math.floor((width * (margin - 1)) / 2);
      const paddedHeight = height + 2 * Math.floor((height * (margin - 1)) / 2);
      const mx = paddedWidth / width,
        my = paddedHeight / height;
      const ty = Math.tan((host.fov * Math.PI) / 360) / host.zoom,
        tx = ty * host.aspect;
      const key = [
        mesh.geometry.id,
        mesh.geometry.attributes.anchor.version,
        width,
        height,
        ty,
        tx,
        u.brightness.value,
      ].join('|');
      if (previous.angleTo(host.quaternion) > 0.00015) {
        movedAt = clock;
        settled = false;
      }
      previous.copy(host.quaternion);
      // A direct sample after releasing the pointer restores exact upright text.
      const atRest = !settled && clock - movedAt > 0.07;
      // The narrowest tangent-plane margin occurs at the diagonal corner.
      const limit = Math.min(
        0.05,
        Math.atan(Math.min(tx * (mx - 1), ty * (my - 1)) / (1 + tx * tx + ty * ty))
      );
      if (key !== captureKey || atRest || rotation.angleTo(host.quaternion) > limit) {
        const dst = renderer.getRenderTarget(),
          alpha = renderer.getClearAlpha();
        renderer.getClearColor(colour);
        const cssW = u.viewport.value.x,
          cssH = u.viewport.value.y;
        try {
          target.setSize(paddedWidth, paddedHeight);
          renderer.setRenderTarget(target);
          renderer.setClearColor(0, 0);
          renderer.clear();
          camera.copy(host, false);
          camera.zoom = 1;
          camera.aspect = (host.aspect * mx) / my;
          camera.fov = (2 * Math.atan(ty * my) * 180) / Math.PI;
          camera.updateProjectionMatrix();
          u.viewport.value.set(cssW * mx, cssH * my);
          renderer.render(mesh, camera);
        } finally {
          u.viewport.value.set(cssW, cssH);
          renderer.setRenderTarget(dst);
          renderer.setClearColor(colour, alpha);
        }
        rotation.copy(host.quaternion);
        captureKey = key;
        if (atRest) settled = true;
      }
      relative.copy(rotation).invert().multiply(host.quaternion);
      projection
        .setFromMatrix4(matrix.makeRotationFromQuaternion(relative))
        .multiply(scale.set(tx, 0, 0, 0, ty, 0, 0, 0, -1))
        .premultiply(scale.set(1 / (tx * mx), 0, 0, 0, 1 / (ty * my), 0, 0, 0, -1));
      renderer.render(screen, screenCamera);
    },
    dispose() {
      target.dispose();
      quad.geometry.dispose();
      material.dispose();
    },
  };
}
