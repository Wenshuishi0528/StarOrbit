import {
  applySurfaceStreamingSettings,
  mountSurfaceStreamingControls,
} from './surface-streaming-controls.js';
import * as THREE from 'three';
import { t, onLanguageChange } from './i18n.js';
import { syncGeographyControls } from './geography-settings.js';
import { earthAxes, sunPosition } from './orbit.js';
import { cityCameraView } from './city-terrain-view.js';
import { EarthElevationLayer } from './earth-elevation-layer.js';
import { cloudMoonIrradiance } from './cloud-lighting.js';
import { Geography } from './geography.js';
import { sampleGroundRaster, sampleGroundGrid } from './ground-world-surface.js';
import { earthSurfaceRadiance, earthSurfaceOutput } from './earth-shaders.js';
import { createGroundEarthCompositor } from './ground-earth-compositor.js';

const RADIUS = 6371;
const axesMatrix = (axes) =>
  new THREE.Matrix4().makeBasis(...axes.map((a) => new THREE.Vector3(...a)));
export function groundRenderPose(site, time, localQuaternion) {
  const latitude = (site.latitude * Math.PI) / 180,
    longitude = (site.longitude * Math.PI) / 180;
  const east = [-Math.sin(longitude), Math.cos(longitude), 0];
  const up = [
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
  ];
  const north = new THREE.Vector3(...up).cross(new THREE.Vector3(...east)).toArray();
  const earth = axesMatrix(earthAxes(time));
  const basis = earth.clone().multiply(axesMatrix([east, north, up]));
  return {
    cameraPositionKm: new THREE.Vector3(...up)
      .multiplyScalar(RADIUS + site.height / 1000)
      .applyMatrix4(earth)
      .toArray(),
    cameraQuaternion: new THREE.Quaternion().setFromRotationMatrix(basis).multiply(localQuaternion),
  };
}

