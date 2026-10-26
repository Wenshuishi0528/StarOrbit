import assert from 'node:assert/strict';
import fs from 'node:fs';

const chart=JSON.parse(fs.readFileSync(new URL('../assets/star-chart.json',import.meta.url)));
const catalogue=JSON.parse(fs.readFileSync(new URL('../assets/stars.json',import.meta.url)));
const byId=new Map(catalogue.map(row=>[row[0],row]));
const labels=new Map(chart.stars.map(star=>[star.id,star]));
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=-180&&p[0]<180&&p[1]>=-90&&p[1]<=90;
const vector=([ra,dec])=>{ra*=Math.PI/180;dec*=Math.PI/180;return [Math.cos(dec)*Math.cos(ra),Math.cos(dec)*Math.sin(ra),Math.sin(dec)];};
const distance=(a,b)=>{const u=vector(a),v=vector(b);return Math.acos(Math.max(-1,Math.min(1,u.reduce((sum,n,i)=>sum+n*v[i],0))))*180/Math.PI;};

assert.equal(chart.source.commit,'7e720a3de062059d4c5400a379146a601d9010e0');
assert.equal(chart.source.frame,'J2000 equatorial');
assert.match(chart.source.license,/BSD-3-Clause/);
for(const [file,url] of Object.entries(chart.source.urls)){
 assert.ok(file.startsWith('VI49.')?url.startsWith('https://cdsarc.cds.unistra.fr/ftp/VI/49/'):url.includes('/'+chart.source.commit+'/'));
 assert.match(chart.source.sha256[file],/^[a-f0-9]{64}$/);
}
assert.equal(labels.size,chart.stars.length,'HIP identifiers must remain unique');
assert.equal(chart.stars.length,965);
assert.equal(chart.stars.filter(s=>s.hasProperName).length,541);
assert.equal(chart.stars.filter(s=>s.major).length,361);
for(const star of chart.stars){
 const row=byId.get(star.id);assert.ok(row,'label must point to a rendered catalogue star');
 assert.deepEqual([star.ra,star.dec,star.mag],row.slice(1,4));
 assert.ok(point([star.ra,star.dec]));
 assert.ok(star.zh.trim()&&star.en.trim());
 assert.ok(!/[<>\u0000-\u001f]/.test(star.zh+star.en));
 assert.equal(star.nameType,star.hasProperName?'proper':'designation');
 if(row[3]<=3)assert.equal(star.major,true);
}
for(const [id,,,mag] of catalogue)if(mag<=3)assert.ok(labels.has(id),'all <=3 mag stars are labelled');
for(const [id,zh,en] of [[32349,'天狼星','Sirius'],[91262,'织女星','Vega'],[97649,'牛郎星','Altair'],[11767,'北极星','Polaris'],[102098,'天津四','Deneb'],[27989,'参宿四','Betelgeuse'],[24436,'参宿七','Rigel'],[54061,'天枢','Dubhe'],[53910,'天璇','Merak'],[58001,'天玑','Phecda'],[59774,'天权','Megrez'],[62956,'玉衡','Alioth'],[65378,'开阳','Mizar'],[67301,'摇光','Alkaid']]){
 assert.equal(labels.get(id)?.zh,zh);assert.equal(labels.get(id)?.en,en);assert.equal(labels.get(id)?.major,true);
}
assert.equal(labels.get(66657).nameType,'designation');
assert.equal(labels.get(66657).en,'ε Cen');

