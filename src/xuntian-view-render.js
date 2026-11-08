import { finderLabels, paintFinderLabels } from './xuntian-labels.js';
import * as THREE from 'three';
import { dot } from './orbit.js';
import { stationNearPlane } from './xuntian-station-depth.js';
import { inspectStationRay } from './xuntian-station-pin.js';
import { createSurveyProbe } from './survey-live-probe.js';
import { createSolarView } from './xuntian-solar-view.js';
import { createXuntianEarthView } from './xuntian-earth-view.js';
import { queryXuntianStars } from './xuntian-catalog.js';
import {
  CATALOG_SIGNAL,
  coneHalfAngle,
  groundHit,
  sensorOptics,
  starColour,
  starInSky,
  toLocal,
  VIEW_MAX_RATE,
} from './xuntian-view-math.js';
import { detectorSize } from './xuntian-image-quality.js';
import {
  backgroundFragment,
  guideFragment,
  guideVertex,
  quadVertex,
  sensorFragment,
  starFragment,
  starVertex,
} from './xuntian-view-shaders.js';
import { xuntianSkySource, xuntianStarPSF } from './xuntian-view-sky.js';
import { identifyXuntianCrosshair } from './xuntian-crosshair.js';
import { createCityFinder } from './xuntian-ground-target.js';
import {
  getSkyConstellationLines,
  getSkyConstellationBoundaries,
} from './sky-annotation-layout.js';
import { getSkyCulture, normalizeSkyCulture } from './sky-cultures.js';
import { equatorial } from './environment-math.js';
import {
  normalizeStarChartSettings,
  skyCultureArtOptions,
  skyCultureArtEnabled,
} from './star-chart-settings.js';
import { paintSolarPhotoCaption } from './solar-photo-caption.js';
import { SkyDetailLayer } from './sky-detail-layer.js';
import { skyDetailView } from './sky-detail-plan.js';
import { paintSkyDetailCaption } from './sky-detail-controls.js';
import { paintCityTerrainCaption } from './city-terrain-controls.js';
import { paintElevationCaption } from './earth-elevation-controls.js';
import { ConstellationArtLayer, paintConstellationArtCaption } from './constellation-art-layer.js';
import { skyCulturePhotoCredit } from './sky-culture-caption.js';
import { skyReferenceLayers } from './sky-reference.js';
import { referenceLineGeometry } from './sky-reference-layer.js';

let skyDetailSequence = 0;

// A geocentric celestial chart has no terrestrial foreground or spacecraft.
// Keep this explicit: an origin observer alone would make the terrain renderer
// treat the camera as underground, and its sky visibility test divide by zero.
export function geocentricSkyFrame(frame) {
  if (!frame) return frame;
  return {
    ...frame,
    eyeKm: [0, 0, 0],
    eyeLocal: [0, 0, 0],
    showStation: false,
    solarChannel: 'none',
    solarObservation: null,
  };
}

function celestialForeground() {
  return {
    preparePhoto() {},
    prepareCityPhoto() {},
    render: () => null,
    pick: () => null,
    hides: () => false,
    cityStatus: () => null,
    elevationStatus: () => ({ visible: false }),
    appearanceKey: () => 'sky-only',
    source: () => ({ skyOnly: true }),
    releasePhoto() {},
    dispose() {},
  };
}

const axesArray = (axes) => [axes.right, axes.up, axes.forward];
const matrix = (columns) => new THREE.Matrix3().fromArray(columns.flat());
const v2 = () => ({ value: new THREE.Vector2() }),
  v3 = () => ({ value: new THREE.Vector3() }),
  mat = () => ({ value: new THREE.Matrix3() });
const uniform = (value) => ({ value });
const unavailable = () => ({
  available: false,
  center: { kind: 'sky' },
  starCount: 0,
  limitMagnitude: null,
  busy: false,
});

