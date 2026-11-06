// Relative radiance units: a unit-reflectance Lambert surface at normal solar
// incidence has radiance 1 in vacuum (L = reflectance * E_sun / pi).
// Atmosphere integrals and multiple-scattering tables use unit irradiance;
// multiply their outgoing radiance by this same E_sun, once.
export const SOLAR_IRRADIANCE = Math.PI;
export const LAMBERT_DIRECT = SOLAR_IRRADIANCE / Math.PI;
export const radiometryGLSL = `const float solarIrradiance=${SOLAR_IRRADIANCE.toPrecision(16)};
const float lambertDirect=${LAMBERT_DIRECT.toFixed(1)};
`;
