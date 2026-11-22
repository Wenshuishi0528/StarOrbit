import * as THREE from 'three';

// During eyepiece gestures the fixed, wide finder can reuse its last complete
// background. Capture before the telescope mount, guides or inset are drawn.
export function createGroundFinderBackdrop(renderer) {
  const scene = new THREE.Scene(),
    camera = new THREE.Camera();
  const material = new THREE.ShaderMaterial({
    uniforms: { image: { value: null } },
    vertexShader: 'varying vec2 tex;void main(){tex=uv;gl_Position=vec4(position.xy,0.,1.);}',
    // The framebuffer is already display-encoded. Copy its bytes unchanged.
    fragmentShader:
      'varying vec2 tex;uniform sampler2D image;void main(){gl_FragColor=texture2D(image,tex);}',
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  let texture, stamp, lastTime, lastWall, status;
  return {
    show(key, time, wall, maxStep) {
      if (
        key !== stamp ||
        wall - lastWall >= 350 ||
        Math.abs(time - lastTime) > maxStep ||
        !texture
      )
        return null;
      renderer.render(scene, camera);
      return status;
    },
    capture(key, time, wall, reading) {
      const { width, height } = renderer.domElement;
      if (texture?.image.width !== width || texture.image.height !== height) {
        texture?.dispose();
        texture = new THREE.FramebufferTexture(width, height);
        material.uniforms.image.value = texture;
      }
      renderer.copyFramebufferToTexture(texture);
      stamp = key;
      lastTime = time;
      lastWall = wall;
      status = reading;
    },
    invalidate() {
      stamp = null;
    },
    dispose() {
      texture?.dispose();
      quad.geometry.dispose();
      material.dispose();
    },
  };
}
