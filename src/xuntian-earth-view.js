import * as THREE from 'three';
import { EarthDetail, detailRect } from './earth-detail.js';
import { earthSurfaceRadiance } from './earth-shaders.js';
import { EARTH_RADIUS, dot, norm } from './orbit.js';
import { coneHalfAngle, sphereIntersectsRectangularView } from './xuntian-view-math.js';
import { earthHit, quadVertex } from './xuntian-view-shaders.js';
import { cityOpticalView } from './city-terrain-view.js';
import { EarthElevationLayer } from './earth-elevation-layer.js';

let cityViewSerial = 0;

const u = (value) => ({ value });
const surfaceFragment = `precision highp float;varying vec2 film;uniform mat3 cameraToInertial,earthInverse;
uniform vec2 lens;uniform vec3 fixedEye;${earthHit}${earthSurfaceRadiance}
void main(){vec3 ray=normalize(cameraToInertial*vec3(film*lens,1.));vec3 fixedRay=earthInverse*ray;
 float t=groundDistance(fixedEye,fixedRay);if(t<0.)discard;
 vec3 p=cameraPosition+t*ray;gl_FragColor=vec4(earthSurfaceColour(normalize(fixedEye+t*fixedRay),normalize(p),p),1.);}`;

// The environment's atmosphere already intersects spherical shells per ray.
// Feed it the actual detector rays, avoiding far-side mesh clipping at nadir.
const rayVertex = `uniform mat3 cameraToInertial;uniform vec2 lens;varying vec3 worldP;
void main(){worldP=cameraPosition+2048.*(cameraToInertial*vec3(position.xy*lens,1.));gl_Position=vec4(position.xy,0.,1.);}`;

function angularlyVisible(frame, aspect) {
  const r = norm(frame.eyeKm);
  if (r <= EARTH_RADIUS + 300) return true;
  const separation = Math.acos(
    THREE.MathUtils.clamp(-dot(frame.eyeKm, frame.axes.forward) / r, -1, 1)
  );
  const diagonal = coneHalfAngle(Math.tan(THREE.MathUtils.degToRad(frame.fovY / 2)), aspect);
  return separation <= Math.asin((EARTH_RADIUS + 300) / r) + THREE.MathUtils.degToRad(diagonal);
}

// Borrow a resident main-view tile when both cameras see it. A borrowed tile
// stays owned by the main cache, including when that cache changes quality.
class OpticalDetail extends EarthDetail {
  constructor(local, main, night) {
    super(local, night);
    this.main = main;
  }
  release(i) {
    if (this.slots[i].borrowed) {
      this.slots[i] = { key: null, texture: null, born: 0 };
    }
    super.release(i);
  }
  select(camera, height, force) {
    const main = this.main;
    if (this.tiles !== main.tiles || this.columns !== main.columns || this.rows !== main.rows) {
      this.setSource(main.tiles, main.columns, main.rows);
    }
    for (let i = 0; i < this.slots.length; i++)
      if (this.slots[i].borrowed && !this.slots[i].texture.image) this.release(i);
    if (force) this.lastCheck = -Infinity;
    this.update(camera, height);
  }
  loadNext() {
    if (this.work || this.pending || this.env.detailDecodeBusy) return;
    for (const cell of this.wanted) {
      if (this.slots.some((s) => s.key === cell.key)) continue;
      const other = this.main.slots.find((s) => s.key === cell.key && s.texture?.image);
      const i = this.slots.findIndex((s) => !s.key);
      if (!other || i < 0) continue;
      const uniforms = this.env.uniforms;
      this.slots[i] = { ...other, borrowed: true };
      uniforms[`${this.prefix}Map${i}`].value = other.texture;
      uniforms[`${this.prefix}Rect${i}`].value.fromArray(detailRect(cell, this.columns, this.rows));
      uniforms[`${this.prefix}Fade${i}`].value = Math.min(
        1,
        (performance.now() - other.born) / 400
      );
    }
    if (!this.missing()) return;
    this.work = super.loadNext().finally(() => {
      this.work = null;
    });
  }
  missing() {
    return this.wanted.some(
      (cell) => !this.failed.has(cell.key) && !this.slots.some((s) => s.key === cell.key)
    );
  }
  key(now) {
    const loading = this.pending || this.missing(),
      fade = this.slots.map((s) => (s.texture ? Math.min(4, Math.floor((now - s.born) / 100)) : 0));
    return [
      this.slots.map((s) => (s.texture?.image ? s.texture.id : 0)),
      fade,
      loading ? Math.floor(now / 160) : 'ready',
    ].join(',');
  }
}

