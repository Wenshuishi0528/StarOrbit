// Profiles describe the bytes in the zoom pyramid, which can differ from the
// profile of the official preview. The download cache always holds the originals.
import profileGroups from './sky-archive-color-data.json' with { type: 'json' };

const profiles = new Map();
for (const [name, ids] of Object.entries(profileGroups)) {
  for (const id of ids) profiles.set(id, name);
}

export function archiveColorProfile(id) {
  return profiles.get(id) ?? 'srgb';
}

// The GPU decodes the sRGB transfer function during texture sampling for both
// sRGB and Display P3. Adobe and ProPhoto have different transfer functions.
export function archiveUsesSRGBTransfer(profile) {
  return !profile || profile === 'srgb' || profile === 'p3';
}

// Linear primaries to linear sRGB, including the ICC D50 white-point adaptation.
// The matrix columns below use GLSL storage order. Profiles are specialized when
// a material is compiled, so the sRGB conversion reduces to a clamp.
export const archiveColorGLSL = `
vec3 archiveLinearRGB(vec3 c) {
 #ifdef ARCHIVE_PROPHOTO
  c=mix(pow(c,vec3(1.8)),c/16.,lessThanEqual(c,vec3(.03125)));
  c=mat3(2.03411,-.22878,-.00854, -.72769,1.23184,-.15328, -.30674,-.00291,1.16195)*c;
 #elif defined(ARCHIVE_MONO)
  // Black-point-compensated ISOuncoated_mono tone curve for the COSMOS grayscale plates.
  float x=c.r;
  c=vec3(x-x*(1.-x)*(.72483621+x*(.47403654+x*(-.40923507+x*.23332050))));
 #elif defined(ARCHIVE_DOT15)
  // Adobe's Dot Gain 15% grayscale working space.
  float x=c.r;
  c=vec3(x-x*(1.-x)*(.8823794+x*(-1.30839914+x*(2.68559914+x*(-3.03884283+x*1.32289039)))));
 #elif defined(ARCHIVE_LSTAR) || defined(ARCHIVE_ECI188)
  #ifdef ARCHIVE_LSTAR
   c=mix(pow((100.*c+16.)/116.,vec3(3.)),c*(100./903.2962963),lessThanEqual(c,vec3(.08)));
  #else
   c=pow(c,vec3(482./256.));
  #endif
  c=mat3(1.52000,-.02276,-.02656, -.44876,.98162,-.02974, -.07118,.04115,1.05587)*c;
 #elif defined(ARCHIVE_ADOBE)
  c=pow(c,vec3(563./256.));
  c=mat3(1.39826,0.,0., -.39846,1.,-.04295, 0.,0.,1.04267)*c;
 #elif defined(ARCHIVE_P3)
  c=mat3(1.22486,-.04203,-.01963, -.22509,1.04215,-.07863, 0.,0.,1.09799)*c;
 #endif
 return clamp(c,0.,1.);
}

// The orbital view composites the sky, atmospheric transmission, Earth and the
// Sun in a single signed half-float target before Three's ACES display pass.
// Put a published display colour into that scene by inverting the ACES fit.
// Foregrounds retain their usual ordering and no extra sky target is needed.
vec3 archiveBeforeACES(vec3 displayLinear,float exposure){
 const mat3 inverseOutput=mat3(
  .64303825,.05926869,.00596190, .31118675,.93143649,.06392902, .04577546,.00929492,.93011838);
 const mat3 inverseInput=mat3(
  1.76474097,-.14702785,-.03633683, -.67577768,1.16025151,-.16243644, -.08896329,-.01322366,1.19877327);
 vec3 y=inverseOutput*clamp(displayLinear,0.,1.);
 vec3 a=1.-.983729*y,b=.0245786-.432951*y,c=.000090537+.238081*y;
 vec3 v=(sqrt(b*b+4.*a*c)-b)/(2.*a);
 return inverseInput*v*(.6/max(exposure,.00001));
}
`;
