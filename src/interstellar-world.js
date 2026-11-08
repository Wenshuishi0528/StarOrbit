import { mountWorldEarthControls } from './shared-world-earth.js';
import {
  createSharedWorldSky,
  mountWorldSkyControls,
  applyWorldSkySettings,
} from './shared-world-sky.js';
import * as THREE from 'three';
import { HelioVector } from 'astronomy-engine';
import {
  interstellarCatalog,
  spatialStarName,
  spatialFormationName,
} from './interstellar-catalog.js';
import {
  AU_LY,
  LY_KM,
  arrivalPosition,
  splitPosition,
  stepTravel,
  TRAVEL_SPEEDS,
  formatStellarDistance,
  apparentMagnitude,
} from './interstellar-math.js';
import { createInterstellarSolar } from './interstellar-solar.js';
import { createInterstellarInput } from './interstellar-input.js';
import { searchXuntianTargets, getXuntianTarget } from './xuntian-catalog.js';
import { t, getLanguage, onLanguageChange } from './i18n.js';
import { galaxyVertex, galaxyFragment } from './sky-shaders.js';

const STORE = 'starorbit-interstellar-v1';
const relativeGLSL = `attribute vec3 positionLow;uniform vec3 observerHigh,observerLow;
vec3 relativePosition(){return (position-observerHigh)+(positionLow-observerLow);}`;
const pointVertex = `${relativeGLSL}
attribute vec3 photometry;uniform float pixels,pixelRatio,exposure,limit;varying vec3 tint;varying float flux;
void main(){vec3 delta=relativePosition();float d=max(length(delta),1.e-12);
float magnitude=photometry.x+5.*log(d/32.6156377717)/log(10.);
float bv=photometry.y;tint=bv>.9?vec3(1.,.67,.39):bv>.4?vec3(1.,.87,.68):bv<.1?vec3(.53,.71,1.):vec3(.78,.85,1.);
float angularPixels=photometry.z/d*pixels;
flux=min(3.,pow(10.,-.16*(magnitude-1.)))*exposure*(1.-smoothstep(limit-.7,limit+.3,magnitude));
flux*=1.-smoothstep(1.,3.,angularPixels);
gl_Position=projectionMatrix*viewMatrix*vec4(delta/d*100.,1.);
gl_PointSize=clamp(2.2+max(0.,5.-magnitude)*.9,2.2,28.)*pixelRatio;
}`;
const pointFragment = `varying vec3 tint;varying float flux;
void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.||flux<.001)discard;
float light=exp(-r*r*9.)+.12*exp(-r*r*2.5)*(1.-smoothstep(.7,1.,r));
gl_FragColor=vec4(tint*flux*light,1.);
#include <colorspace_fragment>
}`;
const css = `.interstellar-panel{position:absolute;left:18px;top:18px;width:276px;box-sizing:border-box;max-height:calc(100% - 110px);overflow:auto;padding:20px;border:1px solid #748fa344;border-radius:15px;background:#091522e6;backdrop-filter:blur(14px);z-index:4;font:13px/1.65 system-ui;color:#cad9e7}.interstellar-panel h3{font-size:23px;letter-spacing:.1em;color:#f2dbad;margin:0 0 2px}.interstellar-panel small,.interstellar-panel p{color:#8fa8bd;font-size:11px}.interstellar-panel label{display:block;margin:10px 0 4px}.interstellar-panel input:not([type=checkbox]),.interstellar-panel select{box-sizing:border-box;width:100%;min-width:0}.interstellar-panel button{font-size:12px}.interstellar-actions{display:flex;gap:6px;flex-wrap:wrap;margin:9px 0}.interstellar-results button{display:block;width:100%;text-align:left;margin:4px 0}.interstellar-selected{border-top:1px solid #738ca333;padding-top:10px;margin-top:12px;color:#efd9b4;white-space:pre-line}.interstellar-hud{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);text-align:center;color:#bdcedf;background:#081320c9;padding:10px 24px;border:1px solid #7891ac33;border-radius:24px;z-index:3;font:12px/1.7 system-ui;white-space:pre-line;pointer-events:none;font-variant-numeric:tabular-nums}.interstellar-labels{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2}.interstellar-labels span{position:absolute;font:12px system-ui;color:#c2d1e2;text-shadow:0 0 6px #000,0 1px 3px #000;transform:translate(9px,-50%);white-space:nowrap}.interstellar-labels .selected{color:#ffe1a2;font-weight:600}.interstellar-reticle{position:absolute;left:50%;top:50%;width:16px;height:16px;border:1px solid #bfd4e544;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:2}.interstellar-credit{position:absolute;right:12px;bottom:5px;color:#9fb2c4;font:10px system-ui;pointer-events:none}.interstellar-panel details{margin-top:12px}.interstellar-panel summary{cursor:pointer;color:#d7c39d}.interstellar-panel-toggle{position:absolute;right:18px;top:18px;z-index:5}.interstellar-panel[hidden]{display:none}@media(max-width:700px){.interstellar-panel{left:8px;top:8px;width:228px;padding:13px;max-height:calc(100% - 100px)}.interstellar-hud{bottom:20px;font-size:10px;width:max-content;max-width:85%;padding:7px 12px}.interstellar-panel h3{font-size:19px}}`;

