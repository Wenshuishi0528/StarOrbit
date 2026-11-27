import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EARTH_RADIUS } from '../orbit.js';
import { siteInertialKm } from './access.js';

const v3 = (a) => new THREE.Vector3(...a);
const R = EARTH_RADIUS;

function satellite() {
  const group = new THREE.Group(),
    wings = new THREE.Group();
  const box = (parent, color, size, at, metalness = 0.25) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.52 })
    );
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };
  box(group, 0xa98748, [0.92, 0.78, 0.93], [0, 0, 0]);
  box(group, 0xc8d4d7, [0.99, 0.83, 0.09], [0, 0, 0.49]);
  box(group, 0x455969, [0.95, 0.8, 0.1], [0, 0, -0.5]);
  box(group, 0x293841, [0.4, 0.38, 0.12], [0, 0, 0.6]);
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0x101d2d, metalness: 0.65, roughness: 0.17 })
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.7;
  group.add(lens);
  box(wings, 0x939da4, [1.7, 0.07, 0.07], [0, 0, 0]);
  const panels = [];
  for (const sign of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.x = sign * 0.675;
    wings.add(wing);
    panels.push(wing);
    box(wing, 0x7e919d, [1.45, 0.84, 0.05], [0.725 * sign, 0, 0]);
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) {
        box(
          wing,
          (i + j) % 2 ? 0x25589b : 0x244e87,
          [0.222, 0.253, 0.016],
          [sign * (0.13 + i * 0.237), -0.27 + j * 0.27, 0.035],
          0.3
        );
      }
  }
  return { body: group, wings, panels };
}

