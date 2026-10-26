import * as Astronomy from 'astronomy-engine';
export const EARTH_RADIUS=6371, SUN_RADIUS=695700, AU=149597870.7;
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const norm=a=>Math.hypot(...a);
export const unit=a=>a.map(v=>v/norm(a));
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function validateOrbit(data){
 if(!data||typeof data!=='object')throw Error('无效轨道数据');
 if(data.center!==undefined&&data.center!=='EARTH')throw Error('当前仅支持绕地轨道');
 if(data.frame!=='EME2000'||data.timeSystem!=='UTC'||data.units!=='km, km/s')throw Error('需要 EME2000 / UTC，单位 km、km/s 的轨道数据');
 if(!Array.isArray(data.rows)||data.rows.length<8||data.rows.length>100000)throw Error('轨道记录数应为 8—100000');
 data.rows.forEach((r,i)=>{if(r.length!==7||!r.every(Number.isFinite)||!Number.isFinite(new Date(r[0]).getTime())||(i&&r[0]<=data.rows[i-1][0])||norm(r.slice(1,4))<EARTH_RADIUS+100||norm(r.slice(1,4))>50000||norm(r.slice(4))>15)throw Error('无效轨道记录 '+i);if(i&&r[0]-data.rows[i-1][0]>600000)throw Error('轨道数据间隔不能超过 10 分钟');});return data;
}
// Eight local OEM samples; epoch-relative abscissae avoid timestamp round-off.
export function interpolate(rows,t){
 if(t<rows[0][0]||t>rows.at(-1)[0])return null;
 let lo=0,hi=rows.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(rows[m][0]<=t)lo=m;else hi=m;}
 const start=clamp(lo-3,0,rows.length-8),p=rows.slice(start,start+8),out=Array(6).fill(0);
 for(let i=0;i<8;i++){let w=1;for(let j=0;j<8;j++)if(i!==j)w*=(t-p[j][0])/(p[i][0]-p[j][0]);for(let k=0;k<6;k++)out[k]+=w*p[i][k+1];}
 return {position:out.slice(0,3),velocity:out.slice(3)};
}
export function sunPosition(t){const v=Astronomy.GeoVector(Astronomy.Body.Sun,new Date(t),false);return [v.x*AU,v.y*AU,v.z*AU];}
// Fraction of the apparent solar disc outside the spherical Earth's disc.
export function sunlightFraction(r,sun){
 const toSun=sub(sun,r),a=Math.asin(SUN_RADIUS/norm(toSun)),b=Math.asin(EARTH_RADIUS/norm(r));
 const d=Math.acos(clamp(dot(unit(r.map(v=>-v)),unit(toSun)),-1,1));
 if(d>=a+b)return 1;if(d<=b-a)return 0;if(d<=a-b)return 1-b*b/(a*a);
 const ca=clamp((d*d+a*a-b*b)/(2*d*a),-1,1),cb=clamp((d*d+b*b-a*a)/(2*d*b),-1,1);
 const overlap=a*a*Math.acos(ca)+b*b*Math.acos(cb)-.5*Math.sqrt(Math.max(0,(-d+a+b)*(d+a-b)*(d-a+b)*(d+a+b)));
 return clamp(1-overlap/(Math.PI*a*a),0,1);
}
export function earthAxes(t){
 const date=new Date(t),a=Astronomy.SiderealTime(date)*Math.PI/12,rot=Astronomy.Rotation_EQD_EQJ(date);
 return [[Math.cos(a),Math.sin(a),0],[-Math.sin(a),Math.cos(a),0],[0,0,1]].map(v=>{const q=Astronomy.RotateVector(rot,new Astronomy.Vector(...v,date));return [q.x,q.y,q.z];});
}
export function snapshot(data,t){
 if(!data)return null;
 const pv=interpolate(data.rows,t);if(!pv)return null;
 const r=pv.position,z=unit(r),x=unit(sub(pv.velocity,z.map(v=>v*dot(pv.velocity,z)))),y=unit(cross(z,x)),basis=[x,y,z];
 const sun=sunPosition(t),sunDir=unit(sub(sun,r)),fixed=earthAxes(t),ecef=fixed.map(a=>dot(r,a)),rho=norm(r);
 return {...pv,t,basis,earthAxes:fixed,sun,sunDir,sunLocal:basis.map(a=>dot(a,sunDir)),illumination:sunlightFraction(r,sun),altitude:rho-EARTH_RADIUS,speed:norm(pv.velocity),latitude:Math.asin(ecef[2]/rho)*180/Math.PI,longitude:Math.atan2(ecef[1],ecef[0])*180/Math.PI};
}
export const wrap=a=>((a+180)%360+360)%360-180;
export function bestAngles(s,dual,previous={roll:0,left:0}){
 const pitch=Math.atan2(s[0],dual?Math.hypot(s[1],s[2]):s[2])*180/Math.PI;
 if(!dual)return {roll:0,pitch};
 if(Math.hypot(s[1],s[2])<1e-9)return {roll:previous.roll,pitch};
 const roll=Math.atan2(-s[1],s[2])*180/Math.PI,other={roll:wrap(roll+180),pitch:wrap(180-pitch)};
 const cost=(r,p)=>Math.abs(wrap(r-previous.roll))+Math.abs(wrap(p-previous.left));
 return cost(roll,pitch)<=cost(other.roll,other.pitch)?{roll,pitch}:other;
}
export function panelNormal(roll,pitch){const r=roll*Math.PI/180,p=pitch*Math.PI/180;return [Math.sin(p),-Math.sin(r)*Math.cos(p),Math.cos(r)*Math.cos(p)];}
export function parseOrbit(text){
 if(text.trim().startsWith('{'))return validateOrbit(JSON.parse(text));
 const field=k=>text.match(new RegExp('\\b'+k+'\\s*=\\s*(\\S+)'))?.[1];
 if(field('REF_FRAME')!=='EME2000'||field('TIME_SYSTEM')!=='UTC'||field('CENTER_NAME')!=='EARTH')throw Error('只支持地心 EME2000 / UTC 的 OEM 文件');
 if((text.match(/META_START/g)||[]).length!==1)throw Error('请导入单段 OEM 数据');
 const rows=[];for(const line of text.split(/\r?\n/)){const a=line.trim().split(/\s+/);if(/^\d{4}-\d{2}-\d{2}T/.test(a[0])&&a.length===7)rows.push([Date.parse(a[0].endsWith('Z')?a[0]:a[0]+'Z'),...a.slice(1).map(Number)]);}
 return validateOrbit({center:'EARTH',objectId:field('OBJECT_ID'),source:'用户导入 OEM（未验证来源）',created:field('CREATION_DATE'),frame:'EME2000',timeSystem:'UTC',units:'km, km/s',rows});
}
