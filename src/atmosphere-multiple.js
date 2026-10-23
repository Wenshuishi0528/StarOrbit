// Small isotropic multiple-scattering closure, following Hillaire (2020).
// Direction-averaged incident single scattering / (1 - scattering feedback).
// This approximates higher orders; it is not a spectral radiative-transfer solver.
import {RAYLEIGH,MIE_EXTINCTION,OZONE,horizonCosine} from './atmosphere-optics.js';
export const MULTIPLE_SIZE={width:32,height:24};
export function buildMultipleScatteringTable(table,{directions=24,steps=20,rayleigh=RAYLEIGH,ozone=OZONE}={}){
 const {width,height}=MULTIPLE_SIZE,data=new Float32Array(width*height*4),R=6371,A=6471;
 const sample=(h,mu)=>{
  const lo=horizonCosine(h),x=Math.sqrt(Math.max(0,Math.min(1,(mu-lo)/(1-lo))))*(table.width-1),y=Math.sqrt(Math.max(0,Math.min(1,h/100)))*(table.height-1);
  const ix=Math.min(table.width-2,Math.floor(x)),iy=Math.min(table.height-2,Math.floor(y)),a=x-ix,b=y-iy;
  const disk=Math.max(-1,Math.min(1,(mu-lo)/(.00465*R/(R+h)))),vis=(Math.acos(-disk)+disk*Math.sqrt(Math.max(0,1-disk*disk)))/Math.PI;
  return rayleigh.map((v,c)=>{const depths=[0,1,2].map(k=>{const i=(iy*table.width+ix)*4+k;return (1-b)*((1-a)*table.data[i]+a*table.data[i+4])+b*((1-a)*table.data[i+table.width*4]+a*table.data[i+(table.width+1)*4]);});return vis*Math.exp(-v*depths[0]-MIE_EXTINCTION*depths[1]-ozone[c]*depths[2]);});
 };
 let maxFeedback=0;
 for(let y=0;y<height;y++){
  const h=100*(y/(height-1))**2+.001,r=R+h;
  for(let x=0;x<width;x++){
   const u=2*x/(width-1)-1,mu=Math.sign(u)*u*u,sx=Math.sqrt(1-mu*mu),L=[0,0,0],F=[0,0,0];
   for(let j=0;j<directions;j++){
    const dz=1-2*(j+.5)/directions,phi=j*2.399963229728653,dx=Math.sqrt(1-dz*dz)*Math.cos(phi);
    const b=r*dz,ground=b<0&&b*b-r*r+R*R>0;
    const end=-b+(ground?-1:1)*Math.sqrt(Math.max(0,b*b-r*r+(ground?R*R:A*A))),closest=Math.max(0,Math.min(end,-b));
    const T=[1,1,1];
    for(const [start,stop,reverse] of [[0,closest,true],[closest,end,false]]){
     if(stop<=start)continue;
     for(let k=0;k<steps;k++){
      const u=k/steps,v=(k+1)/steps;
      const a=reverse?1-(1-u)**2:u*u,z=reverse?1-(1-v)**2:v*v;
      const t=start+(stop-start)*(a+z)/2,ds=(stop-start)*(z-a),rho=Math.sqrt(r*r+t*t+2*b*t),alt=Math.max(0,rho-R),localMu=(t*dx*sx+(r+t*dz)*mu)/rho;
      const sun=sample(alt,localMu),dr=Math.exp(-alt/8),dm=Math.exp(-alt/1.2),oz=Math.max(0,1-Math.abs(alt-25)/15);
      for(let c=0;c<3;c++){
       const scatter=rayleigh[c]*dr+.004*dm,ext=rayleigh[c]*dr+MIE_EXTINCTION*dm+ozone[c]*oz,tr=Math.exp(-ext*ds),weight=T[c]*(1-tr)/Math.max(ext,1e-10);
       L[c]+=weight*scatter*sun[c]/(4*Math.PI*directions);F[c]+=weight*scatter/directions;T[c]*=tr;
      }
     }
    }
    if(ground){const gmu=(end*dx*sx+(r+end*dz)*mu)/R,sun=sample(0,gmu);for(let c=0;c<3;c++)L[c]+=T[c]*.1*Math.max(0,gmu)*sun[c]/(Math.PI*directions);}
   }
   for(let c=0;c<3;c++){maxFeedback=Math.max(maxFeedback,F[c]);if(F[c]>=1)throw Error('Atmospheric scattering closure failed to converge');data[(y*width+x)*4+c]=L[c]/(1-F[c]);}
   data[(y*width+x)*4+3]=1;
  }
 }
 return {data,width,height,maxFeedback};
}
