import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {equatorial} from '../src/environment-math.js';
import {SURVEY_FIELDS} from '../src/survey-lab-math.js';
import {decodeTycho,fieldRay,projectStar} from '../src/survey-sky-product-math.js';
import {tychoCutouts} from '../src/survey-sky-product-tycho.js';
import {DEEP_SKY_OBJECTS} from '../src/deep-sky-catalog.js';

// Use the production JSON import convention so the same bundled stars/chart
// are shared by the main scene and Xuntian. This test writes no build files.
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/xuntian-catalog.js',import.meta.url))],bundle:true,
 platform:'node',format:'esm',write:false,logLevel:'silent'});
const {searchXuntianTargets:search,getXuntianTarget:get,queryXuntianStars:query,collectXuntianStars:collect,pickXuntianStar:pick}=
 await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const json=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const hips=json('../assets/stars.json'),chart=json('../assets/star-chart.json');
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0),rad=Math.PI/180;
const unit=v=>v.map(x=>x/Math.hypot(...v));
const near=(a,b,e=1e-9)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const all=query([1,0,0],180),deep=all.filter(p=>p.source==='tycho');
assert.equal(all.length,57431);assert.equal(all.length-deep.length,41411);assert.equal(deep.length,16020);
assert.equal(new Set(all.map(p=>p.id)).size,all.length);assert(all.every((r,i)=>!i||all[i-1].mag<=r.mag));
const byId=new Map(all.map(p=>[p.id,p]));
for(const [hip,ra,dec,mag] of hips){
 const p=byId.get('hip:'+hip);assert(p&&p.hip===hip&&p.mag===mag&&p.magnitude===mag);
 near(dot(p.direction,equatorial(ra,dec)),1);assert.equal(p.edgeWeight,1);
}
assert(all.every(p=>Number.isFinite(p.mag)&&(p.bv===null||Number.isFinite(p.bv))));
assert.equal(hips.filter(s=>s[4]===''||s[4]===null||!Number.isFinite(Number(s[4]))).length,all.filter(s=>s.source==='hip'&&s.bv===null).length);
for(const [id,queries] of [
 ['hip:91262',['Vega',' véGA ','Véga','Вега','织女','织女一','織女星','α Lyr','alpha Lyrae','天琴座α','HIP 91262','ＨＩＰ　９１２６２','91262']],
 ['hip:11767',['北极星','北極星','勾陈一','north star','Étoile Polaire','Полярная']],
 ['hip:32349',['天狼星','Sirius','Dog Star','α CMa']],['hip:27989',['参宿四','Betelgeuse','Bételgeuse','alpha Orionis']],
 ['hip:97649',['牛郎星','河鼓二','α Aquilae']],['hip:113357',['51 Pegasi']],
 ['constellation:Cyg',['天鹅','天鵝座','Cygnus','Cyg','Cygne','Лебедь','Swan']],
 ['constellation:Ori',['猎户座','獵戶星座','Orion','Ori']],['constellation:Vir',['室女','处女座','處女座','Virgo']],
 ['constellation:Aqr',['水瓶座']],['constellation:Sgr',['射手']],['constellation:Ser',['Serpens','Serpens Cauda','巨蛇座']]
]){
 for(const q of queries)assert.equal(search(q)[0]?.id,id,'Query: '+q);
}
assert.equal(get('HIP:91262','zh').name,'织女星');assert.equal(get('hip:91262','en').name,'Vega');
assert.equal(get('hip:27989','fr').name,'Bételgeuse');assert.equal(get('constellation:Cyg','ru').name,'Лебедь');
for(const object of DEEP_SKY_OBJECTS){
 const id='deep-sky:'+object.id.toLowerCase(),target=get(object.id);
 assert.equal(target.id,id);assert.equal(target.type,'deep-sky');assert.equal(target.objectType,object.type);
 assert(target.fov>0&&target.fov<=80);near(dot(target.direction,object.direction),1);
 assert.equal(get(id).id,id);assert.equal(search(object.id)[0].id,id,'catalogue search '+object.id);
}
for(const query of ['仙女座星系','Andromeda Galaxy','NGC 224','Messier 31','M31'])assert.equal(search(query)[0].id,'deep-sky:m31');
assert.equal(search('猎户座大星云')[0]?.type,'deep-sky');
assert.equal(search('NGC 7000')[0]?.id,'deep-sky:ngc7000');
assert.equal(search('HIP 1011')[0].identifier,'HIP 1011'); // unnamed entries of the full catalogue are searchable
for(const q of ['',null,'HIP 999999','从未存在的星','tycho:orion:999999'])assert.deepEqual(search(q),[]);
assert.equal(search('星','en',2).length,2);assert.equal(get('constellation:invalid'),null);
for(const c of chart.constellations){
 const target=get('constellation:'+c.id);assert.equal(target.identifier,'IAU '+c.id);near(Math.hypot(...target.direction),1);
 const half=target.fov*rad/2;
 for(const path of c.lines)for(const point of path)assert(dot(equatorial(...point),target.direction)>=Math.cos(half)-1e-12,'outside constellation framing: '+c.id);
}
// Compare the accelerated cone against a direct spherical test at the seam,
// both poles, small views and hemispheric views, with several limiting magnitudes.
const cases=[[0,4,.1,12],[359.98,6.86,.7,8],[.1,-65.55,2,Infinity],[170,89,3,Infinity],[2,-88,6,10],[300,80,35,7],[84,-5,5,11.5],[22,-33,110,7]];
for(let n=0;n<25;n++)cases.push([n*58.691%360,(n*23.71%178)-89,1+n%7*4.2,n%2?7:11.5]);
for(const [ra,dec,radius,mag] of cases){
 const v=equatorial(ra,dec),cut=Math.cos(radius*rad)-3e-15;
 assert.deepEqual(query(v,radius,{maxMagnitude:mag}).map(s=>s.id),all.filter(s=>s.mag<=mag&&dot(s.direction,v)>=cut).map(s=>s.id));
}
const center=equatorial(83.47953218,-5.60692131),observed=query(center,.0002).find(p=>p.source==='tycho'&&p.mag===8.83);
assert(observed,'Known HEASARC position and magnitude');assert.equal(pick(center,.0002).id,observed.id);
assert.equal(get(observed.id,'en').type,'star');assert.equal(get(observed.id).id,observed.id);assert.match(get(observed.id).identifier,/Tycho-2/);
const orion=SURVEY_FIELDS.find(f=>f.id==='orion'),samples=decodeTycho(tychoCutouts.fields.orion);
for(const i of [0,8,384,samples.length-1]){
 const point=byId.get('tycho:orion:'+i),projected=projectStar(orion,point.direction);
 near(projected.x,samples[i].x);near(projected.y,samples[i].y);assert.equal(point.mag,samples[i].magnitude);
}
assert(deep.some(p=>p.edgeWeight===1)&&deep.some(p=>p.edgeWeight>0&&p.edgeWeight<.05));
const edge=unit(fieldRay(orion,1.01,.5));
assert(query(edge,.6).some(p=>p.source==='tycho'),'cone aimed outside a cutout still sees real stars inside its edge');
for(const p of deep)assert(!query(p.direction,2/3600).some(s=>s.source==='hip'),'duplicate bright HIP at '+p.id);
const corner=Math.atan(Math.tan(6*rad/2)*Math.hypot(1,16/9))/rad;
assert.deepEqual(collect({forward:orion.center,fovY:6,aspect:16/9}),query(orion.center,corner));
assert.deepEqual(query([0,0,0],2),[]);assert.deepEqual(query(orion.center,-1),[]);assert.deepEqual(collect({forward:orion.center,fovY:180,aspect:1}),[]);
console.log('Xuntian: 41,411 HIP + 16,020 de-duplicated Tycho stars, 88 framed constellations, multilingual aliases/HIP and lossless cone queries passed.');
