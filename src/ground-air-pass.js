import * as THREE from 'three';

// Clouds and scattered light vary much more slowly across a wide field than
// stars or the mountain silhouette. Keep this optical layer separate from both.
export function createGroundAirPass(renderer, terrain) {
  const floatTarget = renderer.extensions.has('EXT_color_buffer_float');
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: floatTarget ? THREE.HalfFloatType : THREE.UnsignedByteType,
    colorSpace: floatTarget ? THREE.NoColorSpace : THREE.SRGBColorSpace,
    depthBuffer: false,
  });
  const scene = new THREE.Scene(),
    lens = new THREE.Camera();
  const size = new THREE.Vector2(),
    origin = new THREE.Vector2();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      air: { value: target.texture },
      terrainMap: terrain.terrainDistance,
      projectTerrain: terrain.terrainUvProjection,
      hasTerrain: terrain.terrainOcclusion,
    },
    vertexShader: 'varying vec2 tex;void main(){tex=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `varying vec2 tex;uniform sampler2D air,terrainMap;uniform mat3 projectTerrain;uniform float hasTerrain;
    bool land(vec2 uv){vec3 ray=projectTerrain*vec3(uv*2.-1.,1.);return any(lessThan(texture2D(terrainMap,.5+.5*ray.xy/ray.z),vec4(1.)));}
    void main(){
      vec4 c;
      if(hasTerrain<.5){c=texture2D(air,tex);}
      else{
        vec2 n=vec2(textureSize(air,0)), base=floor(tex*n-.5)+.5, f=fract(tex*n-.5);
        bool covered=land(tex);
        c=vec4(0.);float total=0.;
        for(int j=0;j<2;j++){for(int i=0;i<2;i++){vec2 at=clamp((base+vec2(i,j))/n,.5/n,1.-.5/n);
          if(land(at)==covered){float w=(i==0?1.-f.x:f.x)*(j==0?1.-f.y:f.y);c+=texture2D(air,at)*w;total+=w;}}}
        if(total<.00001)discard;c/=total;
      }
      if(c.a<.00001)discard;
      gl_FragColor=vec4(c.rgb/c.a,c.a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  return {
    draw(width, height, draw) {
      const scale = Math.min(1, Math.sqrt(230400 / (width * height)));
      if (scale === 1) {
        draw();
        return;
      }
      const previous = renderer.getRenderTarget();
      target.setSize(Math.round(width * scale), Math.round(height * scale));
      size.copy(terrain.terrainViewport.value);
      origin.copy(terrain.terrainViewportOrigin.value);
      try {
        renderer.setRenderTarget(target);
        renderer.setClearColor(0, 0);
        renderer.clear();
        terrain.terrainViewport.value.set(target.width, target.height);
        terrain.terrainViewportOrigin.value.set(0, 0);
        draw();
      } finally {
        renderer.setRenderTarget(previous);
        terrain.terrainViewport.value.copy(size);
        terrain.terrainViewportOrigin.value.copy(origin);
      }
      renderer.render(scene, lens);
    },
    dispose() {
      target.dispose();
      quad.geometry.dispose();
      material.dispose();
    },
  };
}
