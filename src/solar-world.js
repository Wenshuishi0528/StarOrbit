import * as THREE from 'three';
import { createOrbitControls } from './camera-controls.js';
import { t, onLanguageChange } from './i18n.js';
import { AU } from './orbit.js';
import {
  SOLAR_WORLD_BODIES,
  solarWorldState,
  solarWorldOrbit,
  solarWorldBodyAxes,
  solarWorldSiteDirection,
  solarWorldDisplayRadius,
} from './solar-world-math.js';

const vertex = `varying vec3 surface,normalWorld,world;void main(){surface=position;normalWorld=normalize(mat3(modelMatrix)*normal);world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`;
const fragment = `uniform vec3 baseColor,sunPosition;uniform sampler2D surfaceMap;uniform bool textured;uniform float bands;varying vec3 surface,normalWorld,world;
void main(){vec3 n=normalize(surface);vec2 uv=vec2(atan(n.y,n.x)/6.28318530718+.5,asin(clamp(n.z,-1.,1.))/3.14159265359+.5);
vec3 color=textured?texture2D(surfaceMap,uv).rgb:baseColor;
float stripe=1.-bands*(.5+.5*sin(n.z*47.+.3*sin(n.x*7.)));
float light=max(0.,dot(normalize(normalWorld),normalize(sunPosition-world)));
gl_FragColor=vec4(color*stripe*(.025+.975*light),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const names = new Map(SOLAR_WORLD_BODIES.map((b) => [b.id, b.name]));

export function createSolarWorld({
  renderer,
  host,
  getTime,
  getSite = () => null,
  getEarthTexture = () => null,
  getMoonTexture = () => null,
  assets = {},
  onGround = () => {},
}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02060e);
  const camera = new THREE.PerspectiveCamera(44, 1, 0.000001, 160);
  camera.up.set(0, 0, 1);
  const controls = createOrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 0.00009;
  controls.maxDistance = 110;
  const panel = document.createElement('div');
  panel.className = 'solar-world-panel';
  panel.innerHTML = `<style>
