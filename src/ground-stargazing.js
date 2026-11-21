// An alt-azimuth telescope at the ground observer. Directions of catalogue
// objects are EQJ/J2000. Nearby bodies include the observer's parallax.
import { MakeTime, Observer, Search, SearchAltitude } from 'astronomy-engine';
import { dot, sub, unit } from './orbit.js';
import { getXuntianTarget, searchXuntianTargets } from './xuntian-catalog.js';
import { searchSolarTargets } from './solar-targets.js';
import { createGroundSkySampler, groundCelestialFrame } from './ground-world-sky.js';
import { groundViewDirection, wrapGroundAzimuth } from './ground-world-math.js';
import { stellarAngles } from './balcony-lab-geometry.js';
import { rotateSkyReference } from './sky-reference.js';

const DEG = Math.PI / 180;
const suggestedStars = [
  'HIP 91262',
  'HIP 32349',
  'HIP 69673',
  'HIP 24608',
  'HIP 97649',
  'HIP 24436',
  'HIP 30438',
  'HIP 71683',
  'HIP 60718',
  'HIP 7588',
  'HIP 14576',
  'HIP 11767',
];
const suggestedDeepSky = [
  'M31',
  'M42',
  'M45',
  'M13',
  'M44',
  'M7',
  'NGC5139',
  'NGC104',
  'LMC',
  'SMC',
];
const suggestedBodies = ['Moon', 'Venus', 'Jupiter', 'Saturn', 'Mars'];

export const GROUND_TELESCOPE = Object.freeze({
  apertureMm: 80,
  tubeMm: 600,
  apparentFovDeg: 50,
  eyepiecesMm: Object.freeze([25, 10, 6]),
  finderFovDeg: 60,
});

// Use the same topocentric geometric Sun as the rendered sky. SearchAltitude
// includes annual aberration, which can shift the crossing by a few seconds.
export function nextGroundAstronomicalDusk(site, time) {
  const observer = new Observer(site.latitude, site.longitude, site.height);
  const guess = SearchAltitude('Sun', observer, -1, new Date(time), 3, -18);
  if (!guess) return null;
  const threshold = Math.sin(-18 * DEG);
  const darkness = (t) => {
    const { eye, basis, q } = groundCelestialFrame(site, t.date.getTime());
    return threshold - dot(unit(sub(q.sun, eye)), basis[2]);
  };
  const middle = guess.date.getTime();
  for (const span of [30000, 120000, 600000]) {
    const crossing = Search(
      darkness,
      MakeTime(new Date(Math.max(time, middle - span))),
      MakeTime(new Date(middle + span)),
      { dt_tolerance_seconds: 0.05 }
    );
    if (crossing) return Math.ceil(crossing.date.getTime() / 1000) * 1000 + 100;
  }
  return null;
}

// Optical true field is the usual AFOV / magnification estimate. A measured
// field-stop diameter is needed to determine an individual eyepiece more precisely.
export function groundEyepiece(tubeMm, ocularMm, apparentFovDeg = 50, apertureMm = 80) {
  if (
    ![tubeMm, ocularMm, apparentFovDeg, apertureMm].every((n) => Number.isFinite(n) && n > 0) ||
    apparentFovDeg >= 180
  )
    throw new RangeError('Invalid ground telescope optics');
  const magnification = tubeMm / ocularMm;
  return {
    magnification,
    fov: apparentFovDeg / magnification,
    exitPupilMm: apertureMm / magnification,
  };
}

// The physical field spans the whole diameter of the circular stop, including
// in portrait where that circle occupies only part of the camera's height.
export function groundEyepieceCameraFov(fieldDeg, viewportHeight, circleDiameter) {
  if (
    ![fieldDeg, viewportHeight, circleDiameter].every((n) => Number.isFinite(n) && n > 0) ||
    fieldDeg >= 180
  )
    throw new RangeError('Invalid eyepiece viewport');
  return (2 * Math.atan((Math.tan((fieldDeg * DEG) / 2) * viewportHeight) / circleDiameter)) / DEG;
}

function equatorialReading(direction) {
  const [x, y, z] = direction;
  return {
    raDeg: wrapGroundAzimuth(Math.atan2(y, x) / DEG),
    decDeg: Math.atan2(z, Math.hypot(x, y)) / DEG,
  };
}

