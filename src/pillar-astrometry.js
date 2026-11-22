// Field-star fits and verified orientation for the original ESA Zoomify pixels.
// Apply only to the exact calibrated plate revision.
const fields = {
  heic0614a: {
    // This Zoomify pyramid is upside down relative to the published AVM frame.
    // Three independent Pan-STARRS DR2 sources locate the native tiles on sky.
    published: [
      1706, 1706, 1706, 1706, 175.201450944, -26.4856830717, 853, 853,
      6.90973302554452e-6, 6.045233077258017e-7, 6.045233077258017e-7, -6.90973302554452e-6, 70,
    ],
    halfTurn: true,
  },
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
  if (fit.halfTurn) {
    // FITS reference pixels are one-based. Mirror both axes about the image
    // centre, preserving each existing tile and its offline identity.
    corrected[6] = plate[2] + 1 - plate[6];
    corrected[7] = plate[3] + 1 - plate[7];
    for (let i = 8; i < 12; i++) corrected[i] = -plate[i];
    return corrected;
  }
  corrected.splice(4, 2, ...fit.center);
  corrected.splice(8, 4, ...fit.cd);
  return corrected;
}
