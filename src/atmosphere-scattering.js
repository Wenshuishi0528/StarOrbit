// Shared finite-path atmosphere for ground, cloud tops and cloud representative depths.
export const scatteringGLSL=`uniform int steps;uniform float linearComposite,airglowStrength,multipleStrength;uniform sampler2D multipleDepth,multipleDepthB;
const float R=6371.;const float A=6471.;const vec3 betaR=vec3(.0058,.0135,.0331);const vec3 betaM=vec3(.004);
vec2 hit(vec3 o,vec3 d,float r){float b=dot(o,d),h=b*b-dot(o,o)+r*r;if(h<0.)return vec2(1e9,-1e9);h=sqrt(h);return vec2(-b-h,-b+h);}
vec3 multipleLight(sampler2D lut,float h,float mu){
 float x=.5+.5*sign(mu)*sqrt(abs(mu)),y=sqrt(clamp(h/100.,0.,1.));
 return texture2D(lut,(vec2(x,y)*vec2(31.,23.)+.5)/vec2(32.,24.)).rgb*multipleStrength;
}
vec3 viewTransmission(vec3 p,vec3 direction){
 float r=length(p);if(r>6471.){vec2 t=hit(p,direction,6471.);if(t.x<0.||t.y<0.)return vec3(1.);p+=direction*t.x;r=6471.;}
 vec3 depth=lightDepth(clamp(r-R,0.,100.),dot(p/r,direction));
 return spectralTransmission(depth);
}
vec3 nightglow(vec3 o,vec3 d,vec3 s,float stop){
 vec3 result=vec3(0.);
 // Weak phenomenological emission layers, not aurora or direct solar scattering.
 for(int band=0;band<2;band++){
  float low=band==0?70.:180.,high=band==0?112.:300.;
  vec2 outer=hit(o,d,R+high),inner=hit(o,d,R+low);
  float a=max(0.,outer.x),b=min(stop,outer.y);if(b<=a)continue;
  float cuts[4];cuts[0]=a;cuts[1]=clamp(inner.x,a,b);cuts[2]=clamp(inner.y,a,b);cuts[3]=b;
  if(inner.y<inner.x){cuts[1]=b;cuts[2]=b;}
  for(int side=0;side<2;side++){
   float start=cuts[side*2],span=cuts[side*2+1]-start;if(span<=0.)continue;
   for(int i=0;i<6;i++){
    vec3 p=o+d*(start+span*(float(i)+.5)/6.);float rho=length(p),h=rho-R,mu=dot(p/rho,s);
    float night=1.-smoothstep(-.15,.03,mu);if(night<=0.)continue;
    vec3 emission=band==0?vec3(.16,1.,.12)*exp(-pow((h-92.)/7.,2.))*1.8e-5+vec3(1.,.33,.035)*exp(-pow((h-87.)/4.,2.))*4.e-6:vec3(1.,.065,.025)*exp(-pow((h-240.)/25.,2.))*1.1e-6;
    result+=emission*night*viewTransmission(p,-d)*(span/6.);
   }
  }
 }
 return result*airglowStrength;
}
vec4 fineAtmosphere(vec3 o,vec3 d,vec3 s,float begin,float end){

 float os=dot(o,s),sd=dot(d,s),qa=1.-sd*sd,qb=dot(o,d)-os*sd,qc=dot(o,o)-os*os-R*R;
 float disc=qb*qb-qa*qc,cut1=begin,cut2=begin;
 if(disc>0.&&qa>.000001){float root=sqrt(disc);cut1=clamp((-qb-root)/qa,begin,end);cut2=clamp((-qb+root)/qa,begin,end);}
 float tangent=clamp(-dot(o,d),begin,end);
 float cuts[5];cuts[0]=begin;cuts[1]=cut1;cuts[2]=cut2;cuts[3]=tangent;cuts[4]=end;
 // Sort the interior boundaries: fixed work per interval avoids the old jump
 // in sample count when an Earth-shadow intersection appears or disappears.
 for(int k=1;k<3;k++){for(int j=1;j<4;j++){if(j<4-k&&cuts[j]>cuts[j+1]){float v=cuts[j];cuts[j]=cuts[j+1];cuts[j+1]=v;}}}
 vec3 trans=vec3(1.),sum=vec3(0.),transB=vec3(1.),sumB=vec3(0.);
 float cs=dot(d,s),pr=rayleighPhase(cs),pm=miePhase(cs);
 int count=steps>=32?12:8;
 for(int j=0;j<4;j++){
  float start=cuts[j],span=cuts[j+1]-start;if(span<.0001)continue;
  bool approaching=(start+span*.5)<tangent;
  for(int i=0;i<12;i++){if(i>=count)break;
   float u0=float(i)/float(count),u1=float(i+1)/float(count);
   if(approaching){u0=1.-(1.-u0)*(1.-u0);u1=1.-(1.-u1)*(1.-u1);}else{u0*=u0;u1*=u1;}
   float ds=span*(u1-u0);vec3 p=o+d*(start+span*(u0+u1)*.5);
   float rho=length(p),h=max(0.,rho-R),r=exp(-h/8.),m=exp(-h/1.2),oz=max(0.,1.-abs(h-25.)/15.);
   float mu=dot(p/rho,s),vis=solarVisibility(h,mu);vec3 depth=lightDepth(h,mu);
   vec3 extA=rayA*r+vec3(.00444)*m+ozA*oz,extB=rayB*r+vec3(.00444)*m+ozB*oz;
   vec3 segA=exp(-extA*ds),segB=exp(-extB*ds);
   vec3 sunA=exp(-rayA*depth.r-vec3(.00444)*depth.g-ozA*depth.b)*vis;
   vec3 sunB=exp(-rayB*depth.r-vec3(.00444)*depth.g-ozB*depth.b)*vis;
   sum+=trans*(sunA*(rayA*r*pr+betaM*m*pm)+(rayA*r+betaM*m)*multipleLight(multipleDepth,h,mu))*(vec3(1.)-segA)/max(extA,vec3(1.e-7));
   sumB+=transB*(sunB*(rayB*r*pr+betaM*m*pm)+(rayB*r+betaM*m)*multipleLight(multipleDepthB,h,mu))*(vec3(1.)-segB)/max(extB,vec3(1.e-7));
   trans*=segA;transB*=segB;
  }
 }
 sum=spectralRGB(sum,sumB);trans=spectralRGB(trans,transB);
 float alpha=clamp(1.-dot(trans,vec3(.2126,.7152,.0722)),0.,.9999);
 if(linearComposite>.5)return vec4(sum*4.,1.);
 return vec4(sum*4./max(alpha,.00001),alpha);
}
vec3 cloudAerial(vec3 p,vec3 color,vec3 s){
 vec3 o=cameraPosition,d=normalize(p-o);float end=length(p-o),begin=max(0.,hit(o,d,A).x);
 vec3 light=end>begin?fineAtmosphere(o,d,s,begin,end).rgb:vec3(0.);
 return color*viewTransmission(p,-d)+light+nightglow(o,d,s,end);
}
`;
