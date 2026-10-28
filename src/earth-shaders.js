import {lightningGLSL} from './phenomena.js';
import {cloudToneGLSL} from './cloud-texture.js';
import {scatteringGLSL} from './atmosphere-scattering.js';
import {solarOpticsGLSL} from './atmosphere-glsl.js';
import {cloudMoonGLSL} from './cloud-lighting.js';
export const vertex=`varying vec3 localN;varying vec3 worldN;varying vec3 worldP;
void main(){localN=normalize(position);worldN=normalize(mat3(modelMatrix)*localN);worldP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(worldP,1.);}`;
const mapUVCode=`vec2 mapUV(vec3 p){p=normalize(p);return vec2(atan(p.y,p.x)/6.28318530718+.5,asin(clamp(p.z,-1.,1.))/3.14159265359+.5);}`;
const mapping=`${mapUVCode}
vec2 wrapGradient(vec2 v){v.x-=floor(v.x+.5);return v;}
#ifdef CLOUD_RAYMARCH
vec2 cloudDx,cloudDy;
vec4 sampleMap(sampler2D tex,vec2 uv){return textureGrad(tex,uv,cloudDx,cloudDy);}
#else
vec4 sampleMap(sampler2D tex,vec2 uv){return textureGrad(tex,uv,wrapGradient(dFdx(uv)),wrapGradient(dFdy(uv)));}
#endif
`;
const output=`\n#include <tonemapping_fragment>\n#include <colorspace_fragment>
// Static, sub-code-value dithering avoids 8-bit colour bands without temporal flicker.
if(enhanced>.5&&linearOutput<.5){float grain=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;gl_FragColor.rgb+=grain/255.;}`;
const noise=`float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise3(p);p=p*2.03+7.1;a*=.5;}return v;}`;
const clouds=`${solarOpticsGLSL}${cloudToneGLSL}uniform sampler2D cloudMap,cloudTemplateMap,climateMap,oceanMap;uniform float cloudAmount,cloudNightVisible,cloudMode,weatherTime,seed,enhanced,cloudMotion,motionTime,cloudSeason,cloudChannel;${noise}
vec3 aroundAxis(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c-p.y*s,p.x*s+p.y*c,p.z);}
float cloudAt(vec3 p){p=normalize(p);
if(cloudMode<.5){vec4 mask=sampleMap(cloudMap,mapUV(aroundAxis(p,cloudMotion*motionTime*.004*(.5+.5*sin(p.z*4.)))));return cloudOpacity(mix(mask.r,mask.a,cloudChannel));}
// Geography remains Earth-fixed while synoptic texture evolves inside its envelope.
vec2 uv=mapUV(p);float lat=(uv.y-.5)*180.,lon=(uv.x-.5)*6.2831853,ab=abs(lat);
float ocean=smoothstep(.15,.85,sampleMap(oceanMap,uv).r);vec3 region=sampleMap(climateMap,uv).rgb;
float itcz=exp(-pow((lat-(3.+cloudSeason*7.+sin(lon*2.)*2.))/9.,2.));
float storms=exp(-pow((ab-48.-3.*sin(lon*3.))/13.,2.));float subtropics=exp(-pow((ab-25.)/10.,2.));
float moisture=clamp(.50+.18*ocean+.32*itcz+.28*storms-.18*subtropics+region.g*(1.-ocean)*.22-region.r*(1.-ocean)*.67+region.b*ocean*.22,.07,1.25);
// Advected observed cloud morphology retains fronts, filaments and marine decks.
// Only bounded displacement and density changes are synthesized; no global white noise blobs.
float time=weatherTime*cloudMotion,phase=seed*.017;
float wind=mix(-1.,1.,smoothstep(24.,40.,ab));float shift=wind*.035*sin(time*.025+phase)+.018*sin(phase*2.);
vec3 moved=aroundAxis(p,shift);moved.z+=.009*sin(lon*5.+phase+time*.018);moved=normalize(moved);
float base=sampleMap(cloudTemplateMap,mapUV(moved)).r;
float secondary=sampleMap(cloudTemplateMap,mapUV(aroundAxis(moved,.055*sin(phase+1.)))).r;
float weather=noise3(moved*12.+vec3(seed*.003,time*.015,seed*.002));
float coverage=mix(base,secondary,.15+.20*weather);
return clamp(pow(max(coverage,0.),mix(2.8,.72,clamp(moisture,0.,1.)))*(.7+.3*moisture)*(.85+.3*weather),0.,1.);
}`;

