import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {DOCKING_LIMITS,dockingInitial,dockingMetrics} from '../src/docking-physics.js';
import {DockingTraining} from '../src/docking-training.js';
import {DockingRecorder} from '../src/docking-instruments.js';

// Bundle the actual functions and dictionaries without browser preference access;
// the default Chinese locale is deterministic. No DOM, browser or mock renderer.
const bundle=await build({entryPoints:[new URL('../src/docking-workbench.js',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',define:{localStorage:'undefined'}});
const {captureRows,trendSVG,escapeHTML,reportHTML}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const captureMetrics=overrides=>dockingMetrics({...dockingInitial(),position:[0,.35,0],velocity:[0,-.1,0],...overrides});
const rowFor=(rows,key)=>{const row=rows.find(row=>row.key===key);assert.ok(row,`Missing capture check ${key}`);return row;};
const reportRow=(html,key)=>{const row=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].find(match=>match[1].includes(key));assert.ok(row,`Missing report row ${key}`);return row[1];};
function nextDown(value){const bytes=new DataView(new ArrayBuffer(8));bytes.setFloat64(0,value);bytes.setBigUint64(0,bytes.getBigUint64(0)-1n);return bytes.getFloat64(0);}
function series(svg,stroke){
 const path=[...svg.matchAll(/<path\b([^>]*?)\/?\s*>/g)].find(match=>match[1].includes(`stroke="${stroke}"`));
 assert.ok(path,`Missing chart series ${stroke}`);
 const d=path[1].match(/\bd="([^"]*)"/)?.[1]??'';
 return [...d.matchAll(/[ML]\s*([-\d.e+]+)[, ]+([-\d.e+]+)/gi)].map(match=>({x:Number(match[1]),y:Number(match[2])}));
}
const sample=(time,axialClosing,recommendedClosing=.1)=>({time,instruments:{axialClosing,recommendedClosing}});

test('capture report preserves the physical angular-rate verdict across unit rounding',()=>{
 const metrics=captureMetrics({angularVelocity:[nextDown(DOCKING_LIMITS.captureAngularSpeed),0,0]});
 assert.equal(metrics.captureChecks.angularSpeed,true);
 // Adjacent distinct radians round to exactly the same double when converted to degrees.
 assert.equal(metrics.angularSpeed*180/Math.PI,DOCKING_LIMITS.captureAngularSpeed*180/Math.PI);
 assert.equal(rowFor(captureRows(metrics),'合成角速率').pass,true,'The report must use the saved physical capture result, not reclassify the converted value');
});

test('strict capture boundaries and receding speed remain failures in rows and visible limits',()=>{
 const receding=captureMetrics({velocity:[0,.01,0]}),recedingRow=rowFor(captureRows(receding),'轴向闭合速度');
 assert.equal(receding.captureChecks.axialClosing,false);assert.equal(recedingRow.pass,false);
 assert.equal(rowFor(captureRows(captureMetrics({velocity:[0,-DOCKING_LIMITS.captureSpeed,0]})),'相对速度').pass,false);
 const summary={duration:1,deltaV:.02,maxClosing:0,timeAboveSpeedLimit:0,sampleCount:6,eventCount:1,contactMetrics:receding};
 const html=reportRow(reportHTML(summary),'轴向闭合速度');
 assert.match(html,/data-pass="false"/);
 assert.match(html,/0\s*(?:≤|&le;|&lt;=)/,'A negative closing speed fails the lower bound; the report must show that bound');
 assert.match(html,new RegExp(`(?:&lt;|<)\\s*${DOCKING_LIMITS.captureAxialClosing.toFixed(3).replace('.','\\.')}`));
});

test('trend keeps rendered point count bounded and retains first and last observations',()=>{
 const samples=Array.from({length:600},(_,index)=>sample(100+index*.2,.01));
 const svg=trendSVG(samples,150),actual=series(svg,'#83e1ed'),limit=series(svg,'#d5a960');
 assert.ok(actual.length<=300,`${actual.length} actual data points exceeds the 300-point display budget`);
 assert.ok(limit.length<=300,`${limit.length} guide points exceeds the 300-point display budget`);
 assert.ok(actual.length>=2);assert.ok(actual.at(-1).x>actual[0].x);
 const short=series(trendSVG([samples[0],samples.at(-1)],150),'#83e1ed');
 assert.equal(actual[0].x,short[0].x);assert.equal(actual.at(-1).x,short.at(-1).x);
});

test('trend decimation cannot hide a brief excessive closing speed or retreat',()=>{
 const samples=Array.from({length:600},(_,index)=>sample(index,.01));
 samples[1]=sample(1,1);samples[3]=sample(3,-.4);
 const svg=trendSVG(samples,300),actual=series(svg,'#83e1ed');
 const numericLabels=[...svg.matchAll(/<text\b[^>]*>(-?\d+(?:\.\d+)?)<\/text>/g)].map(match=>Number(match[1]));
 assert.ok(Math.max(...numericLabels)>=1,'Axis range must include the excessive closing spike even between decimated samples');
 assert.ok(Math.min(...numericLabels)<=-.4,'Axis range must include the retreat speed');
 const zeroPath=[...svg.matchAll(/<path\b([^>]*?)\/?\s*>/g)].find(match=>match[1].includes('stroke="#233c50"'));
 assert.ok(zeroPath);const zeroY=Number(zeroPath[1].match(/\bd="M[-\d.]+\s+([-\d.e+]+)/)?.[1]);
 assert.ok(Number.isFinite(zeroY));assert.ok(actual.some(point=>point.y<zeroY));assert.ok(actual.some(point=>point.y>zeroY),'Signed retreat data must appear below zero');
});

test('trend time positions use retained observation times, and sign is not absolute-valued',()=>{
 const samples=[sample(37.5,-.2),sample(57.5,0),sample(93.25,.2)];
 const svg=trendSVG(samples,200),actual=series(svg,'#83e1ed');
 assert.equal(actual.length,3);assert.ok(actual[0].y>actual[1].y&&actual[1].y>actual[2].y);
 const fraction=(actual[1].x-actual[0].x)/(actual[2].x-actual[0].x);
 assert.ok(Math.abs(fraction-(57.5-37.5)/(93.25-37.5))<.001,'Irregular sample intervals must keep their true time spacing');
 assert.match(svg,/>38 s<\/text>/);assert.match(svg,/>93 s<\/text>/);assert.doesNotMatch(svg,/(?:NaN|Infinity)/);
 for(const data of [[],[sample(37.5,0)]])assert.doesNotMatch(trendSVG(data,37.5),/(?:NaN|Infinity)/);
});

test('HTML escaping neutralizes markup and attribute breakouts while retaining readable text',()=>{
 const unsafe='星轨 <img src="x" onerror=\'alert(1)\'> & already &lt;b&gt;';
 const escaped=escapeHTML(unsafe);
 assert.ok(escaped.startsWith('星轨 '));assert.doesNotMatch(escaped,/[<>"']/);
 assert.ok(escaped.includes('&lt;img'));assert.ok(escaped.includes('&quot;'));assert.ok(escaped.includes('&#39;'));
 assert.ok(escaped.includes('&amp; already &amp;lt;b&amp;gt;'),'Existing entities must not be interpreted as markup on insertion');
});

test('training to recorder to report preserves pre-capture speed and does not fabricate overspeed',()=>{
 for(const scenario of ['alignment','approach','recovery']){
  const recorder=new DockingRecorder({id:scenario});let session;
  session=new DockingTraining(scenario,{
   onEvent:event=>recorder.event(event),
   onStep:(state,context)=>{
    if(state.status==='flying')recorder.sample(state,context);else recorder.finish(state,context);
    if(!context.initial&&session.guidance().canRelease)session.releaseGate();
   },
  });
  session.setMode('approach');
  for(let i=0;i<5500&&!session.finished;i++)session.advance(.2);
  assert.equal(session.state.status,'docked',scenario);assert.deepEqual(session.state.velocity,[0,0,0]);
  const summary=recorder.summary(),html=reportHTML(summary,session.violations.length);
  assert.equal(summary.finished,true);assert.equal(summary.finishReason,'docked');assert.ok(summary.contactMetrics.speed>.001);
  assert.equal(summary.timeAboveSpeedLimit,0,`${scenario}: nominal assisted tracking must not accumulate false overspeed from tiny floating-point/control errors`);
  assert.match(reportRow(html,'相对速度'),new RegExp(`${summary.contactMetrics.speed.toFixed(3).replace('.','\\.')} m/s`));
  assert.match(reportRow(html,'轴向闭合速度'),new RegExp(`${summary.contactMetrics.axialClosing.toFixed(3).replace('.','\\.')} m/s`));
  assert.ok(captureRows(summary.contactMetrics).every(row=>row.pass));
  assert.match(html,/接触前瞬间/);assert.doesNotMatch(html,/尚未接触/);
  assert.equal(summary.eventCounts['gate-release'],scenario==='alignment'?1:2);assert.equal(summary.eventCounts.finished,1);
  assert.ok(summary.maxClosing>=summary.contactMetrics.axialClosing);
 }
});

test('actual advisory overspeed still accumulates for legacy records, while an operator-ended run has no capture verdict',()=>{
 const recorder=new DockingRecorder(),state=dockingInitial(50),speed=.1+DOCKING_LIMITS.speedTolerance+.005;
 recorder.sample({...state,velocity:[0,-speed,0]},{speedLimit:.1});
 recorder.finish({...state,time:1,velocity:[0,-speed,0]},{speedLimit:.1,finishReason:'ended'});
 const summary=recorder.summary(),html=reportHTML(summary);
 assert.equal(summary.timeAboveSpeedLimit,1);assert.equal(summary.contactMetrics,null);
 assert.match(html,/尚未接触目标接口/);assert.doesNotMatch(html,/接触前瞬间的捕获检查|<table/);
});

test('unrestricted flight records null caps and actual randomized initial conditions',()=>{
 const recorder=new DockingRecorder();
 const session=new DockingTraining('random',{
  random:()=>.7,
  onEvent:event=>{if(event.type==='reset')recorder.reset(event.detail.definition);recorder.event(event);},
  onStep:(state,context)=>recorder.sample(state,context),
 });
 const initial=structuredClone(session.state);
 session.state.velocity=[0,-2,0];session.advance(1);
 const record=JSON.parse(recorder.exportJSON()),html=reportHTML(recorder.summary());
 assert.deepEqual(record.scenario.position,initial.position);
 assert.deepEqual(record.samples[0].position,initial.position);
 assert(record.scenario.attitude.every((v,i)=>Math.abs(v-initial.attitude[i])<1e-10));
 assert.equal(record.samples[0].context.speedLimit,null);
 assert.equal(record.summary.timeAboveSpeedLimit,0);
 assert.equal(record.summary.flightSpeedLimited,false);
 assert.match(html,/飞行不限速/);assert.doesNotMatch(html,/超过建议速度/);
 const csv=recorder.exportCSV().split('\r\n'),header=csv.find(row=>row.startsWith('time_s,'));
 const limitColumn=header.split(',').indexOf('speed_limit_m_s');
 assert.equal(csv[csv.indexOf(header)+1].split(',')[limitColumn],'','CSV must leave an unlimited cap blank');
 assert.doesNotMatch(trendSVG(record.samples,session.state.time),/NaN|Infinity/);
});
