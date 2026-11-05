import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dot,norm,stateAt} from '../src/orbit.js';
import {
 makeSurveyOrbit,surveyRadius,surveyVisibility,surveyFieldsForOrbit,surveyExample,surveyStartingPlan,
 evaluateSurveyPlan,surveyPlayback,surveySlew,retargetSurveyJobs,arrangeSurveyField,surveyPointingInfo,SURVEY_PERIOD,SURVEY_END,SURVEY_LIMB_MARGIN,
 SURVEY_TILE_WIDTH,SURVEY_ALTITUDE
} from '../src/survey-lab-math.js';

const deg=Math.PI/180,orbit={radial:[1,0,0],along:[0,1,0],sun:[0,0,1],park:[0,0,-1]};
const unit=v=>v.map(x=>x/norm(v));
const close=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
close(norm(surveyRadius(orbit,0)),1);close(dot(surveyRadius(orbit,SURVEY_PERIOD/2),orbit.radial),-1);
assert.deepEqual(surveyVisibility(orbit,[0,0,1]),{blockedBySun:true,windows:[]});
assert.deepEqual(surveyVisibility(orbit,[0,0,-1]).windows,[[0,SURVEY_PERIOD]]);
const target=[1,0,0],windows=surveyVisibility(orbit,target).windows;
assert.equal(windows.length,2);close(windows[0][0],0);close(windows[1][1],SURVEY_PERIOD);
close(windows[0][1]+windows[1][0],SURVEY_PERIOD);
const corner=Math.atan(Math.SQRT2*Math.tan(SURVEY_TILE_WIDTH*deg/2));
const minAngle=Math.asin(6371/(6371+SURVEY_ALTITUDE))+SURVEY_LIMB_MARGIN*deg+corner;
for(const dir of [target,unit([-.2,.95,-.25]),unit([.7,-.7,-.1])]){
 const available=surveyVisibility(orbit,dir).windows;
 for(let time=2.38;time<SURVEY_PERIOD;time+=11.9){
  const angle=Math.acos(-dot(surveyRadius(orbit,time),dir));
  assert.equal(available.some(([s,e])=>time>=s&&time<=e),angle>=minAngle);
 }
}

const oneField=(id,directions)=>({id,tiles:directions,visibility:directions.map(d=>surveyVisibility(orbit,d))});
const fields=[oneField('test',[target,unit([1,.2,0]),orbit.park,orbit.sun])];
const job=(start,tile=0,duration=150)=>({field:'test',tile,start,duration,enabled:true});
const good=[job(600),job(1000,1)];
let plan=evaluateSurveyPlan(orbit,fields,good);
assert(plan.valid);
assert.deepEqual(evaluateSurveyPlan(orbit,fields,[...good].reverse()).order.map(j=>j.index),[1,0]);
const problems=jobs=>evaluateSurveyPlan(orbit,fields,jobs).order.map(j=>j.issues);
assert(problems([job(30)])[0].includes('slew'));
assert(problems([job(600),job(700,1)])[1].includes('overlap'));
assert(problems([job(600),job(751,1)])[1].includes('slew'));
assert(problems([job(900,3)])[0].includes('sun'));
assert(problems([job(SURVEY_END-20,2)])[0].includes('range'));
assert(problems([job(SURVEY_PERIOD/2,0)])[0].includes('earth'));
// Both ends are clear but the long exposure spans an entire occultation.
const start=Math.floor(windows[0][1])-10,finish=Math.ceil(windows[1][0])+10;
assert(problems([job(start,0,finish-start)])[0].includes('earth'));
assert.equal(evaluateSurveyPlan(orbit,fields,[{...good[0],enabled:false}]).valid,false);
assert(evaluateSurveyPlan(orbit,fields,[...good,{...job(0,3),enabled:false}]).valid);
assert.equal(surveyPlayback(orbit,evaluateSurveyPlan(orbit,fields,[job(30)]),350).phase,'invalid');

let view=surveyPlayback(orbit,plan,0);
assert.equal(view.phase,'waiting');assert.deepEqual(view.direction,orbit.park);
const burn=surveySlew(orbit.park,target);close(burn,188);
view=surveyPlayback(orbit,plan,600-burn+90);
assert.equal(view.phase,'slew');close(norm(view.direction),1);close(dot(view.direction,orbit.park),Math.SQRT1_2);
assert.equal(surveyPlayback(orbit,plan,596).phase,'settling');
assert.equal(surveyPlayback(orbit,plan,600).phase,'exposure');
view=surveyPlayback(orbit,plan,675);close(view.fraction,.5);assert.equal(view.completed.length,0);
view=surveyPlayback(orbit,plan,750);assert.equal(view.completed.length,1);
assert.equal(surveyPlayback(orbit,plan,SURVEY_END-.1).phase,'coasting');
view=surveyPlayback(orbit,plan,SURVEY_END);assert.equal(view.phase,'finished');assert.equal(view.completed.length,2);
assert.deepEqual(surveyPlayback(orbit,plan,675).completed,[]);