export function createScene(host, textureUrl, nightUrl) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(34, 1, 0.001, 40);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.rotateSpeed = 0.62;
  const earth = new THREE.Group();
  scene.add(earth);
  const texture = new THREE.TextureLoader().load(textureUrl, () => draw());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const night = new THREE.TextureLoader().load(nightUrl, () => draw());
  night.colorSpace = THREE.SRGBColorSpace;
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: texture },
        nightMap: { value: night },
        sun: { value: new THREE.Vector3() },
      },
      vertexShader:
        'varying vec3 n;varying vec2 tex;void main(){tex=uv;n=mat3(modelMatrix)*normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform sampler2D dayMap;uniform sampler2D nightMap;uniform vec3 sun;varying vec3 n;varying vec2 tex;
    void main(){float mu=dot(normalize(n),sun);float day=smoothstep(-.12,.20,mu);
      vec3 albedo=texture2D(dayMap,tex).rgb;vec3 lights=texture2D(nightMap,tex).rgb;
      gl_FragColor=vec4(albedo*(.028+day*(.25+.82*max(0.,mu)))+lights*(1.-day)*.86,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    })
  );
  earth.add(globe);
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(1.014, 80, 48),
    new THREE.ShaderMaterial({
      uniforms: { sun: { value: new THREE.Vector3() } },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      vertexShader:
        'varying vec3 n; varying vec3 eye; void main(){vec4 world=modelMatrix*vec4(position,1.);n=normalize(mat3(modelMatrix)*normal);eye=cameraPosition-world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}',
      fragmentShader:
        'varying vec3 n; varying vec3 eye;uniform vec3 sun;void main(){float f=pow(clamp(1.+dot(normalize(n),normalize(eye)),0.,1.),8.);float daylight=.22+.78*max(dot(normalize(n),sun),0.);gl_FragColor=vec4(.23,.59,.92,f*daylight*.8);}',
    })
  );
  earth.add(rim);
  const craft = satellite();
  scene.add(craft.body, craft.wings);
  const craftLight = new THREE.DirectionalLight(0xffffff, 1.6);
  craftLight.layers.set(1);
  scene.add(craftLight);
  for (const g of [craft.body, craft.wings]) g.traverse((obj) => obj.layers.set(1));
  const fill = new THREE.AmbientLight(0xd5e4ff, 0.45);
  fill.layers.set(1);
  scene.add(fill);
  camera.layers.enable(1);
  const track = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x56baa9, transparent: true, opacity: 0.83 })
  );
  scene.add(track);
  const indicator = new THREE.Mesh(
    new THREE.RingGeometry(0.04, 0.045, 40),
    new THREE.MeshBasicMaterial({ color: 0x68d6bd, side: THREE.DoubleSide })
  );
  const reference = new THREE.Mesh(
    new THREE.RingGeometry(0.052, 0.06, 48),
    new THREE.MeshBasicMaterial({ color: 0xffc367, side: THREE.DoubleSide })
  );
  const separation = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xffc367 })
  );
  reference.visible = separation.visible = false;
  scene.add(indicator, reference, separation);
  const siteMarker = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial()
  );
  const siteLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ dashSize: 0.004, gapSize: 0.002 })
  );
  siteMarker.visible = siteLine.visible = false;
  scene.add(siteMarker, siteLine);
  let mode = 'orbit',
    activeSite = null,
    live = null,
    run = null,
    lastTrack = -1,
    first = true;
  function draw() {
    indicator.quaternion.copy(camera.quaternion);
    reference.quaternion.copy(camera.quaternion);
    renderer.render(scene, camera);
  }
  controls.addEventListener('change', draw);
  const resize = new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  });
  resize.observe(host);
  function updateTrack(index) {
    const [x, y, z, vx, vy, vz] = run.orbit[index];
    const mu = 398600.4418;
    const a = 1 / (2 / Math.hypot(x, y, z) - (vx * vx + vy * vy + vz * vz) / mu);
    const period = Math.min(
      run.orbit.length - 1,
      Math.max(1, Math.round((2 * Math.PI * Math.sqrt(a ** 3 / mu)) / run.stepSeconds))
    );
    const start = Math.min(
      Math.max(0, index - Math.floor(period / 2)),
      Math.max(0, run.orbit.length - 1 - period)
    );
    if (Math.abs(start - lastTrack) < 12 && lastTrack >= 0) return;
    lastTrack = start;
    const points = [];
    for (let k = 0; k <= 240; k++) {
      const y = run.orbit[Math.min(run.orbit.length - 1, start + Math.round((k * period) / 240))];
      points.push(new THREE.Vector3(y[0] / R, y[1] / R, y[2] / R));
    }
    track.geometry.dispose();
    track.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }
  function update(
    result,
    state,
    newMode = mode,
    focus = false,
    { referencePeak = false, observationFocus = null } = {}
  ) {
    const siteKey =
      result.mission.observation && ['target', 'station'].includes(observationFocus)
        ? observationFocus
        : null;
    const reset = first || run !== result || newMode !== mode || focus || activeSite !== siteKey;
    activeSite = siteKey;
    if (run !== result) lastTrack = -1;
    mode = newMode;
    run = result;
    first = false;
    live = state;
    const env = state.env,
      pos = v3(env.position).multiplyScalar(1 / R);
    const [tangent, normal, radial] = env.basis.map(v3),
      sun = v3(env.sunDir);
    const [east0, east90, north] = env.earthAxes.map(v3),
      basis = new THREE.Matrix4();
    earth.quaternion.setFromRotationMatrix(basis.makeBasis(east0, north, east90.negate()));
    if (result.mission.observation) earth.scale.set(6378.137 / R, 6356.752314245 / R, 6378.137 / R);
    else earth.scale.setScalar(1);
    rim.material.uniforms.sun.value.copy(sun);
    globe.material.uniforms.sun.value.copy(sun);
    craftLight.position.copy(sun).multiplyScalar(5);
    craftLight.intensity = 2.2 * env.illumination;
    fill.intensity = 0.45 + 0.45 * env.illumination;
    craft.body.position.copy(pos);
    craft.wings.position.copy(pos);
    craft.body.quaternion.setFromRotationMatrix(basis.makeBasis(tangent, normal, radial));
    const panel = v3(state.panel),
      span = normal.clone().addScaledVector(panel, -panel.dot(normal));
    if (span.lengthSq() < 1e-6) span.copy(tangent).addScaledVector(panel, -panel.dot(tangent));
    span.normalize();
    craft.wings.quaternion.setFromRotationMatrix(
      basis.makeBasis(span, new THREE.Vector3().crossVectors(panel, span), panel)
    );
    const close = mode === 'craft';
    let siteDistance = 0;
    siteMarker.visible = Boolean(siteKey);
    siteLine.visible = false;
    host.dataset.observationFocus = siteKey ?? 'none';
    if (siteKey) {
      const site = result.mission.observation[siteKey];
      const point = v3(siteInertialKm(site, state.t)).multiplyScalar(1 / R);
      const color = siteKey === 'target' ? 0x84e9ba : 0xf7bf69;
      siteMarker.material.color.setHex(color);
      siteLine.material.color.setHex(color);
      siteMarker.position.copy(point);
      siteDistance = pos.distanceTo(point);
      siteMarker.scale.setScalar(Math.max(0.002, Math.min(0.012, siteDistance * 0.032)));
      host.dataset.observationRangeKm = String(siteDistance * R);
      const windows =
        siteKey === 'target'
          ? result.observationAccess.targetWindows
          : result.observationAccess.stationWindows;
      siteLine.visible = windows.some(
        ({ startSec, endSec }) => state.timeSec >= startSec && state.timeSec <= endSec
      );
      if (siteLine.visible) {
        const positions = siteLine.geometry.attributes.position;
        positions.setXYZ(0, pos.x, pos.y, pos.z);
        positions.setXYZ(1, point.x, point.y, point.z);
        positions.needsUpdate = true;
        siteLine.geometry.computeBoundingSphere();
        siteLine.computeLineDistances();
      }
    } else delete host.dataset.observationRangeKm;
    host.dataset.observationLinkVisible = String(siteLine.visible);
    const wingScale = Math.sqrt(run.mission.spacecraft.arrayM2 / 0.065);
    for (const wing of craft.panels) wing.scale.set(wingScale, wingScale, 1);
    indicator.position.copy(pos);
    const comparison = result.orbitComparison;
    const showReference = Boolean(
      referencePeak && comparison && state.timeSec === comparison.maxSec
    );
    const enteringOrLeavingPeak = reference.visible !== showReference;
    reference.visible = separation.visible = showReference;
    host.dataset.referencePeak = String(showReference);
    let gap = 0;
    if (showReference) {
      reference.position.copy(v3(comparison.peakReferenceKm)).multiplyScalar(1 / R);
      const positions = separation.geometry.attributes.position;
      positions.setXYZ(0, pos.x, pos.y, pos.z);
      positions.setXYZ(1, reference.position.x, reference.position.y, reference.position.z);
      positions.needsUpdate = true;
      separation.geometry.computeBoundingSphere();
      gap = reference.position.distanceTo(pos);
      host.dataset.referenceDistanceM = String(gap * R * 1000);
    } else delete host.dataset.referenceDistanceM;
    const compareClose = close && showReference;
    const siteView = Boolean(siteKey) && !close;
    const scale = compareClose
      ? Math.max(2e-7, Math.min(0.003, gap * 0.07))
      : siteView
        ? Math.min(0.016, Math.max(0.002, siteDistance * 0.05))
        : close
          ? 0.003
          : 0.027;
    craft.body.scale.setScalar(scale);
    craft.wings.scale.setScalar(scale);
    indicator.visible = !close || compareClose;
    track.visible = !close;
    updateTrack(Math.round(state.timeSec / result.stepSeconds));
    const extent = Math.max(1, pos.length(), showReference ? reference.position.length() : 0);
    const target = close ? pos.clone() : new THREE.Vector3();
    if (close && showReference) target.lerp(reference.position, 0.5);
    if (siteView) target.copy(pos).lerp(siteMarker.position, 0.5);
    const distance = compareClose
      ? Math.max(6e-6, gap * 3.4)
      : siteView
        ? Math.max(0.2, siteDistance * 3.4)
        : close
          ? 0.027
          : Math.max(3.75, extent * 3.35);
    reference.scale.setScalar(compareClose ? distance * 0.56 : extent);
    indicator.scale.setScalar(compareClose ? distance * 0.52 : siteView ? scale * 29 : 1);
    camera.near = compareClose ? Math.min(0.001, distance / 140) : 0.001;
    camera.far = Math.max(40, extent * 16);
    camera.updateProjectionMatrix();
    if (reset || enteringOrLeavingPeak) {
      const direction = radial
        .clone()
        .multiplyScalar(close ? 0.62 : 0.9)
        .addScaledVector(tangent, close ? -0.65 : -0.8)
        .addScaledVector(normal, close ? 0.68 : 0.62)
        .normalize();
      if (siteView) {
        const up = siteMarker.position.clone().normalize();
        const sight = pos.clone().sub(siteMarker.position).normalize();
        const side = new THREE.Vector3().crossVectors(up, sight);
        if (side.lengthSq() < 1e-8) side.copy(normal);
        direction.copy(side.normalize()).addScaledVector(up, 0.65).normalize();
      }
      // View a small physical separation side-on. The indicator sizes can change
      // with zoom, but their centers remain at the two computed positions.
      if (compareClose && gap > 1e-12) {
        const axis = reference.position.clone().sub(pos).normalize();
        direction.addScaledVector(axis, -direction.dot(axis));
        if (direction.lengthSq() < 1e-8)
          direction.crossVectors(
            axis,
            Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)
          );
        direction.normalize();
      }
      camera.up.copy(
        siteView
          ? siteMarker.position.clone().normalize()
          : close
            ? radial
            : new THREE.Vector3(0, 0, 1)
      );
      camera.position.copy(target).addScaledVector(direction, distance);
    } else camera.position.add(target.clone().sub(controls.target));
    controls.minDistance = compareClose
      ? Math.max(1e-6, distance / 6)
      : siteView
        ? 0.04
        : close
          ? 0.014
          : 1.8;
    controls.maxDistance = close ? Math.max(0.07, distance * 2.5) : extent * 9;
    controls.target.copy(target);
    controls.update();
    draw();
    host.dataset.timeSec = String(state.timeSec);
    host.dataset.sampleSec = String(state.sampleSec ?? state.timeSec);
    host.dataset.view = mode;
  }
  return {
    update,
    setMode(next) {
      if (live)
        update(run, live, next, true, {
          referencePeak: reference.visible,
          observationFocus: activeSite,
        });
    },
  };
}
