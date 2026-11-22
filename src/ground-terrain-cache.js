import * as THREE from 'three';

const vertex = 'varying vec2 tex; void main(){tex=uv;gl_Position=vec4(position.xy,0.,1.);}';
const lookup = 'vec3 p=projection*vec3(tex*2.-1.,1.);vec2 uv=.5+.5*p.xy/p.z;';
export function createGroundTerrainCache(renderer) {
  const camera = new THREE.PerspectiveCamera(),
    rotation = new THREE.Quaternion(),
    delta = new THREE.Quaternion(),
    matrix = new THREE.Matrix4(),
    projection = new THREE.Matrix3(),
    rayScale = new THREE.Matrix3(),
    outputScale = new THREE.Matrix3();
  const screen = new THREE.Scene(),
    screenCamera = new THREE.Camera();
  const uniforms = {
    projection: { value: projection },
    colour: { value: null },
    distanceMap: { value: null },
    tanHalf: { value: new THREE.Vector2() },
    clip: { value: new THREE.Vector2() },
  };
  const display = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    depthFunc: THREE.AlwaysDepth,
    fragmentShader: `#include <packing>
varying vec2 tex;uniform mat3 projection;uniform sampler2D colour,distanceMap;uniform vec2 tanHalf,clip;
void main(){${lookup}
vec4 c=texture2D(colour,uv);if(c.a<.5)discard;
float z=unpackRGBAToDepth(texture2D(distanceMap,uv))*clip.y/length(vec3((tex*2.-1.)*tanHalf,1.));
gl_FragDepth=clamp((clip.y-clip.x*clip.y/max(z,clip.x))/(clip.y-clip.x),0.,1.);
gl_FragColor=vec4(c.rgb,1.);
#include <colorspace_fragment>
}`,
  });
  // One GPU read per sampled landscape. Pack 32 full-resolution occupancy
  // pixels into RGBA8; every label and the crosshair then use the same mask.
  const pack = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    depthTest: false,
    depthWrite: false,
    fragmentShader: `precision highp int;uniform sampler2D distanceMap;
void main(){ivec2 origin=ivec2(gl_FragCoord.xy)*ivec2(8,4); ivec2 lim=textureSize(distanceMap,0)-1;
vec4 bits=vec4(0.);for(int y=0;y<4;++y)for(int x=0;x<8;++x){
vec4 d=texelFetch(distanceMap,min(lim,origin+ivec2(x,y)),0);
if(any(lessThan(d,vec4(1.))))bits[y]+=float(1<<x);}
gl_FragColor=bits/255.;}`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), display);
  quad.frustumCulled = false;
  screen.add(quad);
  const options = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  let generation = 0,
    pending = false,
    asyncFailed = false;
  let distance,
    colour,
    packed,
    bytes,
    validMask = false,
    key,
    tx = 1,
    ty = 1,
    captureTanY,
    viewWidth,
    viewHeight;
  function updateProjection(local, x, y) {
    delta.copy(rotation).invert().multiply(local);
    projection.setFromMatrix4(matrix.makeRotationFromQuaternion(delta));
    projection
      .multiply(rayScale.set(x, 0, 0, 0, y, 0, 0, 0, -1))
      .premultiply(outputScale.set(1 / tx, 0, 0, 0, 1 / ty, 0, 0, 0, -1));
  }
  function covers() {
    const e = projection.elements;
    for (const x of [-1, 1])
      for (const y of [-1, 1]) {
        const z = e[2] * x + e[5] * y + e[8];
        if (
          z <= 0 ||
          Math.abs(e[0] * x + e[3] * y + e[6]) > z * (1 + 1e-12) ||
          Math.abs(e[1] * x + e[4] * y + e[7]) > z * (1 + 1e-12)
        )
          return false;
      }
    return true;
  }
  return {
    projection,
    get maskRevision() {
      return generation * 2 + Number(validMask);
    },
    get distance() {
      return distance?.texture;
    },
    paint(host, local, stamp, width, height, draw) {
      const y = Math.tan((host.fov * Math.PI) / 360),
        x = y * host.aspect;
      updateProjection(local, x, y);
      if (
        stamp !== key ||
        width !== viewWidth ||
        height !== viewHeight ||
        !covers() ||
        y < captureTanY / 1.18
      ) {
        key = undefined;
        validMask = false;
        generation++;
        // Keep a small border of mountains on hand for head turns. Sky and
        // the scope optics always render at their native field and resolution.
        const maxSide = renderer.capabilities.maxTextureSize;
        const longest = Math.max(width, height);
        // A docked eyepiece pans further per pointer pixel than the main
        // finder. Its smaller target can cover a wider angular border.
        const margin = Math.min(longest <= 1024 ? 1.6 : 1.22, maxSide / longest);
        captureTanY = y;
        tx = x * margin;
        ty = y * margin;
        rotation.copy(local);
        viewWidth = width;
        viewHeight = height;
        const w = Math.ceil(width * margin),
          h = Math.ceil(height * margin);
        distance ??= new THREE.WebGLRenderTarget(1, 1, options);
        colour ??= new THREE.WebGLRenderTarget(1, 1, {
          ...options,
          colorSpace: THREE.SRGBColorSpace,
        });
        distance.setSize(w, h);
        colour.setSize(w, h);
        camera.copy(host, false);
        camera.fov = (2 * Math.atan(ty) * 180) / Math.PI;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        draw(camera, distance, colour);
        uniforms.colour.value = colour.texture;
        uniforms.distanceMap.value = distance.texture;
        updateProjection(local, x, y);
        key = stamp;
      }
      uniforms.tanHalf.value.set(x, y);
      uniforms.clip.value.set(host.near, host.far);
      renderer.render(screen, screenCamera);
    },
    blocked(x, y, defer) {
      if (!distance || key === undefined) return false;
      if (!validMask) {
        if (defer && pending) return null;
        const w = Math.ceil(distance.width / 8),
          h = Math.ceil(distance.height / 4),
          previous = renderer.getRenderTarget();
        packed ??= new THREE.WebGLRenderTarget(1, 1, { ...options, depthBuffer: false });
        packed.setSize(w, h);
        if (bytes?.length !== w * h * 4) bytes = new Uint8Array(w * h * 4);
        try {
          quad.material = pack;
          renderer.setRenderTarget(packed);
          renderer.render(screen, screenCamera);
          if (defer && !asyncFailed && renderer.readRenderTargetPixelsAsync) {
            const version = generation;
            pending = true;
            const request = renderer.readRenderTargetPixelsAsync(
              packed,
              0,
              0,
              w,
              h,
              new Uint8Array(bytes.length)
            );
            // Three leaves its pixel-pack buffer bound while awaiting the GPU
            // fence, then rebinds it to collect the result. Synchronous photo
            // and depth reads in either view require a client-memory destination.
            const gl = renderer.getContext();
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
            request
              .then((result) => {
                if (version === generation && result) {
                  bytes = result;
                  validMask = true;
                }
              })
              .catch(() => {
                asyncFailed = true;
              })
              .finally(() => {
                pending = false;
              });
            return null;
          }
          renderer.readRenderTargetPixels(packed, 0, 0, w, h, bytes);
          validMask = true;
        } finally {
          quad.material = display;
          renderer.setRenderTarget(previous);
        }
      }
      const e = projection.elements,
        z = e[2] * x + e[5] * y + e[8];
      const pixel = (a, n) => Math.min(n - 1, Math.max(0, Math.floor(((a / z) * 0.5 + 0.5) * n)));
      const i = pixel(e[0] * x + e[3] * y + e[6], distance.width),
        j = pixel(e[1] * x + e[4] * y + e[7], distance.height);
      return !!(bytes[((j >> 2) * packed.width + (i >> 3)) * 4 + (j % 4)] & (1 << i % 8));
    },
    invalidate() {
      generation++;
      key = undefined;
      validMask = false;
    },
    dispose() {
      generation++;
      for (const item of [distance, colour, packed, display, pack, quad.geometry]) item?.dispose();
      bytes = null;
    },
  };
}
