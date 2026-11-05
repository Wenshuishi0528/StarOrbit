import {createXuntianViewRenderer} from '../../src/xuntian-view-render.js';
import {xuntianSkySource} from '../../src/xuntian-view-sky.js';
import {SURVEY_FIELDS} from '../../src/survey-lab-math.js';
import {fieldRay,galaxyDirection,galaxyCrops,cubeFace,faceUV} from '../../src/survey-sky-product-math.js';
import {unit} from '../../src/orbit.js';
import {mainSkyReference,lowResolutionCube} from './xuntian-main-sky-reference.js';

const size=384,lum=(data,k)=>(data[k]+data[k+1]+data[k+2])/3;
const identity=[[1,0,0],[0,1,0],[0,0,1]];
const assert=(test,msg)=>{if(!test)throw Error(msg);};
async function rgba(blob){
 const image=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
 const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();return ctx.getImageData(0,0,canvas.width,canvas.height).data;
}
function patch(image,part,coarse){
 const width=coarse?256:image.naturalWidth,scale=width/image.naturalWidth;
 const left=Math.max(0,Math.floor(part.minX*width)-3),top=Math.max(0,Math.floor(part.minY*width)-3);
 const c=document.createElement('canvas');c.width=Math.min(width,Math.ceil(part.maxX*width)+3)-left;c.height=Math.min(width,Math.ceil(part.maxY*width)+3)-top;
 const ctx=c.getContext('2d');ctx.imageSmoothingQuality='high';
 ctx.drawImage(image,left/scale,top/scale,c.width/scale,c.height/scale,0,0,c.width,c.height);
 return {width,left,top,pixels:ctx.getImageData(0,0,c.width,c.height)};
}
function level(p,uv){
 const x=Math.max(0,Math.min(p.pixels.width-1,uv[0]*p.width-.5-p.left)),y=Math.max(0,Math.min(p.pixels.height-1,uv[1]*p.width-.5-p.top));
 const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,k=(j*p.pixels.width+i)*4,dx=i+1<p.pixels.width?4:0,dy=j+1<p.pixels.height?p.pixels.width*4:0;
 const d=p.pixels.data;return (lum(d,k)*(1-fx)+lum(d,k+dx)*fx)*(1-fy)+(lum(d,k+dy)*(1-fx)+lum(d,k+dy+dx)*fx)*fy;
}

