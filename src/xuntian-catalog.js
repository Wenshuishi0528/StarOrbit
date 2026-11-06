import hipCatalog from '../assets/stars.json';
import chart from '../assets/star-chart.json';
import aliases from '../assets/xuntian-star-aliases.json';
import {equatorial} from './environment-math.js';
import {SURVEY_FIELDS} from './survey-lab-math.js';
import {decodeTycho,fieldRay} from './survey-sky-product-math.js';
import {tychoCutouts} from './survey-sky-product-tycho.js';
import {DEEP_SKY_OBJECTS,deepSkyName,deepSkyTypeName} from './deep-sky-catalog.js';

const DEG=Math.PI/180,BIN=5,COLS=360/BIN,ROWS=180/BIN;
const MATCH_RADIUS=2/3600;
const GREEK={α:'alpha',β:'beta',γ:'gamma',δ:'delta',ε:'epsilon',ζ:'zeta',η:'eta',θ:'theta',ι:'iota',κ:'kappa',λ:'lambda',μ:'mu',ν:'nu',ξ:'xi',ο:'omicron',π:'pi',ρ:'rho',σ:'sigma',ς:'sigma',τ:'tau',υ:'upsilon',φ:'phi',χ:'chi',ψ:'psi',ω:'omega'};
const traditional='寶鷹壇獵馬鯨圓規鴿髮烏鴉鵝劍魚龍爐雙鶴時鐘長蠍獅貓顯鏡蒼蠅極戶飛鳳繪羅盤網儀遠鵑處織參陳繩車輔鶯鳥稱羣';
const simple='宝鹰坛猎马鲸圆规鸽发乌鸦鹅剑鱼龙炉双鹤时钟长蝎狮猫显镜苍蝇极户飞凤绘罗盘网仪远鹃处织参陈绳车辅莺鸟称群';
const simplified=new Map([...traditional].map((c,i)=>[c,simple[i]]));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const clamp=v=>Math.max(-1,Math.min(1,v));
const wrap=v=>(v%360+360)%360;
function normalized(v){
 if(!v||v.length!==3)return null;
 const length=Math.hypot(...v);return length>0&&Number.isFinite(length)?[v[0]/length,v[1]/length,v[2]/length]:null;
}
function coordinates(v){return [wrap(Math.atan2(v[1],v[0])/DEG),Math.asin(clamp(v[2]))/DEG];}
function fold(text){
 return [...String(text).normalize('NFKD').toLowerCase()].map(c=>GREEK[c]||simplified.get(c)||c).join('').replace(/[^\p{L}\p{N}]/gu,'');
}
function nameForms(text){
 if(!text)return [];
 if(/[\p{Script=Han}]/u.test(text)){
  if(text.endsWith('座'))return [text,text.slice(0,-1),text.slice(0,-1)+'星座'];
  if(text.endsWith('星')&&text.length>1)return [text,text.slice(0,-1)];
  if(!text.endsWith('一')&&!text.includes('座'))return [text,text+'星'];
 }
 return [text];
}
const compareStars=(a,b)=>a.mag-b.mag||(a.hip??Number.MAX_SAFE_INTEGER)-(b.hip??Number.MAX_SAFE_INTEGER)||(a.id<b.id?-1:a.id>b.id?1:0);
let sky=null,search=null;

function cellsNear(grid,center,radius,visit){
 const [ra,dec]=coordinates(center),lo=Math.min(ROWS-1,Math.max(0,Math.floor((dec-radius+90)/BIN)));
 const hi=Math.min(ROWS-1,Math.floor((dec+radius+90)/BIN));
 const halfRA=Math.abs(dec)+radius>=90?180:Math.asin(clamp(Math.sin(radius*DEG)/Math.cos(dec*DEG)))/DEG;
 const first=Math.floor((ra-halfRA)/BIN),count=Math.min(COLS,Math.floor((ra+halfRA)/BIN)-first+1);
 for(let band=lo;band<=hi;band++)for(let j=0;j<count;j++){
  const cell=grid[band*COLS+((first+j)%COLS+COLS)%COLS];if(cell&&visit(cell))return true;
 }
 return false;
}
function starSky(){
 if(sky)return sky;
 const grid=new Array(ROWS*COLS),byId=new Map();
 function insert(id,source,hip,field,direction,mag,bv,edgeWeight){
  const [ra,dec]=coordinates(direction);const i=Math.min(ROWS-1,Math.floor((dec+90)/BIN))*COLS+Math.floor(ra/BIN)%COLS;
  const record=Object.freeze({id,source,hip,field,direction:Object.freeze(direction),ra,dec,mag,magnitude:mag,bv,edgeWeight});
  (grid[i]??=[]).push(record);byId.set(id,record);
 }
 for(const [hip,ra,dec,mag,rawBV] of hipCatalog){
  const bv=rawBV!==null&&rawBV!==''&&Number.isFinite(Number(rawBV))?Number(rawBV):null;
  insert('hip:'+hip,'hip',hip,null,equatorial(ra,dec),mag,bv,1);
 }
 // The shipped Tycho cutouts already drop matched HIP identifiers. Keep the
 // same positional cross-catalogue tolerance after inverse tangent projection.
 // Close pairs recorded separately by Tycho within one field remain distinct.
 const chord=2*Math.sin(MATCH_RADIUS*DEG/2),limit=chord*chord;
 for(const field of SURVEY_FIELDS){
  const rows=decodeTycho(tychoCutouts.fields[field.id]);
  for(const [index,row] of rows.entries()){
   const v=normalized(fieldRay(field,row.x,row.y));
   const duplicate=cellsNear(grid,v,MATCH_RADIUS,points=>points.some(p=>p.field!==field.id&&
    (p.direction[0]-v[0])**2+(p.direction[1]-v[1])**2+(p.direction[2]-v[2])**2<=limit));
   if(duplicate)continue;
   const edge=Math.min(1,Math.min(row.x,row.y,1-row.x,1-row.y)/.045);
   insert('tycho:'+field.id+':'+index,'tycho',null,field.id,v,row.magnitude,row.bv,edge*edge*(3-2*edge));
  }
 }
 sky={grid,byId};return sky;
}