// The shader performs lighting/cloud/atmosphere calculations in Earth-centred
// kilometres, while clip coordinates follow the host scene (km, AU or ly).
// Geometry and all sampled textures remain owned by Environment/managers.
export function createSharedWorldEarth({ environment: env, renderer, id, scene = null }) {
  const ownScene = !scene;
  scene ||= new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.00005, 1e7);
  const earthRotation = new THREE.Quaternion();
  const uniforms = { ...env.uniforms, ...env.cityTerrain.uniforms(id, 4) };
  const unique = {
    sun: { value: new THREE.Vector3() },
    cloudSeason: { value: 0 },
    cloudMoonPosition: { value: new THREE.Vector3() },
    cloudMoonLight: { value: 0 },
    airglowOnly: { value: 0 },
    localSun: { value: new THREE.Vector3() },
    earthInverse: { value: new THREE.Matrix3() },
    worldEyeKm: { value: new THREE.Vector3() },
    earthSceneCenter: { value: new THREE.Vector3() },
    earthSceneScale: { value: 1 },
    nearCenter: { value: new THREE.Vector3() },
    nearEast: { value: new THREE.Vector3() },
    nearNorth: { value: new THREE.Vector3() },
    nearUp: { value: new THREE.Vector3() },
    nearHalfSize: { value: 0 },
    hasNearHole: { value: 0 },
    surfaceDepthPass: { value: 0 },
    terrainDistance: { value: null },
    terrainViewport: { value: new THREE.Vector2(1, 1) },
    terrainFar: { value: 30000 },
    terrainOcclusion: { value: 0 },
    linearOutput: { value: 0 },
    linearComposite: { value: 0 },
  };
  Object.assign(uniforms, unique);
  const adapted = new WeakSet(),
    ownedMaterials = new Set();
  function adapt(material, holes = false) {
    if (adapted.has(material)) return;
    adapted.add(material);
    ownedMaterials.add(material);
    material.addEventListener('dispose', () => ownedMaterials.delete(material));
    material.uniforms = { ...material.uniforms, ...uniforms };
    material.vertexShader =
      'uniform vec3 earthSceneCenter;uniform float earthSceneScale;\n' +
      material.vertexShader
        .replace(
          /worldP=\(modelMatrix\*vec4\((position|p),1\.\)\)\.xyz;/g,
          (_, p) => `worldP=((modelMatrix*vec4(${p},1.)).xyz-earthSceneCenter)/earthSceneScale;`
        )
        .replace(
          'gl_Position=projectionMatrix*viewMatrix*vec4(worldP,1.);',
          `gl_Position=projectionMatrix*modelViewMatrix*vec4(${material.vertexShader.includes('vec3 p=mix') ? 'p' : 'position'},1.);`
        );
    material.fragmentShader =
      'uniform vec3 worldEyeKm,earthSceneCenter;uniform float earthSceneScale;\n' +
      material.fragmentShader
        .replaceAll('cameraPosition', 'worldEyeKm')
        .replace(
          'viewMatrix*vec4(cloudPoint,1.)',
          'viewMatrix*vec4(cloudPoint*earthSceneScale+earthSceneCenter,1.)'
        );
    if (material.fragmentShader.includes('vec4(earthSurfaceColour(')) {
      material.fragmentShader =
        '#include <packing>\nuniform float surfaceDepthPass,terrainFar;\n' +
        material.fragmentShader.replace(
          'gl_FragColor=vec4(earthSurfaceColour(',
          'if(surfaceDepthPass>.5){gl_FragColor=packDepthToRGBA(clamp(length(worldP-worldEyeKm)/terrainFar,0.,.999999));return;}gl_FragColor=vec4(earthSurfaceColour('
        );
    }
    if (holes) {
      material.fragmentShader =
        'uniform vec3 nearCenter,nearEast,nearNorth,nearUp;uniform float nearHalfSize,hasNearHole;\n' +
        material.fragmentShader.replace(
          'void main(){',
          `void main(){vec3 nearDelta=worldP-nearCenter;if(hasNearHole>.5&&dot(worldP,nearUp)>0.&&abs(dot(nearDelta,nearEast))<nearHalfSize&&abs(dot(nearDelta,nearNorth))<nearHalfSize)discard;`
        );
    }
    material.needsUpdate = true;
  }
  function borrow(mesh, holes = false) {
    const clone = new THREE.Mesh(mesh.geometry, mesh.material.clone());
    // Material.clone clones sampler textures; replace every uniform with borrowed
    // references before any upload, and only retain view-owned scalar uniforms.
    clone.material.uniforms = { ...mesh.material.uniforms, ...uniforms };
    clone.renderOrder = mesh.renderOrder;
    clone.material.visible = true;
    adapt(clone.material, holes);
    root.add(clone);
    return clone;
  }
  const earth = borrow(env.earth, true),
    clouds = borrow(env.clouds),
    atmosphere = borrow(env.atmosphere),
    volume = borrow(env.volumeClouds);
  atmosphere.material.fragmentShader =
    `#include <packing>
uniform sampler2D terrainDistance;uniform vec2 terrainViewport;uniform float terrainFar,terrainOcclusion;
` +
    atmosphere.material.fragmentShader.replace(
      'if(ground.x>0.)end=min(end,ground.x);',
      `if(ground.x>0.)end=min(end,ground.x);
     if(terrainOcclusion>.5){float terrainEnd=unpackRGBAToDepth(texture2D(terrainDistance,gl_FragCoord.xy/terrainViewport))*terrainFar;
       if(terrainEnd<terrainFar*.9999){end=min(end,terrainEnd);ground.x=terrainEnd;}}`
    );
  const terrainDistanceGLSL = `#include <packing>
uniform sampler2D terrainDistance;uniform vec2 terrainViewport;uniform float terrainFar,terrainOcclusion;
float terrainStop(){return unpackRGBAToDepth(texture2D(terrainDistance,gl_FragCoord.xy/terrainViewport))*terrainFar;}
`;
  volume.material.fragmentShader =
    terrainDistanceGLSL +
    volume.material.fragmentShader.replace(
      'if(end<=begin)discard;',
      'if(terrainOcclusion>.5)end=min(end,terrainStop());if(end<=begin)discard;'
    );
  clouds.material.fragmentShader =
    terrainDistanceGLSL +
    clouds.material.fragmentShader.replace(
      'void main(){',
      'void main(){if(terrainOcclusion>.5&&length(worldP-worldEyeKm)>terrainStop())discard;'
    );
  // Draw clouds over the already-integrated background, as the main HDR path
  // does. Only the air *between this observer and the cloud* belongs in its
  // radiance; applying the full atmosphere after it washes out nearby clouds.
  // This direct-display path uses the same scalar transmission as the normal
  // atmosphere blend. It does not invoke cloudAerial's space-observer LUT path.
  const finiteCloudAir = `
vec3 worldCloudAerial(vec3 p,vec3 color,vec3 s){
 vec3 o=worldEyeKm,d=normalize(p-o);float end=length(p-o),begin=max(0.,hit(o,d,A).x);
 vec4 air=vec4(0.);
 if(end>begin){
  if(enhanced>.5)air=fineAtmosphere(o,d,s,begin,end);
  else{
   float ds=(end-begin)/8.,odR=0.,odM=0.,cs=dot(d,s),pr=.059683*(1.+cs*cs),g=.76;
   float pm=.119366*(1.-g*g)*(1.+cs*cs)/((2.+g*g)*pow(1.+g*g-2.*g*cs,1.5));
   vec3 sum=vec3(0.);
   for(int i=0;i<8;i++){
    vec3 q=o+d*(begin+(float(i)+.5)*ds);float rho=length(q),h=max(0.,rho-R),r=exp(-h/8.),m=exp(-h/1.2),mu=dot(q/rho,s);
    float ratio=R/rho,limb=sqrt(max(0.,1.-ratio*ratio)),vis=smoothstep(-.00465*ratio,.00465*ratio,mu+limb);
    float slant=(2.-smoothstep(-.03,.03,mu))/sqrt(max(.0007,mu*mu+.0025));
    vec3 tau=betaR*(odR+r*ds*.5+r*8.*slant)+betaM*(odM+m*ds*.5+m*1.2*slant);
    sum+=exp(-tau)*(betaR*r*pr+betaM*m*pm)*ds*vis;odR+=r*ds;odM+=m*ds;
   }
   float alpha=clamp(1.-dot(exp(-(betaR*odR+betaM*odM)),vec3(.2126,.7152,.0722)),0.,.98);
   air=vec4(sum*solarIrradiance/max(alpha,.00001),alpha);
  }
 }
 return color*(1.-air.a)+air.rgb*air.a+nightglow(o,d,s,end);
}
`;
  for (const [mesh, point] of [
    [clouds, 'worldP'],
    [volume, 'cloudPoint'],
  ]) {
    mesh.material.fragmentShader = mesh.material.fragmentShader
      .replace('void main(){', finiteCloudAir + '\nvoid main(){')
      .replace(
        `if(linearComposite>.5)color=cloudAerial(${point},color,normalize(sun));`,
        `color=worldCloudAerial(${point},color,normalize(sun));`
      );
    mesh.material.needsUpdate = true;
  }
  atmosphere.material.blending = THREE.NormalBlending;
  atmosphere.material.premultipliedAlpha = false;
  clouds.renderOrder = 3.05;
  volume.renderOrder = 3.06;
  // Atmosphere-only uniforms need the original references that are not in earth uniforms.
  const aurora = (env.aurora?.children || []).map((mesh) => borrow(mesh));
  const elevation = new EarthElevationLayer(env.elevation, uniforms, id);
  root.add(elevation.group);
  const geographicAnchor = new THREE.Group();
  root.add(geographicAnchor);
  let viewport = { clientWidth: 1, clientHeight: 1 };
  let heightRevision = -1,
    heightEntries = [];
  function surfaceHeight(lon, lat) {
    if (!env.settings.earthElevation) return 0;
    if (heightRevision !== env.elevation.revision) {
      heightRevision = env.elevation.revision;
      heightEntries = [...(env.elevation.entries?.values() || [])]
        .filter((e) => e.heights)
        .sort((a, b) => b.tile.z - a.tile.z);
    }
    for (const entry of heightEntries) {
      const h = sampleGroundGrid(
        { ...entry.tile, heights: entry.heights, gridSize: 129 },
        lat,
        lon
      );
      if (h !== null) return Math.max(0, h);
    }
    return Math.max(0, sampleGroundRaster(env.elevation.base, lat, lon) || 0);
  }
  const geography = env.geography
    ? new Geography(
        {
          ...env,
          earth: geographicAnchor,
          sim: { view: 'world', shadowCache: { records: [] } },
          starChart: { group: { visible: false }, occluders: null },
        },
        {
          worldView: true,
          viewport: () => viewport,
          surfaceHeight,
          reserved: () =>
            [
              ...document.querySelectorAll(
                '.world-ground-panel,.solar-world-panel,.world-bar,.world-hud,.world-key-guide'
              ),
            ]
              .filter((el) => el.getClientRects().length)
              .map((el) => {
                const b = el.getBoundingClientRect(),
                  s = renderer.domElement.getBoundingClientRect();
                return { x: b.x - s.x, y: b.y - s.y, w: b.width, h: b.height };
              }),
        }
      )
    : null;
  const patches = { contact: null, surround: null };
  const contactHole = {
    nearCenter: { value: new THREE.Vector3() },
    nearEast: { value: new THREE.Vector3() },
    nearNorth: { value: new THREE.Vector3() },
    nearUp: { value: new THREE.Vector3() },
    nearHalfSize: { value: 0 },
    hasNearHole: { value: 0 },
  };
  let disposed = false,
    lastTime = NaN;
  const patchVertex = `attribute vec3 basePosition;varying vec2 terrainUV;varying vec3 worldP,worldN;void main(){terrainUV=uv;worldP=(modelMatrix*vec4(position,1.)).xyz;worldN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*vec4(worldP,1.);}`;
  function updatePatch(kind, patch) {
    let near = patches[kind];
    if (!patch?.data) {
      if (near) near.visible = false;
      return null;
    }
    if (!near || patch.revision !== near.userData.revision) {
      if (near) {
        near.geometry.dispose();
        near.material.dispose();
        ownedMaterials.delete(near.material);
        root.remove(near);
      }
      const data = patch.data,
        g = new THREE.BufferGeometry();
      const positions = Float32Array.from(data.positions, (v) => v / 1000);
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
      g.setIndex(new THREE.BufferAttribute(data.indices, 1));
      g.computeVertexNormals();
      const material = new THREE.ShaderMaterial({
        uniforms: { ...uniforms },
        vertexShader: patchVertex,
        fragmentShader: `#define EARTH_ELEVATION\n${earthSurfaceRadiance}\nvarying vec2 terrainUV;varying vec3 worldP,worldN;void main(){float lon=(terrainUV.x-.5)*6.28318530718,lat=(terrainUV.y-.5)*3.14159265359;vec3 geo=vec3(cos(lat)*cos(lon),cos(lat)*sin(lon),sin(lat));gl_FragColor=vec4(earthSurfaceColour(geo,worldN,worldP),1.);${earthSurfaceOutput}}`,
      });
      near = new THREE.Mesh(g, material);
      adapt(material, kind === 'surround');
      if (kind === 'surround') Object.assign(material.uniforms, contactHole);
      near.userData.revision = patch.revision;
      near.userData.halfSize = data.halfSize;
      patches[kind] = near;
      root.add(near);
      const lat = (patch.site.latitude * Math.PI) / 180,
        lon = (patch.site.longitude * Math.PI) / 180;
      const east = new THREE.Vector3(-Math.sin(lon), Math.cos(lon), 0),
        up = new THREE.Vector3(
          Math.cos(lat) * Math.cos(lon),
          Math.cos(lat) * Math.sin(lon),
          Math.sin(lat)
        ),
        north = up.clone().cross(east);
      near.userData.fixedPosition = up.clone().multiplyScalar(RADIUS);
      near.userData.fixedRotation = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(east, north, up)
      );
    }
    near.visible = true;
    near.position.copy(near.userData.fixedPosition).applyQuaternion(earthRotation);
    near.quaternion.copy(earthRotation).multiply(near.userData.fixedRotation);
    return near;
  }
  function setHole(target, mesh) {
    target.hasNearHole.value = mesh ? 1 : 0;
    if (!mesh) return;
    target.nearHalfSize.value = (mesh.userData.halfSize / 1000) * 0.99;
    target.nearCenter.value.copy(mesh.position);
    target.nearEast.value.set(1, 0, 0).applyQuaternion(mesh.quaternion);
    target.nearNorth.value.set(0, 1, 0).applyQuaternion(mesh.quaternion);
    target.nearUp.value.set(0, 0, 1).applyQuaternion(mesh.quaternion);
  }
  function setPatch(patch) {
    const contact = updatePatch('contact', patch);
    const surround = updatePatch('surround', patch?.surround);
    setHole(contactHole, contact);
    setHole(uniforms, surround || contact);
  }
  const compositor = ownScene
    ? createGroundEarthCompositor({
        renderer,
        scene,
        camera,
        root,
        uniforms,
        surfaces: () => [earth, elevation.group, ...Object.values(patches).filter(Boolean)],
      })
    : null;
  function renderEffects() {
    if (disposed || !root.visible) return;
    // The active modes use the same WebGL renderer and the same aurora targets.
    // Only the observer frame changes; resources remain owned by Environment.
    env.auroraCurtains?.render(camera, { earthQuaternion: earthRotation, sun: uniforms.sun.value });
  }
  return {
    scene,
    group: root,
    camera,
    uniforms,
    update({
      time,
      camera: hostCamera = null,
      cameraPositionKm = null,
      cameraQuaternion = null,
      fov = 65,
      aspect = 1,
      width = 1,
      height = 1,
      earthPosition = [0, 0, 0],
      unitsPerKm = 1,
      displayScale = 1,
      nearPatch = null,
    }) {
      if (disposed) return;
      const scale = unitsPerKm * displayScale;
      root.position.fromArray(earthPosition);
      root.scale.setScalar(scale);
      uniforms.earthSceneCenter.value.copy(root.position);
      uniforms.earthSceneScale.value = scale;
      if (hostCamera) {
        camera.position.copy(hostCamera.position).sub(root.position).divideScalar(scale);
        camera.quaternion.copy(hostCamera.quaternion);
        camera.fov = hostCamera.fov;
        camera.aspect = hostCamera.aspect;
      } else {
        camera.position.fromArray(cameraPositionKm);
        camera.quaternion.copy(cameraQuaternion);
        camera.fov = fov;
        camera.aspect = aspect;
      }
      uniforms.worldEyeKm.value.copy(camera.position);
      camera.near = Math.max(
        0.00005,
        Math.min(1, Math.abs(camera.position.length() - RADIUS) / 1000)
      );
      camera.far = Math.max(30000, camera.position.length() * 3);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      if (time !== lastTime) {
        earthRotation.setFromRotationMatrix(axesMatrix(earthAxes(time)));
        uniforms.sun.value.fromArray(sunPosition(time)).normalize();
        const moon = env.moon?.ephemeris.at(time).position;
        if (moon) {
          uniforms.cloudMoonPosition.value.fromArray(moon);
          uniforms.cloudMoonLight.value = cloudMoonIrradiance(moon, sunPosition(time));
        }
        lastTime = time;
      }
      uniforms.localSun.value
        .copy(uniforms.sun.value)
        .applyQuaternion(earthRotation.clone().invert());
      uniforms.cloudSeason.value = THREE.MathUtils.clamp(uniforms.localSun.value.z / 0.398, -1, 1);
      uniforms.earthInverse.value
        .setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(earthRotation))
        .transpose();
      // Main view is inactive; let its existing four-slot detail caches service
      // this camera without allocating another cache or touching texture ownership.
      const previous = env.earth.quaternion.clone(),
        previousSun = env.uniforms.sun.value.clone();
      env.earth.quaternion.copy(earthRotation);
      env.uniforms.sun.value.copy(uniforms.sun.value);
      env.detail.update(camera, height);
      env.nightDetail.update(camera, height);
      env.earth.quaternion.copy(previous);
      env.uniforms.sun.value.copy(previousSun);

      const view = cityCameraView(camera, earthRotation, width, height);
      applySurfaceStreamingSettings(env);
      env.cityTerrain.setEnabled(env.settings.cityTerrain);
      env.cityTerrain.autoEnabled = env.settings.cityAutoLoad;
      env.cityTerrain.setView(id, view, 4);
      env.elevation.setEnabled(env.settings.earthElevation);
      env.elevation.setView(id, view, 4);
      elevation.update(earthRotation);
      adapt(elevation.base.material, true);
      for (const mesh of elevation.tiles.values()) adapt(mesh.material, true);
      earth.visible = !elevation.group.visible;
      earth.quaternion.copy(earthRotation);
      earth.geometry = env.earth.geometry;
      clouds.geometry = env.clouds.geometry;
      const detailed = !!env.quality && env.quality !== 'simple',
        volumetric = env.quality === 'high' && !!env.weather?.settings.volume;
      clouds.visible = detailed && env.settings.clouds && !volumetric;
      volume.visible = detailed && env.settings.clouds && volumetric;
      // It is the same cloud globe viewed from inside when standing below it.
      // Keep the source, time and opacity shared; only visible face changes.
      const cloudSide =
        camera.position.length() < (env.clouds.geometry.parameters?.radius || 6379)
          ? THREE.BackSide
          : THREE.FrontSide;
      if (clouds.material.side !== cloudSide) {
        clouds.material.side = cloudSide;
        clouds.material.needsUpdate = true;
      }
      clouds.quaternion.copy(earthRotation);
      volume.quaternion.copy(earthRotation);
      atmosphere.quaternion.copy(earthRotation);
      atmosphere.visible = detailed || !!env.phenomena?.settings.airglow;
      uniforms.airglowOnly.value = detailed ? 0 : 1;
      uniforms.cloudAmount.value = detailed && env.settings.clouds ? env.settings.cloudOpacity : 0;
      uniforms.cloudNightVisible.value = env.settings.cloudNightVisible ? 1 : 0;
      env.weather?.update({ t: time });
      const hideClouds =
        env.weather?.settings.cloud === 'off' || env.weather?.waitingForRegionalCloud;
      if (hideClouds) {
        clouds.visible = volume.visible = false;
        uniforms.cloudAmount.value = 0;
      }
      env.auroraCurtains?.update(time, env.weather?.lowEffects);
      for (const mesh of aurora) {
        mesh.visible = !!env.aurora?.visible && !env.auroraCurtains?.volumeMaterial;
        mesh.quaternion.copy(earthRotation);
      }
      setPatch(env.settings.earthElevation ? nearPatch : null);
      geographicAnchor.quaternion.copy(earthRotation);
      viewport = { clientWidth: width, clientHeight: height };
      geography?.update({}, camera);
      scene.updateMatrixWorld(true);
    },
    render({ seeThroughTerrain = false } = {}) {
      if (!disposed && ownScene) compositor.render(seeThroughTerrain, renderEffects);
    },
    terrainBlocksScreen(x, y) {
      return compositor?.blocksScreen(x, y) ?? false;
    },
    renderEffects,
    dispose() {
      if (disposed) return;
      disposed = true;
      compositor?.dispose();
      env.cityTerrain.release(id);
      env.elevation.release(id);
      elevation.dispose();
      geography?.dispose();
      for (const mesh of Object.values(patches)) mesh?.geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      root.removeFromParent();
    },
  };
}

