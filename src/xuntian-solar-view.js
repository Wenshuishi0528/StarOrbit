import * as THREE from 'three';
import {
  cameraComponents,
  createSolarDiscUniforms,
  updateSolarDisc,
  createSolarDiscMaps,
  solarDiscVertex,
  solarDiscGLSL,
} from './solar-disc.js';
import { solarApparent } from './solar-system.js';
import { earthHit } from './xuntian-view-shaders.js';
import { xuntianStarPSF } from './xuntian-view-sky.js';
import { createSolarObservationView } from './solar-observation-view.js';
import { solarImageFootprint, solarImageOccluders } from './solar-observation-math.js';

const fragment = `precision highp float;varying vec2 film;
uniform vec2 lens,screen,centre;uniform mat3 cameraToFixed;uniform vec3 fixedEye;
uniform float discPixels,sigma,flux;
${solarDiscGLSL}
${earthHit}
void main(){
 vec3 ray=normalize(vec3(film*lens,1.));
 if(groundDistance(fixedEye,cameraToFixed*ray)>=0.)discard;
 vec4 disc=solarDisc(ray,.012);
 vec3 light=disc.rgb;float cover=disc.a;
 // Move continuously between an unresolved detector spot and the actual disc.
 float resolved=smoothstep(.40,1.55,discPixels/sigma);
 vec2 delta=(film-centre)*.5*screen;
 float spot=flux*exp(-dot(delta,delta)/(2.*sigma*sigma))/(6.2831853*sigma*sigma);
 vec3 signal=mix(tint*spot,light,resolved);
 if(max(max(signal.r,signal.g),signal.b)<.000002&&cover*resolved<.001)discard;
 gl_FragColor=vec4(signal,cover*resolved);
}`;

export function createSolarView(env, geometry, shared) {
  const observations = createSolarObservationView(geometry, shared);
  const uniforms = {
    ...shared,
    ...createSolarDiscUniforms(),
    discPixels: { value: 0 },
    sigma: { value: 1 },
    flux: { value: 0 },
  };
  // Celestial opacity hides more distant stars/bodies; the alpha channel
  // itself belongs to station coverage and is preserved for the Earth pass.
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: solarDiscVertex,
    fragmentShader: fragment,
    toneMapped: false,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const textures = createSolarDiscMaps(env);
  function visible(frame, size) {
    const tangent = Math.tan((frame.fovY * Math.PI) / 360),
      scale = size.h / (2 * tangent);
    const halfAngle = Math.atan(tangent * Math.hypot(size.aspect, 1)),
      rows = [];
    for (const body of solarApparent(frame.q, frame.eyeKm)) {
      const d = cameraComponents(body.direction, frame.axes),
        ringScale =
          body.id === 'Saturn'
            ? 2.27
            : body.id === 'Sun' && frame.solarObservation
              ? (solarImageFootprint(body, frame.solarObservation) || body.radiusRad) /
                body.radiusRad
              : 1;
      if (
        d[2] <= 0 ||
        Math.acos(THREE.MathUtils.clamp(d[2], -1, 1)) >
          halfAngle + body.radiusRad * ringScale + 12 / scale
      )
        continue;
      const px = (scale * Math.tan(body.radiusRad)) / d[2];
      const centre = [d[0] / (d[2] * tangent * size.aspect), d[1] / (d[2] * tangent)];
      rows.push({ body, d, px, centre });
    }
    return rows.sort((a, b) => b.body.distanceKm - a.body.distanceKm);
  }
  return {
    key: () =>
      textures.revision + ':' + (env.moon?.texture?.id ?? '') + ':' + observations.revision,
    preparePhoto(frame, size) {
      // The shutter samples the live pointing after asynchronous terrain loading.
      // Prepare its frozen observation even if the Sun starts outside the field,
      // so moving onto the Sun cannot silently photograph the procedural fallback.
      const ready = frame.solarObservation ? [observations.prepare(frame.solarObservation)] : [];
      return Promise.all([
        ...ready,
        ...visible(frame, size).flatMap(({ body, px }) =>
          body.id === 'Sun' && frame.solarObservation
            ? []
            : textures.maps(body, px).map((entry) => entry?.ready)
        ),
      ]);
    },
    draw(renderer, camera, frame, size, optics) {
      const { w, h } = size,
        psf = xuntianStarPSF(optics, h);
      for (const { body, d, px, centre } of visible(frame, size)) {
        const saturn = body.id === 'Saturn',
          sun = body.id === 'Sun';
        // Observations are drawn once after the detector transfer, on every GPU.
        // Never put the procedural white Sun behind a pending real observation.
        if (sun && frame.solarObservation) continue;
        const radius = Math.sin(body.radiusRad);
        // Saturated, very bright sources remain compact in a wide field. Their
        // visible halo grows gradually rather than scaling diameter by flux.
        const flux = 2.2 * Math.log1p(10 ** (-0.4 * (body.mag - 7)));
        const sigma = Math.hypot(psf.core, Math.min(1.25, Math.max(0, (3 - body.mag) * 0.1)));
        const span =
          (px * (saturn ? 2.27 : 1)) / Math.max(0.015, d[2] - radius * 2.3) + sigma * 6 + 2;
        updateSolarDisc(
          uniforms,
          body,
          frame.axes,
          d,
          centre,
          [(span * 2) / w, (span * 2) / h],
          textures.maps(body, px)
        );
        uniforms.discPixels.value = px;
        uniforms.sigma.value = sigma;
        uniforms.flux.value = flux;
        renderer.render(scene, camera);
      }
    },
    drawObservation(renderer, camera, frame, size, foreground) {
      if (!frame.solarObservation) return null;
      const row = visible(frame, size).find(({ body }) => body.id === 'Sun');
      if (!row) return null;
      const occluders = solarImageOccluders(row.body, solarApparent(frame.q, frame.eyeKm));
      return observations.draw(
        renderer,
        camera,
        frame,
        size,
        row.body,
        row.centre,
        row.px,
        foreground,
        occluders
      )
        ? frame.solarObservation
        : null;
    },
    dispose() {
      observations.dispose();
      material.dispose();
      textures.dispose();
    },
  };
}