// Radius is the spherical half-angle, in degrees. Searching modulo longitude
// and switching to all longitudes at a pole keeps both seams lossless.
export function queryXuntianStars(direction,radiusDeg,{maxMagnitude=Infinity}={}){
 const center=normalized(direction);
 if(!center||!Number.isFinite(radiusDeg)||radiusDeg<0||!(typeof maxMagnitude==='number')||Number.isNaN(maxMagnitude))return [];
 const radius=Math.min(radiusDeg,180),limit=Math.cos(radius*DEG)-3e-15,points=[];
 cellsNear(starSky().grid,center,radius,cell=>{
  for(const p of cell)if(p.mag<=maxMagnitude&&dot(center,p.direction)>=limit)points.push(p);
 });
 return points.sort(compareStars);
}
export function collectXuntianStars({forward,fovY,aspect,maxMagnitude=Infinity}={}){
 if(!Number.isFinite(fovY)||fovY<=0||fovY>=180||!Number.isFinite(aspect)||aspect<=0)return [];
 const corner=Math.atan(Math.tan(fovY*DEG/2)*Math.hypot(1,aspect))/DEG;
 return queryXuntianStars(forward,corner,{maxMagnitude});
}

function constellationFrame(c){
 const unique=new Map();
 for(const path of c.lines)for(const coord of path)unique.set(coord.join(','),equatorial(...coord));
 const points=[...unique.values()],label=equatorial(c.ra,c.dec);
 if(!points.length)return {direction:label,fov:15,radius:7.5};
 let a=points[0],b=points[0],closest=1;
 for(let i=0;i<points.length;i++)for(let j=0;j<i;j++){
  const alignment=dot(points[i],points[j]);
  if(alignment<closest){a=points[i];b=points[j];closest=alignment;}
 }
 // Compare the centre of the actual outline, its widest pair and the chart's
 // authored centre. All member directions fit; RA wrap and polar figures do
 // not require planar averaging. Both Serpens outline components participate.
 const mean=normalized(points.reduce((sum,p)=>sum.map((v,i)=>v+p[i]),[0,0,0]));
 const midpoint=normalized(a.map((v,i)=>v+b[i]));let direction=label,score=-2;
 for(const center of [label,mean,midpoint])if(center){
  const minimum=Math.min(...points.map(p=>dot(center,p)));if(minimum>score){score=minimum;direction=center;}
 }
 const radius=Math.acos(clamp(score))/DEG;
 const fov=Math.min(170,Math.max(8,2*Math.atan(1.12*Math.tan(Math.min(84,radius+1)*DEG))/DEG));
 return {direction:Object.freeze(direction),fov,radius};
}

