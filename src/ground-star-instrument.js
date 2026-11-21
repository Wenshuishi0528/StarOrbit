import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180;
const v = (a) => new THREE.Vector3(...a);
const axisY = new THREE.Vector3(0, 1, 0);

// Metres in local ENU: X east, Y north, Z up. The 80 mm objective and the
// folded path to the eyepiece represent the ground mode's 600 mm refractor.
export function createGroundStarMount() {
  const root = new THREE.Group(),
    azimuth = new THREE.Group(),
    altitude = new THREE.Group();
  root.add(azimuth);
  azimuth.add(altitude);
  altitude.name = 'opticalTube';
  altitude.position.set(0.151, 0, 1.095);

  const paint = (color, metalness, roughness) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness, toneMapped: false });
  const finish = {
    enamel: paint(0xe7e4d6, 0.08, 0.35),
    alloy: paint(0x8b9caa, 0.52, 0.34),
    graphite: paint(0x35424d, 0.35, 0.42),
    rubber: paint(0x181f25, 0.04, 0.72),
    bronze: paint(0xc18c47, 0.48, 0.36),
    glass: paint(0x246780, 0.35, 0.16),
  };
  const batches = new Map();
  function add(group, material, geometry) {
    let materials = batches.get(group);
    if (!materials) batches.set(group, (materials = new Map()));
    let parts = materials.get(material);
    if (!parts) materials.set(material, (parts = []));
    parts.push(geometry);
  }
  function shaft(group, material, start, end, r1, r2 = r1, sides = 16) {
    const a = v(start),
      b = v(end),
      direction = b.clone().sub(a);
    const part = new THREE.CylinderGeometry(r2, r1, direction.length(), sides);
    part.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(axisY, direction.normalize()));
    const mid = a.lerp(b, 0.5);
    add(group, material, part.translate(mid.x, mid.y, mid.z));
  }
  function block(group, material, [w, d, h], [x, y, z]) {
    add(group, material, new THREE.BoxGeometry(w, d, h).translate(x, y, z));
  }
  function barrel(group, material, profile) {
    add(
      group,
      material,
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        40
      )
    );
  }
  const { enamel, alloy, graphite, rubber, bronze, glass } = finish;

  // Twin upper rails, sliding lower legs and a three-way spreader.
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3 + 0.18;
    const leg = (r, z, across = 0) => [
      Math.sin(a) * r + Math.cos(a) * across,
      Math.cos(a) * r - Math.sin(a) * across,
      z,
    ];
    for (const side of [-0.018, 0.018]) {
      shaft(root, alloy, leg(0.36, 0.28, side), leg(0.067, 0.875, side), 0.012);
    }
    shaft(root, graphite, leg(0.048, 0.864, -0.034), leg(0.048, 0.864, 0.034), 0.019);
    shaft(root, alloy, leg(0.482, 0.026), leg(0.33, 0.342), 0.017);
    shaft(root, graphite, leg(0.368, 0.265), leg(0.347, 0.306), 0.032);
    shaft(root, rubber, leg(0.489, 0.013), leg(0.471, 0.048), 0.021, 0.017);
    shaft(root, graphite, leg(0.062, 0.415), leg(0.282, 0.439), 0.008);
  }
  shaft(root, graphite, [0, 0, 0.402], [0, 0, 0.423], 0.129, 0.12, 3);
  shaft(root, alloy, [0, 0, 0.413], [0, 0, 0.874], 0.009);
  shaft(root, graphite, [0, 0, 0.848], [0, 0, 0.89], 0.083, 0.071, 32);
  shaft(root, bronze, [0, 0, 0.89], [0, 0, 0.9], 0.067, 0.067, 32);

  // The side arm leaves clearance for the focuser when pointing at the zenith.
  shaft(azimuth, graphite, [0, 0, 0.9], [0, 0, 0.935], 0.066, 0.057, 32);
  shaft(azimuth, graphite, [-0.014, 0, 0.918], [0.062, 0, 1.096], 0.048, 0.035);
  shaft(azimuth, graphite, [0.035, 0, 1.095], [0.096, 0, 1.095], 0.041, 0.041, 32);
  shaft(azimuth, bronze, [0.087, 0, 1.095], [0.093, 0, 1.095], 0.042, 0.042, 32);
  shaft(azimuth, rubber, [-0.014, 0, 1.095], [0.035, 0, 1.095], 0.02, 0.017);

  // Optical tube, a recessed objective and an open dew shield. The lathe
  // profile models the rim and inner wall so the lens is visible down the bore.
  shaft(altitude, enamel, [0, -0.16, 0], [0, 0.263, 0], 0.045, 0.046, 40);
  barrel(altitude, enamel, [
    [0.046, 0.251],
    [0.053, 0.267],
    [0.053, 0.392],
    [0.051, 0.396],
  ]);
  barrel(altitude, graphite, [
    [0.051, 0.396],
    [0.048, 0.396],
    [0.046, 0.389],
    [0.046, 0.32],
    [0.04, 0.32],
    [0.04, 0.314],
  ]);
  barrel(altitude, glass, [
    [0.04, 0.313],
    [0.04, 0.319],
    [0.027, 0.322],
    [0.014, 0.3235],
    [0, 0.324],
  ]);
  shaft(altitude, bronze, [0, 0.239, 0], [0, 0.246, 0], 0.047, 0.047, 40);
  for (const y of [-0.111, 0.104]) {
    shaft(altitude, graphite, [0, y - 0.009, 0], [0, y + 0.009, 0], 0.049, 0.049, 32);
  }
  block(altitude, graphite, [0.018, 0.253, 0.032], [-0.049, 0, 0]);
  block(altitude, bronze, [0.011, 0.102, 0.04], [-0.06, 0, 0]);

  // Rear drawtube, focusing wheels, diagonal mirror and interchangeable ocular.
  shaft(altitude, graphite, [0, -0.208, 0], [0, -0.156, 0], 0.027, 0.045, 32);
  shaft(altitude, alloy, [0, -0.242, 0], [0, -0.208, 0], 0.02, 0.021, 28);
  shaft(altitude, alloy, [-0.047, -0.183, -0.025], [0.047, -0.183, -0.025], 0.005);
  for (const x of [-0.045, 0.045]) {
    shaft(altitude, rubber, [x - 0.006, -0.183, -0.025], [x + 0.006, -0.183, -0.025], 0.016);
  }
  block(altitude, graphite, [0.043, 0.046, 0.044], [0, -0.257, 0.003]);
  shaft(altitude, alloy, [0, -0.258, 0.022], [0, -0.258, 0.044], 0.018);
  shaft(altitude, rubber, [0, -0.258, 0.042], [0, -0.258, 0.078], 0.022, 0.019);
  shaft(altitude, glass, [0, -0.258, 0.077], [0, -0.258, 0.079], 0.009);
  // A small straight-through finder is offset above the main optical tube.
  for (const y of [-0.103, -0.031]) {
    shaft(altitude, graphite, [0.016, y, 0.039], [0.027, y, 0.068], 0.006);
  }
  shaft(altitude, graphite, [0.027, -0.17, 0.072], [0.027, 0.039, 0.072], 0.011, 0.016);
  shaft(altitude, glass, [0.027, 0.039, 0.072], [0.027, 0.04, 0.072], 0.012);

  // Batch only parts on the same mechanical axis. Moving the mount then needs
  // two small rotations, independent of the number of fittings.
  for (const [group, materials] of batches) {
    for (const [material, parts] of materials) {
      group.add(new THREE.Mesh(mergeGeometries(parts), material));
      for (const part of parts) part.dispose();
    }
  }
  return {
    root,
    point(azimuthDeg, altitudeDeg) {
      azimuth.rotation.z = -azimuthDeg * DEG;
      altitude.rotation.x = altitudeDeg * DEG;
    },
    dispose() {
      root.traverse((node) => node.geometry?.dispose());
      for (const material of Object.values(finish)) material.dispose();
      root.removeFromParent();
    },
  };
}

