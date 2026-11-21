// Gaia DR3 field-star fits to the original ESA Zoomify pixels. See the local
// v1.54 verification record. Apply only to the exact calibrated plate revision.
const fields = {
  heic1501a: {
    published: [
      6780, 7071, 6780.0, 7071.0, 274.719656784, -13.8394365494, 3390.0, 3535.0,
      -9.122078458209271e-6, -6.382603867594115e-6, -6.382603867594115e-6, 9.122078458209271e-6,
      1022,
    ],
    center: [274.71988680846647, -13.840661303728577],
    cd: [-9.100122226128642e-6, -6.370376082872247e-6, -6.376136017597475e-6, 9.102200564769318e-6],
  },
  weic2216b: {
    published: [
      8423, 14589, 8423.0, 14589.0, 274.72992785796, -13.85173905846, 4248.67530921143,
      7301.42638900652, -8.32674e-6, 3.7296e-7, 3.7296e-7, 8.32674e-6, 2566,
    ],
    center: [274.72997029332953, -13.851782132398897],
    cd: [-8.324542999658457e-6, 3.709879371226777e-7, 3.6906426570604326e-7, 8.324299779480011e-6],
  },
};

export function registeredPlate(id, plate) {
  const fit = fields[id];
  if (
    !fit ||
    plate.length !== fit.published.length ||
    !plate.every((value, i) => value === fit.published[i])
  )
    return plate;
  const corrected = [...plate];
  corrected.splice(4, 2, ...fit.center);
  corrected.splice(8, 4, ...fit.cd);
  return corrected;
}
