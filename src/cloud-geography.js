// Geographic priors for the illustrative local weather generator, not forecast data.
// Broad dry interiors, humid tropical land and eastern-ocean low-cloud regions.
// Clouds and latitude belts: https://science.nasa.gov/earth/earth-observatory/cloudy-earth-85843/
const dry=[[15,24,28,10],[46,24,14,10],[134,-25,17,10],[91,42,24,12],[-70,-24,6,15],[18,-24,11,14]];
const humid=[[-62,-5,25,13],[23,0,18,13],[118,2,30,15]];
const marine=[[-87,-18,16,18],[-127,27,12,16],[0,-22,16,18],[-24,23,14,16]];
const wrap=d=>((d+180)%360+360)%360-180;
const field=(regions,lon,lat)=>Math.max(...regions.map(([x,y,w,h])=>Math.exp(-((wrap(lon-x)/w)**2+((lat-y)/h)**2))));
export function climateMasks(lon,lat){return [field(dry,lon,lat),field(humid,lon,lat),field(marine,lon,lat)];}
export function climatePixels(width=512,height=256){
 const data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const masks=climateMasks((x+.5)/width*360-180,(y+.5)/height*180-90),i=(y*width+x)*4;
  masks.forEach((v,k)=>data[i+k]=Math.round(v*255));data[i+3]=255;
 }
 return data;
}
