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
