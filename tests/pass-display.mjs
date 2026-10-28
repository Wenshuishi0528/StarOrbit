import assert from 'node:assert/strict';
import {compassDirection,passClockParts,passStages,passTimeAtFraction,passTimeTicks,isCandidateTime,passProfile} from '../src/pass-display.js';

for(const [azimuth,direction] of [[0,'北'],[359,'北'],[-1,'北'],[720,'北'],[11.249,'北'],[11.25,'北北东'],[22.5,'北北东'],[45,'东北'],[90,'东'],[135,'东南'],[180,'南'],[225,'西南'],[270,'西'],[337.5,'北北西']])assert.equal(compassDirection(azimuth),direction);
assert.throws(()=>compassDirection(NaN));

const start=Date.parse('2026-10-28T15:58:00Z'),end=start+300000;
assert.deepEqual(passClockParts(start),{date:'2026-10-28',clock:'23:58:00',shortDate:'10-28'});
assert.deepEqual(passClockParts(end),{date:'2026-10-29',clock:'00:03:00',shortDate:'10-29'});
const point=(seconds,elevation,azimuth=0)=>({time:start+seconds*1000,elevation,azimuth});
const pass={start,end,rise:point(0,10,350),set:point(300,10,190),maximum:point(125,80,90),path:[point(0,10),point(100,65),point(150,70),point(300,10)],visible:[{start:start+45000,end:start+170000},{start:start+210000,end:start+250000}],clippedStart:false,clippedEnd:false};
assert.deepEqual(passStages(pass).map(stage=>stage.key),['进入最低仰角','最高点','离开最低仰角']);
assert.deepEqual(passStages({...pass,clippedStart:true,clippedEnd:true}).map(stage=>stage.key),['预报窗口开始','最高点','预报窗口结束']);
assert.equal(passStages(pass)[1].point,pass.maximum);
assert.equal(passTimeAtFraction(pass,-1),start);assert.equal(passTimeAtFraction(pass,2),end);assert.equal(passTimeAtFraction(pass,.5),start+150000);
const ticks=passTimeTicks(pass,3);assert.deepEqual(ticks.map(tick=>tick.clock),['23:58:00','00:00:30','00:03:00']);assert.ok(ticks.every(tick=>tick.showDate));
assert.ok(passTimeTicks({...pass,end:start+1000}).every(tick=>!tick.showDate));

const profile=passProfile(pass);
assert.ok(profile.points.some(point=>point.time===pass.maximum.time&&point.elevation===80),'refined maximum remains on the chart');
for(const span of pass.visible)for(const time of [span.start,span.end])assert.ok(profile.points.some(point=>point.time===time),'visibility boundary splits the line at its actual time');
const candidateDuration=profile.segments.filter(segment=>segment.candidate).reduce((duration,segment)=>duration+segment.to.time-segment.from.time,0);
assert.equal(candidateDuration,165000);
assert.ok(profile.segments.every(segment=>segment.to.time>segment.from.time));
assert.ok(profile.segments.every(segment=>segment.candidate===isCandidateTime(pass,(segment.from.time+segment.to.time)/2)));
assert.equal(profile.points[0].elevation,10);assert.equal(profile.points.at(-1).elevation,10);
assert.equal(passProfile({...pass,visible:[]}).segments.filter(segment=>segment.candidate).length,0);
assert.ok(passProfile({...pass,visible:[{start:start-1000,end:end+1000}]}).segments.every(segment=>segment.candidate));
console.log('Pass display: 16 compass directions, UTC+8 date rollover, threshold/clipped labels, peak and optical-interval splitting passed.');