assert.equal(chart.constellations.length,88);
assert.equal(new Set(chart.constellations.map(c=>c.id)).size,88);
const skyPositions=new Map(catalogue.map(row=>[JSON.stringify(row.slice(1,3)),row[0]]));
let paths=0,segments=0,seamCrossings=0;
for(const c of chart.constellations){
 assert.match(c.id,/^[A-Z][A-Za-z]{2}$/);assert.ok(c.zh.endsWith('座')&&c.en);
 assert.ok(point([c.ra,c.dec]));assert.ok(c.labelPositions.every(point));
 assert.ok(c.lines.length>0);
 for(const path of c.lines){
  paths++;assert.ok(path.length>=2&&path.every(point));
  for(const p of path){const id=skyPositions.get(JSON.stringify(p));assert.ok(id);assert.ok(labels.has(id));if(labels.get(id).hasProperName)assert.equal(labels.get(id).major,true);}
  for(let i=1;i<path.length;i++){
   segments++;assert.ok(distance(path[i-1],path[i])<40,'outline segments must use the short celestial arc');
   if(Math.abs(path[i][0]-path[i-1][0])>180)seamCrossings++;
  }
 }
}
const serpens=chart.constellations.find(c=>c.id==='Ser');
assert.equal(serpens.labelPositions.length,2);
assert.equal(serpens.lines.length,2,'Serpens head and tail remain disconnected');
assert.deepEqual(serpens.labelPositions,[[-127.5,5],[-79.5,3]]);
assert.ok(seamCrossings>0,'exercise RA-wrap cases in the shipped geometry');
assert.equal(chart.constellations.find(c=>c.id==='Cha').zh,'蝘蜓座');
assert.equal(chart.constellations.find(c=>c.id==='Vir').zh,'室女座');

assert.equal(chart.boundaries.length,782);
const edges=new Set();let boundarySeams=0;
for(const edge of chart.boundaries){
 assert.ok(edge.length>=2);assert.ok(edge.every(point));
 const key=JSON.stringify([edge[0],edge.at(-1)].sort((a,b)=>a[0]-b[0]||a[1]-b[1]));
 assert.ok(!edges.has(key),'shared constellation borders must be drawn once');edges.add(key);
 for(let i=1;i<edge.length;i++){
  const separation=distance(edge[i-1],edge[i]);assert.ok(separation>0&&separation<=1.01,'CDS samples keep curved boundaries within one degree');
  if(Math.abs(edge[i-1][0]-edge[i][0])>180)boundarySeams++;
 }
}
assert.ok(boundarySeams>0);
// This Andromeda vertex is already precessed from B1875 into J2000 in upstream.
assert.ok(chart.boundaries.some(edge=>edge.some(p=>p[0]===-15.5347&&p[1]===35.1682)));
// Independent CDS VI/49 samples on B1875 parallels, not slerp-generated references.
// A great-circle chord between sparse endpoints displaces these polar borders by
// >2 degrees in the south and >1 degree in the north.
const south=chart.boundaries.find(path=>path[0][0]===-150.8889&&path[0][1]===-83.1201&&path.at(-1)[0]===111.6521);
const north=chart.boundaries.find(path=>path[0][0]===-20.739&&path[0][1]===88.6639&&path.at(-1)[0]===135.8325);
assert.ok(south&&north);
const chordMidpoint=path=>{
 const a=vector(path[0]),b=vector(path.at(-1)),v=a.map((x,i)=>x+b[i]),r=Math.hypot(...v);
 return [Math.atan2(v[1],v[0])*180/Math.PI,Math.asin(v[2]/r)*180/Math.PI];
};
for(const [path,reference,minError] of [[south,[159.695349,-83.1535797],2],[north,[74.064438,88.3147812],1]]){
 assert.ok(path.some(p=>distance(p,reference)<.000001),'published small-circle midpoint must survive preprocessing');
 assert.ok(distance(chordMidpoint(path),reference)>minError,'regression fixture distinguishes small circles from great circles');
 assert.ok(path.length>80);
}
for(const obsolete of [[.9483,88.6092],[24.7077,88.3564],[57.6647,88.0063]]){
 assert.ok(!chart.boundaries.some(path=>path.some(p=>p[0]===obsolete[0]&&p[1]===obsolete[1])),'use the corrected 2024 CEP/UMI boundary');
}
assert.equal(chart.source.sha256['VI49.bound_20.dat.gz'],'879cd6e7a1c908f1e19a5f5fe8cc75fb1d1077564e3890f9152a3680affe9aac');
assert.ok(fs.statSync(new URL('../assets/star-chart.json',import.meta.url)).size<450000);
console.log('Star chart data: 965 names, 361 major stars, 88 constellations, 782 dense J2000 boundary paths; HIP/name anchors, outline alignment, Serpens, RA seams and CDS polar small-circle regressions passed', {paths,segments,seamCrossings,boundarySeams});