.solar-world-panel{position:absolute;left:24px;top:88px;z-index:8;width:262px;padding:20px;border:1px solid #7891ac40;border-radius:16px;background:#09111de8;color:#e5eaf3;box-shadow:0 12px 50px #0006;backdrop-filter:blur(16px);font:13px/1.65 system-ui;pointer-events:auto}
.solar-world-panel h3{font-size:19px;margin:0 0 4px;color:#f4dfb4;letter-spacing:.08em}.solar-world-panel small{color:#91a7c0}.solar-world-panel label{display:block;margin:13px 0 5px}.solar-world-panel select,.solar-world-panel button{font:inherit;color:#e5eaf3;background:#1b293d;border:1px solid #7e94ae40;border-radius:7px;padding:7px 9px}.solar-world-panel select{width:100%}.solar-world-actions{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.solar-world-panel button:hover{background:#34455d}.solar-world-readout{border-top:1px solid #7891ac30;margin-top:14px;padding-top:12px;white-space:pre-line;color:#c3cfdf;font-variant-numeric:tabular-nums}.solar-world-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3}.solar-world-labels span{position:absolute;color:#cad6e5;white-space:nowrap;font:12px/1.3 system-ui;text-shadow:0 1px 5px #000,0 0 8px #000;transform:translate(8px,-50%)}.solar-world-labels .active{color:#ffdfa5;font-weight:600}.solar-world-legend{position:absolute;right:24px;bottom:28px;color:#8c9fb5;font:12px/1.5 system-ui;z-index:5;pointer-events:none;text-align:right}@media(max-width:700px){.solar-world-panel{left:12px;top:70px;width:210px;padding:12px;font-size:12px}.solar-world-panel h3{font-size:16px}.solar-world-legend{right:12px;bottom:12px;font-size:10px}}
</style><h3 data-text="太阳系"></h3><small data-text="同一时刻 · 从地面到行星轨道"></small><label data-text="观察目标"></label><select aria-label="观察目标" data-target></select><div class="solar-world-actions"><button data-view="inner" data-text="内太阳系"></button><button data-view="all" data-text="全太阳系"></button><button data-view="earthmoon" data-text="地月系统"></button></div><label><input type="checkbox" data-size checked> <span data-text="放大天体显示"></span></label><label><input type="checkbox" data-orbits checked> <span data-text="显示轨道"></span></label><button data-ground data-text="返回观测地点"></button><div class="solar-world-readout"></div>`;
  host.append(panel);
  const labelRoot = document.createElement('div');
  labelRoot.className = 'solar-world-labels';
  host.append(labelRoot);
  const legend = document.createElement('div');
  legend.className = 'solar-world-legend';
  host.append(legend);
  const select = panel.querySelector('[data-target]'),
    readout = panel.querySelector('.solar-world-readout');
  for (const body of SOLAR_WORLD_BODIES) select.add(new Option(t(body.name), body.id));
  const geometry = new THREE.SphereGeometry(1, 48, 32),
    entities = new Map(),
    orbitRoot = new THREE.Group();
  scene.add(orbitRoot);
  for (const body of SOLAR_WORLD_BODIES) {
    const material =
      body.id === 'Sun'
        ? new THREE.ShaderMaterial({
            vertexShader: vertex,
            fragmentShader: `varying vec3 surface,normalWorld,world;
void main(){float mu=max(0.,dot(normalize(normalWorld),normalize(cameraPosition-world)));
vec3 emission=mix(vec3(1.3,.60,.16),vec3(1.8,1.5,.92),pow(mu,.45));
gl_FragColor=vec4(emission,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
          })
        : new THREE.ShaderMaterial({
            vertexShader: vertex,
            fragmentShader: fragment,
            uniforms: {
              baseColor: { value: new THREE.Color(body.color) },
              sunPosition: { value: new THREE.Vector3() },
              surfaceMap: { value: null },
              textured: { value: false },
              bands: { value: body.id === 'Jupiter' ? 0.16 : body.id === 'Saturn' ? 0.08 : 0 },
            },
          });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    const label = document.createElement('span');
    label.textContent = t(body.name);
    labelRoot.append(label);
    entities.set(body.id, { body, mesh, label });
  }
  // A compact optical halo is part of enhanced display only; physical-size
  // mode retains the actual solar limb without an enlarged glow footprint.
  const sunGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      vertexShader: `varying vec2 haloUV;void main(){haloUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 haloUV;void main(){float r=length(haloUV-.5)*2.;float glow=exp(-r*r*10.)*(1.-smoothstep(.65,1.,r));gl_FragColor=vec4(1.,.52,.16,glow*.35);}`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  scene.add(sunGlow);
  // The shell is 1.5% above the terrestrial radius (~96 km), lit from the Sun.
  const earthAir = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: `uniform vec3 sunPosition;varying vec3 surface,normalWorld,world;
void main(){vec3 n=normalize(normalWorld);float edge=pow(1.-max(0.,dot(n,normalize(cameraPosition-world))),3.5);
float light=smoothstep(-.16,.6,dot(n,normalize(sunPosition-world)));
gl_FragColor=vec4(.17,.46,1.,edge*(.06+.38*light));}`,
      uniforms: { sunPosition: { value: new THREE.Vector3() } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  scene.add(earthAir);
  const saturnRing = new THREE.Mesh(
    new THREE.RingGeometry(1.25, 2.3, 72),
    new THREE.MeshBasicMaterial({
      color: 0xa39173,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.62,
    })
  );
  entities.get('Saturn').mesh.add(saturnRing);
  const axisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -1.65),
    new THREE.Vector3(0, 0, 1.65),
  ]);
  const axis = new THREE.Line(
    axisGeometry,
    new THREE.LineBasicMaterial({ color: 0x86bed5, transparent: true, opacity: 0.65 })
  );
  entities.get('Earth').mesh.add(axis);
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd68c })
  );
  scene.add(marker);
  const siteLabel = document.createElement('span');
  siteLabel.className = 'active';
  labelRoot.append(siteLabel);
  const markerStem = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xffd68c })
  );
  scene.add(markerStem);
  let width = 1,
    height = 1,
    target = 'Sun',
    enhanced = true,
    disposed = false,
    lastTime = NaN,
    lastOrbitTime = NaN,
    states = [],
    origin = new THREE.Vector3(),
    orbitQueue = [],
    lastOrbitKey = '',
    lastOrbitRefresh = -Infinity;
  const ownedTextures = new Map();
  function requestTexture(id) {
    const shared = id === 'Moon' ? getMoonTexture() : null;
    if (shared) return shared;
    const url = id === 'Moon' ? assets.moon : assets.planets?.[id];
    if (!url) return null;
    if (!ownedTextures.has(id) && id !== target) return null;
    if (!ownedTextures.has(id)) {
      while (ownedTextures.size >= 2) {
        const oldest = ownedTextures.keys().next().value;
        ownedTextures.get(oldest).texture?.dispose();
        ownedTextures.delete(oldest);
      }
      const entry = { texture: null };
      ownedTextures.set(id, entry);
      new THREE.TextureLoader()
        .loadAsync(url)
        .then((texture) => {
          if (disposed || ownedTextures.get(id) !== entry) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          entry.texture = texture;
        })
        .catch(() => {});
    }
    return ownedTextures.get(id).texture;
  }
  const vector = new THREE.Vector3(),
    basis = new THREE.Matrix4();
  function translate() {
    panel.querySelectorAll('[data-text]').forEach((el) => (el.textContent = t(el.dataset.text)));
    for (const option of select.options) option.textContent = t(names.get(option.value));
    for (const { body, label } of entities.values()) label.textContent = t(body.name);
    legend.textContent =
      t('位置与轨道采用真实比例') + '\n' + t('Astronomy Engine · J2000 · 1 AU = 149,597,870.7 km');
  }
  const offLanguage = onLanguageChange(translate);
  translate();
  function setView(mode) {
    target = mode === 'earthmoon' ? 'Earth' : 'Sun';
    select.value = target;
    controls.target.set(0, 0, 0);
    const d = mode === 'all' ? 65 : mode === 'earthmoon' ? 0.008 : 3.6;
    camera.position.set(d * 0.6, -d * 0.8, d * 0.65);
    controls.update();
  }
  setView('inner');
  function focus(id) {
    target = id;
    select.value = id;
    controls.target.set(0, 0, 0);
    const body = entities.get(id).body,
      d =
        id === 'Sun' ? 3.6 : Math.max((body.radiusKm / AU) * 8, id === 'Earth' ? 0.00045 : 0.00016);
    camera.position.set(d * 0.6, -d * 0.8, d * 0.65);
    controls.update();
  }
  select.onchange = () => focus(select.value);
  panel
    .querySelectorAll('[data-view]')
    .forEach((button) => (button.onclick = () => setView(button.dataset.view)));
  panel.querySelector('[data-size]').onchange = (e) => (enhanced = e.target.checked);
  panel.querySelector('[data-orbits]').onchange = (e) => (orbitRoot.visible = e.target.checked);
  panel.querySelector('[data-ground]').onclick = () => onGround();
  function buildOrbit(id, time) {
    const points = solarWorldOrbit(id, time, 160).map((p) => new THREE.Vector3(...p));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: new THREE.Color(entities.get(id).body.color).lerp(new THREE.Color(0xb2c3d8), 0.2),
        transparent: true,
        opacity: id === 'Earth' ? 0.72 : id === 'Moon' ? 0.65 : 0.46,
        toneMapped: false,
      })
    );
    line.userData.body = id;
    orbitRoot.add(line);
  }
  function projectLabel(el, p) {
    vector.copy(p).project(camera);
    const visible =
      vector.z >= -1 && vector.z <= 1 && Math.abs(vector.x) < 1.05 && Math.abs(vector.y) < 1.05;
    el.hidden = !visible;
    if (visible) {
      el.style.left = `${(vector.x * 0.5 + 0.5) * width}px`;
      el.style.top = `${(-vector.y * 0.5 + 0.5) * height}px`;
    }
  }
  function update(time = getTime(), dt = 0) {
    if (disposed) return;
    if (time !== lastTime) {
      states = solarWorldState(time);
      lastTime = time;
    }
    const byId = new Map(states.map((s) => [s.id, s]));
    origin.fromArray(byId.get(target).position);
    const orbitKey = String(Math.floor(time / (30 * 86400000)));
    if (
      orbitKey !== lastOrbitKey &&
      (!lastOrbitKey || (!orbitQueue.length && performance.now() - lastOrbitRefresh > 1500))
    ) {
      lastOrbitRefresh = performance.now();
      lastOrbitKey = orbitKey;
      lastOrbitTime = time;
      orbitQueue = SOLAR_WORLD_BODIES.filter((b) => b.period).map((b) => b.id);
      for (const line of [...orbitRoot.children]) {
        orbitRoot.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      }
    }
    // One orbit per frame keeps first entry responsive; celestial positions are
    // immediately available even while outer orbit trails finish sampling.
    if (orbitQueue.length && orbitRoot.visible) buildOrbit(orbitQueue.shift(), lastOrbitTime);
    controls.update();
    const distance = camera.position.distanceTo(controls.target);
    camera.near = Math.max(1e-9, Math.min(0.01, distance / 1000));
    camera.far = Math.max(100, distance * 3);
    camera.updateProjectionMatrix();
    const sunPosition = new THREE.Vector3().fromArray(byId.get('Sun').position).sub(origin);
    for (const state of states) {
      const item = entities.get(state.id),
        { mesh, label } = item;
      mesh.position.fromArray(state.position).sub(origin);
      const r = solarWorldDisplayRadius(state, camera.position.distanceTo(mesh.position), enhanced);
      mesh.scale.setScalar(r);
      item.radius = r;
      if (state.id !== 'Sun') {
        const axes = solarWorldBodyAxes(state.id, time);
        basis.makeBasis(
          new THREE.Vector3(...axes[0]),
          new THREE.Vector3(...axes[1]),
          new THREE.Vector3(...axes[2])
        );
        mesh.quaternion.setFromRotationMatrix(basis);
        mesh.material.uniforms.sunPosition.value.copy(sunPosition);
        if (state.id !== 'Earth') {
          const surface = requestTexture(state.id);
          mesh.material.uniforms.surfaceMap.value = surface;
          mesh.material.uniforms.textured.value = !!surface;
          if (surface) mesh.material.uniforms.bands.value = 0;
        }
      }
      label.className = state.id === target ? 'active' : '';
    }
    const earth = entities.get('Earth'),
      tex = getEarthTexture();
    sunGlow.position.copy(sunPosition);
    sunGlow.quaternion.copy(camera.quaternion);
    sunGlow.scale.setScalar(entities.get('Sun').radius * 6);
    sunGlow.visible = enhanced;
    earthAir.position.copy(earth.mesh.position);
    earthAir.scale.setScalar(earth.radius * 1.015);
    earthAir.material.uniforms.sunPosition.value.copy(sunPosition);
    earth.mesh.material.uniforms.surfaceMap.value = tex;
    earth.mesh.material.uniforms.textured.value = !!tex && tex.image?.width > 1;
    for (const line of orbitRoot.children) {
      line.position.copy(origin).negate();
      if (line.userData.body === 'Moon')
        line.position.add(new THREE.Vector3(...byId.get('Earth').position));
    }
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const site = getSite(),
      direction = solarWorldSiteDirection(site, time);
    marker.visible = markerStem.visible = !!direction;
    if (direction) {
      marker.position
        .copy(earth.mesh.position)
        .addScaledVector(new THREE.Vector3(...direction), earth.radius * 1.03);
      marker.scale.setScalar(earth.radius);
      const end = earth.mesh.position
          .clone()
          .addScaledVector(new THREE.Vector3(...direction), earth.radius * 1.5),
        a = markerStem.geometry.attributes.position;
      a.setXYZ(0, ...marker.position.toArray());
      a.setXYZ(1, ...end.toArray());
      a.needsUpdate = true;
      markerStem.geometry.computeBoundingSphere();
      siteLabel.textContent = site.name || t('观测地点');
      const view = camera.position.clone().sub(marker.position).normalize();
      siteLabel.hidden = view.dot(new THREE.Vector3(...direction)) < 0;
      if (!siteLabel.hidden) projectLabel(siteLabel, end);
    } else siteLabel.hidden = true;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const occupied = [];
    for (const { body, mesh, label, radius } of [...entities.values()].sort(
      (a, b) =>
        (a.body.id === target ? -2 : a.body.id === 'Earth' ? -1 : 0) -
        (b.body.id === target ? -2 : b.body.id === 'Earth' ? -1 : 0)
    )) {
      projectLabel(label, mesh.position.clone().addScaledVector(camera.up, radius * 1.2));
      if (!label.hidden) {
        const x = parseFloat(label.style.left),
          y = parseFloat(label.style.top);
        if (occupied.some((p) => Math.abs(p.x - x) < 70 && Math.abs(p.y - y) < 20))
          label.hidden = true;
        else occupied.push({ x, y });
      }
    }
    if (!siteLabel.hidden) {
      const x = parseFloat(siteLabel.style.left);
      let y = parseFloat(siteLabel.style.top);
      for (
        let attempt = 0;
        attempt < 4 && occupied.some((p) => Math.abs(p.x - x) < 90 && Math.abs(p.y - y) < 22);
        attempt++
      )
        y += 23;
      siteLabel.hidden = y > height - 18;
      siteLabel.style.top = `${y}px`;
    }
    const selected = byId.get(target),
      earthPosition = byId.get('Earth').position;
    const siteName = site?.name || t('观测地点');
    readout.textContent = `${t(selected.name)} · ${enhanced ? t('天体显示增强') : t('真实尺寸')}\n${t('日心距离')}  ${Math.hypot(...selected.position).toFixed(4)} AU\n${t('地心距离')}  ${(Math.hypot(...selected.position.map((n, i) => n - earthPosition[i])) * AU).toLocaleString(undefined, { maximumFractionDigits: 0 })} km\n${t('地面位置')}  ${siteName}`;
    renderer.render(scene, camera);
  }
  return {
    scene,
    camera,
    update,
    focus,
    setView,
    resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controls.dispose();
      offLanguage?.();
      panel.remove();
      labelRoot.remove();
      legend.remove();
      scene.traverse((o) => {
        if (o.geometry && o.geometry !== geometry) o.geometry.dispose();
        if (o.material)
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
      geometry.dispose();
      for (const entry of ownedTextures.values()) entry.texture?.dispose();
      ownedTextures.clear();
    },
  };
}