export function createGroundStarInstrument(renderer, canvas) {
  const mount = createGroundStarMount();
  const scene = new THREE.Scene();
  const ambient = new THREE.HemisphereLight(0xf2f7ff, 0x7794aa, 1.8);
  ambient.position.set(0, 0, 2);
  const key = new THREE.DirectionalLight(0xffebc9, 2.3);
  key.position.set(1.6, -0.85, 2.7);
  const rim = new THREE.DirectionalLight(0xa0d9ff, 1.2);
  rim.position.set(-1, 1.15, 1.1);
  scene.add(mount.root, ambient, key, rim);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 8);
  camera.up.set(0, 0, 1);
  const target = new THREE.WebGLRenderTarget(1, 1, {
    colorSpace: THREE.SRGBColorSpace,
    samples: Math.min(4, renderer.capabilities.maxSamples),
  });
  const ctx = canvas.getContext('2d', { alpha: false });
  const clearColor = new THREE.Color();
  const viewport = new THREE.Vector4(),
    scissor = new THREE.Vector4();
  const events = new AbortController();
  let orbitAz = null,
    orbitAlt = 16,
    viewRevision = 0,
    pointer = null;
  let disposed = false,
    visible = true,
    busy = false,
    asyncRead = !!renderer.readRenderTargetPixelsAsync;
  let lastCheck = -Infinity,
    lastPose = '',
    bytes,
    image;
  const observer =
    typeof IntersectionObserver !== 'undefined' &&
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
  if (observer) observer.observe(canvas);

  function rotate(dx, dy) {
    orbitAz = ((orbitAz ?? 50) - dx * 0.6) % 360;
    orbitAlt = THREE.MathUtils.clamp(orbitAlt + dy * 0.4, 5, 75);
    viewRevision++;
  }
  const listen = (type, fn) => canvas.addEventListener(type, fn, { signal: events.signal });
  listen('pointerdown', (event) => {
    if (pointer || event.button !== 0 || !event.isPrimary) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
  });
  listen('pointermove', (event) => {
    if (pointer?.id !== event.pointerId) return;
    rotate(event.clientX - pointer.x, event.clientY - pointer.y);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  const endPointer = (event) => {
    if (pointer?.id === event.pointerId) pointer = null;
  };
  listen('pointerup', endPointer);
  listen('pointercancel', endPointer);
  listen('lostpointercapture', endPointer);
  listen('keydown', (event) => {
    const arrows = {
      ArrowLeft: [12, 0],
      ArrowRight: [-12, 0],
      ArrowUp: [0, 14],
      ArrowDown: [0, -14],
    };
    if (!arrows[event.key]) return;
    rotate(...arrows[event.key]);
    event.preventDefault();
    event.stopPropagation();
  });
  function showFrame() {
    if (disposed) return;
    const { width, height } = image,
      stride = width * 4;
    for (let y = 0; y < height; y++) {
      const start = (height - y - 1) * stride;
      image.data.set(bytes.subarray(start, start + stride), y * stride);
    }
    ctx.putImageData(image, 0, 0);
  }
  return {
    update(az, alt, now = performance.now()) {
      // A photo or another render target always has priority over this preview.
      if (
        disposed ||
        !visible ||
        busy ||
        !ctx ||
        !Number.isFinite(az + alt) ||
        now - lastCheck < 100 ||
        renderer.getRenderTarget()
      )
        return;
      lastCheck = now;
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (w < 1 || h < 1) return;
      const scale = Math.min(1.6, globalThis.devicePixelRatio || 1, 480 / w, 300 / h);
      const width = Math.max(1, Math.round(w * scale)),
        height = Math.max(1, Math.round(h * scale));
      const pose = [Math.round(az * 10), Math.round(alt * 10), width, height, viewRevision].join(
        '/'
      );
      if (pose === lastPose) return;
      if (width !== target.width || height !== target.height || !image) {
        canvas.width = width;
        canvas.height = height;
        target.setSize(width, height);
        bytes = new Uint8Array(width * height * 4);
        image = ctx.createImageData(width, height);
      }
      lastPose = pose;
      mount.point(az, alt);
      orbitAz ??= az + 52;
      const eyeAz = orbitAz * DEG,
        eyeAlt = orbitAlt * DEG;
      camera.position.set(
        2.6 * Math.sin(eyeAz) * Math.cos(eyeAlt),
        2.6 * Math.cos(eyeAz) * Math.cos(eyeAlt),
        0.71 + 2.6 * Math.sin(eyeAlt)
      );
      camera.lookAt(0, 0, 0.71);
      const aspect = width / height,
        halfHeight = Math.max(0.86, 0.55 / aspect);
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();

      const auto = renderer.autoClear,
        alpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      renderer.getViewport(viewport);
      renderer.getScissor(scissor);
      const clipped = renderer.getScissorTest();
      try {
        // Binding the target sets its physical-pixel viewport and scissor. The
        // shared screen viewport, scissor, exposure and tone mapping stay intact.
        renderer.setRenderTarget(target);
        renderer.setClearColor(0x111e2b, 1);
        renderer.autoClear = false;
        renderer.clear();
        renderer.render(scene, camera);
        if (asyncRead) {
          const gl = renderer.getContext();
          const priorPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
          busy = true;
          try {
            renderer
              .readRenderTargetPixelsAsync(target, 0, 0, width, height, bytes)
              .then(showFrame, () => {
                asyncRead = false;
                lastPose = '';
              })
              .finally(() => {
                busy = false;
              });
          } finally {
            // Three binds its PBO until its fence signals. Restore immediately so
            // other passes can read terrain depth or capture a photo this frame.
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, priorPack);
          }
        } else {
          renderer.readRenderTargetPixels(target, 0, 0, width, height, bytes);
          showFrame();
        }
      } finally {
        renderer.setRenderTarget(null);
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(clipped);
        renderer.setClearColor(clearColor, alpha);
        renderer.autoClear = auto;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
      events.abort();
      if (observer) observer.disconnect();
      mount.dispose();
      target.dispose();
    },
  };
}