function frameSize(canvas, frame, width, maxWidth) {
  const rect = canvas.getBoundingClientRect(),
    aspect =
      frame.aspect || (rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 16 / 9);
  return detectorSize(rect.width || 480, window.devicePixelRatio, aspect, maxWidth, width);
}
function makeTargets(renderer, w, h) {
  const options = {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  };
  const type = renderer.extensions.has('EXT_color_buffer_float')
    ? THREE.HalfFloatType
    : THREE.UnsignedByteType;
  const scene = new THREE.WebGLRenderTarget(w, h, { ...options, type, depthBuffer: true });
  const film = new THREE.WebGLRenderTarget(w, h, { ...options, depthBuffer: false });
  const bytes = new Uint8Array(w * h * 4);
  return {
    w,
    h,
    scene,
    film,
    bytes,
    dispose() {
      scene.dispose();
      film.dispose();
      this.earth?.dispose();
    },
  };
}
function withSharedRenderer(renderer, draw) {
  const target = renderer.getRenderTarget(),
    face = renderer.getActiveCubeFace(),
    mip = renderer.getActiveMipmapLevel();
  const colour = renderer.getClearColor(new THREE.Color()),
    alpha = renderer.getClearAlpha(),
    auto = renderer.autoClear;
  const shadow = renderer.shadowMap,
    shadowAuto = shadow.autoUpdate,
    shadowDirty = shadow.needsUpdate,
    xr = renderer.xr.enabled;
  try {
    // Use the main scene's existing shadow map without updating it from this camera.
    renderer.xr.enabled = false;
    shadow.autoUpdate = false;
    shadow.needsUpdate = false;
    renderer.autoClear = false;
    renderer.setClearColor(0, 0);
    return draw();
  } finally {
    renderer.setRenderTarget(target, face, mip);
    renderer.setClearColor(colour, alpha);
    renderer.autoClear = auto;
    shadow.autoUpdate = shadowAuto;
    shadow.needsUpdate = shadowDirty;
    renderer.xr.enabled = xr;
  }
}
function screenPass(geometry, fragmentShader, uniforms) {
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: quadVertex,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  return { scene, material };
}

