export const galaxyVertex=`varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
// Shared J2000/ICRS → galactic axes and the ordinary-mode analytic band.
// Both cameras look into the same six faces prepared by prepare-sky.py.
export const galaxyCoordinatesGLSL=`
vec3 galacticDirection(vec3 p){return vec3(dot(p,vec3(-.05487556,-.87343709,-.48383502)),dot(p,vec3(.49410943,-.44482963,.74698224)),dot(p,vec3(-.867666149,-.198076373,.455983776)));}
vec3 ordinaryGalaxy(vec3 g){float b=asin(clamp(g.z,-1.,1.)),l=atan(g.y,g.x);
float wave=.55+.17*sin(l*13.+b*32.)+.12*sin(l*29.-b*71.)+.07*sin(l*63.+b*123.);float dust=1.-.65*exp(-pow((b-.022*sin(l*8.))/.032,2.))*(.6+.4*pow(sin(l*7.),2.));float band=exp(-pow(b/.13,2.))*(.55+.45*exp(-pow(l/.8,2.)))*wave*dust;return vec3(.035,.041,.057)*band;}`;
export const galaxyFragment=`varying vec3 dir;uniform float brightness,textured;uniform samplerCube skyMap;
${galaxyCoordinatesGLSL}
void main(){vec3 g=galacticDirection(normalize(dir));
vec3 color=textured>.5?textureCube(skyMap,g).rgb:ordinaryGalaxy(g);
gl_FragColor=vec4(color*brightness,1.);
#include <colorspace_fragment>
}`;
