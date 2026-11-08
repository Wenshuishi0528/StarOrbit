import * as Astronomy from 'astronomy-engine';
import { AU, cross, dot, norm, sub, unit } from './orbit.js';
import { SOLAR_WORLD_BODIES, solarWorldBodyAxes } from './solar-world-math.js';

export const PLANETARY_MIN_TIME = Date.UTC(1900, 0, 1);
export const PLANETARY_MAX_TIME = Date.UTC(2101, 0, 1) - 1;
export const planetaryObservationRange = Object.freeze({
  minTimeMs: PLANETARY_MIN_TIME,
  maxTimeMs: PLANETARY_MAX_TIME,
});
const DEG = 180 / Math.PI;
const vector = (v) => [v.x, v.y, v.z];
const mul = (v, n) => v.map((x) => x * n);
const add = (a, b) => a.map((x, i) => x + b[i]);
const clamp = (x) => Math.max(-1, Math.min(1, x));
const fixed = (v, axes) => axes.map((a) => dot(a, v));

/** Planetocentric latitude and EAST longitude, degrees; unit body-fixed XYZ. */
export function planetarySurfaceDirection({ longitude, latitude }) {
  if (
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  )
    throw new RangeError(
      'Surface coordinates require east longitude ±180° and planetocentric latitude ±90°.'
    );
  const a = latitude / DEG,
    b = longitude / DEG;
  return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)];
}
export function planetaryCoordinates(v) {
  const r = norm(v);
  if (!(r > 0)) throw new RangeError('A nonzero body-fixed vector is required.');
  return { longitude: Math.atan2(v[1], v[0]) * DEG, latitude: Math.asin(clamp(v[2] / r)) * DEG };
}
/** Raster UV: u=0 at −180°, v=0 at north pole (image row convention, not WebGL texture V). */
export function planetaryMapUV(location) {
  planetarySurfaceDirection(location);
  return [(location.longitude + 180) / 360, (90 - location.latitude) / 180];
}

/**
 * Earth-based planetary observations, UTC Date or epoch ms, 1900–2100.
 * Site latitude is geodetic, longitude east-positive, height metres above mean sea level.
 * Vectors are J2000 equatorial km; Fixed vectors use +X=0°E, +Y=90°E, +Z=north.
 * IAU axes are evaluated at photon departure, using the SAME solarWorldBodyAxes model
 * as the solar-system scene. Topocentric light-time is iterated; physical orientation
 * excludes aberration. Reported RA/Dec and horizon include annual aberration, date
 * precession/nutation; apparent altitude additionally uses standard refraction.
 * Refraction/visibility do not include local terrain or weather. No occultation search.
 * https://github.com/cosinekitty/astronomy/tree/master/source/js
 */
