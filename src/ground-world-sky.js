import { groundCameraRotation } from './ground-camera-pointing.js';
import * as THREE from 'three';
import { earthAxes, sunPosition, dot, sunlightFraction } from './orbit.js';
import { enuFrame, WGS84_A, WGS84_F } from './ground-world-math.js';
import { solarApparent } from './solar-system.js';
import { createSharedWorldSky } from './shared-world-sky.js';
import { createGroundPlanetLayer } from './ground-planets.js';
import { getLanguage, t } from './i18n.js';

const V = (a) => new THREE.Vector3(...a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const D = Math.PI / 180;

export function groundCelestialFrame(site, time, geoidUndulation = 0) {
  if (!Number.isFinite(time)) throw new RangeError('Invalid sky time');
  // The very same WGS84/vertical-datum convention as local terrain, including free-flight altitude.
  const fixed = enuFrame(site, geoidUndulation),
    axes = earthAxes(time);
  const inertial = (v) => [0, 1, 2].map((i) => axes.reduce((sum, a, j) => sum + a[i] * v[j], 0));
  const basis = [fixed.east, fixed.north, fixed.up].map(inertial);
  const eye = inertial(fixed.origin.map((v) => v / 1000));
  return {
    basis,
    eye,
    fixed,
    q: { t: time, position: eye, earthAxes: axes, sun: sunPosition(time) },
  };
}

// Keep the camera's local frame and the topocentric solar-system positions on
// the same clock. An eyepiece can pass its exact sample into the renderer.
export function createGroundSkySampler() {
  let last;
  return (site, time) => {
    if (
      last &&
      last.frame.q.t === time &&
      last.latitude === site.latitude &&
      last.longitude === site.longitude &&
      last.height === site.height
    )
      return last;
    const frame = groundCelestialFrame(site, time);
    last = {
      latitude: site.latitude,
      longitude: site.longitude,
      height: site.height,
      frame,
      bodies: solarApparent(frame.q, frame.eye),
    };
    return last;
  };
}

// Analytic WGS84 silhouette covers the distant Earth beyond the local terrain patch.
// For a below-sea-level basin use an inner ellipsoid just below the observer;
// the actual basin rim remains owned by the rendered terrain.
export function groundEarthOccluder(site) {
  const fixed = enuFrame(site),
    offset = Math.min(0, site.height - 10);
  return { fixed, radii: [WGS84_A + offset, WGS84_A + offset, WGS84_A * (1 - WGS84_F) + offset] };
}
export function groundRayBlocked(site, localDirection) {
  const { fixed, radii } = groundEarthOccluder(site);
  const p = fixed.origin.map((v, i) => v / radii[i]);
  const d = fixed.origin.map(
    (_, i) =>
      (fixed.east[i] * localDirection[0] +
        fixed.north[i] * localDirection[1] +
        fixed.up[i] * localDirection[2]) /
      radii[i]
  );
  const a = dot(d, d),
    b = dot(p, d),
    c = dot(p, p) - 1,
    disc = b * b - a * c;
  return b < 0 && disc >= 0 && (-b + Math.sqrt(disc)) / a > 0;
}
export function groundSkyLight(sunAltitude, moonAltitude = -90, moonFraction = 0, height = 0) {
  const density = Math.exp(-Math.max(0, height) / 8500);
  const day = clamp((sunAltitude + 8) / 14, 0, 1) * density;
  const twilight = Math.max(0, 1 - Math.abs(sunAltitude + 4) / 12) * density;
  // Visibility is a visual exposure model, not the complement of air density:
  // even a high mountain has ample daylight scattering to hide catalogue stars.
  // Blend into the space view only well above ordinary ground/aircraft altitudes.
  const groundNight = clamp((-sunAltitude - 3) / 15, 0, 1);
  const upper = clamp((height - 20000) / 60000, 0, 1);
  const spaceVisibility = upper * upper * (3 - 2 * upper);
  let night = groundNight + (1 - groundNight) * spaceVisibility;
  night *= 1 - 0.3 * moonFraction * Math.max(0, Math.sin(moonAltitude * D)) * density;
  return { day, twilight, night, density, airVisibility: 1 - spaceVisibility };
}

const airColor = `vec3 airColour(vec3 d,vec3 sun,float day,float twilight){float h=max(0.,d.z),horizon=exp(-h*5.),glow=pow(max(0.,dot(d,sun)),12.);return mix(vec3(.028,.16,.39),vec3(.36,.52,.64),horizon)*day+vec3(.34,.095,.025)*twilight*horizon*(.25+.75*glow);}`;
const sphereVertex = `varying vec3 ray;void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

export function createGroundSky({ environment, renderer, id = 'ground-world' }) {
  const atmosphere = new THREE.Scene(),
    bodiesScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 3000);
  camera.up.set(0, 0, 1);
  const shared = createSharedWorldSky({ environment, renderer, id, groundObserver: true });
  // In stargazing mode the catalogue stays above any archival imagery. Apply
  // the local sky's transmission to each point so toggling a survey, including
  // its loading/fallback frames, cannot brighten stars outside its coverage.
  const starMaterial = shared.stars.material;
  const zenith = new THREE.Vector3(),
    airExtinction = new THREE.Vector3();
  starMaterial.uniforms.groundZenith = { value: zenith };
  starMaterial.uniforms.groundExtinction = { value: airExtinction };
  starMaterial.vertexShader =
    'uniform vec3 groundZenith,groundExtinction;varying float groundTransmission;\n' +
    starMaterial.vertexShader.replace(
      /void\s+main\s*\(\s*\)\s*\{/,
      `void main(){
      float h=max(0.,dot(normalize(position),groundZenith));
      groundTransmission=1.-groundExtinction.z*clamp(groundExtinction.x+groundExtinction.y*exp(-h*5.),0.,.995);`
    );
  starMaterial.fragmentShader =
    'varying float groundTransmission;\n' +
    starMaterial.fragmentShader.replace(
      '#include <colorspace_fragment>',
      '#include <colorspace_fragment>\ngl_FragColor.rgb*=groundTransmission;'
    );
  const inertialCamera = new THREE.PerspectiveCamera();
  let resolvedPlanets = null;
  const airUniforms = {
    sun: { value: new THREE.Vector3(0, 0, 1) },
    day: { value: 1 },
    twilight: { value: 0 },
    natural: { value: 1 },
    opticalGain: { value: 1 },
    density: { value: 1 },
    airVisibility: { value: 1 },
  };
  const air = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
      uniforms: airUniforms,
      vertexShader: sphereVertex,
      fragmentShader: `varying vec3 ray;uniform vec3 sun;uniform float day,twilight,natural,density,airVisibility,opticalGain;${airColor}
      void main(){vec3 d=normalize(ray);float a=natural*airVisibility*clamp((day*.98+twilight*exp(-max(0.,d.z)*5.)*.8)/max(density,.000001),0.,.995);
      gl_FragColor=vec4(airColour(d,sun,day,twilight)*opticalGain,a);
      #include <colorspace_fragment>
      }`,
    })
  );
  atmosphere.add(air);
  let culture = '',
    stargazing = false;
  const disks = new Map();
  const moonUniforms = {
    surfaceMap: { value: environment.moon?.texture || environment.fallback },
    textured: { value: !!environment.moon?.texture },
    light: { value: new THREE.Vector3() },
    eclipse: { value: 1 },
    sun: airUniforms.sun,
    day: airUniforms.day,
    twilight: airUniforms.twilight,
    natural: airUniforms.natural,
    opticalGain: airUniforms.opticalGain,
    density: airUniforms.density,
    airVisibility: airUniforms.airVisibility,
  };
  for (const id of ['Sun', 'Moon']) {
    const geo = new THREE.SphereGeometry(1, 48, 24);
    geo.rotateX(Math.PI / 2);
    const material =
      id === 'Sun'
        ? new THREE.MeshBasicMaterial({ color: 0xfff3d4, toneMapped: false })
        : new THREE.ShaderMaterial({
            uniforms: moonUniforms,
            toneMapped: false,
            vertexShader: `varying vec2 lunarUV;varying vec3 n,ray;void main(){lunarUV=uv;n=normalize(mat3(modelMatrix)*normal);ray=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(ray,1.);}`,
            fragmentShader:
              `varying vec2 lunarUV;varying vec3 n,ray;uniform sampler2D surfaceMap;uniform bool textured;uniform vec3 light,sun;uniform float eclipse,day,twilight,natural,density,airVisibility,opticalGain;${airColor}
      void main(){vec3 d=normalize(ray);float mu=max(0.,dot(normalize(n),light)),em=max(0.,dot(normalize(n),-d));float reflection=(.6*mu+.4*(2.*mu/max(.0001,mu+em)))*eclipse;vec3 albedo=textured?texture2D(surfaceMap,lunarUV).rgb:vec3(.6);float a=natural*airVisibility*clamp((day*.98+twilight*exp(-max(0.,d.z)*5.)*.8)/max(density,.000001),0.,.995);gl_FragColor=vec4((albedo*reflection*(1.-a*.7)+airColour(d,sun,day,twilight)*a)*opticalGain,1.);#include <colorspace_fragment>}`.replace(
                ';#include',
                ';\n#include'
              ),
          });
    material.depthTest = false;
    material.depthWrite = false;
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = id === 'Sun' ? 1 : 2;
    bodiesScene.add(mesh);
    disks.set(id, mesh);
  }
  const planetGeometry = new THREE.BufferGeometry();
  planetGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(21), 3)
  );
  const planets = new THREE.Points(
    planetGeometry,
    new THREE.PointsMaterial({
      color: 0xffe9cb,
      size: 3,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    })
  );
  planets.renderOrder = 0;
  bodiesScene.add(planets);
  const sampleAt = createGroundSkySampler();
  const clearColor = new THREE.Color();
  let night = 1,
    lastLabels = [],
    lastLabelKey = '';
  function update(site, time, pose, settings, width, height, sample) {
    camera.aspect = width / height;
    camera.fov = settings.fov || 65;
    camera.updateProjectionMatrix();
    camera.position.set(0, 0, 0);
    groundCameraRotation(pose, camera.quaternion);
    camera.updateMatrixWorld();
    const key = [site.latitude, site.longitude, site.height].join(',');
    // A second is enough for the natural sky; large time jumps are evaluated immediately.
    const { frame, bodies } = sample || sampleAt(site, Math.floor(time / 1000) * 1000);
    const stamp = frame.q.t;
    const basis = frame.basis,
      toLocal = (v) => basis.map((b) => dot(b, v));
    const sun = bodies.find((b) => b.id === 'Sun'),
      moon = bodies.find((b) => b.id === 'Moon'),
      s = toLocal(sun?.direction || [1, 0, 0]);
    const altitude = Math.asin(clamp(s[2], -1, 1)) / D;
    const illumination = groundSkyLight(
      altitude,
      moon ? Math.asin(clamp(toLocal(moon.direction)[2], -1, 1)) / D : -90,
      moon?.illuminatedFraction || 0,
      site.height
    );
    night = illumination.night;
    stargazing = settings.stargazing === true;
    const reference = stargazing ? settings.referenceSource : null;
    const enhanced = stargazing
      ? settings.finderEnhanced === true
      : settings.appearance !== 'natural';
    const brightness = enhanced ? 1 : night;
    const ev = settings.exposureEV ?? settings.opticalExposure ?? 0;
    const exposure = settings.exposureGain ?? 2 ** ev;
    const aperture = settings.apertureGain ?? ((settings.apertureMm ?? 80) / 80) ** 2;
    const opticalGain =
      stargazing && Number.isFinite(exposure * aperture) ? Math.max(0, exposure * aperture) : 1;
    airUniforms.opticalGain.value = opticalGain;
    airUniforms.sun.value.fromArray(s);
    airUniforms.day.value = illumination.day;
    airUniforms.twilight.value = illumination.twilight;
    airUniforms.natural.value = enhanced ? 0.1 : 1;
    // Density attenuates radiance once; coverage fades independently into space.
    airUniforms.density.value = illumination.density;
    airUniforms.airVisibility.value = illumination.airVisibility;
    zenith.fromArray(basis[2]);
    const density = Math.max(0.000001, illumination.density);
    airExtinction.set(
      (illumination.day * 0.98) / density,
      (illumination.twilight * 0.8) / density,
      stargazing ? airUniforms.natural.value * illumination.airVisibility : 0
    );
    culture = settings.culture || environment.settings.skyCulture;
    const localToInertial = new THREE.Matrix4().makeBasis(...basis.map(V));
    inertialCamera.quaternion.setFromRotationMatrix(localToInertial).multiply(camera.quaternion);
    inertialCamera.fov = camera.fov;
    inertialCamera.zoom = camera.zoom;
    const pixelRatio = settings.pixelRatio ?? renderer.getPixelRatio();
    const starMagnitudeLimit = stargazing
      ? Number.isFinite(settings.starMagnitudeLimit)
        ? settings.starMagnitudeLimit
        : (settings.eyeCircleDiameter > 0 ? 8 : 6.5) +
          2.5 * Math.log10(Math.max(0.0001, opticalGain))
      : null;
    const sharedStatus = shared.update(inertialCamera, stamp, width, height, {
      pixelRatio,
      brightness: brightness * opticalGain * (environment.settings.starBrightness ?? 1),
      detailBrightness: reference ? opticalGain : undefined,
      // At eyepiece scale even the full all-sky cubemap spans many pixels per
      // texel. Keep the smooth galactic band and the resolved catalogue stars.
      // In natural stargazing the catalogue owns every point source, so a
      // photographed star cannot remain visible after its magnitude is filtered.
      texturedGalaxy: !stargazing,
      starMagnitudeLimit,
      catalogueOverlay: stargazing,
      cacheCatalogue: stargazing && settings.photoAnnotations === undefined,
      showChart: settings.photoAnnotations !== false,
      showArt: settings.photoAnnotations !== false,
      wideField: stargazing
        ? reference === 'dss' ||
          ((reference === 'recent' || reference === 'hubble') &&
            settings.referenceBackground === 'dss')
        : settings.appearance === 'dss',
      showDetail: stargazing ? !!reference : true,
      // A null selection releases this view, keeping the natural eyepiece free
      // of survey photography. The main camera's chosen atlas is independent.
      detailSelection: stargazing
        ? reference
          ? {
              source: reference,
              artworkId: settings.referenceArtwork,
              background:
                settings.referenceBackground ?? environment.settings.webbBackground ?? 'galaxy',
            }
          : null
        : undefined,
      settings: stargazing
        ? { skyDetail: !!reference, skyCulture: culture, stars: true, milky: true }
        : { skyCulture: culture },
    });
    const view = sharedStatus.view;
    if (stargazing)
      resolvedPlanets ??= createGroundPlanetLayer(bodiesScene, environment, airUniforms, airColor);
    else if (resolvedPlanets) {
      resolvedPlanets.dispose();
      resolvedPlanets = null;
    }
    resolvedPlanets?.begin();
    const stopPixels = (settings.eyeCircleDiameter || 0) * pixelRatio;
    disks.get('Sun').material.color.setHex(0xfff3d4).multiplyScalar(opticalGain);
    planets.material.color.setHex(0xffe9cb).multiplyScalar(opticalGain);
    planets.renderOrder = stargazing ? -20 : 0;
    let count = 0;
    for (const body of bodies) {
      const d = toLocal(body.direction);
      if (disks.has(body.id)) {
        const mesh = disks.get(body.id);
        mesh.visible = true;
        mesh.material.transparent = stargazing;
        mesh.renderOrder = stargazing ? -Math.log10(body.distanceKm) : body.id === 'Sun' ? 1 : 2;
        mesh.position.fromArray(d).multiplyScalar(900);
        mesh.scale.setScalar(900 * Math.sin(body.radiusRad));
        if (body.id === 'Moon') {
          const x = V(toLocal(body.prime)),
            z = V(toLocal(body.north)),
            y = z.clone().cross(x).normalize();
          mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
          moonUniforms.surfaceMap.value = environment.moon?.texture || environment.fallback;
          moonUniforms.textured.value = !!environment.moon?.texture;
          moonUniforms.light.value.fromArray(toLocal(body.sunDirection));
          const position = frame.eye.map((v, i) => v + body.direction[i] * body.distanceKm);
          moonUniforms.eclipse.value = sunlightFraction(position, frame.q.sun);
        }
      } else if (!resolvedPlanets?.show(body, d, view, stopPixels)) {
        planetGeometry.attributes.position.setXYZ(count++, ...d.map((x) => x * 900));
      }
    }
    resolvedPlanets?.end();
    for (const [id, mesh] of disks) mesh.visible = bodies.some((b) => b.id === id);
    planetGeometry.setDrawRange(0, count);
    planetGeometry.attributes.position.needsUpdate = true;
    planets.material.opacity = brightness;
    const labelKey = [
      culture,
      getLanguage(),
      !!settings.names,
      settings.appearance,
      enhanced,
      settings.seeThroughTerrain,
      stamp,
      key,
    ].join('|');
    if (labelKey !== lastLabelKey) {
      lastLabels = [];
      if (settings.names)
        lastLabels.push(
          ...bodies
            .filter((b) => b.id === 'Sun' || b.id === 'Moon' || brightness > 0.02)
            .map((b) => ({
              bodyId: b.id,
              text: t(
                {
                  Sun: '太阳',
                  Moon: '月球',
                  Mercury: '水星',
                  Venus: '金星',
                  Mars: '火星',
                  Jupiter: '木星',
                  Saturn: '土星',
                  Uranus: '天王星',
                  Neptune: '海王星',
                }[b.id]
              ),
              direction: toLocal(b.direction),
              offsetY: -14,
            }))
        );
      if (!settings.seeThroughTerrain)
        lastLabels = lastLabels.filter((row) => !groundRayBlocked(site, row.direction));
      lastLabelKey = labelKey;
    }
    return {
      sunDirection: s,
      sunAltitude: altitude,
      starMagnitudeLimit,
      starCount: sharedStatus.starCount,
      night,
      view,
      labels: lastLabels,
      camera,
      dss: sharedStatus.detail,
    };
  }
  return {
    camera,
    update,
    render() {
      const auto = renderer.autoClear,
        clearAlpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      renderer.autoClear = false;
      try {
        renderer.setClearColor(0x02050d, 1);
        renderer.clear();
        if (stargazing) shared.render(renderAtmosphere);
        else {
          shared.render();
          renderAtmosphere();
        }
        renderer.render(bodiesScene, camera);

        // The following shared Earth/terrain pass supplies the actual silhouette.
        renderer.clearDepth();
      } finally {
        renderer.setClearColor(clearColor, clearAlpha);
        renderer.autoClear = auto;
      }
    },
    dispose() {
      resolvedPlanets?.dispose();
      shared.dispose();
      for (const mesh of [air]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      planetGeometry.dispose();
      planets.material.dispose();
      for (const m of disks.values()) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
  function renderAtmosphere() {
    if (
      airUniforms.airVisibility.value > 0 &&
      (airUniforms.day.value > 0 || airUniforms.twilight.value > 0)
    )
      renderer.render(atmosphere, camera);
  }
}