// Courses at many dates, attitudes and reference planes produce a feasible default.
const real=JSON.parse(readFileSync(new URL('../assets/orbit.json',import.meta.url)));
for(const epoch of [Date.UTC(1970,3,24),Date.UTC(2000,0,1),Date.UTC(2026,10,5),Date.UTC(2098,8,15)]){
 const states=[stateAt(real,epoch),{position:[0,6900,0],velocity:[0,0,7.5]},null];
 for(const state of states){
  const o=makeSurveyOrbit(epoch,state),f=surveyFieldsForOrbit(o),sample=surveyExample(o,f);
  assert.equal(sample.length,4);assert.equal(new Set(sample.map(j=>j.tile)).size,4);
  const p=evaluateSurveyPlan(o,f,sample);assert(p.valid);
  assert.equal(surveyPlayback(o,p,SURVEY_END).completed.length,4);
 }
}
const hopeless=[{id:'sunward',tiles:Array(4).fill(orbit.sun),visibility:Array(4).fill({blockedBySun:true,windows:[]})}];
assert.deepEqual(surveyExample(orbit,hopeless),[]);
const fallback=surveyStartingPlan(orbit,hopeless);assert.equal(fallback.found,false);assert.equal(fallback.jobs.length,4);
assert(fallback.jobs.every(j=>j.field==='sunward'&&!j.enabled));assert.equal(evaluateSurveyPlan(orbit,hopeless,fallback.jobs).valid,false);
assert(Number.isFinite(makeSurveyOrbit(NaN).epoch));
const saved=[{field:'old',tile:3,start:550,duration:60,enabled:true},{field:'old2',tile:3,start:300,duration:60,enabled:false},
 {field:'old',tile:1,start:1500,duration:60,enabled:true},{field:'old',tile:0,start:1900,duration:60,enabled:true}];
const original=structuredClone(saved),sync=retargetSurveyJobs(saved,'only');
assert.deepEqual(saved,original);
assert.deepEqual(sync.map(x=>x.tile),[0,1,2,3]);
for(const [i,row] of sync.entries()){
 assert.equal(row.field,'only');assert.equal(row.enabled,saved[i].enabled);assert.equal(row.start,saved[i].start);assert.equal(row.duration,saved[i].duration);
}
const artificial=(id,windows,tiles=Array(4).fill(orbit.park))=>({id,tiles,visibility:windows.map(w=>({windows:w,blockedBySun:false}))});
const tight=artificial('only',[[[700,800]],[[370,470]],[[1450,1650]],[[1800,2000]]]);
const arranged=arrangeSurveyField(orbit,[tight],saved,'only');assert(arranged.ok);
assert(arranged.jobs.every((j,i)=>j.enabled&&j.field==='only'&&j.tile===i&&j.duration===60));
assert(arranged.jobs[1].start<arranged.jobs[0].start,'B must precede A');
assert.equal(arranged.jobs[2].start,1500);assert.equal(arranged.jobs[3].start,1900);
const tidy=evaluateSurveyPlan(orbit,[tight],arranged.jobs);assert(tidy.valid);
assert.equal(surveyPlayback(orbit,tidy,SURVEY_END).completed.length,4);
assert.deepEqual(arrangeSurveyField(orbit,[tight],arranged.jobs,'only').jobs,arranged.jobs);
const crowded=artificial('small',Array(4).fill([[400,620]])); // individually feasible 60 s frames, total exceeds 220 s.
assert.equal(arrangeSurveyField(orbit,[crowded],saved,'small').reason,'sequence');
const tooShort=artificial('short',[[[100,159.6]],...Array(3).fill([[0,SURVEY_END]])]);
assert.deepEqual(arrangeSurveyField(orbit,[tooShort],saved,'short'),{ok:false,reason:'duration',tile:0});
const noLimb=artificial('dark',[[],...Array(3).fill([[0,SURVEY_END]])]);
assert.deepEqual(arrangeSurveyField(orbit,[noLimb],saved,'dark'),{ok:false,reason:'earth',tile:0});
const noTurn=artificial('turn',[[[50,110]],[[120,180]],[[900,1200]],[[1800,2100]]],[orbit.park,target,target,target]);
assert.equal(arrangeSurveyField(orbit,[noTurn],saved,'turn').reason,'sequence');
assert.deepEqual(arrangeSurveyField(orbit,[tight,...hopeless],saved,'sunward'),{ok:false,reason:'sun',tile:0});
assert.deepEqual(surveyExample(orbit,[tight,...hopeless],'sunward'),[]); // an explicit field never silently changes.
const ordered=artificial('demo-b-first',[[[750,1010]],[[350,555]],[[1500,1750]],[[2100,2370]]]);
const sample=surveyExample(orbit,[ordered],'demo-b-first');
assert.equal(sample.length,4);assert(sample[1].start<sample[0].start&&evaluateSurveyPlan(orbit,[ordered],sample).valid);
assert.deepEqual(saved,original,'all failed and successful attempts leave the supplied jobs untouched');
const nearSun=angle=>[Math.sin(angle*deg),0,Math.cos(angle*deg)];
assert(surveyVisibility(orbit,nearSun(51)).blockedBySun);assert(!surveyVisibility(orbit,nearSun(53)).blockedBySun);
const info=surveyPointingInfo(orbit,{tiles:[nearSun(51)]},0);close(info.sunAngle,51);assert(info.sunMinimum>52&&info.sunMinimum<53);
close(evaluateSurveyPlan(orbit,fields,good).order[1].readyAt,750+surveySlew(fields[0].tiles[0],fields[0].tiles[1]));
console.log('Survey lab: analytic limb windows, solar exclusions, whole-exposure checks, slew conflicts, playback, viable examples and empty fallback passed.');