export function planetaryObservation({ body = 'Mars', time, site }) {
  const timeMs = time instanceof Date ? time.getTime() : time;
  if (!Number.isFinite(timeMs) || timeMs < PLANETARY_MIN_TIME || timeMs > PLANETARY_MAX_TIME)
    throw new RangeError('Planetary observations require a UTC date in 1900–2100.');
  const definition = SOLAR_WORLD_BODIES.find(
    (b) => b.id === body && !['Earth', 'Moon'].includes(body)
  );
  if (!definition)
    throw new RangeError('Choose Sun or a planet other than Earth; use lunarObservation for Moon.');
  const { latitude, longitude, height = 0 } = site ?? {};
  if (
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180 ||
    !Number.isFinite(height) ||
    height < -1000 ||
    height > 100000
  )
    throw new RangeError(
      'Earth observer requires latitude ±90°, east longitude ±180°, height −1000…100000 m.'
    );
  const date = new Date(timeMs),
    observer = new Astronomy.Observer(latitude, longitude, height);
  const observerPositionKm = mul(vector(Astronomy.ObserverVector(date, observer, false)), AU);
  const earthHeliocentricKm = mul(vector(Astronomy.HelioVector('Earth', date)), AU);
  const observerHeliocentricKm = add(earthHeliocentricKm, observerPositionKm);
  // Fixed observer at reception epoch; retarded target at emission epoch.
  const backdated = Astronomy.CorrectLightTravel((t) => {
    const p = Astronomy.HelioVector(body, t);
    return new Astronomy.Vector(
      p.x - observerHeliocentricKm[0] / AU,
      p.y - observerHeliocentricKm[1] / AU,
      p.z - observerHeliocentricKm[2] / AU,
      t
    );
  }, Astronomy.MakeTime(date));
  const emissionTimeMs = backdated.t.date.getTime();
  const targetFromObserverKm = mul(vector(backdated), AU);
  const observerFromTargetKm = mul(targetFromObserverKm, -1);
  const targetHeliocentricKm = add(observerHeliocentricKm, targetFromObserverKm);
  const bodyPositionKm = add(targetFromObserverKm, observerPositionKm);
  const sunFromTargetKm = mul(targetHeliocentricKm, -1);
  const axes = solarWorldBodyAxes(body, emissionTimeMs);
  const observerPositionFixedKm = fixed(observerFromTargetKm, axes);
  const sunPositionFixedKm = fixed(sunFromTargetKm, axes);
  const observerDirectionFixed = unit(observerPositionFixedKm);
  const sunDirectionFixed = body === 'Sun' ? [...observerDirectionFixed] : unit(sunPositionFixedKm);
  const sight = unit(targetFromObserverKm);
  const celestialPole = vector(
    Astronomy.RotateVector(Astronomy.Rotation_EQD_EQJ(date), new Astronomy.Vector(0, 0, 1, date))
  );
  const skyEast = unit(cross(celestialPole, sight));
  const skyNorth = unit(cross(sight, skyEast));
  const northUpFixed = unit(fixed(skyNorth, axes));
  const eq = Astronomy.Equator(body, date, observer, true, true);
  const geometric = Astronomy.Horizon(date, observer, eq.ra, eq.dec);
  const apparent = Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal');
  const distanceKm = norm(observerFromTargetKm);
  const cosine = body === 'Sun' ? 1 : clamp(dot(observerDirectionFixed, sunDirectionFixed));
  const subObserver = planetaryCoordinates(observerDirectionFixed);
  const subSolar = body === 'Sun' ? null : planetaryCoordinates(sunDirectionFixed);
  return {
    body,
    timeMs,
    emissionTimeMs,
    lightTimeSeconds: (timeMs - emissionTimeMs) / 1000,
    observer: { latitude, longitude, height },
    radiusKm: definition.radiusKm,
    bodyPositionKm,
    observerPositionKm,
    targetHeliocentricKm,
    axes,
    observerPositionFixedKm,
    sunPositionFixedKm,
    observerDirectionFixed,
    sunDirectionFixed,
    northUpFixed,
    distanceKm,
    earthDistanceKm: norm(bodyPositionKm),
    sunDistanceKm: norm(sunFromTargetKm),
    angularDiameterDeg: 2 * Math.asin(definition.radiusKm / distanceKm) * DEG,
    angularDiameterArcsec: 7200 * Math.asin(definition.radiusKm / distanceKm) * DEG,
    phaseAngleDeg: Math.acos(cosine) * DEG,
    illuminatedFraction: (1 + cosine) / 2,
    rightAscensionHours: eq.ra,
    declinationDeg: eq.dec,
    azimuthDeg: geometric.azimuth,
    geometricAltitudeDeg: geometric.altitude,
    apparentAltitudeDeg: apparent.altitude,
    aboveHorizon: geometric.altitude > 0,
    subObserver,
    subSolar,
    subEarth: planetaryCoordinates(fixed(mul(bodyPositionKm, -1), axes)),
    centralMeridianEastDeg: (subObserver.longitude + 360) % 360,
    centralMeridianWestDeg: (360 - subObserver.longitude) % 360,
    polePositionAngleDeg:
      (Math.atan2(dot(axes[2], skyEast), dot(axes[2], skyNorth)) * DEG + 360) % 360,
  };
}

/** Finite-distance point visibility and solar altitude, spherical surface, no DEM shadows. */
export function planetaryFeatureState(observation, feature) {
  const normalFixed = planetarySurfaceDirection(feature);
  const heightKm = feature.heightKm ?? 0;
  if (!Number.isFinite(heightKm) || observation.radiusKm + heightKm <= 0)
    throw new RangeError('Invalid feature height in km.');
  const pointFixedKm = mul(normalFixed, observation.radiusKm + heightKm);
  const cosEmission = clamp(
    dot(normalFixed, unit(sub(observation.observerPositionFixedKm, pointFixedKm)))
  );
  const cosIncidence =
    observation.body === 'Sun'
      ? 1
      : clamp(dot(normalFixed, unit(sub(observation.sunPositionFixedKm, pointFixedKm))));
  return {
    normalFixed,
    pointFixedKm,
    visible: cosEmission > 0,
    sunlit: cosIncidence > 0,
    cosEmission,
    cosIncidence,
    emissionAngleDeg: Math.acos(cosEmission) * DEG,
    incidenceAngleDeg: Math.acos(cosIncidence) * DEG,
    solarAltitudeDeg: Math.asin(cosIncidence) * DEG,
  };
}