export function createInterstellarWorld({
  renderer,
  host,
  environment,
  getTime,
  onSolar = () => {},
  onGround = () => {},
  initialPose = null,
}) {
  const catalog = interstellarCatalog();
  const scene = new THREE.Scene(),
    localScene = new THREE.Scene();
  const solar = createInterstellarSolar({ environment, scene: localScene, renderer });
  const camera = new THREE.PerspectiveCamera(65, 1, 1e-10, 1e6);
  camera.up.set(0, 0, 1);
  const localCamera = new THREE.PerspectiveCamera(65, 1, 1e-7, 10000);
  const position = [0, 0, 0],
    velocity = [0, 0, 0];
  let width = 1,
    height = 1,
    selected = catalog.byId.get('hip:32349') ?? 0,
    flight = null,
    disposed = false;
  let speed = 'cruise',
    culture = environment.settings.skyCulture || 'western',
    formation = null,
    showNames =
      environment.settings.starLabels ||
      environment.settings.constellationNames ||
      environment.settings.catalogStarLabels,
    showLines = environment.settings.constellationLines,
    brightness = environment.settings.starBrightness ?? 1,
    magnitudeLimit = 8;
  let nearest = 0,
    nearestDistance = Infinity,
    scanElapsed = 1,
    labelElapsed = 1,
    currentSpeed = 0,
    pathLength = 0,
    visited = 0;
  let bookmarks = [],
    lastPhotoCaption = '',
    exposure = 1;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    bookmarks = (Array.isArray(saved?.bookmarks) ? saved.bookmarks : [])
      .filter(validPose)
      .slice(0, 12);
    if (Object.hasOwn(TRAVEL_SPEEDS, saved?.speed)) speed = saved.speed;
  } catch {}
  const panel = document.createElement('aside');
  panel.className = 'interstellar-panel';
  panel.innerHTML = `<style>${css}</style><h3 data-text="星际穿梭"></h3><small data-text="离开太阳，看看星座的另一面"></small>
<label data-text="寻找恒星或星图"></label><input data-search aria-label="寻找恒星或星图" placeholder="天狼星、织女星、北斗、HIP…"><div class="interstellar-results"></div>
<div class="interstellar-actions"><button data-shortcut="hip:32349" data-text="天狼星"></button><button data-shortcut="hip:91262" data-text="织女星"></button><button data-dipper data-text="北斗"></button></div>
<div class="interstellar-selected" aria-live="polite"></div><div class="interstellar-actions"><button data-go data-text="前往恒星"></button><button data-look data-text="看向目标"></button><button data-stop data-text="停止"></button></div>
<label data-text="巡航速度"></label><select data-speed><option value="local">0.1 AU/s</option><option value="nearby">0.02 ly/s</option><option value="cruise">2 ly/s</option><option value="fast">50 ly/s</option></select>
<label><input type="checkbox" data-assist checked> <span data-text="接近恒星时自动减速"></span></label>
<div class="interstellar-actions"><button data-home data-text="返回太阳附近"></button><button data-sun data-text="回望太阳"></button><button data-solar data-text="进入太阳系"></button><button data-ground data-text="地表对照"></button></div>
<details open><summary data-text="星图与画面"></summary><label data-text="星空体系"></label><select data-culture><option value="chinese" data-text="中国星官"></option><option value="western" data-text="西方星座"></option></select><select data-formation aria-label="选择星图"></select><div class="interstellar-actions"><button data-side data-text="从侧面看"></button><button data-earth data-text="太阳附近视角"></button></div><label><input type="checkbox" data-lines checked> <span data-text="三维连线"></span></label><label><input type="checkbox" data-names checked> <span data-text="恒星名称"></span></label><label><input type="checkbox" data-auto-exposure checked> <span data-text="自动曝光"></span></label><label data-text="星空亮度"></label><input data-brightness aria-label="星空亮度" type="range" min="0.2" max="2.5" step="0.05" value="1"><label data-text="视场"></label><input data-fov aria-label="视场" type="range" min="0.006" max="100" step="0.001" value="65"></details>
<details><summary data-text="航点与操作"></summary><input data-bookmark-name aria-label="航点名称" placeholder="航点名称" maxlength="40"><div class="interstellar-actions"><button data-save data-text="保存航点"></button><button data-remove data-text="删除航点"></button></div><select data-bookmarks aria-label="保存的航点"></select><p data-text="H / N 前后，J / L 左右，K / I 升降；W / S 俯仰，A / D 转向，Q / E 翻滚。拖动画面转向，滚轮缩放，空格停止。"></p></details>
<details><summary data-text="星表与空间数据"></summary><p data-statistics></p><p data-text="恒星位置：J2000 星表快照；移动观察者产生空间视差。模拟时钟与穿梭速度独立，恒星自行尚未外推。"></p><p data-text="三维连线只显示两端均有可靠距离的线段。银河影像作为太阳邻域背景，远离后逐渐淡出。"></p><p data-text="太阳与天狼星 A 使用实测半径的球面；其他恒星显示星点。颜色与曝光为观测可视化，球面不代表实拍纹理。"></p><p>Hipparcos / van Leeuwen 2007 · d3-celestial · Stellarium CC BY-SA 4.0 · Sirius A: Davis et al. 2011</p></details><small data-message role="status"></small>`;
  host.append(panel);
  const sharedSky = createSharedWorldSky({ environment, renderer, id: 'interstellar-world' });
  const sharedControls = mountWorldSkyControls(panel, environment);
  const earthControls = mountWorldEarthControls(panel, environment);
  const referenceLabel = document.createElement('label');
  referenceLabel.innerHTML =
    '<input type="checkbox" data-reference> <span data-text="太阳视角参考 · 图源与插画"></span>';
  sharedControls.root.before(referenceLabel);
  let referenceTarget = null;
  let referenceView = false,
    nearSolarSky = true;
  referenceLabel.querySelector('input').onchange = (e) => {
    referenceView = e.target.checked;
    stop();
  };
  const $ = (selector) => panel.querySelector(selector);
  const labels = document.createElement('div');
  labels.className = 'interstellar-labels';
  const hud = document.createElement('div');
  hud.className = 'interstellar-hud';
  const reticle = document.createElement('div');
  reticle.className = 'interstellar-reticle';
  const credit = document.createElement('div');
  credit.className = 'interstellar-credit';
  credit.textContent = 'StarOrbit · Hipparcos · J2000';
  const toggle = document.createElement('button');
  toggle.className = 'interstellar-panel-toggle';
  host.append(labels, hud, reticle, credit, toggle);
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
  };
  const uniforms = {
    observerHigh: { value: new THREE.Vector3() },
    observerLow: { value: new THREE.Vector3() },
    pixels: { value: 500 },
    pixelRatio: { value: 1 },
    exposure: { value: 1 },
    limit: { value: magnitudeLimit },
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(catalog.high, 3));
  geometry.setAttribute('positionLow', new THREE.BufferAttribute(catalog.low, 3));
  geometry.setAttribute('photometry', new THREE.BufferAttribute(catalog.photometry, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: pointVertex,
      fragmentShader: pointFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  points.frustumCulled = false;
  points.renderOrder = 1;
  scene.add(points);
  const lineMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `${relativeGLSL}void main(){gl_Position=projectionMatrix*viewMatrix*vec4(relativePosition(),1.);}`,
    fragmentShader: `void main(){gl_FragColor=vec4(.64,.76,.9,.33);}`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial);
  lines.frustumCulled = false;
  lines.renderOrder = 2;
  scene.add(lines);
  const selectedLineMaterial = lineMaterial.clone();
  selectedLineMaterial.uniforms = uniforms;
  selectedLineMaterial.fragmentShader = `void main(){gl_FragColor=vec4(1.,.79,.43,.8);}`;
  const selectedLines = new THREE.LineSegments(new THREE.BufferGeometry(), selectedLineMaterial);
  selectedLines.frustumCulled = false;
  selectedLines.renderOrder = 3;
  scene.add(selectedLines);
  let lineCulture = null;
  function rebuildCultureLines() {
    if (lineCulture === culture) return;
    lineCulture = culture;
    lines.geometry.dispose();
    lines.geometry = spatialLineGeometry(
      catalog.formations.filter((f) => f.culture === culture).flatMap((f) => f.segments)
    );
  }
  function spatialLineGeometry(segments) {
    const high = [],
      low = [];
    for (const pair of segments)
      for (const index of pair)
        for (let k = 0; k < 3; k++) {
          high.push(catalog.high[index * 3 + k]);
          low.push(catalog.low[index * 3 + k]);
        }
    return new THREE.BufferGeometry()
      .setAttribute('position', new THREE.Float32BufferAttribute(high, 3))
      .setAttribute('positionLow', new THREE.Float32BufferAttribute(low, 3));
  }
  // Borrow the existing texture, never decode or cache a second Milky Way map.
  const milky = new THREE.Mesh(
    new THREE.SphereGeometry(1200, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader: galaxyVertex,
      fragmentShader: galaxyFragment,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { brightness: { value: 0 }, textured: { value: 0 }, skyMap: { value: null } },
    })
  );
  scene.add(milky);
  const diskMaterial = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color() }, opacity: { value: 1 } },
    transparent: true,
    vertexShader: `varying vec3 n,v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=-p.xyz;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec3 n,v;uniform vec3 tint;uniform float opacity;void main(){float mu=max(0.,dot(normalize(n),normalize(v)));float limb=.35+.65*pow(mu,.6);gl_FragColor=vec4(tint*limb,opacity);
#include <colorspace_fragment>
}`,
    toneMapped: false,
  });
  const disk = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), diskMaterial);
  localScene.add(disk);
  const vector = new THREE.Vector3(),
    forward = new THREE.Vector3(),
    targetVector = new THREE.Vector3();
  const high = [],
    low = [],
    projected = new THREE.Vector3();
  const getPosition = (index) => Array.from(catalog.positions.subarray(index * 3, index * 3 + 3));
  const name = (index) => spatialStarName(catalog, index, getLanguage(), culture);
  const distance = (index) =>
    Math.hypot(
      catalog.positions[index * 3] - position[0],
      catalog.positions[index * 3 + 1] - position[1],
      catalog.positions[index * 3 + 2] - position[2]
    );
  const format = (ly) => formatStellarDistance(ly, t);
  function validPose(pose) {
    return (
      pose &&
      Array.isArray(pose.position) &&
      pose.position.length === 3 &&
      pose.position.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e7) &&
      Array.isArray(pose.quaternion) &&
      pose.quaternion.length === 4 &&
      pose.quaternion.every(Number.isFinite) &&
      Number.isFinite(Math.hypot(...pose.quaternion)) &&
      Math.hypot(...pose.quaternion) > 0.1
    );
  }
  function snapshot() {
    return {
      position: [...position],
      quaternion: camera.quaternion.toArray(),
      selected,
      targetId: selected === 0 ? 'Sun' : `hip:${catalog.hips[selected]}`,
      fov: camera.fov,
      culture,
      formation: formation?.id || null,
    };
  }
  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ bookmarks, speed, culture }));
      return true;
    } catch {
      $('[data-message]').textContent = t('航点无法保存到浏览器');
      return false;
    }
  }
  function stop() {
    flight = null;
    velocity.fill(0);
    currentSpeed = 0;
    input?.stop();
  }
  const input = createInterstellarInput({
    canvas: renderer.domElement,
    camera,
    onNavigate: (brake) => {
      flight = null;
      if (brake) {
        velocity.fill(0);
        currentSpeed = 0;
      }
    },
    onWheel: (delta) => {
      camera.fov = THREE.MathUtils.clamp(camera.fov * Math.exp(delta * 0.001), 0.006, 100);
      $('[data-fov]').value = camera.fov;
      camera.updateProjectionMatrix();
    },
  });
  function aim(point) {
    camera.lookAt(vector.fromArray(point).sub(targetVector.fromArray(position)));
    camera.updateMatrixWorld();
  }
  function focus(index) {
    if (!Number.isInteger(index) || index < 0 || index >= catalog.count) return;
    stop();
    referenceView = false;
    referenceTarget = null;
    referenceLabel.querySelector('input').checked = false;
    selected = index;
    aim(getPosition(index));
    labelElapsed = 1;
  }
  function restore(pose) {
    if (!validPose(pose)) return;
    stop();
    if (['western', 'chinese'].includes(pose.culture)) {
      culture = pose.culture;
      applyWorldSkySettings(environment, { culture });
      $('[data-culture]').value = culture;
      formationsMenu();
    }
    if (Object.hasOwn(pose, 'formation'))
      setFormation(catalog.formations.find((f) => f.id === pose.formation) || null);
    position.splice(0, 3, ...pose.position);
    camera.quaternion.fromArray(pose.quaternion).normalize();
    if (catalog.byId.has(pose.targetId)) selected = catalog.byId.get(pose.targetId);
    else if (Number.isInteger(pose.selected) && pose.selected >= 0 && pose.selected < catalog.count)
      selected = pose.selected;
    if (Number.isFinite(pose.fov)) camera.fov = THREE.MathUtils.clamp(pose.fov, 0.006, 100);
    $('[data-fov]').value = camera.fov;
    camera.updateProjectionMatrix();
    scanElapsed = labelElapsed = 1;
  }
  function home() {
    referenceView = false;
    referenceLabel.querySelector('input').checked = false;
    stop();
    const earth = HelioVector('Earth', new Date(getTime()));
    position.splice(0, 3, earth.x * AU_LY, earth.y * AU_LY, earth.z * AU_LY + 50000 / LY_KM);
    aim(
      formation
        ? formationCenter(formation)
        : getPosition(selected || (catalog.byId.get('hip:32349') ?? 0))
    );
    scanElapsed = labelElapsed = 1;
  }
  function travel() {
    referenceView = false;
    referenceLabel.querySelector('input').checked = false;
    stop();
    const target = getPosition(selected),
      radius = catalog.photometry[selected * 3 + 2];
    const destination = arrivalPosition(position, target, radius > 0 ? radius * 20 : AU_LY * 2);
    const length = Math.hypot(...destination.map((v, i) => v - position[i]));
    if (length < 1e-12) return;
    flight = {
      start: [...position],
      destination,
      target,
      elapsed: 0,
      length,
      duration: 3.5,
      softness: Math.max(radius * 20, AU_LY),
    };
    aim(target);
    renderer.domElement.focus();
  }
  function formationCenter(item) {
    const center = [0, 0, 0];
    for (const index of item.members)
      for (let k = 0; k < 3; k++)
        center[k] += catalog.positions[index * 3 + k] / item.members.length;
    return center;
  }
  function setFormation(item) {
    formation = item;
    selectedLines.geometry.dispose();
    selectedLines.geometry = spatialLineGeometry(item?.segments || []);
    rebuildCultureLines();
    $('[data-formation]').value = item?.id || '';
    if (item?.members.length) {
      selected = item.members[0];
      stop();
      aim(formationCenter(item));
    }
    labelElapsed = 1;
  }
  function sideView() {
    referenceView = false;
    referenceLabel.querySelector('input').checked = false;
    if (!formation?.members.length) return;
    stop();
    const center = formationCenter(formation);
    const radius = Math.max(
      0.1,
      ...formation.members.map((i) => Math.hypot(...getPosition(i).map((v, k) => v - center[k])))
    );
    const sideways = new THREE.Vector3(...center).cross(new THREE.Vector3(0, 0, 1));
    if (sideways.lengthSq() < 1e-12) sideways.set(1, 0, 0);
    sideways.normalize().multiplyScalar((radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.35);
    position.splice(0, 3, ...center.map((v, k) => v + sideways.getComponent(k)));
    aim(center);
    scanElapsed = labelElapsed = 1;
  }
  function formationsMenu() {
    const select = $('[data-formation]');
    select.replaceChildren(new Option(t('选择星图'), ''));
    for (const item of catalog.formations.filter((f) => f.culture === culture && f.members.length))
      select.add(new Option(spatialFormationName(item, getLanguage()), item.id));
    select.value = formation?.culture === culture ? formation.id : '';
  }
  function bookmarksMenu() {
    const select = $('[data-bookmarks]');
    select.replaceChildren(new Option(t('保存的航点'), ''));
    bookmarks.forEach((b, i) =>
      select.add(new Option(b.name || `${t('航点')} ${i + 1}`, String(i)))
    );
  }
  function translate() {
    panel.querySelectorAll('[data-text]').forEach((n) => (n.textContent = t(n.dataset.text)));
    for (const n of panel.querySelectorAll('[aria-label]')) {
      n.dataset.label ||= n.getAttribute('aria-label');
      n.setAttribute('aria-label', t(n.dataset.label));
    }
    $('[data-search]').placeholder = t('天狼星、织女星、北斗、HIP…');
    $('[data-bookmark-name]').placeholder = t('航点名称');
    toggle.textContent = t('航行与画面');
    formationsMenu();
    bookmarksMenu();
    $('[data-statistics]').textContent = t('{count} 颗有距离的恒星 · 空间数组 {size} MB', {
      count: catalog.count - 1,
      size: (catalog.bytes / 1e6).toFixed(2),
    });
    labelElapsed = 1;
  }
  const offLanguage = onLanguageChange(translate);
  translate();
  $('[data-speed]').value = speed;
  $('[data-culture]').value = culture;
  $('[data-speed]').onchange = (e) => {
    speed = e.target.value;
    stop();
    persist();
  };
  $('[data-culture]').onchange = (e) => {
    culture = e.target.value;
    applyWorldSkySettings(environment, { culture });
    setFormation(null);
    formationsMenu();
    persist();
  };
  $('[data-formation]').onchange = (e) =>
    setFormation(catalog.formations.find((f) => f.id === e.target.value) || null);
  $('[data-lines]').onchange = (e) => {
    showLines = e.target.checked;
    applyWorldSkySettings(environment, { lines: showLines });
  };
  $('[data-names]').onchange = (e) => {
    showNames = e.target.checked;
    applyWorldSkySettings(environment, { names: showNames });
    labels.hidden = !showNames;
  };
  $('[data-brightness]').oninput = (e) => {
    brightness = Number(e.target.value);
    applyWorldSkySettings(environment, { starBrightness: brightness });
    sharedControls.refresh();
  };
  $('[data-fov]').oninput = (e) => {
    camera.fov = Number(e.target.value);
    camera.updateProjectionMatrix();
  };
  $('[data-go]').onclick = travel;
  $('[data-look]').onclick = () => {
    if (referenceView && referenceTarget) {
      camera.lookAt(vector.fromArray(referenceTarget.direction));
      camera.updateMatrixWorld();
    } else focus(selected);
  };
  $('[data-stop]').onclick = stop;
  $('[data-home]').onclick = home;
  $('[data-sun]').onclick = () => focus(0);
  $('[data-solar]').onclick = () => onSolar();
  $('[data-ground]').onclick = () => onGround();
  $('[data-side]').onclick = sideView;
  $('[data-earth]').onclick = home;
  panel
    .querySelectorAll('[data-shortcut]')
    .forEach((button) => (button.onclick = () => focus(catalog.byId.get(button.dataset.shortcut))));
  $('[data-dipper]').onclick = () => {
    culture = 'chinese';
    applyWorldSkySettings(environment, { culture });
    $('[data-culture]').value = culture;
    formationsMenu();
    setFormation(catalog.formations.find((f) => f.culture === 'chinese' && f.item.zh === '北斗'));
    home();
  };
  $('[data-save]').onclick = () => {
    if (bookmarks.length >= 12) {
      $('[data-message]').textContent = t('最多保存 12 个航点，请先删除一个');
      return;
    }
    bookmarks.push({
      ...snapshot(),
      name: $('[data-bookmark-name]').value.trim().slice(0, 40) || name(selected),
    });
    const saved = persist();
    bookmarksMenu();
    $('[data-bookmarks]').value = String(bookmarks.length - 1);
    if (saved) $('[data-message]').textContent = t('航点已保存');
  };
  $('[data-bookmarks]').onchange = (e) => {
    if (e.target.value !== '') restore(bookmarks[Number(e.target.value)]);
  };
  $('[data-remove]').onclick = () => {
    const value = $('[data-bookmarks]').value;
    if (value === '') return;
    bookmarks.splice(Number(value), 1);
    persist();
    bookmarksMenu();
  };
  let searchTimer;
  $('[data-search]').oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const query = $('[data-search]').value.trim(),
        results = $('.interstellar-results');
      results.replaceChildren();
      if (!query) return;
      const hits = searchXuntianTargets(query, getLanguage(), 16, culture);
      if (/^(太阳|sun|soleil|солнце)$/i.test(query)) hits.unshift({ id: 'Sun', name: name(0) });
      let count = 0;
      for (const hit of hits) {
        const index = catalog.byId.get(hit.id),
          item = catalog.formations.find((f) => f.id === hit.id),
          skyTarget = getXuntianTarget(hit.id, getLanguage(), culture);
        if (index === undefined && !item?.members.length && !skyTarget?.direction) continue;
        const button = document.createElement('button');
        button.textContent = hit.name;
        button.onclick = () => {
          results.replaceChildren();
          if (index !== undefined) focus(index);
          else if (!item?.members.length) {
            stop();
            referenceView = true;
            referenceTarget = skyTarget;
            referenceLabel.querySelector('input').checked = true;
            camera.lookAt(vector.fromArray(skyTarget.direction));
            camera.fov = Math.max(0.006, Math.min(100, skyTarget.fov || 8));
            camera.updateProjectionMatrix();
            $('[data-fov]').value = camera.fov;
            labelElapsed = 1;
          } else {
            culture = item.culture;
            applyWorldSkySettings(environment, { culture });
            $('[data-culture]').value = culture;
            formationsMenu();
            setFormation(item);
            home();
          }
        };
        results.append(button);
        if (++count >= 8) break;
      }
      if (!count) results.textContent = t('此目标暂无可用的三维距离；可在巡天取景中查看');
    }, 160);
  };
  function scan() {
    nearestDistance = Infinity;
    for (let i = 0; i < catalog.count; i++) {
      const p = i * 3,
        dx = catalog.positions[p] - position[0],
        dy = catalog.positions[p + 1] - position[1],
        dz = catalog.positions[p + 2] - position[2],
        d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < nearestDistance) {
        nearestDistance = d2;
        nearest = i;
      }
    }
    nearestDistance = Math.sqrt(nearestDistance);
  }
  // Pool DOM labels. Reproject at 8 Hz, not 19,000 DOM nodes per frame.
  const labelPool = Array.from({ length: 64 }, () => {
    const el = document.createElement('span');
    labels.append(el);
    return el;
  });
  const named = [];
  for (let i = 1; i < catalog.count; i++) if (!name(i).startsWith('HIP ')) named.push(i);
  function updateLabels() {
    camera.updateMatrixWorld();
    camera.getWorldDirection(forward);
    const density = environment.settings.starLabelDensity ?? 0.95;
    const capacity =
      density >= 1
        ? catalog.count
        : Math.max(64, Math.ceil(((width * height) / 7000) * (0.3 + density * 2)));
    function labelAt(index) {
      while (labelPool.length <= index) {
        const el = document.createElement('span');
        labels.append(el);
        labelPool.push(el);
      }
      return labelPool[index];
    }
    const candidates = [
        ...new Set([
          selected,
          0,
          ...(formation?.members || []),
          ...(environment.settings.catalogStarLabels
            ? Array.from({ length: catalog.count }, (_, i) => i)
            : named),
        ]),
      ],
      occupied = [];
    let count = 0;
    for (const index of candidates) {
      if (count >= capacity) break;
      vector.set(
        catalog.positions[index * 3] - position[0],
        catalog.positions[index * 3 + 1] - position[1],
        catalog.positions[index * 3 + 2] - position[2]
      );
      const d = vector.length();
      if (d < 1e-14 || vector.dot(forward) <= 0) continue;
      const member = formation?.members.includes(index);
      if (
        index !== selected &&
        !member &&
        density < 1 &&
        apparentMagnitude(catalog.photometry[index * 3], d) >
          2.5 + density * 3 + Math.max(0, Math.log2(40 / camera.fov)) * 1.35
      )
        continue;
      projected.copy(vector).normalize().multiplyScalar(100).project(camera);
      if (Math.abs(projected.x) > 0.94 || Math.abs(projected.y) > 0.9) continue;
      const x = (projected.x * 0.5 + 0.5) * width,
        y = (-projected.y * 0.5 + 0.5) * height;
      if (x > width - 130 || y > height - 88) continue;
      if (!panel.hidden && x < panel.offsetWidth + 35 && y < panel.offsetHeight + 25) continue;
      if (density < 1 && occupied.some((p) => Math.abs(p[0] - x) < 110 && Math.abs(p[1] - y) < 22))
        continue;
      occupied.push([x, y]);
      const el = labelAt(count++);
      el.hidden =
        !(environment.settings.starLabels || environment.settings.catalogStarLabels) ||
        !environment.settings.starChartEnabled;
      el.className = index === selected ? 'selected' : '';
      el.textContent = name(index);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
    if (environment.settings.constellationNames && environment.settings.starChartEnabled)
      for (const item of catalog.formations.filter(
        (f) => f.culture === culture && f.members.length
      )) {
        vector.fromArray(formationCenter(item)).sub(targetVector.fromArray(position));
        if (vector.dot(forward) <= 0) continue;
        projected.copy(vector).normalize().multiplyScalar(100).project(camera);
        if (Math.abs(projected.x) > 0.9 || Math.abs(projected.y) > 0.85) continue;
        const x = (projected.x * 0.5 + 0.5) * width,
          y = (-projected.y * 0.5 + 0.5) * height;
        if (!panel.hidden && x < panel.offsetWidth + 35 && y < panel.offsetHeight + 25) continue;
        if (
          density < 1 &&
          occupied.some((p) => Math.abs(p[0] - x) < 100 && Math.abs(p[1] - y) < 24)
        )
          continue;
        if (count >= capacity) break;
        occupied.push([x, y]);
        const el = labelAt(count++);
        el.hidden = false;
        el.className = 'selected';
        el.textContent = spatialFormationName(item, getLanguage());
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      }
    while (count < labelPool.length) labelPool[count++].hidden = true;
    const info = [
      name(selected),
      t('距观察者 {distance}', { distance: format(distance(selected)) }),
    ];
    if (formation)
      info.push(
        `${spatialFormationName(formation, getLanguage())} · ${t('三维线段 {count}/{total}', { count: formation.segments.length, total: formation.total })}`
      );
    $('.interstellar-selected').textContent =
      referenceView && referenceTarget
        ? referenceTarget.name + '\n' + t('太阳视角参考 · 图源与插画')
        : info.join('\n');
    const along = position.map((n, i) => ['X', 'Y', 'Z'][i] + ' ' + n.toFixed(3)).join(' · ');
    hud.textContent = `${t('距太阳')} ${format(Math.hypot(...position))}  ·  ${t('速度')} ${format(currentSpeed)}/s\n${t('最近恒星')} ${name(nearest)} · ${format(nearestDistance)}`;
    hud.title = `${along} ly · J2000\n${t('累计航程')} ${format(pathLength)}`;
    lastPhotoCaption = referenceView
      ? `${t('太阳视角参考 · 图源与插画')} · ${referenceTarget?.name || name(selected)}`
      : `${t('星际穿梭')} · ${name(selected)} · ${t('距太阳')} ${format(Math.hypot(...position))} · ${along} ly`;
  }
  home();
  if (validPose(initialPose)) restore(initialPose);
  return {
    camera,
    scene,
    focus,
    home,
    travel,
    sideView,
    setFormation,
    snapshot,
    get caption() {
      return lastPhotoCaption;
    },
    status() {
      return {
        ...snapshot(),
        speed: currentSpeed,
        flight: !!flight,
        nearest,
        nearestDistance,
        pathLength,
        count: catalog.count - 1,
        bufferBytes: catalog.bytes,
        labels: labelPool.length,
        formation: formation?.id || null,
        formationSegments: formation?.segments.length || 0,
        cultureSegments: lines.geometry.attributes.position?.count / 2 || 0,
        referenceView,
        referenceTarget: referenceView ? referenceTarget?.id || null : null,
        nearSolarSky,
        visits: visited,
      };
    },
    resize(w, h) {
      if (w === width && h === height) return;
      width = Math.max(1, w);
      height = Math.max(1, h);
      camera.aspect = localCamera.aspect = width / height;
      camera.updateProjectionMatrix();
      localCamera.updateProjectionMatrix();
    },
    update(time, elapsed) {
      if (disposed) return;
      const dt = Math.max(0, Math.min(0.1, elapsed)),
        before = [...position];
      if (culture !== environment.settings.skyCulture) {
        culture = environment.settings.skyCulture;
        formation = null;
        setFormation(null);
        formationsMenu();
        $('[data-culture]').value = culture;
      }
      brightness = environment.settings.starBrightness ?? 1;
      showLines = environment.settings.constellationLines;
      showNames =
        environment.settings.starLabels ||
        environment.settings.constellationNames ||
        environment.settings.catalogStarLabels;
      $('[data-lines]').checked = showLines;
      $('[data-names]').checked = showNames;
      $('[data-go]').disabled = referenceView && !!referenceTarget;
      const direction = input.update(dt);
      if (referenceView) direction.fill(0);
      if (flight) {
        flight.elapsed = Math.min(flight.duration, flight.elapsed + dt);
        const u = flight.elapsed / flight.duration,
          ease = u * u * (3 - 2 * u);
        const remaining =
          (flight.length + flight.softness) *
            Math.exp(Math.log(flight.softness / (flight.length + flight.softness)) * ease) -
          flight.softness;
        const fraction = Math.max(0, Math.min(1, 1 - remaining / flight.length));
        for (let i = 0; i < 3; i++)
          position[i] = flight.start[i] + (flight.destination[i] - flight.start[i]) * fraction;
        aim(flight.target);
        if (u === 1) {
          position.splice(0, 3, ...flight.destination);
          flight = null;
          visited++;
        }
      } else {
        // Scan only while moving; reduction distance can never use a stale nearest position.
        scanElapsed += dt;
        if (scanElapsed >= 0.1) {
          scan();
          scanElapsed = 0;
        }
        nearestDistance = distance(nearest);
        const radius = catalog.photometry[nearest * 3 + 2];
        const clearance = $('[data-assist]').checked
          ? Math.max(AU_LY * 0.00001, nearestDistance - radius * 1.1)
          : Infinity;
        stepTravel(position, velocity, direction, dt, TRAVEL_SPEEDS[speed], clearance);
        // Keep the exploration camera outside measured photospheres.
        for (const index of [0, catalog.byId.get('hip:32349')].filter((i) => i !== undefined)) {
          const r = catalog.photometry[index * 3 + 2] * 1.02,
            d = distance(index);
          if (d < r) {
            const p = getPosition(index);
            const out = arrivalPosition(before, p, r);
            position.splice(0, 3, ...out);
            velocity.fill(0);
          }
        }
      }
      solar.update(position, time, dt);
      solar.keepOutside(position);
      const travelled = Math.hypot(...position.map((v, i) => v - before[i]));
      pathLength += travelled;
      currentSpeed = dt > 0 ? travelled / dt : 0;
      splitPosition(position, high, low);
      uniforms.observerHigh.value.fromArray(high);
      uniforms.observerLow.value.fromArray(low);
      uniforms.pixelRatio.value = renderer.getPixelRatio();
      uniforms.pixels.value = (height * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
      let diskIndex = -1,
        angular = 0;
      for (const index of [0, catalog.byId.get('hip:32349')].filter((i) => i !== undefined)) {
        const a =
          (catalog.photometry[index * 3 + 2] / Math.max(distance(index), 1e-15)) *
          uniforms.pixels.value;
        if (a > angular) {
          angular = a;
          diskIndex = index;
        }
      }
      const exposureGoal = $('[data-auto-exposure]').checked ? 1 / (1 + angular * 0.045) : 1;
      exposure += (Math.max(0.12, exposureGoal) - exposure) * (1 - Math.exp(-dt * 3));
      uniforms.exposure.value = brightness * exposure;
      nearSolarSky = Math.hypot(...position) < 0.01;
      rebuildCultureLines();
      lines.visible =
        showLines &&
        environment.settings.stars &&
        brightness > 0 &&
        environment.settings.starChartEnabled &&
        !referenceView &&
        !nearSolarSky;
      selectedLines.visible = lines.visible && !!formation;
      points.visible = !referenceView && environment.settings.stars !== false;
      labels.hidden =
        referenceView ||
        nearSolarSky ||
        !showNames ||
        !environment.settings.stars ||
        brightness <= 0 ||
        !environment.settings.starChartEnabled;
      sharedSky.update(camera, time, width, height, {
        brightness: brightness * exposure,
        showStars: referenceView,
        showChart: true,
        settings:
          referenceView || nearSolarSky
            ? {}
            : {
                starLabels: false,
                catalogStarLabels: false,
                constellationNames: false,
                constellationLines: false,
                constellationBoundaries: false,
                deepSkyObjects: false,
              },
        showArt: referenceView || nearSolarSky,
        showDetail: referenceView || nearSolarSky,
        showGalaxy: false,
        focusTargetId: formation?.id,
      });
      milky.visible = environment.settings.milky !== false;
      milky.material.uniforms.skyMap.value = environment.galaxyTexture || null;
      milky.material.uniforms.textured.value = environment.galaxyTexture ? 1 : 0;
      milky.material.uniforms.brightness.value =
        brightness *
        exposure *
        (1 - THREE.MathUtils.smoothstep(Math.hypot(...position), 10, 100)) *
        0.65;
      camera.updateMatrixWorld();
      if (referenceView) milky.material.uniforms.brightness.value = brightness * exposure;
      renderer.render(scene, camera);
      sharedSky.render();
      disk.visible = !referenceView && angular > 1;
      if (disk.visible) {
        const p = getPosition(diskIndex);
        disk.position.set(...p.map((v, i) => (v - position[i]) / AU_LY));
        disk.scale.setScalar(catalog.photometry[diskIndex * 3 + 2] / AU_LY);
        diskMaterial.uniforms.opacity.value = THREE.MathUtils.smoothstep(angular, 1, 3);
        diskMaterial.uniforms.tint.value.set(diskIndex === 0 ? '#fff1cf' : '#dceaff');
      }
      localCamera.quaternion.copy(camera.quaternion);
      localCamera.fov = camera.fov;
      localCamera.updateProjectionMatrix();
      renderer.clearDepth();
      if (!referenceView) {
        solar.renderEarth(localCamera, time, width, height);
        renderer.render(localScene, localCamera);
        solar.renderEarthEffects();
      }
      labelElapsed += dt;
      if (labelElapsed >= 0.125) {
        scan();
        updateLabels();
        labelElapsed = 0;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sharedSky.dispose();
      sharedControls.dispose();
      earthControls.dispose();
      referenceLabel.remove();
      solar.dispose();
      clearTimeout(searchTimer);
      persist();
      input.dispose();
      offLanguage();
      geometry.dispose();
      points.material.dispose();
      lines.geometry.dispose();
      lineMaterial.dispose();
      selectedLines.geometry.dispose();
      selectedLineMaterial.dispose();
      milky.geometry.dispose();
      milky.material.dispose();
      disk.geometry.dispose();
      diskMaterial.dispose();
      for (const el of [panel, labels, hud, reticle, credit, toggle]) el.remove();
    },
  };
}
