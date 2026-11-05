import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SURVEY_FIELDS} from '../src/survey-lab-math.js';
import {equatorial} from '../src/environment-math.js';
import {cubeFace,faceUV,fieldRay,galaxyCrops,galaxyDirection,decodeTycho,projectStar,tileCoverage} from '../src/survey-sky-product-math.js';
import {tychoCutouts} from '../src/survey-sky-product-tycho.js';
const near=(x,y,delta=1e-9)=>assert(Math.abs(x-y)<=delta,`${x} != ${y}`);
for(const field of SURVEY_FIELDS){
  const t=projectStar(field,field.center);near(t.x,.5);near(t.y,.5);
  for(const [i,d] of field.tiles.entries()){
    const star=projectStar(field,d);assert.equal(2*Math.floor(star.y*2)+Math.floor(star.x*2),i);
  }
  const detail=decodeTycho(tychoCutouts.fields[field.id]);assert(detail.length>400);
  assert(detail.every(s=>s.x>=0&&s.x<1&&s.y>=0&&s.y<1&&s.magnitude<=11.5));
  const regions=galaxyCrops(field);
  for(let i=0;i<=23;i++)for(let j=0;j<=23;j++){
    const x=i/24+.00001,y=j/24+.00001,sky=fieldRay(field,x,y),reprojected=projectStar(field,sky);
    near(reprojected.x,x);near(reprojected.y,y);
    const g=galaxyDirection(sky),face=cubeFace(...g),uv=faceUV(g,face),box=regions.find(r=>r.face===face);
    assert(box&&uv[0]>=box.minX-1e-8&&uv[0]<=box.maxX+1e-8&&uv[1]>=box.minY-1e-8&&uv[1]<=box.maxY+1e-8);
  }
}
// Compare the inverse against all six explicit face conventions in prepare-sky.py.
for(const [i,face] of [([u,v])=>[1,-v,-u],([u,v])=>[-1,-v,u],([u,v])=>[u,1,v],([u,v])=>[u,-1,-v],([u,v])=>[u,-v,1],([u,v])=>[-u,-v,-1]].entries()){
  const vector=face([.3,-.4]);assert.equal(cubeFace(...vector),i);const uv=faceUV(vector,i);near(uv[0],.65);near(uv[1],.30);
}
const galacticCentre=galaxyDirection(equatorial(266.4051,-28.936175));near(galacticCentre[0],1,1e-6);near(galacticCentre[1],0,2e-5);near(galacticCentre[2],0,2e-5);
const northPole=galaxyDirection(equatorial(192.85948,27.12825));near(northPole[2],1,1e-6);
const field=SURVEY_FIELDS.find(f=>f.id==='orion'),star=projectStar(field,equatorial(83.47953218,-5.60692131));
assert(decodeTycho(tychoCutouts.fields.orion).some(s=>Math.abs(s.x-star.x)<.5/65536&&Math.abs(s.y-star.y)<.5/65536&&s.magnitude===8.83),'HEASARC measured Orion star must land at its J2000 position');
assert.equal(createHash('sha256').update(Buffer.from(tychoCutouts.fields.orion.base64,'base64')).digest('hex'),'0245c6b10f9420e01d658aa33dbbf172d6daf217c8c0ceb2e9dd4da999b1fdd3');
assert.equal(Object.values(tychoCutouts.fields).reduce((s,r)=>s+r.count,0),16020);
const bright=JSON.parse(readFileSync(new URL('../assets/stars.json',import.meta.url)));
assert.equal(bright.length,41411);
const c=tileCoverage(field,[{field:'orion',tile:0,start:2,end:12},{field:'orion',tile:0,start:50,duration:4},{field:'leo',tile:2,start:3,end:22},{field:'orion',tile:3,start:80,end:200}]);
assert.deepEqual(c[0],{count:2,seconds:14,first:2,last:54});assert.equal(c[1].count,0);assert.equal(c[2].count,0);assert.equal(c[3].seconds,120);
assert.deepEqual(decodeTycho(null),[]);assert.throws(()=>decodeTycho({base64:'AA==',count:1}));
console.log('Survey sky products: measured catalogue, nine projected fields, all cube faces, north/east, duplicates and per-field exposure coverage verified.');