function sourceInfo(env) {
  const texture = (map) =>
    map && map !== env.fallback && map.image
      ? { width: map.image.width, height: map.image.height, id: map.id }
      : null;
  const s = env.uniforms,
    weather = env.weather,
    local = s.cloudMode.value >= 0.5;
  const day = texture(s.dayMap.value),
    night = texture(s.nightMap.value),
    cloud = texture((local ? s.cloudTemplateMap : s.cloudMap).value);
  return {
    quality: env.quality || null,
    day: day && { ...day, source: env.settings.daySource },
    night: night && { ...night, source: env.settings.nightSource },
    cloud: cloud && {
      ...cloud,
      enabled: s.cloudAmount.value > 0,
      source: local
        ? 'local'
        : weather?.cloudTexture === s.cloudMap.value
          ? weather.cloudRecord?.provider || weather.active.cloud
          : 'builtin',
    },
  };
}

export function createXuntianEarthView(env, quad) {
  const cityScopeId = 'city-scope-' + ++cityViewSerial,
    cityPhotoId = 'city-photo-' + cityViewSerial;
  const camera = new THREE.PerspectiveCamera(),
    scene = new THREE.Scene(),
    rotation = new THREE.Matrix4();
  const vector = new THREE.Vector3(),
    up = new THREE.Vector3(),
    z = new THREE.Vector3();
  // Common samplers and weather parameters keep their original uniform objects.
  // Only camera-dependent geometry, illumination and selected tiles belong here.
  const s = {
    ...env.uniforms,
    linearOutput: u(1),
    linearComposite: u(0),
    sun: u(new THREE.Vector3()),
    localSun: u(new THREE.Vector3()),
    earthInverse: u(new THREE.Matrix3()),
    cloudSeason: u(0),
    lens: u(new THREE.Vector2()),
    fixedEye: u(new THREE.Vector3()),
    cameraToInertial: u(new THREE.Matrix3()),
  };
  const local = Object.create(env);
  local.uniforms = s;
  local.detailDecodeBusy = false;
  local.earth = new THREE.Object3D();
  const day = new OpticalDetail(local, env.detail, false),
    night = new OpticalDetail(local, env.nightDetail, true),
    details = [day, night];
  const groundMat = new THREE.ShaderMaterial({
    uniforms: s,
    vertexShader: quadVertex,
    fragmentShader: surfaceFragment,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  const ground = new THREE.Mesh(quad, groundMat);
  ground.frustumCulled = false;
  scene.add(ground);
  const elevationLayer =
    env.elevation && new EarthElevationLayer(env.elevation, s, cityScopeId, { optical: true });
  const elevationPhotoLayer =
    env.elevation && new EarthElevationLayer(env.elevation, s, cityPhotoId, { optical: true });
  if (elevationLayer) scene.add(elevationLayer.group, elevationPhotoLayer.group);
  // Share geometry, GLSL and all active texture objects with the environment.
  // Dedicated material wrappers avoid touching main-camera render state.
  function shell(original, uniforms, rayPass = false) {
    const src = original.material;
    const input = rayPass
      ? { ...uniforms, lens: s.lens, cameraToInertial: s.cameraToInertial }
      : uniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms: input,
      vertexShader: rayPass ? rayVertex : src.vertexShader,
      fragmentShader: src.fragmentShader,
      side: rayPass ? THREE.FrontSide : src.side,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: src.blending,
    });
    const mesh = new THREE.Mesh(rayPass ? quad : original.geometry, mat);
    mesh.frustumCulled = !rayPass;
    scene.add(mesh);
    return mesh;
  }
  const clouds = shell(env.clouds, s),
    volume = shell(env.volumeClouds, s);
  const airU = {
    ...env.atmosphere.material.uniforms,
    sun: s.sun,
    linearOutput: s.linearOutput,
    linearComposite: s.linearComposite,
  };
  const air = shell(env.atmosphere, airU, true),
    transmission = shell(
      env.atmosphereTransmission,
      env.atmosphereTransmission.material.uniforms,
      true
    );
  const tr = transmission.material;
  tr.defines = { OPTICAL_COVERAGE: 1 };
  tr.blending = THREE.CustomBlending;
  tr.blendSrc = THREE.ZeroFactor;
  tr.blendDst = THREE.SrcColorFactor;
  tr.blendSrcAlpha = THREE.OneFactor;
  tr.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  let visible = false,
    disposed = false,
    previousFootprint = null;
  const surfaceVisible = [false, false];
  function prepare(frame, size, force = false, photo = false) {
    // Attribution follows possible ground/ridges in the actual detector,
    // independently of the broader 300 km atmosphere rendering envelope.
    surfaceVisible[Number(photo)] = sphereIntersectsRectangularView(
      frame.eyeKm,
      frame.axes,
      frame.fovY,
      size.aspect,
      EARTH_RADIUS + 12
    );
    visible = angularlyVisible(frame, size.aspect);
    if (!visible) {
      env.cityTerrain?.setView(photo ? cityPhotoId : cityScopeId, null, photo ? 3 : 2, force);
      env.elevation?.release(photo ? cityPhotoId : cityScopeId);
      previousFootprint = null;
      for (const d of details) if (d.wanted.length || d.slots.some((slot) => slot.key)) d.clear();
      return;
    }
    const a = frame.axes,
      axes = frame.q.earthAxes;
    if (env.cityTerrain) {
      const id = photo ? cityPhotoId : cityScopeId;
      env.cityTerrain.setView(
        id,
        env.quality !== 'simple' ? cityOpticalView(frame, size) : null,
        photo ? 3 : 2,
        force || photo
      );
      Object.assign(s, env.cityTerrain.uniforms(id, photo ? 3 : 2));
    }
    s.cameraToInertial.value.fromArray([...a.right, ...a.up, ...a.forward]);
    s.earthInverse.value.fromArray(axes.flat()).transpose();
    s.fixedEye.value.fromArray(frame.eyeKm).applyMatrix3(s.earthInverse.value);
    s.sun.value.fromArray(frame.q.sun).normalize();
    s.localSun.value.copy(s.sun.value).applyMatrix3(s.earthInverse.value);
    s.cloudSeason.value = THREE.MathUtils.clamp(s.localSun.value.z / 0.398, -1, 1);
    const tangent = Math.tan(THREE.MathUtils.degToRad(frame.fovY / 2));
    s.lens.value.set(tangent * size.aspect, tangent);
    camera.position.fromArray(frame.eyeKm);
    camera.up.fromArray(a.up);
    camera.lookAt(vector.fromArray(a.forward).add(camera.position));
    camera.aspect = size.aspect;
    camera.fov = frame.fovY;
    camera.near = Math.max(
      0.05,
      Math.min(20, 0.15 * (camera.position.length() - EARTH_RADIUS - 300))
    );
    camera.far = camera.position.length() + EARTH_RADIUS + 600;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    rotation.makeBasis(vector.fromArray(axes[0]), up.fromArray(axes[1]), z.fromArray(axes[2]));
    local.earth.quaternion.setFromRotationMatrix(rotation);
    if (env.elevation) {
      const id = photo ? cityPhotoId : cityScopeId;
      env.elevation.setView(id, cityOpticalView(frame, size), photo ? 3 : 2, force || photo);
      const layer = photo ? elevationPhotoLayer : elevationLayer;
      ground.visible = !layer.update(local.earth.quaternion);
      (photo ? elevationLayer : elevationPhotoLayer).group.visible = false;
      clouds.material.depthTest = volume.material.depthTest = !ground.visible;
    }
    // A final pan can arrive inside the main cache's 250 ms interval. At a
    // paused epoch it must still select the new tiles before the view goes idle.
    const footprint = [
      ...frame.eyeKm,
      ...a.forward,
      ...a.up,
      ...axes.flat(),
      frame.fovY,
      size.aspect,
      size.h,
    ].join(',');
    const repoint = env.sim.paused && footprint !== previousFootprint;
    previousFootprint = footprint;
    for (const d of details) d.select(camera, size.h, force || repoint);
    clouds.geometry = env.clouds.geometry;
    clouds.quaternion.copy(local.earth.quaternion);
    volume.quaternion.copy(local.earth.quaternion);
    clouds.visible = env.clouds.visible;
    volume.visible = env.volumeClouds.visible;
    air.visible = env.atmosphere.visible;
    const linear =
      env.quality === 'high' &&
      env.api.renderer.extensions.has('EXT_color_buffer_float') &&
      !env.hdr.failed;
    s.linearComposite.value = linear ? 1 : 0;
    transmission.visible = linear && air.visible;
    transmission.renderOrder = 2.9;
    air.renderOrder = 3;
    clouds.renderOrder = linear ? 3.05 : 2;
    volume.renderOrder = linear ? 3.06 : 2.4;
    // Coverage in alpha is reserved for radiance behind the atmosphere/clouds.
    // The scattering pass adds light, without treating every halo ray as opaque.
    air.material.blending = linear ? THREE.CustomBlending : THREE.NormalBlending;
    air.material.blendSrc = THREE.OneFactor;
    air.material.blendDst = THREE.OneFactor;
    air.material.blendSrcAlpha = THREE.ZeroFactor;
    air.material.blendDstAlpha = THREE.OneFactor;
  }
  function render(renderer, frame, size, target, photo = false) {
    prepare(frame, size, false, photo);
    if (!visible) return null;
    if (!target.earth) {
      target.earth = new THREE.WebGLRenderTarget(size.w, size.h, {
        depthBuffer: true,
        type: target.scene.texture.type,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        generateMipmaps: false,
      });
      target.earth.texture.colorSpace = THREE.LinearSRGBColorSpace;
    }
    renderer.setRenderTarget(target.earth);
    // Relief writes depth; reuse of this target must not retain the previous
    // pointing's depth and punch holes in the new view.
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    if (renderer.properties.get(groundMat).currentProgram?.diagnostics?.runnable === false)
      throw Error('巡天取景图像生成失败');
    return target.earth.texture;
  }
  async function prepareCityPhoto(frame, size, waitMs = 8000) {
    await env.elevation?.prepareView(
      cityPhotoId,
      angularlyVisible(frame, size.aspect) ? cityOpticalView(frame, size) : null,
      3,
      waitMs
    );
    if (!env.cityTerrain) return;
    if (!angularlyVisible(frame, size.aspect) || env.quality === 'simple') {
      env.cityTerrain.setView(cityPhotoId, null, 3, true);
      return;
    }
    await env.cityTerrain.prepareView(cityPhotoId, cityOpticalView(frame, size), 3, waitMs);
  }
  async function preparePhoto(frame, size) {
    await prepareCityPhoto(frame, size);
    if (!angularlyVisible(frame, size.aspect)) return;
    while (env.loading && !disposed) {
      const ready = env.ready;
      await ready;
      if (ready === env.ready) break;
    }
    // Wait for this photograph's actual footprint, including the tiles near the
    // oblique limb. A failed tile keeps the selected global base as its fallback.
    for (let i = 0; i < 12 && !disposed; i++) {
      prepare(frame, size, true, true);
      const pending = details.map((d) => d.work).filter(Boolean);
      if (!pending.length) break;
      await Promise.all(pending);
    }
    if (!disposed)
      for (const d of details)
        for (const slot of d.slots)
          if (slot.texture) slot.born = Math.min(slot.born, performance.now() - 400);
  }
  function appearanceKey() {
    const v = env.uniforms,
      now = performance.now();
    return [
      env.quality,
      ...['dayMap', 'nightMap', 'cloudMap', 'cloudTemplateMap', 'oceanMap', 'solarDepth'].map(
        (k) => v[k].value?.id
      ),
      ...[
        'cloudMode',
        'cloudChannel',
        'cloudTone',
        'cloudAmount',
        'cloudNightVisible',
        'cloudMotion',
        'motionTime',
        'seed',
        'weatherTime',
        'cloudSteps',
        'cloudMoonLight',
        'airglowStrength',
        'multipleStrength',
      ].map((k) => v[k]?.value),
      env.clouds.visible,
      env.volumeClouds.visible,
      env.atmosphere.visible,
      env.cityTerrain?.key(cityScopeId),
      env.elevation?.key(cityScopeId),
      ...(visible ? details.map((d) => d.key(now)) : []),
    ].join('|');
  }
  return {
    render,
    preparePhoto,
    prepareCityPhoto,
    appearanceKey,
    pick(frame, photo = false) {
      if (!env.elevation?.enabled) return undefined;
      const transform = (v) => frame.q.earthAxes.map((a) => dot(a, v));
      return env.elevation.pick(
        transform(frame.eyeKm),
        transform(frame.axes.forward),
        photo ? cityPhotoId : cityScopeId
      );
    },
    hides(frame, direction, photo = false) {
      if (!env.elevation?.enabled) return false;
      const transform = (v) => frame.q.earthAxes.map((axis) => dot(axis, v));
      return env.elevation.skyOccluded(
        transform(frame.eyeKm),
        transform(direction),
        photo ? cityPhotoId : cityScopeId
      );
    },
    cityStatus: (photo = false) => env.cityTerrain?.status(photo ? cityPhotoId : cityScopeId),
    elevationStatus: (photo = false) => ({
      ...env.elevation?.status(photo ? cityPhotoId : cityScopeId),
      visible: surfaceVisible[Number(photo)],
    }),
    releasePhoto: () => {
      env.cityTerrain?.release(cityPhotoId);
      env.elevation?.release(cityPhotoId);
      surfaceVisible[1] = false;
    },
    source() {
      return {
        ...sourceInfo(env),
        city: env.cityTerrain?.status(cityScopeId),
        elevation: env.elevation?.status(cityScopeId),
        dayTiles: day.slots.filter((s) => s.key).map((s) => s.key),
        nightTiles: night.slots.filter((s) => s.key).map((s) => s.key),
      };
    },
    dispose() {
      disposed = true;
      env.cityTerrain?.release(cityScopeId);
      env.cityTerrain?.release(cityPhotoId);
      env.elevation?.release(cityScopeId);
      env.elevation?.release(cityPhotoId);
      elevationLayer?.dispose();
      elevationPhotoLayer?.dispose();
      for (const d of details) d.clear();
      for (const m of scene.children) m.material?.dispose();
    },
  };
}
