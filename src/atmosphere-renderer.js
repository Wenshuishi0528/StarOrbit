import * as THREE from 'three';
// One viewport-sized HDR buffer, allocated only in the highest quality tier.
export class AtmosphereRenderer{
 constructor(renderer){
  this.renderer=renderer;this.size=new THREE.Vector2();this.camera=new THREE.Camera();this.scene=new THREE.Scene();
  this.material=new THREE.ShaderMaterial({uniforms:{frame:{value:null},sunGlow:{value:new THREE.Vector3()},sunPosition:{value:new THREE.Vector2(.5,.5)},sunRadius:{value:.005},sunOcclusionProbe:{value:1},aspect:{value:1}},depthTest:false,depthWrite:false,vertexShader:'varying vec2 uvFrame;void main(){uvFrame=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D frame;uniform vec3 sunGlow;uniform vec2 sunPosition;uniform float sunRadius,aspect,sunOcclusionProbe;varying vec2 uvFrame;void main(){gl_FragColor=texture2D(frame,uvFrame);vec2 p=(uvFrame-sunPosition)*vec2(aspect,1.)/max(sunRadius,.00001);float r=length(p);float halo=.055*exp(-r*r/12.)+.005/(1.+pow(r/4.,4.));float rays=.006*(exp(-p.x*p.x*22.-p.y*p.y/100.)+exp(-p.y*p.y*22.-p.x*p.x/100.));float taper=1.-smoothstep(14.,22.,r);float sourceVisibility=1.;\nif(sunOcclusionProbe>0.&&r<22.&&dot(sunGlow,vec3(1.))>0.){\n vec3 source=texture2D(frame,sunPosition).rgb;\n for(int i=0;i<8;i++){float a=float(i)*.7853981634;source+=texture2D(frame,sunPosition+vec2(cos(a)/aspect,sin(a))*sunRadius*.65).rgb;}\n float observed=dot(source/9.,vec3(.2126,.7152,.0722));\n float expected=dot(sunGlow,vec3(.2126,.7152,.0722))*.8;\n sourceVisibility=clamp(observed/max(expected,.000001),0.,1.);\n sourceVisibility*=smoothstep(.01,.06,sourceVisibility);sourceVisibility=mix(1.,sourceVisibility,sunOcclusionProbe);\n}\ngl_FragColor.rgb+=sunGlow*(halo+rays)*taper*sourceVisibility;\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\nfloat grain=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;gl_FragColor.rgb+=grain/255.;}'});
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
