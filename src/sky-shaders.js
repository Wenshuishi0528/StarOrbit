export const galaxyVertex=`varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const galaxyFragment=`varying vec3 dir;uniform float brightness,textured;uniform samplerCube skyMap;
void main(){vec3 p=normalize(dir);float b=asin(clamp(dot(p,vec3(-.867666149,-.198076373,.455983776)),-1.,1.));float l=atan(dot(p,vec3(.49410943,-.44482963,.74698224)),dot(p,vec3(-.05487556,-.87343709,-.48383502)));
vec3 color;
if(textured>.5){vec3 galactic=vec3(dot(p,vec3(-.05487556,-.87343709,-.48383502)),dot(p,vec3(.49410943,-.44482963,.74698224)),dot(p,vec3(-.867666149,-.198076373,.455983776)));vec3 sky=textureCube(skyMap,galactic).rgb;
color=sky*brightness;
}else{float wave=.55+.17*sin(l*13.+b*32.)+.12*sin(l*29.-b*71.)+.07*sin(l*63.+b*123.);float dust=1.-.65*exp(-pow((b-.022*sin(l*8.))/.032,2.))*(.6+.4*pow(sin(l*7.),2.));float band=exp(-pow(b/.13,2.))*(.55+.45*exp(-pow(l/.8,2.)))*wave*dust;color=vec3(.035,.041,.057)*band*brightness;}
gl_FragColor=vec4(color,1.);
#include <colorspace_fragment>
}`;
