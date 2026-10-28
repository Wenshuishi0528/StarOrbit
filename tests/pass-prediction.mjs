import assert from 'node:assert/strict';
import fs from 'node:fs';
import {geodeticToEcf,ecfToLookAngles,json2satrec,propagate,eciToEcf,gstime} from 'satellite.js';
import {validateObserver,observerFrame,lookAngles,predictionSource,predictionWindow,createPassSampler,scanPasses,predictPasses,passesToICS,PASS_GP_MAX_AGE} from '../src/pass-prediction.js';
const degree=Math.PI/180,read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));
const site={name:'北京',latitude:39.9042,longitude:116.4074,height:50},frame=observerFrame(site);
const independentSite={latitude:site.latitude*degree,longitude:site.longitude*degree,height:site.height/1000};
const earthFixed=geodeticToEcf(independentSite);
assert(Math.hypot(...frame.position.map((v,i)=>v-earthFixed[['x','y','z'][i]]))<1e-6);
for(const position of [[4000,5000,6000],frame.position.map((v,i)=>v+500*frame.up[i]),[-8000,-2000,500]]){
 const expected=ecfToLookAngles(independentSite,{x:position[0],y:position[1],z:position[2]}),actual=lookAngles(position,frame);
 assert(Math.abs(actual.range-expected.rangeSat)<1e-6);assert(Math.abs(actual.elevation-expected.elevation/degree)<1e-7);
 if(actual.elevation<89.99)assert(Math.abs(actual.azimuth-expected.azimuth/degree)<1e-8);
}
for(const bad of [{...site,latitude:91},{...site,longitude:NaN},{...site,height:10000},{...site,latitude:''}])assert.throws(()=>validateObserver(bad));
const finish=scan=>{let item;do{item=scan.next();}while(!item.done);return item.value;};
const parabola=(peak,height=20,width=20000)=>time=>({time,elevation:height-((time-peak)/width)**2*20,azimuth:(time/1000+180)%360,range:900,sunElevation:-15,illumination:1});
const pass=finish(scanPasses(parabola(90000),0,180000));assert.equal(pass.length,1);
assert(Math.abs(pass[0].maximum.time-90000)<250);assert(Math.abs(pass[0].start-(90000-Math.sqrt(.5)*20000))<250);
assert.equal(pass[0].visible.length,1);assert.equal(pass[0].path.length,49);
// Entire above-threshold interval falls between 30-second coarse samples.
for(const peak of [7000,45000,173000]){
 const tiny=finish(scanPasses(parabola(peak,10.05,3000),0,180000));assert.equal(tiny.length,1,'short grazing pass '+peak);assert(Math.abs(tiny[0].maximum.time-peak)<250);
}
const ongoing=finish(scanPasses(parabola(0),0,180000));assert(ongoing[0].clippedStart);assert.equal(ongoing[0].start,0);
const ending=finish(scanPasses(parabola(180000),0,180000));assert(ending[0].clippedEnd);assert.equal(ending[0].end,180000);
const always=finish(scanPasses(t=>({...parabola(0)(t),elevation:30}),0,180000));assert(always[0].clippedStart&&always[0].clippedEnd);
assert.equal(finish(scanPasses(t=>({...parabola(0)(t),elevation:-20}),0,180000)).length,0);
const multipeak=finish(scanPasses(t=>({...parabola(0)(t),elevation:20+20*Math.exp(-(((t-40000)/10000)**2))+35*Math.exp(-(((t-140000)/10000)**2))}),0,180000));assert.equal(multipeak.length,1);assert(Math.abs(multipeak[0].maximum.time-140000)<250);
const daylight=finish(scanPasses(t=>({...parabola(90000)(t),sunElevation:20}),0,180000));assert.equal(daylight[0].visible.length,0);
const eclipsed=finish(scanPasses(t=>({...parabola(90000)(t),illumination:0}),0,180000));assert.equal(eclipsed[0].visible.length,0);
const terminator=finish(scanPasses(t=>({...parabola(90000)(t),sunElevation:-6+(t-90000)/1000}),0,180000));assert.equal(terminator[0].visible.length,1);assert(Math.abs(terminator[0].visible[0].end-90000)<250);
const oem={...read('../assets/orbit.json'),missionId:'tiangong'},dfh={...read('../assets/spacecraft/dfh1-orbit.json'),missionId:'dfh1'},gp=read('../assets/spacecraft/dfh1-gp.json')[0];
const source=predictionSource(oem);assert.equal(source.kind,'oem');assert.throws(()=>predictionWindow(oem,source.end+1,24),/有效轨道/);assert.throws(()=>predictionWindow(oem,source.start-1,24),/有效轨道/);
assert(predictionWindow(oem,source.end-3600000,24).clipped);
const sgp=predictionSource(dfh);assert.equal(sgp.kind,'sgp4');assert.equal(sgp.end-sgp.epoch,PASS_GP_MAX_AGE);
assert.throws(()=>predictionWindow(dfh,sgp.end,24),/时效/);assert.throws(()=>predictionWindow(dfh,Date.parse('1970-04-25'),24),/历史/);
assert.throws(()=>predictionSource({...dfh,gp,gpEpoch:'not a date'}),/历元/);assert.throws(()=>predictionSource({...dfh,gp:{...gp,NORAD_CAT_ID:48274}}),/编号/);
assert(predictionWindow(dfh,sgp.end-3600000,24).clipped);
const sample=createPassSampler(sgp,site),satrec=json2satrec(gp);
for(const offset of [0,3600000,4*86400000]){
 const time=sgp.epoch+offset,q=propagate(satrec,new Date(time)),fixed=eciToEcf(q.position,gstime(new Date(time))),expected=ecfToLookAngles(independentSite,fixed),actual=sample(time);
 assert(Math.abs(actual.elevation-expected.elevation/degree)<1e-7);assert(Math.abs(actual.range-expected.rangeSat)<1e-6);
}
const controller=new AbortController(),cancelled=predictPasses(dfh,site,sgp.epoch,72,{signal:controller.signal});controller.abort();await assert.rejects(cancelled,error=>error.name==='AbortError');
const result=await predictPasses(dfh,site,sgp.epoch,24);assert(result.passes.length>0);assert(result.passes.every(p=>p.maximum.elevation>=10&&p.start>=result.start&&p.end<=result.end));
const ics=passesToICS({...result,observer:{...site,name:'北京,观测站\nEND:VEVENT'}},'东方红一号;测试',sgp.epoch);
assert(ics.includes('DTSTART:2026'));assert(!ics.includes('TZID'));assert.equal((ics.match(/\r\nBEGIN:VEVENT\r\n/g)||[]).length,result.passes.length);
assert(ics.includes('\\,')&&ics.includes('\\;'));assert(ics.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
assert(ics.endsWith('END:VCALENDAR\r\n'));
console.log('Pass prediction: WGS84/SGP4 cross-check, grazing/window boundaries, eclipse/twilight, data validity, cancellation and ICS passed', {passes:result.passes.length});
