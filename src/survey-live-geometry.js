import {dot,unit,cross} from './orbit.js';
import {SURVEY_FIELDS,SURVEY_TILES,SURVEY_TILE_WIDTH} from './survey-lab-math.js';

const DEG=Math.PI/180;
const halfSky=Math.tan(SURVEY_TILE_WIDTH*DEG);
export function surveyTarget(fieldId,tile){
 const field=SURVEY_FIELDS.find(f=>f.id===fieldId),i=typeof tile==='string'?SURVEY_TILES.indexOf(tile.toUpperCase()):tile;
 if(!field||!Number.isInteger(i)||i<0||i>3)return null;
 // Same tangent-plane halves used by the teaching mosaic: east is left,
 // north is up. Preserve the complete footprint, including its orientation.
 const eastMin=i%2?-halfSky:0,northMin=i<2?0:-halfSky;
 const ray=(east,north)=>unit(field.center.map((v,j)=>v+east*field.east[j]+north*field.north[j]));
 return {field,fieldId,tile:i,letter:SURVEY_TILES[i],direction:field.tiles[i],eastMin,northMin,span:halfSky,
  corners:[[eastMin+halfSky,northMin+halfSky],[eastMin,northMin+halfSky],[eastMin,northMin],[eastMin+halfSky,northMin]].map(([e,n])=>ray(e,n))};
}
export function tileSample(target,u,v){
 return unit(target.field.center.map((x,i)=>x+(target.eastMin+target.span*u)*target.field.east[i]+(target.northMin+target.span*v)*target.field.north[i]));
}
function clipLine(a,b,planes){
 let lo=0,hi=1;
 for(const plane of planes){
  const da=dot(a,plane),db=dot(b,plane);
  if(da<0&&db<0)return null;
  if((da<0)!==(db<0)){const t=da/(da-db);if(da<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}
 }
 if(lo>hi)return null;
 return [lo,hi].map(t=>a.map((x,i)=>x+t*(b[i]-x)));
}
// Perspective-clipped target edges in normalised detector coordinates.
export function targetEdges(target,axes,fovY,aspect){
 if(!target)return [];
 const ky=Math.tan(fovY*DEG/2),kx=ky*aspect,planes=[[1,0,kx],[-1,0,kx],[0,1,ky],[0,-1,ky],[0,0,1]];
 const pts=target.corners.map(v=>[dot(v,axes.right),dot(v,axes.up),dot(v,axes.forward)]),segments=[];
 for(let i=0;i<4;i++){const clipped=clipLine(pts[i],pts[(i+1)%4],planes);
  if(clipped)segments.push(clipped.map(([x,y,z])=>[.5+.5*x/(z*kx),.5-.5*y/(z*ky)]));}
 return segments;
}
export function skyCompass(axes){
 const f=axes.forward,h=Math.hypot(f[0],f[1]);if(h<1e-7)return null;
 const east=[-f[1]/h,f[0]/h,0],north=unit(cross(f,east));
 return [north,east].map(dir=>[dot(dir,axes.right),-dot(dir,axes.up)]);
}
export function angularScale(fovY,pixelHeight){
 const tangent=Math.tan(fovY*DEG/2);
 for(const angle of [30,20,10,5,2,1,.5,1/3,1/6,1/12,1/30,1/60,1/120,1/300,1/600]){
  const pixels=pixelHeight*Math.tan(angle*DEG/2)/tangent;
  if(pixels<=pixelHeight*.22)return {pixels,label:angle>=1?angle+'°':angle>=1/60?Math.round(angle*60)+'′':Math.round(angle*3600)+'″'};
 }
 return null;
}