function observe(target, sky) {
  if (!target) return null;
  const body = target.type === 'solar' && sky.bodies.find((b) => b.id === target.body);
  const raw = target.type === 'solar' ? body?.direction : target.direction;
  if (raw?.length !== 3 || !raw.every(Number.isFinite)) return null;
  const length = Math.hypot(...raw);
  if (!length) return null;
  const direction = raw.map((v) => v / length);
  const { azimuth, elevation } = stellarAngles(direction, sky.frame.basis);
  return {
    target,
    magnitude: body ? body.mag : target.magnitude,
    direction,
    azimuth,
    elevation,
    aboveHorizon: elevation > 0,
    ...equatorialReading(direction),
  };
}

const solarTarget = (id, lang) => searchSolarTargets(id, lang).find((row) => row.body === id);

// An empty search offers a few objects above the observer's local horizon.
// Star names follow the same culture/language as Xuntian. Typing a name also
// finds objects below the horizon so they can be identified without going to them.
function suggested(sky, language, skyCulture) {
  const current = (targets) =>
    targets
      .filter(Boolean)
      .map((t) => observe(t, sky))
      .filter((r) => r?.aboveHorizon);
  const highestFirst = (a, b) => b.elevation - a.elevation;
  const sun = observe(solarTarget('Sun', language), sky);
  const bodies = current(suggestedBodies.map((id) => solarTarget(id, language)));
  if (sun?.aboveHorizon) return [sun, ...bodies.filter((r) => r.target.body === 'Moon')];
  const objects = (ids) =>
    current(ids.map((id) => getXuntianTarget(id, language, skyCulture))).sort(highestFirst);
  return [
    ...bodies.slice(0, 2),
    ...objects(suggestedStars).slice(0, 3),
    ...objects(suggestedDeepSky).slice(0, 2),
  ];
}

function point(pose, observation) {
  // Preserve the mount's azimuth at the singularity directly overhead.
  if (observation.elevation < 89.9999999) pose.azimuth = observation.azimuth;
  pose.elevation = observation.elevation;
}

export function createGroundStargazing() {
  const sampleAt = createGroundSkySampler();
  let selected = null,
    tracking = false;
  return {
    get target() {
      return selected;
    },
    get tracking() {
      return tracking;
    },
    observe(target, site, time) {
      return observe(target, sampleAt(site, time));
    },
    search(query, site, time, language = 'zh', skyCulture = 'western') {
      const sky = sampleAt(site, time);
      if (!query?.trim()) return suggested(sky, language, skyCulture);
      const solar = searchSolarTargets(query, language).filter((row) => row.body !== 'Earth');
      const catalogue = searchXuntianTargets(query, language, 7, skyCulture);
      return [
        ...solar.filter((row) => row.exact),
        ...catalogue,
        ...solar.filter((row) => !row.exact),
      ]
        .slice(0, 7)
        .map((target) => observe(target, sky))
        .filter(Boolean);
    },
    select(target) {
      selected = target || null;
      tracking = false;
    },
    localize(language, skyCulture = 'western') {
      if (selected) {
        const translated =
          selected.type === 'solar'
            ? solarTarget(selected.body, language)
            : getXuntianTarget(selected.id, language, skyCulture);
        // Gallery crops may use a catalogue ID but point to a distinct part of
        // the object. Changing labels must keep the selected field on the sky.
        if (translated)
          selected = { ...selected, name: translated.name, identifier: translated.identifier };
      }
      return selected;
    },
    aim(site, time, pose, track = false) {
      const observation = observe(selected, sampleAt(site, time));
      tracking = Boolean(track && observation?.aboveHorizon);
      if (!observation?.aboveHorizon) return false;
      point(pose, observation);
      return true;
    },
    manual(pose, azimuth, elevation) {
      if (![azimuth, elevation].every(Number.isFinite) || elevation < 0 || elevation > 90)
        return false;
      tracking = false;
      pose.azimuth = wrapGroundAzimuth(azimuth);
      pose.elevation = elevation;
      return true;
    },
    release() {
      tracking = false;
    },
    update(site, time, pose) {
      const sky = sampleAt(site, time);
      const observation = observe(selected, sky);
      if (tracking) {
        if (observation?.aboveHorizon) point(pose, observation);
        else tracking = false;
      }
      const local = groundViewDirection(pose.azimuth, pose.elevation);
      const direction = rotateSkyReference(sky.frame.basis, local);
      return {
        target: selected,
        observation,
        tracking,
        sky,
        azimuth: pose.azimuth,
        elevation: pose.elevation,
        ...equatorialReading(direction),
      };
    },
  };
}
