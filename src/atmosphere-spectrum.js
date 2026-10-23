// Six spectral nodes; CIE 1931 + solar-spectrum integration, vacuum-white balanced.
// Weights include incident solar irradiance. Input is unit-irradiance transport.
// Derived from Bruneton spectral data; provenance and limitations: docs/v0.20-details.md.
export const WAVELENGTHS=[420, 470, 520, 570, 620, 670];
export const SPECTRAL_RAYLEIGH=[0.03986957594829316, 0.02542420293457708, 0.016967794807604773, 0.01175274613937608, 0.008395992078144406, 0.006156580569388669];
export const SPECTRAL_OZONE=[2.9664480000000002e-05, 0.00026461576, 0.0011494985999999999, 0.0025107327999999997, 0.0020098760000000003, 0.0007915902];
export const SPECTRAL_RGB=[[0.04360066780612219, -0.04924526276410404, 0.4299276787069236], [-0.07695561930312646, 0.05412977987353572, 0.6351056964940867], [-0.2774929974914842, 0.5415371627530562, 0.020008037414771983], [0.4164346768288377, 0.460284813312616, -0.06537556284210297], [0.740716850382457, 0.009587386716356339, -0.01819281266437576], [0.1536964217771939, -0.016293879891460233, -0.0014730371093031808]];
export function spectrumToRGB(values){return [0,1,2].map(c=>Math.max(0,values.reduce((s,v,i)=>s+v*SPECTRAL_RGB[i][c],0)));}
export function spectralTransmission(depth){return spectrumToRGB(SPECTRAL_RAYLEIGH.map((r,i)=>Math.exp(-r*depth[0]-.00444*depth[1]-SPECTRAL_OZONE[i]*depth[2])));}
const v=a=>`vec3(${a.map(x=>Number(x).toExponential(10)).join(',')})`;
export const spectralGLSL=`
const vec3 rayA=${v(SPECTRAL_RAYLEIGH.slice(0,3))},rayB=${v(SPECTRAL_RAYLEIGH.slice(3))};
const vec3 ozA=${v(SPECTRAL_OZONE.slice(0,3))},ozB=${v(SPECTRAL_OZONE.slice(3))};
vec3 spectralRGB(vec3 a,vec3 b){return max(vec3(0.),${SPECTRAL_RGB.map((w,i)=>`${v(w)}*${i<3?'a':'b'}.${'xyz'[i%3]}`).join('+')});}
vec3 spectralTransmission(vec3 depth){return spectralRGB(exp(-rayA*depth.r-vec3(.00444)*depth.g-ozA*depth.b),exp(-rayB*depth.r-vec3(.00444)*depth.g-ozB*depth.b));}
`;