// Same switches as the main Earth view; this panel never creates another data manager.
export function mountWorldEarthControls(host, environment, { onChange = () => {} } = {}) {
  const root = document.createElement('details');
  root.className = 'shared-world-earth-controls';
  const checks = [
    ['earthElevation', '真实地形'],
    ['cityTerrain', '城市地景'],
    ['clouds', '云层'],
    ['geographyEnabled', '地理标注'],
    ['geoBorders', '国界'],
    ['geoCountries', '国家'],
    ['geoCapitals', '首都'],
    ['geoCities', '城市'],
    ['geoMarine', '海洋'],
    ['geoLandforms', '地形地貌'],
    ['geoRivers', '河流'],
    ['geoLakes', '湖泊'],
  ];
  root.innerHTML =
    '<summary data-key="地球与地景"></summary>' +
    checks
      .map(
        ([key, label]) =>
          `<label><input type="checkbox" data-setting="${key}"> <span data-key="${label}"></span></label>`
      )
      .join('') +
    '<label data-key="城市级别"></label><select data-setting="geoCityTier"><option value="1" data-key="主要城市"></option><option value="2" data-key="更多城市"></option><option value="3" data-key="全部城市"></option></select><label data-key="地理标注密度"></label><input type="range" data-setting="geoDensity" min="0" max="1" step=".01">';
  host.append(root);
  const streaming = mountSurfaceStreamingControls(root, environment);
  root.insertBefore(streaming.root, root.children[1]);
  const nightLabel = document.createElement('label'),
    nightSource = document.createElement('select');
  nightLabel.dataset.key = '夜景数据';
  nightSource.dataset.nightSource = '';
  root.insertBefore(nightSource, streaming.root.nextSibling);
  root.insertBefore(nightLabel, nightSource);
  nightSource.onchange = async () => {
    nightSource.disabled = true;
    try {
      await environment.setQuality(
        environment.settings.quality,
        nightSource.value,
        environment.settings.daySource
      );
    } finally {
      refresh();
    }
  };
  function refresh() {
    streaming.refresh();
    const mainNight = document.getElementById('nightSource');
    if (mainNight && nightSource.innerHTML !== mainNight.innerHTML)
      nightSource.innerHTML = mainNight.innerHTML;
    nightSource.value = environment.settings.nightSource;
    nightSource.disabled = !!mainNight?.disabled;
    for (const el of root.querySelectorAll('[data-setting]')) {
      const value = environment.settings[el.dataset.setting];
      if (el.type === 'checkbox') el.checked = !!value;
      else if (document.activeElement !== el) el.value = value;
    }
  }
  function translate() {
    root.querySelectorAll('[data-key]').forEach((el) => (el.textContent = t(el.dataset.key)));
  }
  root.addEventListener('change', (event) => {
    const el = event.target,
      key = el.dataset.setting;
    if (!key) return;
    environment.settings[key] = el.type === 'checkbox' ? el.checked : Number(el.value);
    if (key.startsWith('geo') && key !== 'geographyEnabled')
      environment.settings.geographyEnabled = true;
    syncGeographyControls(environment.settings);
    const main = document.getElementById(
      {
        clouds: 'showClouds',
        earthElevation: 'earthElevation',
        cityTerrain: 'cityTerrainEnabled',
        cityAutoLoad: 'cityAutoLoad',
      }[key]
    );
    if (main?.type === 'checkbox') main.checked = el.checked;
    environment.cityTerrainControls?.render?.(true);
    environment.save?.();
    onChange();
    refresh();
  });
  const off = onLanguageChange(translate);
  translate();
  refresh();
  return {
    root,
    refresh,
    dispose() {
      off();
      streaming.dispose();
      root.remove();
    },
  };
}