// Add celestial radiance without turning stars or teaching guides into opaque
// foreground pixels. The original assembly alone writes foreground coverage.
const celestialBlend = {
  blending: THREE.CustomBlending,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
};
function makeStarLayer(renderer, shared) {
  const geometry = new THREE.BufferGeometry(),
    u = {
      ...shared,
      inertialToCamera: mat(),
      pointSigma: v2(),
      starSignal: uniform(1),
      limitMagnitude: uniform(12),
      maxPointSize: uniform(
        renderer.getContext().getParameter(renderer.getContext().ALIASED_POINT_SIZE_RANGE)[1]
      ),
    };
  const material = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: starVertex,
    fragmentShader: starFragment,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    ...celestialBlend,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);
  let records = [],
    cache = null,
    capacity = 0;
  function update(frame, optics, aspect, height, sky, limit) {
    points.visible = sky.showStars && sky.gain > 0;
    if (!points.visible) return 0;
    const radius = coneHalfAngle(optics.tangent, aspect),
      need = Math.ceil((limit + 0.4) * 2) / 2;
    const distance = cache
      ? (Math.acos(Math.min(1, Math.max(-1, dot(frame.axes.forward, cache.center)))) * 180) /
        Math.PI
      : Infinity;
    if (!cache || distance + radius > cache.radius + 1e-8 || need > cache.magnitude) {
      const padded = Math.min(179, radius + Math.min(5, Math.max(0.2, radius * 0.25)));
      records = queryXuntianStars(frame.axes.forward, padded, { maxMagnitude: need });
      cache = { center: [...frame.axes.forward], radius: padded, magnitude: need };
      if (!capacity || records.length > capacity) {
        capacity = 2 ** Math.ceil(Math.log2(Math.max(32, records.length)));
        geometry.dispose();
        for (const [name, size] of [
          ['position', 3],
          ['magnitude', 1],
          ['tint', 3],
          ['edgeWeight', 1],
        ])
          geometry.setAttribute(
            name,
            new THREE.Float32BufferAttribute(new Float32Array(capacity * size), size).setUsage(
              THREE.DynamicDrawUsage
            )
          );
      }
      const { position, magnitude, tint, edgeWeight } = geometry.attributes;
      for (let i = 0; i < records.length; i++) {
        const star = records[i];
        position.setXYZ(i, ...star.direction);
        magnitude.setX(i, star.mag);
        tint.setXYZ(i, ...starColour(star.bv));
        edgeWeight.setX(i, star.edgeWeight ?? 1);
      }
      for (const a of [position, magnitude, tint, edgeWeight]) a.needsUpdate = true;
      geometry.setDrawRange(0, records.length);
    }
    const psf = xuntianStarPSF(optics, height);
    u.inertialToCamera.value.copy(matrix(axesArray(frame.axes))).transpose();
    u.pointSigma.value.set(psf.core, psf.wing);
    u.starSignal.value = sky.gain * CATALOG_SIGNAL;
    u.limitMagnitude.value = limit;
    let count = 0;
    for (const star of records)
      if (
        star.mag - 2.5 * Math.log10(Math.max(1e-8, star.edgeWeight ?? 1)) <= limit &&
        starInSky(star.direction, frame.axes, optics.tangent, aspect, frame.eyeKm)
      )
        count++;
    return count;
  }
  return {
    scene,
    material,
    update,
    get records() {
      return records;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// All chart lines use the same J2000 paths as the main star chart. They are
// rendered before physical foregrounds, and the shader clips Earth per pixel.
function constellationGuide(shared) {
  const u = {
    ...shared,
    inertialToCamera: mat(),
    inverseGain: uniform(1),
    guideTint: v3(),
    guideDashed: uniform(0),
  };
  const material = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: guideVertex,
    fragmentShader: guideFragment,
    transparent: true,
    ...celestialBlend,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  let layers = [],
    signature = '';
  const referenceLayers = new Map();
  function rebuild(settings, focusTargetId) {
    const culture = normalizeSkyCulture(settings.skyCulture),
      key = culture + ':' + (focusTargetId || '');
    if (key === signature) return;
    for (const layer of layers) layer.geometry.dispose();
    const selected =
      culture === 'chinese' &&
      getSkyCulture(culture).asterisms.find((a) => a.targetId === focusTargetId);
    const definitions = [
      [
        'constellationLines',
        getSkyConstellationLines(culture),
        culture === 'chinese' ? [0.12, 0.085, 0.035] : [0.024, 0.068, 0.094],
        false,
      ],
      [
        'constellationBoundaries',
        getSkyConstellationBoundaries(culture),
        [0.063, 0.04, 0.083],
        true,
      ],
    ];
    if (selected)
      definitions.push([
        'constellationLines',
        selected.lines.map((path) => path.map((p) => equatorial(...p))),
        [0.48, 0.31, 0.1],
        false,
      ]);
    layers = definitions.map(([setting, paths, tint, dashed]) => {
      const positions = [];
      for (const path of paths)
        for (let i = 1; i < path.length; i++) positions.push(...path[i - 1], ...path[i]);
      const geometry = new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
      );
      const scene = new THREE.Scene(),
        lines = new THREE.LineSegments(geometry, material);
      lines.frustumCulled = false;
      scene.add(lines);
      return { setting, tint, dashed, geometry, scene };
    });
    signature = key;
  }
  function draw(renderer, camera, settings, axes, gain, focusTargetId, frame, aspect) {
    rebuild(settings, focusTargetId);
    u.inertialToCamera.value.copy(matrix(axes)).transpose();
    u.inverseGain.value = 1 / Math.max(0.0001, gain);
    for (const layer of layers)
      if (settings[layer.setting]) {
        u.guideTint.value.fromArray(layer.tint);
        u.guideDashed.value = Number(layer.dashed);
        renderer.render(layer.scene, camera);
      }
    const viewRotation = matrix(axes).transpose();
    for (const definition of skyReferenceLayers({
      settings,
      epoch: frame.q.t,
      fovY: frame.fovY,
      aspect,
      forward: frame.axes.forward,
    })) {
      let layer = referenceLayers.get(definition.setting);
      if (!layer) {
        const scene = new THREE.Scene(),
          lines = new THREE.LineSegments(new THREE.BufferGeometry(), material);
        lines.frustumCulled = false;
        scene.add(lines);
        layer = { scene, lines, key: '' };
        referenceLayers.set(definition.setting, layer);
      }
      if (layer.key !== definition.key) {
        layer.lines.geometry.dispose();
        layer.lines.geometry = referenceLineGeometry(definition.paths);
        layer.key = definition.key;
      }
      u.inertialToCamera.value.multiplyMatrices(viewRotation, matrix(definition.columns));
      u.guideTint.value.fromArray(definition.tint);
      u.guideDashed.value = Number(definition.dashed);
      renderer.render(layer.scene, camera);
    }
  }
  return {
    draw,
    dispose() {
      for (const layer of layers) layer.geometry.dispose();
      for (const layer of referenceLayers.values()) layer.lines.geometry.dispose();
      material.dispose();
    },
  };
}

function stationView(sim) {
  const { api } = sim,
    raycaster = new THREE.Raycaster(),
    frustum = new THREE.Frustum(),
    projection = new THREE.Matrix4();
  raycaster.firstHitOnly = true;
  const camera = new THREE.PerspectiveCamera(),
    direction = new THREE.Vector3();
  function prepare(frame, aspect) {
    const { q, axes, localAxes } = frame,
      dirs =
        localAxes ||
        Object.fromEntries(
          Object.entries(axes).map(([key, axis]) => [key, toLocal(q.basis, axis)])
        );
    direction.fromArray(dirs.forward).normalize();
    camera.position.fromArray(frame.eyeLocal);
    camera.up.fromArray(dirs.up);
    camera.lookAt(camera.position.clone().add(direction));
    camera.aspect = aspect;
    camera.fov = frame.fovY;
    camera.updateMatrixWorld(true);
    camera.near = stationNearPlane(
      camera,
      Object.entries(api.groups)
        .filter(([id, group]) => group !== api.groups.freeXT && group.visible)
        .map(([id]) => sim.tracker?.occluders?.[id]?.box)
    );
    camera.far = Math.max(10000, camera.position.length() * 2 + 5000);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    frustum.setFromProjectionMatrix(
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    );
    raycaster.set(camera.position, direction);
    raycaster.near = camera.near;
    raycaster.far = camera.far;
  }
  function inspect(frame, earth) {
    if (frame.showStation === false) return { visible: false, center: earth || { kind: 'sky' } };
    return inspectStationRay(sim, raycaster, { frustum, earth });
  }
  function draw(renderer, fill) {
    const scene = api.scene,
      hidden = [],
      bg = scene.background,
      env = scene.environment,
      envStrength = scene.environmentIntensity,
      fillIntensity = api.fillLight.intensity;
    const hide = (object) => {
      if (object?.visible) {
        hidden.push(object);
        object.visible = false;
      }
    };
    try {
      for (const child of scene.children)
        if (child !== api.modelRoot && !child.isLight && child !== api.sunLight.target) hide(child);
      for (const child of api.modelRoot.children) if (child !== api.model) hide(child);
      // Omit the observing vehicle alone. Docked Xuntian copies remain part of the assembly.
      hide(api.groups.freeXT);
      scene.background = null;
      scene.environment = fill ? sim.lighting?.reflection?.texture || env : null;
      scene.environmentIntensity = 0.35;
      api.fillLight.intensity = fill ? 0.65 : 0;
      renderer.clearDepth();
      renderer.render(scene, camera);
    } finally {
      for (const child of hidden) child.visible = true;
      scene.background = bg;
      scene.environment = env;
      scene.environmentIntensity = envStrength;
      api.fillLight.intensity = fillIntensity;
    }
  }
  function hides(frame, dir) {
    raycaster.set(camera.position, direction.fromArray(toLocal(frame.q.basis, dir)));
    return inspectStationRay(sim, raycaster, { frustum }).center.kind === 'station';
  }
  return { prepare, inspect, draw, hides };
}

function writeCanvas(canvas, image, bytes, w, h) {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('巡天取景图像生成失败');
  const pixels = image?.width === w && image.height === h ? image : ctx.createImageData(w, h),
    stride = w * 4;
  for (let row = 0; row < h; row++)
    pixels.data.set(bytes.subarray((h - 1 - row) * stride, (h - row) * stride), row * stride);
  ctx.putImageData(pixels, 0, 0);
  return pixels;
}

export function createXuntianViewRenderer(
  sim,
  canvas,
  {
    cityFinder = createCityFinder(sim.environment.geography?.items || []),
    skyOnly = false,
    captions = true,
  } = {}
) {
  const renderer = sim.api.renderer,
    env = sim.environment,
    geometry = new THREE.PlaneGeometry(2, 2),
    screenCamera = new THREE.Camera();
  const skyViewId = `scope-${++skyDetailSequence}`,
    skyPhotoId = `photo-${skyDetailSequence}`;
  const skyDetailLayer = env.skyDetail && new SkyDetailLayer(env.skyDetail, skyViewId, true),
    skyPhotoLayer = env.skyDetail && new SkyDetailLayer(env.skyDetail, skyPhotoId, true);
  const artLayer =
      env.constellationArt && new ConstellationArtLayer(env.constellationArt, skyViewId, true, 2),
    artPhotoLayer =
      env.constellationArt && new ConstellationArtLayer(env.constellationArt, skyPhotoId, true, 3);
  const wantsArt = (frame, size, photo = false) =>
    !!(photo ? frame.photoNames : frame.previewNames) &&
    skyCultureArtEnabled(normalizeStarChartSettings(frame.chartSettings ?? env.settings)) &&
    frame.showStars !== false &&
    wantsSkyDetail({ ...frame, showGalaxy: true }, size, true);
  function wantsSkyDetail(frame, size, includeBackground = false) {
    if (
      (!includeBackground && !env.skyDetail?.enabled) ||
      frame.showStars === false ||
      frame.showGalaxy === false ||
      (frame.solarChannel && frame.solarChannel !== 'none')
    )
      return false;
    if (skyOnly) return true;
    const radius = Math.hypot(...frame.eyeKm),
      earthAngle = Math.asin(Math.min(1, 6371 / radius)),
      separation = Math.acos(
        Math.max(-1, Math.min(1, -dot(frame.eyeKm, frame.axes.forward) / radius))
      ),
      half = Math.atan(Math.tan((frame.fovY * Math.PI) / 360) * Math.hypot(1, size.aspect));
    return separation + half >= earthAngle;
  }
  const shared = { lens: v2(), screen: v2(), cameraToFixed: mat(), fixedEye: v3() };
  const u = {
    ...shared,
    cameraToInertial: mat(),
    galaxy: uniform(null),
    galaxyMode: uniform(0),
    skyGain: uniform(1),
    mainSkyHDR: uniform(0),
    opticalGain: uniform(1),
    toneMappingExposure: uniform(1),
  };
  const sensor = {
    image: uniform(null),
    gain: uniform(1),
    earthImage: uniform(null),
    earthOn: uniform(0),
    earthExposure: uniform(1),
  };
  const background = screenPass(geometry, backgroundFragment, u),
    film = screenPass(geometry, sensorFragment, sensor);
  const earthView = skyOnly ? celestialForeground() : createXuntianEarthView(env, geometry),
    solarView = createSolarView(env, geometry, shared);
  const stars = makeStarLayer(renderer, shared),
    guide = constellationGuide(shared),
    station = skyOnly ? null : stationView(sim);
  let surveyProbe = null,
    preview = null,
    previewImage = null,
    previewPending = false,
    capturePending = false,
    disposed = false,
    lastRender = -Infinity,
    lastStatus = unavailable(),
    lastPhotoStatus = null,
    lastCityPhotoStatus = null,
    previewCount = 0;
  let identification = null,
    lastIdentification = -Infinity,
    identificationKey = '',
    identificationKind = '',
    identificationAppearance = '';
  function valid(frame) {
    return !!(
      frame?.q?.basis &&
      frame?.q?.earthAxes &&
      frame?.axes?.forward &&
      frame?.axes?.right &&
      frame?.axes?.up &&
      frame.eyeKm &&
      frame.eyeLocal &&
      frame.fovY > 0 &&
      frame.fovY < 179 &&
      frame.apertureMm > 0
    );
  }
  function readIdentification(frame, surface, limit, groundSurface) {
    const height = canvas.clientHeight || canvas.height || 300,
      now = performance.now();
    const appearance = [
      frame.language,
      frame.chartSettings?.skyCulture || 'western',
      frame.chartSettings?.deepSkyObjects !== false,
      frame.chartSettings?.deepSkyScope || 'featured',
    ].join('|');
    const key = [
      frame.q.t,
      appearance,
      frame.fovY,
      frame.showStars,
      height,
      limit,
      ...frame.eyeKm,
      ...frame.axes.forward,
      ...frame.q.earthAxes.flat(),
      surface?.kind,
      surface?.moduleId,
      surface?.distanceKm,
      groundSurface?.distanceKm,
    ].join('|');
    if (key === identificationKey) return identification;
    if (
      now - lastIdentification < 160 &&
      identificationKind === surface?.kind &&
      identificationAppearance === appearance
    )
      return identification;
    identification = identifyXuntianCrosshair(frame, {
      surface,
      groundSurface,
      displayHeight: height,
      cityFinder,
      limitMagnitude: limit,
      blocked: (dir) =>
        earthView.hides(frame, dir) || (frame.showStation !== false && station.hides(frame, dir)),
    });
    lastIdentification = now;
    identificationKey = key;
    identificationKind = surface?.kind;
    identificationAppearance = appearance;
    return identification;
  }
  function draw(frame, size, target, annotations = false) {
    const { w, h, aspect } = size,
      optics = sensorOptics(frame.fovY, frame.apertureMm, frame.exposure ?? 1),
      axes = axesArray(frame.axes),
      terrainHit = earthView.pick(frame, !annotations),
      ground =
        terrainHit === undefined
          ? groundHit(frame.eyeKm, frame.axes.forward, frame.q.earthAxes)
          : terrainHit;
    const solarImaging = !!frame.solarChannel && frame.solarChannel !== 'none';
    const wantNames = annotations ? frame.previewNames : frame.photoNames,
      chartSettings = normalizeStarChartSettings(frame.chartSettings ?? env.settings);
    // Solar instrument channels do not record the optical Milky Way. Keep the
    // physical foreground/occlusion, without magnifying a panorama behind SDO.
    if (solarImaging)
      Object.assign(chartSettings, {
        starLabels: false,
        catalogStarLabels: false,
        constellationNames: false,
        constellationLines: false,
        constellationBoundaries: false,
        equatorialGrid: false,
        eclipticLine: false,
        constellationArt: false,
        deepSkyObjects: false,
      });
    station?.prepare(frame, aspect);
    const local = station?.inspect(frame, ground) || { visible: false, center: { kind: 'sky' } };
    u.cameraToInertial.value.copy(matrix(axes));
    u.cameraToFixed.value.copy(matrix(axes.map((axis) => toLocal(frame.q.earthAxes, axis))));
    u.fixedEye.value.fromArray(toLocal(frame.q.earthAxes, frame.eyeKm));
    u.lens.value.set(optics.tangent * aspect, optics.tangent);
    u.screen.value.set(w, h);
    const sky = solarImaging
        ? { status: 'off', gain: 0, showStars: false }
        : xuntianSkySource(env, frame),
      panorama = sky.status === 'panorama';
    u.galaxy.value = panorama ? env.galaxyTexture : null;
    u.galaxyMode.value = panorama ? 2 : ['off', 'catalog'].includes(sky.status) ? 0 : 1;
    u.skyGain.value = sky.gain;
    u.mainSkyHDR.value =
      env.quality === 'high' && renderer.extensions.has('EXT_color_buffer_float') && !env.hdr.failed
        ? 1
        : 0;
    u.opticalGain.value = optics.areaGain;
    u.toneMappingExposure.value = renderer.toneMappingExposure;
    sensor.image.value = target.scene.texture;
    sensor.gain.value = optics.areaGain;
    const limit =
      sky.showStars && sky.gain > 0 ? optics.limitMagnitude + 2.5 * Math.log10(sky.gain) : null;
    const count = stars.update(frame, optics, aspect, h, sky, limit);
    const detailLayer = annotations ? skyDetailLayer : skyPhotoLayer;
    const skyDetail = detailLayer?.update(skyDetailView(frame, size), wantsSkyDetail(frame, size), {
      skyGain: sky.gain,
      mainSkyHDR: u.mainSkyHDR.value,
      opticalGain: optics.areaGain,
      toneMappingExposure: renderer.toneMappingExposure,
      cameraToFixed: u.cameraToFixed.value,
      fixedEye: u.fixedEye.value,
    });
    if (skyDetail) skyDetail.skyVisible = wantsSkyDetail(frame, size, true) && sky.gain > 0;
    const currentArtLayer = annotations ? artLayer : artPhotoLayer;
    const constellationArt = currentArtLayer?.update(
      skyDetailView(frame, size),
      wantsArt(frame, size, !annotations),
      {
        inverseGain: 1 / Math.max(0.0001, optics.areaGain),
        ...skyCultureArtOptions(frame.chartSettings ?? env.settings),
        focusTargetId: frame.focusTargetId,
        overviewArtworkId: frame.overviewArtworkId,
        cameraToFixed: u.cameraToFixed.value,
        fixedEye: u.fixedEye.value,
      }
    );
    let solarObservation = null;
    withSharedRenderer(renderer, () => {
      sensor.earthImage.value = earthView.render(renderer, frame, size, target, !annotations);
      sensor.earthOn.value = sensor.earthImage.value ? 1 : 0;
      sensor.earthExposure.value = frame.exposure ?? 1;
      renderer.setRenderTarget(target.scene);
      renderer.clear(true, true, false);
      renderer.render(background.scene, screenCamera);
      renderer.render(stars.scene, screenCamera);
      if (detailLayer) renderer.render(detailLayer.scene, screenCamera);
      if (currentArtLayer) renderer.render(currentArtLayer.scene, screenCamera);
      if (wantNames)
        guide.draw(
          renderer,
          screenCamera,
          chartSettings,
          axes,
          optics.areaGain,
          frame.focusTargetId,
          frame,
          aspect
        );
      solarView.draw(renderer, screenCamera, frame, size, optics);
      if (local.visible) station.draw(renderer, !!frame.fillLight);
      renderer.setRenderTarget(target.film);
      renderer.clear(true, false, false);
      renderer.render(film.scene, screenCamera);
      solarObservation = solarView.drawObservation(
        renderer,
        screenCamera,
        frame,
        size,
        target.scene.texture
      );
      if (
        [background.material, stars.material, film.material].some(
          (material) =>
            renderer.properties.get(material).currentProgram?.diagnostics?.runnable === false
        )
      )
        throw Error('巡天取景图像生成失败');
    });
    const labels = wantNames
      ? finderLabels(
          { ...frame, chartSettings },
          size,
          annotations ? size.w / Math.max(1, canvas.clientWidth) : Math.max(1, size.w / 800),
          (dir) =>
            earthView.hides(frame, dir, !annotations) ||
            (local.visible && station.hides(frame, dir)),
          { hud: annotations }
        )
      : null;
    if (annotations) readIdentification(frame, local.center, limit, ground);
    return {
      labels,
      chartSettings,
      solarObservation,
      skyDetail,
      cityTerrain: earthView.cityStatus(!annotations),
      elevation: earthView.elevationStatus(!annotations),
      constellationArt,
      available: true,
      center: local.center,
      identification,
      starCount: count,
      limitMagnitude: limit,
      busy: false,
    };
  }
  async function read(target) {
    if (renderer.readRenderTargetPixelsAsync)
      await renderer.readRenderTargetPixelsAsync(
        target.film,
        0,
        0,
        target.w,
        target.h,
        target.bytes
      );
    else renderer.readRenderTargetPixels(target.film, 0, 0, target.w, target.h, target.bytes);
    if (!target.bytes[3]) throw Error('巡天取景图像生成失败');
  }
  return {
    earthSource: earthView.source,
    groundPick: (eye, axes, q) => earthView.pick({ eyeKm: eye, axes, q }),
    earthAppearanceKey: earthView.appearanceKey,
    solarAppearanceKey: solarView.key,
    skyAppearanceKey: () => `${env.skyDetail?.revision}:${env.constellationArt?.key()}`,
    photoSkyStatus: () => lastPhotoStatus,
    photoCityStatus: () => lastCityPhotoStatus,
    identify(frame) {
      if (skyOnly) frame = geocentricSkyFrame(frame);
      if (!valid(frame)) return { kind: 'unavailable' };
      const terrainHit = earthView.pick(frame);
      const ground =
        terrainHit === undefined
          ? groundHit(frame.eyeKm, frame.axes.forward, frame.q.earthAxes)
          : terrainHit;
      return readIdentification(frame, lastStatus.center, lastStatus.limitMagnitude, ground);
    },
    render(frame) {
      if (skyOnly) frame = geocentricSkyFrame(frame);
      if (disposed || !valid(frame)) return unavailable();
      const now = performance.now();
      if (previewPending || capturePending || now - lastRender < 1000 / VIEW_MAX_RATE)
        return { ...lastStatus, busy: previewPending };
      const size = frameSize(canvas, frame, undefined, renderer.capabilities.maxTextureSize);
      if (!preview || preview.w !== size.w || preview.h !== size.h) {
        preview?.dispose();
        preview = makeTargets(renderer, size.w, size.h);
      }
      const current = preview;
      lastRender = now;
      const result = draw(frame, size, current, true);
      lastStatus = result;
      previewPending = true;
      read(current)
        .then(() => {
          if (disposed) return;
          previewImage = writeCanvas(canvas, previewImage, current.bytes, size.w, size.h);
          paintFinderLabels(canvas, result.labels);
          canvas.dataset.xuntianFrame = String(++previewCount);
        })
        .catch(() => {
          if (!disposed) {
            lastStatus = { ...lastStatus, available: false };
            canvas.dataset.xuntianFrame = 'error';
          }
        })
        .finally(() => {
          previewPending = false;
          if (disposed) current.dispose();
        });
      return { ...lastStatus, busy: true, submitted: true };
    },
    async capture(
      frame,
      { width = 1440, surveyTarget = null, atShutter = null, onExposure = null } = {}
    ) {
      if (skyOnly) {
        frame = geocentricSkyFrame(frame);
        // A historical sky capture must not resample the main scene clock.
        atShutter = null;
      }
      if (disposed || !valid(frame)) throw Error('没有可用的巡天光学位置');
      if (capturePending) throw Error('正在保存巡天取景照片');
      const frozenChart = normalizeStarChartSettings(frame.chartSettings ?? env.settings);
      const freezeCulture = (candidate) => ({
        ...candidate,
        chartSettings: { ...frozenChart },
        language: frame.language,
        photoNames: frame.photoNames,
        focusTargetId: frame.focusTargetId,
        overviewArtworkId: frame.overviewArtworkId,
      });
      frame = freezeCulture(frame);
      capturePending = true;
      let target;
      try {
        const bounded = Math.max(
            32,
            Math.min(3840, renderer.capabilities.maxTextureSize, Math.round(width) || 1440)
          ),
          size = frameSize(canvas, frame, bounded, renderer.capabilities.maxTextureSize);
        await Promise.all([
          earthView.preparePhoto(frame, size),
          solarView.preparePhoto(frame, size),
          env.constellationArt?.prepare(
            skyPhotoId,
            skyDetailView(frame, size),
            wantsArt(frame, size, true),
            2500,
            {
              ...skyCultureArtOptions(frozenChart),
              focusTargetId: frame.focusTargetId,
              overviewArtworkId: frame.overviewArtworkId,
            }
          ),
          env.skyDetail?.prepare(
            skyPhotoId,
            skyDetailView(frame, size),
            wantsSkyDetail(frame, size)
          ),
        ]);
        if (disposed) throw Error('巡天取景器已关闭');
        // One bounded refresh follows pointing changes during the first wait.
        // The final shutter below still samples the live model and epoch
        // together. A rapidly moving field is explicitly labelled incomplete,
        // rather than waiting forever or mixing a stale pose with live meshes.
        if (atShutter) {
          const candidate = freezeCulture(atShutter());
          if (!valid(candidate)) throw Error('没有可用的巡天光学位置');
          await Promise.all([
            earthView.prepareCityPhoto(candidate, size, 4000),
            env.constellationArt?.prepare(
              skyPhotoId,
              skyDetailView(candidate, size),
              wantsArt(candidate, size, true),
              2500,
              {
                ...skyCultureArtOptions(frozenChart),
                focusTargetId: candidate.focusTargetId,
                overviewArtworkId: candidate.overviewArtworkId,
              }
            ),
            env.skyDetail?.prepare(
              skyPhotoId,
              skyDetailView(candidate, size),
              wantsSkyDetail(candidate, size),
              4000
            ),
          ]);
        }
        if (disposed) throw Error('巡天取景器已关闭');
        // The terrain prefetch may yield. Snapshot the live model time and
        // entrance together immediately before drawing a survey shutter.
        const actual = atShutter ? freezeCulture(atShutter()) : frame;
        if (!valid(actual)) throw Error('没有可用的巡天光学位置');
        target = makeTargets(renderer, size.w, size.h);
        const result = draw(actual, size, target);
        lastPhotoStatus = result.skyDetail;
        lastCityPhotoStatus = result.cityTerrain;
        if (surveyTarget && onExposure) {
          surveyProbe ??= createSurveyProbe(geometry);
          const coverage = withSharedRenderer(renderer, () =>
            surveyProbe.measure(renderer, target.scene.texture, actual, surveyTarget)
          );
          onExposure(actual, { center: result.center, coverage, width: size.w, height: size.h });
        }
        await read(target);
        if (disposed) throw Error('巡天取景器已关闭');
        const out = document.createElement('canvas');
        writeCanvas(out, null, target.bytes, size.w, size.h);
        paintFinderLabels(out, result.labels);
        if (captions) {
          paintSolarPhotoCaption(out, result.solarObservation, actual.q.t);
          const cityCaptionHeight = paintCityTerrainCaption(out, result.cityTerrain);
          const elevationCaptionHeight = paintElevationCaption(
            out,
            result.elevation,
            cityCaptionHeight
          );
          const skyCaptionHeight = paintSkyDetailCaption(
            out,
            result.skyDetail,
            cityCaptionHeight + elevationCaptionHeight
          );
          paintConstellationArtCaption(
            out,
            skyCulturePhotoCredit(
              result.constellationArt,
              result.chartSettings,
              actual.photoNames,
              actual.q.t
            ),
            cityCaptionHeight + elevationCaptionHeight + skyCaptionHeight
          );
        }
        const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
        if (!blob || disposed) throw Error('巡天取景图像生成失败');
        return blob;
      } finally {
        earthView.releasePhoto();
        target?.dispose();
        skyPhotoLayer?.dispose();
        artPhotoLayer?.dispose();
        capturePending = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!previewPending) preview?.dispose();
      preview = null;
      previewImage = null;
      surveyProbe?.dispose();
      solarView.dispose();
      earthView.dispose();
      skyDetailLayer?.dispose();
      skyPhotoLayer?.dispose();
      artLayer?.dispose();
      artPhotoLayer?.dispose();
      geometry.dispose();
      background.material.dispose();
      film.material.dispose();
      stars.dispose();
      guide.dispose();
    },
  };
}
