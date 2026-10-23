// Cloud masks are scalar data, never sRGB colour. Legacy JPEG snapshots use red;
// Live Cloud Maps PNGs store the unblurred mask in alpha (their RGB is shaded).
export const CLOUD_PNG='https://clouds.matteason.co.uk/images/8192x4096/clouds-alpha.png';
export const CLOUD_JPEG='https://clouds.matteason.co.uk/images/8192x4096/clouds.jpg';
export function cloudChannel(record){return record.channel==='alpha'||record.source===CLOUD_PNG?'alpha':'red';}
export function cloudDecodeSize(width,height,tier,maxSize){
 if(width<1024||width>8192||width!==height*2)throw Error('云图尺寸无效');
 const cap=tier==='high'?8192:tier==='standard'?4096:tier==='simple'?1024:2048;
 const w=Math.min(width,cap,maxSize);return {width:w,height:w/2};
}

// This provider exports display-enhanced IR/dust/visible intensity, not physical
// cloud opacity. Counter its gamma-2 display lift, then softly suppress the weak floor.
// This is a conservative display approximation, NOT a retrieved clear-sky mask:
// the visible branch has another gamma and the merged channels are irreversible.
// Keep this display transfer provider-specific; archived source pixels stay intact.
export function cloudTone(record){return record&&record.provider!=='satcorps'&&(record.provider==='github'||record.source===CLOUD_PNG||record.source===CLOUD_JPEG)?1:0;}
export function githubCloudOpacity(value){const v=Math.max(0,Math.min(1,value))**2,t=Math.max(0,Math.min(1,(v-.01)/.07));return v*t*t*(3-2*t);}
export const cloudToneGLSL=`uniform float cloudTone;
float cloudOpacity(float value){float v=clamp(value,0.,1.);v*=v;return mix(value,v*smoothstep(.01,.08,v),cloudTone);}`;
