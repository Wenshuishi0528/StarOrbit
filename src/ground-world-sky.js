import * as THREE from 'three';
import { earthAxes, sunPosition, dot, sunlightFraction } from './orbit.js';
import { enuFrame, WGS84_A, WGS84_F } from './ground-world-math.js';
import { solarApparent } from './solar-system.js';
import { getSkyCulture, cultureObjectLabel } from './sky-cultures.js';
import { equatorial } from './environment-math.js';
import { getSkyConstellationLines } from './sky-annotation-layout.js';
import { referenceLineGeometry, SkyReferenceLayer } from './sky-reference-layer.js';
import { ConstellationArtLayer } from './constellation-art-layer.js';
import { SkyDetail } from './sky-detail.js';
import { SkyDetailLayer } from './sky-detail-layer.js';
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

export function createGroundSky({ environment, renderer }) {
  const scene = new THREE.Scene(),
    celestial = new THREE.Group(),
    guides = new THREE.Scene(),
    guideFrame = new THREE.Group();
  const atmosphere = new THREE.Scene(),
    bodiesScene = new THREE.Scene(),
    earthScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 3000);
  camera.up.set(0, 0, 1);
  scene.add(celestial);
  guides.add(guideFrame);
  const stars = new THREE.Points(environment.stars.geometry, environment.stars.material.clone());
  stars.frustumCulled = false;
  stars.renderOrder = 2;
  celestial.add(stars);
  const galaxy = new THREE.Mesh(environment.milky.geometry, environment.milky.material.clone());
  galaxy.renderOrder = 0;
  celestial.add(galaxy);
  let ownedGalaxy = null,
    disposed = false;
  if (!environment.galaxyTexture && environment.assets.sky?.[4])
    new THREE.CubeTextureLoader()
      .loadAsync(environment.assets.sky[4])
      .then((tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        ownedGalaxy = tex;
      })
      .catch(() => {});
  const airUniforms = {
    sun: { value: new THREE.Vector3(0, 0, 1) },
    day: { value: 1 },
    twilight: { value: 0 },
    natural: { value: 1 },
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
      fragmentShader: `varying vec3 ray;uniform vec3 sun;uniform float day,twilight,natural,density,airVisibility;${airColor}
      void main(){vec3 d=normalize(ray);float a=natural*airVisibility*clamp((day*.98+twilight*exp(-max(0.,d.z)*5.)*.8)/max(density,.000001),0.,.995);
      gl_FragColor=vec4(airColour(d,sun,day,twilight),a);
      #include <colorspace_fragment>
      }`,
    })
  );
  atmosphere.add(air);
  const earthUniforms = {
    eye: { value: new THREE.Vector3() },
    east: { value: new THREE.Vector3() },
    north: { value: new THREE.Vector3() },
    up: { value: new THREE.Vector3() },
    radii: { value: new THREE.Vector3() },
    sun: airUniforms.sun,
    day: airUniforms.day,
    twilight: airUniforms.twilight,
  };
  const earthMask = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: earthUniforms,
      vertexShader: sphereVertex,
      fragmentShader: `varying vec3 ray;uniform vec3 eye,east,north,up,radii,sun;uniform float day,twilight;${airColor}
    void main(){vec3 local=normalize(ray),p=eye/radii,d=(east*local.x+north*local.y+up*local.z)/radii;float a=dot(d,d),b=dot(p,d),c=dot(p,p)-1.;if(b>=0.||b*b-a*c<0.)discard;vec3 csky=airColour(local,sun,day,twilight);gl_FragColor=vec4(mix(vec3(.003,.005,.006),csky*.5,clamp(day+twilight,0.,1.)),1.);
    #include <colorspace_fragment>
    }`,
    })
  );
  earthScene.add(earthMask);
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x7ea9bc,
      transparent: true,
      opacity: 0.4,
      depthTest: false,
      depthWrite: false,
    })
  );
  guideFrame.add(lines);
  const refs = new SkyReferenceLayer(guideFrame);
  // The world view replaces the main/scope render loop. Its visible artwork
  // must win the shared texture budget over those views' retained requests.
  // dispose() releases this demand so their normal priorities resume on exit.
  const art = environment.constellationArt
    ? new ConstellationArtLayer(environment.constellationArt, 'ground-world-art', false, 4)
    : null;
  let detail = null,
    detailLayer = null,
    culture = '',
    enhanced = false;
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
              `varying vec2 lunarUV;varying vec3 n,ray;uniform sampler2D surfaceMap;uniform bool textured;uniform vec3 light,sun;uniform float eclipse,day,twilight,natural,density,airVisibility;${airColor}
      void main(){vec3 d=normalize(ray);float mu=max(0.,dot(normalize(n),light)),em=max(0.,dot(normalize(n),-d));float reflection=(.6*mu+.4*(2.*mu/max(.0001,mu+em)))*eclipse;vec3 albedo=textured?texture2D(surfaceMap,lunarUV).rgb:vec3(.6);float a=natural*airVisibility*clamp((day*.98+twilight*exp(-max(0.,d.z)*5.)*.8)/max(density,.000001),0.,.995);gl_FragColor=vec4(albedo*reflection*(1.-a*.7)+airColour(d,sun,day,twilight)*a,1.);#include <colorspace_fragment>}`.replace(
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
  let frame,
    bodies = [],
    night = 1,
    lastTime = NaN,
    lastSite = '',
    lastLabels = [],
    lastLabelKey = '';
  function update(site, time, pose, settings, width, height) {
    camera.aspect = width / height;
    camera.fov = settings.fov || 65;
    camera.updateProjectionMatrix();
    const a = pose.azimuth * D,
      e = pose.elevation * D;
    camera.position.set(0, 0, 0);
    camera.lookAt(Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e));
    camera.updateMatrixWorld();
    const key = [site.latitude, site.longitude, site.height].join(',');
    // A second is enough for the natural sky; large time jumps are evaluated immediately.
    const stamp = Math.floor(time / 1000) * 1000;
    if (stamp !== lastTime || key !== lastSite) {
      frame = groundCelestialFrame(site, stamp);
      bodies = solarApparent(frame.q, frame.eye);
      lastTime = stamp;
      lastSite = key;
    }
    const basis = frame.basis,
      toLocal = (v) => basis.map((b) => dot(b, v));
    for (const group of [celestial, guideFrame]) {
      group.matrixAutoUpdate = false;
      group.matrix.set(...[0, 1, 2].flatMap((i) => [...basis[i], 0]), 0, 0, 0, 1);
      group.matrixWorldNeedsUpdate = true;
    }
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
    enhanced = settings.appearance !== 'natural';
    const brightness = enhanced ? 1 : night;
    airUniforms.sun.value.fromArray(s);
    airUniforms.day.value = illumination.day;
    airUniforms.twilight.value = illumination.twilight;
    airUniforms.natural.value = enhanced ? 0.1 : 1;
    // Density attenuates radiance once; coverage fades independently into space.
    airUniforms.density.value = illumination.density;
    airUniforms.airVisibility.value = illumination.airVisibility;
    const occ = groundEarthOccluder(site);
    earthUniforms.eye.value.fromArray(occ.fixed.origin);
    earthUniforms.radii.value.fromArray(occ.radii);
    for (const axis of ['east', 'north', 'up'])
      earthUniforms[axis].value.fromArray(occ.fixed[axis]);
    stars.material.uniforms.brightness.value = brightness;
    stars.material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    stars.material.uniforms.high.value = enhanced ? 1 : 0;
    galaxy.material.uniforms.skyMap.value = environment.galaxyTexture || ownedGalaxy;
    galaxy.material.uniforms.textured.value = galaxy.material.uniforms.skyMap.value ? 1 : 0;
    galaxy.material.uniforms.brightness.value = (enhanced ? 0.8 : 0.1) * brightness;
    if (culture !== settings.culture) {
      culture = settings.culture;
      lines.geometry.dispose();
      lines.geometry = referenceLineGeometry(getSkyConstellationLines(culture), 1000);
    }
    lines.visible = !!settings.lines;
    lines.material.opacity = 0.45 * (enhanced ? 1 : Math.max(0.15, night));
    const right = V([1, 0, 0]).applyQuaternion(camera.quaternion).toArray(),
      up = V([0, 1, 0]).applyQuaternion(camera.quaternion).toArray(),
      forward = V([0, 0, -1]).applyQuaternion(camera.quaternion).toArray();
    const inertial = (v) => [0, 1, 2].map((i) => basis.reduce((sum, b, j) => sum + b[i] * v[j], 0));
    const view = {
      right: inertial(right),
      up: inertial(up),
      forward: inertial(forward),
      fovY: camera.fov,
      aspect: camera.aspect,
      pixelHeight: height,
    };
    refs.update(
      {
        settings: { equatorialGrid: settings.grid, eclipticLine: settings.ecliptic },
        epoch: stamp,
        ...view,
        allSky: true,
      },
      enhanced ? 1 : Math.max(0.15, night)
    );
    art?.update(view, !!settings.art, {
      culture,
      asterisms: true,
      symbols: false,
      artBrightness: settings.artBrightness ?? 1,
    });
    if (settings.appearance === 'dss' && !detail) {
      detail = new SkyDetail(environment.assets.skyDetail, { source: 'dss', wideField: true });
      detailLayer = new SkyDetailLayer(detail, 'ground-dss');
    }
    detailLayer?.update(view, settings.appearance === 'dss', { skyGain: 1 });
    let count = 0;
    for (const body of bodies) {
      const d = toLocal(body.direction);
      if (disks.has(body.id)) {
        const mesh = disks.get(body.id);
        mesh.visible = true;
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
      } else {
        planetGeometry.attributes.position.setXYZ(count++, ...d.map((x) => x * 900));
      }
    }
    for (const [id, mesh] of disks) mesh.visible = bodies.some((b) => b.id === id);
    planetGeometry.setDrawRange(0, count);
    planetGeometry.attributes.position.needsUpdate = true;
    planets.material.opacity = brightness;
    const labelKey = [
      culture,
      getLanguage(),
      !!settings.names,
      settings.appearance,
      stamp,
      key,
    ].join('|');
    if (labelKey !== lastLabelKey) {
      lastLabels = settings.names
        ? getSkyCulture(culture).asterisms.map((c) => ({
            text: cultureObjectLabel(c, getLanguage()),
            direction: toLocal(equatorial(c.ra, c.dec)),
          }))
        : [];
      if (settings.names)
        lastLabels.push(
          ...bodies
            .filter((b) => b.id === 'Sun' || b.id === 'Moon' || brightness > 0.02)
            .map((b) => ({
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
      lastLabels = lastLabels.filter((row) => !groundRayBlocked(site, row.direction));
      lastLabelKey = labelKey;
    }
    return {
      sunDirection: s,
      sunAltitude: altitude,
      night,
      view,
      labels: lastLabels,
      camera,
      dss: detail?.status('ground-dss'),
    };
  }
  return {
    camera,
    update,
    render() {
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      try {
        renderer.setClearColor(0x02050d, 1);
        renderer.clear();
        renderer.render(scene, camera);
        if (detailLayer) renderer.render(detailLayer.scene, camera);
        renderer.render(atmosphere, camera);
        renderer.render(bodiesScene, camera);
        renderer.render(guides, camera);
        if (art) renderer.render(art.scene, camera);
        // Draw all sky before the analytic Earth and the caller's actual terrain.
        renderer.render(earthScene, camera);
        renderer.clearDepth();
      } finally {
        renderer.autoClear = auto;
      }
    },
    dispose() {
      disposed = true;
      ownedGalaxy?.dispose();
      art?.dispose();
      detailLayer?.dispose();
      detail?.dispose();
      refs.dispose();
      stars.material.dispose();
      galaxy.material.dispose();
      for (const mesh of [air, earthMask]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      lines.geometry.dispose();
      lines.material.dispose();
      planetGeometry.dispose();
      planets.material.dispose();
      for (const m of disks.values()) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
