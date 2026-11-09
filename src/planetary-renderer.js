import * as THREE from 'three';
import { createMineralLayer } from './earth-minerals.js';
import { createOrbitControls } from './camera-controls.js';
import { HelioVector } from 'astronomy-engine';
import { earthAxes } from './orbit.js';
import { sampleElevationBase } from './earth-elevation-math.js';
import { cloudToneGLSL } from './cloud-texture.js';
import { planetaryObservation, planetarySurfaceDirection } from './planetary-observation-math.js';

const vertex = `varying vec3 surface,nrm;void main(){surface=position;nrm=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment = `uniform sampler2D map;uniform bool textured,atlas,earthThematic;uniform vec3 sun,color;uniform int layer;varying vec3 surface,nrm;
void main(){vec3 p=normalize(surface);vec2 uv=vec2(atan(p.y,p.x)/6.28318530718+.5,asin(clamp(p.z,-1.,1.))/3.14159265359+.5);vec4 sampled=textured?texture2D(map,uv):vec4(color,1.);float checker=mod(floor(uv.x*72.)+floor(uv.y*36.),2.);vec3 noData=earthThematic?mix(vec3(.003,.006,.01),vec3(.004,.008,.013),checker):vec3(mix(.035,.055,checker));vec3 c=mix(noData,sampled.rgb,sampled.a);float light=max(0.,dot(normalize(nrm),sun));float f=atlas||layer==1?1.:.025+.975*light;gl_FragColor=vec4(c*f,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const vec = (a) => new THREE.Vector3().fromArray(a);

export function decodePlanetaryTerrain(buffer, metadata) {
  if (
    !Number.isInteger(metadata?.width) ||
    !Number.isInteger(metadata?.height) ||
    metadata.width < 2 ||
    metadata.height < 2 ||
    buffer.byteLength !== metadata.width * metadata.height * 2
  )
    throw new RangeError('Invalid planetary terrain dimensions');
  if (metadata.encoding && metadata.encoding !== 'int16-le-gzip')
    throw new RangeError('Unsupported planetary terrain encoding');
  return { ...metadata, data: new DataView(buffer) };
}
export function samplePlanetaryTerrain(dem, latitude, longitude) {
  if (!dem) return 0;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90)
    throw new RangeError('Invalid surface coordinates');
  // MOLA map pixels are cell centres, north-to-south, east-positive longitude.
  // Longitude wraps and pole rows clamp; samples across ±180 share one seam.
  const x = (((((longitude + 180) % 360) + 360) % 360) / 360) * dem.width - 0.5;
  const y = Math.max(0, Math.min(dem.height - 1, ((90 - latitude) / 180) * dem.height - 0.5));
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    fx = x - x0,
    fy = y - y0;
  const sample = (i, j) =>
    dem.data.getInt16(
      (Math.min(dem.height - 1, j) * dem.width + (((i % dem.width) + dem.width) % dem.width)) * 2,
      true
    ) *
      (dem.scaleMeters ?? 1) +
    (dem.offsetMeters ?? 0);
  return (
    (sample(x0, y0) * (1 - fx) + sample(x0 + 1, y0) * fx) * (1 - fy) +
    (sample(x0, y0 + 1) * (1 - fx) + sample(x0 + 1, y0 + 1) * fx) * fy
  );
}
export function configurePlanetaryObservationCamera(camera, observation, fovArcsec) {
  if (!(fovArcsec > 0 && fovArcsec <= 3600 * 170))
    throw new RangeError('Invalid angular field of view');
  const distance = observation.distanceKm / observation.radiusKm;
  if (!(distance > 1.1 && Number.isFinite(distance)))
    throw new RangeError('Observer is inside the target');
  // Same physical scale as the observed disc. A camera only six radii away
  // truncates the visible limb and cannot reproduce the real central meridian.
  camera.position.copy(vec(observation.observerDirectionFixed).multiplyScalar(distance));
  camera.up.copy(vec(observation.northUpFixed));
  camera.fov = fovArcsec / 3600;
  camera.near = Math.max(0.001, distance - 1.1);
  camera.far = distance + 1.1;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
export function createPlanetaryRenderer({
  renderer,
  environment,
  onPick = () => {},
  onMineralPick = () => {},
}) {
  const canvas = renderer.domElement,
    scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030810);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  camera.up.set(0, 0, 1);
  camera.position.set(3, -3, 1.8);
  const controls = createOrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.08;
  controls.maxDistance = 12;
  const geometry = new THREE.SphereGeometry(1, 160, 96),
    original = geometry.attributes.position.array.slice();
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      map: { value: null },
      textured: { value: false },
      earthThematic: { value: false },
      sun: { value: new THREE.Vector3(1, 0, 0) },
      color: { value: new THREE.Color(0xb97250) },
      atlas: { value: false },
      layer: { value: 0 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  const minerals = createMineralLayer(scene);
  const loader = new THREE.TextureLoader(),
    textures = new Map(),
    pending = new Map(),
    textureRetry = new Map();
  const terrainCache = new Map();
  let disposed = false,
    body = 'Mars',
    terrainKey = '',
    lastFrame = null,
    lastError = '',
    terrainRequest = null,
    terrainRetry = 0;
  const cloudMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: vertex,
    fragmentShader: `${cloudToneGLSL}uniform sampler2D map,templateMap;uniform float channel;uniform vec3 sun;uniform bool atlas;varying vec3 surface,nrm;void main(){vec3 n=normalize(surface);vec2 uv=vec2(atan(n.y,n.x)/6.28318530718+.5,asin(clamp(n.z,-1.,1.))/3.14159265359+.5);vec4 c=texture2D(map,uv);float a=channel>1.5?clamp(texture2D(templateMap,uv).r*(1.-c.a)+c.r,0.,1.):cloudOpacity(mix(c.r,c.a,channel));gl_FragColor=vec4(vec3((atlas?1.:.03+.97*max(0.,dot(n,sun)))),a*.85);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
    uniforms: {
      map: { value: null },
      templateMap: { value: null },
      channel: { value: 0 },
      cloudTone: { value: 0 },
      sun: { value: new THREE.Vector3(1, 0, 0) },
      atlas: { value: false },
    },
  });
  const cloudGeometry = new THREE.SphereGeometry(1.004, 96, 64),
    cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
  scene.add(cloudMesh);
  cloudMesh.visible = false;
  function texture(url) {
    if (!url) return null;
    if (textures.has(url)) {
      const tex = textures.get(url);
      textures.delete(url);
      textures.set(url, tex);
      return tex;
    }
    if (!pending.has(url) && performance.now() >= (textureRetry.get(url) ?? 0)) {
      const request = loader
        .loadAsync(url)
        .then((tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = THREE.RepeatWrapping;
          tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          if (disposed) {
            tex.dispose();
            return;
          }
          textures.set(url, tex);
          lastError = '';
          textureRetry.delete(url);
          while (textures.size > 4) {
            const [key, old] = textures.entries().next().value;
            textures.delete(key);
            old.dispose();
          }
        })
        .catch((error) => {
          if (!disposed) {
            lastError = error.message;
            textureRetry.set(url, performance.now() + 30000);
          }
        })
        .finally(() => pending.delete(url));
      pending.set(url, request);
    }
    return null;
  }
  async function terrain(meta = environment.assets.mars?.terrain) {
    if (
      !meta?.url ||
      terrainCache.has(meta.url) ||
      terrainRequest ||
      performance.now() < terrainRetry
    )
      return;
    const controller = new AbortController();
    terrainRequest = controller;
    try {
      const response = await fetch(meta.url, { signal: controller.signal });
      if (!response.ok) throw Error(`Mars terrain HTTP ${response.status}`);
      const packed = await response.blob();
      const stream = packed.stream().pipeThrough(new DecompressionStream('gzip'));
      const buffer = await new Response(stream).arrayBuffer();
      if (disposed || controller.signal.aborted) return;
      terrainCache.set(meta.url, decodePlanetaryTerrain(buffer, meta));
      terrainKey = '';
      lastError = '';
    } catch (error) {
      if (!disposed && error.name !== 'AbortError') {
        lastError = error.message;
        terrainRetry = performance.now() + 30000;
      }
    } finally {
      if (terrainRequest === controller) terrainRequest = null;
    }
  }
  function heightAt(target, latitude, longitude, enabled) {
    if (!enabled) return 0;
    return target === 'Earth'
      ? (sampleElevationBase(environment.elevation?.base, longitude, latitude)?.heightMeters ?? 0)
      : samplePlanetaryTerrain(
          terrainCache.get(environment.assets.mars?.terrain?.url),
          latitude,
          longitude
        );
  }
  function shape(enabled) {
    if (body === 'Mars' && enabled) void terrain();
    const ready =
      body === 'Earth'
        ? !!environment.elevation?.base
        : !!terrainCache.get(environment.assets.mars?.terrain?.url);
    const key = `${body}:${enabled}:${ready}`;
    if (key === terrainKey) return;
    terrainKey = key;
    const array = geometry.attributes.position.array,
      radius = body === 'Earth' ? 6371000 : 3396190;
    const p = new THREE.Vector3();
    for (let i = 0; i < array.length; i += 3) {
      p.set(original[i], original[i + 1], original[i + 2]).normalize();
      const lat = (Math.asin(p.z) * 180) / Math.PI,
        lon = (Math.atan2(p.y, p.x) * 180) / Math.PI;
      const h = heightAt(body, lat, lon, enabled);
      p.multiplyScalar(1 + Math.max(-12000, Math.min(30000, h)) / radius);
      array[i] = p.x;
      array[i + 1] = p.y;
      array[i + 2] = p.z;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
  function configure({
    target,
    layer,
    time,
    site,
    atlas,
    relief,
    clouds,
    view,
    fov,
    mineralRows,
    mineralCommodity,
    mineralVisible,
    mineralOpacity,
  }) {
    body = target;
    shape(relief);
    let observation = null,
      sun;
    if (body === 'Mars') {
      observation = planetaryObservation({ body, time, site });
      sun = observation.sunDirectionFixed;
      if (view === 'observe') configurePlanetaryObservationCamera(camera, observation, fov);
    } else {
      const h = HelioVector('Earth', new Date(time)),
        axes = earthAxes(time),
        s = [-h.x, -h.y, -h.z];
      sun = axes.map((a) => a.reduce((sum, v, i) => sum + v * s[i], 0));
    }
    const source =
      body === 'Earth'
        ? environment.assets.earthObservation?.layers?.[layer]
          ? texture(environment.assets.earthObservation.layers[layer].url)
          : environment.uniforms[layer === 'night' ? 'nightMap' : 'dayMap']?.value
        : texture(
            environment.assets.mars?.layers?.[layer]?.url ?? environment.assets.planets?.Mars
          );
    const scientific = body === 'Earth' && !!environment.assets.earthObservation?.layers?.[layer];
    minerals.update(
      mineralRows,
      mineralCommodity,
      body === 'Earth' && mineralVisible,
      camera.position.length(),
      mineralOpacity ?? 0.9,
      renderer.getPixelRatio()
    );
    if (body === 'Earth' && layer === 'earthElevation') {
      const r = environment.assets.earthObservation.layers.earthElevation;
      void terrain({
        url: r.heightUrl,
        width: r.width,
        height: r.height,
        encoding: 'int16-le-gzip',
      });
    }
    material.uniforms.earthThematic.value = scientific;
    material.uniforms.map.value = source;
    material.uniforms.textured.value = !!source && source !== environment.fallback;
    material.uniforms.color.value.set(body === 'Earth' ? 0x426a85 : 0xb97250);
    material.uniforms.sun.value.fromArray(sun).normalize();
    material.uniforms.atlas.value = atlas;
    if (material.toneMapped === scientific) {
      material.toneMapped = !scientific;
      material.needsUpdate = true;
    }
    material.uniforms.layer.value =
      scientific ||
      layer === 'night' ||
      ['dayIR', 'nightIR', 'geology', 'elevation'].includes(layer)
        ? 1
        : 0;
    const map = environment.uniforms.cloudMap?.value;
    cloudMesh.visible =
      body === 'Earth' && !scientific && clouds && !!map && map !== environment.fallback;
    cloudMaterial.uniforms.map.value = map;
    cloudMaterial.uniforms.templateMap.value = environment.uniforms.cloudTemplateMap?.value ?? map;
    cloudMaterial.uniforms.channel.value = environment.uniforms.cloudChannel?.value ?? 0;
    cloudMaterial.uniforms.cloudTone.value = environment.uniforms.cloudTone?.value ?? 0;
    cloudMaterial.uniforms.sun.value.copy(material.uniforms.sun.value);
    cloudMaterial.uniforms.atlas.value = atlas;
    return observation;
  }
  function pose() {
    return {
      position: camera.position.clone(),
      up: camera.up.clone(),
      quaternion: camera.quaternion.clone(),
      target: controls.target.clone(),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      aspect: camera.aspect,
    };
  }
  function restore(p) {
    camera.position.copy(p.position);
    camera.up.copy(p.up);
    camera.quaternion.copy(p.quaternion);
    controls.target.copy(p.target);
    camera.fov = p.fov;
    camera.near = p.near;
    camera.far = p.far;
    camera.aspect = p.aspect;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }
  let atlasPose = pose(),
    observing = false;
  function render(settings, rect) {
    const observation = configure(settings);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    mesh.updateMatrixWorld(true);
    renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
    renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
    renderer.render(scene, camera);
    return { observation, camera: camera.clone(), rect, settings: { ...settings } };
  }
  function frame(settings, comparison, width, height) {
    const old = {
      auto: renderer.autoClear,
      exposure: renderer.toneMappingExposure,
      scissor: renderer.getScissorTest(),
      viewport: renderer.getViewport(new THREE.Vector4()),
      box: renderer.getScissor(new THREE.Vector4()),
    };
    const observe = settings.target === 'Mars' && settings.view === 'observe';
    if (observe !== observing) {
      if (observe) atlasPose = pose();
      else restore(atlasPose);
      controls.stopMotion();
      observing = observe;
    }
    controls.enabled = !observe;
    if (!observe) {
      camera.fov = 38;
      camera.near = 0.01;
      camera.far = 100;
      controls.update();
      atlasPose = pose();
    }
    const basePose = pose();
    try {
      renderer.autoClear = true;
      renderer.toneMappingExposure = 1;
      renderer.setScissorTest(true);
      const half = comparison ? Math.floor(width / 2) : width;
      const a = render(settings, { x: 0, y: 0, width: half, height });
      if (comparison) restore(basePose);
      const b = comparison
        ? render({ ...settings, ...comparison }, { x: half, y: 0, width: width - half, height })
        : null;
      lastFrame = { a, b };
      return lastFrame;
    } finally {
      renderer.autoClear = old.auto;
      renderer.toneMappingExposure = old.exposure;
      renderer.setScissorTest(old.scissor);
      renderer.setViewport(old.viewport);
      renderer.setScissor(old.box);
      restore(basePose);
    }
  }
  function project(feature, frame) {
    const direction = vec(planetarySurfaceDirection(feature));
    const radius = frame.settings.target === 'Earth' ? 6371000 : 3396190;
    const h = heightAt(
      frame.settings.target,
      feature.latitude,
      feature.longitude,
      frame.settings.relief
    );
    const point = direction
      .clone()
      .multiplyScalar(feature.mineral ? 1.002 : 1 + h / radius + 0.0001);
    if (direction.dot(frame.camera.position.clone().sub(point)) <= 0) return null;
    const p = point.project(frame.camera);
    if (Math.abs(p.x) > 0.97 || Math.abs(p.y) > 0.93 || p.z > 1 || p.z < -1) return null;
    return {
      x: frame.rect.x + (p.x * 0.5 + 0.5) * frame.rect.width,
      y: (0.5 - p.y * 0.5) * frame.rect.height,
    };
  }
  function focus(feature) {
    controls.stopMotion();
    camera.up.set(0, 0, 1);
    camera.position.copy(vec(planetarySurfaceDirection(feature)).multiplyScalar(3.8));
    camera.near = 0.01;
    camera.far = 100;
    camera.fov = 38;
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    atlasPose = pose();
    if (!observing) controls.update();
  }
  let down = null;
  const start = (e) => {
    if (e.button === 0) down = [e.clientX, e.clientY, e.pointerId];
  };
  const cancel = () => {
    down = null;
  };
  const pick = (e) => {
    const started = down;
    down = null;
    if (
      !started ||
      e.pointerId !== started[2] ||
      Math.hypot(e.clientX - started[0], e.clientY - started[1]) > 5 ||
      !lastFrame
    )
      return;
    const bounds = canvas.getBoundingClientRect(),
      total = lastFrame.a.rect.width + (lastFrame.b?.rect.width ?? 0),
      x = ((e.clientX - bounds.left) * total) / bounds.width,
      y = ((e.clientY - bounds.top) * lastFrame.a.rect.height) / bounds.height;
    const f = lastFrame.b && x >= lastFrame.b.rect.x ? lastFrame.b : lastFrame.a;
    if (f.settings.target === 'Earth' && f.settings.mineralVisible) {
      let nearest = null,
        distance = 10;
      for (const group of minerals.groups) {
        const p = project(group, f);
        if (!p) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < distance) {
          nearest = group;
          distance = d;
        }
      }
      if (nearest) {
        onMineralPick(nearest);
        return;
      }
    }
    body = f.settings.target;
    shape(f.settings.relief);
    mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(((x - f.rect.x) / f.rect.width) * 2 - 1, 1 - (y / f.rect.height) * 2),
      f.camera
    );
    const hit = ray.intersectObject(mesh)[0];
    if (hit) {
      const n = hit.point.clone().normalize(),
        latitude = (Math.asin(n.z) * 180) / Math.PI,
        longitude = (Math.atan2(n.y, n.x) * 180) / Math.PI;
      onPick({
        latitude,
        longitude,
        height:
          body === 'Earth' &&
          f.settings.layer === 'earthElevation' &&
          terrainCache.has(environment.assets.earthObservation?.layers?.earthElevation?.heightUrl)
            ? samplePlanetaryTerrain(
                terrainCache.get(
                  environment.assets.earthObservation.layers.earthElevation.heightUrl
                ),
                latitude,
                longitude
              )
            : heightAt(body, latitude, longitude, f.settings.relief),
      });
    }
  };
  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointerup', pick);
  canvas.addEventListener('pointercancel', cancel);
  return {
    frame,
    project,
    focus,
    get loading() {
      return pending.size > 0 || !!terrainRequest;
    },
    get error() {
      return lastError;
    },
    dispose() {
      disposed = true;
      terrainRequest?.abort();
      controls.dispose();
      canvas.removeEventListener('pointerdown', start);
      canvas.removeEventListener('pointerup', pick);
      canvas.removeEventListener('pointercancel', cancel);
      minerals.dispose();
      geometry.dispose();
      material.dispose();
      cloudGeometry.dispose();
      cloudMaterial.dispose();
      textures.forEach((tex) => tex.dispose());
      textures.clear();
      terrainCache.clear();
    },
  };
}
