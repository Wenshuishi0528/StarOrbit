import { earthAxes, sunPosition, cross, unit, EARTH_RADIUS } from '../../src/orbit.js';
import { createXuntianViewRenderer } from '../../src/xuntian-view-render.js';
const D = Math.PI / 180;
const inertial = (basis, v) => [0, 1, 2].map((i) => basis.reduce((n, a, j) => n + a[i] * v[j], 0));
export function terrainFrame(
  lat,
  lon,
  time,
  { fovY = 8, height = 60, offset = 85, targetHeight = 0 } = {}
) {
  const basis = earthAxes(time),
    radial = [
      Math.cos(lat * D) * Math.cos(lon * D),
      Math.cos(lat * D) * Math.sin(lon * D),
      Math.sin(lat * D),
    ],
    north = [
      -Math.sin(lat * D) * Math.cos(lon * D),
      -Math.sin(lat * D) * Math.sin(lon * D),
      Math.cos(lat * D),
    ];
  const eye = radial.map((v, i) => v * (EARTH_RADIUS + height) + north[i] * offset),
    target = radial.map((v) => v * (EARTH_RADIUS + targetHeight)),
    forward = unit(target.map((v, i) => v - eye[i])),
    right = unit(cross(forward, radial)),
    up = unit(cross(right, forward));
  return {
    q: { t: time, earthAxes: basis, basis, sun: sunPosition(time) },
    eyeKm: inertial(basis, eye),
    eyeLocal: [0, 0, 0],
    axes: {
      forward: inertial(basis, forward),
      right: inertial(basis, right),
      up: inertial(basis, up),
    },
    fovY,
    apertureMm: 315,
    exposure: 1,
    showGalaxy: false,
    showStars: false,
    showStation: false,
    previewNames: false,
    photoNames: false,
    fillLight: false,
    roll: 0,
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function image(blob) {
  const b = await createImageBitmap(blob),
    c = document.createElement('canvas');
  c.width = b.width;
  c.height = b.height;
  const x = c.getContext('2d');
  x.drawImage(b, 0, 0);
  b.close();
  const bytes = x.getImageData(0, 0, c.width, c.height).data;
  let light = 0,
    black = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const l = (bytes[i] + bytes[i + 1] + bytes[i + 2]) / 3;
    light += l;
    if (l < 2) black++;
  }
  return {
    png: c.toDataURL('image/png'),
    mean: light / (bytes.length / 4),
    black: black / (bytes.length / 4),
    width: c.width,
    height: c.height,
  };
}
export async function checkElevation(sim, only = 'rainier') {
  const env = sim.environment;
  env.settings.earthElevation = true;
  env.elevation.setEnabled(true);
  env.settings.clouds = false;
  env.weather.settings.volume = false;
  const canvas = document.createElement('canvas');
  canvas.style.width = '960px';
  canvas.style.height = '600px';
  document.body.append(canvas);
  const render = createXuntianViewRenderer(sim, canvas),
    results = {};
  try {
    for (const [id, lat, lon, time, options] of [
      ['rainier', 46.8523, -121.7603, Date.UTC(2026, 6, 8, 20), { targetHeight: 4.3 }],
      [
        'beijing-hills',
        39.982,
        116.218,
        Date.UTC(2026, 6, 8, 4),
        { fovY: 4, height: 50, offset: 60, targetHeight: 0.3 },
      ],
    ]) {
      if (only !== 'all' && only !== id) continue;
      const frame = terrainFrame(lat, lon, time, options);
      let result,
        start = performance.now();
      while (performance.now() - start < 180000) {
        result = render.render(frame);
        if (result.elevation?.complete && result.elevation?.ready > 0) break;
        if (
          Math.floor((performance.now() - start) / 2000) !==
          Math.floor((performance.now() - start - 100) / 2000)
        )
          console.log(id, JSON.stringify(result.elevation));
        await wait(100);
      }
      if (!result.elevation?.complete || !result.elevation?.ready)
        throw Error(id + ' terrain incomplete ' + JSON.stringify(result.elevation));
      await wait(600);
      result = render.render(frame);
      const on = await image(await render.capture(frame, { width: 1440 }));
      results[id] = { status: result.elevation, center: result.center, on };
      // Paused finders also identify without redrawing. An authoritative miss
      // beside the actual relief must not become a hit on the old sphere.
      const pick = env.elevation.pick;
      try {
        env.elevation.pick = () => null;
        await wait(180);
        if (render.identify(frame).kind === 'earth')
          throw Error('Paused finder replaced an explicit terrain miss with the sphere');
      } finally {
        env.elevation.pick = pick;
      }
      if (id === 'beijing-hills') {
        const forward = unit(frame.eyeKm),
          right = unit(cross([0, 0, 1], forward));
        const skyFrame = {
          ...frame,
          fovY: 45,
          showStars: true,
          previewNames: true,
          axes: { forward, right, up: unit(cross(forward, right)) },
          chartSettings: {
            ...env.settings,
            starLabels: true,
            catalogStarLabels: true,
            constellationNames: true,
            starLabelDensity: 0.75,
          },
        };
        await wait(180);
        const clear = render.render(skyFrame);
        if (!(clear.labels?.total > 0)) throw Error('Sky annotation control has no visible labels');
        const occludes = env.elevation.skyOccluded;
        try {
          env.elevation.skyOccluded = () => true;
          await wait(180);
          const hidden = render.render(skyFrame);
          if (hidden.labels?.total !== 0) throw Error('Finder labels bypass terrain occlusion');
          results[id].terrainLabelOcclusion = {
            clear: clear.labels.total,
            blocked: hidden.labels.total,
          };
        } finally {
          env.elevation.skyOccluded = occludes;
        }
      }
      env.settings.earthElevation = false;
      env.elevation.setEnabled(false);
      await wait(100);
      const off = await image(await render.capture(frame, { width: 1440 }));
      results[id].off = off;
      if (on.black > 0.35 || on.mean < 4)
        throw Error(
          id + ' terrain image black ' + JSON.stringify({ mean: on.mean, black: on.black })
        );
      env.settings.earthElevation = true;
      env.elevation.setEnabled(true);
    }
    return results;
  } finally {
    render.dispose();
    canvas.remove();
    env.settings.earthElevation = false;
    env.elevation.setEnabled(false);
  }
}
