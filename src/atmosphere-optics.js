// Optical path lengths in km. Earth profiles follow Bruneton's reference model:
// https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/demo/demo.cc.html
// This is a compact single-scattering model, not a multiple-scattering solver.
export const ATMOSPHERE={radius:6371,top:6471,width:256,height:128};
export const RAYLEIGH=[.005802,.013558,.0331],MIE_EXTINCTION=.00444;
export const OZONE=[.000650,.001881,.000085];
export function ozoneDensity(h){return Math.max(0,1-Math.abs(h-25)/15);}
export function horizonCosine(h){const r=ATMOSPHERE.radius+h;return -Math.sqrt(Math.max(0,1-(ATMOSPHERE.radius/r)**2));}
// Integrate both sides of the tangent separately, concentrating samples near
// minimum altitude. This resolves the 1.2 km aerosol layer without long light marches.
export function opticalDepth(h,mu,count=64){
 const {radius:R,top:A}=ATMOSPHERE,r=R+h,b=r*mu;
 const end=-b+Math.sqrt(Math.max(0,b*b+A*A-r*r)),closest=Math.max(0,Math.min(end,-b));
 const sum=[0,0,0];
 for(const [start,stop,reverse] of [[0,closest,true],[closest,end,false]]){
  const span=stop-start;if(span<=0)continue;
  for(let i=0;i<count;i++){
   let a=(i/count)**2,c=((i+1)/count)**2;
   if(reverse){const old=a;a=1-c;c=1-old;}
   const t=start+span*(a+c)/2,ds=span*(c-a);
   const alt=Math.max(0,Math.sqrt(r*r+t*t+2*b*t)-R);
   sum[0]+=Math.exp(-alt/8)*ds;sum[1]+=Math.exp(-alt/1.2)*ds;sum[2]+=ozoneDensity(alt)*ds;
  }
 }
 return sum;
}
// Nonlinear coordinates put resolution at the tangent and in the lower air.
export function opticalDepthUV(h,mu){const lo=horizonCosine(h);return [Math.sqrt(Math.max(0,Math.min(1,(mu-lo)/(1-lo)))),Math.sqrt(Math.max(0,Math.min(1,h/100)))];}
export function buildOpticalDepthTable(){
 const {width,height}=ATMOSPHERE,data=new Float32Array(width*height*4);
 for(let y=0;y<height;y++){
  const h=100*(y/(height-1))**2,lo=horizonCosine(h);
  for(let x=0;x<width;x++){
   const mu=lo+(1-lo)*(x/(width-1))**2,depth=opticalDepth(h,mu),i=(y*width+x)*4;
   data.set([...depth,1],i);
  }
 }
 return {data,width,height};
}
