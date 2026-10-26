const RAD=Math.PI/180;
export function geographicVector(lon,lat,radius=6374){const c=Math.cos(lat*RAD);return [radius*c*Math.cos(lon*RAD),radius*c*Math.sin(lon*RAD),radius*Math.sin(lat*RAD)];}
export function ringContains(ring,lon,lat){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a[1]>lat)!==(b[1]>lat)&&lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
export function regionContains(region,lon,lat){
 return region.parts.some(({box,rings})=>lon>=box[0]&&lon<=box[2]&&lat>=box[1]&&lat<=box[3]&&ringContains(rings[0],lon,lat)&&!rings.slice(1).some(r=>ringContains(r,lon,lat)));
}
export function angularDistance(lon1,lat1,lon2,lat2){
 const dlat=(lat2-lat1)*RAD,dlon=(lon2-lon1)*RAD,a=Math.sin(dlat/2)**2+Math.cos(lat1*RAD)*Math.cos(lat2*RAD)*Math.sin(dlon/2)**2;
 return 2*Math.atan2(Math.sqrt(Math.min(1,a)),Math.sqrt(Math.max(0,1-a)));
}
export class GeographyIndex{
 constructor(data){
  this.countries=data.countries;this.regions=[...data.regions].sort((a,b)=>a.area-b.area);this.capitals=data.labels.filter(x=>x.kind==='capital');this.buckets=new Map();
  // Ten-degree bins contain only regional bounding boxes, not duplicated rings.
  for(const item of [...this.countries,...this.regions])for(const p of item.parts){
   for(let x=Math.floor(p.box[0]/10);x<=Math.floor(p.box[2]/10);x++)for(let y=Math.floor(p.box[1]/10);y<=Math.floor(p.box[3]/10);y++){
    const key=x+':'+y;if(!this.buckets.has(key))this.buckets.set(key,new Set());this.buckets.get(key).add(item);
   }
  }
 }
 locate(lon,lat){
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||lat<-90||lat>90)return null;
  lon=((lon+180)%360+360)%360-180;
  const candidates=this.buckets.get(Math.floor(lon/10)+':'+Math.floor(lat/10))||[];
  let country=null;const regions=[];
  for(const r of candidates)if(regionContains(r,lon,lat)){if(r.kind==='country'){if(!country||r.id==='country-CHN')country=r;}else regions.push(r);}
  regions.sort((a,b)=>a.area-b.area);
  const physical=regions.find(r=>country?r.kind!=='marine':r.kind==='marine'||r.kind==='lake');
  let nearby=null,distance=80;
  if(country)for(const p of this.capitals){const km=angularDistance(lon,lat,p.lon,p.lat)*6371;if(km<distance){distance=km;nearby=p;}}
  return {country,physical,nearby,distance};
 }
}
