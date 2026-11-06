import * as THREE from 'three';

function canvasSize(canvas) {
  const width = canvas.clientWidth,
    height = canvas.clientHeight;
  if (!width || !height) return null;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(width * pixelRatio),
    h = Math.round(height * pixelRatio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { ctx, width, height };
}

// The spacecraft mesh and materials are shared with the main viewer. Only
// scene-local helpers/renderer belong to this panel and may be disposed here.
export function createSurveyPointing(viewport, template, orbit) {
  let renderer;
  if (template)
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {}
  if (!renderer) {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    viewport.append(canvas);
    return {
      draw(state) {
        const screen = canvasSize(canvas);
        if (!screen) return;
        const { ctx, width: w, height: h } = screen;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#31536b';
        ctx.lineWidth = 1;
        for (let i = 1; i < 6; i++) {
          ctx.beginPath();
          ctx.moveTo((i * w) / 6, 0);
          ctx.lineTo((i * w) / 6, h);
          ctx.stroke();
        }
        for (let i = 1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(0, (i * h) / 4);
          ctx.lineTo(w, (i * h) / 4);
          ctx.stroke();
        }
        const xy = (v) => [
          (Math.atan2(v[1], v[0]) / (2 * Math.PI) + 0.5) * w,
          (0.5 - Math.asin(Math.max(-1, Math.min(1, v[2]))) / Math.PI) * h,
        ];
        const [x, y] = xy(state.direction);
        ctx.strokeStyle = '#85f5e4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 14, y);
        ctx.lineTo(x + 14, y);
        ctx.moveTo(x, y - 14);
        ctx.lineTo(x, y + 14);
        ctx.stroke();
      },
      dispose() {
        canvas.remove();
      },
    };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  viewport.append(renderer.domElement);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(31, 1, 0.05, 30),
    pose = new THREE.Group();
  const mesh = template.clone(true);
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.scale.setScalar(1);
  mesh.visible = true;
  const bounds = new THREE.Box3().setFromObject(mesh),
    center = bounds.getCenter(new THREE.Vector3()),
    size = bounds.getSize(new THREE.Vector3());
  mesh.position.copy(center).negate();
  const scaled = new THREE.Group();
  scaled.add(mesh);
  scaled.scale.setScalar(2.9 / Math.max(size.x, size.y, size.z, 1));
  pose.add(scaled);
  scene.add(pose);
  const pointer = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(1.15, 0, 0),
    1.2,
    0x96dfec,
    0.15,
    0.09
  );
  pose.add(pointer);
  const light = new THREE.DirectionalLight(0xffedcd, 2.8);
  light.position.fromArray(orbit.sun).multiplyScalar(6);
  scene.add(light, new THREE.HemisphereLight(0xeeffff, 0x5a7488, 2.15));
  camera.up.set(0, 0, 1);
  camera.position.set(3.1, -4.1, 2.8);
  camera.lookAt(0, 0, 0);
  const axis = new THREE.Vector3(),
    side = new THREE.Vector3(),
    top = new THREE.Vector3(),
    orientation = new THREE.Matrix4();
  let lastWidth = 0,
    lastHeight = 0;
  return {
    draw(state) {
      const width = viewport.clientWidth,
        height = viewport.clientHeight;
      if (!width || !height) return;
      if (width !== lastWidth || height !== lastHeight) {
        lastWidth = width;
        lastHeight = height;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      axis.fromArray(state.direction);
      side.set(0, 0, 1);
      if (Math.abs(axis.z) > 0.9999) side.set(0, 1, 0);
      side.cross(axis).normalize();
      top.crossVectors(axis, side);
      orientation.makeBasis(axis, side, top);
      pose.quaternion.setFromRotationMatrix(orientation);
      pointer.setColor(
        state.phase === 'exposure' ? 0x72f7ab : state.phase === 'slew' ? 0xffc889 : 0x9cc8da
      );
      renderer.render(scene, camera);
    },
    dispose() {
      pointer.line.material.dispose();
      pointer.cone.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
