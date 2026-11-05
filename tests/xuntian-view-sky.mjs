import assert from 'node:assert/strict';
import {xuntianSkySource,xuntianStarPSF} from '../src/xuntian-view-sky.js';
import {sensorOptics} from '../src/xuntian-view-math.js';

const settings={exposure:'cinematic',stars:true,milky:true,starBrightness:1};
for(const [level,faceSize] of [[16,4096],[8,2048],[4,1024]]){
 const state=xuntianSkySource({settings,skySize:16,galaxyTexture:{image:[{naturalWidth:faceSize}]}});
 assert.equal(state.status,'panorama');assert.equal(state.faceSize,faceSize);assert.equal(state.level,level);assert.equal(state.sourceWidth,4*faceSize);
}
for(const [flag,status] of [['skyLoading','loading'],['skyFailed','failed'],['skyUnsupported','unsupported']]){
 const state=xuntianSkySource({settings,skySize:16,[flag]:true});assert.equal(state.status,status);assert.equal(state.level,null);
}
assert.equal(xuntianSkySource({settings},{showGalaxy:false}).status,'catalog');
assert.equal(xuntianSkySource({settings},{showStars:false}).status,'off');
assert.equal(xuntianSkySource({settings},{skyExposure:'view'}).gain,1);
const photo=xuntianSkySource({settings},{skyExposure:'photo',skyBrightness:1.4});assert.equal(photo.status,'ordinary');assert.equal(photo.presentation,'photo');assert.equal(photo.gain,1.4*.025);
const wide=sensorOptics(10,600),p300=xuntianStarPSF(wide,300),p1200=xuntianStarPSF(wide,1200);
assert(p1200.core/p300.core<1.01,'an unresolved star does not inflate 4× in pixel width at 4× PNG height');
const resolved=sensorOptics(.35,25),small=xuntianStarPSF(resolved,300),large=xuntianStarPSF(resolved,1200);
assert(large.core>small.core*2&&large.core<small.core*4,'small aperture colour diffraction resolves a physical angle at high output resolution');
assert.equal(xuntianStarPSF(wide,300).signalScale,1);
console.log('Xuntian sky: actual 16K/8K/4K scope resources, ordinary/photographic/hidden fallbacks and output-pixel diffraction passed.');
