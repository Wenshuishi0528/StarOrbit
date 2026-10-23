import * as THREE from 'three';
// One viewport-sized HDR buffer, allocated only in the highest quality tier.
export class AtmosphereRenderer{
 constructor(renderer){
  this.renderer=renderer;this.size=new THREE.Vector2();this.camera=new THREE.Camera();this.scene=new THREE.Scene();
  this.material=new THREE.ShaderMaterial({uniforms:{frame:{value:null},sunGlow:{value:new THREE.Vector3()},sunPosition:{value:new THREE.Vector2(.5,.5)},sunRadius:{value:.005},sunTwilight:{value:0},sunViewRays:{value:new THREE.Matrix3()},sunEarthDisc:{value:new THREE.Vector4(0,0,0,-1)},sunMoonDisc:{value:new THREE.Vector4(0,0,0,-1)},sunOcclusionProbe:{value:1},aspect:{value:1}},depthTest:false,depthWrite:false,vertexShader:'varying vec2 uvFrame;void main(){uvFrame=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`uniform sampler2D frame;uniform vec3 sunGlow;uniform vec2 sunPosition;
uniform float sunRadius,aspect,sunOcclusionProbe,sunTwilight;varying vec2 uvFrame;
uniform mat3 sunViewRays;uniform vec4 sunEarthDisc,sunMoonDisc;
float solarBodyClear(vec3 ray,vec4 body){
 if(body.w<0.)return 1.;
 vec3 separation=ray-body.xyz;float edge=dot(separation,separation)-body.w;
 float aa=max(fwidth(edge),1.e-9);return smoothstep(-aa,aa,edge);
}
float solarLuma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
// The ordinary ACES colour matrices wash saturated solar reds toward yellow.
// Use the same neutral-axis shoulder with preserved RGB ratios only where the
// twilight solar image contributes. This is display mapping, not extra reddening.
vec3 solarDisplay(vec3 color){
 float peak=max(color.r,max(color.g,color.b));
 float x=peak*toneMappingExposure/.6;
 float shoulder=clamp((x*(x+.0245786)-.000090537)/(x*(.983729*x+.432951)+.238081),0.,1.);
 return color*(shoulder/max(peak,.000001));
}
void main(){
 gl_FragColor=texture2D(frame,uvFrame);
 vec2 p=(uvFrame-sunPosition)*vec2(aspect,1.)/max(sunRadius,.00001);float r=length(p);
 float halo=.055*exp(-r*r/12.)+.005/(1.+pow(r/4.,4.));
 float rays=sunTwilight*.006*(exp(-p.x*p.x*22.-p.y*p.y/100.)+exp(-p.y*p.y*22.-p.x*p.x/100.));
 float taper=1.-smoothstep(14.,22.,r),sourceVisibility=1.;
 if(sunOcclusionProbe>0.&&r<22.&&solarLuma(sunGlow)>0.){
  vec3 source=texture2D(frame,sunPosition).rgb;
  for(int i=0;i<8;i++){float a=float(i)*.7853981634;source+=texture2D(frame,sunPosition+vec2(cos(a)/aspect,sin(a))*sunRadius*.65).rgb;}
  float observed=solarLuma(source/9.),expected=solarLuma(sunGlow)*.8;
  sourceVisibility=clamp(observed/max(expected,.000001),0.,1.);
  sourceVisibility*=smoothstep(.01,.06,sourceVisibility);
  sourceVisibility=mix(1.,sourceVisibility,sunOcclusionProbe);
 }
 vec3 glare=sunGlow*(halo+rays)*taper*sourceVisibility;
 vec3 ray=normalize(sunViewRays*vec3(uvFrame*2.-1.,1.));
 float disk=(1.-smoothstep(.98,1.15,r))*sourceVisibility*solarBodyClear(ray,sunEarthDisc)*solarBodyClear(ray,sunMoonDisc);
 float glowShare=solarLuma(glare)/max(solarLuma(gl_FragColor.rgb+glare),.000001);
 float solarWeight=sunTwilight*max(disk,glowShare)*smoothstep(0.,.0001,solarLuma(sunGlow));
 gl_FragColor.rgb+=glare;
 vec3 solarColor=vec3(0.);if(solarWeight>0.)solarColor=solarDisplay(gl_FragColor.rgb);
 #include <tonemapping_fragment>
 gl_FragColor.rgb=mix(gl_FragColor.rgb,solarColor,solarWeight);
 #include <colorspace_fragment>
 float grain=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
 gl_FragColor.rgb+=grain/255.;
}`});
  this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));
 }
 begin(){
  const r=this.renderer;if(this.failed||!r.extensions.has('EXT_color_buffer_float'))return false;
  r.getDrawingBufferSize(this.size);const w=Math.max(1,this.size.x),h=Math.max(1,this.size.y);
  this.material.uniforms.aspect.value=w/h;
  const changed=!this.target||this.target.width!==w||this.target.height!==h;
  try{
   if(!this.target){this.target=new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false,samples:0});this.target.texture.colorSpace=THREE.LinearSRGBColorSpace;this.material.uniforms.frame.value=this.target.texture;}
   else if(changed)this.target.setSize(w,h);
   r.setRenderTarget(this.target);
   if(changed){const gl=r.getContext();if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('HDR framebuffer unavailable');}
   return true;
  }catch(error){r.setRenderTarget(null);this.release();this.failed=true;console.warn('Atmosphere HDR fallback:',error.message);return false;}
 }
 finish(){const r=this.renderer;r.setRenderTarget(null);r.autoClear=true;r.render(this.scene,this.camera);}
 release(){this.target?.dispose();this.target=null;this.material.uniforms.frame.value=null;}
 dispose(){this.release();this.scene.children[0].geometry.dispose();this.material.dispose();}
}
