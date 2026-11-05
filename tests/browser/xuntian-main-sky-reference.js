import * as THREE from 'three';

// Render the existing environment's star sphere, catalogue and HDR display
// on the same physical pixel grid and J2000 camera as the instrument under test.
export function mainSkyReference(sim,frame,w,h,{pixelRatio=1,stars=true,texture=sim.environment.galaxyTexture}={}){
 const env=sim.environment,r=sim.api.renderer,oldSize=r.getSize(new THREE.Vector2()),ratio=r.getPixelRatio(),auto=r.autoClear;
 const oldCamera=env.starCamera.clone(),u=env.milky.material.uniforms,old={skyMap:u.skyMap.value,textured:u.textured.value,
  milky:env.milky.visible,stars:env.stars.visible,dpr:env.starUniforms.pixelRatio.value,skyGain:u.brightness.value,starGain:env.starUniforms.brightness.value};
 const glow=env.hdr.material.uniforms.sunGlow.value,oldGlow=glow.clone(),camera=env.starCamera;
 try{
  r.setPixelRatio(1);r.setSize(w,h,false);
  camera.position.set(0,0,0);camera.up.fromArray(frame.axes.up);camera.lookAt(new THREE.Vector3().fromArray(frame.axes.forward));
  camera.zoom=1;camera.fov=frame.fovY;camera.aspect=frame.aspect;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  env.starUniforms.pixelRatio.value=pixelRatio;env.stars.visible=stars;env.milky.visible=true;u.textured.value=1;u.skyMap.value=texture;glow.set(0,0,0);
  const linear=env.beginFrame();env.renderBackground(r);if(linear)env.finishFrame();
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(r.domElement,0,0);return canvas;
 }finally{
  u.skyMap.value=old.skyMap;u.textured.value=old.textured;u.brightness.value=old.skyGain;env.starUniforms.brightness.value=old.starGain;
  env.stars.visible=old.stars;env.milky.visible=old.milky;env.starUniforms.pixelRatio.value=old.dpr;
  glow.copy(oldGlow);camera.copy(oldCamera);r.setPixelRatio(ratio);r.setSize(oldSize.x,oldSize.y,false);r.autoClear=auto;
 }
}
export function lowResolutionCube(original){
 const faces=original.image.map(image=>{const c=document.createElement('canvas');c.width=c.height=256;
  const ctx=c.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,256,256);return c;});
 const out=new THREE.CubeTexture(faces);out.colorSpace=original.colorSpace;out.minFilter=original.minFilter;
 out.magFilter=original.magFilter;out.generateMipmaps=true;out.anisotropy=original.anisotropy;out.needsUpdate=true;return out;
}
