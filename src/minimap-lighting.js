const RAD = Math.PI / 180,
  TWILIGHT = Math.sin(6 * RAD);
export const NIGHT_WIDTH = 360,
  NIGHT_HEIGHT = 180;

// Ground sunlight: the narrow twilight lies entirely on the night side.
export function nightOpacity(cosine) {
  const x = Math.max(0, Math.min(1, -cosine / TWILIGHT));
  return 0.72 * x * x * (3 - 2 * x);
}

// Fixed display resolution, independent of devicePixelRatio and 3D quality.
// Reuse every buffer; only update when the solar direction visibly changes.
export class MinimapNightRaster {
  constructor() {
    this.pixels = new Uint8ClampedArray(NIGHT_WIDTH * NIGHT_HEIGHT * 4);
    this.longitude = new Float64Array(NIGHT_WIDTH * 2);
    this.latitude = new Float64Array(NIGHT_HEIGHT * 2);
    this.horizontal = new Float64Array(NIGHT_WIDTH);
    for (let x = 0; x < NIGHT_WIDTH; x++) {
      const lon = (((x + 0.5) / NIGHT_WIDTH) * 360 - 180) * RAD;
      this.longitude[x * 2] = Math.cos(lon);
      this.longitude[x * 2 + 1] = Math.sin(lon);
    }
    for (let y = 0; y < NIGHT_HEIGHT; y++) {
      const lat = (90 - ((y + 0.5) / NIGHT_HEIGHT) * 180) * RAD;
      this.latitude[y * 2] = Math.cos(lat);
      this.latitude[y * 2 + 1] = Math.sin(lat);
    }
    for (let i = 0; i < this.pixels.length; i += 4) {
      this.pixels[i] = 2;
      this.pixels[i + 1] = 9;
      this.pixels[i + 2] = 24;
    }
  }
  update(sun) {
    if (this.sun && sun.every((n, i) => Math.abs(n - this.sun[i]) < 1e-4)) return false;
    for (let x = 0; x < NIGHT_WIDTH; x++)
      this.horizontal[x] = this.longitude[x * 2] * sun[0] + this.longitude[x * 2 + 1] * sun[1];
    for (let y = 0; y < NIGHT_HEIGHT; y++) {
      const c = this.latitude[y * 2],
        s = this.latitude[y * 2 + 1] * sun[2];
      for (let x = 0; x < NIGHT_WIDTH; x++)
        this.pixels[(y * NIGHT_WIDTH + x) * 4 + 3] = Math.round(
          255 * nightOpacity(c * this.horizontal[x] + s)
        );
    }
    this.sun = [...sun];
    return true;
  }
}
