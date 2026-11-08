import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  createLunarPlaceIndex,
  layoutLunarPlaces,
  lunarVisibleCap,
  validLunarPlace,
} from './lunar-place-layout.js';
const EMPTY_PLACES = Object.freeze([]);
import {
  decodeLunarTerrain,
  lunarTerrainGeometry,
  lunarSurfaceDirection,
  sampleLunarHeightKm,
  LUNAR_REFERENCE_RADIUS_KM as R,
} from './lunar-terrain.js';

const vertex = `attribute float elevationKm;varying vec2 texUV;varying vec3 point,normalWorld;varying float heightKm;
void main(){texUV=uv;point=position;normalWorld=normal;heightKm=elevationKm;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment = `uniform sampler2D surfaceMap;uniform bool textured,elevationLayer,atlasMode,geologyLayer;
uniform vec3 sunPosition,earthPosition;uniform float lunarCoreRadiusKm;uniform vec3 palette0,palette1,palette2,palette3,palette4;
varying vec2 texUV;varying vec3 point,normalWorld;varying float heightKm;
float sunlight(vec3 s,vec3 e){float a=asin(clamp(695700./length(s),0.,1.)),b=asin(clamp(6371./length(e),0.,1.));
float d=atan(length(cross(normalize(s),normalize(e))),dot(normalize(s),normalize(e)));
if(d>=a+b)return 1.;if(d<=b-a)return 0.;if(d<=a-b)return clamp(1.-b*b/(a*a),0.,1.);
float ca=clamp((d*d+a*a-b*b)/(2.*d*a),-1.,1.),cb=clamp((d*d+b*b-a*a)/(2.*d*b),-1.,1.);
float overlap=a*a*acos(ca)+b*b*acos(cb)-.5*sqrt(max(0.,(-d+a+b)*(d+a-b)*(d-a+b)*(d+a+b)));return clamp(1.-overlap/(3.14159265359*a*a),0.,1.);}
// Conservative inner sphere only: no local mountain-cast shadows. The solar
// disc is small enough for a straight local horizon / circular segment model.
float coreSunlight(vec3 p,vec3 s){float radius=length(p),solarRadius=asin(clamp(695700./length(s),0.,1.));
float altitude=asin(clamp(dot(p/radius,normalize(s)),-1.,1.));float dip=acos(clamp(lunarCoreRadiusKm/radius,0.,1.));
float x=clamp((altitude+dip)/solarRadius,-1.,1.);return .5+(asin(x)+x*sqrt(max(0.,1.-x*x)))/3.14159265359;}
vec3 elevationColor(float h){if(h< -2.)return mix(palette0,palette1,clamp((h+10.)/8.,0.,1.));if(h<0.)return mix(palette1,palette2,(h+2.)/2.);if(h<3.)return mix(palette2,palette3,h/3.);return mix(palette3,palette4,clamp((h-3.)/7.,0.,1.));}
void main(){vec3 n=normalize(normalWorld),s=sunPosition-point*1737.4,e=earthPosition-point*1737.4;
float incidence=max(0.,dot(n,normalize(s))),emission=max(0.,dot(n,normalize(cameraPosition-point)));
float reflection=.6*incidence+.4*(2.*incidence/max(.0001,incidence+emission));float light=reflection*sunlight(s,e)*coreSunlight(point*1737.4,s);
// Atlas fill light is an explicitly labelled inspection aid. Observe never
// receives fill light, earthshine, a painted phase mask or simulated red eclipse light.
if(atlasMode)light=max(.25,light);
vec3 albedo=elevationLayer?elevationColor(heightKm):(textured?texture2D(surfaceMap,texUV).rgb:vec3(.2));
if(geologyLayer){vec4 geology=texture2D(surfaceMap,texUV);albedo=mix(vec3(.12),geology.rgb,geology.a);light=.82+.18*emission;}
gl_FragColor=vec4(albedo*light,1.);
if(!geologyLayer){
#include <tonemapping_fragment>
}
#include <colorspace_fragment>
}`;
const validVector = (a) =>
  Array.isArray(a) && a.length === 3 && a.every(Number.isFinite) && Math.hypot(...a) > 0;

export function lunarSunVisibility(pointKm, sunPositionKm, earthPositionKm) {
  const s = sunPositionKm.map((x, i) => x - pointKm[i]),
    e = earthPositionKm.map((x, i) => x - pointKm[i]);
  const sl = Math.hypot(...s),
    el = Math.hypot(...e);
  const a = Math.asin(Math.min(1, 695700 / sl)),
    b = Math.asin(Math.min(1, 6371 / el));
  const dot = s.reduce((sum, x, i) => sum + x * e[i], 0) / (sl * el);
  const d = Math.acos(Math.max(-1, Math.min(1, dot)));
  if (d >= a + b) return 1;
  if (d <= b - a) return 0;
  if (d <= a - b) return Math.max(0, 1 - (b * b) / (a * a));
  const ca = Math.max(-1, Math.min(1, (d * d + a * a - b * b) / (2 * d * a))),
    cb = Math.max(-1, Math.min(1, (d * d + b * b - a * a) / (2 * d * b)));
  const overlap =
    a * a * Math.acos(ca) +
    b * b * Math.acos(cb) -
    0.5 * Math.sqrt(Math.max(0, (-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b)));
  return Math.max(0, Math.min(1, 1 - overlap / (Math.PI * a * a)));
}

// Conservative solid lunar core. The nearby horizon is treated as straight
// across the finite solar disc; this does not solve terrain-cast shadows.
export function lunarCoreSunVisibility(pointKm, sunPositionKm, coreRadiusKm) {
  const radius = Math.hypot(...pointKm);
  const sun = sunPositionKm.map((n, i) => n - pointKm[i]);
  const distance = Math.hypot(...sun);
  const clamp = (n) => Math.max(-1, Math.min(1, n));
  const altitude = Math.asin(
    clamp(pointKm.reduce((sum, n, i) => sum + n * sun[i], 0) / (radius * distance))
  );
  const dip = Math.acos(Math.max(0, Math.min(1, coreRadiusKm / radius)));
  const solarRadius = Math.asin(Math.min(1, 695700 / distance));
  const x = clamp((altitude + dip) / solarRadius);
  return 0.5 + (Math.asin(x) + x * Math.sqrt(Math.max(0, 1 - x * x))) / Math.PI;
}

export function createLunarRenderer(
  canvas,
  { assets = {}, onInvalidate = () => {}, onPick = () => {} } = {}
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#02040a');
  const camera = new THREE.PerspectiveCamera(43, 1, 0.002, 2000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.minDistance = 1.08;
  controls.maxDistance = 10;
  controls.zoomSpeed = 0.6;
  const uniforms = {
    surfaceMap: { value: null },
    textured: { value: false },
    elevationLayer: { value: false },
    geologyLayer: { value: false },
    atlasMode: { value: false },
    lunarCoreRadiusKm: { value: R - 10.2 },
    sunPosition: { value: new THREE.Vector3(1.5e8, 0, 0) },
    earthPosition: { value: new THREE.Vector3(-384400, 0, 0) },
  };
  for (const [i, color] of ['#172e67', '#38a4ba', '#c5cbb0', '#c28a55', '#f8e3cc'].entries())
    uniforms['palette' + i] = { value: new THREE.Color(color) };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
  });
  const mesh = new THREE.Mesh(lunarTerrainGeometry(null), material);
  scene.add(mesh);
  const geometries = new Map(),
    abort = new AbortController();
  const labelsElement = document.createElement('canvas');
  labelsElement.className = 'lunar-map-labels';
  labelsElement.setAttribute('aria-hidden', 'true');
  Object.assign(labelsElement.style, {
    position: 'absolute',
    pointerEvents: 'none',
    margin: '0',
    zIndex: '2',
  });
  canvas.parentElement?.append(labelsElement);
  const labelContext = labelsElement.getContext('2d');
  const placeIndexes = new WeakMap();
  let annotationKey = '',
    annotationPlaces = null,
    annotationLandings = null;
  let annotationStats = { drawn: 0, candidates: 0, visited: 0 };
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  const status = {
    terrain: 'loading',
    texture: 'loading',
    geology: 'idle',
    context: 'ready',
    error: null,
  };
  let data = null,
    minimumHeightKm = -10,
    texture = null,
    geologyTexture = null,
    geologyPromise = null,
    disposed = false,
    rendering = false,
    internal = false,
    currentMode = null,
    observeZoom = 1,
    lastWidth = 0,
    lastHeight = 0,
    lastState = null,
    pointerStart = null,
    lastPinch = 0;
  const touches = new Map();
  const getStatus = () => ({
    ...status,
    ready:
      status.terrain === 'ready' &&
      (lastState?.layer === 'geology' ? status.geology === 'ready' : status.texture === 'ready') &&
      status.context === 'ready',
    terrainReady: status.terrain === 'ready',
    textureReady: status.texture === 'ready',
    vertices: mesh.geometry.attributes.position.count,
    triangles: mesh.geometry.index.count / 3,
    relief: uniforms.atlasMode.value && lastState?.relief === 8 ? 8 : 1,
    annotations: { ...annotationStats },
  });
  const invalidate = () => {
    if (!disposed && !rendering && !internal) onInvalidate();
  };
  function updateControls() {
    internal = true;
    try {
      controls.update();
    } finally {
      internal = false;
    }
  }
  controls.addEventListener('change', invalidate);
  const resize = new ResizeObserver(invalidate);
  resize.observe(canvas);
  const terrainSource = assets.lunarTerrain;
  const terrainReady = (async () => {
    try {
      if (!terrainSource?.url) throw Error('Lunar DEM asset unavailable');
      const response = await fetch(terrainSource.url, { signal: abort.signal });
      if (!response.ok) throw Error('Lunar DEM request failed');
      const bytes = await response.arrayBuffer();
      const unpacked = await new Response(
        new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
      ).arrayBuffer();
      if (disposed) return;
      data = decodeLunarTerrain(unpacked, terrainSource);
      let minimum = Infinity;
      for (const height of data.values) minimum = Math.min(minimum, height);
      minimumHeightKm = (minimum * data.scaleMeters) / 1000;
      const geometry = lunarTerrainGeometry(data, 1);
      geometries.set(1, geometry);
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      status.terrain = 'ready';
    } catch (error) {
      if (!disposed) {
        status.terrain = 'error';
        status.error = error.message;
      }
    }
    invalidate();
  })();
  const textureReady = (async () => {
    try {
      if (!assets.moon) throw Error('Lunar color map unavailable');
      const loaded = await new THREE.TextureLoader().loadAsync(assets.moon);
      if (disposed) {
        loaded.dispose();
        return;
      }
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.wrapS = THREE.RepeatWrapping;
      loaded.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture = loaded;
      uniforms.surfaceMap.value = loaded;
      uniforms.textured.value = true;
      status.texture = 'ready';
    } catch (error) {
      if (!disposed) {
        status.texture = 'error';
        status.error = error.message;
      }
    }
    invalidate();
  })();
  function loadGeology(retry = false) {
    if (disposed || geologyPromise || (!retry && status.geology === 'error')) return geologyPromise;
    if (status.geology === 'ready') return Promise.resolve();
    status.geology = 'loading';
    geologyPromise = (async () => {
      try {
        if (!assets.lunarGeology?.globe) throw Error('Lunar geology globe map unavailable');
        const loaded = await new THREE.TextureLoader().loadAsync(assets.lunarGeology.globe);
        if (disposed) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        geologyTexture = loaded;
        status.geology = 'ready';
      } catch (error) {
        if (!disposed) {
          status.geology = 'error';
          status.error = error.message;
        }
      }
    })().finally(() => {
      geologyPromise = null;
      invalidate();
    });
    return geologyPromise;
  }
  const ready = Promise.all([terrainReady, textureReady]).then(() => getStatus());
  function resetView() {
    observeZoom = 1;
    if (currentMode === 'atlas') {
      camera.up.set(0, 0, 1);
      camera.position.set(3.15, 0, 0.2);
      camera.zoom = 1;
      controls.target.set(0, 0, 0);
      updateControls();
    }
    invalidate();
  }
  function focusFeature(feature) {
    if (currentMode !== 'atlas' || !validLunarPlace(feature)) return false;
    camera.up.set(0, 0, 1);
    camera.position
      .fromArray(lunarSurfaceDirection(feature.longitude, feature.latitude))
      .multiplyScalar(
        feature.kind === 'landing' ||
          (Number.isFinite(feature.diameterKm) && feature.diameterKm < 100)
          ? 1.35
          : 2.8
      );
    camera.zoom = 1;
    controls.target.set(0, 0, 0);
    updateControls();
    invalidate();
    return true;
  }
  function updateLabels(state, width, height, relief) {
    const places = state.places || state.features || EMPTY_PLACES;
    const landings = state.landingSites || EMPTY_PLACES;
    labelsElement.hidden = !state.labels && !landings.length;
    if (labelsElement.hidden || !labelContext) {
      // Export consumers may draw this canvas even when its DOM is hidden.
      // Clear the pixels too, so disabled overlays cannot leak into a PNG.
      if (labelContext) {
        labelContext.setTransform(1, 0, 0, 1, 0, 0);
        labelContext.clearRect(0, 0, labelsElement.width, labelsElement.height);
      }
      annotationKey = '';
      annotationStats = { drawn: 0, candidates: 0, visited: 0 };
      return;
    }
    // Identical paused frames and sub-pixel ephemeris changes reuse the drawn
    // canvas. Spatial indexing and diameter ordering are built only per array.
    const key = [
      width,
      height,
      currentMode,
      relief,
      state.labels,
      state.placeDensity ?? 0.45,
      state.language || 'en',
      state.feature?.id,
      state.feature?.localizedName,
      status.terrain,
      canvas.offsetLeft,
      canvas.offsetTop,
      ...camera.matrixWorld.elements.map((n) => n.toFixed(5)),
      ...camera.projectionMatrix.elements.map((n) => n.toFixed(5)),
      ...uniforms.sunPosition.value.toArray().map((n) => Math.round(n / 1000)),
      ...uniforms.earthPosition.value.toArray().map((n) => Math.round(n / 10)),
    ].join('|');
    if (key === annotationKey && places === annotationPlaces && landings === annotationLandings)
      return;
    annotationKey = key;
    annotationPlaces = places;
    annotationLandings = landings;
    const ratio = renderer.getPixelRatio();
    labelsElement.width = Math.round(width * ratio);
    labelsElement.height = Math.round(height * ratio);
    Object.assign(labelsElement.style, {
      left: canvas.offsetLeft + 'px',
      top: canvas.offsetTop + 'px',
      width: width + 'px',
      height: height + 'px',
    });
    const ctx = labelContext;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = '11px "PingFang SC",sans-serif';
    ctx.textBaseline = 'top';
    if (!placeIndexes.has(places)) placeIndexes.set(places, createLunarPlaceIndex(places));
    const distance = camera.position.length(),
      direction = camera.position.clone().normalize();
    const pixelsPerKm =
      height /
      (2 *
        Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2) *
        Math.max(0.01, distance - 1) *
        R);
    const cap = Math.min(
      Math.PI,
      lunarVisibleCap(distance, camera.getEffectiveFOV(), camera.aspect) +
        (relief === 8 ? 0.12 : 0.025)
    );
    const point = new THREE.Vector3(),
      normal = new THREE.Vector3(),
      toEye = new THREE.Vector3(),
      projected = new THREE.Vector3();
    const project = (place, unit) => {
      normal.fromArray(unit);
      point
        .copy(normal)
        .multiplyScalar(
          1 + (sampleLunarHeightKm(data, place.longitude, place.latitude) * relief) / R
        );
      if (normal.dot(toEye.copy(camera.position).sub(point)) <= 0) return null;
      if (currentMode === 'observe') {
        if (normal.dot(uniforms.sunPosition.value) <= 0) return null;
        if (
          lunarSunVisibility(
            point.clone().multiplyScalar(R).toArray(),
            uniforms.sunPosition.value.toArray(),
            uniforms.earthPosition.value.toArray()
          ) < 0.05
        )
          return null;
      }
      projected.copy(point).project(camera);
      if (
        projected.z < -1 ||
        projected.z > 1 ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1
      )
        return null;
      return { x: ((projected.x + 1) * width) / 2, y: ((1 - projected.y) * height) / 2 };
    };
    const layout = layoutLunarPlaces({
      index: placeIndexes.get(places),
      selected: state.feature,
      landingSites: landings,
      project,
      width,
      height,
      density: state.placeDensity ?? 0.45,
      pixelsPerKm,
      direction: direction.toArray(),
      angularRadius: cap,
      labels: state.labels,
      language: state.language || 'en',
      measureText: (text) => ctx.measureText(text).width,
    });
    annotationStats = {
      drawn: layout.items.length,
      candidates: layout.candidates,
      visited: layout.visited,
    };
    for (const item of layout.items) {
      const { x, y, marker, selected } = item;
      if (marker) {
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        if (marker.shape === 'star') {
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5,
              r = i % 2 ? 2.6 : 6.3;
            const px = Math.cos(a) * r,
              py = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
        } else {
          ctx.moveTo(0, -4.8);
          ctx.lineTo(4.8, 0);
          ctx.lineTo(0, 4.8);
          ctx.lineTo(-4.8, 0);
        }
        ctx.closePath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#071018';
        ctx.stroke();
        ctx.strokeStyle = marker.color;
        ctx.lineWidth = 1.3;
        if (marker.filled) {
          ctx.fillStyle = marker.color;
          ctx.fill();
        }
        ctx.stroke();
        if (marker.failed) {
          ctx.beginPath();
          ctx.moveTo(-4, -4);
          ctx.lineTo(4, 4);
          ctx.moveTo(4, -4);
          ctx.lineTo(-4, 4);
          ctx.stroke();
        }
        if (marker.partial) {
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffcf75';
          ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, selected ? 3 : 1.5, 0, Math.PI * 2);
        ctx.fillStyle = selected ? '#ffe0a1' : '#b7ccd5';
        ctx.fill();
      }
      if (selected) {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffe0a1';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    for (const item of layout.items)
      if (item.showText) {
        const box = item.box;
        ctx.fillStyle = item.selected ? '#17212de8' : '#06101ba6';
        ctx.fillRect(box.x, box.y, box.width, box.height);
        ctx.fillStyle = item.selected ? '#ffe0a1' : item.marker?.color || '#d5e7ed';
        ctx.fillText(item.text, box.x + 5, box.y + 3, box.width - 10);
      }
  }
  function render(state = {}) {
    if (disposed || rendering || status.context !== 'ready') return;
    rendering = true;
    try {
      lastState = state;
      const frame = state.frame,
        mode = state.mode === 'atlas' ? 'atlas' : 'observe';
      if (
        !validVector(frame?.observerDirectionBody) ||
        !validVector(frame?.sunDirectionBody) ||
        !validVector(frame?.earthDirectionBody)
      ) {
        renderer.clear();
        labelsElement.hidden = true;
        return;
      }
      if (mode !== currentMode) {
        currentMode = mode;
        controls.enabled = mode === 'atlas';
        touches.clear();
        lastPinch = 0;
        resetView();
      }
      const width = Math.max(1, canvas.clientWidth),
        height = Math.max(1, canvas.clientHeight);
      if (width !== lastWidth || height !== lastHeight) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        lastWidth = width;
        lastHeight = height;
      }
      if (mode === 'observe') {
        const distance = frame.distanceKm / R;
        camera.position.fromArray(frame.observerDirectionBody).multiplyScalar(distance);
        camera.near = Math.max(0.01, distance - 2);
        camera.far = distance + 2;
        camera.up.fromArray(frame.upDirectionBody);
        camera.lookAt(0, 0, 0);
        camera.fov = 0.72;
        camera.zoom = observeZoom;
      } else {
        camera.near = 0.005;
        camera.far = 30;
        camera.fov = 43;
        camera.zoom = 1;
      }
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      uniforms.sunPosition.value
        .fromArray(frame.sunDirectionBody)
        .multiplyScalar(frame.moonSunDistanceKm);
      uniforms.earthPosition.value
        .fromArray(frame.earthDirectionBody)
        .multiplyScalar(frame.earthDistanceKm);
      uniforms.atlasMode.value = mode === 'atlas';
      uniforms.elevationLayer.value = state.layer === 'elevation' && status.terrain === 'ready';
      uniforms.geologyLayer.value = state.layer === 'geology';
      if (state.layer === 'geology') {
        loadGeology();
        if (status.geology !== 'ready') {
          renderer.clear();
          labelsElement.hidden = true;
          annotationKey = '';
          labelContext?.clearRect(0, 0, labelsElement.width, labelsElement.height);
          return;
        }
        uniforms.surfaceMap.value = geologyTexture;
        uniforms.textured.value = true;
      } else {
        uniforms.surfaceMap.value = texture;
        uniforms.textured.value = status.texture === 'ready';
      }
      const relief = mode === 'atlas' && state.relief === 8 ? 8 : 1;
      // 0.2 km margin keeps the core inside the triangulated 0.5-degree mesh.
      uniforms.lunarCoreRadiusKm.value = R + minimumHeightKm * relief - 0.2;
      if (data) {
        if (!geometries.has(relief)) geometries.set(relief, lunarTerrainGeometry(data, relief));
        mesh.geometry = geometries.get(relief);
      }
      renderer.render(scene, camera);
      updateLabels(state, width, height, relief);
    } finally {
      rendering = false;
    }
  }
  function wheel(event) {
    if (currentMode !== 'observe') return;
    event.preventDefault();
    observeZoom = THREE.MathUtils.clamp(observeZoom * Math.exp(-event.deltaY * 0.0015), 0.7, 14);
    invalidate();
  }
  function down(event) {
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    if (currentMode === 'observe' && event.pointerType === 'touch') {
      touches.set(event.pointerId, [event.clientX, event.clientY]);
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        lastPinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
      }
    }
  }
  function move(event) {
    if (currentMode !== 'observe' || !touches.has(event.pointerId)) return;
    touches.set(event.pointerId, [event.clientX, event.clientY]);
    if (touches.size === 2) {
      const [a, b] = [...touches.values()],
        distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (lastPinch > 0)
        observeZoom = THREE.MathUtils.clamp((observeZoom * distance) / lastPinch, 0.7, 14);
      lastPinch = distance;
      invalidate();
    }
  }
  function up(event) {
    touches.delete(event.pointerId);
    lastPinch = 0;
    if (
      currentMode !== 'atlas' ||
      !data ||
      status.terrain !== 'ready' ||
      !pointerStart ||
      pointerStart.id !== event.pointerId ||
      Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5
    ) {
      pointerStart = null;
      return;
    }
    pointerStart = null;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (!hit) return;
    const direction = hit.point.clone().normalize(),
      longitude = THREE.MathUtils.radToDeg(Math.atan2(direction.y, direction.x)),
      latitude = THREE.MathUtils.radToDeg(Math.asin(direction.z));
    const elevationKm = sampleLunarHeightKm(data, longitude, latitude);
    onPick({ longitude, latitude, elevationKm });
  }
  function cancel(event) {
    touches.delete(event.pointerId);
    pointerStart = null;
    lastPinch = 0;
  }
  function lost(event) {
    event.preventDefault();
    status.context = 'lost';
    status.error = 'WebGL context lost';
    invalidate();
  }
  function restored() {
    status.context = 'ready';
    status.error = null;
    invalidate();
  }
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  function dispose() {
    if (disposed) return;
    disposed = true;
    abort.abort();
    resize.disconnect();
    controls.removeEventListener('change', invalidate);
    controls.dispose();
    for (const [event, handler] of [
      ['wheel', wheel],
      ['pointerdown', down],
      ['pointermove', move],
      ['pointerup', up],
      ['pointercancel', cancel],
      ['webglcontextlost', lost],
      ['webglcontextrestored', restored],
    ])
      canvas.removeEventListener(event, handler);
    labelsElement.remove();

    const all = new Set([...geometries.values(), mesh.geometry]);
    all.forEach((g) => g.dispose());
    material.dispose();
    texture?.dispose();
    geologyTexture?.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return {
    ready,
    readyPromise: ready,
    render,
    resetView,
    focusFeature,
    getStatus,
    annotationCanvas: labelsElement,
    retryGeology: () => loadGeology(true),
    dispose,
  };
}