const detail=`uniform sampler2D detailMap0,detailMap1,detailMap2,detailMap3;
uniform sampler2D nightDetailMap0,nightDetailMap1,nightDetailMap2,nightDetailMap3;
uniform vec4 nightDetailRect0,nightDetailRect1,nightDetailRect2,nightDetailRect3;
uniform float nightDetailFade0,nightDetailFade1,nightDetailFade2,nightDetailFade3;
uniform vec4 detailRect0,detailRect1,detailRect2,detailRect3;
uniform float detailFade0,detailFade1,detailFade2,detailFade3;
vec3 sampleDetail(sampler2D tex,vec4 rect,float fade,vec2 uv,vec2 dx,vec2 dy,vec3 base){
 if(fade<=0.)return base;
 vec2 p=(uv-rect.xy)/rect.zw;if(any(lessThan(p,vec2(0.)))||any(greaterThanEqual(p,vec2(1.))))return base;
 float scale=1800./1816.;vec2 tuv=(p*1800.+8.)/1816.;
 float footprint=max(length(dx*vec2(8192.,4096.)),length(dy*vec2(8192.,4096.)));
 float weight=fade*(1.-smoothstep(.6,1.5,footprint));
 return mix(base,textureGrad(tex,tuv,dx/rect.zw*scale,dy/rect.zw*scale).rgb,weight);
}
vec3 groundColor(vec2 uv){
 vec3 c=sampleMap(dayMap,uv).rgb;if(enhanced<.5)return c;
 vec2 dx=dFdx(uv),dy=dFdy(uv);dx.x-=floor(dx.x+.5);dy.x-=floor(dy.x+.5);
 c=sampleDetail(detailMap0,detailRect0,detailFade0,uv,dx,dy,c);
 c=sampleDetail(detailMap1,detailRect1,detailFade1,uv,dx,dy,c);
 c=sampleDetail(detailMap2,detailRect2,detailFade2,uv,dx,dy,c);
 return sampleDetail(detailMap3,detailRect3,detailFade3,uv,dx,dy,c);
}
vec3 nightColor(vec2 uv){
 vec3 c=sampleMap(nightMap,uv).rgb;if(enhanced<.5)return c;
 vec2 dx=dFdx(uv),dy=dFdy(uv);dx.x-=floor(dx.x+.5);dy.x-=floor(dy.x+.5);
 c=sampleDetail(nightDetailMap0,nightDetailRect0,nightDetailFade0,uv,dx,dy,c);
 c=sampleDetail(nightDetailMap1,nightDetailRect1,nightDetailFade1,uv,dx,dy,c);
 c=sampleDetail(nightDetailMap2,nightDetailRect2,nightDetailFade2,uv,dx,dy,c);
 c=sampleDetail(nightDetailMap3,nightDetailRect3,nightDetailFade3,uv,dx,dy,c);
 return c.r*vec3(1.,.72,.38);
}`;
export const earthFragment=`uniform sampler2D dayMap,nightMap;uniform vec3 sun,localSun;uniform float detailed,gloss;
varying vec3 localN,worldN,worldP;${mapping}${clouds}${detail}
void main(){vec3 n=normalize(worldN),s=normalize(sun),eye=normalize(cameraPosition-worldP);vec2 uv=mapUV(localN);float mu=dot(n,s),day=max(mu,0.);vec3 albedo=groundColor(uv);
// NASA land composite has nearly black open water. Apply a water reflectance only
// to dark ocean texels; retain land/coast colours and the existing solar glint.
float ocean=smoothstep(.2,.8,sampleMap(oceanMap,uv).r);
if(enhanced>.5){float water=ocean*(1.-smoothstep(.015,.06,max(albedo.r,max(albedo.g,albedo.b))));albedo=mix(albedo,max(albedo,vec3(.008,.038,.12)),water);}
vec3 directSun=enhanced>.5?sunlightAt(0.,mu):vec3(1.);
vec3 color=albedo*(.002+directSun*1.15*day);
if(detailed>.5){float c=cloudAt(localN)*cloudAmount;float shadow=c;
if(enhanced>.5){float b=dot(normalize(localN)*6371.,normalize(localSun));float dist=-b+sqrt(max(0.,b*b+2.*6371.*8.+64.));shadow=cloudAt(normalize(localN)*6371.+normalize(localSun)*dist)*cloudAmount;}
color*=1.-shadow*mix(.22,.48,enhanced)*smoothstep(-.01,.08,mu);
vec3 night=nightColor(uv);color+=night*mix(2.3,1.2,enhanced)*(1.-smoothstep(-.15,.07,mu))*(1.-c*.85);
float highlight=pow(max(0.,dot(reflect(-s,n),eye)),gloss);float fresnel=.04+.96*pow(1.-max(0.,dot(n,eye)),5.);
color+=(enhanced>.5?directSun:vec3(1.,.91,.73))*ocean*highlight*day*mix(.6,.3+fresnel*2.,enhanced);
}
gl_FragColor=vec4(color,1.);${output}}`;
export const cloudFragment=`uniform vec3 sun;varying vec3 localN,worldN,worldP;${mapping}${clouds}${scatteringGLSL}${lightningGLSL}${cloudMoonGLSL}
void main(){float c=cloudAt(localN);float mu=dot(normalize(worldN),normalize(sun)),light=max(mu,0.);vec3 eye=normalize(cameraPosition-worldP);
float alpha=c*cloudAmount;vec3 color=vec3(.9,.96,1.)*(.004*smoothstep(-.16,0.,mu)+light*1.4);
if(enhanced>.5){c=pow(clamp(c,0.,1.),1.3);
// Cloud tops can remain sunlit after the ground enters shadow. Use their height,
// not an orange ramp tied only to solar elevation. Forward light shares its RGB extinction.
vec3 directSun=sunlightAt(max(0.,length(worldP)-6371.),mu);
float silver=pow(max(dot(eye,-normalize(sun)),0.),12.)*smoothstep(.02,.24,c)*(1.-smoothstep(.6,1.,c));
vec3 ambient=vec3(.003,.005,.008)*smoothstep(-.16,.08,mu);
color=ambient+directSun*((max(mu,0.)+.035)*1.45+silver*.32);color*=.48+.52*c;
alpha=clamp(c*cloudAmount,0.,.98);}
if(alpha<.001)discard;
// Preserve solar shading; the visibility option adds only weak night-side moonlight.
color+=nightCloudLight(worldP,mu)*(enhanced>.5?(.48+.52*c):1.);
color+=cloudLightning(localN);
if(linearComposite>.5)color=cloudAerial(worldP,color,normalize(sun));
gl_FragColor=vec4(color,clamp(alpha,0.,.96));${output}}`;
// Single scattering with separate Rayleigh/Mie density scales; no weather dynamics assumed.
export const atmosphereFragment=`${solarOpticsGLSL}${scatteringGLSL}uniform vec3 sun;uniform float enhanced,airglowOnly;varying vec3 worldP;

void main(){vec3 o=cameraPosition,d=normalize(worldP-o),s=normalize(sun);vec2 a=hit(o,d,A);float begin=max(0.,a.x),end=a.y;vec2 ground=hit(o,d,R);if(ground.x>0.)end=min(end,ground.x);if((end<=begin||airglowOnly>.5)&&enhanced<.5){vec3 glow=nightglow(o,d,s,ground.x>0.?ground.x:1e8);float alpha=clamp(max(glow.r,max(glow.g,glow.b))*4.,0.,.15);if(alpha<=0.)discard;gl_FragColor=vec4(glow/alpha,alpha);${output}return;}
if(enhanced>.5){
 vec3 glow=nightglow(o,d,s,ground.x>0.?ground.x:1e8);
 if(end>begin)gl_FragColor=fineAtmosphere(o,d,s,begin,end);else gl_FragColor=vec4(vec3(0.),linearComposite>.5?1.:0.);
 if(linearComposite>.5)gl_FragColor.rgb+=glow;
 else{float alpha=max(gl_FragColor.a,clamp(max(glow.r,max(glow.g,glow.b))*4.,0.,.1));gl_FragColor.rgb=(gl_FragColor.rgb*gl_FragColor.a+glow)/max(alpha,.00001);gl_FragColor.a=alpha;}
 ${output}return;
}
// Split quadrature at the Earth-shadow cylinder rather than switching whole
// samples on/off. The illuminated interval varies continuously across pixels.
float os=dot(o,s),dsun=dot(d,s),qa=1.-dsun*dsun,qb=dot(o,d)-os*dsun,qc=dot(o,o)-os*os-R*R;
float disc=qb*qb-qa*qc;float cut1=begin,cut2=begin;
if(disc>0.&&qa>.000001){float root=sqrt(disc);cut1=clamp((-qb-root)/qa,begin,end);cut2=clamp((-qb+root)/qa,begin,end);}
float lengths[3];lengths[0]=cut1-begin;lengths[1]=cut2-cut1;lengths[2]=end-cut2;
float starts[3];starts[0]=begin;starts[1]=cut1;starts[2]=cut2;
float odR=0.,odM=0.;vec3 sum=vec3(0.);float cs=dot(d,s),pr=.059683*(1.+cs*cs),g=.76,pm=.119366*(1.-g*g)*(1.+cs*cs)/((2.+g*g)*pow(1.+g*g-2.*g*cs,1.5));
int segmentCount=0;for(int j=0;j<3;j++){if(lengths[j]>.0001)segmentCount++;}
int count=max(2,steps/max(segmentCount,1));
for(int j=0;j<3;j++){
 float span=lengths[j];if(span<.0001)continue;
 for(int i=0;i<32;i++){if(i>=count)break;
  float u0=float(i)/float(count),u1=float(i+1)/float(count);
  // Concentrate samples near the dense lower atmosphere on ground-facing rays.
  if(ground.x>0.){u0=1.-(1.-u0)*(1.-u0);u1=1.-(1.-u1)*(1.-u1);}
  float ds=span*(u1-u0);vec3 p=o+d*(starts[j]+span*(u0+u1)*.5);float rho=length(p),h=max(0.,rho-R),r=exp(-h/8.),m=exp(-h/1.2);
  float mu=dot(p/rho,s),ratio=R/rho,limb=sqrt(max(0.,1.-ratio*ratio));
  float visibility=smoothstep(-.00465*ratio,.00465*ratio,mu+limb);
  float slant=(2.-smoothstep(-.03,.03,mu))/sqrt(max(.0007,mu*mu+.0025));
  vec3 tau=betaR*(odR+r*ds*.5+r*8.*slant)+betaM*(odM+m*ds*.5+m*1.2*slant);
  sum+=exp(-tau)*(betaR*r*pr+betaM*m*pm)*ds*visibility;odR+=r*ds;odM+=m*ds;
 }
}
vec3 trans=exp(-(betaR*odR+betaM*odM));float alpha=clamp(1.-dot(trans,vec3(.2126,.7152,.0722)),0.,.98);vec3 color=sum*8./max(alpha,.001);vec3 glow=nightglow(o,d,s,ground.x>0.?ground.x:1e8);
float combined=max(alpha,clamp(max(glow.r,max(glow.g,glow.b))*4.,0.,.15));
gl_FragColor=vec4((color*alpha+glow)/max(combined,.00001),combined);${output}}`;
export const atmosphereTransmissionFragment=`${solarOpticsGLSL}varying vec3 worldP;
void main(){vec3 o=cameraPosition,d=normalize(worldP-o);float b=dot(o,d),r2=dot(o,o),h=b*b-r2+6471.*6471.;if(h<=0.)discard;
float start=max(0.,-b-sqrt(h));vec3 p=o+d*start;float g=b*b-r2+6371.*6371.;vec3 depth;
if(g>0.&&-b-sqrt(g)>0.){p=o+d*(-b-sqrt(g));depth=lightDepth(0.,dot(normalize(p),-d));}
else depth=lightDepth(clamp(length(p)-6371.,0.,100.),dot(normalize(p),d));
gl_FragColor=vec4(spectralTransmission(depth),1.);}`;
export const auroraFragment=`uniform sampler2D auroraMap;uniform vec3 sun;uniform float useData,strength,weatherTime,seed;varying vec3 localN,worldN,worldP;${mapping}${noise}
void main(){vec3 p=normalize(localN);vec3 pole=normalize(vec3(.048,-.154,.987));float lat=asin(clamp(dot(p,pole),-1.,1.));float lon=atan(p.y,p.x);float t=weatherTime*6.;float wave=sin(lon*7.+t*.3+seed)*.025+sin(lon*17.-t*.16)*.012;
float oval=exp(-pow((abs(lat)-1.16-wave)/.065,2.));float data=sampleMap(auroraMap,mapUV(p)).r;float mask=mix(oval,data,useData);
float height=length(worldP)-6371.;float fold=lon*180.+sin(lon*13.+t*.3)*9.+fbm(p*23.+vec3(t*.04))*16.;float curtain=pow(.5+.5*sin(fold+height*.006),3.)*(.35+.65*noise3(p*40.+vec3(t*.03))); float vertical=exp(-pow((height-150.)/65.,2.));float night=1.-smoothstep(-.16,.08,dot(normalize(worldN),normalize(sun)));
float a=mask*curtain*vertical*strength*night*.08;vec3 color=mix(vec3(.008,1.,.035),vec3(.65,.002,.09),smoothstep(180.,310.,height));gl_FragColor=vec4(color*1.8,clamp(a,0.,.2));\n#include <colorspace_fragment>}`;
// True ray-marched cloud shell. Satellite coverage is measured; vertical profile/detail is illustrative.
export const volumeCloudFragment=`#define CLOUD_RAYMARCH
uniform vec3 sun,localSun;uniform mat3 earthInverse;uniform int cloudSteps;varying vec3 worldP;${mapping}${clouds}${scatteringGLSL}${lightningGLSL}${cloudMoonGLSL}
vec2 cloudHit(vec3 o,vec3 d,float r){float b=dot(o,d),h=b*b-dot(o,o)+r*r;if(h<0.)return vec2(1e9,-1e9);h=sqrt(h);return vec2(-b-h,-b+h);}
float densityAt(vec3 p){float h=length(p)-6371.;if(h<1.5||h>15.)return 0.;float c=cloudAt(p);if(c<=0.)return 0.;
// The measured mask controls both thickness and optical density. A continuous
// response preserves differences inside bright cloud fields instead of clipping
// everything above 0.85 to the same opaque column.
float top=mix(4.,13.,c*c),profile=smoothstep(1.5,3.,h)*(1.-smoothstep(top,top+2.,h));if(profile<.001)return 0.;
float detail=noise3(p*.22+vec3(seed*.1,weatherTime*.07*cloudMotion,0.));return profile*pow(c,1.6)*(.9+.1*detail)*cloudAmount;}
void main(){vec3 o=earthInverse*cameraPosition,d=normalize(earthInverse*worldP-o),s=normalize(localSun);
// Derivatives must be evaluated before any per-pixel discard/early-exit loop.
// Use the same cloud-shell ray footprint for density and light-path samples.
float b=dot(o,d),disc=b*b-dot(o,o)+6379.*6379.;
vec3 reference=normalize(o+d*max(0.,-b-sqrt(max(0.,disc))));
vec2 uv=mapUV(aroundAxis(reference,cloudMotion*motionTime*.004*(.5+.5*sin(reference.z*4.))));
cloudDx=wrapGradient(dFdx(uv));cloudDy=wrapGradient(dFdy(uv));
vec2 outer=cloudHit(o,d,6387.),inner=cloudHit(o,d,6372.5);float begin=max(0.,outer.x),end=outer.y;if(inner.x>begin)end=min(end,inner.x);vec2 ground=cloudHit(o,d,6371.);if(ground.x>0.)end=min(end,ground.x);if(end<=begin)discard;
vec3 lightning=cloudLightning(reference);
float ds=(end-begin)/float(cloudSteps),trans=1.,depthMoment=0.;vec3 sum=vec3(0.);float forward=pow(max(dot(d,s),0.),8.);
for(int i=0;i<40;i++){if(i>=cloudSteps||trans<.025)break;vec3 p=o+d*(begin+(float(i)+.5)*ds);float den=densityAt(p);if(den<.001)continue;float mu=dot(normalize(p),s);float lightDepth=(densityAt(p+s*3.)*3.+densityAt(p+s*8.)*5.)*.22;vec3 direct=exp(-lightDepth)*sunlightAt(length(p)-6371.,mu);
vec3 light=vec3(.16,.22,.3)*max(mu+.12,0.)+direct*(.65+max(mu,0.)*.7+forward*.6)+vec3(.002)*smoothstep(-.16,0.,mu);
vec3 moon=nightCloudLight(transpose(earthInverse)*p,mu);
if(dot(moon,moon)>0.){vec3 m=normalize(earthInverse*cloudMoonPosition-p);float depth=(densityAt(p+m*3.)*3.+densityAt(p+m*8.)*5.)*.22;light+=moon*exp(-depth);}
light+=lightning;
float alpha=1.-exp(-den*.25*ds);sum+=trans*alpha*light;depthMoment+=trans*alpha*(begin+(float(i)+.5)*ds);trans*=1.-alpha;}
float alpha=1.-trans;if(alpha<.001)discard;vec3 color=sum/max(alpha,.001);
if(linearComposite>.5){vec3 p=transpose(earthInverse)*(o+d*clamp(depthMoment/alpha,begin,end));color=cloudAerial(p,color,normalize(sun));}
gl_FragColor=vec4(color,alpha);${output}}`;
