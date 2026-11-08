import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  cosmicPhase,
  normalizeCosmicParams,
  observerDirection,
  meteorState,
} from './cosmic-math.js';

const TAU = 2 * Math.PI;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const mix = THREE.MathUtils.lerp;
const noiseGLSL = `
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return .57*noise(p)+.28*noise(p*2.1)+.15*noise(p*4.3);}`;
const globeVertex = `varying vec3 localPosition;varying vec3 normalView;varying vec3 eye;
void main(){localPosition=position;vec4 p=modelViewMatrix*vec4(position,1.);normalView=normalize(normalMatrix*normal);eye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`;
const plasmaFragment = `${noiseGLSL}
uniform float phase;uniform vec3 hot,cool;varying vec3 localPosition,normalView,eye;
void main(){vec3 p=normalize(localPosition);float n=fbm(p*6.+vec3(phase*.8,phase*.3,0));
float veins=pow(abs(sin(n*19.+p.y*5.)),8.);float limb=pow(max(0.,dot(normalView,eye)),.45);
vec3 c=mix(cool,hot,clamp(n*.9+veins*.35,0.,1.))*(.55+limb*.55);gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const rimFragment = `uniform vec3 tint;uniform float opacity;varying vec3 normalView,eye;
void main(){float edge=pow(1.-abs(dot(normalView,eye)),3.);gl_FragColor=vec4(tint,edge*opacity);
#include <colorspace_fragment>
}`;
function seeded(index, seed = 7) {
  let n = Math.imul(index + seed * 7919, 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function material(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    toneMapped: false,
  });
}
function glowTexture() {
  const width = 128,
    data = new Uint8Array(width * width * 4);
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++) {
      const r = Math.hypot(((x + 0.5) / width) * 2 - 1, ((y + 0.5) / width) * 2 - 1);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * Math.max(0, Math.exp(-r * r * 6) - Math.exp(-6)));
    }
  const texture = new THREE.DataTexture(data, width, width);
  texture.needsUpdate = true;
  return texture;
}
function glow(texture, color, size, opacity = 0.5) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color,
      opacity,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  sprite.scale.setScalar(size);
  return sprite;
}
function starSurface(radius, hot, cool) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 40),
    new THREE.ShaderMaterial({
      vertexShader: globeVertex,
      fragmentShader: plasmaFragment,
      uniforms: {
        phase: { value: 0 },
        hot: { value: new THREE.Color(hot) },
        cool: { value: new THREE.Color(cool) },
      },
    })
  );
}
function rim(radius, color, opacity = 0.7) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.ShaderMaterial({
      vertexShader: globeVertex,
      fragmentShader: rimFragment,
      uniforms: { tint: { value: new THREE.Color(color) }, opacity: { value: opacity } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
}
function line(points, color, opacity = 0.3) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
}
function magneticField() {
  const group = new THREE.Group();
  for (const radius of [2.2, 3.7])
    for (let az = 0; az < 8; az++) {
      const points = [];
      const start = Math.asin(Math.sqrt(1 / radius));
      for (let i = 0; i <= 80; i++) {
        const theta = mix(start, Math.PI - start, i / 80),
          r = radius * Math.sin(theta) ** 2;
        points.push(
          new THREE.Vector3(
            r * Math.sin(theta) * Math.cos((az * TAU) / 8),
            r * Math.cos(theta),
            r * Math.sin(theta) * Math.sin((az * TAU) / 8)
          )
        );
      }
      group.add(line(points, '#58c8f4', radius > 3 ? 0.16 : 0.29));
    }
  return group;
}
function neutronScene(texture, pulsing = false) {
  const group = new THREE.Group(),
    magnetic = new THREE.Group(),
    spin = new THREE.Group();
  const surface = starSurface(1, '#dcf6ff', '#147fa9');
  const stellarBody = new THREE.Group();
  stellarBody.add(surface, rim(1.04, '#74dcff'), glow(texture, '#248dca', 4.3, 0.27));
  group.add(stellarBody);
  magnetic.add(magneticField());
  spin.add(magnetic);
  group.add(spin);
  group.add(line([new THREE.Vector3(0, -4.8, 0), new THREE.Vector3(0, 4.8, 0)], '#9db2cf', 0.35));
  const equator = new THREE.EllipseCurve(0, 0, 1.5, 1.5)
    .getPoints(96)
    .map((p) => new THREE.Vector3(p.x, 0, p.y));
  group.add(line(equator, '#5d8fa9', 0.26));
  let observer, sight, cones;
  if (pulsing) {
    const beamMaterial = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 tex;void main(){tex=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 tex;uniform float phase;void main(){float taper=pow(sin(tex.y*3.14159),.6);float strands=.5+.5*pow(.5+.5*sin(tex.x*100.+tex.y*12.-phase*6.283),4.);gl_FragColor=vec4(.13,.65,1.,taper*strands*.23);\n#include <colorspace_fragment>\n}`,
      uniforms: { phase: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    cones = new THREE.Group();
    for (const sign of [-1, 1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.05, 5.5, 64, 1, true), beamMaterial);
      cone.rotation.z = sign === 1 ? Math.PI : 0;
      cone.position.y = sign * 3.25;
      cones.add(cone);
    }
    magnetic.add(cones);
    observer = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 12), material('#ffe1a1'));
    observer.add(glow(texture, '#ffd18a', 0.9, 0.8));
    sight = line([new THREE.Vector3(), new THREE.Vector3()], '#f5c98a', 0.55);
    sight.frustumCulled = false;
    group.add(observer, sight);
  }
  return {
    group,
    update(phase, params) {
      surface.material.uniforms.phase.value = phase * TAU;
      surface.rotation.y = phase * TAU;
      magnetic.rotation.z = -THREE.MathUtils.degToRad(params.tilt);
      spin.rotation.y = pulsing ? phase * TAU : 0.4;
      stellarBody.scale.setScalar(params.nsRadius / 12);
      if (observer) {
        observer.position.fromArray(observerDirection(params.inclination)).multiplyScalar(5.7);
        const a = observer.position.clone().normalize().multiplyScalar(1.25);
        sight.geometry.attributes.position.setXYZ(0, a.x, a.y, a.z);
        sight.geometry.attributes.position.setXYZ(
          1,
          observer.position.x,
          observer.position.y,
          observer.position.z
        );
        sight.geometry.attributes.position.needsUpdate = true;
        cones.children[0].material.uniforms.phase.value = phase;
        observer.scale.setScalar(1);
      }
    },
  };
}
function blackHoleScene(texture) {
  const group = new THREE.Group();
  const disk = new THREE.Mesh(
    new THREE.RingGeometry(1.72, 5, 192, 12),
    new THREE.ShaderMaterial({
      vertexShader: `varying vec3 local;void main(){local=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `${noiseGLSL}\nuniform float phase;varying vec3 local;
void main(){float r=length(local.xy);float angle=atan(local.y,local.x);float spiral=angle-r*1.7+phase*6.283/pow(r,.7);
float turbulence=fbm(vec3(cos(spiral)*r*3.,sin(spiral)*r*3.,r*5.));float bands=.7+.3*sin(r*67.+turbulence*5.);
float edge=smoothstep(1.72,1.9,r)*(1.-smoothstep(4.2,5.,r));float heat=pow(1.72/r,1.5);
vec3 color=mix(vec3(1.,.20,.035),vec3(1.,.83,.52),heat);float sided=1.+.42*sin(angle);
gl_FragColor=vec4(color*(.6+heat*2.5)*bands*sided,edge*(.7+.3*turbulence));
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
      uniforms: { phase: { value: 0 } },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  disk.rotation.x = -Math.PI / 2;
  group.add(disk);
  const shadow = new THREE.Mesh(new THREE.SphereGeometry(1.21, 64, 40), material('#000000'));
  shadow.renderOrder = 1;
  group.add(shadow);
  // This camera-facing bright ring and far-side arc are a teaching illustration
  // of bent light. They are not a second accretion disc or a GR ray solution.
  const imageRing = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.025, 12, 180), material('#ffdc9c'));
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.27, 0.07, 12, 180),
    new THREE.MeshBasicMaterial({
      color: '#e79c50',
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(1.56, 0.105, 12, 160, Math.PI),
    new THREE.MeshBasicMaterial({
      color: '#ffd297',
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const underArc = new THREE.Mesh(
    new THREE.TorusGeometry(1.43, 0.045, 10, 120, Math.PI),
    new THREE.MeshBasicMaterial({
      color: '#d7843a',
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  underArc.rotation.z = Math.PI;
  imageRing.add(ring, halo, arc, underArc);
  group.add(imageRing);
  const haze = glow(texture, '#c06622', 8, 0.15);
  group.add(haze);
  return {
    group,
    update(phase, params, camera) {
      disk.material.uniforms.phase.value = phase;
      imageRing.quaternion.copy(camera.quaternion);
      const scale = Math.pow(params.bhMass / 10, 0.14);
      group.scale.setScalar(scale);
      arc.scale.y = 0.65 + 0.25 * Math.sin(THREE.MathUtils.degToRad(params.bhInclination));
    },
  };
}
function supernovaScene(texture) {
  const group = new THREE.Group(),
    star = starSurface(2, '#ffde9b', '#bd381e'),
    halo = glow(texture, '#ec662b', 9, 0.45);
  const core = starSurface(0.22, '#effaff', '#3997c4'),
    shock = rim(1, '#72b8f1', 0.32);
  group.add(star, halo, core, shock);
  const count = 3400,
    base = new Float32Array(count * 3),
    positions = new Float32Array(count * 3),
    colors = new Float32Array(count * 3),
    speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const z = seeded(i, 3) * 2 - 1,
      angle = seeded(i, 8) * TAU,
      r = Math.sqrt(1 - z * z);
    base.set([r * Math.cos(angle), z, r * Math.sin(angle)], i * 3);
    speeds[i] = 0.6 + seeded(i, 14) * 0.55;
    const c = new THREE.Color().setHSL(
      0.03 + (0.5 + 0.5 * Math.sin(angle * 2 + z * 4)) * 0.6,
      0.7,
      0.5 + seeded(i, 38) * 0.18
    );
    colors.set([c.r * 1.35, c.g * 1.35, c.b * 1.35], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const debris = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.25,
      map: texture,
      transparent: true,
      opacity: 0.75,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  debris.frustumCulled = false;
  group.add(debris);
  // Coherent wisps give the expanding remnant readable structure even in the
  // small viewport. Their colours and folds illustrate ejecta, not measured
  // emission lines or a hydrodynamic solution.
  const threadPositions = [],
    threadColors = [];
  for (let k = 0; k < 22; k++) {
    const latitude = (seeded(k, 91) - 0.5) * 2.4;
    const longitude = seeded(k, 93) * TAU;
    const tint = new THREE.Color(['#e5a481', '#8cc9ed', '#ba9ade'][k % 3]);
    let previous;
    for (let i = 0; i <= 70; i++) {
      const t = i / 70;
      const a = longitude + (t - 0.5) * 1.1;
      const b = latitude + Math.sin(t * 6 + k) * 0.09;
      const radius = 0.85 + 0.08 * Math.sin(t * 14 + k) + 0.035 * Math.sin(t * 41);
      const point = [
        radius * Math.cos(b) * Math.cos(a),
        radius * Math.sin(b) * 0.85,
        radius * Math.cos(b) * Math.sin(a),
      ];
      if (previous) {
        threadPositions.push(...previous, ...point);
        threadColors.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
      }
      previous = point;
    }
  }
  const threadGeometry = new THREE.BufferGeometry();
  threadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(threadPositions, 3));
  threadGeometry.setAttribute('color', new THREE.Float32BufferAttribute(threadColors, 3));
  const filaments = new THREE.LineSegments(
    threadGeometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  group.add(filaments);
  return {
    group,
    update(phase) {
      const collapse = smooth(0.18, 0.33, phase),
        blast = smooth(0.3, 0.67, phase),
        old = smooth(0.65, 1, phase);
      const expansion = 0.4 + blast * 3.4 + old * 1.8;
      star.scale.setScalar(Math.max(0.025, 1 - collapse * 0.94));
      star.visible = phase < 0.37;
      star.material.uniforms.phase.value = phase * 8;
      core.visible = phase > 0.32;
      core.material.uniforms.phase.value = phase * 4;
      halo.scale.setScalar(mix(9, 3, collapse) + Math.sin(Math.PI * blast) * 7);
      halo.material.opacity = phase < 0.33 ? 0.35 : 0.12 + Math.sin(Math.PI * blast) * 0.55;
      halo.material.color.set(phase < 0.3 ? '#ed6c30' : '#90c9ff');
      shock.visible = phase > 0.31;
      shock.scale.setScalar(expansion);
      shock.material.uniforms.opacity.value = 0.36 * (1 - old * 0.45);
      filaments.visible = phase > 0.37;
      filaments.scale.setScalar(expansion);
      filaments.material.opacity = 0.5 * smooth(0.37, 0.7, phase);
      debris.visible = phase > 0.32;
      debris.material.opacity = 0.8 * smooth(0.31, 0.43, phase) * (1 - old * 0.25);
      for (let i = 0; i < count; i++) {
        const r = expansion * speeds[i];
        positions[i * 3] = base[i * 3] * r;
        positions[i * 3 + 1] = base[i * 3 + 1] * r * (0.8 + 0.2 * Math.sin(i * 0.7));
        positions[i * 3 + 2] = base[i * 3 + 2] * r;
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}
function meteorScene(texture) {
  const group = new THREE.Group();
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(24, 96, 64),
    new THREE.ShaderMaterial({
      vertexShader: globeVertex,
      fragmentShader: `${noiseGLSL}
varying vec3 localPosition,normalView,eye;void main(){vec3 p=normalize(localPosition);float n=fbm(p*5.);float land=smoothstep(.53,.58,n);vec3 c=mix(vec3(.012,.055,.10),vec3(.045,.12,.105),land);float cloud=smoothstep(.62,.77,fbm(p*13.+vec3(2.)));c=mix(c,vec3(.35,.48,.55),cloud*.5);float light=.35+.65*max(0.,dot(p,normalize(vec3(-.5,1.,.5))));gl_FragColor=vec4(c*light,1.);
#include <colorspace_fragment>
}`,
    })
  );
  earth.position.y = -24.35;
  group.add(earth);
  // Atmospheric thickness is deliberately exaggerated alongside the local
  // Earth curvature: the complete luminous segment belongs to this blue air
  // envelope rather than becoming a meteor drawn in interstellar space.
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(27.8, 72, 48),
    new THREE.ShaderMaterial({
      vertexShader: globeVertex,
      fragmentShader: `varying vec3 normalView,eye;void main(){float edge=pow(1.-abs(dot(normalView,eye)),1.7);gl_FragColor=vec4(.09,.34,.62,.025+.21*edge);
#include <colorspace_fragment>
}`,
      transparent: true,
      depthWrite: false,
    })
  );
  atmosphere.position.copy(earth.position);
  group.add(atmosphere);
  for (const radius of [24.9, 26.2, 27.8]) {
    const arc = Array.from({ length: 81 }, (_, i) => {
      const a = (i / 80 - 0.5) * 0.65;
      return new THREE.Vector3(radius * Math.sin(a), radius * Math.cos(a) - 24.35, -0.2);
    });
    group.add(line(arc, '#3f8cbd', 0.14));
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 12), material('#fff8df'));
  head.add(glow(texture, '#a2e1ff', 1.15, 0.8));
  group.add(head);
  const segments = 76,
    trailPositions = new Float32Array((segments + 1) * 3),
    trailColors = new Float32Array((segments + 1) * 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  trail.frustumCulled = false;
  group.add(trail);
  const particles = new THREE.Points(
    trailGeometry,
    new THREE.PointsMaterial({
      map: texture,
      size: 0.24,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  particles.frustumCulled = false;
  group.add(particles);
  return {
    group,
    update(phase, params) {
      const state = meteorState(phase, params),
        span = 2.5 / Math.tan(THREE.MathUtils.degToRad(params.meteorAngle));
      const point = (p) => new THREE.Vector3((p - 0.5) * span, 2.8 - p * 2.5, 0);
      head.position.copy(point(phase));
      head.visible = phase > 0.015 && phase < 0.99;
      head.children[0].material.opacity = 0.25 + state.brightness * 0.65;
      // The luminous wake is lengthened for legibility in a small teaching
      // viewport; physical entry angle, altitude and elapsed-time readouts
      // remain those of meteorState, not a fitted persistence model.
      const length = 0.22 + (params.meteorSpeed / 72) * 0.32;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments,
          p = Math.max(0, phase - length * (1 - t)),
          position = point(p);
        position.z += Math.sin(i * 1.7) * 0.04 * (1 - t);
        trailPositions.set(position.toArray(), i * 3);
        const strength = Math.pow(t, 1.3) * state.brightness;
        trailColors.set([strength * 0.7, strength * 0.85, strength], i * 3);
      }
      trailGeometry.attributes.position.needsUpdate = true;
      trailGeometry.attributes.color.needsUpdate = true;
    },
  };
}
function starfield(texture) {
  const positions = [],
    colors = [];
  for (let i = 0; i < 1300; i++) {
    const z = seeded(i, 84) * 2 - 1,
      phi = seeded(i, 65) * TAU,
      r = 30 + seeded(i, 36) * 20,
      s = Math.sqrt(1 - z * z);
    positions.push(r * s * Math.cos(phi), r * z, r * s * Math.sin(phi));
    const brightness = 0.2 + seeded(i, 55) * 0.65;
    colors.push(brightness * 0.85, brightness * 0.91, brightness);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.1,
      map: texture,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
}

export function createCosmicRenderer(canvas, { onInvalidate = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#02050c');
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100),
    controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.minDistance = 5;
  controls.maxDistance = 26;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.6;
  const texture = glowTexture();
  scene.add(starfield(texture));
  const views = new Map(),
    factories = {
      blackhole: () => blackHoleScene(texture),
      neutron: () => neutronScene(texture),
      pulsar: () => neutronScene(texture, true),
      supernova: () => supernovaScene(texture),
      meteor: () => meteorScene(texture),
    };
  let current = null,
    disposed = false,
    rendering = false,
    internalUpdate = false,
    lastInclination = null,
    lastWidth = 0,
    lastHeight = 0;
  const invalidated = () => {
    if (!disposed && !rendering && !internalUpdate) onInvalidate();
  };
  controls.addEventListener('change', invalidated);
  const resize = new ResizeObserver(invalidated);
  resize.observe(canvas);
  function updateControls() {
    internalUpdate = true;
    try {
      controls.update();
    } finally {
      internalUpdate = false;
    }
  }
  function resetView() {
    const positions = {
      blackhole: [9, 3.8, 10],
      neutron: [7, 4, 10],
      pulsar: [8, 5, 13],
      supernova: [8, 3, 11],
      meteor: [5, 3.7, 12],
    };
    camera.position.fromArray(positions[current] || positions.blackhole);
    controls.target.set(0, current === 'meteor' ? -0.2 : 0, 0);
    updateControls();
    lastInclination = null;
    invalidated();
  }
  function render({ topic = 'blackhole', phase = 0, params = {} } = {}) {
    if (disposed || rendering) return;
    rendering = true;
    try {
      const id = Object.hasOwn(factories, topic) ? topic : 'blackhole',
        p = normalizeCosmicParams(params);
      if (current !== id) {
        for (const view of views.values()) view.group.visible = false;
        if (!views.has(id)) {
          const view = factories[id]();
          views.set(id, view);
          scene.add(view.group);
        }
        current = id;
        controls.minDistance = id === 'meteor' ? 9 : 5;
        controls.maxPolarAngle = id === 'meteor' ? Math.PI * 0.49 : Math.PI;
        views.get(id).group.visible = true;
        resetView();
      }
      const width = Math.max(1, canvas.clientWidth),
        height = Math.max(1, canvas.clientHeight);
      if (lastWidth !== width || lastHeight !== height) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        lastWidth = width;
        lastHeight = height;
      }
      if (id === 'blackhole' && lastInclination !== p.bhInclination) {
        const radius = camera.position.distanceTo(controls.target),
          azimuth = Math.atan2(camera.position.x, camera.position.z),
          theta = THREE.MathUtils.degToRad(p.bhInclination);
        camera.position.set(
          radius * Math.sin(theta) * Math.sin(azimuth),
          radius * Math.cos(theta),
          radius * Math.sin(theta) * Math.cos(azimuth)
        );
        updateControls();
        lastInclination = p.bhInclination;
      }
      views.get(id).update(cosmicPhase(phase), p, camera);
      renderer.render(scene, camera);
    } finally {
      rendering = false;
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    resize.disconnect();
    controls.removeEventListener('change', invalidated);
    controls.dispose();
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set([texture]);
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const m of Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : []) {
        materials.add(m);
        if (m.map) textures.add(m.map);
      }
    });
    geometries.forEach((x) => x.dispose());
    materials.forEach((x) => x.dispose());
    textures.forEach((x) => x.dispose());
    scene.clear();
    views.clear();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return {
    render,
    resetView,
    dispose,
    stats: () => ({
      drawCalls: renderer.info.render.calls,
      points: renderer.info.render.points,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      topics: views.size,
    }),
  };
}