// The CPU reference reads the exact resident JPEG faces used by the main sky.
// Directions come from the independent survey TAN/cube implementation. The
// stars-only shot masks foreground points; it is never substituted for a map.
export async function checkXuntianSkyDetail(sim){
 const env=sim.environment,canvas=document.createElement('canvas');canvas.style.cssText='width:384px;height:384px;position:absolute;left:-9999px';
 document.body.append(canvas);const view=createXuntianViewRenderer(sim,canvas);
 const lab=sim.flightLab,previous={stars:env.settings.stars,milky:env.settings.milky,exposure:env.settings.exposure,starBrightness:env.settings.starBrightness};
 try{
  lab.open('pass');await env.skyLoad;
  if(!env.galaxyTexture){Object.assign(env.settings,{stars:true,milky:true,exposure:'cinematic'});await env.setSkyStyle();}
  env.settings.starBrightness=1;
  const source=xuntianSkySource(env);assert(source.status==='panorama',JSON.stringify(source));
  const texture=env.galaxyTexture,field=SURVEY_FIELDS.find(f=>f.id==='cygnus');
  const frame={q:{basis:identity,earthAxes:identity,sun:[149597870.7,0,0]},axes:{right:field.east.map(x=>-x),up:field.north,forward:field.center},
   eyeKm:field.center.map(x=>x*6776),eyeLocal:[300,-200,120],aspect:1,fovY:6,apertureMm:600,exposure:1,showGalaxy:true,showStars:true,skyExposure:'cinematic',skyBrightness:1,showStation:false};
  const shot=(changes={},width=size)=>view.capture({...frame,...changes},{width});
  const map=await shot(),observed=await rgba(map),stars=await rgba(await shot({showGalaxy:false}));
  const names=galaxyCrops(field),reference=new Map();
  for(const face of names)reference.set(face.face,[patch(texture.image[face.face],face,false),patch(texture.image[face.face],face,true)]);
  const hdr=env.quality==='high'&&sim.api.renderer.extensions.has('EXT_color_buffer_float')&&!env.hdr.failed;
  // The high-quality main camera sends both the original and the synthetic
  // low-resolution reference through its real HDR curve, including dark dust.
  let mainNative,mainReduced;
  if(hdr){
   const low=lowResolutionCube(texture),readRef=texture=>mainSkyReference(sim,frame,size,size,{stars:false,texture}).getContext('2d').getImageData(0,0,size,size).data;
   try{mainNative=readRef(texture);mainReduced=readRef(low);}finally{low.dispose();}
  }
  let nativeError=0,reducedError=0,sourceLight=0,resultLight=0,n=0;
  for(let y=2;y<size-2;y+=2)for(let x=2;x<size-2;x+=2){
   const k=(y*size+x)*4;if(Math.max(stars[k],stars[k+1],stars[k+2])>4)continue;
   const g=galaxyDirection(fieldRay(field,(x+.5)/size,(y+.5)/size)),face=cubeFace(...g),uv=faceUV(g,face);
   const p=reference.get(face),wanted=hdr?lum(mainNative,k):level(p[0],uv),blurred=hdr?lum(mainReduced,k):level(p[1],uv),actual=lum(observed,k);
   nativeError+=Math.abs(actual-wanted);reducedError+=Math.abs(actual-blurred);sourceLight+=wanted;resultLight+=actual;n++;
  }
  nativeError/=n;reducedError/=n;sourceLight/=n;resultLight/=n;
  assert(n>size*size/8&&nativeError<4&&nativeError<reducedError*.55,`Map reference mismatch: ${JSON.stringify({n,nativeError,reducedError,sourceLight,resultLight})}`);
  assert(Math.abs(resultLight-sourceLight)<2,'Reference exposure no longer resembles the selected Milky Way');
  const ordinary=await rgba(await shot({skyExposure:'view'})),photo=await rgba(await shot({skyExposure:'photo'})),off=await rgba(await shot({showStars:false}));
  let ordinarySum=0,photoSum=0,offMax=0;
  for(let k=0;k<off.length;k+=4){ordinarySum+=lum(ordinary,k);photoSum+=lum(photo,k);offMax=Math.max(offMax,lum(off,k));}
  assert(ordinarySum>photoSum*2.5&&offMax<2,'Ordinary / photographic / stars disabled modes did not follow the main controls');
  // At this FOV the source is oversampled. Compare a physical bright star
  // centred on the detector at preview and photo sizes where the PSF is unresolved.
  const sirius=unit([-.1874562,.9392174,-.2876294]),right=unit([sirius[1],-sirius[0],0]),up=unit([right[1]*sirius[2],-right[0]*sirius[2],right[0]*sirius[1]-right[1]*sirius[0]]);
  const starFrame={axes:{right,up,forward:sirius},eyeKm:sirius.map(x=>x*6776),showGalaxy:false,fovY:9,apertureMm:140};
  function brightArea(data,w){
   let count=0,max=0;for(let y=w/2-24;y<w/2+24;y++)for(let x=w/2-24;x<w/2+24;x++){const v=lum(data,(y*w+x)*4);if(v>24)count++;max=Math.max(max,v);}
   return {count,max};
  }
  const coarse=brightArea(await rgba(await shot(starFrame,256)),256),fine=brightArea(await rgba(await shot(starFrame,1024)),1024);
  assert(coarse.max>120&&fine.max>120&&fine.count<coarse.count*1.6+2,'Unresolved stars inflated when exporting more pixels: '+JSON.stringify({coarse,fine}));
  assert(env.galaxyTexture===texture&&source.level===xuntianSkySource(env).level,'Scope replaced the shared sky texture');
  return {status:source.status,level:source.level,faceSize:source.faceSize,compared:n,nativeError,reducedError,sourceLight,resultLight,offMax,coarse,fine,photo:map};
 }finally{
  Object.assign(env.settings,previous);if(previous.exposure!=='cinematic'||!previous.milky||!previous.stars)await env.setSkyStyle();
  view.dispose();canvas.remove();if(lab.active)lab.close();
 }
}
