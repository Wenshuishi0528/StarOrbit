// Fixed views with raw texture, direct surface and complete atmosphere.
async page=>{
 await page.reload();
 await page.waitForFunction(()=>window.viewer?.sim.initialized&&!viewer.sim.environment.loading);
 await page.setViewportSize({width:1400,height:900});
 await page.evaluate(async()=>{
  const s=viewer.sim,e=s.environment;viewer.music.pause();document.getElementById('welcomeDialog')?.close();
  await e.setQuality('high','2024-1km','2026-q2-1km');
  e.settings.clouds=false;e.settings.stars=false;e.settings.milky=false;e.settings.geographyEnabled=false;e.settings.groundTrack=false;
  e._lit=e.earth.material;e._raw=e._lit.clone();e._raw.uniforms=e._lit.uniforms;
  const head=e._lit.fragmentShader.split('void main(){vec3 n=normalize(worldN)')[0];
  e._raw.fragmentShader=head+'void main(){gl_FragColor=vec4(groundColor(mapUV(localN)),1.);if(linearOutput<.5){\n#include <colorspace_fragment>\n}}';e._raw.needsUpdate=true;
  e._post=e.hdr.material;e._rawPost=e._post.clone();e._rawPost.uniforms=e._post.uniforms;e._rawPost.fragmentShader='varying vec2 uvFrame;uniform sampler2D frame;void main(){gl_FragColor=texture2D(frame,uvFrame);\n#include <colorspace_fragment>\n}';e._rawPost.toneMapped=false;const begin=e.beginFrame.bind(e);e.beginFrame=()=>{const v=begin(),full=e._mode==='full';e.atmosphere.visible=full;e.atmosphereTransmission.visible=v&&full;e.earth.material=e._mode==='raw'?e._raw:e._lit;e.hdr.material=e._mode==='raw'?e._rawPost:e._post;e.hdr.scene.children[0].material=e.hdr.material;return v;};
 });
 for(const region of [{name:'america',lon:-90,lat:15,time:'18:00',radius:24000},{name:'china',lon:107,lat:27,time:'04:52',radius:8500},
 {name:'africa',lon:10,lat:15,time:'11:20',radius:24000,modes:['full']},
 {name:'asia',lon:120,lat:25,time:'04:00',radius:24000,modes:['full']},
 {name:'east-sea',lon:125,lat:33,time:'04:00',radius:8500,modes:['full']},
 {name:'arctic',lon:10,lat:80,time:'11:20',radius:17000,modes:['full']},
 {name:'date-line',lon:180,lat:0,time:'00:00',radius:16000,modes:['full']},
 {name:'america-2004',lon:-90,lat:15,time:'18:00',radius:24000,source:'2004',modes:['full']},
 {name:'china-2004',lon:107,lat:27,time:'04:52',radius:8500,source:'2004',modes:['full']},
 {name:'asia-standard',lon:120,lat:25,time:'04:00',radius:24000,quality:'standard',modes:['full']}]){
  await page.evaluate(async r=>{const s=viewer.sim,e=s.environment;await e.setQuality(r.quality||'high','2024-1km',r.source||'2026-q2-1km');s.seek(Date.parse('2026-06-15T'+r.time+':00Z'));s.setView('orbit');s.orbitControls.enableDamping=false;s.update(performance.now());s.orbitControls.target.set(0,0,0);const lat=r.lat*Math.PI/180,lon=r.lon*Math.PI/180;s.spaceCamera.position.set(Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)).applyQuaternion(e.earth.quaternion).multiplyScalar(r.radius);s.spaceCamera.up.set(0,0,1).applyQuaternion(e.earth.quaternion);s.orbitControls.update();},region);
  for(const mode of region.modes||['raw','surface','full']){
   await page.evaluate(mode=>{viewer.sim.environment._mode=mode;viewer.sim.render();},mode);
   await page.waitForFunction(()=>{const d=viewer.sim.environment.detail;return d.wanted.every(c=>d.slots.some(s=>s.key===c.key&&s.texture&&performance.now()-s.born>800));});
   await page.screenshot({path:'output/playwright/earth-083/after-'+region.name+'-'+mode+'.png'});
  }
 }
 return await page.evaluate(()=>({gl:viewer.renderer.getContext().getError(),source:viewer.sim.environment.settings.daySource,time:viewer.sim.time,paused:viewer.sim.paused}));
}