function searchCatalog(){
 if(search)return search;
 const {byId}=starSky(),records=new Map(),constellations=new Map(),supplement=new Map(),deepSky=new Map();
 function entry(id,type,names,identifier,direction,fov,radius,extra,mag=Infinity){
  const [ra,dec]=coordinates(direction);
  const principal=new Set(Object.values(names).filter(Boolean).map(fold));
  const terms=new Set([...Object.values(names),...extra].filter(Boolean).flatMap(nameForms).map(fold).filter(Boolean));
  const r={id,type,names,identifier,direction,ra,dec,fov,radius,mag,principal,terms};
  records.set(id,r);return r;
 }
 for(const object of DEEP_SKY_OBJECTS){
  const diameter=object.angularSizeArcmin?.[0]/60||.2;
  const r=entry('deep-sky:'+object.id.toLowerCase(),'deep-sky',{zh:deepSkyName(object,'zh'),en:deepSkyName(object,'en')},object.id,
   object.direction,Math.min(80,Math.max(.08,diameter*1.6)),diameter/2,[object.id,...object.aliases],object.mag??Infinity);
  r.category=deepSkyTypeName(object.type);r.objectType=object.type;
  for(const alias of [object.id,...object.aliases])if(!deepSky.has(fold(alias)))deepSky.set(fold(alias),r);
 }
 for(const field of chart.constellations){
  const supplement=aliases.constellations[field.id],frame=constellationFrame(field);
  const names={zh:field.zh,en:field.id==='Ser'?'Serpens':field.en,fr:field.fr,ru:field.ru};
  const r=entry('constellation:'+field.id,'constellation',names,'IAU '+field.id,frame.direction,frame.fov,frame.radius,
   [field.id,field.en,...(supplement?.names??[]),supplement?.genitive]);
  constellations.set(field.id.toLowerCase(),r);
 }
 for(const [abbr,rows] of Object.entries(aliases.designations)){
  const c=constellations.get(abbr.toLowerCase()),genitive=aliases.constellations[abbr].genitive;
  for(const [hip,bayer,flam] of rows){
   const extra=[],tags=[abbr,genitive,c.names.en,c.names.zh,c.names.zh.slice(0,-1)];
   for(const mark of [bayer,flam])if(mark){
    for(const tag of tags)extra.push(mark+' '+tag);
    extra.push(c.names.zh+mark,c.names.zh.slice(0,-1)+mark);
   }
   supplement.set(hip,{extra,designation:(bayer||flam)+' '+abbr});
  }
 }
 const named=new Map(chart.stars.map(p=>[p.id,p]));
 const ids=new Set([...named.keys(),...supplement.keys(),...Object.keys(aliases.starNames).map(Number)]);
 for(const hip of ids){
  const point=byId.get('hip:'+hip);if(!point)continue;
  const n=named.get(hip),d=supplement.get(hip),identifier='HIP '+hip,fallback=d?.designation||identifier;
  const names={zh:n?.zh||fallback,en:n?.en||fallback,ru:n?.ru,fr:n?.fr};
  entry(point.id,'star',names,identifier,point.direction,8,0,[...(aliases.starNames[hip]??[]),...(d?.extra??[])],point.mag);
 }
 search={records,constellations,deepSky};return search;
}
function localTarget(r,language){
 return {id:r.id,type:r.type,name:r.names[language]||r.names.en||r.identifier,identifier:r.identifier,direction:r.direction,
  ra:r.ra,dec:r.dec,fov:r.fov,radius:r.radius,...(r.category?{category:r.category,objectType:r.objectType}:{})};
}
export function getXuntianTarget(id,language='zh'){
 if(typeof id!=='string')return null;
 const text=id.trim(),hip=/^hip[\s:#-]*(\d+)$/i.exec(text),con=/^constellation[\s:#-]+([a-z]{3})$/i.exec(text);
 const index=searchCatalog();
 const deep=index.deepSky.get(fold(text.replace(/^deep-sky[:\s]*/i,'')));if(deep)return localTarget(deep,language);
 if(con){
  const r=index.constellations.get(con[1].toLowerCase());return r?localTarget(r,language):null;
 }
 const key=hip?'hip:'+Number(hip[1]):text.toLowerCase(),r=index.records.get(key);
 if(r)return localTarget(r,language);
 const p=starSky().byId.get(key);if(!p)return null;
 const identifier=p.source==='hip'?'HIP '+p.hip:'Tycho-2 · J2000 '+p.ra.toFixed(4)+'° / '+p.dec.toFixed(4)+'°';
 return {id:p.id,type:'star',name:identifier,identifier,direction:p.direction,ra:p.ra,dec:p.dec,fov:p.source==='hip'?8:3,radius:0};
}

export function searchXuntianTargets(text,language='zh',limit=12){
 if(typeof text!=='string'||!Number.isFinite(limit)||limit<1)return [];
 const raw=text.trim(),q=fold(raw);
 if(!q)return [];
 if(/^(?:hip)?\d+$/.test(q)||/^(?:constellation|tycho|deep-sky):/i.test(raw)){
  const id=/^(?:hip)?\d+$/.test(q)?'hip:'+q.replace(/^hip/,''):raw;
  const target=getXuntianTarget(id,language);return target?[target]:[];
 }
 const results=[];
 for(const r of searchCatalog().records.values()){
  let rank=Infinity,shortest=Infinity;
  for(const name of r.terms){
   const where=name.indexOf(q);if(where<0)continue;
   const score=(name===q?0:where===0?2:4)+(r.principal.has(name)?0:.5);
   if(score<rank||score===rank&&name.length<shortest){rank=score;shortest=name.length;}
  }
  if(Number.isFinite(rank))results.push({r,rank,shortest});
 }
 results.sort((a,b)=>a.rank-b.rank||a.shortest-b.shortest||a.r.mag-b.r.mag||(a.r.id<b.r.id?-1:1));
 return results.slice(0,Math.floor(limit)).map(x=>localTarget(x.r,language));
}
export function pickXuntianStar(direction,radiusDeg,options={}){
 const center=normalized(direction);if(!center)return null;
 let best=null,alignment=-Infinity;
 for(const p of queryXuntianStars(center,radiusDeg,options)){const match=dot(center,p.direction);if(match>alignment){best=p;alignment=match;}}
 return best;
}
